/**
 * @file tests/category-dialog.test.ts
 * Purpose: Category actions capture one exact background save and keep navigation independent.
 *
 * Table of contents:
 * 1. Imports
 * 2. Test scenarios
 * 3. createFixture
 */

import assert from "node:assert/strict";
import test from "node:test";

import type {
    CategoryAssessmentPage,
    CategoryAssessmentSession,
} from "../src/app/category-contracts.ts";
import type { PageAssessorRuntime } from "../src/app/dialog-contracts.ts";
import type {
    AssessmentSaveReview,
    AssessmentState,
} from "../src/app/assessment-contracts.ts";
import { createDefaultAssessment } from "../src/domain/assessment.ts";
import projectConfig from "../src/domain/project-config.ts";
import { createCategoryDialogBindings } from "../src/features/assessment/dialogs/category-dialog.ts";
import type { VueModule } from "../src/platform/mediawiki/codex.ts";
import { createLogger } from "../src/shared/logging.ts";

test("a class button captures its exact background review before advancing", async () => {
    const saved: AssessmentSaveReview[] = [];
    const fixture = createFixture((_page, review) => {
        saved.push(review);
    });
    await fixture.ready();
    fixture.bindings.setBatchSummary("My reviewed summary");
    await fixture.bindings.onBatchAction("B");
    assert.equal(saved.length, 1);
    assert.match(saved[0].previewText, /class=B/u);
    assert.match(saved[0].previewText, /Sega=yes/u);
    assert.equal(saved[0].summary, "My reviewed summary");
    assert.equal(fixture.navigationCount(), 1);
    assert.equal(fixture.bindings.batchArticle.value, null);
});

test("Skip makes no save and cancel ignores a delayed next article", async () => {
    let finishNext: (page: CategoryAssessmentPage) => void = () =>
        assert.fail("Next was not requested");
    const fixture = createFixture(
        () => assert.fail("Skip must not save"),
        () =>
            new Promise((resolve) => {
                finishNext = resolve;
            }),
    );
    await fixture.ready();
    const pending = fixture.bindings.onBatchAction("Skip");
    fixture.bindings.onBatchCancel();
    assert.equal(fixture.disposed(), true);
    assert.equal(fixture.unsubscribed(), true);
    finishNext(fixture.page);
    await pending;
    assert.equal(fixture.bindings.batchArticle.value, null);
    assert.equal(fixture.bindings.batchOpen.value, false);
    assert.equal(fixture.bindings.batchDocument.value, "");
});

function createFixture(
    save: (page: CategoryAssessmentPage, review: AssessmentSaveReview) => void,
    next: () => Promise<CategoryAssessmentPage | null> = async () => null,
) {
    let mount: () => void = () => assert.fail("Missing mount callback");
    const Vue: VueModule = {
        computed: (getter) => ({
            get value() {
                return getter();
            },
        }),
        createMwApp: () => {
            throw new Error("No app is mounted in this fixture");
        },
        defineComponent: (component) => component,
        onMounted: (callback) => {
            mount = callback;
        },
        onUnmounted() {},
        reactive: (value) => value,
        ref: (value) => ({ value }),
    };
    let disposed = false;
    let unsubscribed = false;
    let navigations = 0;
    const text =
        "{{WPBS|class=Unassessed|1={{WikiProject Video games|importance=Low|Sega=yes}}}}";
    const state: AssessmentState = {
        api: {} as mw.Api,
        assessment: createDefaultAssessment(projectConfig, text),
        page: {
            text,
            exists: true,
            starttimestamp: "start",
            basetimestamp: "base",
        },
        previewDirty: false,
        subjectTitle: "Example game",
        summaryDirty: false,
        talkTitle: "Talk:Example game",
    };
    const page = { state, position: 1, articleHtml: "<p>Article</p>" };
    const session: CategoryAssessmentSession = {
        current: async () => page,
        next: async () => {
            navigations += 1;
            return next();
        },
        previous: async () => null,
        hasPrevious: () => false,
        hasNext: () => true,
        pendingSaveCount: () => 0,
        hasFailedPages: () => false,
        subscribe: () => () => {
            unsubscribed = true;
        },
        save,
        dispose() {
            disposed = true;
        },
    };
    const runtime: PageAssessorRuntime = {
        createDialogPageContext: () => ({
            api: state.api,
            pageName: state.subjectTitle,
            title: null,
        }),
        loadDialogState: async () =>
            assert.fail("Category loading belongs to the session"),
        logger: createLogger("category-dialog-test", { level: "silent" }),
        notify() {},
        saveReviewedDialog: async () =>
            assert.fail("The session owns background saves"),
    };
    const bindings = createCategoryDialogBindings(Vue, {
        runtime,
        session,
        onClose() {},
    });
    return {
        bindings,
        page,
        disposed: () => disposed,
        unsubscribed: () => unsubscribed,
        navigationCount: () => navigations,
        async ready() {
            mount();
            await new Promise<void>((resolve) => setImmediate(resolve));
        },
    };
}
