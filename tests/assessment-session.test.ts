import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import type {
    AssessmentSessionData,
    StagedAssessment,
} from "../src/app/staging-contracts.ts";
import { createAssessmentSessionStore } from "../src/platform/browser/assessment-session.ts";
import { createLogger } from "../src/shared/logging.ts";

test("session drafts and cached snapshots survive reopening with Dates and Maps", (t) => {
    const storage = useStorage(t);
    const data = sessionData();
    Object.assign(data.drafts[0].state, { api: { secret: "runtime-api" } });
    const store = createAssessmentSessionStore(logger(), "wiki:User");
    store.write(data);

    const restored = createAssessmentSessionStore(logger(), "wiki:User").read();
    assert.deepEqual(restored, sessionData());
    assert.ok(
        restored.drafts[0].state.subjectInfo.creationDate instanceof Date,
    );
    assert.ok(restored.drafts[0].state.creationTimes instanceof Map);
    assert.ok(
        restored.drafts[0].state.registration.earliestDate instanceof Date,
    );
    assert.ok(
        restored.drafts[0].state.registration.existing?.date instanceof Date,
    );
    assert.equal(
        JSON.stringify([...storage.values]).includes("runtime-api"),
        false,
    );
});

test("writes and reads retain independent assessment, review, and cached state", (t) => {
    useStorage(t);
    const data = sessionData();
    const store = createAssessmentSessionStore(logger(), "clone-test");
    store.write(data);
    data.drafts[0].review.previewText = "Changed after saving";
    data.drafts[0].state.creationTimes.clear();
    data.pages.Example.assessment.maintenance.cover = true;

    const first = store.read();
    assert.deepEqual(first, sessionData());
    first.drafts[0].state.subjectInfo.creationDate.setUTCFullYear(2000);
    first.drafts[0].state.creationTimes.set("Other", new Date());
    first.drafts[0].state.assessment.taskForces.RPG = false;
    first.drafts[0].review.summary = "Changed during review";
    first.pages.Example.page.text = "Changed cached text";
    first.newPageList!.text = "Changed list";
    assert.deepEqual(store.read(), sessionData());
    assert.notEqual(first.drafts[0].state, first.pages.Example);
});

test("different wiki and account identities have isolated sessions", (t) => {
    const storage = useStorage(t);
    const first = createAssessmentSessionStore(logger(), "wiki-a:User");
    first.write(sessionData());
    assert.deepEqual(
        createAssessmentSessionStore(logger(), "wiki-a:Other").read(),
        emptySession(),
    );
    assert.deepEqual(
        createAssessmentSessionStore(logger(), "wiki-b:User").read(),
        emptySession(),
    );
    assert.equal(storage.values.size, 1);
});

test("malformed storage returns empty data, preserves its source, and logs no text", (t) => {
    const storage = useStorage(t);
    const events: unknown[][] = [];
    const store = createAssessmentSessionStore(logger(events), "malformed");
    store.write(sessionData());
    const [key, source] = [...storage.values][0];
    const corruptions: Array<(value: any) => void> = [
        (value) => {
            value.version = 1;
        },
        (value) => {
            value.textPool[0] = null;
        },
        (value) => {
            value.drafts[0].review.previewText = value.textPool.length;
        },
        (value) => {
            value.pages.Example.page.text = -1;
        },
        (value) => {
            value.drafts[0].state.registration.proposedText = 0.5;
        },
        (value) => {
            value.drafts[0].state.creationTimes = [["Example", "invalid date"]];
        },
        (value) => {
            value.drafts[0].state.registration.existing.date = "2026-04-07";
        },
        (value) => {
            value.pages.Example.subjectInfo.creationDate = null;
        },
        (value) => {
            value.drafts[0].review.shouldRegister = "secret editable text";
        },
        (value) => {
            value.pages.Example.assessment.maintenance.cover = "false";
        },
        (value) => {
            value.newPageList = { text: "secret editable text" };
        },
    ];
    const sources = corruptions.map((corrupt) => {
        const value: unknown = JSON.parse(source);
        corrupt(value);
        return JSON.stringify(value);
    });
    sources.push("secret editable text", "null", "[]");
    for (const corrupted of sources) {
        storage.values.set(key, corrupted);
        assert.deepEqual(store.read(), emptySession());
        assert.equal(storage.values.get(key), corrupted);
    }
    assert.equal(
        events.filter(([event]) => String(event).includes("read.invalid"))
            .length,
        sources.length,
    );
    assert.equal(
        JSON.stringify(events).includes("secret editable text"),
        false,
    );
});

test("large shared source snapshots are pooled once while exact proposals survive", (t) => {
    const storage = useStorage(t);
    const registry = "Shared registry source ".repeat(5_000);
    const data = emptySession();
    for (let index = 0; index < 12; index += 1) {
        const draft = sessionData().drafts[0];
        draft.state.subjectTitle = `Example ${index}`;
        draft.state.talkTitle = `Talk:Example ${index}`;
        draft.state.newPageList.text = registry;
        draft.state.registration.proposedText = `${registry}Entry ${index}\n`;
        data.drafts.push(draft);
        data.pages[draft.state.talkTitle] = draft.state;
    }
    data.newPageList = data.drafts[0].state.newPageList;
    const store = createAssessmentSessionStore(logger(), "pooled-source");
    store.write(data);

    const source = [...storage.values.values()][0];
    const encoded = JSON.parse(source) as { textPool: string[] };
    assert.equal(
        encoded.textPool.filter((text) => text === registry).length,
        1,
    );
    assert.ok(source.length < JSON.stringify(data).length / 2);
    assert.deepEqual(store.read(), data);
    assert.equal(
        store.read().drafts[11].state.registration.proposedText,
        `${registry}Entry 11\n`,
    );
});

