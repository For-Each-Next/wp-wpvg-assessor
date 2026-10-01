/**
 * Contracts shared by composition, dialog UI, and workflows.
 */

import type {
    NewPageListSnapshot,
    PreparedTalkEdit,
    RegistrationResult,
    SubjectPageInfo,
} from "../domain/types.ts";
import type { Logger } from "../shared/logging.ts";
import type { ActionNotifier } from "../shared/notifications.ts";
import type { AssessmentStagingWorkflow } from "./staging-contracts.ts";
import type {
    CategoryAssessmentWorkflow,
    CategoryArticleStyles,
} from "./category-contracts.ts";
import type {
    AssessmentSaveReview,
    AssessmentState,
} from "./assessment-contracts.ts";

export interface DialogState extends AssessmentState {
    creationTimes: Map<string, Date>;
    newPageList: NewPageListSnapshot;
    registration: RegistrationResult;
    subjectInfo: SubjectPageInfo;
}

/** Browser context created for one dialog-opening attempt. */
export interface DialogPageContext {
    api: mw.Api;
    pageName: string;
    title: mw.Title | null;
}

type CreateDialogPageContext = () => DialogPageContext;

export interface RegistrationSave {
    proposedText: string;
    snapshot: NewPageListSnapshot;
}

interface DialogStateWorkflow {
    loadDialogState(api: mw.Api, currentTitle: mw.Title): Promise<DialogState>;
}

export interface DialogWorkflow extends DialogStateWorkflow {
    getRegistrationSave(state: DialogState): RegistrationSave | null;
    saveRegistration(
        api: mw.Api,
        registration: RegistrationSave,
        summary: string,
    ): Promise<void>;
}

export interface DialogSaveReview extends AssessmentSaveReview {
    listSummary: string;
    shouldRegister: boolean;
}

export type DialogSavePhase = "registration" | "talk-page";
export type DialogSaveOutcome = "saved" | "unchanged";
export type ReportDialogSavePhase = (phase: DialogSavePhase) => void;

export type SaveTalkAssessment = (
    api: mw.Api,
    edit: PreparedTalkEdit,
) => Promise<string>;

export type SaveReviewedDialog = (
    state: DialogState,
    review: DialogSaveReview,
    reportPhase: ReportDialogSavePhase,
) => Promise<DialogSaveOutcome>;

export interface PageAssessorRuntime extends DialogStateWorkflow {
    createDialogPageContext: CreateDialogPageContext;
    logger: Logger;
    notify: ActionNotifier;
    saveReviewedDialog: SaveReviewedDialog;
    staging?: AssessmentStagingWorkflow;
    categoryAssessment?: CategoryAssessmentWorkflow;
    getArticlePreviewStyles?(): CategoryArticleStyles;
}
