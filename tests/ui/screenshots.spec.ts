/** Reproducible product documentation images from an entirely offline host. */
import { mkdir } from "node:fs/promises";
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
const lead = [
    "{{WikiProject banner shell|class=C|vital=yes|",
    "{{WikiProject Video games|importance=High|Pokemon=yes|NINTENDO=y|NINTENDO-importance=|b1=no|b2=no|b3=no|b4=no|b5=yes|b6=yes}}",
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
        pageTitle: "宝可梦系列",
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
        categoryMembers: ["Example game", "Another game"],
        articleHtml: {
            "Example game":
                "<h2>Example game</h2><p>Example game is a role-playing video game. Explore its world, complete quests, and guide a team of characters through the story.</p><h3>Gameplay</h3><p>The player controls a party and chooses actions during turn-based battles. Exploring towns and talking to characters unlocks new areas.</p><h3>Development</h3><p>The game was developed for a home console and later released on additional platforms.</p>",
        },
    });
    await expect(dialog.locator("iframe")).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Stub", exact: true }),
    ).toBeVisible();
    await expect(
        page
            .frameLocator("iframe")
            .getByRole("heading", { name: "Gameplay", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
        path: resolve(directory, "screenshot-03.png"),
        animations: "disabled",
    });
    expect(await getPosts(page)).toEqual([]);
});
