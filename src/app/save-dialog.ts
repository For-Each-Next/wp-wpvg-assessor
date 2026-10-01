/**
 * Sequences writes from the exact values reviewed in the dialog.
 */

import type {
    DialogSaveOutcome,
    DialogSaveReview,
    DialogState,
    RegistrationSave,
    ReportDialogSavePhase,
    SaveReviewedDialog,
    SaveTalkAssessment,
} from "./dialog-contracts.ts";
import {
    getTalkPageTopSection,
    isEmptyImportanceOnlyChange,
    parseAssessment,
} from "../domain/assessment.ts";
import type { ProjectConfig } from "../domain/project-types.ts";
import { NOT_VIDEO_GAME_IMPORTANCE } from "../domain/types.ts";
import type { Logger } from "../shared/logging.ts";

const DEFAULT_EDIT_SUMMARY =
    "Tag project banners " +
    "[[:m:User:For Each ... Next/global.js/vg page assessor.js|🍄]]";

export interface ReviewedDialogSaveOperations {
    buildRegistrationSummary(title: string, creationDate: Date): string;
    getRegistrationSave(state: DialogState): RegistrationSave | null;
    logger: Logger;
    saveRegistration(
        api: mw.Api,
        registration: RegistrationSave,
        summary: string,
    ): Promise<void>;
    saveTalkAssessment: SaveTalkAssessment;
}

/**
 * Composes the reviewed-dialog save transaction.
 *
 * @param operations - Operations value.
 * @param projectConfig - Assessment project configuration.
 * @returns Operation result.
 */
export function createReviewedDialogSaveWorkflow(
    operations: ReviewedDialogSaveOperations,
    projectConfig: ProjectConfig,
): SaveReviewedDialog {
    return saveReviewedDialog.bind(null, operations, projectConfig);
}

async function saveReviewedDialog(
    operations: ReviewedDialogSaveOperations,
    projectConfig: ProjectConfig,
    state: DialogState,
    review: DialogSaveReview,
    reportPhase: ReportDialogSavePhase,
): Promise<DialogSaveOutcome> {
    operations.logger.info("save.started");
    operations.logger.debug("save.options", {
        characterCount: review.previewText.length,
        registration: summarizeRegistration(state),
        shouldRegister: review.shouldRegister,
    });

    const registered = await saveRegistration(
        operations,
        projectConfig,
        state,
        review,
        reportPhase,
    );

    if (isUnchangedTalkReview(state, review.previewText)) {
        operations.logger.info("save.talk-page.skipped");
        return registered ? "saved" : "unchanged";
    }

    reportPhase("talk-page");
    operations.logger.info("save.talk-page.started");
    await operations.saveTalkAssessment(state.api, {
        summary: review.summary || DEFAULT_EDIT_SUMMARY,
        title: state.talkTitle,
        topSection: review.previewText,
    });
    operations.logger.info("save.completed");

    return "saved";
}

async function saveRegistration(
    operations: ReviewedDialogSaveOperations,
    projectConfig: ProjectConfig,
    state: DialogState,
    review: DialogSaveReview,
    reportPhase: ReportDialogSavePhase,
): Promise<boolean> {
    if (
        !review.shouldRegister ||
        !isReviewedVideoGameAssessment(state, review.previewText, projectConfig)
    ) {
        return false;
    }

    const registration = operations.getRegistrationSave(state);
    if (registration == null) {
        return false;
    }

    reportPhase("registration");
    operations.logger.info("save.registration.started");
    await operations.saveRegistration(
        state.api,
        registration,
        review.listSummary ||
            buildDefaultRegistrationSummary(operations, state),
    );
    return true;
}

function isReviewedVideoGameAssessment(
    state: DialogState,
    previewText: string,
    projectConfig: ProjectConfig,
): boolean {
    if (state.assessment.importance === NOT_VIDEO_GAME_IMPORTANCE) {
        return false;
    }
    const reviewedAssessment = parseAssessment(projectConfig, previewText);
    return (
        reviewedAssessment != null &&
        reviewedAssessment.importance !== NOT_VIDEO_GAME_IMPORTANCE
    );
}

function buildDefaultRegistrationSummary(
    operations: ReviewedDialogSaveOperations,
    state: DialogState,
): string {
    const title = state.subjectInfo.listedTitle || state.subjectTitle;
    return operations.buildRegistrationSummary(
        title,
        state.subjectInfo.creationDate,
    );
}

function isUnchangedTalkReview(
    state: DialogState,
    previewText: string,
): boolean {
    const currentTopSection = getTalkPageTopSection(state.page.text);
    return isEmptyImportanceOnlyChange(currentTopSection, previewText);
}

function summarizeRegistration(state: DialogState): Record<string, unknown> {
    const registration = state.registration;

    return {
        alreadyRegistered: registration?.alreadyRegistered,
        changed: registration?.changed,
        earliestDate: registration?.earliestDate?.toISOString(),
        eligible: registration?.eligible,
        existing: registration?.existing,
        proposedCharacterCount: registration?.proposedText?.length,
    };
}
