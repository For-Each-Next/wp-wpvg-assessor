/**
 * @file tests/assessment-dialog.test.ts
 * Purpose: Assessment controls retain shared class while video-game scope is disabled.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. Test scenarios
 * 4. createObservableStaging
 * 5. createStaging
 * 6. createPreparedBatch
 * 7. createRuntime
 * 8. createDialogState
 */

import assert from "node:assert/strict";
import test from "node:test";
import { computed, isProxy, reactive, ref } from "vue";

import type {
    DialogSaveReview,
    DialogState,
    PageAssessorRuntime,
} from "../src/app/dialog-contracts.ts";
import type {
    AssessmentStagingWorkflow,
    PreparedAssessmentBatch,
} from "../src/app/staging-contracts.ts";
import { createDefaultAssessment } from "../src/domain/assessment.ts";
import projectConfig from "../src/domain/project-config.ts";
import { NOT_VIDEO_GAME_IMPORTANCE } from "../src/domain/types.ts";
import { createAssessmentDialogBindings } from "../src/features/assessment/dialogs/assessment-dialog.ts";
import { buildEditSummary } from "../src/features/assessment/assessment-summary.ts";
import type { VueModule } from "../src/platform/mediawiki/codex.ts";
import { createLogger } from "../src/shared/logging.ts";

const originalSource = [
    "{{WikiProject banner shell|class=Start|1=",
    "{{WikiProject Video games|importance=Low|Sega=yes|needs-infobox=yes}}",
    "}}",
].join("\n");
const vue: VueModule = {
    computed(getter) {
        return {
            get value() {
                return getter();
            },
        };
    },
    createMwApp() {
        throw new Error("Bindings do not mount an app.");
    },
    defineComponent: (component) => component,
    onMounted() {},
    onUnmounted() {},
    reactive: (value) => value,
    ref: (value) => ({ value }),
};

test("out-of-scope controls block video-game setters and stale registration", async () => {
    const state = createDialogState();
    let capturedReview: DialogSaveReview | undefined;
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {},
        runtime: createRuntime(async (_state, review) => {
            capturedReview = review;
            throw new Error("Stop after review capture.");
        }),
        state,
    });

    assert.equal(bindings.dialogTitle, "VG Page Assessor (Example game)");
    assert.equal(bindings.shouldRegister.value, true);
    bindings.setImportance(NOT_VIDEO_GAME_IMPORTANCE);
    assert.equal(bindings.videoGamesDisabled.value, true);
    assert.equal(bindings.shouldRegister.value, false);
    assert.equal(bindings.registrationDisabled.value, true);
    assert.equal(bindings.showRegistrationPreview.value, false);
    assert.deepEqual(bindings.listComparison.value.rows, []);

    const selections = structuredClone(state.assessment);
    bindings.setSelection("taskForces", "pokemon", true);
    bindings.setSelection("maintenance", "reassess", true);
    bindings.setRegister(true);
    assert.deepEqual(state.assessment.taskForces, selections.taskForces);
    assert.deepEqual(state.assessment.maintenance, selections.maintenance);
    assert.equal(bindings.shouldRegister.value, false);

    bindings.setClassName("B");
    bindings.setSelection("otherProjects", "acg", true);
    assert.match(bindings.previewText.value, /class=B/u);
    assert.match(bindings.previewText.value, /ACG專題/u);
    assert.doesNotMatch(bindings.previewText.value, /WikiProject Video games/u);
    assert.doesNotMatch(bindings.previewText.value, /NotVG/u);

    bindings.shouldRegister.value = true;
    await bindings.onSave();
    assert.equal(capturedReview?.shouldRegister, false);
    assert.equal(capturedReview?.previewText, bindings.previewText.value);
});

