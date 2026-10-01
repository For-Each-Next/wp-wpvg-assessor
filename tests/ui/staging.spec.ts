import {
    chooseOption,
    expect,
    getPosts,
    navigateAssessor,
    openAssessor,
    test,
} from "./fixtures.ts";
import type { Page } from "@playwright/test";

const readySource = (page: Page) =>
    page.getByRole("textbox", {
        name: "Ready-to-save lead-section source",
        exact: true,
    });
const talkSummary = (page: Page) =>
    page.getByRole("textbox", {
        name: "Talk-page edit summary",
        exact: true,
    });
const listSummary = (page: Page) =>
    page.getByRole("textbox", {
        name: "New-page list edit summary",
        exact: true,
    });
const registration = (page: Page) =>
    page.getByRole("checkbox", { name: /^Register the page/ });
const submit = (page: Page, others = 0) =>
    page.getByRole("button", {
        name: others === 0 ? "Submit" : `Submit (+${others})`,
        exact: true,
    });
const stage = (page: Page) =>
    page.getByRole("button", { name: "Stage", exact: true });
const unstage = (page: Page) =>
    page.getByRole("button", { name: "Unstage", exact: true });
const assessorLink = (page: Page) =>
    page.getByRole("link", { name: "VG Page Assessor", exact: true });

test("Stage keeps the form open and retains manual review across reopening and navigation without duplicate queued pages or reads", async ({
    page,
}) => {
    await openAssessor(page);
    const reviewed =
        "  {{WikiProject banner shell|class=B|1=\n{{WikiProject Video games|importance=High}}\n}}\n<!-- retained manual source -->\n\n";
    await readySource(page).fill(reviewed);
    await talkSummary(page).fill("My staged talk summary");
    await listSummary(page).fill("My staged list summary");
    await registration(page).uncheck();
    const readCount = await page.evaluate(
        () => (globalThis as any).__fixture.calls.length,
    );
    await stage(page).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(unstage(page)).toBeVisible();
    await expect(readySource(page)).toHaveValue(reviewed);
    await expect(talkSummary(page)).toHaveValue("My staged talk summary");
    await expect(registration(page)).not.toBeChecked();
    expect(await getPosts(page)).toEqual([]);
    await page
        .getByRole("dialog")
        .locator(".cdx-dialog__footer")
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await getPosts(page)).toEqual([]);

    await assessorLink(page).click();
    await expect(readySource(page)).toHaveValue(reviewed);
    await expect(talkSummary(page)).toHaveValue("My staged talk summary");
    await expect(registration(page)).not.toBeChecked();
    await expect(submit(page)).toBeVisible();
    await registration(page).check();
    await expect(listSummary(page)).toHaveValue("My staged list summary");
    await registration(page).uncheck();
    await readySource(page).fill(`${reviewed}<!-- replaced staged draft -->`);
    await expect(unstage(page)).toBeVisible();
    await unstage(page).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(stage(page)).toBeVisible();
    await expect(readySource(page)).toHaveValue(
        `${reviewed}<!-- replaced staged draft -->`,
    );
    await expect(talkSummary(page)).toHaveValue("My staged talk summary");
    await expect(registration(page)).not.toBeChecked();
    await registration(page).check();
    await expect(listSummary(page)).toHaveValue("My staged list summary");
    await registration(page).uncheck();
    expect(await getPosts(page)).toEqual([]);
    await stage(page).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(unstage(page)).toBeVisible();
    await expect(readySource(page)).toHaveValue(
        `${reviewed}<!-- replaced staged draft -->`,
    );
    expect(
        await page.evaluate(() => (globalThis as any).__fixture.calls.length),
    ).toBe(readCount);

    await navigateAssessor(page, "Second game");
    await expect(submit(page, 1)).toBeVisible();
    const listReads = await page.evaluate(
        () =>
            (globalThis as any).__fixture.calls.filter((call: any) =>
                String(call.titles).includes("电子游戏/新进条目"),
            ).length,
    );
    expect(listReads).toBe(1);
    await submit(page, 1).click();
    await expect(
        page.getByRole("heading", {
            name: "Other staged talk-page changes",
            exact: true,
        }),
    ).toBeVisible();
    expect(await getPosts(page)).toEqual([]);
    await page
        .getByRole("button", { name: "Cancel", exact: true })
        .last()
        .click();
    await navigateAssessor(page, "Example game");
    await expect(readySource(page)).toHaveValue(
        `${reviewed}<!-- replaced staged draft -->`,
    );
    await expect(talkSummary(page)).toHaveValue("My staged talk summary");
    await expect(registration(page)).not.toBeChecked();
    await expect(submit(page)).toBeVisible();
    await expect(unstage(page)).toBeVisible();
    expect(await getPosts(page)).toEqual([]);
});

