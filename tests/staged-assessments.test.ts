/** Offline tests for retained reviewed drafts and one registration transaction. */

import assert from "node:assert/strict";
import test from "node:test";
import { reactive, ref } from "vue";

import {
    createAssessmentStagingWorkflow,
    createCachedDialogLoader,
} from "../src/app/staged-assessments.ts";
import type {
    DialogSaveReview,
    DialogState,
    RegistrationSave,
} from "../src/app/dialog-contracts.ts";
import type {
    AssessmentSessionData,
    AssessmentSessionStore,
} from "../src/app/staging-contracts.ts";
import projectConfig from "../src/domain/project-config.ts";
import { createDefaultAssessment } from "../src/domain/assessment.ts";
import { prepareNewPageListRegistration } from "../src/domain/new-page-list.ts";
import {
    NOT_VIDEO_GAME_IMPORTANCE,
    type NewPageListSnapshot,
} from "../src/domain/types.ts";
import { createLogger } from "../src/shared/logging.ts";

const logger = createLogger("staging-test", { level: "silent" });
const api = {} as mw.Api;
const originalList =
    "== 2026年 ==\n* 9月30日 - {{vgc|Earlier game}}\n* 9月29日 - 無新條目\n";

test("staging retains exact reviewed source and replaces the same talk page without writes", () => {
    const fixture = createFixture();
    const state = createState("First game");
    const firstReview = createReview("First game");
    fixture.workflow.stage(state, firstReview);
    state.assessment.className = "FA";
    firstReview.previewText = "Later unreviewed changes";
    assert.equal(fixture.workflow.count(), 1);
    assert.deepEqual(
        fixture.workflow.getReview(state.talkTitle),
        createReview("First game"),
    );
    const replacement = createReview("First game", false);
    replacement.previewText += "\n<!-- Replacement reviewed verbatim -->";
    fixture.workflow.stage(createState("First game"), replacement);
    fixture.workflow.stage(
        createState("Second game"),
        createReview("Second game"),
    );
    assert.equal(fixture.workflow.count(), 2);
    assert.equal(
        fixture.session
            .read()
            .drafts.filter(
                (draft) => draft.state.talkTitle === "Talk:First game",
            ).length,
        1,
    );
    assert.deepEqual(
        fixture.workflow.getReview("Talk:First game"),
        replacement,
    );
    const returnedReview = fixture.workflow.getReview("Talk:First game")!;
    returnedReview.summary = "Mutated caller copy";
    assert.equal(
        fixture.workflow.getReview("Talk:First game")?.summary,
        replacement.summary,
    );
    assert.deepEqual(fixture.writes, []);
});

test("unstaging removes only the requested page, restores its loaded snapshot, and invalidates a reviewed batch", async () => {
    const fixture = createFixture();
    const first = createState("First game");
    const loadedSession = fixture.session.read();
    loadedSession.newPageList = first.newPageList;
    fixture.session.write(loadedSession);
    first.assessment.className = "B";
    first.previewDirty = true;
    first.summaryDirty = true;
    fixture.workflow.stage(first, createReview("First game"));
    const secondReview = createReview("Second game");
    fixture.workflow.stage(createState("Second game"), secondReview);
    const prepared = await fixture.workflow.prepare(
        createState("Third game"),
        createReview("Third game"),
    );

    fixture.workflow.unstage(first.talkTitle);
    assert.equal(fixture.workflow.count(), 1);
    assert.equal(fixture.workflow.getReview(first.talkTitle), null);
    assert.deepEqual(
        fixture.workflow.getReview("Talk:Second game"),
        secondReview,
    );
    await assert.rejects(
        fixture.workflow.save(api, prepared, () => undefined),
        /staged pages changed/u,
    );
    assert.deepEqual(fixture.writes, []);

    const loader = createCachedDialogLoader({
        session: fixture.session,
        getTalkPageTitle: () => first.talkTitle,
        async loadDialogState() {
            throw new Error(
                "Unstaging must preserve the loaded wiki snapshot.",
            );
        },
        logger,
    });
    const reopened = await loader.load(api, {} as mw.Title);
    assert.equal(reopened.page.text, first.page.text);
    assert.equal(reopened.assessment.className, "Start");
    assert.equal(reopened.previewDirty, false);
    assert.equal(reopened.summaryDirty, false);
    fixture.workflow.unstage(first.talkTitle);
    assert.equal(fixture.workflow.count(), 1);

    fixture.workflow.stage(first, createReview("First game"));
    const invalidatedSession = fixture.session.read();
    invalidatedSession.newPageList = null;
    invalidatedSession.pages = {};
    fixture.session.write(invalidatedSession);
    fixture.workflow.unstage(first.talkTitle);
    assert.equal(
        Object.hasOwn(fixture.session.read().pages, first.talkTitle),
        false,
    );
});

