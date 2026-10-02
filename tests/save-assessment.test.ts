/**
 * @file tests/save-assessment.test.ts
 * Purpose: Offline checks for exact assessment-only saves and unchanged reviews.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. Test scenarios
 * 4. createState
 */

import assert from "node:assert/strict";
import test from "node:test";

import type {
    AssessmentSaveReview,
    AssessmentState,
} from "../src/app/assessment-contracts.ts";
import { createReviewedAssessmentSaveWorkflow } from "../src/app/save-assessment.ts";
import {
    createDefaultAssessment,
    getTalkPageTopSection,
} from "../src/domain/assessment.ts";
import projectConfig from "../src/domain/project-config.ts";
import type { PreparedTalkEdit } from "../src/domain/types.ts";
import { createLogger } from "../src/shared/logging.ts";

const logger = createLogger("save-assessment-test", { level: "silent" });
const api = {} as mw.Api;

test("writes the exact reviewed talk lead and summary to the resolved talk title", async () => {
    const writes: Array<{ api: mw.Api; edit: PreparedTalkEdit }> = [];
    const save = createReviewedAssessmentSaveWorkflow({
        logger,
        async saveTalkAssessment(receivedApi, edit) {
            writes.push({ api: receivedApi, edit });
            return "confirmed saved talk source";
        },
    });
    const state = createState();
    const review: AssessmentSaveReview = {
        previewText:
            "  {{WPBS|class=B|1={{WPVG|importance=Low}}}}\n<!-- Reviewed exactly -->\n\n\n",
        summary: "  Reviewed summary with retained spaces  ",
    };
    assert.equal(await save(state, review), "saved");
    assert.deepEqual(writes, [
        {
            api,
            edit: {
                title: "Talk:Example",
                topSection: review.previewText,
                summary: review.summary,
            },
        },
    ]);
});

test("an unchanged reviewed lead performs no write", async () => {
    let writes = 0;
    const save = createReviewedAssessmentSaveWorkflow({
        logger,
        async saveTalkAssessment() {
            writes += 1;
            return "";
        },
    });
    const state = createState();
    assert.equal(
        await save(state, {
            previewText: getTalkPageTopSection(state.page.text),
            summary: "Unused summary",
        }),
        "unchanged",
    );
    assert.equal(writes, 0);
});

test("adding only an empty importance parameter performs no write", async () => {
    let writes = 0;
    const save = createReviewedAssessmentSaveWorkflow({
        logger,
        async saveTalkAssessment() {
            writes += 1;
            return "";
        },
    });
    const state = createState();
    state.page.text = "{{WPBS|class=B|1={{WPVG}}}}\n\n== Discussion ==\nBody";
    assert.equal(
        await save(state, {
            previewText: "{{WPBS|class=B|1={{WPVG|importance=}}}}\n\n",
            summary: "Unused summary",
        }),
        "unchanged",
    );
    assert.equal(writes, 0);
});

test("an empty summary uses the established fallback summary", async () => {
    let summary = "";
    const save = createReviewedAssessmentSaveWorkflow({
        logger,
        async saveTalkAssessment(_api, edit) {
            summary = edit.summary;
            return "";
        },
    });
    assert.equal(
        await save(createState(), {
            previewText: "{{WPBS|class=C|1={{WPVG|importance=Low}}}}",
            summary: "",
        }),
        "saved",
    );
    assert.equal(
        summary,
        "Tag project banners [[:m:User:For Each ... Next/global.js/vg page assessor.js|🍄]]",
    );
});

test("talk-save failures propagate without another save attempt", async () => {
    const error = { code: "timeout", message: "Uncertain edit outcome" };
    let writes = 0;
    const save = createReviewedAssessmentSaveWorkflow({
        logger,
        async saveTalkAssessment() {
            writes += 1;
            throw error;
        },
    });
    await assert.rejects(
        save(createState(), {
            previewText: "{{WPBS|class=B|1={{WPVG|importance=Low}}}}",
            summary: "Reviewed change",
        }),
        (caught) => caught === error,
    );
    assert.equal(writes, 1);
});

function createState(): AssessmentState {
    const text =
        "{{WPBS|class=Unassessed|1={{WPVG|importance=Low}}}}\n\n== Discussion ==\nKeep body.";
    return {
        api,
        assessment: createDefaultAssessment(projectConfig, text),
        page: { exists: true, starttimestamp: "talk-start", text },
        previewDirty: false,
        subjectTitle: "Example",
        summaryDirty: false,
        talkTitle: "Talk:Example",
    };
}