test("manual non-video-game source synchronizes scope and keeps registration unselected", () => {
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {},
        runtime: createRuntime(),
        state: createDialogState(),
    });
    const manual =
        "{{WPBS|class=C|1={{ACG專題}}}}\n<!-- Reviewed independently -->";

    bindings.onPreviewInput(manual);
    assert.equal(bindings.assessment.importance, NOT_VIDEO_GAME_IMPORTANCE);
    assert.equal(bindings.assessment.className, "C");
    assert.equal(bindings.assessment.otherProjects.acg, true);
    assert.equal(bindings.videoGamesDisabled.value, true);
    assert.equal(bindings.previewText.value, manual);
    assert.equal(bindings.shouldRegister.value, false);
    assert.equal(bindings.registrationDisabled.value, true);

    bindings.setImportance("High");
    assert.equal(bindings.videoGamesDisabled.value, false);
    assert.equal(bindings.registrationDisabled.value, false);
    assert.equal(bindings.shouldRegister.value, false);
    assert.match(bindings.previewText.value, /importance=High/u);
    assert.match(bindings.previewText.value, /Reviewed independently/u);
});

test("unrecognizable manual source makes registration unavailable", () => {
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {},
        runtime: createRuntime(),
        state: createDialogState(),
    });

    bindings.onPreviewInput("A manually reviewed lead without a banner.");
    assert.equal(bindings.registrationDisabled.value, true);
    assert.equal(bindings.shouldRegister.value, false);
    bindings.setRegister(true);
    assert.equal(bindings.shouldRegister.value, false);
    assert.equal(bindings.showRegistrationPreview.value, false);
});

test("editable shared class accepts hidden codes and aliases without rewriting the typing draft", () => {
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {},
        runtime: createRuntime(),
        state: createDialogState(),
    });
    assert.equal(bindings.classInput.value, "Start");
    for (const hidden of ["A", "FL", "B+"]) {
        assert.equal(
            bindings.classOptions.value.some(
                (option) => option.value === hidden,
            ),
            false,
        );
    }
    for (const draft of ["b", "bp", "bpl", "bplu", "bplus"]) {
        bindings.setClassName(draft);
        assert.equal(bindings.classInput.value, draft);
    }
    assert.equal(bindings.assessment.className, "B+");
    assert.match(bindings.previewText.value, /class=B\+/u);
    bindings.commitClassName();
    assert.equal(bindings.classInput.value, "B+");
    assert.equal(
        bindings.classOptions.value.some((option) => option.value === "B+"),
        false,
    );

    bindings.setClassName("fl");
    bindings.commitClassName();
    assert.equal(bindings.classInput.value, "FL");
    assert.equal(bindings.assessment.className, "FL");
    assert.equal(
        bindings.classOptions.value.some((option) => option.value === "B+"),
        false,
    );
    bindings.setClassName("  Future-class  ");
    assert.equal(bindings.classInput.value, "  Future-class  ");
    assert.equal(bindings.assessment.className, "Future-class");
    bindings.commitClassName();
    assert.equal(bindings.classInput.value, "Future-class");
});

test("non-video-game summaries describe shared class and only actual banner removal", () => {
    const assessment = createDefaultAssessment(projectConfig, originalSource);
    assessment.importance = NOT_VIDEO_GAME_IMPORTANCE;
    assessment.className = "B";
    assessment.otherProjects.acg = true;
    assessment.taskForces.pokemon = true;
    assessment.maintenance.reassess = true;

    const removal = buildEditSummary(assessment, undefined, originalSource);
    assert.match(removal, /Update shared assessment \(B-Class\): ACG/u);
    assert.match(removal, /remove Video games banner/u);
    assert.doesNotMatch(removal, /importance|NotVG|Pokemon|Reassess|Sega/u);

    const omission = buildEditSummary(assessment, undefined, "");
    assert.match(omission, /Update shared assessment \(B-Class\): ACG/u);
    assert.doesNotMatch(omission, /Video games/u);
    assessment.otherProjects.acg = false;
    const sharedOnly = buildEditSummary(assessment);
    assert.match(sharedOnly, /^Update shared assessment \(B-Class\) /u);
    assert.doesNotMatch(sharedOnly, /Video games/u);
});