test("preparation refetches the list, orders the combined date, and makes no writes before review", async () => {
    const fixture = createFixture();
    const later = createState("Later game", "2026-09-30T18:00:00Z");
    fixture.workflow.stage(later, createReview("Later game"));
    const before = fixture.session.read();
    fixture.setList({
        basetimestamp: "fresh-list-base",
        starttimestamp: "fresh-query-time",
        text: originalList.replace(
            "{{vgc|Earlier game}}",
            "{{vgc|Earlier game}}、{{vgc|Concurrent game}}",
        ),
    });
    const review = createReview("Middle game");
    review.previewText = `{{DYK Invite}}\n${review.previewText}`;
    const batch = await fixture.workflow.prepare(
        createState("Middle game"),
        review,
    );
    assert.equal(fixture.listReads(), 1);
    assert.deepEqual(fixture.creationReads, [["Concurrent game"]]);
    assert.equal(batch.registration?.snapshot.basetimestamp, "fresh-list-base");
    assert.match(
        batch.registration?.proposedText ?? "",
        /\{\{vgc\|Earlier game\}\}、\{\{vgc\|Concurrent game\}\}、\{\{vgc\|Middle game\}\}\{\{Dykico\}\}、\{\{vgc\|Later game\}\}/u,
    );
    assert.equal(batch.entries.length, 2);
    assert.deepEqual(fixture.session.read(), before);
    assert.deepEqual(fixture.writes, []);
});

test("batch submission writes one exact reviewed registration before each exact reviewed talk draft", async () => {
    const fixture = createFixture();
    const firstReview = createReview("First game");
    const secondReview = createReview("Second game");
    fixture.workflow.stage(createState("First game"), firstReview);
    const batch = await fixture.workflow.prepare(
        createState("Second game"),
        secondReview,
    );
    batch.registrationSummary = "Reviewed combined registration summary";
    const phases: string[] = [];
    const outcome = await fixture.workflow.save(api, batch, (phase) =>
        phases.push(phase),
    );
    assert.equal(outcome, "saved");
    assert.deepEqual(fixture.writes, [
        "registration",
        "Talk:First game",
        "Talk:Second game",
    ]);
    assert.deepEqual(fixture.registrations, [
        {
            registration: batch.registration,
            summary: batch.registrationSummary,
        },
    ]);
    assert.deepEqual(
        fixture.talkReviews.map((entry) => entry.review),
        [
            { ...firstReview, shouldRegister: false },
            { ...secondReview, shouldRegister: false },
        ],
    );
    assert.deepEqual(phases, ["registration", "talk-page", "talk-page"]);
    assert.equal(fixture.workflow.count(), 0);
    assert.equal(fixture.session.read().newPageList, null);
    assert.deepEqual(fixture.session.read().pages, {});
});

test("a reviewed current page replaces its staged version in the submitted batch", async () => {
    const fixture = createFixture();
    fixture.workflow.stage(
        createState("First game"),
        createReview("First game"),
    );
    const newestReview = createReview("First game", false);
    newestReview.previewText += "\n<!-- latest reviewed source -->";
    const batch = await fixture.workflow.prepare(
        createState("First game"),
        newestReview,
    );
    assert.equal(batch.entries.length, 1);
    assert.equal(batch.registration, null);
    assert.equal(fixture.listReads(), 0);
    await fixture.workflow.save(api, batch, () => undefined);
    assert.equal(fixture.talkReviews.length, 1);
    assert.deepEqual(fixture.talkReviews[0]?.review, newestReview);
});

