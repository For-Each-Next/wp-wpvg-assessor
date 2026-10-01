/** Offline navigation, prefetch, and targeting checks for category assessment. */

import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { reactive } from "vue";

import {
    createCategoryAssessmentWorkflow,
    type CategoryAssessmentOperations,
} from "../src/app/category-assessment.ts";
import type {
    CategoryAssessmentPage,
    CategoryMemberBatch,
} from "../src/app/category-contracts.ts";
import type {
    AssessmentSaveReview,
    AssessmentState,
} from "../src/app/assessment-contracts.ts";
import type { DialogSaveOutcome } from "../src/app/dialog-contracts.ts";
import { createDefaultAssessment } from "../src/domain/assessment.ts";
import projectConfig from "../src/domain/project-config.ts";
import { createLogger } from "../src/shared/logging.ts";

const logger = createLogger("category-test", { level: "silent" });
const api = {} as mw.Api;

test("preloads exactly three articles ahead and reuses loads when navigating", async () => {
    const fixture = createFixture([
        {
            titles: ["One", "Two", "Three", "Four", "Five", "Six"],
            continuation: null,
        },
    ]);
    const session = await fixture.workflow.open(api);
    const first = await session.current();
    await setImmediate();

    assert.equal(first?.position, 1);
    assert.equal(first?.state.subjectTitle, "One");
    assert.equal(first?.articleHtml, "<p>One</p>");
    assert.deepEqual(fixture.stateReads, ["One", "Two", "Three", "Four"]);
    assert.deepEqual(fixture.articleReads, ["One", "Two", "Three", "Four"]);
    assert.equal(session.hasPrevious(), false);
    assert.equal(session.hasNext(), true);

    const second = await session.next();
    await setImmediate();
    assert.equal(second?.position, 2);
    assert.deepEqual(fixture.stateReads, [
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
    ]);
    assert.equal(session.hasPrevious(), true);
    assert.equal((await session.previous())?.state.subjectTitle, "One");
    assert.equal(
        fixture.stateReads.filter((title) => title === "One").length,
        1,
    );
    session.dispose();
});

test("keeps talk targeting while loading the associated article and deduplicates subjects", async () => {
    const fixture = createFixture([
        { titles: ["Talk:One", "One", "Talk:Two"], continuation: null },
    ]);
    const session = await fixture.workflow.open(api);
    const first = await session.current();
    await setImmediate();

    assert.deepEqual(fixture.stateReads, ["Talk:One", "Talk:Two"]);
    assert.deepEqual(fixture.articleReads, ["One", "Two"]);
    assert.equal(first?.state.talkTitle, "Talk:One");
    assert.equal((await session.next())?.position, 2);
    assert.equal(session.hasNext(), false);
    assert.equal(await session.next(), null);
    assert.equal(await session.current(), null);
    assert.equal(session.hasPrevious(), true);
    assert.equal(session.hasNext(), false);
    assert.equal(await session.next(), null);
    assert.equal((await session.previous())?.state.subjectTitle, "Two");
    session.dispose();
});

test("fills the three-ahead window across empty and continued category batches", async () => {
    const fixture = createFixture([
        { titles: ["One"], continuation: "second" },
        { titles: [], continuation: "third" },
        { titles: ["Two", "Three", "Four"], continuation: "fourth" },
        { titles: ["Five"], continuation: null },
    ]);
    const session = await fixture.workflow.open(api);
    assert.deepEqual(fixture.categoryReads, [undefined]);
    await session.current();
    await setImmediate();

    assert.deepEqual(fixture.categoryReads, [undefined, "second", "third"]);
    assert.deepEqual(fixture.articleReads, ["One", "Two", "Three", "Four"]);
    await session.next();
    await setImmediate();
    assert.deepEqual(fixture.categoryReads, [
        undefined,
        "second",
        "third",
        "fourth",
    ]);
    assert.deepEqual(fixture.articleReads, [
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
    ]);
    session.dispose();
});