test("Stage retains the reviewed form without saving and clears prepared batch review", async () => {
    const state = createDialogState();
    let captured: DialogSaveReview | undefined;
    let closed = 0;
    const staging = createStaging({
        count: () => (captured == null ? 1 : 2),
        getReview: () => captured ?? null,
        async prepare() {
            return createPreparedBatch(state);
        },
        async stage(stagedState, review) {
            assert.equal(stagedState, state);
            captured = review;
        },
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {
            closed += 1;
        },
        runtime: { ...createRuntime(), staging },
        state,
    });
    const manual = `${originalSource}\n<!-- Reviewed exact source -->`;
    assert.equal(bindings.stageLabel.value, "Stage");
    bindings.onPreviewInput(manual);
    bindings.onSummaryInput("Reviewed talk summary");
    bindings.setListSummary("Reviewed list summary");
    bindings.setRegister(false);
    await bindings.onSave();
    assert.equal(bindings.stagedTalkReviews.value.length, 1);
    await bindings.onStage();

    assert.deepEqual(captured, {
        listSummary: "Reviewed list summary",
        previewText: manual,
        shouldRegister: false,
        summary: "Reviewed talk summary",
    });
    assert.equal(bindings.open.value, true);
    assert.equal(closed, 0);
    assert.equal(bindings.saving.value, false);
    assert.equal(bindings.stageLabel.value, "Unstage");
    assert.equal(bindings.submitLabel.value, "Submit (+1)");
    assert.equal(bindings.previewText.value, manual);
    assert.equal(bindings.summary.value, "Reviewed talk summary");
    assert.equal(bindings.listSummary.value, "Reviewed list summary");
    assert.equal(bindings.displayedListSummary.value, "Reviewed list summary");
    assert.equal(bindings.shouldRegister.value, false);
    assert.equal(bindings.stagedTalkReviews.value.length, 0);
    assert.equal(
        bindings.status.value,
        "Added to queue. You can submit it from any browser tab.",
    );
});

test("reopening a staged page restores review and excludes it from Submit count", () => {
    const savedReview: DialogSaveReview = {
        listSummary: "Exact restored list summary",
        previewText: `${originalSource}\n<!-- Restored manual source -->`,
        shouldRegister: false,
        summary: "Exact restored talk summary",
    };
    const staging = createStaging({
        count: () => 4,
        getReview: () => savedReview,
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {},
        runtime: { ...createRuntime(), staging },
        state: createDialogState(),
    });

    assert.equal(bindings.previewText.value, savedReview.previewText);
    assert.equal(bindings.summary.value, savedReview.summary);
    assert.equal(bindings.listSummary.value, savedReview.listSummary);
    assert.equal(bindings.shouldRegister.value, false);
    assert.equal(bindings.submitLabel.value, "Submit (+3)");
    assert.equal(bindings.stageLabel.value, "Unstage");
});

test("a pending Stage captures one reviewed draft and ignores a late result after Cancel", async () => {
    const state = createDialogState();
    const delayed = Promise.withResolvers<void>();
    let captured: DialogSaveReview | undefined;
    let calls = 0;
    let closed = 0;
    const observable = createObservableStaging({
        async stage(_state, review) {
            calls += 1;
            captured = review;
            await delayed.promise;
        },
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {
            closed += 1;
        },
        runtime: { ...createRuntime(), staging: observable.staging },
        state,
    });
    const manual = `${originalSource}\n<!-- Exact pending draft -->`;
    bindings.onPreviewInput(manual);
    bindings.onSummaryInput("Exact pending summary");
    const staging = bindings.onStage();
    assert.equal(bindings.preparing.value, true);
    await bindings.onStage();
    assert.equal(calls, 1);
    assert.equal(captured?.previewText, manual);
    assert.equal(captured?.summary, "Exact pending summary");
    bindings.onCancel();
    assert.equal(bindings.open.value, false);
    assert.equal(observable.subscriberCount(), 0);
    delayed.resolve();
    await staging;
    assert.equal(closed, 1);
    assert.doesNotMatch(bindings.status.value, /Added to queue/u);
});

