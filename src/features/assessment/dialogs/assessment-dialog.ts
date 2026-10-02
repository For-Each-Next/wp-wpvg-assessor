/**
 * @file src/features/assessment/dialogs/assessment-dialog.ts
 * Purpose: Reactive presentation and review capture for the assessment dialog.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. MessageType
 * 4. SelectionGroup
 * 5. StagedTalkReview
 * 6. DialogAction
 * 7. AssessmentDialogOptions
 * 8. DialogBindings
 * 9. createAssessmentDialogComponent
 * 10. createAssessmentDialogBindings
 * 11. SaveReviewRefs
 * 12. createSaveReview
 * 13. createAssessmentPreview
 * 14. buildRegistrationSummary
 * 15. buildRegistrationComparison
 * 16. canShowRegistrationPreview
 * 17. isRegistrationDisabled
 * 18. getRegistrationLabel
 * 19. formatInterfaceDate
 * 20. getDefaultRegistration
 * 21. reportSavePhase
 * 22. logRegistrationPreview
 * 23. summarizeRegistration
 * 24. getClassLabel
 * 25. isAssessmentImportance
 * 26. getErrorMessage
 */

import projectConfig from "../../../domain/project-config.ts";
import type {
    DialogSavePhase,
    DialogSaveReview,
    DialogState,
    PageAssessorRuntime,
} from "../../../app/dialog-contracts.ts";
import type { PreparedAssessmentBatch } from "../../../app/staging-contracts.ts";
import {
    getExistingOtherProjectOptions,
    getTalkPageTopSection,
    normalizeAssessmentClass,
    parseAssessment,
    previewTalkPageTopSection,
    shouldRegisterByDefault,
} from "../../../domain/assessment.ts";
import {
    NOT_VIDEO_GAME_IMPORTANCE,
    type Assessment,
    type AssessmentImportance,
    type RegistrationResult,
    type SelectionMap,
} from "../../../domain/types.ts";
import {
    compareWikitext,
    type WikitextComparison,
} from "../../../domain/wikitext-comparison.ts";
import {
    buildNewPageListSummary,
    interfaceLocale,
    msg,
} from "../../../i18n/index.ts";
import {
    CLASS_OPTIONS,
    IMPORTANCE_OPTIONS,
    KNOWN_CLASS_OPTIONS,
    MAINTENANCE_OPTIONS,
    OTHER_PROJECT_OPTIONS,
    TASK_FORCE_OPTIONS,
    includeAssessmentValue,
    type LabelledAssessmentOption,
    type LabelledAssessmentValue,
} from "../assessment-options.ts";
import { buildEditSummary } from "../assessment-summary.ts";
import type { VueModule, VueRef } from "../../../platform/mediawiki/codex.ts";
import * as Comparison from "../components/wikitext-comparison.ts";

const DIALOG_CLOSE_DELAY_MS = 600;

const ASSESSMENT_DIALOG_TEMPLATE =
    typeof __VG_PAGE_ASSESSOR_DIALOG_TEMPLATE__ === "undefined"
        ? ""
        : __VG_PAGE_ASSESSOR_DIALOG_TEMPLATE__;

export const ASSESSMENT_DIALOG_STYLES =
    typeof __VG_PAGE_ASSESSOR_DIALOG_STYLES__ === "undefined"
        ? ""
        : __VG_PAGE_ASSESSOR_DIALOG_STYLES__;

type MessageType = "error" | "notice";
type SelectionGroup = "maintenance" | "otherProjects" | "taskForces";

interface StagedTalkReview {
    comparison: WikitextComparison;
    previewText: string;
    summary: string;
    talkTitle: string;
    title: string;
}

interface DialogAction {
    id: "cancel" | "stage" | "submit";
    action: "default" | "progressive";
    weight: "quiet" | "normal" | "primary";
    label: string;
    disabled: boolean;
    activate(): void | Promise<void>;
}

export interface AssessmentDialogOptions {
    currentNamespace: number;
    onClose: () => void;
    onSaved?: () => void;
    runtime: PageAssessorRuntime;
    state: DialogState;
}