test("reports foreground failures and retries a failed background article load", async () => {
    let failing = true;
    const fixture = createFixture(
        [{ titles: ["One", "Two"], continuation: null }],
        {
            async fetchArticleHtml(_api, title) {
                if (title === "Two" && failing)
                    throw new Error("Preview unavailable");
                return `<p>${title}</p>`;
            },
        },
    );
    const session = await fixture.workflow.open(api);
    await session.current();
    await setImmediate();
    await assert.rejects(session.next(), /Preview unavailable/u);
    failing = false;
    assert.equal((await session.current())?.state.subjectTitle, "Two");
    assert.equal(
        fixture.stateReads.filter((title) => title === "Two").length,
        3,
    );
    session.dispose();
});

test("disposing a session ignores late page loads and prevents further reads", async () => {
    const delayed = Promise.withResolvers<AssessmentState>();
    const fixture = createFixture(
        [
            {
                titles: ["One", "Two", "Three", "Four", "Five"],
                continuation: null,
            },
        ],
        { loadAssessmentState: () => delayed.promise },
    );
    const session = await fixture.workflow.open(api);
    const pending = session.current();
    await setImmediate();
    session.dispose();
    delayed.resolve(createState("One"));

    assert.equal(await pending, null);
    await setImmediate();
    assert.deepEqual(fixture.articleReads, []);
    const stateReadCount = fixture.stateReads.length;
    assert.equal(await session.current(), null);
    assert.equal(await session.next(), null);
    assert.equal(await session.previous(), null);
    assert.equal(session.hasNext(), false);
    assert.equal(session.hasPrevious(), false);
    assert.equal(fixture.stateReads.length, stateReadCount);
});

test("an old navigation result is ignored when another article becomes current", async () => {
    const first = Promise.withResolvers<AssessmentState>();
    const fixture = createFixture(
        [{ titles: ["One", "Two"], continuation: null }],
        {
            loadAssessmentState(_api, title) {
                return title.getMainText() === "One"
                    ? first.promise
                    : Promise.resolve(createState("Two"));
            },
        },
    );
    const session = await fixture.workflow.open(api);
    const old = session.current();
    await setImmediate();
    assert.equal((await session.next())?.state.subjectTitle, "Two");
    first.resolve(createState("One"));
    assert.equal(await old, null);
    assert.equal((await session.current())?.state.subjectTitle, "Two");
    session.dispose();
});

test("an empty category has no current article or next article", async () => {
    const fixture = createFixture([{ titles: [], continuation: null }]);
    const session = await fixture.workflow.open(api);
    assert.equal(await session.current(), null);
    assert.equal(session.hasNext(), false);
    assert.equal(session.hasPrevious(), false);
    assert.deepEqual(fixture.stateReads, []);
    session.dispose();
});

test("repeated continuation tokens stop navigation instead of looping", async () => {
    const fixture = createFixture([
        { titles: [], continuation: "repeat" },
        { titles: [], continuation: "repeat" },
    ]);
    await assert.rejects(
        fixture.workflow.open(api),
        /repeated a category continuation/u,
    );
    assert.deepEqual(fixture.categoryReads, [undefined, "repeat"]);
});

test("invalid member titles cannot reach assessment or preview loading", async () => {
    const fixture = createFixture(
        [{ titles: ["Invalid"], continuation: null }],
        { resolveTitle: () => null },
    );
    await assert.rejects(
        fixture.workflow.open(api),
        /Unable to resolve a category member/u,
    );
    assert.deepEqual(fixture.stateReads, []);
    assert.deepEqual(fixture.articleReads, []);
});

