/**
 * @file src/app/category-assessment.ts
 * Purpose: Coordinates category preloads, background saves, and failed draft recovery.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. CategoryAssessmentOperations
 * 4. createCategoryAssessmentWorkflow
 * 5. FailedAssessment
 * 6. createRecoveryCoordinator
 * 7. createSession
 * 8. capturePage
 * 9. normalizeSubject
 */

import type {
    CategoryAssessmentPage,
    CategoryAssessmentSession,
    CategoryAssessmentWorkflow,
    CategoryMemberBatch,
} from "./category-contracts.ts";
import type {
    AssessmentSaveReview,
    AssessmentState,
    SaveReviewedAssessment,
} from "./assessment-contracts.ts";
import type { Logger } from "../shared/logging.ts";

const PRELOAD_PAGE_COUNT = 3;
const MAX_BACKGROUND_SAVES = 3;

export interface CategoryAssessmentOperations {
    fetchCategoryMembers(
        api: mw.Api,
        continuation?: string,
    ): Promise<CategoryMemberBatch>;
    fetchArticleHtml(api: mw.Api, title: string): Promise<string>;
    loadAssessmentState(api: mw.Api, title: mw.Title): Promise<AssessmentState>;
    saveReviewedAssessment: SaveReviewedAssessment;
    onSaveFailed?(error: unknown): void;
    resolveTitle(title: string): mw.Title | null;
    logger: Logger;
}

/** Creates a fresh navigation session for each mounted category workspace. */
export function createCategoryAssessmentWorkflow(
    operations: CategoryAssessmentOperations,
): CategoryAssessmentWorkflow {
    const recovery = createRecoveryCoordinator(operations);
    return {
        async open(api) {
            const session = createSession(operations, recovery, api);
            try {
                await session.initialize();
            } catch (error) {
                session.dispose();
                throw error;
            }
            return session;
        },
    };
}

interface FailedAssessment {
    revision: number;
    page: CategoryAssessmentPage;
}