interface DialogBindings {
    assessment: Assessment;
    classInput: VueRef<string>;
    classMenuItems: VueRef<Array<LabelledAssessmentValue<string>>>;
    classOptions: VueRef<Array<LabelledAssessmentValue<string>>>;
    commitClassName: () => void;
    currentSource: VueRef<string>;
    dialogTitle: string;
    footerActions: VueRef<DialogAction[]>;
    importanceOptions: VueRef<Array<LabelledAssessmentValue<string>>>;
    interfaceLocale: string;
    listComparison: VueRef<WikitextComparison>;
    listSummary: VueRef<string>;
    maintenanceOptions: typeof MAINTENANCE_OPTIONS;
    msg: typeof msg;
    onCancel: () => void;
    onOpenChange: (value: boolean) => void;
    onPreviewInput: (value: string) => void;
    onSave: () => Promise<void>;
    onStage: () => Promise<void>;
    onSummaryInput: (value: string) => void;
    open: VueRef<boolean>;
    otherProjectOptions: ReadonlyArray<LabelledAssessmentOption>;
    previewText: VueRef<string>;
    preparing: VueRef<boolean>;
    registrationDisabled: VueRef<boolean>;
    registrationEligible: VueRef<boolean>;
    registrationLabel: VueRef<string>;
    saving: VueRef<boolean>;
    setDisplayedListSummary: (value: string) => void;
    setClassName: (value: unknown) => void;
    setImportance: (value: unknown) => void;
    setListSummary: (value: string) => void;
    setRegister: (value: boolean) => void;
    setSelection: (group: SelectionGroup, id: string, value: boolean) => void;
    shouldRegister: VueRef<boolean>;
    showRegistrationPreview: VueRef<boolean>;
    showListReview: VueRef<boolean>;
    stagedTalkReviews: VueRef<StagedTalkReview[]>;
    stackedActions: VueRef<boolean>;
    stagingAvailable: boolean;
    stageLabel: VueRef<string>;
    status: VueRef<string>;
    statusType: VueRef<MessageType>;
    summary: VueRef<string>;
    submitLabel: VueRef<string>;
    displayedListSummary: VueRef<string>;
    talkComparison: VueRef<WikitextComparison>;
    taskForceOptions: typeof TASK_FORCE_OPTIONS;
    videoGamesDisabled: VueRef<boolean>;
}

/**
 * Creates the actual MediaWiki Vue component mounted by the UI adapter.
 *
 * @param Vue - Vue value.
 * @param options - Operation options.
 * @returns Value.
 */
export function createAssessmentDialogComponent(
    Vue: VueModule,
    options: AssessmentDialogOptions,
): unknown {
    function setup(): DialogBindings {
        return createAssessmentDialogBindings(Vue, options);
    }

    return Vue.defineComponent({
        components: {
            WikitextComparison:
                Comparison.createWikitextComparisonComponent(Vue),
        },
        name: "VgPageAssessmentDialog",
        setup,
        template: ASSESSMENT_DIALOG_TEMPLATE,
    });
}

/**
 * Creates reactive dialog bindings without acquiring external services.
 *
 * @param Vue - Vue value.
 * @param options - Operation options.
 * @returns Value.
 */
