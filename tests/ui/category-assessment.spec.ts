/**
 * @file tests/ui/category-assessment.spec.ts
 * Purpose: tests / ui / category assessment.spec module.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. Test scenarios
 * 4. reviewSource
 * 5. queueSnapshot
 * 6. previewedTitles
 * 7. expectOnlyCategoryReads
 */

import {
    expect,
    getPosts,
    navigateAssessor,
    openCategoryAssessor,
    test,
} from "./fixtures.ts";
import type { Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const articlePreview = (page: Page) =>
    page.frameLocator('iframe[title="Article preview"]');
const batchButton = (page: Page, name: string) =>
    page.getByRole("button", { name, exact: true }).last();
const talkSummary = (page: Page) =>
    page.getByRole("textbox", {
        name: "Talk-page edit summary",
        exact: true,
    });

test("category loading failure offers neutral cancellation and one primary retry", async ({
    page,
}) => {
    const dialog = await openCategoryAssessor(page, { articleError: true });
    const footer = dialog.locator(".cdx-dialog__footer");
    await expect(footer.getByRole("button")).toHaveText(["Cancel", "Retry"]);
    await expect(
        footer.getByRole("button", { name: "Cancel", exact: true }),
    ).toHaveClass(/\bcdx-button--action-default\b/u);
    const retry = footer.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toHaveClass(/\bcdx-button--action-progressive\b/u);
    await expect(retry).toHaveClass(/\bcdx-button--weight-primary\b/u);
    await retry.click();
    await expect(retry).toBeEnabled();
    await footer.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await getPosts(page)).toEqual([]);
});

async function reviewSource(page: Page): Promise<string> {
    const details = page.locator(".avgp-category-review");
    if (!(await details.evaluate((element) => element.hasAttribute("open")))) {
        await details.locator("summary").click();
    }
    const source = details.locator("pre");
    await expect(source).toBeVisible();
    return (await source.textContent())!;
}

async function queueSnapshot(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() =>
        Object.fromEntries(
            Object.entries(localStorage).filter(([key]) =>
                key.startsWith("wpvg-assessor.assessment-queue."),
            ),
        ),
    );
}

async function previewedTitles(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        (globalThis as any).__fixture.calls
            .filter((call: any) => call.action === "parse")
            .map((call: any) => call.page)
            .sort(),
    );
}

async function expectOnlyCategoryReads(page: Page): Promise<void> {
    const calls = await page.evaluate(
        () => (globalThis as any).__fixture.calls,
    );
    expect(
        calls.filter((call: any) =>
            String(call.titles).includes("WikiProject:电子游戏/新进条目"),
        ),
    ).toEqual([]);
    expect(calls.filter((call: any) => call.rvdir === "newer")).toEqual([]);
    expect(
        calls.filter((call: any) =>
            String(call.prop).split("|").includes("info"),
        ),
    ).toEqual([]);
}

