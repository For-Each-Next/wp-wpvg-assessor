/**
 * Orchestrates dialog loading and new-page-list preparation.
 */

import type {
    DialogState,
    DialogWorkflow,
    RegistrationSave,
} from "./dialog-contracts.ts";
import {
    createDefaultAssessment,
    hasDykInviteAtTop,
} from "../domain/assessment.ts";
import {
    getTitlesForDate,
    prepareNewPageListRegistration,
} from "../domain/new-page-list.ts";
import type {
    AssessmentPageSnapshots,
    NewPageListSnapshot,
    RegistrationResult,
    SubjectPageInfo,
} from "../domain/types.ts";
import { NOT_VIDEO_GAME_IMPORTANCE } from "../domain/types.ts";
import type { ProjectConfig } from "../domain/project-types.ts";

interface PreparedRegistrationState {
    creationTimes: Map<string, Date>;
    registration: RegistrationResult;
}

export interface DialogWorkflowAdapters {
    fetchAssessmentPages(
        api: mw.Api,
        talkTitle: string,
    ): Promise<AssessmentPageSnapshots>;
    fetchPageCreationTimes(
        api: mw.Api,
        titles: Array<string>,
    ): Promise<Map<string, Date>>;
    fetchSubjectPageInfo(api: mw.Api, title: string): Promise<SubjectPageInfo>;
    getSubjectPageTitle(title: mw.Title): string;
    getTalkPageTitle(title: mw.Title): string;
    savePreparedNewPageList(
        api: mw.Api,
        page: NewPageListSnapshot,
        proposedText: string,
        summary: string,
    ): Promise<void>;
}

/**
 * Binds the dialog workflow to project configuration and adapters.
 *
 * @param adapters - MediaWiki boundary operations.
 * @param projectConfig - Project banner configuration.
 * @returns Dialog workflow used by the UI.
 */
export function createDialogWorkflow(
    adapters: DialogWorkflowAdapters,
    projectConfig: ProjectConfig,
): DialogWorkflow {
    return {
        getRegistrationSave,
        loadDialogState: loadDialogState.bind(null, adapters, projectConfig),
        saveRegistration: saveRegistration.bind(null, adapters),
    };
}

async function loadDialogState(
    adapters: DialogWorkflowAdapters,
    projectConfig: ProjectConfig,
    api: mw.Api,
    currentTitle: mw.Title,
): Promise<DialogState> {
    const talkTitle = adapters.getTalkPageTitle(currentTitle);
    const subjectTitle = adapters.getSubjectPageTitle(currentTitle);
    const [pages, subjectInfo] = await Promise.all([
        adapters.fetchAssessmentPages(api, talkTitle),
        adapters.fetchSubjectPageInfo(api, subjectTitle),
    ]);
    const prepared = await prepareRegistrationState(
        adapters,
        api,
        pages,
        subjectInfo,
        subjectTitle,
    );

    return {
        api,
        assessment: createDefaultAssessment(projectConfig, pages.talkPage.text),
        creationTimes: prepared.creationTimes,
        newPageList: pages.newPageList,
        page: pages.talkPage,
        previewDirty: false,
        registration: prepared.registration,
        subjectInfo,
        subjectTitle,
        summaryDirty: false,
        talkTitle,
    };
}

async function prepareRegistrationState(
    adapters: DialogWorkflowAdapters,
    api: mw.Api,
    pages: AssessmentPageSnapshots,
    subjectInfo: SubjectPageInfo,
    subjectTitle: string,
): Promise<PreparedRegistrationState> {
    const newPageList = pages.newPageList;
    const title = subjectInfo.listedTitle || subjectTitle;
    const titles = [
        ...getTitlesForDate(newPageList.text, subjectInfo.creationDate),
        title,
    ];
    const creationTimes = await adapters.fetchPageCreationTimes(api, titles);

    creationTimes.set(title, subjectInfo.creationDate);
    const registration = prepareNewPageListRegistration({
        creationDate: subjectInfo.creationDate,
        creationTimes,
        includeDykIcon: hasDykInviteAtTop(pages.talkPage.text),
        namespaceNumber: subjectInfo.namespaceNumber,
        text: newPageList.text,
        title,
    });
    return { creationTimes, registration };
}

function getRegistrationSave(state: DialogState): RegistrationSave | null {
    if (
        state.assessment.importance === NOT_VIDEO_GAME_IMPORTANCE ||
        !state.registration.changed
    ) {
        return null;
    }

    return {
        proposedText: state.registration.proposedText,
        snapshot: state.newPageList,
    };
}

async function saveRegistration(
    adapters: DialogWorkflowAdapters,
    api: mw.Api,
    registration: RegistrationSave,
    summary: string,
): Promise<void> {
    await adapters.savePreparedNewPageList(
        api,
        registration.snapshot,
        registration.proposedText,
        summary,
    );
}
