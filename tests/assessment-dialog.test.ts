/** Assessment controls retain shared class while video-game scope is disabled. */

import assert from "node:assert/strict";
import test from "node:test";

import type {
    DialogSaveReview,
    DialogState,
    PageAssessorRuntime,
} from "../src/app/dialog-contracts.ts";
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
