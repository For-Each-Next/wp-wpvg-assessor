/**
 * @file src/app/staging-contracts.ts
 * Purpose: Contracts for background assessment drafts and reviewed batch submission.
 *
 * Table of contents:
 * 1. Imports
 * 2. StagedAssessment
 * 3. AssessmentSessionData
 * 4. AssessmentSessionStore
 * 5. PreparedAssessmentBatch
 * 6. AssessmentStagingWorkflow
 */

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
    subscribe(listener: () => void): () => void;
    runExclusive<T>(operation: () => Promise<T>): Promise<T>;
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
    stage(state: DialogState, review: DialogSaveReview): Promise<void>;
    unstage(talkTitle: string): Promise<void>;
    subscribe(listener: () => void): () => void;
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
