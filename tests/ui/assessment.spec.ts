import {
    chooseOption,
    expect,
    getPosts,
    openAssessor,
    test,
} from "./fixtures.ts";
import { mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";

const readySource = (page: Page) =>
    page.getByRole("textbox", {
        name: "Ready-to-save lead-section source",
        exact: true,
    });
const registration = (page: Page) =>
    page.getByRole("checkbox", { name: /^Register the page/ });
const save = (page: Page) =>
    page.getByRole("button", { name: "Submit", exact: true });

test("the Pokemon-series assessment preserves shell metadata and merged project details through review and save", async ({
    page,
}) => {
    const sample = [
        "{{WikiProject banner shell|class=C|vital=yes|",
        "{{WikiProject Video games |importance=High |Pokemon=yes |NINTENDO=y |NINTENDO-importance= |b1=no |b2=no |b3=no |b4=no |b5=yes |b6=yes}}",
        "{{ACG專題 |importance=high}}",
        "{{WikiProject Japan |importance=mid}}",
        "}}",
        "{{WikiProject Biography|importance=Low|living=yes|custom={{Nested|x=y}}}}",
    ].join("\n");
    await openAssessor(page, {
        expired: true,
        lead: sample,
        pageTitle: "宝可梦系列",
    });
    await expect(
        page.getByRole("combobox", { name: "Shared class", exact: true }),
    ).toHaveValue("C");
    await expect(
        page.getByRole("combobox", { name: "Importance", exact: true }),
    ).toContainText("High");
    for (const name of ["Pokemon", "Nintendo", "ACG", "Japan", "Biography"]) {
        await expect(
            page.getByRole("checkbox", { name, exact: true }),
        ).toBeChecked();
    }
    await expect(registration(page)).toHaveCount(0);
    await expect(readySource(page)).toHaveValue(/vital=yes/u);
    await expect(readySource(page)).toHaveValue(/Pokemon=yes/u);
    await expect(readySource(page)).toHaveValue(/NINTENDO=y\b/u);
    await expect(readySource(page)).not.toHaveValue(
        /\|\s*(?:NINTENDO-importance|b[1-6])\s*=/iu,
    );
    await expect(readySource(page)).toHaveValue(
        /\{\{ACG專題\s*\|importance=high\s*\}\}/u,
    );
    await expect(readySource(page)).toHaveValue(
        /\{\{WikiProject Japan\s*\|importance=mid\s*\}\}/u,
    );
    await expect(readySource(page)).toHaveValue(
        /\{\{WikiProject Biography\|importance=Low\|living=yes\|custom=\{\{Nested\|x=y\}\}\}\}/u,
    );

    await chooseOption(page, "Shared class", "B");
    await expect(readySource(page)).toHaveValue(/class=B/u);
    await expect(readySource(page)).toHaveValue(/vital=yes/u);
    await expect(readySource(page)).toHaveValue(/Pokemon=yes/u);
    await expect(readySource(page)).toHaveValue(/NINTENDO=y\b/u);
    const reviewed = await readySource(page).inputValue();
    expect(reviewed).not.toMatch(/\|\s*(?:NINTENDO-importance|b[1-6])\s*=/iu);
    expect(reviewed).toMatch(
        /^\{\{WikiProject banner shell\|[\s\S]*\|1=[\s\S]*\{\{WikiProject Biography\|[\s\S]*\n\}\}\s*$/u,
    );
    expect(reviewed).toContain("living=yes|custom={{Nested|x=y}}");
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    expect((await getPosts(page))[0].title).toBe("Talk:宝可梦系列");
    expect((await getPosts(page))[0].text).toBe(
        `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    );
});

test("an out-of-scope choice retains shared class and other projects on a narrow screen", async ({
    page,
}) => {
    await page.setViewportSize({ width: 360, height: 900 });
    const dialog = await openAssessor(page);
    await expect(dialog).toHaveAccessibleName(
        "VG Page Assessor (Example game)",
    );
    await expect(page.locator(".avgp-page-context")).toHaveCount(0);
    await expect(dialog.locator(".cdx-label__optional-flag")).toHaveCount(0);
    await expect(registration(page)).toBeChecked();
    await chooseOption(page, "Importance", "Out of scope");
    await expect(
        page.getByRole("combobox", { name: "Importance", exact: true }),
    ).toContainText("Out of scope");
    for (const name of ["Sega", "Pokemon", "Reassess", "Needs infobox"]) {
        await expect(
            page.getByRole("checkbox", { name, exact: true }),
        ).toBeDisabled();
    }
    await expect(registration(page)).toHaveCount(0);
    await expect(
        page.getByText(
            "No Video games banner; new-page registration is unavailable.",
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        page.getByRole("textbox", {
            name: "New-page list edit summary",
            exact: true,
        }),
    ).toBeHidden();
    await chooseOption(page, "Shared class", "B");
    const acg = page.getByRole("checkbox", { name: "ACG", exact: true });
    await expect(acg).toBeEnabled();
    await acg.check();
    await expect(readySource(page)).toHaveValue(/class=B/u);
    await expect(readySource(page)).toHaveValue(/ACG專題/u);
    await expect(readySource(page)).toHaveValue(/Role-playing games/u);
    await expect(readySource(page)).not.toHaveValue(/WikiProject Video games/u);
    await expect(readySource(page)).not.toHaveValue(/NotVG/u);
    await expect(
        page.getByRole("textbox", {
            name: "Talk-page edit summary",
            exact: true,
        }),
    ).toHaveValue(
        /Update shared assessment \(B-Class\): ACG, Role-playing games; remove Video games banner/u,
    );
    const dimensions = await dialog.evaluate((element) => {
        const body = element.querySelector<HTMLElement>(".cdx-dialog__body")!;
        return {
            bodyWidth: body.clientWidth,
            bodyScrollWidth: body.scrollWidth,
        };
    });
    const controlBounds = await page
        .getByRole("combobox", { name: "Importance", exact: true })
        .evaluate((element) => {
            const control = element.getBoundingClientRect();
            return {
                left: control.left,
                right: control.right,
                width: control.width,
                viewportWidth: innerWidth,
            };
        });
    expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(
        dimensions.bodyWidth + 1,
    );
    expect(controlBounds.width).toBeGreaterThan(0);
    expect(controlBounds.left).toBeGreaterThanOrEqual(-1);
    expect(controlBounds.right).toBeLessThanOrEqual(
        controlBounds.viewportWidth + 1,
    );
    if (process.env.WPVG_SCREENSHOT_DIR) {
        await mkdir(process.env.WPVG_SCREENSHOT_DIR, { recursive: true });
        await page
            .getByRole("combobox", { name: "Importance", exact: true })
            .scrollIntoViewIfNeeded();
        await page.screenshot({
            path: `${process.env.WPVG_SCREENSHOT_DIR}/assessment-non-video-game-360.png`,
            animations: "disabled",
        });
    }
    const reviewed = await readySource(page).inputValue();
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    expect((await getPosts(page))[0].title).toBe("Talk:Example game");
    expect((await getPosts(page))[0].text).toBe(
        `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    );
});

test("a shell without Video games starts outside the project and keeps other-project assessment usable", async ({
    page,
}) => {
    await openAssessor(page, {
        lead: "{{WPBS|class=C|1={{ACG專題|custom=keep}}}}",
    });
    await expect(
        page.getByRole("combobox", { name: "Importance", exact: true }),
    ).toContainText("Out of scope");
    await expect(registration(page)).toHaveCount(0);
    await expect(
        page.getByRole("checkbox", { name: "Pokemon", exact: true }),
    ).toBeDisabled();
    await expect(
        page.getByRole("checkbox", { name: "ACG", exact: true }),
    ).toBeChecked();
    await chooseOption(page, "Shared class", "B");
    await page.getByRole("checkbox", { name: "Films", exact: true }).check();
    await expect(readySource(page)).toHaveValue(/class=B/u);
    await expect(readySource(page)).toHaveValue(/custom=keep/u);
    await expect(readySource(page)).toHaveValue(/WikiProject Film/u);
    await expect(readySource(page)).not.toHaveValue(/WikiProject Video games/u);
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    expect((await getPosts(page))[0].title).toBe("Talk:Example game");
});

test("manual removal of Video games synchronizes scope and re-enabling it keeps registration unselected", async ({
    page,
}) => {
    await openAssessor(page);
    const manual = "{{WPBS|class=C|1={{ACG專題}}}}\n<!-- Manual assessment -->";
    await readySource(page).fill(manual);
    await expect(readySource(page)).toHaveValue(manual);
    await expect(
        page.getByRole("combobox", { name: "Importance", exact: true }),
    ).toContainText("Out of scope");
    await expect(
        page.getByRole("combobox", { name: "Shared class", exact: true }),
    ).toHaveValue("C");
    await expect(registration(page)).toHaveCount(0);
    await expect(
        page.getByRole("checkbox", { name: "Needs screenshot", exact: true }),
    ).toBeDisabled();
    await chooseOption(page, "Importance", "High");
    await expect(registration(page)).not.toBeChecked();
    await expect(
        page.getByRole("checkbox", { name: "Needs screenshot", exact: true }),
    ).toBeEnabled();
    await expect(readySource(page)).toHaveValue(/importance=High/u);
    await expect(readySource(page)).toHaveValue(/Manual assessment/u);
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    expect((await getPosts(page))[0].title).toBe("Talk:Example game");
});

test("Shared class is an editable Codex combobox with hidden and custom classes", async ({
    page,
}) => {
    await openAssessor(page);
    await registration(page).uncheck();
    const sharedClass = page.getByRole("combobox", {
        name: "Shared class",
        exact: true,
    });
    await expect(sharedClass).toHaveValue("Start");
    await expect(sharedClass).toHaveAttribute("type", "text");
    await sharedClass.click();
    for (const hidden of ["A", "FL", "B+"]) {
        await expect(
            page.getByRole("option", { name: hidden, exact: true }),
        ).toHaveCount(0);
    }
    for (const code of ["A", "FL", "Bplus", "Future-class"]) {
        await sharedClass.fill(code);
        const canonical = code === "Bplus" ? "B+" : code;
        await expect(readySource(page)).toHaveValue(
            new RegExp(
                `class=${canonical.replace("+", "\\+")}(?:\\||\\})`,
                "u",
            ),
        );
        await sharedClass.press("Tab");
        await expect(sharedClass).toHaveValue(canonical);
        await sharedClass.click();
        await expect(
            page.getByRole("option", { name: canonical, exact: true }),
        ).toHaveCount(0);
        await readySource(page).click();
    }
    await sharedClass.fill("Bplus");
    await expect(sharedClass).toHaveValue("Bplus");
    await expect(readySource(page)).toHaveValue(/class=B\+/u);
    const reviewed = await readySource(page).inputValue();
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    expect((await getPosts(page))[0].text).toBe(
        `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    );
});

test("Chinese shared class displays typed Bplus and b+ as 乙上 and accepts localized class labels", async ({
    page,
}) => {
    await page.addInitScript(() => {
        (globalThis as any).__fixtureOptions = { locale: "zh-CN" };
    });
    await page.goto("/tests/ui/index.html");
    await page.locator("#t-assess-vg-page").click();
    const sharedClass = page.getByRole("combobox", {
        name: "通用评级",
        exact: true,
    });
    const source = page.getByRole("textbox", {
        name: "待保存的导言源码",
        exact: true,
    });
    await expect(sharedClass).toHaveValue("初");
    await sharedClass.click();
    for (const hidden of ["甲", "特表", "乙上", "丁"]) {
        await expect(
            page.getByRole("option", { name: hidden, exact: true }),
        ).toHaveCount(0);
    }
    await source.click();
    await sharedClass.fill("");
    await sharedClass.pressSequentially("Bplus");
    await expect(sharedClass).toHaveValue("Bplus");
    await expect(source).toHaveValue(/class=B\+/u);
    await sharedClass.press("Tab");
    await expect(sharedClass).toHaveValue("乙上");
    await sharedClass.click();
    await expect(
        page.getByRole("option", { name: "乙上", exact: true }),
    ).toHaveCount(0);
    await source.click();
    await sharedClass.fill("b+");
    await sharedClass.press("Tab");
    await expect(sharedClass).toHaveValue("乙上");
    await sharedClass.fill("甲");
    await sharedClass.press("Tab");
    await expect(sharedClass).toHaveValue("甲");
    await expect(source).toHaveValue(/class=A/u);
    await sharedClass.fill("D");
    await sharedClass.press("Tab");
    await expect(sharedClass).toHaveValue("丁");
    await expect(source).toHaveValue(/class=D/u);
    await sharedClass.click();
    await expect(
        page.getByRole("option", { name: "丁", exact: true }),
    ).toHaveCount(0);
    await source.click();
    await chooseOption(page, "通用评级", "乙");
    await expect(sharedClass).toHaveValue("乙");
    await expect(source).toHaveValue(/class=B\|/u);
    await sharedClass.fill("Future");
    await sharedClass.press("Tab");
    await expect(sharedClass).toHaveValue("Future");
    await expect(source).toHaveValue(/class=Future/u);

    const manual =
        "{{WPBS|class=Bplus|1={{WikiProject Video games|importance=High}}}}\n<!-- Keep exact alias source -->";
    await source.fill(manual);
    await expect(sharedClass).toHaveValue("乙上");
    await sharedClass.focus();
    await source.click();
    await expect(source).toHaveValue(manual);
    await page.getByRole("button", { name: "提交", exact: true }).click();
    await expect.poll(() => getPosts(page)).toHaveLength(2);
    expect((await getPosts(page))[1].text).toBe(
        `${manual}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    );
});

test("assesses through Codex controls and saves the exact reviewed source after registration", async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const dialog = await openAssessor(page);
    await expect(dialog).toHaveAttribute("lang", "en");
    await expect(
        page.getByRole("combobox", { name: "Shared class", exact: true }),
    ).toHaveValue("Start");
    await expect(
        page.getByRole("combobox", { name: "Importance", exact: true }),
    ).toContainText("Low");
    await expect(
        page.getByRole("checkbox", { name: "Sega", exact: true }),
    ).toBeChecked();
    await expect(
        page.getByRole("checkbox", { name: "Role-playing games", exact: true }),
    ).toBeChecked();
    await expect(registration(page)).toBeChecked();

    await chooseOption(page, "Shared class", "B");
    await chooseOption(page, "Importance", "High");
    await page.getByRole("checkbox", { name: "Pokemon", exact: true }).check();
    await expect(readySource(page)).toHaveValue(/class=B/u);
    await expect(readySource(page)).toHaveValue(/importance=High/u);
    await expect(readySource(page)).toHaveValue(/Pokemon=yes/u);
    await expect(readySource(page)).toHaveValue(/custom=keep/u);

    const reviewed = `  ${await readySource(page).inputValue()}\n<!-- Reviewed manually -->\n\n`;
    await readySource(page).fill(reviewed);
    await page
        .getByRole("textbox", {
            name: "Talk-page edit summary",
            exact: true,
        })
        .fill("Reviewed talk edit");
    await page
        .getByRole("textbox", {
            name: "New-page list edit summary",
            exact: true,
        })
        .fill("Reviewed registration");
    await expect(
        page.getByRole("region", { name: "Lead-section changes", exact: true }),
    ).toContainText("Reviewed manually");
    if (process.env.WPVG_SCREENSHOT_DIR) {
        await mkdir(process.env.WPVG_SCREENSHOT_DIR, { recursive: true });
        for (const [name, filename] of [
            ["Lead-section changes", "assessment-changes-1440"],
            ["New-page list changes", "registration-1440"],
        ]) {
            await page
                .getByRole("region", { name, exact: true })
                .scrollIntoViewIfNeeded();
            await page.screenshot({
                path: `${process.env.WPVG_SCREENSHOT_DIR}/${filename}.png`,
                animations: "disabled",
            });
        }
    }
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(2);
    const posts = await getPosts(page);
    expect(posts[0]).toMatchObject({
        token: "csrf",
        summary: "Reviewed registration",
        nocreate: true,
    });
    expect(posts[0].title).toContain("电子游戏/新进条目");
    expect(posts[0].text).toContain(
        "{{vgc|Earlier game}}、{{vgc|Example game}}",
    );
    expect(posts[1]).toMatchObject({
        token: "csrf",
        title: "Talk:Example game",
        summary: "Reviewed talk edit",
    });
    expect(posts[1].text).toBe(
        `${reviewed}== Discussion ==\nKeep this discussion exactly.\n`,
    );
    expect(posts[1].basetimestamp).toBe("2026-09-30T23:00:00Z");
    expect(posts[1].starttimestamp).toBe("2026-10-01T01:00:00Z");
    expect(errors).toEqual([]);
});

test("manual edits survive a later control change and preserve the custom summary", async ({
    page,
}) => {
    await openAssessor(page);
    await registration(page).uncheck();
    const manual =
        (await readySource(page).inputValue()) +
        "\n{{Unmanaged banner|custom={{Nested|x=y}}}}\n<!-- Keep my note -->";
    await readySource(page).fill(manual);
    await page
        .getByRole("textbox", {
            name: "Talk-page edit summary",
            exact: true,
        })
        .fill("My summary");
    await chooseOption(page, "Importance", "Top");
    await expect(readySource(page)).toHaveValue(/importance=Top/u);
    await expect(readySource(page)).toHaveValue(
        /\{\{Unmanaged banner\|custom=\{\{Nested\|x=y\}\}\}\}/u,
    );
    await expect(readySource(page)).toHaveValue(/Keep my note/u);
    await expect(
        page.getByRole("textbox", {
            name: "Talk-page edit summary",
            exact: true,
        }),
    ).toHaveValue("My summary");
    const reviewed = await readySource(page).inputValue();
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    expect((await getPosts(page))[0]).toMatchObject({
        title: "Talk:Example game",
        summary: "My summary",
    });
    expect((await getPosts(page))[0].text).toBe(
        `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    );
});

test("the registration checkbox controls its review and can save registration without a talk change", async ({
    page,
}) => {
    await openAssessor(page);
    const listSummary = page.getByRole("textbox", {
        name: "New-page list edit summary",
        exact: true,
    });
    await expect(listSummary).toBeVisible();
    await registration(page).uncheck();
    await expect(listSummary).toBeHidden();
    await registration(page).check();
    await expect(listSummary).toBeVisible();
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    expect((await getPosts(page))[0].title).toContain("电子游戏/新进条目");
});

test("a registration error retains the reviewed edit and prevents the talk-page write", async ({
    page,
}) => {
    await openAssessor(page, { failList: true });
    await chooseOption(page, "Shared class", "B");
    const reviewed = await readySource(page).inputValue();
    await save(page).click();
    await expect(
        page.getByText("Registration temporarily unavailable", { exact: true }),
    ).toBeVisible();
    await expect(save(page)).toBeEnabled();
    await expect(readySource(page)).toHaveValue(reviewed);
    expect((await getPosts(page)).map((post) => post.title)).toEqual([
        "WikiProject:电子游戏/新进条目",
    ]);
    await page.evaluate(() => {
        (globalThis as any).__fixture.failList = false;
    });
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(3);
    expect((await getPosts(page)).at(-1)?.text).toBe(
        `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    );
});

test("an edit conflict retries the same reviewed lead against the latest discussion", async ({
    page,
}) => {
    await openAssessor(page, { conflict: true });
    await registration(page).uncheck();
    const reviewed =
        "  {{WikiProject banner shell|class=C|1=\n{{WikiProject Video games|importance=High}}\n}}\n<!-- exact source -->\n\n";
    await readySource(page).fill(reviewed);
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(2);
    const posts = await getPosts(page);
    expect(posts[0].text).toBe(
        `${reviewed}== Discussion ==\nKeep this discussion exactly.\n`,
    );
    expect(posts[1].text).toBe(
        `${reviewed}== Discussion ==\nConcurrent discussion survives.\n`,
    );
    expect(posts[1].basetimestamp).toBe("2026-10-01T00:30:00Z");
});

test("custom assessment values remain selectable and clearing importance preserves the choice", async ({
    page,
}) => {
    await openAssessor(page, {
        lead: "{{WikiProject banner shell|class=Future|1=\n{{WikiProject Video games|importance=Critical}}\n}}",
    });
    await registration(page).uncheck();
    await expect(
        page.getByRole("combobox", { name: "Shared class", exact: true }),
    ).toHaveValue("Future");
    await expect(
        page.getByRole("combobox", { name: "Importance", exact: true }),
    ).toContainText("Critical");
    await chooseOption(page, "Importance", "(Empty)");
    await expect(readySource(page)).toHaveValue(/class=Future/u);
    await expect(readySource(page)).not.toHaveValue(/importance=Critical/u);
    await chooseOption(page, "Importance", "High");
    await expect(readySource(page)).toHaveValue(/importance=High/u);
});

for (const width of [360, 1024, 1440]) {
    test(`the ${width}px dialog keeps labeled controls and actions inside the viewport`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        const dialog = await openAssessor(page);
        await expect(dialog).toBeVisible();
        await expect(readySource(page)).toHaveAccessibleName(
            "Ready-to-save lead-section source",
        );
        await expect(
            page.getByRole("combobox", { name: "Shared class", exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole("combobox", { name: "Importance", exact: true }),
        ).toBeVisible();
        for (const label of ["Shared class", "Importance"]) {
            const bounds = await page
                .getByRole("combobox", { name: label, exact: true })
                .evaluate((element) => {
                    const control = element.getBoundingClientRect();
                    const field = element
                        .closest(".cdx-field")!
                        .getBoundingClientRect();
                    return {
                        left: control.left,
                        right: control.right,
                        fieldLeft: field.left,
                        fieldRight: field.right,
                    };
                });
            expect(bounds.left).toBeGreaterThanOrEqual(bounds.fieldLeft - 1);
            expect(bounds.right).toBeLessThanOrEqual(bounds.fieldRight + 1);
        }
        const dimensions = await dialog.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const body =
                element.querySelector<HTMLElement>(".cdx-dialog__body")!;
            return {
                left: bounds.left,
                right: bounds.right,
                top: bounds.top,
                bottom: bounds.bottom,
                viewportWidth: innerWidth,
                viewportHeight: innerHeight,
                pageWidth: document.documentElement.scrollWidth,
                bodyWidth: body.clientWidth,
                bodyScrollWidth: body.scrollWidth,
            };
        });
        expect(dimensions.left).toBeGreaterThanOrEqual(-1);
        expect(dimensions.right).toBeLessThanOrEqual(
            dimensions.viewportWidth + 1,
        );
        expect(dimensions.top).toBeGreaterThanOrEqual(-1);
        expect(dimensions.bottom).toBeLessThanOrEqual(
            dimensions.viewportHeight + 1,
        );
        expect(dimensions.pageWidth).toBeLessThanOrEqual(
            dimensions.viewportWidth + 1,
        );
        expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(
            dimensions.bodyWidth + 1,
        );
        const footer = dialog.locator(".cdx-dialog__footer");
        const footerButtons = footer.getByRole("button");
        const stacked = width <= 640;
        await expect(footerButtons).toHaveText(
            stacked
                ? ["Submit", "Stage", "Cancel"]
                : ["Cancel", "Stage", "Submit"],
        );
        const cancel = footer.getByRole("button", {
            name: "Cancel",
            exact: true,
        });
        const store = footer.getByRole("button", {
            name: "Stage",
            exact: true,
        });
        const submit = footer.getByRole("button", {
            name: "Submit",
            exact: true,
        });
        for (const [button, action, weight] of [
            [cancel, "default", "quiet"],
            [store, "default", "normal"],
            [submit, "progressive", "primary"],
        ] as const) {
            await expect(button).toHaveClass(
                new RegExp(`\\bcdx-button--action-${action}\\b`, "u"),
            );
            await expect(button).toHaveClass(
                new RegExp(`\\bcdx-button--weight-${weight}\\b`, "u"),
            );
            await expect(button).toBeInViewport({ ratio: 1 });
        }
        const buttonBounds = await footerButtons.evaluateAll((buttons) =>
            buttons.map((button) => {
                const bounds = button.getBoundingClientRect();
                return {
                    left: bounds.left,
                    right: bounds.right,
                    top: bounds.top,
                    bottom: bounds.bottom,
                };
            }),
        );
        for (let index = 1; index < buttonBounds.length; index += 1) {
            if (stacked) {
                expect(
                    buttonBounds[index].top - buttonBounds[index - 1].bottom,
                ).toBeCloseTo(12, 0);
                continue;
            }
            expect(buttonBounds[index - 1].right).toBeLessThanOrEqual(
                buttonBounds[index].left,
            );
            expect(buttonBounds[index].top).toBeLessThan(
                buttonBounds[index - 1].bottom,
            );
            expect(buttonBounds[index].bottom).toBeGreaterThan(
                buttonBounds[index - 1].top,
            );
        }
        const first = stacked ? submit : cancel;
        const last = stacked ? cancel : submit;
        await first.focus();
        await expect(first).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(store).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(last).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(store).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(first).toBeFocused();
        const screenshotDirectory = process.env.WPVG_SCREENSHOT_DIR;
        if (screenshotDirectory) {
            await mkdir(screenshotDirectory, { recursive: true });
            await page.screenshot({
                path: `${screenshotDirectory}/assessment-${width}.png`,
                animations: "disabled",
            });
            if (width === 360) {
                await readySource(page).scrollIntoViewIfNeeded();
                await page.screenshot({
                    path: `${screenshotDirectory}/assessment-${width}-source.png`,
                    animations: "disabled",
                });
            }
        }
        await page
            .getByRole("button", { name: "Cancel", exact: true })
            .last()
            .click();
        await expect(dialog).toHaveCount(0);
        expect(await getPosts(page)).toEqual([]);
    });
}

for (const width of [360, 1024]) {
    test(`the ${width}px RTL footer retains reading, visual, and keyboard action order`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        const dialog = await openAssessor(page);
        await page.evaluate(() => {
            document.documentElement.dir = "rtl";
        });
        const buttons = dialog
            .locator(".cdx-dialog__footer")
            .getByRole("button");
        await expect(buttons).toHaveText(
            width <= 640
                ? ["Submit", "Stage", "Cancel"]
                : ["Cancel", "Stage", "Submit"],
        );
        const bounds = await buttons.evaluateAll((elements) =>
            elements.map((element) => {
                const box = element.getBoundingClientRect();
                return {
                    top: box.top,
                    bottom: box.bottom,
                    left: box.left,
                    right: box.right,
                };
            }),
        );
        for (let index = 1; index < bounds.length; index += 1) {
            if (width <= 640) {
                expect(
                    bounds[index].top - bounds[index - 1].bottom,
                ).toBeCloseTo(12, 0);
            } else {
                expect(
                    bounds[index - 1].left - bounds[index].right,
                ).toBeCloseTo(12, 0);
            }
        }
        await buttons.nth(0).focus();
        for (let index = 1; index < (await buttons.count()); index += 1) {
            await page.keyboard.press("Tab");
            await expect(buttons.nth(index)).toBeFocused();
        }
        expect(await getPosts(page)).toEqual([]);
    });
}

