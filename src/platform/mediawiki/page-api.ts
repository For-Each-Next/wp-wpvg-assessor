/**
 * Handles MediaWiki API calls for talk assessment.
 */

import type { PageSnapshot, SubjectPageInfo } from "../../domain/types.ts";
import {
    type CreationTimeCache,
    type CreationTimeCacheStore,
    normalizeCreationTimeCacheTitle,
} from "../browser/creation-time-cache.ts";
import {
    createLoggedApiRequests,
    type LoggedApiRequests,
} from "./api-requests.ts";
import {
    asRecord,
    getFirstQueryPage,
    getFirstRevision,
    getRequiredString,
    getRevisionContent,
} from "./response.ts";
import { getTitleNamespaceId } from "../../domain/wiki-titles.ts";
import type { Logger } from "../../shared/logging.ts";

const MAX_TITLES_PER_QUERY = 50;

interface PageApiContext {
    cache: CreationTimeCacheStore;
    logger: Logger;
    requests: LoggedApiRequests;
}

export interface PageApi {
    fetchPageCreationTimes(
        api: mw.Api,
        titles: string[],
    ): Promise<Map<string, Date>>;
    fetchPageText(api: mw.Api, title: string): Promise<PageSnapshot>;
    fetchSubjectPageInfo(api: mw.Api, title: string): Promise<SubjectPageInfo>;
}

/**
 * Creates page-reading operations with injected cache and diagnostics.
 */
export function createPageApi(
    logger: Logger,
    cache: CreationTimeCacheStore,
): PageApi {
    const context: PageApiContext = {
        cache,
        logger,
        requests: createLoggedApiRequests(logger.child("request")),
    };
    return Object.freeze({
        fetchPageCreationTimes: fetchPageCreationTimes.bind(null, context),
        fetchPageText: fetchPageText.bind(null, context),
        fetchSubjectPageInfo: fetchSubjectPageInfo.bind(null, context),
    });
}

/**
 * Fetches the current talk-page source.
 *
 * @param api - MediaWiki API client.
 * @param title - Talk-page title.
 * @returns Page text and edit timestamps.
 */
async function fetchPageText(
    context: PageApiContext,
    api: mw.Api,
    title: string,
): Promise<PageSnapshot> {
    context.logger.debug("page-text.fetch.started", { title });
    const response = await context.requests.get(api, "page-text.fetch", {
        action: "query",
        curtimestamp: true,
        formatversion: "2",
        prop: "revisions",
        rvprop: "content|timestamp",
        rvslots: "main",
        titles: title,
    });
    const result = decodePageTextResponse(response);

    context.logger.info("page-text.fetch.completed", {
        exists: result.exists,
        characterCount: result.text.length,
        title,
    });

    return result;
}

/**
 * Parses page text and edit timestamps from a query response.
 *
 * @param response - Fetch response.
 * @returns Page text and edit timestamps from a query response.
 */
export function decodePageTextResponse(response: unknown): PageSnapshot {
    const responseRecord = asRecord(response);
    const page = getFirstQueryPage(response);
    const revision = getFirstRevision(page);

    if (responseRecord == null || page == null) {
        throw new Error("MediaWiki response omitted the requested page.");
    }

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
        starttimestamp: getRequiredString(
            responseRecord,
            "curtimestamp",
            "the query timestamp",
        ),
        text: page.missing == null ? getRevisionContent(revision) : "",
    };
}

/**
 * Fetches page creation metadata and redirect target details.
 *
 * @param api - MediaWiki API client.
 * @param title - Subject-page title.
 * @returns Page metadata.
 */
async function fetchSubjectPageInfo(
    context: PageApiContext,
    api: mw.Api,
    title: string,
): Promise<SubjectPageInfo> {
    context.logger.debug("subject-page.fetch.started", { title });
    const page = await fetchPageInfo(context, api, title);
    const currentText = await fetchCurrentPageText(context, api, title);
    if (currentText == null) {
        throw new Error(`Unable to read the current subject page: ${title}.`);
    }
    const redirectTarget = parseRedirectTarget(currentText);
    const targetTitle = redirectTarget || title;
    const creationTimes = await fetchRevisionCreationTimes(context, api, [
        targetTitle,
    ]);
    const creationDate = creationTimes.get(targetTitle);

    if (creationDate == null) {
        throw new Error(`Unable to read the creation date for ${title}.`);
    }

    const result = {
        creationDate,
        isRedirect: redirectTarget != null,
        listedTitle: title,
        namespaceNumber: readPageNamespace(page, title),
        targetTitle,
    };

    const creationTimestamp = result.creationDate.toISOString();
    context.logger.info("subject-page.fetch.completed", {
        ...result,
        creationDate: creationTimestamp,
    });

    return result;
}