test("the unassessed category opens the batch article preview and preloads exactly three pages ahead", async ({
    page,
}) => {
    const members = [
        "Talk:First game",
        "Talk:Second game",
        "Talk:Third game",
        "Talk:Fourth game",
        "Talk:Fifth game",
        "Talk:Sixth game",
    ];
    const dialog = await openCategoryAssessor(page, {
        categoryMembers: members,
        categoryPageSize: 2,
    });
    await expect(dialog).toBeVisible();
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "First game",
            exact: true,
        }),
    ).toBeVisible();
    await expect
        .poll(() => previewedTitles(page))
        .toEqual(
            ["First game", "Second game", "Third game", "Fourth game"].sort(),
        );
    const calls = await page.evaluate(
        () => (globalThis as any).__fixture.calls,
    );
    const categoryCalls = calls.filter(
        (call: any) => call.list === "categorymembers",
    );
    expect(categoryCalls).toHaveLength(2);
    expect(categoryCalls[0]).toMatchObject({
        cmtitle: "Category:未评级电子游戏条目",
        cmnamespace: "0|1",
    });
    for (const title of members.slice(0, 4)) {
        expect(
            calls.some(
                (call: any) =>
                    call.prop === "revisions" &&
                    String(call.titles).split("|").includes(title),
            ),
        ).toBe(true);
    }
    const classes = [
        "Stub",
        "Start",
        "D",
        "C",
        "B",
        "SL",
        "List",
        "CL",
        "BL",
        "Unassessed",
    ];
    await expect(dialog.locator(".cdx-button-group")).toHaveCount(3);
    await expect(
        dialog.locator(".cdx-button-group").getByRole("button"),
    ).toHaveText([...classes, "Skip"]);
    for (const name of classes) {
        await expect(
            dialog.getByRole("button", { name, exact: true }),
        ).toBeVisible();
    }
    expect(await getPosts(page)).toEqual([]);
    await batchButton(page, "Skip").click();
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "Second game",
            exact: true,
        }),
    ).toBeVisible();
    await expect
        .poll(() => previewedTitles(page))
        .toEqual(
            [
                "First game",
                "Second game",
                "Third game",
                "Fourth game",
                "Fifth game",
            ].sort(),
        );
    expect(
        await page.evaluate(() =>
            (globalThis as any).__fixture.calls.filter(
                (call: any) => call.list === "categorymembers",
            ),
        ),
    ).toHaveLength(3);
    expect(await getPosts(page)).toEqual([]);
    await expectOnlyCategoryReads(page);
});

test("ordinary pages and other categories keep the ordinary assessor link", async ({
    page,
}) => {
    await page.goto("/tests/ui/index.html");
    await expect(
        page.getByRole("button", { name: "VG Page Assessor", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", {
            name: "Batch assess articles",
            exact: true,
        }),
    ).toHaveCount(0);
    await page.goto("/tests/ui/index.html?page=Category:Other%20category");
    await expect(
        page.getByRole("button", { name: "VG Page Assessor", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", {
            name: "Batch assess articles",
            exact: true,
        }),
    ).toHaveCount(0);
});

test("category preview and background assessment ignore an unavailable registration page", async ({
    page,
}) => {
    await openCategoryAssessor(page, {
        unavailableRegistrationList: true,
        categoryMembers: ["Talk:First game", "Talk:Second game"],
    });
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "First game",
            exact: true,
        }),
    ).toBeVisible();
    await batchButton(page, "B").click();
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "Second game",
            exact: true,
        }),
    ).toBeVisible();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    expect((await getPosts(page))[0].title).toBe("Talk:First game");
    await expectOnlyCategoryReads(page);
});

test("a class action preserves existing flags and saves the exact selected-grade source immediately", async ({
    page,
}) => {
    await openCategoryAssessor(page, {
        categoryMembers: ["Talk:First game", "Talk:Second game"],
        holdTalk: true,
        lead: [
            "{{Talk header}}",
            "{{WikiProject banner shell|class=Start|1=",
            "{{WikiProject Video games|importance=High|Sega=yes|needs-infobox=yes}}",
            "{{WikiProject Role-playing games|custom=keep}}",
            "}}",
        ].join("\n"),
    });
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "First game",
            exact: true,
        }),
    ).toBeVisible();
    const queueBefore = await queueSnapshot(page);
    const originalFirst = await reviewSource(page);
    await talkSummary(page).fill("Reviewed first category cleanup");
    expect(await getPosts(page)).toEqual([]);
    await batchButton(page, "B").click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    const reviewedFirst = originalFirst.replace("class=Start", "class=B");
    expect(reviewedFirst).toContain("class=B");
    expect(reviewedFirst).toContain("importance=High");
    expect(reviewedFirst).toContain("Sega=yes");
    expect(reviewedFirst).toContain("needs-infobox=yes");
    expect(reviewedFirst).toContain(
        "{{WikiProject Role-playing games|custom=keep}}",
    );
    expect(await getPosts(page)).toHaveLength(1);
    expect((await getPosts(page))[0]).toMatchObject({
        title: "Talk:First game",
        summary: "Reviewed first category cleanup",
        text: `${reviewedFirst}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    });
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "Second game",
            exact: true,
        }),
    ).toBeVisible();
    const originalSecond = await reviewSource(page);
    await talkSummary(page).fill("Reviewed second category cleanup");
    expect(await getPosts(page)).toHaveLength(1);
    await batchButton(page, "C").click();
    await expect.poll(() => getPosts(page)).toHaveLength(2);
    const posts = await getPosts(page);
    expect(posts.map((post) => post.title)).toEqual([
        "Talk:First game",
        "Talk:Second game",
    ]);
    expect(posts[1]).toMatchObject({
        summary: "Reviewed second category cleanup",
        text: `${originalSecond.replace("class=Start", "class=C")}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    });
    await expect(page.locator('iframe[title="Article preview"]')).toHaveCount(
        0,
    );
    await expect(page.locator(".cdx-button-group")).toHaveCount(0);
    expect(await queueSnapshot(page)).toEqual(queueBefore);
    await expect(
        page.getByText(
            "Finishing 2 background saves. Failed articles will be shown again.",
            { exact: true },
        ),
    ).toBeVisible();
    await page.evaluate(() => {
        (globalThis as any).__fixture.releaseTalk();
    });
    await expect(
        page.getByText("You reached the end of this category.", {
            exact: true,
        }),
    ).toBeVisible();
    await expect(batchButton(page, "Cancel")).toBeEnabled();
    await expectOnlyCategoryReads(page);
});