test("queues one background save and navigates immediately while the edit is pending", async () => {
    const saving = Promise.withResolvers<DialogSaveOutcome>();
    const fixture = createFixture(
        [
            {
                titles: ["One", "Two", "Three", "Four", "Five"],
                continuation: null,
            },
        ],
        { saveReviewedAssessment: () => saving.promise },
    );
    const session = await fixture.workflow.open(api);
    const first = (await session.current())!;
    let changes = 0;
    session.subscribe(() => {
        changes += 1;
    });
    session.save(first, createReview("One"));
    session.save(first, createReview("One"));

    assert.equal(session.pendingSaveCount(), 1);
    assert.equal((await session.next())?.state.subjectTitle, "Two");
    await setImmediate();
    assert.equal(fixture.saveReads.length, 1);
    assert.equal(session.pendingSaveCount(), 1);
    assert.equal(session.hasFailedPages(), false);
    assert.deepEqual(fixture.articleReads, [
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
    ]);
    saving.resolve("saved");
    await setImmediate();
    assert.equal(session.pendingSaveCount(), 0);
    assert.equal(session.hasFailedPages(), false);
    assert.equal(changes, 2);
    session.dispose();
});

test("a failed background save appears after normal pages with its exact captured Vue review", async () => {
    const saving = Promise.withResolvers<DialogSaveOutcome>();
    const fixture = createFixture(
        [{ titles: ["One", "Two", "Three"], continuation: null }],
        { saveReviewedAssessment: () => saving.promise },
    );
    const session = await fixture.workflow.open(api);
    const first = (await session.current())!;
    first.state.assessment.className = "B";
    const review = createReview("One");
    const expected = { ...review };
    session.save(reactive(first) as CategoryAssessmentPage, reactive(review));
    first.state.assessment.className = "FA";
    first.state.page.text = "Later unreviewed source";
    review.previewText = "Later unreviewed draft";
    review.summary = "Later unreviewed summary";

    assert.equal((await session.next())?.state.subjectTitle, "Two");
    assert.equal((await session.next())?.state.subjectTitle, "Three");
    assert.equal(await session.next(), null);
    let changes = 0;
    session.subscribe(() => {
        changes += 1;
    });
    saving.reject(new Error("Uncertain edit outcome"));
    await setImmediate();

    assert.equal(changes, 1);
    assert.equal(session.pendingSaveCount(), 0);
    assert.equal(session.hasFailedPages(), true);
    const failed = (await session.current())!;
    assert.equal(failed.state.subjectTitle, "One");
    assert.equal(failed.state.assessment.className, "B");
    assert.notEqual(failed.state.page.text, "Later unreviewed source");
    assert.deepEqual(failed.review, expected);
    assert.equal(failed.saveError, "Uncertain edit outcome");
    assert.equal(failed.articleHtml, "<p>One</p>");
    assert.equal(session.hasFailedPages(), false);
    assert.equal((await session.current())?.state.subjectTitle, "One");
    assert.equal(await session.next(), null);
    await setImmediate();
    assert.equal(fixture.saveReads.length, 1);
    assert.deepEqual(fixture.saveReads[0]?.review, expected);
    session.dispose();
});

test("failed drafts survive disposal, reopen once, and save only after an explicit retry", async () => {
    let failSave = true;
    const fixture = createFixture(
        [{ titles: ["Talk:One", "Two"], continuation: null }],
        {
            async saveReviewedAssessment() {
                if (failSave) throw new Error("Save failed");
                return "saved";
            },
        },
    );
    const session = await fixture.workflow.open(api);
    const first = (await session.current())!;
    const review = createReview("One");
    session.save(first, review);
    await session.next();
    await setImmediate();
    session.dispose();

    fixture.resetCategory();
    const secondApi = {} as mw.Api;
    const reopened = await fixture.workflow.open(secondApi);
    assert.equal((await reopened.current())?.state.subjectTitle, "Two");
    const failed = (await reopened.next())!;
    assert.equal(failed.state.subjectTitle, "One");
    assert.equal(failed.state.api, secondApi);
    assert.deepEqual(failed.review, review);
    assert.equal(reopened.hasFailedPages(), false);
    await setImmediate();
    assert.equal(fixture.saveReads.length, 1);

    failSave = false;
    reopened.save(failed, failed.review!);
    assert.equal(await reopened.next(), null);
    await setImmediate();
    assert.equal(fixture.saveReads.length, 2);
    assert.equal(reopened.pendingSaveCount(), 0);
    assert.equal(reopened.hasFailedPages(), false);
    reopened.dispose();
    fixture.resetCategory();
    const fresh = await fixture.workflow.open(api);
    assert.equal((await fresh.current())?.state.subjectTitle, "One");
    assert.equal((await fresh.next())?.state.subjectTitle, "Two");
    assert.equal(await fresh.next(), null);
    fresh.dispose();
});