function createRecoveryCoordinator(operations: CategoryAssessmentOperations) {
    const failed = new Map<string, FailedAssessment>();
    const pending = new Map<string, CategoryAssessmentPage>();
    const listeners = new Set<() => void>();
    const queuedSaves: Array<() => Promise<void>> = [];
    let revision = 0;
    let activeSaves = 0;

    function startQueuedSaves(): void {
        while (activeSaves < MAX_BACKGROUND_SAVES && queuedSaves.length > 0) {
            const next = queuedSaves.shift()!;
            activeSaves += 1;
            function complete(): void {
                activeSaves -= 1;
                startQueuedSaves();
            }
            void next().then(complete, (error: unknown) => {
                operations.logger.error("category.background-save.failed", {
                    error,
                });
                complete();
            });
        }
    }

    function notify(): void {
        for (const listener of listeners) {
            try {
                listener();
            } catch (error) {
                operations.logger.warn("category.listener.failed", { error });
            }
        }
    }

    function save(
        page: CategoryAssessmentPage,
        review: AssessmentSaveReview,
    ): void {
        const talkTitle = page.state.talkTitle;
        if (pending.has(talkTitle)) {
            return;
        }
        const captured = capturePage(page, review);
        pending.set(talkTitle, captured);
        notify();
        const job = () =>
            Promise.resolve()
                .then(() =>
                    operations.saveReviewedAssessment(captured.state, {
                        ...captured.review!,
                    }),
                )
                .then(() => {
                    failed.delete(talkTitle);
                })
                .catch((error: unknown) => {
                    failed.set(talkTitle, {
                        revision: ++revision,
                        page: {
                            ...captured,
                            saveError:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                    });
                    operations.logger.error("category.save.failed", { error });
                    try {
                        operations.onSaveFailed?.(error);
                    } catch (notificationError) {
                        operations.logger.warn(
                            "category.save-notification.failed",
                            {
                                error: notificationError,
                            },
                        );
                    }
                })
                .finally(() => {
                    pending.delete(talkTitle);
                    notify();
                });
        queuedSaves.push(job);
        queueMicrotask(startQueuedSaves);
    }

    return {
        save,
        pendingSaveCount: () => pending.size,
        findAvailable(presented: Set<number>): FailedAssessment | null {
            return (
                [...failed.values()].find(
                    (entry) =>
                        !presented.has(entry.revision) &&
                        !pending.has(entry.page.state.talkTitle),
                ) ?? null
            );
        },
        isAvailable(entry: FailedAssessment): boolean {
            const title = entry.page.state.talkTitle;
            return (
                failed.get(title)?.revision === entry.revision &&
                !pending.has(title)
            );
        },
        hasSubject(subject: string): boolean {
            const key = normalizeSubject(subject);
            return (
                [...failed.values()].some(
                    (entry) =>
                        normalizeSubject(entry.page.state.subjectTitle) === key,
                ) ||
                [...pending.values()].some(
                    (page) => normalizeSubject(page.state.subjectTitle) === key,
                )
            );
        },
        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

function createSession(
    operations: CategoryAssessmentOperations,
    recovery: ReturnType<typeof createRecoveryCoordinator>,
    api: mw.Api,
) {
    const titles: mw.Title[] = [];
    const seenSubjects = new Set<string>();
    const requestedContinuations = new Set<string | undefined>();
    const pages = new Map<number, Promise<CategoryAssessmentPage | null>>();
    const presentedFailures = new Set<number>();
    const subscriptions = new Set<() => void>();
    let continuation: string | null | undefined;
    let pendingMembers: Promise<void> | null = null;
    let position = 0;
    let generation = 0;
    let disposed = false;
    let recovering = false;
    let currentFailure: FailedAssessment | null = null;
    let currentRecoveryPage: CategoryAssessmentPage | null = null;

    function showFailure(): CategoryAssessmentPage | null {
        if (disposed) {
            return null;
        }
        if (currentFailure != null && recovery.isAvailable(currentFailure)) {
            return currentRecoveryPage;
        }
        currentFailure = recovery.findAvailable(presentedFailures);
        currentRecoveryPage = null;
        if (currentFailure == null) {
            return null;
        }
        presentedFailures.add(currentFailure.revision);
        const page = currentFailure.page;
        currentRecoveryPage = {
            ...capturePage(page, page.review!),
            saveError: page.saveError,
            position: titles.length + presentedFailures.size,
        };
        currentRecoveryPage.state.api = api;
        return currentRecoveryPage;
    }

    async function fetchMoreMembers(): Promise<void> {
        if (disposed || continuation === null) {
            return;
        }
        if (pendingMembers != null) {
            return pendingMembers;
        }
        const requested = continuation;
        const pending = operations
            .fetchCategoryMembers(api, requested)
            .then((batch) => {
                if (disposed) {
                    return;
                }
                if (
                    batch.continuation != null &&
                    (batch.continuation === requested ||
                        requestedContinuations.has(batch.continuation))
                ) {
                    throw new Error(
                        "MediaWiki repeated a category continuation token.",
                    );
                }
                const resolved = batch.titles.map((name) => {
                    const title = operations.resolveTitle(name);
                    if (
                        title == null ||
                        (title.getNamespaceId() !== 0 &&
                            title.getNamespaceId() !== 1)
                    ) {
                        throw new Error(
                            "Unable to resolve a category member as an article or talk page.",
                        );
                    }
                    return title;
                });
                for (const title of resolved) {
                    const subject = normalizeSubject(title.getMainText());
                    if (
                        !seenSubjects.has(subject) &&
                        !recovery.hasSubject(subject)
                    ) {
                        titles.push(title);
                        seenSubjects.add(subject);
                    }
                }
                requestedContinuations.add(requested);
                continuation = batch.continuation;
            });
        pendingMembers = pending;
        try {
            await pending;
        } finally {
            if (pendingMembers === pending) {
                pendingMembers = null;
            }
        }
    }

    async function ensureMember(index: number): Promise<void> {
        while (!disposed && titles.length <= index && continuation !== null) {
            await fetchMoreMembers();
        }
    }

    function loadPage(index: number): Promise<CategoryAssessmentPage | null> {
        if (disposed || index < 0 || index >= titles.length) {
            return Promise.resolve(null);
        }
        const cached = pages.get(index);
        if (cached != null) {
            return cached;
        }
        const pending = operations
            .loadAssessmentState(api, titles[index])
            .then(async (state) => {
                if (disposed) {
                    return null;
                }
                const articleHtml = await operations.fetchArticleHtml(
                    api,
                    state.subjectTitle,
                );
                return disposed
                    ? null
                    : { state, articleHtml, position: index + 1 };
            })
            .catch((error: unknown) => {
                if (pages.get(index) === pending) {
                    pages.delete(index);
                }
                throw error;
            });
        pages.set(index, pending);
        // A later disposal or navigation may leave nobody awaiting this preload.
        void pending.catch(() => undefined);
        return pending;
    }

    async function preload(startedGeneration: number): Promise<void> {
        await ensureMember(position + PRELOAD_PAGE_COUNT);
        if (disposed || startedGeneration !== generation) {
            return;
        }
        const last = Math.min(position + PRELOAD_PAGE_COUNT, titles.length - 1);
        const loading: Promise<CategoryAssessmentPage | null>[] = [];
        for (let index = position + 1; index <= last; index += 1) {
            loading.push(loadPage(index));
        }
        await Promise.all(loading);
    }

    async function move(index: number): Promise<CategoryAssessmentPage | null> {
        const startedGeneration = ++generation;
        await ensureMember(index);
        if (disposed || startedGeneration !== generation) {
            return null;
        }
        if (index >= titles.length) {
            position = titles.length;
            recovering = true;
            return showFailure();
        }
        if (index < 0) {
            return null;
        }
        recovering = false;
        position = index;
        // Older read-only previews can be loaded again when navigating back.
        // Background jobs and recovery drafts own separate captured snapshots.
        for (const cachedIndex of pages.keys()) {
            if (cachedIndex < position - 1) {
                pages.delete(cachedIndex);
            }
        }
        const current = loadPage(position);
        void preload(startedGeneration).catch((error: unknown) => {
            if (!disposed && startedGeneration === generation) {
                operations.logger.warn("category.preload.failed", { error });
            }
        });
        const page = await current;
        return disposed || startedGeneration !== generation ? null : page;
    }

    const session: CategoryAssessmentSession & {
        initialize(): Promise<void>;
    } = {
        initialize: () => ensureMember(0),
        current: () =>
            recovering ? Promise.resolve(showFailure()) : move(position),
        next: () => {
            if (recovering) {
                currentFailure = null;
                currentRecoveryPage = null;
                return Promise.resolve(showFailure());
            }
            return move(position + 1);
        },
        previous: () => {
            currentFailure = null;
            currentRecoveryPage = null;
            return move(Math.max(0, position - 1));
        },
        hasPrevious: () => !disposed && position > 0,
        hasNext: () =>
            !disposed &&
            (position + 1 < titles.length ||
                continuation !== null ||
                recovery.findAvailable(presentedFailures) != null ||
                recovery.pendingSaveCount() > 0),
        hasFailedPages: () =>
            !disposed && recovery.findAvailable(presentedFailures) != null,
        pendingSaveCount: recovery.pendingSaveCount,
        save(page, review) {
            if (!disposed) {
                recovery.save(page, review);
            }
        },
        subscribe(listener) {
            if (disposed) {
                return () => undefined;
            }
            const unsubscribe = recovery.subscribe(listener);
            subscriptions.add(unsubscribe);
            return () => {
                unsubscribe();
                subscriptions.delete(unsubscribe);
            };
        },
        dispose() {
            disposed = true;
            generation += 1;
            pages.clear();
            titles.length = 0;
            seenSubjects.clear();
            currentFailure = null;
            currentRecoveryPage = null;
            for (const unsubscribe of subscriptions) {
                unsubscribe();
            }
            subscriptions.clear();
        },
    };
    return session;
}

/** Captures plain reviewed values before Vue state changes or the UI unmounts. */
function capturePage(
    page: CategoryAssessmentPage,
    review: AssessmentSaveReview,
): CategoryAssessmentPage {
    const state = page.state;
    const snapshot = structuredClone({
        assessment: JSON.parse(
            JSON.stringify(state.assessment),
        ) as AssessmentState["assessment"],
        page: { ...state.page },
        previewDirty: state.previewDirty,
        subjectTitle: state.subjectTitle,
        summaryDirty: state.summaryDirty,
        talkTitle: state.talkTitle,
    });
    return {
        state: { ...snapshot, api: state.api },
        articleHtml: page.articleHtml,
        position: page.position,
        review: { ...review },
    };
}

function normalizeSubject(subject: string): string {
    return subject.replace(/_/gu, " ");
}
