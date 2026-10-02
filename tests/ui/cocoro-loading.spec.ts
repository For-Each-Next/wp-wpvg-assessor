/**
 * @file tests/ui/cocoro-loading.spec.ts
 * Purpose: tests / ui / cocoro loading.spec module.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. Test scenarios
 */

import {
    chooseOption,
    expect,
    getPosts,
    openAssessor,
    test,
} from "./fixtures.ts";

const missingFile = "File:阴阳师 (游戏).JPG";
const lead = [
    "{{DYKtalk|date=2026-09-27}}",
    "{{WikiProject banner shell|class=Unassessed|1=",
    "{{WikiProject Video games|importance=Low}}",
    "}}",
].join("\n");
const listText = [
    "== 2026年 ==",
    `* 8月29日 - {{vgc|COCORO (遊戲)}}、{{vgc|COCORO}}、{{vgc|${missingFile}}}`,
    "* 8月28日 - 無新條目",
    "",
].join("\n");

test("Talk:COCORO loads its Unassessed/Low banner despite a missing registered list peer and cancels without writes", async ({
    page,
}) => {
    const dialog = await openAssessor(page, {
        creationDates: { COCORO: "2026-08-29T12:00:00Z" },
        lead,
        listText,
        missingTitles: [missingFile],
        pageTitle: "Talk:COCORO",
    });
    await expect(
        page.getByRole("combobox", { name: "Shared class", exact: true }),
    ).toHaveValue("Unassessed");
    await expect(
        page.getByRole("combobox", { name: "Importance", exact: true }),
    ).toContainText("Low");
    await expect(
        page.getByRole("textbox", {
            name: "Ready-to-save lead-section source",
            exact: true,
        }),
    ).toHaveValue(/\{\{DYKtalk\|date=2026-09-27\}\}/u);
    await expect(
        page.getByRole("checkbox", { name: /^Register the page/u }),
    ).toHaveCount(0);
    const titles = await page.evaluate(() =>
        (globalThis as any).__fixture.calls.flatMap((call: any) =>
            String(call.titles ?? "").split("|"),
        ),
    );
    expect(titles).toContain("Talk:COCORO");
    expect(titles).not.toContain("Talk:Talk:COCORO");
    expect(titles).not.toContain(missingFile);
    expect(await getPosts(page)).toEqual([]);
    await dialog
        .locator(".cdx-dialog__footer")
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
    await expect(dialog).toHaveCount(0);
    expect(await getPosts(page)).toEqual([]);
    expect(
        await page.evaluate(() => (globalThis as any).__fixture.listText),
    ).toBe(listText);
});

test("an unregistered COCORO review retains a missing peer entry and saves only the reviewed list and talk source", async ({
    page,
}) => {
    const unregisteredList = listText.replace("、{{vgc|COCORO}}", "");
    await openAssessor(page, {
        creationDates: {
            COCORO: "2026-08-29T12:00:00Z",
            "COCORO (遊戲)": "2026-08-29T01:00:00Z",
        },
        lead,
        listText: unregisteredList,
        missingTitles: [missingFile],
        pageTitle: "Talk:COCORO",
    });
    await expect(
        page.getByRole("checkbox", { name: /^Register the page/u }),
    ).toBeChecked();
    const listReview = page.getByRole("region", {
        name: "New-page list changes",
        exact: true,
    });
    await expect(listReview).toContainText(`{{vgc|${missingFile}}}`);
    await expect(listReview).toContainText("{{vgc|COCORO}}");
    expect(await getPosts(page)).toEqual([]);
    await chooseOption(page, "Shared class", "Start");
    const reviewed = await page
        .getByRole("textbox", {
            name: "Ready-to-save lead-section source",
            exact: true,
        })
        .inputValue();
    expect(reviewed).toContain("{{DYKtalk|date=2026-09-27}}");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect.poll(() => getPosts(page)).toHaveLength(2);
    const posts = await getPosts(page);
    expect(posts.map((post) => post.title)).toEqual([
        "WikiProject:电子游戏/新进条目",
        "Talk:COCORO",
    ]);
    expect(posts[0].text).toContain(
        `{{vgc|COCORO (遊戲)}}、{{vgc|COCORO}}、{{vgc|${missingFile}}}`,
    );
    expect(posts[0].text).toContain("* 8月28日 - 無新條目");
    expect(posts[1].text).toBe(
        `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    );
});
