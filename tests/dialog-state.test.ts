/**
 * Characterizes fully prepared initial dialog state.
 */

import assert from "node:assert/strict";
import test from "node:test";

import projectConfig from "../src/domain/project-config.ts";
import { NOT_VIDEO_GAME_IMPORTANCE } from "../src/domain/types.ts";
import {
    createDialogWorkflow,
    type DialogWorkflowAdapters,
} from "../src/app/dialog-state.ts";

test("prepares registration before returning dialog state", async () => {
    const requestedCreationTitles: Array<string> = [];
    const workflow = createDialogWorkflow(
        createAdapters(requestedCreationTitles),
        projectConfig,
    );
    const state = await workflow.loadDialogState({} as mw.Api, {} as mw.Title);

    assert.deepEqual(requestedCreationTitles, ["Example"]);
    assert.equal(state.newPageList.text.includes("2026年"), true);
    assert.equal(state.registration.changed, true);
    assert.equal(state.registration.eligible, true);
    assert.match(
        state.registration.proposedText,
        /\{\{vgc\|Example\}\}\{\{Dykico\}\}/u,
    );
    assert.equal("registrationLoading" in state, false);
});

test("a non-video-game selection cannot produce a registration save", async () => {
    const workflow = createDialogWorkflow(createAdapters([]), projectConfig);
    const state = await workflow.loadDialogState({} as mw.Api, {} as mw.Title);
    state.assessment.importance = NOT_VIDEO_GAME_IMPORTANCE;

    assert.equal(workflow.getRegistrationSave(state), null);

    state.assessment.importance = "Low";
    assert.deepEqual(workflow.getRegistrationSave(state), {
        proposedText: state.registration.proposedText,
        snapshot: state.newPageList,
    });
});

function createAdapters(
    requestedCreationTitles: Array<string>,
): DialogWorkflowAdapters {
    return {
        async fetchAssessmentPages() {
            return createAssessmentPages();
        },
        async fetchPageCreationTimes(_api, titles) {
            requestedCreationTitles.push(...titles);
            return new Map();
        },
        async fetchSubjectPageInfo() {
            return {
                creationDate: new Date("2026-04-07T00:00:00Z"),
                isRedirect: false,
                listedTitle: "Example",
                namespaceNumber: 0,
                targetTitle: "Example",
            };
        },
        getSubjectPageTitle() {
            return "Example";
        },
        getTalkPageTitle() {
            return "Talk:Example";
        },
        async savePreparedNewPageList() {},
    };
}

function createAssessmentPages() {
    return {
        newPageList: {
            basetimestamp: "log-base",
            starttimestamp: "query-time",
            text: "== 2026年 ==\n* 4月1日 - {{vgc|Old}}\n",
        },
        talkPage: {
            basetimestamp: "talk-base",
            exists: true,
            starttimestamp: "query-time",
            text: [
                "{{DYK Invite}}",
                "{{WikiProject Video games|importance=Low}}",
            ].join("\n"),
        },
    };
}