test("opening failure reports a notification and removes the loading dialog", async ({
    page,
}) => {
    await page.addInitScript(() => {
        (globalThis as any).__fixtureOptions = { loadError: true };
    });
    await page.goto("/tests/ui/index.html");
    await page
        .getByRole("link", { name: "VG Page Assessor", exact: true })
        .click();
    await expect(page.locator("#notifications")).toContainText(
        "The fixture is unavailable",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await getPosts(page)).toEqual([]);
});

test("an expired creation date offers no registration write", async ({
    page,
}) => {
    await openAssessor(page, { expired: true });
    await expect(registration(page)).toHaveCount(0);
    await expect(
        page.getByText(/registration period has expired/u),
    ).toBeVisible();
    await chooseOption(page, "Shared class", "B");
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    expect((await getPosts(page))[0].title).toBe("Talk:Example game");
});

test("saving holds the reviewed source stable and ignores dismissal until completion", async ({
    page,
}) => {
    const dialog = await openAssessor(page, { holdTalk: true });
    await registration(page).uncheck();
    await chooseOption(page, "Shared class", "B");
    const reviewed = await readySource(page).inputValue();
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(1);
    await expect(readySource(page)).toHaveAttribute("readonly", "");
    await expect(
        page.getByRole("combobox", { name: "Shared class", exact: true }),
    ).toBeDisabled();
    await expect(registration(page)).toBeDisabled();
    await expect(
        page.getByRole("button", { name: "Cancel", exact: true }).last(),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(readySource(page)).toHaveValue(reviewed);
    expect((await getPosts(page))[0].text).toBe(
        `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
    );
    await page.evaluate(() => {
        (globalThis as any).__fixture.releaseTalk();
    });
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
});

test("a talk-page error allows a retry with the exact reviewed source", async ({
    page,
}) => {
    await openAssessor(page, { failTalk: true });
    await registration(page).uncheck();
    await chooseOption(page, "Shared class", "B");
    const reviewed = await readySource(page).inputValue();
    await save(page).click();
    await expect(
        page.getByText("Talk page temporarily unavailable", { exact: true }),
    ).toBeVisible();
    await expect(save(page)).toBeEnabled();
    await expect(readySource(page)).toHaveValue(reviewed);
    await page.evaluate(() => {
        (globalThis as any).__fixture.failTalk = false;
    });
    await save(page).click();
    await expect.poll(() => getPosts(page)).toHaveLength(2);
    const posts = await getPosts(page);
    expect(posts[1].text).toBe(posts[0].text);
});

test("cancelled loading cannot mount a stale dialog and the tool can reopen", async ({
    page,
}) => {
    await page.addInitScript(() => {
        (globalThis as any).__fixtureOptions = { holdLoad: true };
    });
    await page.goto("/tests/ui/index.html");
    const link = page.getByRole("link", {
        name: "VG Page Assessor",
        exact: true,
    });
    await link.click();
    await expect(
        page.getByText("Loading assessment, new-page list, and page state...", {
            exact: true,
        }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.evaluate(() => {
        (globalThis as any).__fixture.releaseLoad();
    });
    await expect
        .poll(() =>
            page.evaluate(() => (globalThis as any).__fixture.calls.length),
        )
        .toBeGreaterThanOrEqual(7);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await link.click();
    await expect(readySource(page)).toBeVisible();
    expect(await getPosts(page)).toEqual([]);
});

for (const [
    locale,
    expectedLocale,
    classLabel,
    classValue,
    sourceLabel,
    saveLabel,
] of [
    ["zh-CN", "zh-Hans", "通用评级", "乙", "待保存的导言源码", "提交"],
    ["zh-TW", "zh-Hant", "通用評級", "乙", "待儲存的導言原始碼", "提交"],
]) {
    test(`${locale} localizes controls while saving the original assessment codes`, async ({
        page,
    }) => {
        await page.addInitScript((locale) => {
            (globalThis as any).__fixtureOptions = { locale };
        }, locale);
        await page.goto("/tests/ui/index.html");
        await page.locator("#t-assess-vg-page").click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toHaveAttribute("lang", expectedLocale);
        await expect(dialog).toHaveAccessibleName(
            expectedLocale === "zh-Hans"
                ? "电子游戏评级工具（Example game）"
                : "電子遊戲評級工具（Example game）",
        );
        await chooseOption(page, classLabel, classValue);
        const source = page.getByRole("textbox", {
            name: sourceLabel,
            exact: true,
        });
        await expect(source).toHaveValue(/class=B/u);
        const reviewed = await source.inputValue();
        await page
            .getByRole("button", { name: saveLabel, exact: true })
            .click();
        await expect.poll(() => getPosts(page)).toHaveLength(2);
        expect((await getPosts(page))[1].text).toBe(
            `${reviewed}\n\n== Discussion ==\nKeep this discussion exactly.\n`,
        );
    });
}
