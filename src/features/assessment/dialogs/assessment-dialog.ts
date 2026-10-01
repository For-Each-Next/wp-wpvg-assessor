/**
 * Reactive presentation and review capture for the assessment dialog.
 */

import projectConfig from "../../../domain/project-config.ts";
import type {
    DialogSavePhase,
    DialogSaveReview,
    DialogState,
    PageAssessorRuntime,
} from "../../../app/dialog-contracts.ts";
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
    onSummaryInput: (value: string) => void;
    open: VueRef<boolean>;
    otherProjectOptions: ReadonlyArray<LabelledAssessmentOption>;
    previewText: VueRef<string>;
    registrationDisabled: VueRef<boolean>;
    registrationEligible: VueRef<boolean>;
    registrationLabel: VueRef<string>;
    saving: VueRef<boolean>;
    setClassName: (value: unknown) => void;
    setImportance: (value: unknown) => void;
    setListSummary: (value: string) => void;
    setRegister: (value: boolean) => void;
    setSelection: (group: SelectionGroup, id: string, value: boolean) => void;
    shouldRegister: VueRef<boolean>;
    showRegistrationPreview: VueRef<boolean>;
    status: VueRef<string>;
    statusType: VueRef<MessageType>;
    summary: VueRef<string>;
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
    const previewText = Vue.ref(createAssessmentPreview(state));
    const currentSource = Vue.ref(getTalkPageTopSection(state.page.text));
    const summary = Vue.ref(
        buildEditSummary(assessment, otherProjectOptions, state.page.text),
    );
    const listSummary = Vue.ref(buildRegistrationSummary(state));
    const shouldRegister = Vue.ref(
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
    const status = Vue.ref("");
    const statusType = Vue.ref<MessageType>("notice");
    function setStatus(text: string, isError: boolean): void {
        status.value = text;
        statusType.value = isError ? "error" : "notice";
        runtime.logger.debug("status.updated", { isError });
    }

    function refreshAssessment(): void {
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
        if (saving.value || typeof value !== "string") {
            return;
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
        if (!saving.value) {
            classInput.value = getClassLabel(assessment.className);
        }
    }

    function setImportance(value: unknown): void {
        if (saving.value || !isAssessmentImportance(value)) {
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
            (videoGamesDisabled.value && group !== "otherProjects")
        ) {
            return;
        }
        const selections = assessment[group] as SelectionMap;

        selections[id] = value;
        refreshAssessment();
    }

    function onPreviewInput(value: string): void {
        if (saving.value) {
            return;
        }
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
        summary.value = value;
        state.summaryDirty = true;
        runtime.logger.debug("assessment-summary.edited");
    }

    function setListSummary(value: string): void {
        listSummary.value = value;
    }

    function setRegister(value: boolean): void {
        if (saving.value || registrationDisabled.value) {
            return;
        }
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
        open.value = false;
        queueMicrotask(options.onClose);
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
            queueMicrotask(options.onClose);
        }
    }

    async function onSave(): Promise<void> {
        if (saving.value) {
            return;
        }
        runtime.logger.info("save.activated");
        saving.value = true;
        try {
            const outcome = await runtime.saveReviewedDialog(
                state,
                createSaveReview({
                    listSummary,
                    previewText,
                    registrationDisabled,
                    shouldRegister,
                    summary,
                }),
                reportSavePhase.bind(null, setStatus),
            );
            const text =
                outcome === "unchanged"
                    ? msg("dialog.unchanged")
                    : msg("dialog.saved");
            setStatus(text, false);
            setTimeout(finishSave, DIALOG_CLOSE_DELAY_MS);
        } catch (error) {
            runtime.logger.error("save.failed", { error });
            setStatus(getErrorMessage(error), true);
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
        return buildRegistrationComparison(
            state,
            registration.value,
            shouldRegister.value && !registrationDisabled.value,
        );
    });
    const talkComparison = Vue.computed(function getTalkComparison() {
        return compareWikitext(currentSource.value, previewText.value);
    });

    return {
        assessment,
        classInput,
        classMenuItems,
        classOptions,
        commitClassName,
        currentSource,
        dialogTitle: msg("dialog.title", { title: state.subjectTitle }),
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
        onSummaryInput,
        open,
        otherProjectOptions,
        previewText,
        registrationDisabled,
        registrationEligible,
        registrationLabel,
        saving,
        setClassName,
        setImportance,
        setListSummary,
        setRegister,
        setSelection,
        shouldRegister,
        showRegistrationPreview,
        status,
        statusType,
        summary,
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
