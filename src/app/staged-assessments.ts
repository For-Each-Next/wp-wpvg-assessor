/** Keeps reviewed drafts in the background and submits one registration edit. */

import type {
    DialogSaveReview,
    DialogState,
    RegistrationSave,
    SaveReviewedDialog,
    ReportDialogSavePhase,
} from "./dialog-contracts.ts";
import type {
    AssessmentSessionStore,
    AssessmentStagingWorkflow,
    PreparedAssessmentBatch,
    StagedAssessment,
} from "./staging-contracts.ts";
import {
    getTitlesForDate,
    prepareNewPageListRegistration,
} from "../domain/new-page-list.ts";
import {
    createDefaultAssessment,
    hasDykInviteAtTop,
    parseAssessment,
} from "../domain/assessment.ts";
import {
    NOT_VIDEO_GAME_IMPORTANCE,
    type NewPageListSnapshot,
} from "../domain/types.ts";
import type { ProjectConfig } from "../domain/project-types.ts";
import type { Logger } from "../shared/logging.ts";

interface StagingOperations {
    session: AssessmentSessionStore;
    changedBatchMessage?: () => string;
    fetchNewPageList(api: mw.Api): Promise<NewPageListSnapshot>;
    fetchPageCreationTimes(
        api: mw.Api,
        titles: string[],
    ): Promise<Map<string, Date>>;
    saveRegistration(
        api: mw.Api,
        registration: RegistrationSave,
        summary: string,
    ): Promise<void>;
    saveReviewedDialog: SaveReviewedDialog;
    logger: Logger;
}