test("Unstage removes only the current draft while retaining its editable review", async () => {
    const state = createDialogState();
    const stagedReview: DialogSaveReview = {
        listSummary: "Staged list summary",
        previewText: `${originalSource}\n<!-- Staged source -->`,
        shouldRegister: true,
        summary: "Staged talk summary",
    };
    const drafts = new Map([
        [state.talkTitle, stagedReview],
        ["Talk:Other game", stagedReview],
        ["Talk:Third game", stagedReview],
    ]);
    const removedTitles: string[] = [];
    let closed = 0;
    const staging = createStaging({
        count: () => drafts.size,
        getReview: (talkTitle) => drafts.get(talkTitle) ?? null,
        async prepare() {
            return createPreparedBatch(state);
        },
        async unstage(talkTitle) {
            removedTitles.push(talkTitle);
            drafts.delete(talkTitle);
        },
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {
            closed += 1;
        },
        runtime: { ...createRuntime(), staging },
        state,
    });
    const editedSource = `${originalSource}\n<!-- Edited current review -->`;
    bindings.onPreviewInput(editedSource);
    bindings.onSummaryInput("Edited current talk summary");
    bindings.setListSummary("Edited current list summary");
    bindings.setRegister(false);
    await bindings.onSave();
    assert.equal(bindings.stagedTalkReviews.value.length, 1);
    assert.equal(bindings.submitLabel.value, "Submit (+2)");

    await bindings.onStage();
    assert.deepEqual(removedTitles, [state.talkTitle]);
    assert.deepEqual(
        [...drafts.keys()],
        ["Talk:Other game", "Talk:Third game"],
    );
    assert.equal(bindings.stageLabel.value, "Stage");
    assert.equal(bindings.submitLabel.value, "Submit (+2)");
    assert.equal(bindings.open.value, true);
    assert.equal(closed, 0);
    assert.equal(bindings.previewText.value, editedSource);
    assert.equal(bindings.summary.value, "Edited current talk summary");
    assert.equal(bindings.listSummary.value, "Edited current list summary");
    assert.equal(
        bindings.displayedListSummary.value,
        "Edited current list summary",
    );
    assert.equal(bindings.shouldRegister.value, false);
    assert.equal(bindings.stagedTalkReviews.value.length, 0);
    assert.equal(bindings.status.value, "");
});

test("an Unstage storage failure keeps the draft and editable dialog available", async () => {
    const state = createDialogState();
    const stagedReview: DialogSaveReview = {
        listSummary: "Staged list summary",
        previewText: `${originalSource}\n<!-- Staged source -->`,
        shouldRegister: false,
        summary: "Staged talk summary",
    };
    let attempts = 0;
    let closed = 0;
    const staging = createStaging({
        count: () => 1,
        getReview: () => stagedReview,
        async unstage(talkTitle) {
            assert.equal(talkTitle, state.talkTitle);
            attempts += 1;
            throw new Error("Browser storage is unavailable.");
        },
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {
            closed += 1;
        },
        runtime: { ...createRuntime(), staging },
        state,
    });
    const editedSource = `${stagedReview.previewText}\n<!-- Unsaved edit -->`;
    bindings.onPreviewInput(editedSource);
    bindings.onSummaryInput("Edited current talk summary");
    bindings.setListSummary("Edited current list summary");
    await bindings.onStage();

    assert.equal(attempts, 1);
    assert.equal(staging.getReview(state.talkTitle), stagedReview);
    assert.equal(bindings.stageLabel.value, "Unstage");
    assert.equal(bindings.submitLabel.value, "Submit");
    assert.equal(bindings.open.value, true);
    assert.equal(closed, 0);
    assert.equal(bindings.previewText.value, editedSource);
    assert.equal(bindings.summary.value, "Edited current talk summary");
    assert.equal(bindings.listSummary.value, "Edited current list summary");
    assert.equal(bindings.shouldRegister.value, false);
    assert.equal(bindings.statusType.value, "error");
    assert.equal(bindings.status.value, "Browser storage is unavailable.");
});