test("unselected registration and manually removed VG banners do not add list entries", async () => {
    const fixture = createFixture();
    fixture.workflow.stage(
        createState("Unchecked game"),
        createReview("Unchecked game", false),
    );
    const removedReview = createReview("Removed game");
    removedReview.previewText =
        "{{WikiProject Anime and manga}}\n<!-- reviewed removal -->";
    fixture.workflow.stage(createState("Removed game"), removedReview);
    const nonGame = createState("Non-game");
    nonGame.assessment.importance = NOT_VIDEO_GAME_IMPORTANCE;
    const batch = await fixture.workflow.prepare(
        nonGame,
        createReview("Non-game"),
    );
    assert.equal(batch.registration, null);
    assert.equal(fixture.listReads(), 0);
    await fixture.workflow.save(api, batch, () => undefined);
    assert.deepEqual(fixture.writes, [
        "Talk:Unchecked game",
        "Talk:Removed game",
        "Talk:Non-game",
    ]);
});

test("a registration conflict is reported once, retains every review, and prevents all talk writes", async () => {
    const fixture = createFixture();
    const conflict = { code: "editconflict" };
    fixture.failRegistration(conflict);
    fixture.workflow.stage(
        createState("First game"),
        createReview("First game"),
    );
    const batch = await fixture.workflow.prepare(
        createState("Second game"),
        createReview("Second game"),
    );
    await assert.rejects(
        fixture.workflow.save(api, batch, () => undefined),
        (error) => error === conflict,
    );
    assert.deepEqual(fixture.writes, ["registration"]);
    assert.equal(fixture.registrations.length, 1);
    assert.equal(fixture.talkReviews.length, 0);
    assert.equal(fixture.workflow.count(), 2);
    assert.equal(
        fixture.workflow.getReview("Talk:Second game")?.shouldRegister,
        true,
    );
});

test("confirmed partial submission keeps unfinished drafts and retries without another list write", async () => {
    const fixture = createFixture();
    fixture.failTalk("Talk:Second game");
    fixture.workflow.stage(
        createState("First game"),
        createReview("First game"),
    );
    const secondState = createState("Second game");
    const batch = await fixture.workflow.prepare(
        secondState,
        createReview("Second game"),
    );
    await assert.rejects(
        fixture.workflow.save(api, batch, () => undefined),
        /Talk write failed/u,
    );
    assert.deepEqual(fixture.writes, [
        "registration",
        "Talk:First game",
        "Talk:Second game",
    ]);
    assert.equal(fixture.workflow.count(), 1);
    assert.equal(fixture.workflow.getReview("Talk:First game"), null);
    const remainingReview = fixture.workflow.getReview("Talk:Second game")!;
    assert.equal(remainingReview.shouldRegister, false);
    fixture.failTalk(null);
    const retryBatch = await fixture.workflow.prepare(
        secondState,
        remainingReview,
    );
    assert.equal(retryBatch.registration, null);
    await fixture.workflow.save(api, retryBatch, () => undefined);
    assert.equal(fixture.registrations.length, 1);
    assert.equal(fixture.listReads(), 1);
    assert.deepEqual(fixture.writes, [
        "registration",
        "Talk:First game",
        "Talk:Second game",
        "Talk:Second game",
    ]);
    assert.deepEqual(fixture.talkReviews.at(-1)?.review, {
        ...createReview("Second game"),
        shouldRegister: false,
    });
    assert.equal(fixture.workflow.count(), 0);
});

test("a queue changed after preparation cannot save stale reviewed text", async () => {
    const fixture = createFixture();
    fixture.workflow.stage(
        createState("First game"),
        createReview("First game"),
    );
    const batch = await fixture.workflow.prepare(
        createState("Second game"),
        createReview("Second game"),
    );
    const changedReview = createReview("First game");
    changedReview.summary = "A newly reviewed summary";
    fixture.workflow.stage(createState("First game"), changedReview);
    await assert.rejects(
        fixture.workflow.save(api, batch, () => undefined),
        /staged pages changed/u,
    );
    assert.deepEqual(fixture.writes, []);
    assert.equal(
        fixture.workflow.getReview("Talk:First game")?.summary,
        changedReview.summary,
    );
});