export function createAssessmentDialogBindings(
    Vue: VueModule,
    options: AssessmentDialogOptions,
): DialogBindings {
    const { runtime, state } = options;
    const restoredReview = runtime.staging?.getReview(state.talkTitle);
    const assessment = Vue.reactive(state.assessment);
    const videoGamesDisabled = Vue.computed(function isVideoGamesDisabled() {
        return assessment.importance === NOT_VIDEO_GAME_IMPORTANCE;
    });
    const classInput = Vue.ref(getClassLabel(assessment.className));
    const classOptions = Vue.computed(function getClassOptions() {
        return [...CLASS_OPTIONS];
    });
    const classMenuItems = Vue.computed(function getClassMenuItems() {
        return classOptions.value.map((option) => ({
            label: option.label,
            value: option.label,
        }));
    });
    const importanceOptions = Vue.computed(function getImportanceOptions() {
        return includeAssessmentValue(
            IMPORTANCE_OPTIONS,
            assessment.importance,
        );
    });
    const otherProjectOptions = [
        ...OTHER_PROJECT_OPTIONS,
        ...getExistingOtherProjectOptions(state.page.text, projectConfig),
    ];
    const open = Vue.ref(true);
    const previewText = Vue.ref(
        restoredReview?.previewText ?? createAssessmentPreview(state),
    );
    const currentSource = Vue.ref(getTalkPageTopSection(state.page.text));
    const summary = Vue.ref(
        restoredReview?.summary ??
            buildEditSummary(assessment, otherProjectOptions, state.page.text),
    );
    const listSummary = Vue.ref(
        restoredReview?.listSummary ?? buildRegistrationSummary(state),
    );
    const shouldRegister = Vue.ref(
        restoredReview?.shouldRegister ??
            getDefaultRegistration(state, options.currentNamespace),
    );
    const registration = Vue.ref(state.registration);
    const videoGamesAvailable = Vue.computed(function isVideoGamesAvailable() {
        const parsed = parseAssessment(projectConfig, previewText.value);
        return (
            !videoGamesDisabled.value &&
            parsed != null &&
            parsed.importance !== NOT_VIDEO_GAME_IMPORTANCE
        );
    });
    const saving = Vue.ref(false);
    const preparing = Vue.ref(false);
    let preparedBatch: PreparedAssessmentBatch | null = null;
    const batchPrepared = Vue.ref(false);
    const preparedListSummary = Vue.ref("");
    const stagedCount = Vue.ref(runtime.staging?.count() ?? 0);
    const currentStaged = Vue.ref(restoredReview != null);
    let active = true;
    let reviewRevision = 0;
    let batchPreparationPending = false;
    let stagingPending = false;
    let unsubscribeStaging: (() => void) | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const actionLayout =
        typeof matchMedia === "function"
            ? matchMedia("(max-width: 40rem)")
            : undefined;
    const stackedActions = Vue.ref(actionLayout?.matches ?? false);
    const updateActionLayout = (): void => {
        stackedActions.value = actionLayout?.matches ?? false;
    };
    actionLayout?.addEventListener("change", updateActionLayout);
    Vue.onUnmounted(release);
    const status = Vue.ref("");
    const statusType = Vue.ref<MessageType>("notice");
    function setStatus(text: string, isError: boolean): void {
        status.value = text;
        statusType.value = isError ? "error" : "notice";
        runtime.logger.debug("status.updated", { isError });
    }

    function invalidatePreparedBatch(): void {
        reviewRevision += 1;
        preparedBatch = null;
        batchPrepared.value = false;
        preparedListSummary.value = "";
        if (statusType.value !== "error") {
            status.value = "";
        }
    }

    function refreshStagedCount(): void {
        stagedCount.value = runtime.staging?.count() ?? 0;
        currentStaged.value =
            runtime.staging?.getReview(state.talkTitle) != null;
    }

    function onStagedQueueChange(): void {
        if (!active) {
            return;
        }
        try {
            refreshStagedCount();
            if (saving.value || stagingPending) {
                return;
            }
            const hadBatchReview =
                preparedBatch != null || batchPreparationPending;
            invalidatePreparedBatch();
            if (batchPreparationPending) {
                batchPreparationPending = false;
                preparing.value = false;
            }
            if (hadBatchReview) {
                setStatus(msg("dialog.batchChanged"), false);
            }
        } catch (error) {
            runtime.logger.error("assessment.queue-refresh.failed", { error });
            setStatus(getErrorMessage(error), true);
        }
    }

    function refreshAssessment(): void {
        invalidatePreparedBatch();
        runtime.logger.debug("assessment.changed", {
            className: assessment.className,
            importance: assessment.importance,
        });
        const previewSource = state.previewDirty
            ? previewText.value
            : state.page.text;
        previewText.value = previewTalkPageTopSection(
            previewSource,
            assessment,
            projectConfig,
        );
        runtime.logger.debug("assessment-preview.updated", {
            fromManualSource: state.previewDirty,
            characterCount: previewText.value.length,
        });
        currentSource.value = getTalkPageTopSection(state.page.text);
        runtime.logger.debug("talk-diff.updated", {
            characterCount: currentSource.value.length,
        });
        if (!state.summaryDirty) {
            summary.value = buildEditSummary(
                assessment,
                otherProjectOptions,
                state.page.text,
            );
            runtime.logger.debug("assessment-summary.updated", {
                characterCount: summary.value.length,
            });
        } else {
            runtime.logger.debug("assessment-summary.update.skipped");
        }
        if (registrationDisabled.value) {
            shouldRegister.value = false;
        }
        logRegistrationPreview(
            runtime,
            registration.value,
            shouldRegister,
            showRegistrationPreview.value,
        );
    }

    function setClassName(value: unknown): void {
        if (saving.value || preparing.value || typeof value !== "string") {
            return;
        }
        if (classInput.value !== value) {
            invalidatePreparedBatch();
        }
        classInput.value = value;
        const knownOption = KNOWN_CLASS_OPTIONS.find(
            (option) => option.label === value,
        );
        const className = normalizeAssessmentClass(knownOption?.value ?? value);
        if (className == null || className === assessment.className) {
            return;
        }
        assessment.className = className;
        refreshAssessment();
    }

    function commitClassName(): void {
        if (!saving.value && !preparing.value) {
            classInput.value = getClassLabel(assessment.className);
        }
    }

    function setImportance(value: unknown): void {
        if (saving.value || preparing.value || !isAssessmentImportance(value)) {
            return;
        }
        assessment.importance = value;
        refreshAssessment();
    }

    function setSelection(
        group: SelectionGroup,
        id: string,
        value: boolean,
    ): void {
        if (
            saving.value ||
            preparing.value ||
            (videoGamesDisabled.value && group !== "otherProjects")
        ) {
            return;
        }
        const selections = assessment[group] as SelectionMap;

        selections[id] = value;
        refreshAssessment();
    }

    function onPreviewInput(value: string): void {
        if (saving.value || preparing.value) {
            return;
        }
        invalidatePreparedBatch();
        previewText.value = value;
        state.previewDirty = true;
        const parsed = parseAssessment(projectConfig, value);
        if (parsed != null) {
            Object.assign(assessment, parsed);
            classInput.value = getClassLabel(assessment.className);
            if (!state.summaryDirty) {
                summary.value = buildEditSummary(
                    assessment,
                    otherProjectOptions,
                    state.page.text,
                );
            }
        }
        if (registrationDisabled.value) {
            shouldRegister.value = false;
        }
        runtime.logger.debug("lead-source.edited");
        runtime.logger.debug("talk-diff.updated", {
            characterCount: currentSource.value.length,
        });
    }

    function onSummaryInput(value: string): void {
        if (saving.value || preparing.value) {
            return;
        }
        invalidatePreparedBatch();
        summary.value = value;
        state.summaryDirty = true;
        runtime.logger.debug("assessment-summary.edited");
    }

    function setListSummary(value: string): void {
        if (saving.value || preparing.value) {
            return;
        }
        invalidatePreparedBatch();
        listSummary.value = value;
    }

    function setDisplayedListSummary(value: string): void {
        if (saving.value || preparing.value) {
            return;
        }
        if (preparedBatch != null) {
            preparedBatch.registrationSummary = value;
            preparedListSummary.value = value;
            return;
        }
        setListSummary(value);
    }

    function setRegister(value: boolean): void {
        if (saving.value || preparing.value || registrationDisabled.value) {
            return;
        }
        invalidatePreparedBatch();
        shouldRegister.value = value;
        runtime.logger.debug("registration-selection.changed", { value });
        logRegistrationPreview(
            runtime,
            registration.value,
            shouldRegister,
            showRegistrationPreview.value,
        );
    }

    function close(): void {
        if (!active) {
            return;
        }
        open.value = false;
        release();
        queueMicrotask(options.onClose);
    }

    function release(): void {
        active = false;
        actionLayout?.removeEventListener("change", updateActionLayout);
        unsubscribeStaging?.();
        unsubscribeStaging = undefined;
        if (closeTimer != null) {
            clearTimeout(closeTimer);
            closeTimer = undefined;
        }
    }

    function onCancel(): void {
        if (saving.value) {
            return;
        }
        runtime.logger.info("dialog.cancelled");
        close();
    }

    function onOpenChange(value: boolean): void {
        if (saving.value && !value) {
            open.value = true;
            return;
        }
        open.value = value;
        if (!value) {
            close();
        }
    }

    function captureReview(): DialogSaveReview {
        return createSaveReview({
            listSummary,
            previewText,
            registrationDisabled,
            shouldRegister,
            summary,
        });
    }

    async function onStage(): Promise<void> {
        if (saving.value || preparing.value || !active || !runtime.staging) {
            return;
        }
        const removing = currentStaged.value;
        const review = captureReview();
        stagingPending = true;
        preparing.value = true;
        try {
            if (removing) {
                await runtime.staging.unstage(state.talkTitle);
            } else {
                await runtime.staging.stage(state, review);
            }
            if (!active) {
                return;
            }
            invalidatePreparedBatch();
            refreshStagedCount();
            if (!removing) {
                runtime.logger.info("assessment.staged");
            }
            setStatus(removing ? "" : msg("dialog.staged"), false);
        } catch (error) {
            if (!active) {
                return;
            }
            runtime.logger.error("assessment.stage.failed", { error });
            setStatus(getErrorMessage(error), true);
        } finally {
            stagingPending = false;
            if (active) {
                preparing.value = false;
            }
        }
    }

    async function prepareBatch(review: DialogSaveReview): Promise<void> {
        const staging = runtime.staging;
        if (staging == null) {
            return;
        }
        const revision = reviewRevision;
        batchPreparationPending = true;
        preparing.value = true;
        setStatus(msg("dialog.preparingBatch"), false);
        try {
            const batch = await staging.prepare(state, review);
            if (!active || !open.value || revision !== reviewRevision) {
                return;
            }
            preparedBatch = batch;
            batchPrepared.value = true;
            preparedListSummary.value = batch.registrationSummary;
            refreshStagedCount();
            setStatus(msg("dialog.reviewBatch"), false);
        } catch (error) {
            if (active && revision === reviewRevision) {
                runtime.logger.error("batch.prepare.failed", { error });
                setStatus(getErrorMessage(error), true);
            }
        } finally {
            if (active && revision === reviewRevision) {
                batchPreparationPending = false;
                preparing.value = false;
            }
        }
    }

    async function onSave(): Promise<void> {
        if (saving.value || preparing.value || !active) {
            return;
        }
        const review = captureReview();
        if (runtime.staging != null && runtime.staging.count() > 0) {
            if (preparedBatch == null) {
                await prepareBatch(review);
                return;
            }
        }
        runtime.logger.info("save.activated");
        const submittedBatch = preparedBatch;
        saving.value = true;
        try {
            const reportPhase = reportSavePhase.bind(null, setStatus);
            const outcome =
                submittedBatch != null && runtime.staging != null
                    ? await runtime.staging.save(
                          state.api,
                          submittedBatch,
                          reportPhase,
                      )
                    : await runtime.saveReviewedDialog(
                          state,
                          review,
                          reportPhase,
                      );
            if (!active) {
                return;
            }
            refreshStagedCount();
            const text =
                outcome === "unchanged"
                    ? msg("dialog.unchanged")
                    : msg("dialog.saved");
            setStatus(text, false);
            closeTimer = setTimeout(finishSave, DIALOG_CLOSE_DELAY_MS);
        } catch (error) {
            preparedBatch = null;
            batchPrepared.value = false;
            preparedListSummary.value = "";
            if (!active) {
                return;
            }
            refreshStagedCount();
            const remainingReview = runtime.staging?.getReview(state.talkTitle);
            if (submittedBatch != null && remainingReview != null) {
                shouldRegister.value = remainingReview.shouldRegister;
            }
            runtime.logger.error("save.failed", { error });
            setStatus(
                submittedBatch == null
                    ? getErrorMessage(error)
                    : msg("dialog.submitStopped", {
                          count: stagedCount.value,
                          error: getErrorMessage(error),
                      }),
                true,
            );
            saving.value = false;
        }
    }

    function finishSave(): void {
        close();
        if (options.onSaved != null) {
            queueMicrotask(options.onSaved);
        }
    }

    const registrationDisabled = Vue.computed(function isDisabled(): boolean {
        return (
            !videoGamesAvailable.value ||
            isRegistrationDisabled(registration.value)
        );
    });
    const registrationEligible = Vue.computed(function isEligible(): boolean {
        return videoGamesAvailable.value && registration.value.eligible;
    });
    const showRegistrationPreview = Vue.computed(function canPreview() {
        return (
            videoGamesAvailable.value &&
            canShowRegistrationPreview(registration.value)
        );
    });
    const registrationLabel = Vue.computed(function getLabel() {
        if (!videoGamesAvailable.value) {
            return msg("registration.noVideoGamesBanner");
        }
        return getRegistrationLabel(
            registration.value,
            state.subjectInfo.creationDate,
        );
    });
    const listComparison = Vue.computed(function getComparison() {
        if (batchPrepared.value && preparedBatch != null) {
            const batchRegistration = preparedBatch.registration;
            return batchRegistration == null
                ? { changed: false, rows: [] }
                : compareWikitext(
                      batchRegistration.snapshot.text,
                      batchRegistration.proposedText,
                  );
        }
        return buildRegistrationComparison(
            state,
            registration.value,
            shouldRegister.value && !registrationDisabled.value,
        );
    });
    const talkComparison = Vue.computed(function getTalkComparison() {
        return compareWikitext(currentSource.value, previewText.value);
    });
    const submitLabel = Vue.computed(function getSubmitLabel() {
        const otherPages = Math.max(
            0,
            stagedCount.value - (currentStaged.value ? 1 : 0),
        );
        return otherPages > 0
            ? msg("dialog.submitWithCount", { count: otherPages })
            : msg("dialog.save");
    });
    const stageLabel = Vue.computed(function getStageLabel() {
        return msg(currentStaged.value ? "dialog.unstage" : "dialog.stage");
    });
    const footerActions = Vue.computed<DialogAction[]>(() => {
        const actions: DialogAction[] = [
            {
                id: "cancel",
                action: "default",
                weight: "quiet",
                label: msg("dialog.cancel"),
                disabled: saving.value,
                activate: onCancel,
            },
        ];
        if (runtime.staging != null) {
            actions.push({
                id: "stage",
                action: "default",
                weight: "normal",
                label: stageLabel.value,
                disabled: saving.value || preparing.value,
                activate: onStage,
            });
        }
        actions.push({
            id: "submit",
            action: "progressive",
            weight: "primary",
            label: submitLabel.value,
            disabled: saving.value || preparing.value,
            activate: onSave,
        });
        // Change DOM order along with layout so keyboard and visual order agree.
        return stackedActions.value ? actions.reverse() : actions;
    });
    const displayedListSummary = Vue.computed(function getListSummary() {
        return !batchPrepared.value
            ? listSummary.value
            : preparedListSummary.value;
    });
    const showListReview = Vue.computed(function canReviewList() {
        return !batchPrepared.value
            ? showRegistrationPreview.value && shouldRegister.value
            : preparedBatch?.registration != null;
    });
    const stagedTalkReviews = Vue.computed(function getStagedTalkReviews() {
        return (batchPrepared.value ? (preparedBatch?.entries ?? []) : [])
            .filter((entry) => entry.state.talkTitle !== state.talkTitle)
            .map((entry) => ({
                comparison: compareWikitext(
                    getTalkPageTopSection(entry.state.page.text),
                    entry.review.previewText,
                ),
                previewText: entry.review.previewText,
                summary: entry.review.summary,
                talkTitle: entry.state.talkTitle,
                title: entry.state.subjectTitle,
            }));
    });

    unsubscribeStaging = runtime.staging?.subscribe(onStagedQueueChange);

    return {
        assessment,
        classInput,
        classMenuItems,
        classOptions,
        commitClassName,
        currentSource,
        dialogTitle: msg("dialog.title", { title: state.subjectTitle }),
        displayedListSummary,
        footerActions,
        importanceOptions,
        interfaceLocale,
        listComparison,
        listSummary,
        maintenanceOptions: MAINTENANCE_OPTIONS,
        msg,
        onCancel,
        onOpenChange,
        onPreviewInput,
        onSave,
        onStage,
        onSummaryInput,
        open,
        otherProjectOptions,
        previewText,
        preparing,
        registrationDisabled,
        registrationEligible,
        registrationLabel,
        saving,
        setDisplayedListSummary,
        setClassName,
        setImportance,
        setListSummary,
        setRegister,
        setSelection,
        shouldRegister,
        showRegistrationPreview,
        showListReview,
        stagedTalkReviews,
        stackedActions,
        stagingAvailable: runtime.staging != null,
        stageLabel,
        status,
        statusType,
        summary,
        submitLabel,
        talkComparison,
        taskForceOptions: TASK_FORCE_OPTIONS,
        videoGamesDisabled,
    };
}

