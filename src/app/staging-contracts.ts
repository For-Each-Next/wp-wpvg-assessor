/** Contracts for background assessment drafts and reviewed batch submission. */

import type {
    DialogSaveOutcome,
    DialogSaveReview,
    DialogState,
    RegistrationSave,
    ReportDialogSavePhase,
} from "./dialog-contracts.ts";
import type { NewPageListSnapshot } from "../domain/types.ts";

export interface StagedAssessment {
    state: Omit<DialogState, "api">;
    review: DialogSaveReview;
}

export interface AssessmentSessionData {
    drafts: StagedAssessment[];
    pages: Record<string, Omit<DialogState, "api">>;
    newPageList: NewPageListSnapshot | null;
}

export interface AssessmentSessionStore {
    read(): AssessmentSessionData;
    write(data: AssessmentSessionData): void;
}

export interface PreparedAssessmentBatch {
    entries: StagedAssessment[];
    registration: RegistrationSave | null;
    registrationSummary: string;
    draftSnapshot: string;
}

export interface AssessmentStagingWorkflow {
    count(): number;
    getReview(talkTitle: string): DialogSaveReview | null;
    stage(state: DialogState, review: DialogSaveReview): void;
    unstage(talkTitle: string): void;
    prepare(
        state: DialogState,
        review: DialogSaveReview,
    ): Promise<PreparedAssessmentBatch>;
    save(
        api: mw.Api,
        batch: PreparedAssessmentBatch,
        reportPhase: ReportDialogSavePhase,
    ): Promise<DialogSaveOutcome>;
}