test("Skip advances without writing or queueing the selected assessment", async ({
    page,
}) => {
    await openCategoryAssessor(page);
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "First game",
            exact: true,
        }),
    ).toBeVisible();
    await batchButton(page, "Skip").click();
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "Second game",
            exact: true,
        }),
    ).toBeVisible();
    await batchButton(page, "Cancel").click();
    await navigateAssessor(page, "First game");
    await expect(batchButton(page, "Stage")).toBeEnabled();
    await expect(batchButton(page, "Submit")).toBeEnabled();
    expect(await getPosts(page)).toEqual([]);
});

test("a failed background assessment reappears later with its selected grade and exact review", async ({
    page,
}) => {
    await openCategoryAssessor(page, {
        failTalk: true,
        categoryMembers: ["Talk:First game", "Talk:Second game"],
    });
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "First game",
            exact: true,
        }),
    ).toBeVisible();
    const rating = batchButton(page, "B");
    await reviewSource(page);
    await talkSummary(page).fill("Retained category retry summary");
    await rating.click();
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "Second game",
            exact: true,
        }),
    ).toBeVisible();
    expect(await getPosts(page)).toHaveLength(1);
    await batchButton(page, "Skip").click();
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "First game",
            exact: true,
        }),
    ).toBeVisible();
    await expect(page.locator(".avgp-category-status")).toContainText(
        "Talk page temporarily unavailable",
    );
    const reviewed = await reviewSource(page);
    expect(reviewed).toContain("class=B");
    await expect(page.locator(".avgp-category-review pre")).toHaveText(
        reviewed,
    );
    await expect(talkSummary(page)).toHaveValue(
        "Retained category retry summary",
    );
    await expect(rating).toBeEnabled();
    expect(await getPosts(page)).toHaveLength(1);
    await page.evaluate(() => {
        (globalThis as any).__fixture.failTalk = false;
    });
    await rating.click();
    await expect(page.locator('iframe[title="Article preview"]')).toHaveCount(
        0,
    );
    await expect.poll(() => getPosts(page)).toHaveLength(2);
    const posts = await getPosts(page);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
        title: "Talk:First game",
        summary: "Retained category retry summary",
        text: `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    });
    expect(posts[1]).toEqual(posts[0]);
});

test("a background save lets the reader continue while the current write is pending", async ({
    page,
}) => {
    const dialog = await openCategoryAssessor(page, {
        holdTalk: true,
        categoryMembers: ["Talk:First game", "Talk:Second game"],
    });
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "First game",
            exact: true,
        }),
    ).toBeVisible();
    const rating = batchButton(page, "B");
    const original = await reviewSource(page);
    await talkSummary(page).fill("Held confirmed category save");
    await rating.click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    const reviewed = original.replace("class=Start", "class=B");
    expect(reviewed).toContain("class=B");
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "Second game",
            exact: true,
        }),
    ).toBeVisible();
    await expect(rating).toBeEnabled();
    await expect(batchButton(page, "Cancel")).toBeEnabled();
    await expect(batchButton(page, "Skip")).toBeEnabled();
    await expect(
        dialog.locator(".avgp-category-status .cdx-progress-bar"),
    ).toHaveCount(0);
    for (const action of await dialog
        .locator(".cdx-button-group")
        .getByRole("button")
        .all()) {
        await expect(action).toBeEnabled();
    }
    await expect(dialog).toBeVisible();
    expect((await getPosts(page))[0]).toMatchObject({
        title: "Talk:First game",
        summary: "Held confirmed category save",
        text: `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    });
    await batchButton(page, "Skip").click();
    await expect(page.locator('iframe[title="Article preview"]')).toHaveCount(
        0,
    );
    await expect(dialog).toBeVisible();
    await expect(batchButton(page, "Cancel")).toBeEnabled();
    expect(await getPosts(page)).toHaveLength(1);
    await expect(
        page.getByText(
            "Finishing 1 background saves. Failed articles will be shown again.",
            { exact: true },
        ),
    ).toBeVisible();
    await page.evaluate(() => {
        (globalThis as any).__fixture.releaseTalk();
    });
    await expect(
        page.getByText("You reached the end of this category.", {
            exact: true,
        }),
    ).toBeVisible();
    await expect(batchButton(page, "Cancel")).toBeEnabled();
    expect(await getPosts(page)).toHaveLength(1);
});