interface SaveReviewRefs {
    listSummary: VueRef<string>;
    previewText: VueRef<string>;
    registrationDisabled: VueRef<boolean>;
    shouldRegister: VueRef<boolean>;
    summary: VueRef<string>;
}

function createSaveReview(refs: SaveReviewRefs): DialogSaveReview {
    return {
        listSummary: refs.listSummary.value.trim(),
        previewText: refs.previewText.value,
        shouldRegister:
            refs.shouldRegister.value && !refs.registrationDisabled.value,
        summary: refs.summary.value.trim(),
    };
}

function createAssessmentPreview(state: DialogState): string {
    return previewTalkPageTopSection(
        state.page.text,
        state.assessment,
        projectConfig,
    );
}

function buildRegistrationSummary(state: DialogState): string {
    const title = state.subjectInfo.listedTitle || state.subjectTitle;
    return buildNewPageListSummary(title, state.subjectInfo.creationDate);
}

function buildRegistrationComparison(
    state: DialogState,
    registration: RegistrationResult,
    shouldRegister: boolean,
): WikitextComparison {
    if (!shouldRegister || !registration.changed) {
        return { changed: false, rows: [] };
    }
    return compareWikitext(state.newPageList.text, registration.proposedText);
}

function canShowRegistrationPreview(registration: RegistrationResult): boolean {
    return registration.eligible && !registration.alreadyRegistered;
}