test("storage access and read failures propagate without silently replacing drafts", (t) => {
    useStorage(t);
    const events: unknown[][] = [];
    const failure = new Error("secret editable text");
    const store = createAssessmentSessionStore(logger(events), "read-failure");
    Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        get() {
            throw failure;
        },
    });
    assert.throws(
        () => store.read(),
        (error) => error === failure,
    );
    assert.throws(
        () => store.write(sessionData()),
        (error) => error === failure,
    );

    Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: {
            getItem() {
                throw failure;
            },
            setItem() {},
        },
    });
    assert.throws(
        () => store.read(),
        (error) => error === failure,
    );
    assert.equal(
        JSON.stringify(events).includes("secret editable text"),
        false,
    );
});

test("write failures leave the last saved batch intact and propagate to the caller", (t) => {
    const storage = useStorage(t);
    const events: unknown[][] = [];
    const store = createAssessmentSessionStore(logger(events), "write-failure");
    store.write(sessionData());
    const failure = new Error("secret editable text");
    storage.setItem = () => {
        throw failure;
    };
    const changed = sessionData();
    changed.drafts[0].review.previewText = "New reviewed text";
    assert.throws(
        () => store.write(changed),
        (error) => error === failure,
    );
    assert.deepEqual(store.read(), sessionData());

    const invalid = sessionData();
    invalid.drafts[0].state.subjectInfo.creationDate = new Date(NaN);
    assert.throws(() => store.write(invalid), RangeError);
    assert.deepEqual(store.read(), sessionData());
    assert.equal(
        JSON.stringify(events).includes("secret editable text"),
        false,
    );
});

test("missing sessionStorage uses isolated memory snapshots with independent reads", (t) => {
    useStorage(t, null);
    const store = createAssessmentSessionStore(logger(), "memory-fallback");
    store.write(sessionData());
    const first = store.read();
    first.drafts[0].review.previewText = "Edited locally";
    assert.deepEqual(
        createAssessmentSessionStore(logger(), "memory-fallback").read(),
        sessionData(),
    );
    assert.deepEqual(
        createAssessmentSessionStore(logger(), "other-memory-fallback").read(),
        emptySession(),
    );
});

function useStorage(
    t: TestContext,
    supplied: ReturnType<typeof memoryStorage> | null = memoryStorage(),
) {
    const descriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        "sessionStorage",
    );
    Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: supplied ?? undefined,
    });
    t.after(() => {
        if (descriptor)
            Object.defineProperty(globalThis, "sessionStorage", descriptor);
        else Reflect.deleteProperty(globalThis, "sessionStorage");
    });
    return supplied!;
}

function memoryStorage() {
    const values = new Map<string, string>();
    return {
        values,
        getItem(key: string) {
            return values.get(key) ?? null;
        },
        setItem(key: string, value: string) {
            values.set(key, value);
        },
    };
}

function logger(events: unknown[][] = []) {
    function record(...values: unknown[]) {
        events.push(values);
    }
    return createLogger("test", {
        level: "debug",
        output: { debug: record, error: record, info: record, warn: record },
    });
}

function emptySession(): AssessmentSessionData {
    return { drafts: [], pages: {}, newPageList: null };
}

function sessionData(): AssessmentSessionData {
    const draft: StagedAssessment = {
        state: {
            assessment: {
                className: "Start",
                importance: "Low",
                maintenance: {
                    cover: false,
                    needsInfobox: true,
                    reassess: false,
                    screenshot: false,
                },
                otherProjects: { Animation: false },
                taskForces: { RPG: true },
            },
            creationTimes: new Map([
                ["Example", new Date("2026-04-07T01:02:03.456Z")],
                ["Older", new Date("2026-03-01T00:00:00.000Z")],
            ]),
            newPageList: {
                basetimestamp: "list-base",
                starttimestamp: "query-time",
                text: "== 2026年 ==\n* 4月1日 - {{vgc|Older}}\n",
            },
            page: {
                basetimestamp: "talk-base",
                exists: true,
                starttimestamp: "query-time",
                text: "{{WikiProject Video games|class=Stub}}",
            },
            previewDirty: true,
            registration: {
                alreadyRegistered: true,
                changed: true,
                earliestDate: new Date("2026-03-01T00:00:00.000Z"),
                eligible: true,
                existing: {
                    date: new Date("2026-04-07T01:02:03.456Z"),
                    listedTitle: "Example",
                },
                proposedText: "* 4月7日 - {{vgc|Example}}",
            },
            subjectInfo: {
                creationDate: new Date("2026-04-07T01:02:03.456Z"),
                isRedirect: false,
                listedTitle: "Example",
                namespaceNumber: 0,
                targetTitle: "Example",
            },
            subjectTitle: "Example",
            summaryDirty: true,
            talkTitle: "Talk:Example",
        },
        review: {
            listSummary: "Register Example",
            previewText: "{{WikiProject Video games|class=Start}}",
            shouldRegister: true,
            summary: "Assess Example",
        },
    };
    return {
        drafts: [draft],
        pages: { Example: draft.state },
        newPageList: draft.state.newPageList,
    };
}