test("closing while a background assessment saves releases the reader without losing the accepted write", async ({
    page,
}) => {
    await openCategoryAssessor(page, { holdTalk: true });
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "First game",
            exact: true,
        }),
    ).toBeVisible();
    await batchButton(page, "B").click();
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "Second game",
            exact: true,
        }),
    ).toBeVisible();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    const submitted = (await getPosts(page))[0];
    await batchButton(page, "Cancel").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.evaluate(() => {
        (globalThis as any).__fixture.releaseTalk();
    });
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    (globalThis as any).__fixture.talkPages["Talk:First game"],
            ),
        )
        .toBe(submitted.text);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await getPosts(page)).toHaveLength(1);
});

test("skipping the last article reaches an inactive end without making writes", async ({
    page,
}) => {
    const dialog = await openCategoryAssessor(page, {
        categoryMembers: ["Talk:First game"],
    });
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "First game",
            exact: true,
        }),
    ).toBeVisible();
    await batchButton(page, "Skip").click();
    await expect(page.locator('iframe[title="Article preview"]')).toHaveCount(
        0,
    );
    await expect(dialog.locator(".cdx-button-group")).toHaveCount(0);
    await expect(batchButton(page, "Cancel")).toBeEnabled();
    await expect(dialog).toBeVisible();
    expect(await getPosts(page)).toEqual([]);
});