function isRegistrationDisabled(registration: RegistrationResult): boolean {
    return !registration.eligible || registration.alreadyRegistered;
}

function getRegistrationLabel(
    registration: RegistrationResult,
    creationDate: Date,
): string {
    if (!registration.eligible) {
        return msg("registration.ineligible", {
            date: formatInterfaceDate(creationDate, true),
        });
    }
    const created = msg("registration.createdOn", {
        date: formatInterfaceDate(creationDate),
    });
    if (
        registration.existing?.date != null &&
        registration.existing.listedTitle
    ) {
        return msg("registration.existing", {
            date: formatInterfaceDate(registration.existing.date),
            title: registration.existing.listedTitle,
        });
    }
    if (registration.alreadyRegistered) {
        return msg("registration.alreadyRegistered");
    }
    return msg("registration.register", { created });
}

function formatInterfaceDate(date: Date, includeYear = false): string {
    return new Intl.DateTimeFormat(interfaceLocale, {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
        ...(includeYear ? { year: "numeric" } : {}),
    }).format(date);
}

function getDefaultRegistration(
    state: DialogState,
    currentNamespace: number,
): boolean {
    const registration = state.registration;
    return (
        shouldRegisterByDefault(currentNamespace, state.subjectTitle) &&
        state.assessment.importance !== NOT_VIDEO_GAME_IMPORTANCE &&
        registration.eligible &&
        !registration.alreadyRegistered
    );
}