test("Submit prepares combined review first and saves the exact plain batch on second click", async () => {
    const state = createDialogState();
    const batch = createPreparedBatch(state);
    let prepares = 0;
    let saves = 0;
    const staging = createStaging({
        count: () => 1,
        async prepare(preparedState, review) {
            prepares += 1;
            assert.equal(preparedState, state);
            assert.equal(review.previewText, bindings.previewText.value);
            return batch;
        },
        async save(api, savedBatch) {
            saves += 1;
            assert.equal(api, state.api);
            assert.equal(savedBatch, batch);
            assert.equal(isProxy(savedBatch), false);
            assert.equal(isProxy(savedBatch.entries), false);
            assert.equal(
                savedBatch.registrationSummary,
                "Combined reviewed summary",
            );
            throw new Error("Stop after batch capture.");
        },
    });
    const bindings = createAssessmentDialogBindings(
        {
            ...vue,
            computed,
            reactive: <T extends object>(value: T): T => reactive(value) as T,
            ref,
        },
        {
            currentNamespace: 0,
            onClose() {},
            runtime: { ...createRuntime(), staging },
            state,
        },
    );

    assert.equal(bindings.submitLabel.value, "Submit (+1)");
    await bindings.onSave();
    assert.equal(prepares, 1);
    assert.equal(saves, 0);
    assert.match(bindings.status.value, /Review the combined changes/u);
    assert.equal(bindings.stagedTalkReviews.value.length, 1);
    assert.equal(bindings.stagedTalkReviews.value[0]?.title, "Other game");
    assert.equal(
        bindings.stagedTalkReviews.value[0]?.previewText,
        "Other reviewed lead",
    );
    assert.equal(bindings.showListReview.value, true);
    assert.equal(bindings.listComparison.value.changed, true);
    assert.equal(bindings.displayedListSummary.value, "Combined list summary");

    bindings.setDisplayedListSummary("Combined reviewed summary");
    await bindings.onSave();
    assert.equal(prepares, 1);
    assert.equal(saves, 1);
    assert.equal(bindings.stagedTalkReviews.value.length, 0);
    assert.equal(bindings.saving.value, false);
    assert.match(bindings.status.value, /Stop after batch capture\./u);
});

test("changing reviewed inputs discards the prepared batch and requires review again", async () => {
    const state = createDialogState();
    let prepares = 0;
    const staging = createStaging({
        count: () => 1,
        async prepare() {
            prepares += 1;
            return createPreparedBatch(state);
        },
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {},
        runtime: { ...createRuntime(), staging },
        state,
    });
    const edits = [
        () => bindings.onSummaryInput("Changed talk summary"),
        () => bindings.setListSummary("Changed list summary"),
        () => bindings.onPreviewInput(`${originalSource}\n<!-- Changed -->`),
        () => bindings.setRegister(false),
        () => bindings.setClassName("B"),
    ];
    await bindings.onSave();
    for (const edit of edits) {
        assert.equal(bindings.stagedTalkReviews.value.length, 1);
        edit();
        assert.equal(bindings.stagedTalkReviews.value.length, 0);
        await bindings.onSave();
    }
    assert.equal(prepares, 6);
});

test("an external queue change refreshes actions and discards prepared review while preserving the form", async () => {
    const state = createDialogState();
    let count = 1;
    let currentReview: DialogSaveReview | null = null;
    let prepares = 0;
    const observable = createObservableStaging({
        count: () => count,
        getReview: () => currentReview,
        async prepare() {
            prepares += 1;
            return createPreparedBatch(state);
        },
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {},
        runtime: { ...createRuntime(), staging: observable.staging },
        state,
    });
    const manual = `${originalSource}\n<!-- Current editable review -->`;
    bindings.onPreviewInput(manual);
    bindings.onSummaryInput("Current talk summary");
    bindings.setListSummary("Current list summary");
    bindings.setRegister(false);
    await bindings.onSave();
    assert.equal(bindings.stagedTalkReviews.value.length, 1);
    assert.equal(bindings.displayedListSummary.value, "Combined list summary");

    count = 3;
    currentReview = {
        listSummary: "Other tab list summary",
        previewText: "Other tab reviewed source",
        shouldRegister: true,
        summary: "Other tab talk summary",
    };
    observable.notify();

    assert.equal(bindings.stageLabel.value, "Unstage");
    assert.equal(bindings.submitLabel.value, "Submit (+2)");
    assert.equal(bindings.stagedTalkReviews.value.length, 0);
    assert.equal(bindings.previewText.value, manual);
    assert.equal(bindings.summary.value, "Current talk summary");
    assert.equal(bindings.listSummary.value, "Current list summary");
    assert.equal(bindings.displayedListSummary.value, "Current list summary");
    assert.equal(bindings.shouldRegister.value, false);
    assert.match(bindings.status.value, /changed/u);
    await bindings.onSave();
    assert.equal(prepares, 2);
    assert.equal(bindings.stagedTalkReviews.value.length, 1);
});

