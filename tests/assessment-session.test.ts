import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import type {
    AssessmentSessionData,
    StagedAssessment,
} from "../src/app/staging-contracts.ts";
import { createAssessmentSessionStore } from "../src/platform/browser/assessment-session.ts";
import { createLogger } from "../src/shared/logging.ts";

test("shared drafts and tab snapshots survive reopening with Dates and Maps", (t) => {
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
        JSON.stringify([
            ...storage.cache.values,
            ...storage.queue.values,
        ]).includes("runtime-api"),
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
    assert.equal(storage.cache.values.size, 1);
    assert.equal(storage.queue.values.size, 1);
});

test("malformed queues preserve source and logs; cache writes cannot erase them", (t) => {
    const storage = useStorage(t);
    const events: unknown[][] = [];
    const store = createAssessmentSessionStore(logger(events), "malformed");
    store.write(sessionData());
    const [key, source] = [...storage.queue.values][0];
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
            value.drafts[0].state.registration.proposedText = 0.5;
        },
        (value) => {
            value.drafts[0].state.creationTimes = [["Example", "invalid date"]];
        },
        (value) => {
            value.drafts[0].state.registration.existing.date = "2026-04-07";
        },
        (value) => {
            value.drafts[0].review.shouldRegister = "secret editable text";
        },
    ];
    const sources = corruptions.map((corrupt) => {
        const value: unknown = JSON.parse(source);
        corrupt(value);
        return JSON.stringify(value);
    });
    sources.push("secret editable text", "null", "[]");
    for (const corrupted of sources) {
        storage.queue.values.set(key, corrupted);
        const cached = store.read();
        assert.deepEqual(cached.drafts, []);
        assert.deepEqual(cached.pages, sessionData().pages);
        store.write(cached);
        assert.equal(storage.queue.values.get(key), corrupted);
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

test("malformed tab caches do not hide shared drafts or overwrite recovery source", (t) => {
    const storage = useStorage(t);
    const store = createAssessmentSessionStore(logger(), "malformed-cache");
    store.write(sessionData());
    const [key, source] = [...storage.cache.values][0];
    const corruptions: Array<(value: any) => void> = [
        (value) => {
            value.pages.Example.page.text = -1;
        },
        (value) => {
            value.pages.Example.subjectInfo.creationDate = null;
        },
        (value) => {
            value.pages.Example.assessment.maintenance.cover = "false";
        },
        (value) => {
            value.newPageList = { text: "secret editable text" };
        },
    ];
    for (const corrupt of corruptions) {
        const encoded: unknown = JSON.parse(source);
        corrupt(encoded);
        const corrupted = JSON.stringify(encoded);
        storage.cache.values.set(key, corrupted);
        const restored = store.read();
        assert.deepEqual(restored.drafts, sessionData().drafts);
        assert.deepEqual(restored.pages, {});
        assert.equal(restored.newPageList, null);
        assert.equal(storage.cache.values.get(key), corrupted);
    }
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

    const sources = [
        ...storage.cache.values.values(),
        ...storage.queue.values.values(),
    ];
    for (const source of sources) {
        const encoded = JSON.parse(source) as { textPool: string[] };
        assert.equal(
            encoded.textPool.filter((text) => text === registry).length,
            1,
        );
    }
    assert.ok(
        sources.reduce((length, source) => length + source.length, 0) <
            JSON.stringify(data).length * 0.6,
    );
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
    assert.doesNotThrow(() => store.write(sessionData()));

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
    Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: memoryStorage(),
    });
    Object.defineProperty(globalThis, "localStorage", {
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
    const savedCache = [...storage.cache.values];
    storage.queue.setItem = () => {
        throw failure;
    };
    const changed = sessionData();
    changed.drafts[0].review.previewText = "New reviewed text";
    assert.throws(
        () => store.write(changed),
        (error) => error === failure,
    );
    assert.deepEqual(store.read(), sessionData());
    assert.deepEqual([...storage.cache.values], savedCache);

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

test("tabs share drafts while keeping distinct caches and ignoring stale cache writes", (t) => {
    const storage = useStorage(t);
    const first = createAssessmentSessionStore(logger(), "shared-tabs");
    first.write(sessionData());
    const stale = first.read();

    const otherCache = memoryStorage();
    replaceGlobal(t, "sessionStorage", otherCache);
    const other = createAssessmentSessionStore(logger(), "shared-tabs");
    const otherData = other.read();
    assert.deepEqual(otherData.drafts, sessionData().drafts);
    assert.deepEqual(otherData.pages, {});
    assert.equal(otherData.newPageList, null);
    const secondDraft = sessionData().drafts[0];
    secondDraft.state.talkTitle = "Talk:Second";
    otherData.drafts.push(secondDraft);
    otherData.pages.Second = secondDraft.state;
    other.write(otherData);

    Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: storage.cache,
    });
    stale.pages.Example.page.text = "Refreshed only in first tab";
    first.write(stale);
    assert.equal(first.read().drafts.length, 2);
    assert.equal(
        first.read().pages.Example.page.text,
        "Refreshed only in first tab",
    );
    Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: otherCache,
    });
    assert.deepEqual(Object.keys(other.read().pages), ["Second"]);
    assert.equal(other.read().drafts.length, 2);
    for (const cache of [storage.cache, otherCache]) {
        const encoded = JSON.parse([...cache.values.values()][0]) as {
            drafts: unknown[];
        };
        assert.deepEqual(encoded.drafts, []);
    }
});