test("Vue reactive state and the prepared ref save the exact review without locking submission", async () => {
    const fixture = createFixture();
    const state = reactive(createState("First game")) as DialogState;
    fixture.workflow.stage(state, createReview("First game"));
    const batch = ref(
        await fixture.workflow.prepare(state, createReview("First game")),
    );
    await fixture.workflow.save(api, batch.value, () => undefined);
    assert.deepEqual(fixture.talkReviews[0]?.review, {
        ...createReview("First game"),
        shouldRegister: false,
    });
    assert.equal(
        fixture.registrations[0]?.registration.proposedText,
        batch.value.registration?.proposedText,
    );
    fixture.workflow.stage(
        createState("Second game"),
        createReview("Second game"),
    );
    assert.equal(fixture.workflow.count(), 1);
});

test("a failed draft capture write happens before wiki edits and releases the submission lock", async () => {
    const memory = createSession();
    let failNextWrite = false;
    const session: AssessmentSessionStore = {
        read: () => memory.read(),
        write(data) {
            if (failNextWrite) {
                failNextWrite = false;
                throw new Error("Storage full");
            }
            memory.write(data);
        },
    };
    const fixture = createFixture(session);
    const state = createState("First game");
    const review = createReview("First game", false);
    const batch = await fixture.workflow.prepare(state, review);
    failNextWrite = true;
    await assert.rejects(
        fixture.workflow.save(api, batch, () => undefined),
        /Storage full/u,
    );
    assert.deepEqual(fixture.writes, []);
    fixture.workflow.stage(state, review);
    const retry = await fixture.workflow.prepare(state, review);
    await fixture.workflow.save(api, retry, () => undefined);
    assert.deepEqual(fixture.writes, ["Talk:First game"]);
    assert.equal(fixture.workflow.count(), 0);
});

test("cache invalidation tolerates storage failures after confirmed writes", () => {
    for (const failedOperation of ["read", "write"]) {
        const loader = createCachedDialogLoader({
            session: {
                read() {
                    if (failedOperation === "read")
                        throw new Error("Storage unavailable");
                    return { drafts: [], pages: {}, newPageList: null };
                },
                write() {
                    throw new Error("Storage unavailable");
                },
            },
            getTalkPageTitle: () => "Talk:First game",
            async loadDialogState() {
                return createState("First game");
            },
            logger,
        });
        assert.doesNotThrow(() => loader.invalidate());
    }
});

test("cached reopening restores staged state and never exposes mutable cache copies", async () => {
    const session = createSession();
    let loads = 0;
    const loader = createCachedDialogLoader({
        session,
        getTalkPageTitle: () => "Talk:First game",
        async loadDialogState() {
            loads += 1;
            return createState("First game");
        },
        logger,
    });
    const title = {} as mw.Title;
    const first = await loader.load(api, title);
    first.assessment.className = "FA";
    first.creationTimes.clear();
    const second = await loader.load(api, title);
    assert.equal(loads, 1);
    assert.notEqual(second.assessment.className, "FA");
    assert.equal(second.creationTimes.size, 1);
    const fixture = createFixture(session);
    const stagedState = createState("First game");
    stagedState.assessment.className = "B";
    fixture.workflow.stage(stagedState, createReview("First game"));
    loader.invalidate();
    const nextApi = {} as mw.Api;
    const reopened = await loader.load(nextApi, title);
    assert.equal(loads, 1);
    assert.equal(reopened.api, nextApi);
    assert.equal(reopened.assessment.className, "B");
    assert.deepEqual(
        fixture.workflow.getReview(reopened.talkTitle),
        createReview("First game"),
    );
});

test("concurrent opens reuse an in-flight load and invalidation discards its stale cache result", async () => {
    const session = createSession();
    let loads = 0;
    let resolveLoad!: (state: DialogState) => void;
    const loader = createCachedDialogLoader({
        session,
        getTalkPageTitle: () => "Talk:First game",
        loadDialogState() {
            loads += 1;
            return new Promise<DialogState>((resolve) => {
                resolveLoad = resolve;
            });
        },
        logger,
    });
    const title = {} as mw.Title;
    const first = loader.load(api, title);
    const second = loader.load(api, title);
    assert.equal(loads, 1);
    loader.invalidate();
    resolveLoad(createState("First game"));
    const loaded = await Promise.all([first, second]);
    assert.notEqual(loaded[0]?.assessment, loaded[1]?.assessment);
    assert.deepEqual(session.read().pages, {});
    const subsequent = loader.load(api, title);
    assert.equal(loads, 2);
    resolveLoad(createState("First game"));
    await subsequent;
    assert.equal(Object.keys(session.read().pages).length, 1);
});