test("article HTML runs in a script-free sandbox while proposed talk source renders as text", async ({
    page,
}) => {
    await page.addInitScript(() => {
        (globalThis as any).__articleScriptExecuted = false;
        (globalThis as any).__talkMarkupExecuted = false;
    });
    const rawTalkMarkup =
        '<img src="data:," onerror="globalThis.__talkMarkupExecuted=true">';
    await openCategoryAssessor(page, {
        categoryMembers: ["Talk:First game"],
        articleHtml: {
            "First game": [
                "<script>globalThis.__frameScriptExecuted=true; parent.__articleScriptExecuted=true;</script>",
                "<h1>Safe article preview</h1>",
                "<p>The preview remains readable.</p>",
            ].join(""),
        },
        lead: `{{WikiProject Video games|importance=Low}}\n${rawTalkMarkup}`,
    });
    await expect(
        articlePreview(page).getByRole("heading", {
            name: "Safe article preview",
            exact: true,
        }),
    ).toBeVisible();
    const iframe = page.locator('iframe[title="Article preview"]');
    await expect(iframe).toHaveAttribute("sandbox", "");
    await expect(iframe).toHaveAttribute(
        "srcdoc",
        /Content-Security-Policy.*default-src 'none'/u,
    );
    const frame = await (await iframe.elementHandle())!.contentFrame();
    expect(
        await frame!.evaluate(() => (globalThis as any).__frameScriptExecuted),
    ).toBeUndefined();
    await page
        .locator("summary")
        .filter({ hasText: "Review proposed talk-page lead" })
        .click();
    const source = page.locator(".avgp-category-review pre");
    await expect(source).toBeVisible();
    await expect(source).toContainText(rawTalkMarkup);
    await expect(source.locator("img")).toHaveCount(0);
    expect(
        await page.evaluate(() => ({
            article: (globalThis as any).__articleScriptExecuted,
            talk: (globalThis as any).__talkMarkupExecuted,
        })),
    ).toEqual({ article: false, talk: false });
    expect(await getPosts(page)).toEqual([]);
});

test("article previews preserve host infobox CSS and embedded TemplateStyles", async ({
    page,
}) => {
    await openCategoryAssessor(page, {
        categoryMembers: ["Talk:First game"],
        articleCss: [
            ".mw-parser-output { padding-top: 13px; }",
            ".mw-parser-output .infobox { background-color: #dff0c2; border: 3px solid #123456; }",
            ".mw-parser-output .infobox td { padding: 11px; color: #345678; }",
        ].join("\n"),
        articleHtml: {
            "First game": [
                '<!-- Parsed article content --><div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr">',
                '<style data-mw-deduplicate="TemplateStyles:r1">.mw-parser-output .template-styled { background-color: #ddeeff; border-left: 7px solid #765432; }</style>',
                "<h1>Styled article preview</h1>",
                '<table class="infobox"><tbody><tr><td>Styled infobox cell</td></tr></tbody></table>',
                '<p class="template-styled">Embedded template styling</p>',
                "</div>",
            ].join(""),
        },
    });
    const frame = articlePreview(page);
    const content = frame.locator(".mw-parser-output");
    await expect(content).toHaveCount(1);
    await expect(content).toHaveAttribute("lang", "en");
    await expect(content).toHaveAttribute("dir", "ltr");
    await expect(content).toHaveCSS("padding-top", "13px");
    const infobox = frame.locator(".mw-parser-output .infobox");
    await expect(infobox).toBeVisible();
    await expect(infobox).toHaveCSS("background-color", "rgb(223, 240, 194)");
    await expect(infobox).toHaveCSS("border-top-width", "3px");
    await expect(infobox).toHaveCSS("border-top-color", "rgb(18, 52, 86)");
    await expect(infobox.locator("td")).toHaveCSS("padding-top", "11px");
    await expect(infobox.locator("td")).toHaveCSS("color", "rgb(52, 86, 120)");
    const template = frame.locator(".template-styled");
    await expect(template).toHaveCSS("background-color", "rgb(221, 238, 255)");
    await expect(template).toHaveCSS("border-left-width", "7px");
    await expect(template).toHaveCSS("border-left-color", "rgb(118, 84, 50)");
    expect(await getPosts(page)).toEqual([]);
    await expectOnlyCategoryReads(page);
});

for (const hold of ["holdLoad", "holdArticle"] as const) {
    test(`cancel during ${hold} releases the dialog and ignores the late response`, async ({
        page,
    }) => {
        const batchDialog = await openCategoryAssessor(page, { [hold]: true });
        const dialog =
            hold === "holdLoad"
                ? page.getByRole("dialog", {
                      name: "VG Page Assessor",
                      exact: true,
                  })
                : batchDialog;
        await expect(dialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await page.evaluate((hold) => {
            const fixture = (globalThis as any).__fixture;
            if (hold === "holdLoad") fixture.releaseLoad();
            else fixture.releaseArticle();
        }, hold);
        await page
            .getByRole("button", { name: "Batch assess articles", exact: true })
            .click();
        await expect(
            articlePreview(page).getByRole("heading", {
                name: "First game",
                exact: true,
            }),
        ).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(1);
        expect(await getPosts(page)).toEqual([]);
    });
}

test("an empty unassessed category leaves no enabled save action", async ({
    page,
}) => {
    const dialog = await openCategoryAssessor(page, { categoryMembers: [] });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".cdx-button-group")).toHaveCount(0);
    expect(await getPosts(page)).toEqual([]);
    await batchButton(page, "Cancel").click();
    await expect(dialog).toHaveCount(0);
});