/**
 * Fetches basic page info without redirect resolution.
 *
 * @param api - MediaWiki API client.
 * @param title - Page title.
 * @returns Page info.
 */
async function fetchPageInfo(
    context: PageApiContext,
    api: mw.Api,
    title: string,
): Promise<Record<string, unknown> | null> {
    context.logger.debug("page-info.fetch.started", { title });
    const response = await context.requests.get(api, "page-info.fetch", {
        action: "query",
        formatversion: "2",
        prop: "info",
        titles: title,
    });
    const page = getFirstQueryPage(response);

    context.logger.debug("page-info.fetch.completed", {
        missing: page?.missing != null,
        ns: page?.ns,
        title: page?.title,
    });

    return page;
}

function readPageNamespace(
    page: Record<string, unknown> | null,
    title: string,
): number {
    if (typeof page?.ns !== "number") {
        throw new Error(`Unable to read the namespace for ${title}.`);
    }

    return page.ns;
}

/**
 * Fetches creation times for a set of titles, following redirects.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @returns Creation times by listed title.
 */
async function fetchPageCreationTimes(
    context: PageApiContext,
    api: mw.Api,
    titles: Array<string>,
): Promise<Map<string, Date>> {
    context.logger.debug("creation-times.fetch.started", { titles });
    const enteredTitles = titles.filter(Boolean);
    const titleSet = new Set(enteredTitles);
    const uniqueTitles = [...titleSet];
    const creationTimes = new Map<string, Date>();

    if (uniqueTitles.length === 0) {
        context.logger.debug("creation-times.fetch.skipped");
        return creationTimes;
    }

    const resolvedTitles = await resolveRedirectTitles(
        context,
        api,
        uniqueTitles,
    );
    const resolvedValues = resolvedTitles.values();
    const targetSet = new Set(resolvedValues);
    const targets = [...targetSet];
    const targetCreationTimes = await fetchRevisionCreationTimes(
        context,
        api,
        targets,
    );

    mergeResolvedCreationTimes(
        creationTimes,
        resolvedTitles,
        targetCreationTimes,
    );

    context.logger.info("creation-times.fetch.completed", {
        itemCount: creationTimes.size,
    });

    return creationTimes;
}

/**
 * Resolves redirect targets for requested page titles.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @returns Redirect targets for requested page titles.
 */
async function resolveRedirectTitles(
    context: PageApiContext,
    api: mw.Api,
    titles: Array<string>,
): Promise<Map<string, string>> {
    const resolvedTitles = new Map<string, string>();
    const resolveTitle = resolveRedirectTitle.bind(
        null,
        context,
        api,
        resolvedTitles,
    );
    const requests = titles.map(resolveTitle);

    await Promise.all(requests);

    return resolvedTitles;
}

/**
 * Resolves and stores one redirect target.
 *
 * @param api - MediaWiki API client.
 * @param resolvedTitles - Mutable resolved-title map.
 * @param title - Source title.
 */
async function resolveRedirectTitle(
    context: PageApiContext,
    api: mw.Api,
    resolvedTitles: Map<string, string>,
    title: string,
): Promise<void> {
    const text = await fetchCurrentPageText(context, api, title);
    if (text == null) {
        context.logger.debug("creation-times.title.missing");
        return;
    }
    const target = parseRedirectTarget(text) || title;

    resolvedTitles.set(title, target);
    context.logger.debug("creation-times.title.resolved", {
        redirected: target !== title,
    });
}

/**
 * Maps target creation times back to requested redirect titles.
 *
 * @param output - Output value.
 * @param resolvedTitles - Resolved titles value.
 * @param targetTimes - Target times value.
 */
function mergeResolvedCreationTimes(
    output: Map<string, Date>,
    resolvedTitles: Map<string, string>,
    targetTimes: Map<string, Date>,
): void {
    for (const [title, target] of resolvedTitles) {
        const date = targetTimes.get(target);

        if (date != null) {
            output.set(title, date);
            output.set(target, date);
        }
    }
}

/**
 * Fetches the current page source for redirect detection.
 *
 * @param api - MediaWiki API client.
 * @param title - Page title.
 * @returns Current page source, or null for an explicitly missing page.
 */
