/**
 * @file tests/assessment-state.test.ts
 * Purpose: Offline checks for assessment-only loading and namespace targeting.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. Test scenarios
 * 4. createOperations
 * 5. createTitle
 * 6. createPage
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    createAssessmentStateLoader,
    type AssessmentStateLoaderOperations,
} from "../src/app/assessment-state.ts";
import projectConfig from "../src/domain/project-config.ts";
import type { PageSnapshot } from "../src/domain/types.ts";

const api = {} as mw.Api;
const lead = [
    "<!-- Retain leading comments -->",
    "{{WikiProject banner shell|class=C|1=",
    "{{WikiProject Video games|importance=High|Pokemon=yes}}",
    "{{ACG專題|custom={{Keep|x=y}}}}",
    "}}",
].join("\n");

test("loads only the associated talk page from either article or talk members", async () => {
    for (const namespace of [0, 1]) {
        const reads: Array<{ api: mw.Api; title: string }> = [];
        const page = createPage();
        const load = createAssessmentStateLoader(
            createOperations(async (receivedApi, title) => {
                reads.push({ api: receivedApi, title });
                return page;
            }),
            projectConfig,
        );
        const state = await load(api, createTitle(namespace));

        assert.deepEqual(reads, [{ api, title: "Talk:Example" }]);
        assert.equal(state.api, api);
        assert.equal(state.subjectTitle, "Example");
        assert.equal(state.talkTitle, "Talk:Example");
        assert.equal(state.page, page);
        assert.equal(state.assessment.className, "C");
        assert.equal(state.assessment.importance, "High");
        assert.equal(state.assessment.taskForces.pokemon, true);
        assert.equal(state.assessment.otherProjects.acg, true);
        assert.equal(
            state.page.text,
            `${lead}\n\n== Discussion ==\nKeep the body.`,
        );
        assert.equal(state.previewDirty, false);
        assert.equal(state.summaryDirty, false);
        assert.deepEqual(Object.keys(state).sort(), [
            "api",
            "assessment",
            "page",
            "previewDirty",
            "subjectTitle",
            "summaryDirty",
            "talkTitle",
        ]);
    }
});

test("keeps custom assessment values and all readable talk source", async () => {
    const text =
        "{{WPBS|class=Future|1={{WPVG|importance=Critical|custom=Keep}}}}\n\n== Discussion ==\nBody";
    const load = createAssessmentStateLoader(
        createOperations(async () => ({ ...createPage(), text })),
        projectConfig,
    );
    const state = await load(api, createTitle(1));
    assert.equal(state.assessment.className, "Future");
    assert.equal(state.assessment.importance, "Critical");
    assert.equal(state.page.text, text);
});

test("a missing talk page loads defaults without requesting other pages", async () => {
    let reads = 0;
    const load = createAssessmentStateLoader(
        createOperations(async () => {
            reads += 1;
            return { exists: false, starttimestamp: "query-time", text: "" };
        }),
        projectConfig,
    );
    const state = await load(api, createTitle(0));
    assert.equal(reads, 1);
    assert.equal(state.page.exists, false);
    assert.equal(state.assessment.className, "Unassessed");
    assert.equal(state.assessment.importance, "");
});

test("a failed talk read propagates without further loading", async () => {
    const error = new Error("Talk source unavailable");
    let reads = 0;
    const load = createAssessmentStateLoader(
        createOperations(async () => {
            reads += 1;
            throw error;
        }),
        projectConfig,
    );
    await assert.rejects(
        load(api, createTitle(1)),
        (caught) => caught === error,
    );
    assert.equal(reads, 1);
});

function createOperations(
    fetchPageText: AssessmentStateLoaderOperations["fetchPageText"],
): AssessmentStateLoaderOperations {
    return {
        fetchPageText,
        getSubjectPageTitle: (title) => title.getMainText(),
        getTalkPageTitle: (title) =>
            title.getNamespaceId() === 1
                ? title.getPrefixedText()
                : `Talk:${title.getMainText()}`,
    };
}

function createTitle(namespace: number): mw.Title {
    return {
        getNamespaceId: () => namespace,
        getMainText: () => "Example",
        getPrefixedText: () => (namespace === 1 ? "Talk:Example" : "Example"),
    } as mw.Title;
}

function createPage(): PageSnapshot {
    return {
        basetimestamp: "talk-base",
        exists: true,
        starttimestamp: "query-time",
        text: `${lead}\n\n== Discussion ==\nKeep the body.`,
    };
}