for (const width of [360, 1440]) {
    test(`the ${width}px batch preview and class controls fit in the viewport`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        const dialog = await openCategoryAssessor(page);
        await expect(
            articlePreview(page).getByRole("heading", {
                name: "First game",
                exact: true,
            }),
        ).toBeVisible();
        const dimensions = await dialog.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const iframe = element.querySelector("iframe")!;
            const preview = iframe.getBoundingClientRect();
            const body =
                element.querySelector<HTMLElement>(".cdx-dialog__body")!;
            return {
                left: bounds.left,
                right: bounds.right,
                top: bounds.top,
                bottom: bounds.bottom,
                previewWidth: preview.width,
                previewHeight: preview.height,
                viewportWidth: innerWidth,
                viewportHeight: innerHeight,
                bodyWidth: body.clientWidth,
                bodyScrollWidth: body.scrollWidth,
            };
        });
        expect(dimensions.left).toBeGreaterThanOrEqual(-1);
        expect(dimensions.right).toBeLessThanOrEqual(width + 1);
        expect(dimensions.top).toBeGreaterThanOrEqual(-1);
        expect(dimensions.bottom).toBeLessThanOrEqual(901);
        expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(
            dimensions.bodyWidth + 1,
        );
        expect(dimensions.previewWidth).toBeGreaterThan(width * 0.75);
        expect(dimensions.previewHeight).toBeGreaterThan(
            width === 360 ? dimensions.viewportHeight * 0.4 : 400,
        );
        const groups = dialog.locator(".cdx-button-group");
        await expect(groups).toHaveCount(3);
        for (const [index, labels] of [
            [0, ["Stub", "Start", "D", "C", "B"]],
            [1, ["SL", "List", "CL", "BL"]],
            [2, ["Unassessed", "Skip"]],
        ] as const) {
            const group = groups.nth(index);
            await expect(group.getByRole("button")).toHaveText([...labels]);
            await expect(group).toBeInViewport({ ratio: 1 });
            const tops = await group
                .getByRole("button")
                .evaluateAll((buttons) =>
                    buttons.map((button) => button.getBoundingClientRect().top),
                );
            expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
            for (const button of await group.getByRole("button").all()) {
                await expect(button).toBeInViewport({ ratio: 1 });
            }
        }
        await expect(batchButton(page, "Cancel")).toBeInViewport({ ratio: 1 });
        await expect(dialog.locator(".avgp-category-separator")).toHaveCount(0);
        const footer = dialog.locator(".cdx-dialog__footer");
        await expect(footer.getByRole("button")).toHaveText(["Cancel"]);
        await expect(batchButton(page, "Cancel")).toHaveClass(
            /\bcdx-button--action-default\b/u,
        );
        await expect(batchButton(page, "Cancel")).toHaveClass(
            /\bcdx-button--weight-quiet\b/u,
        );
        await batchButton(page, "Stub").focus();
        await page.keyboard.press("ArrowRight");
        await expect(batchButton(page, "Start")).toBeFocused();
        await page.keyboard.press("ArrowLeft");
        await expect(batchButton(page, "Stub")).toBeFocused();
        const screenshotDirectory = process.env.WPVG_SCREENSHOT_DIR;
        if (screenshotDirectory) {
            await mkdir(screenshotDirectory, { recursive: true });
            await page.screenshot({
                path: `${screenshotDirectory}/category-assessment-${width}.png`,
                animations: "disabled",
            });
        }
        expect(await getPosts(page)).toEqual([]);
    });
}
