/**
 * Composes the page-assessor UI, workflows, and MediaWiki adapters.
 */

import { createAssessmentPageApi } from "../platform/mediawiki/assessment-page-api.ts";
import { createNewPageListApi } from "../platform/mediawiki/new-page-list-api.ts";
import { createPageApi } from "../platform/mediawiki/page-api.ts";
import { createTalkPageApi } from "../platform/mediawiki/talk-page-api.ts";
import {
    getSubjectPageTitle,
    getTalkPageTitle,
} from "../platform/mediawiki/title.ts";
import { createCreationTimeCacheStore } from "../platform/browser/creation-time-cache.ts";
import projectConfig from "../domain/project-config.ts";
import type { DialogPageContext } from "./dialog-contracts.ts";
import { buildNewPageListSummary } from "../i18n/index.ts";
import { startPageAssessor } from "../features/assessment/app.ts";
import { createDialogWorkflow } from "./dialog-state.ts";
import { createReviewedDialogSaveWorkflow } from "./save-dialog.ts";
import { createTalkSaveWorkflow } from "./save-talk-assessment.ts";
import { createLogger, type Logger } from "../shared/logging.ts";
import { createActionNotifier } from "../platform/mediawiki/notifications.ts";

/** Starts the composed browser gadget. */
export function start(): void {
    const logger = createLogger("wpvg-assessor", {
        level: window.wpvgAssessorConfig?.logLevel,
    });
    const adapters = createMediaWikiAdapters(logger);
    const dialogWorkflow = createDialogWorkflow(
        {
            fetchAssessmentPages: adapters.assessmentPages.fetchAssessmentPages,
            fetchPageCreationTimes: adapters.pages.fetchPageCreationTimes,
            fetchSubjectPageInfo: adapters.pages.fetchSubjectPageInfo,
            getSubjectPageTitle,
            getTalkPageTitle,
            savePreparedNewPageList:
                adapters.newPageList.savePreparedNewPageList,
        },
        projectConfig,
    );
    const saveTalkAssessment = createTalkSaveWorkflow({
        fetchPageText: adapters.pages.fetchPageText,
        logger: logger.child("workflow.talk-save"),
        postTalkPageEdit: adapters.talkPage.postTalkPageEdit,
    });
    const saveReviewedDialog = createReviewedDialogSaveWorkflow(
        {
            buildRegistrationSummary: buildNewPageListSummary,
            getRegistrationSave: dialogWorkflow.getRegistrationSave,
            logger: logger.child("workflow.dialog-save"),
            saveRegistration: dialogWorkflow.saveRegistration,
            saveTalkAssessment,
        },
        projectConfig,
    );

    startPageAssessor({
        createDialogPageContext,
        loadDialogState: dialogWorkflow.loadDialogState,
        logger: logger.child("ui"),
        notify: createActionNotifier("wpvg-assessor"),
        saveReviewedDialog,
    });
}

/** Creates external MediaWiki values for one dialog-opening attempt. */
function createDialogPageContext(): DialogPageContext {
    const pageName = mw.config.get("wgPageName");

    return {
        api: new mw.Api(),
        pageName,
        title: mw.Title.newFromText(pageName),
    };
}

function createMediaWikiAdapters(logger: Logger) {
    const mediaWikiLogger = logger.child("mediawiki");
    const cache = createCreationTimeCacheStore(logger.child("storage"));
    return Object.freeze({
        assessmentPages: createAssessmentPageApi(
            mediaWikiLogger.child("assessment-page"),
        ),
        newPageList: createNewPageListApi(
            mediaWikiLogger.child("new-page-list"),
        ),
        pages: createPageApi(mediaWikiLogger.child("page"), cache),
        talkPage: createTalkPageApi(mediaWikiLogger.child("talk-page")),
    });
}
