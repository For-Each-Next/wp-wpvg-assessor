/** Shares reviewed drafts across tabs while keeping read snapshots per tab. */

import type { DialogState } from "../../app/dialog-contracts.ts";
import type {
    AssessmentSessionData,
    AssessmentSessionStore,
    StagedAssessment,
} from "../../app/staging-contracts.ts";
import type {
    Assessment,
    NewPageListSnapshot,
    RegistrationResult,
    SelectionMap,
} from "../../domain/types.ts";
import type { Logger } from "../../shared/logging.ts";

type SessionDialogState = Omit<DialogState, "api">;
type UnknownRecord = Record<string, unknown>;
type StoreText = (value: string) => number;
type RestoreText = (value: unknown) => string;

const MEMORY_SESSIONS = new Map<string, string>();
const MEMORY_QUEUES = new Map<string, string>();
const EXCLUSIVE_OPERATIONS = new Map<string, Promise<unknown>>();
const KEY_PREFIX = "wpvg-assessor.assessment-cache.v1:";
const QUEUE_PREFIX = "wpvg-assessor.assessment-queue.v1:";

/** Identity includes the wiki and account; only cached reads remain tab-local. */
export function createAssessmentSessionStore(
    logger: Logger,
    identity: string,
): AssessmentSessionStore {
    const key = `${KEY_PREFIX}${encodeURIComponent(identity)}`;
    const queueKey = `${QUEUE_PREFIX}${encodeURIComponent(identity)}`;
    const baselines = new WeakMap<AssessmentSessionData, string>();

    function readStored(shared: boolean): AssessmentSessionData {
        let source: string | null;
        try {
            const storage = shared
                ? globalThis.localStorage
                : globalThis.sessionStorage;
            source =
                storage == null
                    ? ((shared ? MEMORY_QUEUES : MEMORY_SESSIONS).get(
                          shared ? queueKey : key,
                      ) ?? null)
                    : storage.getItem(shared ? queueKey : key);
        } catch (error) {
            logger.warn("assessment-session.read.failed");
            throw error;
        }
        if (source === null) return emptySession();
        try {
            return restoreSession(JSON.parse(source));
        } catch {
            // Stored drafts can contain editable text. Never log the payload or
            // parser error, and leave the original value available for recovery.
            logger.warn("assessment-session.read.invalid");
            return emptySession();
        }
    }

    function writeStored(shared: boolean, data: AssessmentSessionData): void {
        const source = JSON.stringify(serializeSession(data));
        const storage = shared
            ? globalThis.localStorage
            : globalThis.sessionStorage;
        if (storage == null)
            (shared ? MEMORY_QUEUES : MEMORY_SESSIONS).set(
                shared ? queueKey : key,
                source,
            );
        else storage.setItem(shared ? queueKey : key, source);
    }

    function read(): AssessmentSessionData {
        const cached = readStored(false);
        const queued = readStored(true);
        const data = {
            ...cached,
            drafts: queued.drafts,
        };
        baselines.set(data, serializeDrafts(data.drafts));
        return data;
    }

    function writeCache(cached: AssessmentSessionData): void {
        try {
            writeStored(false, cached);
        } catch {
            // Cached snapshots are disposable. The shared queue already
            // preserves all drafts even if a cache refresh fails.
            logger.warn("assessment-session.cache.write.failed");
        }
    }

    function write(data: AssessmentSessionData): void {
        try {
            // Validate and reconstruct before storage, omitting runtime objects
            // and unknown fields. Serialization also separates all mutable data.
            const restored = restoreSession(serializeSession(data));
            const draftSource = serializeDrafts(restored.drafts);
            if (baselines.get(data) !== draftSource) {
                // Publish first: a failed queue write must not make a cache
                // update look like a successful stage.
                writeStored(true, {
                    ...emptySession(),
                    drafts: restored.drafts,
                });
                baselines.set(data, draftSource);
            }
            writeCache({ ...restored, drafts: [] });
            logger.debug("assessment-session.write.completed", {
                drafts: restored.drafts.length,
                pages: Object.keys(restored.pages).length,
            });
        } catch (error) {
            logger.warn("assessment-session.write.failed");
            throw error;
        }
    }

    function subscribe(listener: () => void): () => void {
        if (typeof globalThis.addEventListener !== "function") return () => {};
        const storageChanged = (event: StorageEvent) => {
            if (
                event.storageArea != null &&
                event.storageArea !== globalThis.localStorage
            )
                return;
            if (event.key === queueKey || event.key === null) listener();
        };
        globalThis.addEventListener("storage", storageChanged);
        return () => globalThis.removeEventListener("storage", storageChanged);
    }

    async function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
        const locks = globalThis.navigator?.locks;
        if (locks !== undefined) return locks.request(queueKey, operation);
        if (typeof globalThis.window !== "undefined")
            throw new Error(
                "Shared assessment drafts require browser Web Locks support",
            );
        // Offline consumers have no browser tabs, but still need deterministic
        // serialization across separately constructed stores of one identity.
        const previous =
            EXCLUSIVE_OPERATIONS.get(queueKey) ?? Promise.resolve();
        const current = previous.catch(() => {}).then(operation);
        EXCLUSIVE_OPERATIONS.set(queueKey, current);
        try {
            return await current;
        } finally {
            if (EXCLUSIVE_OPERATIONS.get(queueKey) === current)
                EXCLUSIVE_OPERATIONS.delete(queueKey);
        }
    }

    return Object.freeze({ read, write, subscribe, runExclusive });
}