test("an external queue change prevents an in-flight preparation from becoming saveable", async () => {
    const state = createDialogState();
    const delayed = Promise.withResolvers<PreparedAssessmentBatch>();
    let count = 1;
    let prepares = 0;
    const observable = createObservableStaging({
        count: () => count,
        async prepare() {
            prepares += 1;
            return prepares === 1
                ? delayed.promise
                : createPreparedBatch(state);
        },
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {},
        runtime: { ...createRuntime(), staging: observable.staging },
        state,
    });
    const manual = `${originalSource}\n<!-- Editable while preparing -->`;
    bindings.onPreviewInput(manual);
    const preparing = bindings.onSave();
    assert.equal(bindings.preparing.value, true);
    count = 2;
    observable.notify();
    delayed.resolve(createPreparedBatch(state));
    await preparing;

    assert.equal(bindings.preparing.value, false);
    assert.equal(bindings.stagedTalkReviews.value.length, 0);
    assert.equal(bindings.submitLabel.value, "Submit (+2)");
    assert.equal(bindings.previewText.value, manual);
    assert.match(bindings.status.value, /changed/u);
    await bindings.onSave();
    assert.equal(prepares, 2);
    assert.equal(bindings.stagedTalkReviews.value.length, 1);
});

test("queue notifications during submission do not discard the reviewed batch", async () => {
    const state = createDialogState();
    const delayed = Promise.withResolvers<void>();
    let count = 1;
    const observable = createObservableStaging({
        count: () => count,
        async prepare() {
            return createPreparedBatch(state);
        },
        async save() {
            count = 0;
            observable.notify();
            await delayed.promise;
            throw new Error("Stop after confirmed notification handling.");
        },
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {},
        runtime: { ...createRuntime(), staging: observable.staging },
        state,
    });
    await bindings.onSave();
    const saving = bindings.onSave();
    assert.equal(bindings.saving.value, true);
    assert.equal(bindings.stagedTalkReviews.value.length, 1);
    assert.equal(bindings.displayedListSummary.value, "Combined list summary");
    delayed.resolve();
    await saving;
    assert.equal(bindings.stagedTalkReviews.value.length, 0);
    assert.equal(bindings.saving.value, false);
});

test("Cancel and unmount release the queue subscription", () => {
    for (const dispose of ["cancel", "unmount"]) {
        let count = 1;
        let unmount: () => void = () => {
            throw new Error("Unmount cleanup has not been registered.");
        };
        const observable = createObservableStaging({ count: () => count });
        const bindings = createAssessmentDialogBindings(
            {
                ...vue,
                onUnmounted(callback) {
                    unmount = callback;
                },
            },
            {
                currentNamespace: 0,
                onClose() {},
                runtime: { ...createRuntime(), staging: observable.staging },
                state: createDialogState(),
            },
        );
        assert.equal(observable.subscriberCount(), 1);
        if (dispose === "cancel") {
            bindings.onCancel();
        } else {
            unmount();
        }
        assert.equal(observable.subscriberCount(), 0);
        count = 2;
        observable.notify();
        assert.equal(bindings.submitLabel.value, "Submit (+1)");
    }
});

test("a partial batch failure restores pending registration choice and remaining count", async () => {
    const state = createDialogState();
    let remainingReview: DialogSaveReview | null = null;
    const capturedReviews: DialogSaveReview[] = [];
    const staging = createStaging({
        count: () => 1,
        getReview: () => remainingReview,
        async prepare(_state, review) {
            capturedReviews.push(review);
            return createPreparedBatch(state);
        },
        async save() {
            remainingReview = {
                ...capturedReviews[0]!,
                shouldRegister: false,
            };
            throw new Error("Talk-page save failed.");
        },
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {},
        runtime: { ...createRuntime(), staging },
        state,
    });

    await bindings.onSave();
    await bindings.onSave();
    assert.equal(bindings.shouldRegister.value, false);
    assert.equal(bindings.submitLabel.value, "Submit");
    assert.equal(bindings.showListReview.value, false);
    assert.equal(bindings.stagedTalkReviews.value.length, 0);
    assert.match(bindings.status.value, /Remaining staged pages: 1/u);
    assert.match(bindings.status.value, /Talk-page save failed\./u);

    await bindings.onSave();
    assert.equal(capturedReviews.length, 2);
    assert.equal(capturedReviews[1]?.shouldRegister, false);
});