test("background saves complete after cancellation and late failures notify without reviving disposed listeners", async () => {
    const saving = Promise.withResolvers<DialogSaveOutcome>();
    let notified = 0;
    const fixture = createFixture([{ titles: ["One"], continuation: null }], {
        saveReviewedAssessment: () => saving.promise,
        onSaveFailed() {
            notified += 1;
            throw new Error("Notification unavailable");
        },
    });
    const session = await fixture.workflow.open(api);
    const first = (await session.current())!;
    let changes = 0;
    session.subscribe(() => {
        changes += 1;
    });
    session.save(first, createReview("One"));
    session.dispose();
    saving.reject(new Error("Network outcome unknown"));
    await setImmediate();

    assert.equal(fixture.saveReads.length, 1);
    assert.equal(changes, 1);
    assert.equal(notified, 1);
    fixture.resetCategory();
    const reopened = await fixture.workflow.open(api);
    const failed = await reopened.current();
    assert.equal(failed?.state.subjectTitle, "One");
    assert.equal(failed?.saveError, "Network outcome unknown");
    assert.equal(fixture.saveReads.length, 1);
    reopened.dispose();
});

test("a pending page is omitted on reopen and repeated failed retries each appear later once", async () => {
    const firstSave = Promise.withResolvers<DialogSaveOutcome>();
    const retrySave = Promise.withResolvers<DialogSaveOutcome>();
    let attempts = 0;
    const fixture = createFixture(
        [{ titles: ["One", "Two"], continuation: null }],
        {
            saveReviewedAssessment() {
                attempts += 1;
                return attempts === 1 ? firstSave.promise : retrySave.promise;
            },
        },
    );
    const original = await fixture.workflow.open(api);
    const first = (await original.current())!;
    original.save(first, createReview("One"));
    original.dispose();
    fixture.resetCategory();
    const reopened = await fixture.workflow.open(api);
    assert.equal((await reopened.current())?.state.subjectTitle, "Two");
    assert.equal(await reopened.next(), null);
    firstSave.reject(new Error("First failure"));
    await setImmediate();
    const failed = (await reopened.current())!;
    assert.equal(failed.saveError, "First failure");
    assert.equal(reopened.hasFailedPages(), false);
    reopened.save(failed, failed.review!);
    reopened.save(failed, failed.review!);
    assert.equal(await reopened.next(), null);
    retrySave.reject(new Error("Retry failure"));
    await setImmediate();
    assert.equal(attempts, 2);
    assert.equal(reopened.hasFailedPages(), true);
    const repeated = await reopened.current();
    assert.equal(repeated?.state.subjectTitle, "One");
    assert.equal(repeated?.saveError, "Retry failure");
    assert.equal(reopened.hasFailedPages(), false);
    assert.equal(await reopened.next(), null);
    assert.equal(fixture.saveReads.length, 2);
    reopened.dispose();
});