test("Unstage removes only the current draft, keeps its open edits, and updates later batch review", async ({
    page,
}) => {
    await openAssessor(page, { pageTitle: "First game" });
    const firstReviewed = `${await readySource(page).inputValue()}\n<!-- first manually staged source -->\n`;
    await readySource(page).fill(firstReviewed);
    await talkSummary(page).fill("First manual staged summary");
    await stage(page).click();
    await navigateAssessor(page, "Second game");
    await chooseOption(page, "Shared class", "B");
    const secondReviewed = `${await readySource(page).inputValue()}\n<!-- second retained staged source -->\n`;
    await readySource(page).fill(secondReviewed);
    await stage(page).click();

    const dialog = await navigateAssessor(page, "First game");
    const footer = dialog.locator(".cdx-dialog__footer");
    await expect(footer.getByRole("button")).toHaveText([
        "Cancel",
        "Unstage",
        "Submit (+1)",
    ]);
    await expect(unstage(page)).toHaveClass(/\bcdx-button--action-default\b/u);
    await expect(unstage(page)).toHaveClass(/\bcdx-button--weight-normal\b/u);
    await submit(page, 1).click();
    await expect(
        page.getByRole("heading", {
            name: "Other staged talk-page changes",
            exact: true,
        }),
    ).toBeVisible();
    await unstage(page).click();
    await expect(dialog).toBeVisible();
    await expect(stage(page)).toBeVisible();
    await expect(submit(page, 1)).toBeVisible();
    await expect(readySource(page)).toHaveValue(firstReviewed);
    await expect(talkSummary(page)).toHaveValue("First manual staged summary");
    await expect(
        page.getByRole("heading", {
            name: "Other staged talk-page changes",
            exact: true,
        }),
    ).toHaveCount(0);
    expect(await getPosts(page)).toEqual([]);

    await navigateAssessor(page, "Third game");
    await expect(submit(page, 1)).toBeVisible();
    await submit(page, 1).click();
    await expect(
        page.getByRole("heading", { name: "Second game", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { name: "First game", exact: true }),
    ).toHaveCount(0);
    await expect(
        page
            .locator("pre")
            .filter({ hasText: "second retained staged source" }),
    ).toHaveText(secondReviewed);
    await expect(
        page.getByRole("region", {
            name: "New-page list changes",
            exact: true,
        }),
    ).not.toContainText("First game");
    const readCount = await page.evaluate(
        () => (globalThis as any).__fixture.calls.length,
    );
    await navigateAssessor(page, "First game");
    await expect(stage(page)).toBeVisible();
    await expect(submit(page, 1)).toBeVisible();
    await expect(readySource(page)).not.toHaveValue(
        /first manually staged source/u,
    );
    expect(
        await page.evaluate(() => (globalThis as any).__fixture.calls.length),
    ).toBe(readCount);
    expect(await getPosts(page)).toEqual([]);
});

test("Submit (+1) reviews the fresh combined list and then makes one list edit before the exact two talk edits", async ({
    page,
}) => {
    await openAssessor(page, {
        creationDates: {
            "Concurrent game": "2026-09-30T15:00:00Z",
            "Second game": "2026-09-30T18:00:00Z",
        },
    });
    const firstReviewed =
        "  {{WikiProject banner shell|class=B|1=\n{{WikiProject Video games|importance=High}}\n}}\n<!-- first manual lead -->\n\n";
    await readySource(page).fill(firstReviewed);
    await talkSummary(page).fill("Reviewed first talk");
    await listSummary(page).fill("Reviewed first registration");
    await stage(page).click();
    await navigateAssessor(page, "Second game");
    await chooseOption(page, "Shared class", "B");
    const secondReviewed = `${await readySource(page).inputValue()}\n<!-- second manual lead -->\n\n`;
    await readySource(page).fill(secondReviewed);
    await talkSummary(page).fill("Reviewed second talk");
    await listSummary(page).fill("Reviewed second registration");
    await page.evaluate(() => {
        const fixture = (globalThis as any).__fixture;
        fixture.listText = fixture.listText.replace(
            "{{vgc|Earlier game}}",
            "{{vgc|Earlier game}}、{{vgc|Concurrent game}}",
        );
        fixture.base = "2026-10-01T00:45:00Z";
    });
    await submit(page, 1).click();
    await expect(
        page.getByText(
            "Review the combined changes below, then choose Submit again.",
            { exact: true },
        ),
    ).toBeVisible();
    expect(await getPosts(page)).toEqual([]);
    const combinedReview = page.getByRole("region", {
        name: "New-page list changes",
        exact: true,
    });
    await expect(combinedReview).toContainText("Concurrent game");
    await expect(combinedReview).toContainText("Example game");
    await expect(combinedReview).toContainText("Second game");
    await expect(
        page.getByRole("heading", { name: "Example game", exact: true }),
    ).toBeVisible();
    await expect(
        page.locator("pre").filter({ hasText: "first manual lead" }),
    ).toHaveText(firstReviewed);
    await expect(
        page.getByText("Reviewed first talk", { exact: true }),
    ).toBeVisible();
    await listSummary(page).fill("Reviewed combined registration");
    await submit(page, 1).click();
    await expect.poll(() => getPosts(page)).toHaveLength(3);
    const posts = await getPosts(page);
    expect(posts.map((post) => post.title)).toEqual([
        "WikiProject:电子游戏/新进条目",
        "Talk:Example game",
        "Talk:Second game",
    ]);
    expect(posts[0]).toMatchObject({
        summary: "Reviewed combined registration",
        basetimestamp: "2026-10-01T00:45:00Z",
    });
    expect(posts[0].text).toContain(
        "{{vgc|Earlier game}}、{{vgc|Example game}}、{{vgc|Concurrent game}}、{{vgc|Second game}}",
    );
    expect(posts[1]).toMatchObject({
        summary: "Reviewed first talk",
        text: `${firstReviewed}== Discussion ==\nKeep this discussion exactly.\n`,
    });
    expect(posts[2]).toMatchObject({
        summary: "Reviewed second talk",
        text: `${secondReviewed}== Discussion ==\nKeep this discussion exactly.\n`,
    });
    await navigateAssessor(page, "Third game");
    await expect(submit(page)).toBeVisible();
});

test("the primary Submit counter includes all three other staged pages", async ({
    page,
}) => {
    await openAssessor(page, { pageTitle: "First game" });
    await stage(page).click();
    await navigateAssessor(page, "Second game");
    await stage(page).click();
    await navigateAssessor(page, "Third game");
    await stage(page).click();
    await navigateAssessor(page, "Fourth game");
    await expect(submit(page, 3)).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    expect(await getPosts(page)).toEqual([]);
});

test("a combined registration conflict makes one failed list attempt and preserves every reviewed draft", async ({
    page,
}) => {
    await openAssessor(page);
    await chooseOption(page, "Shared class", "B");
    const firstReviewed = await readySource(page).inputValue();
    await stage(page).click();
    await navigateAssessor(page, "Second game");
    await chooseOption(page, "Shared class", "B");
    const secondReviewed = await readySource(page).inputValue();
    await submit(page, 1).click();
    await page.evaluate(() => {
        (globalThis as any).__fixture.listConflict = true;
    });
    await submit(page, 1).click();
    await expect(submit(page, 1)).toBeEnabled();
    await expect(readySource(page)).toHaveValue(secondReviewed);
    expect((await getPosts(page)).map((post) => post.title)).toEqual([
        "WikiProject:电子游戏/新进条目",
    ]);
    await page
        .getByRole("button", { name: "Cancel", exact: true })
        .last()
        .click();
    await navigateAssessor(page, "Example game");
    await expect(readySource(page)).toHaveValue(firstReviewed);
    await expect(submit(page, 1)).toBeVisible();
});

test("a partial batch save retries only its unfinished talk page after the confirmed registration", async ({
    page,
}) => {
    await openAssessor(page);
    await chooseOption(page, "Shared class", "B");
    await stage(page).click();
    await navigateAssessor(page, "Second game");
    await chooseOption(page, "Shared class", "B");
    const reviewed = await readySource(page).inputValue();
    await submit(page, 1).click();
    await page.evaluate(() => {
        (globalThis as any).__fixture.failTalkTitle = "Talk:Second game";
    });
    await submit(page, 1).click();
    await expect(
        page.getByText(/Talk page temporarily unavailable/u),
    ).toBeVisible();
    await expect(submit(page)).toBeEnabled();
    expect((await getPosts(page)).map((post) => post.title)).toEqual([
        "WikiProject:电子游戏/新进条目",
        "Talk:Example game",
        "Talk:Second game",
    ]);
    await expect(registration(page)).not.toBeChecked();
    await page.evaluate(() => {
        (globalThis as any).__fixture.failTalkTitle = null;
    });
    await submit(page).click();
    expect(await getPosts(page)).toHaveLength(3);
    await submit(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(4);
    const posts = await getPosts(page);
    expect(
        posts.filter((post) => post.title === "WikiProject:电子游戏/新进条目"),
    ).toHaveLength(1);
    expect(posts.at(-1)).toMatchObject({
        title: "Talk:Second game",
        text: `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    });
});