function reportSavePhase(
    setStatus: (text: string, isError: boolean) => void,
    phase: DialogSavePhase,
): void {
    const text =
        phase === "registration"
            ? msg("dialog.updatingNewPageList")
            : msg("dialog.savingTalkPage");
    setStatus(text, false);
}

function logRegistrationPreview(
    runtime: PageAssessorRuntime,
    registration: RegistrationResult,
    shouldRegister: VueRef<boolean>,
    showPreview: boolean,
): void {
    const visibility = showPreview ? "visible" : "hidden";
    runtime.logger.debug("registration-preview.updated", {
        registration: summarizeRegistration(registration),
        shouldRegister: shouldRegister.value,
        visibility,
    });
}

function summarizeRegistration(
    registration: RegistrationResult,
): Record<string, unknown> {
    return {
        alreadyRegistered: registration?.alreadyRegistered,
        changed: registration?.changed,
        earliestDate: registration?.earliestDate?.toISOString(),
        eligible: registration?.eligible,
        existing: registration?.existing,
        proposedCharacterCount: registration?.proposedText?.length,
    };
}

function getClassLabel(value: string): string {
    return (
        KNOWN_CLASS_OPTIONS.find((option) => option.value === value)?.label ??
        value
    );
}

function isAssessmentImportance(value: unknown): value is AssessmentImportance {
    return typeof value === "string";
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
