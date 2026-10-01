/** Validate a release tag and extract its reviewed changelog entry. */
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
);
const tag = process.argv[2];
const stableVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
if (!stableVersion.test(manifest.version) || tag !== `v${manifest.version}`) {
    throw new Error(
        `Release tag ${tag} must match package version v${manifest.version}.`,
    );
}

const changelog = await readFile(new URL("CHANGELOG.md", root), "utf8");
const sections = changelog.split(/^## /mu).slice(1);
const section = sections.find((entry) => {
    const heading = entry.split("\n", 1)[0];
    return (
        heading === manifest.version ||
        heading.startsWith(`${manifest.version} - `) ||
        heading === `[${manifest.version}]` ||
        heading.startsWith(`[${manifest.version}] - `)
    );
});
const notes = section?.split("\n").slice(1).join("\n").trim();
if (!notes) {
    throw new Error(
        `CHANGELOG.md must contain release notes for ${manifest.version}.`,
    );
}
console.log(notes);