function serializeDrafts(drafts: StagedAssessment[]): string {
    return JSON.stringify(serializeSession({ ...emptySession(), drafts }));
}

function emptySession(): AssessmentSessionData {
    return { drafts: [], pages: {}, newPageList: null };
}

function serializeSession(data: AssessmentSessionData): UnknownRecord {
    const textPool: string[] = [];
    const textIndexes = new Map<string, number>();
    const storeText: StoreText = (value) => {
        const source = string(value);
        const existing = textIndexes.get(source);
        if (existing !== undefined) return existing;
        const index = textPool.length;
        textPool.push(source);
        textIndexes.set(source, index);
        return index;
    };
    return {
        version: 2,
        textPool,
        drafts: data.drafts.map((entry) => ({
            state: serializeState(entry.state, storeText),
            review: {
                ...entry.review,
                previewText: storeText(entry.review.previewText),
            },
        })),
        pages: Object.fromEntries(
            Object.entries(data.pages).map(([title, state]) => [
                title,
                serializeState(state, storeText),
            ]),
        ),
        newPageList:
            data.newPageList === null
                ? null
                : serializeNewPageList(data.newPageList, storeText),
    };
}

function serializeState(
    state: SessionDialogState,
    storeText: StoreText,
): UnknownRecord {
    return {
        assessment: state.assessment,
        creationTimes: [...state.creationTimes].map(([title, date]) => [
            title,
            date.toISOString(),
        ]),
        newPageList: serializeNewPageList(state.newPageList, storeText),
        page: { ...state.page, text: storeText(state.page.text) },
        previewDirty: state.previewDirty,
        registration: {
            ...state.registration,
            proposedText: storeText(state.registration.proposedText),
            earliestDate:
                state.registration.earliestDate?.toISOString() ?? null,
            existing: state.registration.existing
                ? {
                      date: state.registration.existing.date.toISOString(),
                      listedTitle: state.registration.existing.listedTitle,
                  }
                : null,
        },
        subjectInfo: {
            ...state.subjectInfo,
            creationDate: state.subjectInfo.creationDate.toISOString(),
        },
        subjectTitle: state.subjectTitle,
        summaryDirty: state.summaryDirty,
        talkTitle: state.talkTitle,
    };
}

function serializeNewPageList(
    page: NewPageListSnapshot,
    storeText: StoreText,
): UnknownRecord {
    return { ...page, text: storeText(page.text) };
}

function restoreSession(value: unknown): AssessmentSessionData {
    const data = record(value);
    if (
        data.version !== 2 ||
        !Array.isArray(data.drafts) ||
        !Array.isArray(data.textPool) ||
        !data.textPool.every((value) => typeof value === "string")
    )
        invalidSession();
    const textPool = data.textPool as string[];
    const restoreText: RestoreText = (value) => {
        if (
            typeof value !== "number" ||
            !Number.isInteger(value) ||
            value < 0 ||
            value >= textPool.length
        )
            invalidSession();
        return textPool[value];
    };
    const pages = record(data.pages);
    return {
        drafts: data.drafts.map((draft) => restoreDraft(draft, restoreText)),
        pages: Object.fromEntries(
            Object.entries(pages).map(([title, state]) => [
                title,
                restoreState(state, restoreText),
            ]),
        ),
        newPageList:
            data.newPageList === null
                ? null
                : restoreNewPageList(data.newPageList, restoreText),
    };
}

