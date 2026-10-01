/**
 * Characterizes the reviewed-dialog save transaction.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createLogger } from "../src/shared/logging.ts";
import projectConfig from "../src/domain/project-config.ts";

import type {
    DialogSaveReview,
    DialogState,
    RegistrationSave,
} from "../src/app/dialog-contracts.ts";
import {
    NOT_VIDEO_GAME_IMPORTANCE,
    type PreparedTalkEdit,
} from "../src/domain/types.ts";
import * as dialogSave from "../src/app/save-dialog.ts";

const logger = createLogger("vg-page-assessor-test", { level: "silent" });
const buildRegistrationSummary = (title: string) => `Register ${title}`;

test("sequences registration before the reviewed talk source", async () => {
    const state = createDialogState("{{Old banner}}");
    const registration = createRegistrationSave();
    const phases: Array<string> = [];
    const writes: Array<string> = [];
    const savedTalkEdits: Array<PreparedTalkEdit> = [];
    const save = dialogSave.createReviewedDialogSaveWorkflow(
        {
            buildRegistrationSummary,
            getRegistrationSave() {
                return registration;
            },
            logger,
            async saveRegistration(_api, value, summary) {
                assert.equal(value, registration);
                assert.match(summary, /Example game/u);
                writes.push("registration");
            },
            async saveTalkAssessment(_api, edit) {
                savedTalkEdits.push(edit);
                writes.push("talk-page");
                return edit.topSection;
            },
        },
        projectConfig,
    );
    const review: DialogSaveReview = {
        listSummary: "",
        previewText: "  {{WikiProject Video games|importance=High}}\n",
        shouldRegister: true,
        summary: "",
    };

    const outcome = await save(state, review, function report(phase) {
        phases.push(phase);
    });

    assert.equal(outcome, "saved");
    assert.deepEqual(writes, ["registration", "talk-page"]);
    assert.deepEqual(phases, ["registration", "talk-page"]);
    assert.equal(savedTalkEdits[0]?.topSection, review.previewText);
    assert.match(savedTalkEdits[0]?.summary ?? "", /vg page assessor\.js/u);
});

test("registers before skipping an empty-importance-only edit", async () => {
    const state = createDialogState("{{WikiProject Video games|importance=}}");
    const phases: Array<string> = [];
    let registrationWrites = 0;
    let talkWrites = 0;
    const save = dialogSave.createReviewedDialogSaveWorkflow(
        {
            buildRegistrationSummary,
            getRegistrationSave: createRegistrationSave,
            logger,
            async saveRegistration() {
                registrationWrites += 1;
            },
            async saveTalkAssessment() {
                talkWrites += 1;
                return "";
            },
        },
        projectConfig,
    );

    const outcome = await save(
        state,
        {
            listSummary: "Reviewed list summary",
            previewText: "{{WikiProject Video games}}",
            shouldRegister: true,
            summary: "Reviewed talk summary",
        },
        function report(phase) {
            phases.push(phase);
        },
    );

    assert.equal(outcome, "saved");
    assert.equal(registrationWrites, 1);
    assert.equal(talkWrites, 0);
    assert.deepEqual(phases, ["registration"]);
});

test("an unchanged reviewed lead without registration produces no writes", async () => {
    const save = dialogSave.createReviewedDialogSaveWorkflow(
        {
            buildRegistrationSummary,
            getRegistrationSave: createRegistrationSave,
            logger,
            async saveRegistration() {
                assert.fail("An unselected registration must not be written.");
            },
            async saveTalkAssessment() {
                assert.fail("An unchanged assessment must not be written.");
                return "";
            },
        },
        projectConfig,
    );
    const outcome = await save(
        createDialogState("{{WikiProject Video games|importance=}}"),
        {
            listSummary: "Reviewed list summary",
            previewText: "{{WikiProject Video games}}",
            shouldRegister: false,
            summary: "Reviewed talk summary",
        },
        () =>
            assert.fail("No save phase must start when neither page changes."),
    );
    assert.equal(outcome, "unchanged");
});

test("a non-video-game selection suppresses a stale registration request", async () => {
    const state = createDialogState(
        "{{WikiProject Video games|importance=Low}}",
    );
    state.assessment.importance = NOT_VIDEO_GAME_IMPORTANCE;
    const reviewedLead =
        "  {{WPBS|class=B|1=\n{{WikiProject Anime and manga}}\n}}\n";
    const savedTalkEdits: Array<PreparedTalkEdit> = [];
    const phases: Array<string> = [];
    const save = dialogSave.createReviewedDialogSaveWorkflow(
        {
            buildRegistrationSummary,
            getRegistrationSave() {
                assert.fail(
                    "Non-video-game assessments must not prepare a list write.",
                );
            },
            logger,
            async saveRegistration() {
                assert.fail("Non-video-game assessments must not register.");
            },
            async saveTalkAssessment(_api, edit) {
                savedTalkEdits.push(edit);
                return edit.topSection;
            },
        },
        projectConfig,
    );

    const outcome = await save(
        state,
        {
            listSummary: "Stale list summary",
            previewText: reviewedLead,
            shouldRegister: true,
            summary: "Reviewed shared class and ACG summary",
        },
        function report(phase) {
            phases.push(phase);
        },
    );

    assert.equal(outcome, "saved");
    assert.deepEqual(phases, ["talk-page"]);
    assert.deepEqual(savedTalkEdits, [
        {
            summary: "Reviewed shared class and ACG summary",
            title: "Talk:Example game",
            topSection: reviewedLead,
        },
    ]);
});

for (const reviewedLead of [
    "{{WPBS|class=GA|1=\n{{WikiProject Anime and manga}}\n}}",
    "{{WikiProject Anime and manga}}",
    "",
]) {
    test(`manual source without a VG banner cannot register: ${JSON.stringify(reviewedLead)}`, async () => {
        const state = createDialogState(
            "{{WikiProject Video games|importance=Low}}",
        );
        const savedTalkEdits: Array<PreparedTalkEdit> = [];
        const phases: Array<string> = [];
        const save = dialogSave.createReviewedDialogSaveWorkflow(
            {
                buildRegistrationSummary,
                getRegistrationSave() {
                    assert.fail(
                        "A reviewed lead without a VG banner must not prepare a list write.",
                    );
                },
                logger,
                async saveRegistration() {
                    assert.fail(
                        "A reviewed lead without a VG banner must not register.",
                    );
                },
                async saveTalkAssessment(_api, edit) {
                    savedTalkEdits.push(edit);
                    return edit.topSection;
                },
            },
            projectConfig,
        );

        const outcome = await save(
            state,
            {
                listSummary: "Stale list summary",
                previewText: reviewedLead,
                shouldRegister: true,
                summary: "Reviewed banner removal",
            },
            function report(phase) {
                phases.push(phase);
            },
        );

        assert.equal(outcome, "saved");
        assert.deepEqual(phases, ["talk-page"]);
        assert.deepEqual(savedTalkEdits, [
            {
                summary: "Reviewed banner removal",
                title: "Talk:Example game",
                topSection: reviewedLead,
            },
        ]);
    });
}

test("a non-video-game empty-importance-only review suppresses stale registration without writes", async () => {
    const reviewedLead =
        "{{WPBS|class=B|1=\n{{WikiProject Anime and manga}}\n}}";
    const state = createDialogState(
        reviewedLead.replace(
            "{{WikiProject Anime and manga}}",
            "{{WikiProject Anime and manga|importance=}}",
        ),
    );
    state.assessment.importance = NOT_VIDEO_GAME_IMPORTANCE;
    const save = dialogSave.createReviewedDialogSaveWorkflow(
        {
            buildRegistrationSummary,
            getRegistrationSave: createRegistrationSave,
            logger,
            async saveRegistration() {
                assert.fail("Non-video-game assessments must not register.");
            },
            async saveTalkAssessment() {
                assert.fail("An unchanged assessment must not be written.");
                return "";
            },
        },
        projectConfig,
    );

    const outcome = await save(
        state,
        {
            listSummary: "Stale list summary",
            previewText: reviewedLead,
            shouldRegister: true,
            summary: "Reviewed unchanged lead",
        },
        () =>
            assert.fail("No save phase must start when neither page changes."),
    );

    assert.equal(outcome, "unchanged");
});

function createRegistrationSave(): RegistrationSave {
    return {
        proposedText: "updated list",
        snapshot: {
            basetimestamp: "2026-07-29T00:00:00Z",
            starttimestamp: "2026-07-29T00:00:01Z",
            text: "old list",
        },
    };
}

function createDialogState(topSection: string): DialogState {
    return {
        api: {} as mw.Api,
        assessment: createAssessment(),
        creationTimes: new Map(),
        newPageList: createRegistrationSave().snapshot,
        page: {
            exists: true,
            starttimestamp: "2026-07-29T00:00:00Z",
            text: `${topSection}\n\n== Discussion ==\nBody`,
        },
        previewDirty: false,
        registration: createRegistrationResult(),
        subjectInfo: createSubjectInfo(),
        subjectTitle: "Example game",
        summaryDirty: false,
        talkTitle: "Talk:Example game",
    };
}

function createAssessment(): DialogState["assessment"] {
    return {
        className: "Unassessed",
        importance: "",
        maintenance: {
            cover: false,
            needsInfobox: false,
            reassess: false,
            screenshot: false,
        },
        otherProjects: {},
        taskForces: {},
    };
}

function createRegistrationResult(): NonNullable<DialogState["registration"]> {
    return {
        alreadyRegistered: false,
        changed: true,
        earliestDate: new Date("2026-07-29T00:00:00Z"),
        eligible: true,
        existing: null,
        proposedText: "updated list",
    };
}

function createSubjectInfo(): DialogState["subjectInfo"] {
    return {
        creationDate: new Date("2026-07-29T00:00:00Z"),
        isRedirect: false,
        listedTitle: "Example game",
        namespaceNumber: 0,
        targetTitle: "Example game",
    };
}