function createFixture(session = createSession()) {
    const writes: string[] = [];
    const registrations: Array<{
        registration: RegistrationSave;
        summary: string;
    }> = [];
    const talkReviews: Array<{ state: DialogState; review: DialogSaveReview }> =
        [];
    const creationReads: string[][] = [];
    let snapshot = createListSnapshot();
    let reads = 0;
    let registrationError: unknown;
    let failingTalk: string | null = null;
    const workflow = createAssessmentStagingWorkflow(
        {
            session,
            logger,
            async fetchNewPageList() {
                reads += 1;
                return structuredClone(snapshot);
            },
            async fetchPageCreationTimes(_api, titles) {
                creationReads.push([...titles]);
                return new Map(
                    titles.map((title) => [
                        title,
                        new Date("2026-09-30T06:00:00Z"),
                    ]),
                );
            },
            async saveRegistration(_api, registration, summary) {
                writes.push("registration");
                registrations.push({
                    registration: {
                        proposedText: registration.proposedText,
                        snapshot: { ...registration.snapshot },
                    },
                    summary,
                });
                if (registrationError != null) throw registrationError;
                snapshot = { ...snapshot, text: registration.proposedText };
            },
            async saveReviewedDialog(state, review, reportPhase) {
                reportPhase("talk-page");
                writes.push(state.talkTitle);
                talkReviews.push({ state, review: structuredClone(review) });
                if (state.talkTitle === failingTalk)
                    throw new Error("Talk write failed");
                return "saved";
            },
        },
        projectConfig,
    );
    return {
        session,
        workflow,
        writes,
        registrations,
        talkReviews,
        creationReads,
        setList(value: NewPageListSnapshot) {
            snapshot = value;
        },
        listReads: () => reads,
        failRegistration(value: unknown) {
            registrationError = value;
        },
        failTalk(title: string | null) {
            failingTalk = title;
        },
    };
}

function createSession(): AssessmentSessionStore {
    let data: AssessmentSessionData = {
        drafts: [],
        pages: {},
        newPageList: null,
    };
    return {
        read: () => structuredClone(data),
        write(value) {
            data = structuredClone(value);
        },
    };
}

function createListSnapshot(): NewPageListSnapshot {
    return {
        basetimestamp: "original-list-base",
        starttimestamp: "original-query-time",
        text: originalList,
    };
}

function createState(
    title: string,
    created = "2026-09-30T12:00:00Z",
): DialogState {
    const lead =
        "{{WikiProject banner shell|class=Start|1=\n{{WikiProject Video games|importance=Low}}\n}}";
    const creationDate = new Date(created);
    const creationTimes = new Map([
        ["Earlier game", new Date("2026-09-30T01:00:00Z")],
    ]);
    return {
        api,
        assessment: createDefaultAssessment(projectConfig, lead),
        creationTimes,
        newPageList: createListSnapshot(),
        page: {
            exists: true,
            starttimestamp: "talk-query-time",
            basetimestamp: "talk-base",
            text: `${lead}\n\n== Discussion ==\nRetained body.`,
        },
        previewDirty: false,
        registration: prepareNewPageListRegistration({
            text: originalList,
            title,
            namespaceNumber: 0,
            creationDate,
            creationTimes,
        }),
        subjectInfo: {
            creationDate,
            isRedirect: false,
            listedTitle: title,
            namespaceNumber: 0,
            targetTitle: title,
        },
        subjectTitle: title,
        summaryDirty: false,
        talkTitle: `Talk:${title}`,
    };
}

function createReview(title: string, shouldRegister = true): DialogSaveReview {
    return {
        previewText: `  {{WikiProject banner shell|class=B|1=\n{{WikiProject Video games|importance=High}}\n}}\n<!-- ${title}: reviewed exact source -->\n\n`,
        summary: `Reviewed ${title} assessment`,
        listSummary: `Reviewed ${title} registration`,
        shouldRegister,
    };
}