test("Cancel discards a delayed preparation result", async () => {
    const state = createDialogState();
    let resolvePreparation: (batch: PreparedAssessmentBatch) => void = () => {
        throw new Error("Preparation has not started.");
    };
    let closed = 0;
    const staging = createStaging({
        count: () => 1,
        prepare() {
            return new Promise((resolve) => {
                resolvePreparation = resolve;
            });
        },
    });
    const bindings = createAssessmentDialogBindings(vue, {
        currentNamespace: 0,
        onClose() {
            closed += 1;
        },
        runtime: { ...createRuntime(), staging },
        state,
    });

    const preparing = bindings.onSave();
    bindings.onCancel();
    resolvePreparation(createPreparedBatch(state));
    await preparing;
    assert.equal(closed, 1);
    assert.equal(bindings.open.value, false);
    assert.equal(bindings.stagedTalkReviews.value.length, 0);
    assert.doesNotMatch(bindings.status.value, /Review the combined changes/u);
});

function createObservableStaging(
    overrides: Partial<AssessmentStagingWorkflow>,
) {
    const listeners = new Set<() => void>();
    return {
        staging: createStaging({
            ...overrides,
            subscribe(listener) {
                listeners.add(listener);
                return () => {
                    listeners.delete(listener);
                };
            },
        }),
        notify() {
            for (const listener of listeners) listener();
        },
        subscriberCount: () => listeners.size,
    };
}

function createStaging(
    overrides: Partial<AssessmentStagingWorkflow>,
): AssessmentStagingWorkflow {
    return {
        count: () => 0,
        getReview: () => null,
        subscribe: () => () => {},
        async stage() {
            throw new Error("Unexpected staging call.");
        },
        async unstage() {
            throw new Error("Unexpected unstaging call.");
        },
        async prepare() {
            throw new Error("Unexpected preparation call.");
        },
        async save() {
            throw new Error("Unexpected batch save.");
        },
        ...overrides,
    };
}

function createPreparedBatch(state: DialogState): PreparedAssessmentBatch {
    const stagedState: Omit<DialogState, "api"> = state;
    const review: DialogSaveReview = {
        listSummary: "Reviewed list summary",
        previewText: originalSource,
        shouldRegister: true,
        summary: "Reviewed talk summary",
    };
    return {
        draftSnapshot: "reviewed-drafts",
        entries: [
            {
                review,
                state: stagedState,
            },
            {
                review: {
                    ...review,
                    previewText: "Other reviewed lead",
                    summary: "Other reviewed summary",
                },
                state: {
                    ...stagedState,
                    subjectTitle: "Other game",
                    talkTitle: "Talk:Other game",
                },
            },
        ],
        registration: {
            proposedText: "Combined list",
            snapshot: state.newPageList,
        },
        registrationSummary: "Combined list summary",
    };
}

function createRuntime(
    saveReviewedDialog: PageAssessorRuntime["saveReviewedDialog"] = async () =>
        "unchanged",
): PageAssessorRuntime {
    return {
        createDialogPageContext() {
            throw new Error("Bindings do not acquire page context.");
        },
        async loadDialogState() {
            throw new Error("Bindings do not load pages.");
        },
        logger: createLogger("assessment-dialog-test", { level: "silent" }),
        notify() {},
        saveReviewedDialog,
    };
}

function createDialogState(): DialogState {
    return {
        api: {} as mw.Api,
        assessment: createDefaultAssessment(projectConfig, originalSource),
        creationTimes: new Map(),
        newPageList: {
            basetimestamp: "2026-09-30T23:00:00Z",
            starttimestamp: "2026-10-01T00:00:00Z",
            text: "old list",
        },
        page: {
            exists: true,
            starttimestamp: "2026-10-01T00:00:00Z",
            text: originalSource,
        },
        previewDirty: false,
        registration: {
            alreadyRegistered: false,
            changed: true,
            earliestDate: new Date("2026-09-30T00:00:00Z"),
            eligible: true,
            existing: null,
            proposedText: "updated list",
        },
        subjectInfo: {
            creationDate: new Date("2026-09-30T00:00:00Z"),
            isRedirect: false,
            listedTitle: "Example game",
            namespaceNumber: 0,
            targetTitle: "Example game",
        },
        subjectTitle: "Example game",
        summaryDirty: false,
        talkTitle: "Talk:Example game",
    };
}