async function fetchCurrentPageText(
    context: PageApiContext,
    api: mw.Api,
    title: string,
): Promise<string | null> {
    context.logger.debug("current-page-text.fetch.started", { title });
    const response = await context.requests.get(
        api,
        "current-page-text.fetch",
        {
            action: "query",
            formatversion: "2",
            prop: "revisions",
            rvprop: "content",
            rvslots: "main",
            titles: title,
        },
    );
    const page = getFirstQueryPage(response);
    if (page?.missing != null) {
        context.logger.debug("current-page-text.fetch.completed", {
            exists: false,
            title,
        });
        return null;
    }
    const revision = getFirstRevision(page);
    const text = getRevisionContent(revision);

    context.logger.debug("current-page-text.fetch.completed", {
        characterCount: text.length,
        title,
    });

    return text;
}

/**
 * Parses a redirect target from page source.
 *
 * @param text - Page source.
 * @returns Redirect target title.
 */
function parseRedirectTarget(text: string): string | null {
    const patternSource = [
        "^\\s*#(?:REDIRECT|重定向|重新導向|重新导向)\\",
        "s*:?\\s*\\[\\[([^#|\\]]+)",
    ].join("");
    const pattern = new RegExp(patternSource, "iu");
    const match = String(text || "").match(pattern);

    const target = match?.[1]?.trim() || null;

    return target;
}

/**
 * Fetches first-revision timestamps for resolved, non-redirect titles.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @returns Creation timestamps.
 */
async function fetchRevisionCreationTimes(
    context: PageApiContext,
    api: mw.Api,
    titles: Array<string>,
): Promise<Map<string, Date>> {
    context.logger.debug("revision-creation-times.fetch.started", { titles });
    const creationTimes = new Map<string, Date>();
    const enteredTitles = titles.filter(Boolean);
    const titleSet = new Set(enteredTitles);
    const uniqueTitles = [...titleSet];
    const cache = context.cache.read();
    const uncachedTitles = readCachedCreationTimes(
        context,
        uniqueTitles,
        cache,
        creationTimes,
    );

    await fetchUncachedCreationTimes(
        context,
        api,
        uncachedTitles,
        cache,
        creationTimes,
    );

    context.cache.write(cache);
    context.logger.info("revision-creation-times.fetch.completed", {
        itemCount: creationTimes.size,
    });

    return creationTimes;
}

/**
 * Returns titles without cached creation times.
 *
 * @param titles - Page titles.
 * @param cache - Cached values.
 * @param creationTimes - Creation times value.
 * @returns Result when the function
 *   returns titles without cached creation times.
 */
function readCachedCreationTimes(
    context: PageApiContext,
    titles: string[],
    cache: CreationTimeCache,
    creationTimes: Map<string, Date>,
): Array<string> {
    const result = [];

    for (const title of titles) {
        const cacheTitle = normalizeCreationTimeCacheTitle(title);
        const cached = cache[cacheTitle];

        if (cached == null) {
            result.push(title);
        } else {
            const creationDate = new Date(cached);
            creationTimes.set(title, creationDate);
            context.logger.debug("revision-creation-times.cache.hit", {
                timestamp: cached,
                title,
            });
        }
    }

    return result;
}

/**
 * Fetches uncached creation times in namespace-homogeneous batches.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @param cache - Cached values.
 * @param output - Output value.
 */
async function fetchUncachedCreationTimes(
    context: PageApiContext,
    api: mw.Api,
    titles: string[],
    cache: CreationTimeCache,
    output: Map<string, Date>,
) {
    for (const group of groupTitlesByNamespace(titles).values()) {
        for (
            let index = 0;
            index < group.length;
            index += MAX_TITLES_PER_QUERY
        ) {
            const batch = group.slice(index, index + MAX_TITLES_PER_QUERY);
            const times = await fetchRevisionCreationTimeBatch(
                context,
                api,
                batch,
            );

            mergeCreationTimeBatch(output, cache, batch, times);
        }
    }
}

/**
 * Merges one API batch into creation-time output and cache maps.
 *
 * @param output - Output value.
 * @param cache - Cached values.
 * @param titles - Page titles.
 * @param times - Times value.
 */
function mergeCreationTimeBatch(
    output: Map<string, Date>,
    cache: CreationTimeCache,
    titles: string[],
    times: Map<string, Date>,
): void {
    for (const [title, date] of times) {
        output.set(title, date);
        const cacheTitle = normalizeCreationTimeCacheTitle(title);
        cache[cacheTitle] = date.toISOString();
    }

    for (const title of titles) {
        const date = getCreationTimeForTitle(times, title);

        if (date != null) {
            output.set(title, date);
            const cacheTitle = normalizeCreationTimeCacheTitle(title);
            cache[cacheTitle] = date.toISOString();
        }
    }
}

/**
 * Handles fetch revision creation time batch.
 *
 * Fetches creation timestamps for one namespace-homogeneous title
 * batch.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @returns Creation timestamps.
 */
