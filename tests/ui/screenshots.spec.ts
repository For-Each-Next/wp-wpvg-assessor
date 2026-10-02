/**
 * @file tests/ui/screenshots.spec.ts
 * Purpose: Reproducible product documentation images from an entirely offline host.
 *
 * Table of contents:
 * 1. Imports
 * 2. Test scenarios
 * 3. Constants and state
 */

import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    chooseOption,
    expect,
    getPosts,
    openAssessor,
    openCategoryAssessor,
    test,
} from "./fixtures.ts";

test.use({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
test.skip(
    process.env.DOCUMENTATION_SCREENSHOTS !== "1",
    "Run npm run screenshots to update documentation images.",
);

const directory = resolve("docs/images");
const article = JSON.parse(
    await readFile(
        new URL("../fixtures/bang-dream.source.json", import.meta.url),
        "utf8",
    ),
);
const articleSource = await readFile(
    new URL("../fixtures/bang-dream.wikitext", import.meta.url),
    "utf8",
);
const openingParagraph = articleSource
    .split("\n")
    .find((line) => line.startsWith("《'''BanG Dream!"))!;
let paragraph = openingParagraph;
while (/\{\{[^{}]*\}\}/u.test(paragraph))
    paragraph = paragraph.replace(/\{\{[^{}]*\}\}/gu, "");
paragraph = paragraph
    .replace(
        /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/gu,
        (_match, title, label) => label ?? title,
    )
    .replaceAll("'''", "")
    .replace(/（\s*）/gu, "");
const escapeHtml = (text: string) =>
    text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
const articleHtml =
    "<h1>" +
    escapeHtml(article.title) +
    "</h1><p>" +
    escapeHtml(paragraph) +
    '</p><h2>條目原始碼節錄</h2><pre style="white-space:pre-wrap">' +
    escapeHtml(articleSource.split("\n").slice(8, 24).join("\n")) +
    "</pre>";
// These banners demonstrate the review workflow; they are not the live talk page.
const lead = [
    "{{WikiProject banner shell|class=C|vital=yes|",
    "{{WikiProject Video games|importance=High|Nintendo=yes|Nintendo-importance=Mid|b1=no|b2=no|b3=no|b4=no|b5=yes|b6=yes}}",
    "{{ACG專題|importance=high}}",
    "{{WikiProject Japan|importance=mid}}",
    "}}",
].join("\n");

test("documentation: assessment controls and reviewed source at 1024px", async ({
    page,
}) => {
    await mkdir(directory, { recursive: true });
    const dialog = await openAssessor(page, {
        expired: true,
        lead,
        pageTitle: article.title,
    });
    await chooseOption(page, "Shared class", "B");
    await expect(dialog).toBeVisible();
    await dialog.locator(".cdx-dialog__body").evaluate((element) => {
        element.scrollTop = 0;
    });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
        path: resolve(directory, "screenshot-01.png"),
        animations: "disabled",
    });
    await dialog.locator(".avgp-source").evaluate((element) => {
        element.scrollIntoView({ block: "start" });
    });
    await page.screenshot({
        path: resolve(directory, "screenshot-02.png"),
        animations: "disabled",
    });
    expect(await getPosts(page)).toEqual([]);
});

test("documentation: category assessment at 1024px", async ({ page }) => {
    await mkdir(directory, { recursive: true });
    const dialog = await openCategoryAssessor(page, {
        categoryMembers: [article.title],
        articleHtml: { [article.title]: articleHtml },
        lead,
    });
    await expect(dialog.locator("iframe")).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Stub", exact: true }),
    ).toBeVisible();
    await expect(
        page
            .frameLocator("iframe")
            .getByRole("heading", { name: "條目原始碼節錄", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
        path: resolve(directory, "screenshot-03.png"),
        animations: "disabled",
    });
    expect(await getPosts(page)).toEqual([]);
});
