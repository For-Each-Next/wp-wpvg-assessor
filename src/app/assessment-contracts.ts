/**
 * @file src/app/assessment-contracts.ts
 * Purpose: Talk-page assessment data shared by the assessment-only workflow and UI.
 *
 * Table of contents:
 * 1. Imports
 * 2. AssessmentState
 * 3. AssessmentSaveReview
 * 4. SaveReviewedAssessment
 */

import type { Assessment, PageSnapshot } from "../domain/types.ts";
import type { DialogSaveOutcome } from "./dialog-contracts.ts";

export interface AssessmentState {
    api: mw.Api;
    assessment: Assessment;
    page: PageSnapshot;
    previewDirty: boolean;
    subjectTitle: string;
    summaryDirty: boolean;
    talkTitle: string;
}

export interface AssessmentSaveReview {
    previewText: string;
    summary: string;
}

export type SaveReviewedAssessment = (
    state: AssessmentState,
    review: AssessmentSaveReview,
) => Promise<DialogSaveOutcome>;
