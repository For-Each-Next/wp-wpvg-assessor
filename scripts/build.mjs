/**
 * @file scripts/build.mjs
 * Purpose: Build standalone MediaWiki gadget and userscript artifacts.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. cssText
 * 4. vueTemplate
 * 5. bundleSource
 * 6. Initialization and execution
 * 7. wrapReadableProgram
 * 8. artifactHeader
 * 9. mediaWikiArtifact
 * 10. userscriptArtifact
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { parse } from "@vue/compiler-sfc";
import { build, transform } from "esbuild";
import { minify as minifyHtml } from "html-minifier-terser";
import { minify as minifyJavaScript } from "terser";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const outputDir = join(root, "dist");
const resources = {
    __VG_PAGE_ASSESSOR_DIALOG_TEMPLATE__:
        "src/features/assessment/dialogs/assessment-dialog.vue",
    __VG_PAGE_ASSESSOR_DIALOG_STYLES__:
        "src/features/assessment/dialogs/assessment-dialog.css",
    __VG_PAGE_ASSESSOR_LOADING_DIALOG_TEMPLATE__:
        "src/features/assessment/dialogs/loading-dialog.vue",
    __VG_PAGE_ASSESSOR_LOADING_DIALOG_STYLES__:
        "src/features/assessment/dialogs/loading-dialog.css",
    __VG_PAGE_ASSESSOR_WIKITEXT_COMPARISON_TEMPLATE__:
        "src/features/assessment/components/wikitext-comparison.vue",
    __VG_PAGE_ASSESSOR_WIKITEXT_COMPARISON_STYLES__:
        "src/features/assessment/components/wikitext-comparison.css",
    __VG_PAGE_ASSESSOR_CATEGORY_DIALOG_TEMPLATE__:
        "src/features/assessment/dialogs/category-dialog.vue",
    __VG_PAGE_ASSESSOR_CATEGORY_DIALOG_STYLES__:
        "src/features/assessment/dialogs/category-dialog.css",
};

async function cssText(relativePath, compact) {
    const source = await readFile(join(root, relativePath), "utf8");
    if (!compact) {
        return source;
    }
    const result = await transform(source, { loader: "css", minify: true });
    return result.code.trim();
}

async function vueTemplate(relativePath, compact) {
    const filename = join(root, relativePath);
    const source = await readFile(filename, "utf8");
    const result = parse(source, { filename });
    const { descriptor } = result;
    if (
        result.errors.length > 0 ||
        descriptor.template == null ||
        descriptor.script != null ||
        descriptor.scriptSetup != null ||
        descriptor.styles.length > 0 ||
        descriptor.customBlocks.length > 0
    ) {
        throw new Error(`${relativePath} must contain one template only.`);
    }
    const template = descriptor.template.content.trim();
    return compact
        ? minifyHtml(template, {
              caseSensitive: true,
              collapseInlineTagWhitespace: true,
              collapseWhitespace: true,
              customAttrCollapse: /.*/u,
              keepClosingSlash: true,
          })
        : template;
}

async function bundleSource(compact) {
    const definitions = await Promise.all(
        Object.entries(resources).map(async ([constant, path]) => {
            const contents = path.endsWith(".vue")
                ? await vueTemplate(path, compact)
                : await cssText(path, compact);
            return [constant, JSON.stringify(contents)];
        }),
    );
    const bundle = await build({
        absWorkingDir: root,
        bundle: true,
        define: Object.fromEntries(definitions),
        entryPoints: ["src/app/browser.ts"],
        format: "iife",
        logLevel: "silent",
        metafile: true,
        target: "es2024",
        write: false,
    });
    const dependencies = Object.keys(bundle.metafile.inputs).filter((input) =>
        input.includes("node_modules/"),
    );
    if (dependencies.length > 0) {
        throw new Error(
            `Browser dependencies must be supplied by MediaWiki ResourceLoader: ${dependencies.join(", ")}`,
        );
    }
    const code = bundle.outputFiles?.[0]?.text;
    if (code == null) {
        throw new Error("esbuild did not return the browser bundle.");
    }
    return code;
}

const [readableCode, compactCode] = await Promise.all([
    bundleSource(false),
    bundleSource(true),
]);
const minified = await minifyJavaScript(compactCode, {
    ecma: 2024,
    compress: { ecma: 2024, passes: 2 },
    format: { comments: false, ecma: 2024 },
    mangle: true,
});
if (minified.code == null) {
    throw new Error("Terser did not return minified JavaScript.");
}
const artifacts = new Map([
    ["wpvg_assessor.min.js", mediaWikiArtifact(minified.code)],
    [
        "wpvg_assessor.user.js",
        userscriptArtifact(wrapReadableProgram(readableCode)),
    ],
]);

// Parse both complete deliverables before replacing the previous build.
for (const [filename, source] of artifacts) {
    new Script(source, { filename });
}
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await Promise.all(
    Array.from(artifacts, ([filename, source]) =>
        writeFile(join(outputDir, filename), source),
    ),
);
for (const [filename, source] of artifacts) {
    console.log(`Built dist/${filename} (${Buffer.byteLength(source)} bytes)`);
}

function wrapReadableProgram(source) {
    const indented = source
        .trim()
        .replace(/^"use strict";\s*/u, "")
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
    return [
        "(async function () {",
        '    "use strict";',
        "    let mw = window.mw;",
        "    for (let attempt = 0; attempt < 200; attempt += 1) {",
        '        if (typeof mw?.config?.get === "function" &&',
        '            typeof mw?.loader?.using === "function") {',
        "            break;",
        "        }",
        "        await new Promise((resolve) => window.setTimeout(resolve, 50));",
        "        mw = window.mw;",
        "    }",
        '    if (typeof mw?.config?.get !== "function" ||',
        '        typeof mw?.loader?.using !== "function") {',
        "        return;",
        "    }",
        indented,
        "})();",
    ].join("\n");
}

function artifactHeader() {
    return [
        "/**",
        " * WPVG Assessor",
        " *",
        ` * Purpose: ${manifest.description}`,
        " *",
        ` * @name ${manifest.name}`,
        ` * @version ${manifest.version}`,
        ` * @license ${manifest.license}`,
        " *",
        " * Table of contents:",
        " * 1. Metadata and license notices",
        " * 2. MediaWiki bootstrap and browser program",
        " */",
    ].join("\n");
}

function mediaWikiArtifact(program) {
    return [
        artifactHeader(),
        "",
        "//<nowiki>",
        program,
        "//</nowiki>",
        "",
    ].join("\n");
}

function userscriptArtifact(program) {
    return [
        "// ==UserScript==",
        "// @name         WikiProject Video games Assessor",
        "// @namespace    wpvg-assessor",
        `// @version      ${manifest.version}`,
        `// @description  ${manifest.description}`,
        `// @license      ${manifest.license}`,
        "// @match        https://zh.wikipedia.org/*",
        "// @homepageURL  https://github.com/For-Each-Next/wp-wpvg-assessor",
        "// @downloadURL  https://github.com/For-Each-Next/wp-wpvg-assessor/releases/latest/download/wpvg_assessor.user.js",
        "// @updateURL    https://github.com/For-Each-Next/wp-wpvg-assessor/releases/latest/download/wpvg_assessor.user.js",
        "// @grant        none",
        "// @run-at       document-end",
        "// ==/UserScript==",
        "",
        artifactHeader(),
        "",
        program,
        "",
    ].join("\n");
}
