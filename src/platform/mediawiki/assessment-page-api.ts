/**
 * @file src/platform/mediawiki/assessment-page-api.ts
 * Purpose: Loads the talk assessment and WikiProject log in one API query.
 *
 * Table of contents:
 * 1. Imports
 * 2. AssessmentPageApi
 * 3. createAssessmentPageApi
 * 4. createAssessmentPageParams
 * 5. decodeAssessmentPagesResponse
 * 6. findPageByTitle
 * 7. findRequestedTalkPage
 * 8. decodeTalkPage
 * 9. decodeNewPageList
 */

import type {
    AssessmentPageSnapshots,
    NewPageListSnapshot,
    PageSnapshot,
} from "../../domain/types.ts";
import {
    asRecord,
    getFirstRevision,
    getQueryPages,
    getRequiredString,
    getRevisionContent,
    type UnknownRecord,
} from "./response.ts";
import { NEW_PAGE_LIST_TITLE } from "./new-page-list-api.ts";
import { createLoggedApiRequests } from "./api-requests.ts";
import type { Logger } from "../../shared/logging.ts";

export interface AssessmentPageApi {
    fetchAssessmentPages(
        api: mw.Api,
        talkTitle: string,
    ): Promise<AssessmentPageSnapshots>;
}

/** Creates the assessment-page adapter with scoped diagnostics. */
export function createAssessmentPageApi(logger: Logger): AssessmentPageApi {
    const requests = createLoggedApiRequests(logger.child("request"));
    async function fetchAssessmentPages(
        api: mw.Api,
        talkTitle: string,
    ): Promise<AssessmentPageSnapshots> {
        const titles = [talkTitle, NEW_PAGE_LIST_TITLE];
        logger.debug("assessment-pages.fetch.started", {
            itemCount: titles.length,
        });
        const response = await requests.get(
            api,
            "assessment-pages.fetch",
            createAssessmentPageParams(titles),
        );
        const result = decodeAssessmentPagesResponse(response, talkTitle);
        logger.info("assessment-pages.fetch.completed", {
            logCharacterCount: result.newPageList.text.length,
            talkExists: result.talkPage.exists,
            talkCharacterCount: result.talkPage.text.length,
            itemCount: titles.length,
        });
        return result;
    }
    return Object.freeze({ fetchAssessmentPages });
}

/**
 * Fetches the talk page and new-page assessment log together.
 *
 * @param api - MediaWiki API client.
 * @param talkTitle - Talk-page title.
 * @returns Both page snapshots from one query timestamp.
 */
function createAssessmentPageParams(titles: string[]) {
    return {
        action: "query",
        curtimestamp: true,
        formatversion: "2",
        prop: "revisions",
        rvprop: "content|timestamp",
        rvslots: "main",
        titles: titles.join("|"),
    } as const;
}

/**
 * Decodes the two requested pages without relying on response order.
 *
 * @param response - Batched MediaWiki response.
 * @param talkTitle - Requested talk-page title.
 * @returns Talk-page and assessment-log snapshots.
 */
function decodeAssessmentPagesResponse(
    response: unknown,
    talkTitle: string,
): AssessmentPageSnapshots {
    const pages = getQueryPages(response);
    const logPage = findPageByTitle(pages, NEW_PAGE_LIST_TITLE);
    const talkPage = findRequestedTalkPage(pages, logPage, talkTitle);
    const starttimestamp = getRequiredString(
        asRecord(response),
        "curtimestamp",
        "the query timestamp",
    );

    return {
        newPageList: decodeNewPageList(logPage, starttimestamp),
        talkPage: decodeTalkPage(talkPage, starttimestamp),
    };
}

/**
 * Finds a returned page by its normalized title.
 *
 * @param pages - Returned query pages.
 * @param title - Expected normalized title.
 * @returns Matching page, when present.
 */
function findPageByTitle(
    pages: Array<UnknownRecord>,
    title: string,
): UnknownRecord | null {
    return (
        pages.find(function hasTitle(page) {
            return page.title === title;
        }) ?? null
    );
}

/**
 * Finds the talk page while tolerating API title normalization.
 *
 * @param pages - Returned query pages.
 * @param logPage - Identified assessment-log page.
 * @param talkTitle - Requested talk-page title.
 * @returns Returned talk page, when present.
 */
function findRequestedTalkPage(
    pages: Array<UnknownRecord>,
    logPage: UnknownRecord | null,
    talkTitle: string,
): UnknownRecord | null {
    const exact = findPageByTitle(pages, talkTitle);

    return exact ?? pages.find((page) => page !== logPage) ?? null;
}

/**
 * Decodes a possibly missing talk-page snapshot.
 *
 * @param page - Returned talk page.
 * @param starttimestamp - Shared query timestamp.
 * @returns Talk-page content and edit timestamps.
 */
function decodeTalkPage(
    page: UnknownRecord | null,
    starttimestamp: string,
): PageSnapshot {
    if (page == null) {
        throw new Error("MediaWiki response omitted the requested talk page.");
    }

    const revision = getFirstRevision(page);

    return {
        ...(page.missing == null
            ? {
                  basetimestamp: getRequiredString(
                      revision,
                      "timestamp",
                      "the base timestamp",
                  ),
              }
            : {}),
        exists: page.missing == null,
        starttimestamp,
        text: page.missing == null ? getRevisionContent(revision) : "",
    };
}

/**
 * Decodes the required assessment-log page snapshot.
 *
 * @param page - Returned assessment-log page.
 * @param starttimestamp - Shared query timestamp.
 * @returns Log-page content and edit timestamps.
 */
function decodeNewPageList(
    page: UnknownRecord | null,
    starttimestamp: string,
): NewPageListSnapshot {
    const revision = getFirstRevision(page);

    if (page == null || page.missing != null || revision == null) {
        throw new Error(`Unable to read ${NEW_PAGE_LIST_TITLE}.`);
    }

    return {
        basetimestamp: getRequiredString(
            revision,
            "timestamp",
            "the base timestamp",
        ),
        starttimestamp,
        text: getRevisionContent(revision),
    };
}
