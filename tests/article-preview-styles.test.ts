/** Host stylesheet serialization keeps article previews styled and isolated. */

import assert from "node:assert/strict";
import test from "node:test";

import { getArticlePreviewStyles } from "../src/platform/browser/article-preview-styles.ts";

test("copies same-origin ResourceLoader links and inline CSS in cascade order", () => {
    const source = createDocument([
        element("LINK", {
            rel: "stylesheet",
            href: "/w/load.php?modules=mediawiki.skinning.content&only=styles",
            onload: "runScript()",
        }),
        element(
            "STYLE",
            { "data-mw-deduplicate": "ResourceLoader" },
            ".mw-parser-output .infobox{border:3px solid #123456}",
        ),
        element("LINK", {
            rel: "STYLESHEET",
            href: "//zh.wikipedia.org/w/load.php?modules=site.styles",
            media: "print",
        }),
    ]);

    assert.deepEqual(getArticlePreviewStyles(source), {
        origin: "https://zh.wikipedia.org",
        styles: [
            '<link rel="stylesheet" href="https://zh.wikipedia.org/w/load.php?modules=mediawiki.skinning.content&amp;only=styles">',
            "<style>.mw-parser-output .infobox{border:3px solid #123456}</style>",
            '<link rel="stylesheet" href="https://zh.wikipedia.org/w/load.php?modules=site.styles" media="print">',
        ].join("\n"),
    });
});

test("rejects foreign origins, non-HTTP URLs, disabled styles and non-stylesheet links", () => {
    const source = createDocument([
        element("LINK", {
            rel: "stylesheet",
            href: "https://other.test/a.css",
        }),
        element("LINK", {
            rel: "stylesheet",
            href: "http://zh.wikipedia.org/a.css",
        }),
        element("LINK", { rel: "stylesheet", href: "javascript:runScript()" }),
        element("LINK", { rel: "stylesheet", href: "data:text/css,body{}" }),
        element("LINK", { rel: "stylesheet", href: "https://[invalid" }),
        element("LINK", { rel: "stylesheet", href: "" }),
        element("LINK", { rel: "preload", href: "/preloaded.css" }),
        element("LINK", {
            rel: "stylesheet",
            href: "/disabled.css",
            disabled: "",
        }),
        element(
            "LINK",
            { rel: "stylesheet", href: "/property-disabled.css" },
            "",
            true,
        ),
    ]);

    assert.equal(getArticlePreviewStyles(source).styles, "");
});

test("escapes stylesheet attributes and closing style text without copying handlers", () => {
    const source = createDocument([
        element(
            "STYLE",
            { media: 'screen" onload="runScript()', onload: "runScript()" },
            '.example::after{content:"</StYLe><script>runScript()</script>"}',
        ),
    ]);

    assert.equal(
        getArticlePreviewStyles(source).styles,
        '<style media="screen&quot; onload=&quot;runScript()">.example::after{content:"\\3c /StYLe><script>runScript()</script>"}</style>',
    );
});

function createDocument(elements: Element[]): Document {
    return {
        URL: "https://zh.wikipedia.org/wiki/Category:Example",
        baseURI: "https://zh.wikipedia.org/wiki/Category:Example",
        querySelectorAll(selector: string) {
            assert.equal(selector, "link, style");
            return elements;
        },
    } as unknown as Document;
}

function element(
    tagName: string,
    attributes: Record<string, string>,
    textContent = "",
    disabled = false,
): Element {
    return {
        tagName,
        textContent,
        disabled,
        getAttribute: (name: string) => attributes[name] ?? null,
        hasAttribute: (name: string) => Object.hasOwn(attributes, name),
    } as unknown as Element;
}
