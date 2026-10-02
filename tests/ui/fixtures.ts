import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

interface FixtureOptions {
    alreadyRegistered?: boolean;
    articleCss?: string;
    articleError?: boolean;
    articleHtml?: Record<string, string>;
    categoryError?: boolean;
    categoryMembers?: string[];
    categoryPageSize?: number;
    conflict?: boolean;
    creationDates?: Record<string, string>;
    expired?: boolean;
    failList?: boolean;
    failTalk?: boolean;
    failTalkTitle?: string;
    holdLoad?: boolean;
    holdArticle?: boolean;
    holdTalk?: boolean;
    lead?: string;
    locale?: string;
    listConflict?: boolean;
    listText?: string;
    missingTitles?: string[];
    pageTitle?: string;
    wikiId?: string;
    userName?: string;
    unavailableRegistrationList?: boolean;
}

interface PostedEdit {
    basetimestamp: string;
    starttimestamp: string;
    summary: string;
    text: string;
    title: string;
    token: string;
}

/** Every network request is local and explicitly permitted. */
export const test = base.extend({
    context: async ({ context }, use) => {
        const unexpectedRequests: string[] = [];
        const allowedPaths = new Set([
            "/tests/ui/index.html",
            "/tests/ui/mediawiki.js",
            "/fixtures/vue.js",
            "/fixtures/codex.js",
            "/fixtures/codex.css",
            "/dist/wpvg_assessor.min.js",
        ]);
        await context.route("**/*", async (route) => {
            const url = new URL(route.request().url());
            if (
                url.origin === "http://127.0.0.1:4176" &&
                allowedPaths.has(url.pathname)
            ) {
                await route.continue();
                return;
            }
            unexpectedRequests.push(url.href);
            await route.abort("blockedbyclient");
        });
        await use(context);
        expect(
            unexpectedRequests,
            "Unexpected network requests in offline tests",
        ).toEqual([]);
    },
});

export { expect };

export async function openCategoryAssessor(
    page: Page,
    options: FixtureOptions = {},
) {
    await page.addInitScript(
        (fixtureOptions) => {
            (globalThis as any).__fixtureOptions = fixtureOptions;
        },
        {
            pageTitle: "Category:未评级电子游戏条目",
            ...options,
        },
    );
    await page.goto("/tests/ui/index.html");
    await page
        .getByRole("link", { name: "Batch assess articles", exact: true })
        .click();
    return page.getByRole("dialog", {
        name: "Batch assess articles",
        exact: true,
    });
}

export async function openAssessor(page: Page, options: FixtureOptions = {}) {
    await page.addInitScript((fixtureOptions) => {
        (globalThis as any).__fixtureOptions = fixtureOptions;
    }, options);
    await page.goto("/tests/ui/index.html");
    await page
        .getByRole("link", { name: "VG Page Assessor", exact: true })
        .click();
    await expect(
        page.getByRole("textbox", {
            name: "Ready-to-save lead-section source",
            exact: true,
        }),
    ).toBeVisible();
    const subjectTitle = (options.pageTitle ?? "Example game").replace(
        /^Talk:/u,
        "",
    );
    return page.getByRole("dialog", {
        name: `VG Page Assessor (${subjectTitle})`,
        exact: true,
    });
}

export async function getPosts(page: Page): Promise<PostedEdit[]> {
    return page.evaluate(() => (globalThis as any).__fixture.posts);
}

export async function navigateAssessor(page: Page, title: string) {
    await page.goto(`/tests/ui/index.html?page=${encodeURIComponent(title)}`);
    await page
        .getByRole("link", { name: "VG Page Assessor", exact: true })
        .click();
    await expect(
        page.getByRole("textbox", {
            name: "Ready-to-save lead-section source",
            exact: true,
        }),
    ).toBeVisible();
    return page.getByRole("dialog", {
        name: `VG Page Assessor (${title.replace(/^Talk:/u, "")})`,
        exact: true,
    });
}

export async function chooseOption(page: Page, label: string, value: string) {
    const control = page.getByRole("combobox", { name: label, exact: true });
    await control.click();
    if ((await control.getAttribute("aria-expanded")) !== "true") {
        await control.press("ArrowDown");
    }
    await page.getByRole("option", { name: value, exact: true }).click();
}
