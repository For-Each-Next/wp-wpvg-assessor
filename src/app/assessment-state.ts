/** Loads assessment source without reading article metadata or registration. */

import { createDefaultAssessment } from "../domain/assessment.ts";
import type { ProjectConfig } from "../domain/project-types.ts";
import type { PageSnapshot } from "../domain/types.ts";
import type { AssessmentState } from "./assessment-contracts.ts";

export interface AssessmentStateLoaderOperations {
    fetchPageText(api: mw.Api, talkTitle: string): Promise<PageSnapshot>;
    getSubjectPageTitle(title: mw.Title): string;
    getTalkPageTitle(title: mw.Title): string;
}

/** Binds the assessment-only loader to validated talk-page reads. */
export function createAssessmentStateLoader(
    operations: AssessmentStateLoaderOperations,
    config: ProjectConfig,
): (api: mw.Api, title: mw.Title) => Promise<AssessmentState> {
    return async (api, title) => {
        const talkTitle = operations.getTalkPageTitle(title);
        const subjectTitle = operations.getSubjectPageTitle(title);
        const page = await operations.fetchPageText(api, talkTitle);
        return {
            api,
            assessment: createDefaultAssessment(config, page.text),
            page,
            previewDirty: false,
            subjectTitle,
            summaryDirty: false,
            talkTitle,
        };
    };
}