async function fetchRevisionCreationTimeBatch(
    context: PageApiContext,
    api: mw.Api,
    titles: Array<string>,
): Promise<Map<string, Date>> {
    try {
        return await fetchRevisionCreationTimeBatchUnsafe(context, api, titles);
    } catch (error) {
        if (titles.length <= 1) {
            throw error;
        }

        return await fetchIndividualCreationTimes(context, api, titles, error);
    }
}

/**
 * Retries a failed creation-time batch one title at a time.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @param error - Caught error.
 * @returns Result when the function
 *   retries a failed creation-time batch one title at
 *   a time.
 */
async function fetchIndividualCreationTimes(
    context: PageApiContext,
    api: mw.Api,
    titles: string[],
    error: unknown,
): Promise<Map<string, Date>> {
    const creationTimes = new Map<string, Date>();

    context.logger.warn("revision-creation-times.batch.fallback", {
        error,
        titles,
    });
    for (const title of titles) {
        const single = await fetchRevisionCreationTimeBatchUnsafe(
            context,
            api,
            [title],
        );

        for (const [singleTitle, date] of single) {
            creationTimes.set(singleTitle, date);
        }
    }

    return creationTimes;
}

/**
 * Fetches creation timestamps without fallback.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @returns Creation timestamps.
 */
async function fetchRevisionCreationTimeBatchUnsafe(
    context: PageApiContext,
    api: mw.Api,
    titles: Array<string>,
): Promise<Map<string, Date>> {
    const namespaceGroup = getNamespaceGroupKey(titles[0]);
    context.logger.debug("revision-creation-times.batch.started", {
        namespaceGroup,
        titles,
    });
    const joinedTitles = titles.join("|");
    const response = await context.requests.get(
        api,
        "revision-creation-times.fetch",
        {
            action: "query",
            formatversion: "2",
            prop: "revisions",
            rvdir: "newer",
            rvlimit: 1,
            rvprop: "timestamp",
            titles: joinedTitles,
        },
    );
    const creationTimes = parseRevisionCreationTimes(response);
    context.logger.debug("revision-creation-times.batch.completed", {
        itemCount: creationTimes.size,
    });

    return creationTimes;
}

/**
 * Parses first-revision timestamps from a query response.
 *
 * @param response - Fetch response.
 * @returns First-revision timestamps from a query response.
 */
function parseRevisionCreationTimes(response: unknown): Map<string, Date> {
    const responseRecord = asRecord(response);
    const query = asRecord(responseRecord?.query);
    const pages = query?.pages;
    const creationTimes = new Map<string, Date>();
    const pageRecord = asRecord(pages);
    const pageList = Array.isArray(pages)
        ? pages
        : Object.values(pageRecord ?? {});

    for (const pageValue of pageList) {
        const page = asRecord(pageValue);
        const revision = getFirstRevision(page);
        const timestamp = revision?.timestamp;

        if (typeof timestamp === "string" && typeof page?.title === "string") {
            const creationDate = new Date(timestamp);
            creationTimes.set(page.title, creationDate);
        }
    }

    return creationTimes;
}

/**
 * Handles group titles by namespace.
 *
 * Groups titles by namespace prefix to avoid mixed-namespace revision
 * batches.
 *
 * @param titles - Page titles.
 * @returns Titles by namespace group.
 */
function groupTitlesByNamespace(
    titles: Array<string>,
): Map<string, Array<string>> {
    const groups = new Map<string, Array<string>>();

    for (const title of titles) {
        const key = getNamespaceGroupKey(title);

        if (!groups.has(key)) {
            groups.set(key, []);
        }

        groups.get(key)?.push(title);
    }

    return groups;
}

/**
 * Gets a conservative namespace group key from a title.
 *
 * @param title - Page title.
 * @returns Namespace key.
 */
function getNamespaceGroupKey(title: string): string {
    const namespaceId = getTitleNamespaceId(String(title || ""), "zhwiki");
    return namespaceId === 0 ? "" : String(namespaceId);
}

/**
 * Gets a creation time from a map using title normalization.
 *
 * @param creationTimes - Creation times.
 * @param title - Requested title.
 * @returns Creation datetime.
 */
function getCreationTimeForTitle(
    creationTimes: Map<string, Date>,
    title: string,
): Date | null {
    if (creationTimes.has(title)) {
        return creationTimes.get(title) ?? null;
    }

    const normalized = normalizeCreationTimeCacheTitle(title);
    let found: Date | null = null;

    for (const [entryTitle, date] of creationTimes) {
        if (found == null) {
            const normalizedEntryTitle =
                normalizeCreationTimeCacheTitle(entryTitle);

            if (normalizedEntryTitle === normalized) {
                found = date;
            }
        }
    }

    return found;
}