export function createAssessmentStagingWorkflow(
    operations: StagingOperations,
    config: ProjectConfig,
): AssessmentStagingWorkflow {
    const { session, logger } = operations;
    let submitting = false;

    function stage(state: DialogState, review: DialogSaveReview): void {
        if (submitting) {
            throw new Error("A staged submission is already running.");
        }
        const data = session.read();
        data.drafts = mergeCurrentDraft(
            data.drafts,
            captureDraft(state, review),
        );
        delete data.pages[state.talkTitle];
        session.write(data);
        logger.info("draft.staged", { itemCount: data.drafts.length });
    }

    function unstage(talkTitle: string): void {
        if (submitting) {
            throw new Error("A staged submission is already running.");
        }
        const data = session.read();
        const draft = data.drafts.find(
            (entry) => entry.state.talkTitle === talkTitle,
        );
        if (draft == null) {
            return;
        }
        // Reuse reads only if a save has not invalidated the session's snapshots.
        if (data.newPageList != null) {
            data.pages[talkTitle] = {
                ...cloneSessionSnapshot(draft.state),
                assessment: createDefaultAssessment(
                    config,
                    draft.state.page.text,
                ),
                previewDirty: false,
                summaryDirty: false,
            };
        } else {
            delete data.pages[talkTitle];
        }
        data.drafts = data.drafts.filter(
            (entry) => entry.state.talkTitle !== talkTitle,
        );
        session.write(data);
        logger.info("draft.unstaged", { itemCount: data.drafts.length });
    }

    async function prepare(
        state: DialogState,
        review: DialogSaveReview,
    ): Promise<PreparedAssessmentBatch> {
        const drafts = session.read().drafts;
        const entries = mergeCurrentDraft(drafts, captureDraft(state, review));
        const candidates = entries.filter((entry) =>
            canRegister(entry, config),
        );
        let registration: RegistrationSave | null = null;
        let registrationSummary = "";
        if (candidates.length > 0) {
            const snapshot = await operations.fetchNewPageList(state.api);
            const creationTimes = new Map<string, Date>();
            const neededTitles = new Set<string>();
            for (const entry of candidates) {
                for (const [title, date] of entry.state.creationTimes) {
                    creationTimes.set(title, date);
                }
                const { subjectInfo, subjectTitle } = entry.state;
                creationTimes.set(
                    subjectInfo.listedTitle || subjectTitle,
                    subjectInfo.creationDate,
                );
                for (const title of getTitlesForDate(
                    snapshot.text,
                    subjectInfo.creationDate,
                )) {
                    neededTitles.add(title);
                }
            }
            const missingTitles = [...neededTitles].filter(
                (title) => !creationTimes.has(title),
            );
            if (missingTitles.length > 0) {
                const fetched = await operations.fetchPageCreationTimes(
                    state.api,
                    missingTitles,
                );
                for (const [title, date] of fetched) {
                    creationTimes.set(title, date);
                }
            }
            let proposedText = snapshot.text;
            const summaries: string[] = [];
            for (const entry of candidates) {
                const { subjectInfo, subjectTitle } = entry.state;
                const result = prepareNewPageListRegistration({
                    creationDate: subjectInfo.creationDate,
                    creationTimes,
                    includeDykIcon: hasDykInviteAtTop(entry.review.previewText),
                    namespaceNumber: subjectInfo.namespaceNumber,
                    text: proposedText,
                    title: subjectInfo.listedTitle || subjectTitle,
                });
                if (result.changed) {
                    proposedText = result.proposedText;
                    summaries.push(entry.review.listSummary);
                }
            }
            if (proposedText !== snapshot.text) {
                registration = { snapshot, proposedText };
                registrationSummary = [
                    ...new Set(summaries.filter(Boolean)),
                ].join("; ");
            }
        }
        return {
            entries,
            registration,
            registrationSummary,
            draftSnapshot: fingerprint(drafts),
        };
    }

    async function save(
        api: mw.Api,
        batch: PreparedAssessmentBatch,
        reportPhase: ReportDialogSavePhase,
    ) {
        if (submitting) {
            throw new Error("A staged submission is already running.");
        }
        if (fingerprint(session.read().drafts) !== batch.draftSnapshot) {
            throw new Error(
                operations.changedBatchMessage?.() ??
                    "The staged pages changed. Review the batch again before saving.",
            );
        }
        submitting = true;
        let saved = false;
        try {
            const entries = batch.entries.map((entry) => ({
                state: cloneSessionSnapshot(entry.state),
                review: { ...entry.review },
            }));
            // Retain the current page too if any write fails or has an uncertain outcome.
            const data = session.read();
            data.drafts = structuredClone(entries);
            session.write(data);
            if (batch.registration != null) {
                reportPhase("registration");
                await operations.saveRegistration(
                    api,
                    batch.registration,
                    batch.registrationSummary,
                );
                saved = true;
            }
            // Registration is now confirmed (or unnecessary). Never repeat it after a talk failure.
            for (const entry of entries) {
                entry.review.shouldRegister = false;
            }
            const registeredData = session.read();
            registeredData.drafts = structuredClone(entries);
            registeredData.newPageList = null;
            registeredData.pages = {};
            session.write(registeredData);
            for (const entry of entries) {
                const outcome = await operations.saveReviewedDialog(
                    { ...structuredClone(entry.state), api },
                    { ...entry.review, shouldRegister: false },
                    reportPhase,
                );
                saved ||= outcome === "saved";
                const completedData = session.read();
                completedData.drafts = completedData.drafts.filter(
                    (draft) => draft.state.talkTitle !== entry.state.talkTitle,
                );
                session.write(completedData);
            }
            return saved ? ("saved" as const) : ("unchanged" as const);
        } finally {
            submitting = false;
        }
    }

    return {
        count: () => session.read().drafts.length,
        getReview: (talkTitle) => {
            const draft = session
                .read()
                .drafts.find((entry) => entry.state.talkTitle === talkTitle);
            return draft == null ? null : structuredClone(draft.review);
        },
        stage,
        unstage,
        prepare,
        save,
    };
}

interface CachedLoaderOperations {
    session: AssessmentSessionStore;
    getTalkPageTitle(title: mw.Title): string;
    loadDialogState(api: mw.Api, title: mw.Title): Promise<DialogState>;
    logger: Logger;
}