function restoreDraft(
    value: unknown,
    restoreText: RestoreText,
): StagedAssessment {
    const entry = record(value);
    const review = record(entry.review);
    return {
        state: restoreState(entry.state, restoreText),
        review: {
            listSummary: string(review.listSummary),
            previewText: restoreText(review.previewText),
            shouldRegister: boolean(review.shouldRegister),
            summary: string(review.summary),
        },
    };
}

function restoreState(
    value: unknown,
    restoreText: RestoreText,
): SessionDialogState {
    const state = record(value);
    const page = record(state.page);
    const subjectInfo = record(state.subjectInfo);
    if (
        typeof subjectInfo.namespaceNumber !== "number" ||
        !Number.isInteger(subjectInfo.namespaceNumber) ||
        !Array.isArray(state.creationTimes)
    )
        invalidSession();
    const creationTimes = new Map<string, Date>();
    for (const entry of state.creationTimes) {
        if (!Array.isArray(entry) || entry.length !== 2) invalidSession();
        const title = string(entry[0]);
        if (creationTimes.has(title)) invalidSession();
        creationTimes.set(title, date(entry[1]));
    }
    return {
        assessment: restoreAssessment(state.assessment),
        creationTimes,
        newPageList: restoreNewPageList(state.newPageList, restoreText),
        page: {
            ...(page.basetimestamp === undefined
                ? {}
                : { basetimestamp: string(page.basetimestamp) }),
            exists: boolean(page.exists),
            starttimestamp: string(page.starttimestamp),
            text: restoreText(page.text),
        },
        previewDirty: boolean(state.previewDirty),
        registration: restoreRegistration(state.registration, restoreText),
        subjectInfo: {
            creationDate: date(subjectInfo.creationDate),
            isRedirect: boolean(subjectInfo.isRedirect),
            listedTitle: string(subjectInfo.listedTitle),
            namespaceNumber: subjectInfo.namespaceNumber,
            targetTitle: string(subjectInfo.targetTitle),
        },
        subjectTitle: string(state.subjectTitle),
        summaryDirty: boolean(state.summaryDirty),
        talkTitle: string(state.talkTitle),
    };
}

function restoreAssessment(value: unknown): Assessment {
    const assessment = record(value);
    const maintenance = record(assessment.maintenance);
    return {
        className: string(assessment.className),
        importance: string(assessment.importance),
        maintenance: {
            cover: boolean(maintenance.cover),
            needsInfobox: boolean(maintenance.needsInfobox),
            reassess: boolean(maintenance.reassess),
            screenshot: boolean(maintenance.screenshot),
        },
        otherProjects: selectionMap(assessment.otherProjects),
        taskForces: selectionMap(assessment.taskForces),
    };
}

function restoreRegistration(
    value: unknown,
    restoreText: RestoreText,
): RegistrationResult {
    const registration = record(value);
    const existing =
        registration.existing === null ? null : record(registration.existing);
    return {
        alreadyRegistered: boolean(registration.alreadyRegistered),
        changed: boolean(registration.changed),
        earliestDate:
            registration.earliestDate === null
                ? null
                : date(registration.earliestDate),
        eligible: boolean(registration.eligible),
        existing:
            existing === null
                ? null
                : {
                      date: date(existing.date),
                      listedTitle: string(existing.listedTitle),
                  },
        proposedText: restoreText(registration.proposedText),
    };
}

function restoreNewPageList(
    value: unknown,
    restoreText: RestoreText,
): NewPageListSnapshot {
    const page = record(value);
    return {
        basetimestamp: string(page.basetimestamp),
        starttimestamp: string(page.starttimestamp),
        text: restoreText(page.text),
    };
}

function selectionMap(value: unknown): SelectionMap {
    return Object.fromEntries(
        Object.entries(record(value)).map(([key, selected]) => [
            key,
            boolean(selected),
        ]),
    );
}

function record(value: unknown): UnknownRecord {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        invalidSession();
    return value as UnknownRecord;
}

function string(value: unknown): string {
    if (typeof value !== "string") invalidSession();
    return value;
}

function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") invalidSession();
    return value;
}

function date(value: unknown): Date {
    const source = string(value);
    const parsed = new Date(source);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== source)
        invalidSession();
    return parsed;
}

function invalidSession(): never {
    throw new TypeError("Invalid assessment session data");
}
