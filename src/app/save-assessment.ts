/** Saves an exact reviewed assessment through the conflict-safe talk workflow. */

import {
    getTalkPageTopSection,
    isEmptyImportanceOnlyChange,
} from "../domain/assessment.ts";
import type { PreparedTalkEdit } from "../domain/types.ts";
import type { Logger } from "../shared/logging.ts";
import type { SaveReviewedAssessment } from "./assessment-contracts.ts";

const DEFAULT_EDIT_SUMMARY =
    "Tag project banners " +
    "[[:m:User:For Each ... Next/global.js/vg page assessor.js|🍄]]";

export interface ReviewedAssessmentSaveOperations {
    logger: Logger;
    saveTalkAssessment(api: mw.Api, edit: PreparedTalkEdit): Promise<string>;
}

/** The reviewed source and summary are the only proposed write values. */
export function createReviewedAssessmentSaveWorkflow(
    operations: ReviewedAssessmentSaveOperations,
): SaveReviewedAssessment {
    return async (state, review) => {
        operations.logger.info("save.started");
        const currentLead = getTalkPageTopSection(state.page.text);
        if (
            currentLead === review.previewText ||
            isEmptyImportanceOnlyChange(currentLead, review.previewText)
        ) {
            operations.logger.info("save.skipped");
            return "unchanged";
        }
        await operations.saveTalkAssessment(state.api, {
            summary: review.summary || DEFAULT_EDIT_SUMMARY,
            title: state.talkTitle,
            topSection: review.previewText,
        });
        operations.logger.info("save.completed");
        return "saved";
    };
}