test("failed cache writes keep committed queue data and expose no editable text", (t) => {
    const storage = useStorage(t);
    const events: unknown[][] = [];
    const store = createAssessmentSessionStore(logger(events), "cache-failure");
    storage.cache.setItem = () => {
        throw new Error("secret editable text");
    };
    assert.doesNotThrow(() => store.write(sessionData()));
    assert.deepEqual(store.read().drafts, sessionData().drafts);
    assert.deepEqual(store.read().pages, {});
    assert.equal(
        JSON.stringify(events).includes("secret editable text"),
        false,
    );
});

test("exclusive queue work is ordered across stores and continues after failures", async (t) => {
    useStorage(t);
    const first = createAssessmentSessionStore(logger(), "exclusive");
    const second = createAssessmentSessionStore(logger(), "exclusive");
    const events: string[] = [];
    let finishFirst!: () => void;
    const pending = new Promise<void>((resolve) => {
        finishFirst = resolve;
    });
    const failure = new Error("First operation failed");
    const firstTask = first.runExclusive!(async () => {
        events.push("first started");
        await pending;
        events.push("first ended");
        throw failure;
    });
    const secondTask = second.runExclusive!(async () => {
        events.push("second started");
        const data = second.read();
        data.drafts.push(sessionData().drafts[0]);
        second.write(data);
        return "finished";
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(events, ["first started"]);
    finishFirst();
    await assert.rejects(firstTask, (error) => error === failure);
    assert.equal(await secondTask, "finished");
    assert.deepEqual(events, [
        "first started",
        "first ended",
        "second started",
    ]);
    assert.equal(first.read().drafts.length, 1);
});

test("browser queue work uses one named Web Lock and fails safely without it", async (t) => {
    useStorage(t);
    const names: string[] = [];
    replaceGlobal(t, "window", {});
    replaceGlobal(t, "navigator", {
        locks: {
            async request(name: string, operation: () => Promise<unknown>) {
                names.push(name);
                return operation();
            },
        },
    });
    const first = createAssessmentSessionStore(logger(), "browser-lock");
    const second = createAssessmentSessionStore(logger(), "browser-lock");
    await first.runExclusive!(async () => {});
    await second.runExclusive!(async () => {});
    assert.equal(names.length, 2);
    assert.equal(names[0], names[1]);
    Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {},
    });
    let executed = false;
    await assert.rejects(
        first.runExclusive!(async () => {
            executed = true;
        }),
        /Web Locks/,
    );
    assert.equal(executed, false);
});

test("queue subscriptions filter storage events and unsubscribe releases listeners", (t) => {
    const storage = useStorage(t);
    const target = new EventTarget();
    replaceGlobal(t, "addEventListener", target.addEventListener.bind(target));
    replaceGlobal(
        t,
        "removeEventListener",
        target.removeEventListener.bind(target),
    );
    const store = createAssessmentSessionStore(logger(), "subscriptions");
    store.write(sessionData());
    const queueKey = [...storage.queue.values.keys()][0];
    let changes = 0;
    const unsubscribe = store.subscribe!(() => {
        changes += 1;
    });
    function notify(key: string | null, storageArea = storage.queue) {
        target.dispatchEvent(
            Object.assign(new Event("storage"), { key, storageArea }),
        );
    }
    notify("another wiki queue");
    notify(queueKey, storage.cache);
    assert.equal(changes, 0);
    notify(queueKey);
    notify(null);
    assert.equal(changes, 2);
    unsubscribe();
    notify(queueKey);
    assert.equal(changes, 2);
});

test("old tab sessions are ignored across reads, locked operations and cache writes", async (t) => {
    const storage = useStorage(t);
    const fixtureStore = createAssessmentSessionStore(logger(), "fixture");
    fixtureStore.write(sessionData());
    const [fixtureQueueKey, oldSource] = [...storage.queue.values][0];
    storage.queue.values.delete(fixtureQueueKey);
    storage.cache.values.clear();
    const oldKey = "wpvg-assessor.assessment-session.v2:old-tab";
    storage.cache.values.set(oldKey, oldSource);

    const store = createAssessmentSessionStore(logger(), "old-tab");
    assert.deepEqual(store.read(), emptySession());
    await store.runExclusive!(async () => {
        const data = store.read();
        data.pages = sessionData().pages;
        store.write(data);
    });
    assert.deepEqual(store.read().drafts, []);
    assert.equal(storage.queue.values.size, 0);
    assert.equal(storage.cache.values.get(oldKey), oldSource);
    const currentKey = "wpvg-assessor.assessment-cache.v1:old-tab";
    const current = JSON.parse(storage.cache.values.get(currentKey)!) as {
        drafts: unknown[];
    };
    assert.deepEqual(current.drafts, []);
});

function useStorage(
    t: TestContext,
    supplied: ReturnType<typeof memoryStorage> | null = memoryStorage(),
) {
    const queue = supplied === null ? null : memoryStorage();
    replaceGlobal(t, "sessionStorage", supplied ?? undefined);
    replaceGlobal(t, "localStorage", queue ?? undefined);
    return { cache: supplied!, queue: queue! };
}

function replaceGlobal(t: TestContext, key: string, value: unknown) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    });
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