test("limits background writes to three while allowing immediate navigation and queued saves", async () => {
    const saves = Array.from({ length: 5 }, () =>
        Promise.withResolvers<DialogSaveOutcome>(),
    );
    let attempts = 0;
    const fixture = createFixture(
        [
            {
                titles: ["One", "Two", "Three", "Four", "Five"],
                continuation: null,
            },
        ],
        { saveReviewedAssessment: () => saves[attempts++].promise },
    );
    const session = await fixture.workflow.open(api);
    let page = await session.current();
    while (page != null) {
        session.save(page, createReview(page.state.subjectTitle));
        page = await session.next();
    }
    await setImmediate();
    assert.equal(attempts, 3);
    assert.equal(session.pendingSaveCount(), 5);
    saves[0].resolve("saved");
    await setImmediate();
    assert.equal(attempts, 4);
    assert.equal(session.pendingSaveCount(), 4);
    saves[1].resolve("saved");
    await setImmediate();
    assert.equal(attempts, 5);
    for (const save of saves) save.resolve("saved");
    await setImmediate();
    assert.equal(session.pendingSaveCount(), 0);
    assert.equal(session.hasFailedPages(), false);
    session.dispose();
});

test("releases older read-only previews and refetches them when navigating farther back", async () => {
    const fixture = createFixture([
        { titles: ["One", "Two", "Three", "Four"], continuation: null },
    ]);
    const session = await fixture.workflow.open(api);
    await session.current();
    await session.next();
    await session.next();
    await session.previous();
    assert.equal((await session.previous())?.state.subjectTitle, "One");
    assert.equal(
        fixture.articleReads.filter((title) => title === "One").length,
        2,
    );
    session.dispose();
});

function createFixture(
    batches: CategoryMemberBatch[],
    overrides: Partial<CategoryAssessmentOperations> = {},
) {
    const categoryReads: Array<string | undefined> = [];
    const stateReads: string[] = [];
    const articleReads: string[] = [];
    const saveReads: Array<{
        state: AssessmentState;
        review: AssessmentSaveReview;
    }> = [];
    let batchIndex = 0;
    const operations: CategoryAssessmentOperations = {
        logger,
        resolveTitle: createTitle,
        async fetchCategoryMembers(_api, continuation) {
            categoryReads.push(continuation);
            return batches[batchIndex++];
        },
        async loadAssessmentState(_api, title) {
            return createState(title.getMainText());
        },
        async fetchArticleHtml(_api, title) {
            return `<p>${title}</p>`;
        },
        async saveReviewedAssessment() {
            return "saved";
        },
        ...overrides,
    };
    const workflow = createCategoryAssessmentWorkflow({
        ...operations,
        loadAssessmentState(api, title) {
            stateReads.push(title.getPrefixedText());
            return operations.loadAssessmentState(api, title);
        },
        fetchArticleHtml(api, title) {
            articleReads.push(title);
            return operations.fetchArticleHtml(api, title);
        },
        saveReviewedAssessment(state, review) {
            saveReads.push({ state, review });
            return operations.saveReviewedAssessment(state, review);
        },
    });
    return {
        workflow,
        categoryReads,
        stateReads,
        articleReads,
        saveReads,
        resetCategory() {
            batchIndex = 0;
        },
    };
}

function createTitle(name: string): mw.Title {
    const namespace = name.startsWith("Talk:") ? 1 : 0;
    const main = name.replace(/^Talk:/u, "");
    return {
        getNamespaceId: () => namespace,
        getMainText: () => main,
        getPrefixedText: () => name,
    } as mw.Title;
}

function createState(title: string): AssessmentState {
    const text = "{{WikiProject Video games|class=Unassessed|importance=Low}}";
    return {
        api,
        assessment: createDefaultAssessment(projectConfig, text),
        page: { exists: true, starttimestamp: "talk-start", text },
        previewDirty: false,
        subjectTitle: title,
        summaryDirty: false,
        talkTitle: `Talk:${title}`,
    };
}

function createReview(title: string): AssessmentSaveReview {
    return {
        previewText: `  {{WikiProject Video games|class=B|importance=Low}}\n<!-- ${title}: reviewed exactly -->\n`,
        summary: `Reviewed ${title} rating`,
    };
}
