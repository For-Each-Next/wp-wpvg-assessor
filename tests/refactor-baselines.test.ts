/** Edge cases for assessment parsing and the registration save boundary. */

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
    buildAssessmentBanners as buildBanners,
    createDefaultAssessment,
    parseAssessment,
    updateTalkPageAssessment,
} from "../src/domain/assessment.ts";
import * as newPageList from "../src/domain/new-page-list.ts";
import * as dialogSave from "../src/app/save-dialog.ts";

const logger = createLogger("vg-page-assessor-test", { level: "silent" });
const buildRegistrationSummary = (title: string) => `Register ${title}`;

test("collapses duplicate banners and preserves nested source", () => {
    const source = [
        "{{WikiProject banner shell|class=B|1=",
        "{{WikiProject Role-playing games|note={{Nested|x=y}}}}",
        "{{WikiProject Video games|importance=Low|Sega=yes}}",
        "{{WikiProject Video games|importance=Top|Pokemon=yes}}",
        "}}",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig, source);

    assert.deepEqual(parseAssessment(projectConfig, source), assessment);
    assert.equal(
        updateTalkPageAssessment(source, assessment, projectConfig),
        [
            "{{WikiProject banner shell|class=B|1=",
            "{{WikiProject Role-playing games|note={{Nested|x=y}}}}",
            "{{WikiProject Video games|importance=Low|Sega=yes}}",
            "}}",
        ].join("\n"),
    );
});

test("treats an unclosed assessment shell as opaque source", () => {
    const source = [
        "{{WikiProject banner shell|class=C|1=",
        "{{WikiProject Video games|importance=High}",
        "== Discussion ==",
        "Body",
    ].join("\n");
    const assessment = createDefaultAssessment(projectConfig, source);
    const banners = buildBanners(assessment, projectConfig, source);

    assert.equal(parseAssessment(projectConfig, source), null);
    assert.equal(
        updateTalkPageAssessment(source, assessment, projectConfig),
        `${banners}\n\n${source}`,
    );
});

test("updates registration without rewriting opaque neighbors", () => {
    const source = [
        "Intro",
        "== 2026年 ==",
        "* 7月29日 - {{vgc|Existing}}",
        "*:未識別：{{vgc|Opaque}}",
        "<!-- malformed {{vgc|Do not parse -->",
        "",
    ].join("\n");
    const result = newPageList.prepareNewPageListRegistration({
        creationDate: new Date("2026-07-29T12:00:00Z"),
        namespaceNumber: 0,
        text: source,
        title: "New",
    });

    assert.equal(result.changed, true);
    assert.equal(
        result.proposedText,
        source.replace(
            "* 7月29日 - {{vgc|Existing}}",
            "* 7月29日 - {{vgc|Existing}}、{{vgc|New}}",
        ),
    );
});

test("a registration failure prevents the talk-page write", async () => {
    const trace: string[] = [];
    const save = dialogSave.createReviewedDialogSaveWorkflow(
        {
            buildRegistrationSummary,
            getRegistrationSave: createRegistrationSave,
            logger,
            async saveRegistration() {
                trace.push("registration");
                throw new Error("registration rejected");
            },
            async saveTalkAssessment() {
                trace.push("talk-page");
                return "";
            },
        },
        projectConfig,
    );

    await assert.rejects(
        save(createDialogState(), createReview(), (phase) => {
            trace.push(`phase:${phase}`);
        }),
        /registration rejected/u,
    );
    assert.deepEqual(trace, ["phase:registration", "registration"]);
});

test("talk failure exposes the completed registration boundary", async () => {
    const trace: string[] = [];
    const save = dialogSave.createReviewedDialogSaveWorkflow(
        {
            buildRegistrationSummary,
            getRegistrationSave: createRegistrationSave,
            logger,
            async saveRegistration() {
                trace.push("registration");
            },
            async saveTalkAssessment() {
                trace.push("talk-page");
                throw new Error("talk rejected");
            },
        },
        projectConfig,
    );

    await assert.rejects(
        save(createDialogState(), createReview(), (phase) => {
            trace.push(`phase:${phase}`);
        }),
        /talk rejected/u,
    );
    assert.deepEqual(trace, [
        "phase:registration",
        "registration",
        "phase:talk-page",
        "talk-page",
    ]);
});

function createReview(): DialogSaveReview {
    return {
        listSummary: "Reviewed list summary",
        previewText:
            "{{WikiProject banner shell|class=B|1=\n{{WikiProject Video games|importance=Low}}\n}}",
        shouldRegister: true,
        summary: "Reviewed talk summary",
    };
}

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

function createDialogState(): DialogState {
    return {
        api: {} as mw.Api,
        assessment: createDefaultAssessment(projectConfig),
        creationTimes: new Map(),
        newPageList: createRegistrationSave().snapshot,
        page: {
            exists: true,
            starttimestamp: "2026-07-29T00:00:00Z",
            text: "{{Old banner}}\n\n== Discussion ==\nBody",
        },
        previewDirty: false,
        registration: {
            alreadyRegistered: false,
            changed: true,
            earliestDate: new Date("2026-07-29T00:00:00Z"),
            eligible: true,
            existing: null,
            proposedText: "updated list",
        },
        subjectInfo: {
            creationDate: new Date("2026-07-29T00:00:00Z"),
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