/** Successful snapshots and in-flight loads are reused until a save invalidates them. */
export function createCachedDialogLoader(operations: CachedLoaderOperations) {
    const pending = new Map<string, Promise<DialogState>>();
    let generation = 0;
    async function load(api: mw.Api, title: mw.Title): Promise<DialogState> {
        const talkTitle = operations.getTalkPageTitle(title);
        const data = operations.session.read();
        const cached =
            data.drafts.find((draft) => draft.state.talkTitle === talkTitle)
                ?.state ?? data.pages[talkTitle];
        if (cached != null) {
            return { ...structuredClone(cached), api };
        }
        let promise = pending.get(talkTitle);
        if (promise == null) {
            const startedGeneration = generation;
            promise = operations.loadDialogState(api, title).then((state) => {
                if (startedGeneration === generation) {
                    const loaded = operations.session.read();
                    loaded.pages[talkTitle] = cloneDialogSnapshot(state);
                    loaded.newPageList = structuredClone(state.newPageList);
                    try {
                        operations.session.write(loaded);
                    } catch (error) {
                        operations.logger.warn("dialog-cache.write.failed", {
                            error,
                        });
                    }
                }
                return state;
            });
            pending.set(talkTitle, promise);
            void promise
                .finally(() => {
                    if (pending.get(talkTitle) === promise)
                        pending.delete(talkTitle);
                })
                .catch(() => undefined);
        }
        return { ...cloneDialogSnapshot(await promise), api };
    }
    function invalidate(): void {
        generation += 1;
        pending.clear();
        try {
            const data = operations.session.read();
            data.pages = {};
            data.newPageList = null;
            operations.session.write(data);
        } catch (error) {
            operations.logger.warn("dialog-cache.invalidate.failed", { error });
        }
    }
    return { load, invalidate };
}

function captureDraft(
    state: DialogState,
    review: DialogSaveReview,
): StagedAssessment {
    return {
        state: cloneDialogSnapshot(state),
        review: structuredClone(review),
    };
}

function cloneDialogSnapshot({
    api: _api,
    ...snapshot
}: DialogState): Omit<DialogState, "api"> {
    return cloneSessionSnapshot(snapshot);
}

function cloneSessionSnapshot(
    snapshot: Omit<DialogState, "api">,
): Omit<DialogState, "api"> {
    // Capture plain values even when a UI supplies deeply reactive Vue state.
    return structuredClone({
        ...snapshot,
        assessment: JSON.parse(
            JSON.stringify(snapshot.assessment),
        ) as DialogState["assessment"],
        creationTimes: new Map(snapshot.creationTimes),
        newPageList: { ...snapshot.newPageList },
        page: { ...snapshot.page },
        registration: {
            ...snapshot.registration,
            existing:
                snapshot.registration.existing == null
                    ? null
                    : { ...snapshot.registration.existing },
        },
        subjectInfo: { ...snapshot.subjectInfo },
    });
}

function mergeCurrentDraft(
    drafts: StagedAssessment[],
    current: StagedAssessment,
): StagedAssessment[] {
    return [
        ...drafts.filter(
            (draft) => draft.state.talkTitle !== current.state.talkTitle,
        ),
        current,
    ];
}

function canRegister(entry: StagedAssessment, config: ProjectConfig): boolean {
    if (
        !entry.review.shouldRegister ||
        entry.state.assessment.importance === NOT_VIDEO_GAME_IMPORTANCE
    )
        return false;
    const assessment = parseAssessment(config, entry.review.previewText);
    return (
        assessment != null &&
        assessment.importance !== NOT_VIDEO_GAME_IMPORTANCE
    );
}

function fingerprint(drafts: StagedAssessment[]): string {
    return JSON.stringify(drafts, (_key, value: unknown) =>
        value instanceof Map ? [...value] : value,
    );
}
