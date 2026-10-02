/**
 * @file src/platform/mediawiki/api-requests.ts
 * Purpose: Adds structured diagnostics around MediaWiki API requests.
 *
 * Table of contents:
 * 1. Imports
 * 2. ApiParameterValue
 * 3. ApiParameters
 * 4. LoggedApiRequests
 * 5. createLoggedApiRequests
 * 6. get
 * 7. postWithToken
 * 8. requireSuccessfulEdit
 * 9. logRequestFailure
 * 10. summarizeParams
 * 11. countTitles
 * 12. summarizeResponse
 */

import { asRecord } from "./response.ts";
import type { Logger } from "../../shared/logging.ts";

type ApiParameterValue =
    | string
    | number
    | boolean
    | File
    | Array<string>
    | Array<number>
    | undefined;

export type ApiParameters = Record<string, ApiParameterValue>;

export interface LoggedApiRequests {
    get(api: mw.Api, event: string, params: ApiParameters): Promise<unknown>;
    postWithToken(
        api: mw.Api,
        event: string,
        token: string,
        params: ApiParameters,
    ): Promise<unknown>;
}

/** Creates request operations bound to a scoped shared logger. */
export function createLoggedApiRequests(logger: Logger): LoggedApiRequests {
    return Object.freeze({
        get: get.bind(null, logger),
        postWithToken: postWithToken.bind(null, logger),
    });
}

async function get(
    logger: Logger,
    api: mw.Api,
    event: string,
    params: ApiParameters,
): Promise<unknown> {
    logger.debug(`${event}.request.started`, summarizeParams(params));
    try {
        const response = await api.get(params);
        logger.debug(`${event}.request.completed`, summarizeResponse(response));
        return response;
    } catch (error) {
        logRequestFailure(logger, event, params, error);
        throw error;
    }
}

async function postWithToken(
    logger: Logger,
    api: mw.Api,
    event: string,
    token: string,
    params: ApiParameters,
): Promise<unknown> {
    logger.debug(`${event}.request.started`, summarizeParams(params));
    try {
        const response = await api.postWithToken(token, params);
        requireSuccessfulEdit(response);
        logger.debug(`${event}.request.completed`, summarizeResponse(response));
        return response;
    } catch (error) {
        logRequestFailure(logger, event, params, error);
        throw error;
    }
}

/** A fulfilled transport promise alone does not confirm a saved edit. */
function requireSuccessfulEdit(response: unknown): void {
    const record = asRecord(response);
    if (asRecord(record?.edit)?.result === "Success") {
        return;
    }
    const code = asRecord(record?.error)?.code ?? asRecord(record?.edit)?.code;
    const error = new Error(
        "MediaWiki did not confirm that the edit was saved.",
    );
    if (typeof code === "string") {
        Object.assign(error, { code });
    }
    throw error;
}

function logRequestFailure(
    logger: Logger,
    event: string,
    params: ApiParameters,
    error: unknown,
): void {
    logger.error(`${event}.request.failed`, {
        error,
        params: summarizeParams(params),
    });
}

/**
 * Summarizes a request without retaining editable text or summaries.
 */
function summarizeParams(
    params: ApiParameters,
): Readonly<Record<string, unknown>> {
    return Object.freeze({
        action: params.action,
        hasBaseTimestamp: params.basetimestamp != null,
        hasStartTimestamp: params.starttimestamp != null,
        prop: params.prop,
        itemCount: countTitles(params.titles),
    });
}

/** Counts pipe-delimited or array-valued title parameters. */
function countTitles(value: ApiParameterValue): number {
    if (Array.isArray(value)) {
        return value.length;
    }
    if (typeof value !== "string" || value === "") {
        return 0;
    }
    return value.split("|").length;
}

/** Summarizes API responses without retaining page or edit content. */
function summarizeResponse(response: unknown): Record<string, unknown> {
    const responseRecord = asRecord(response);
    const query = asRecord(responseRecord?.query);
    const pages = query?.pages;
    const pageList = Array.isArray(pages) ? pages : [];
    return {
        hasEdit: responseRecord?.edit != null,
        pageCount: pageList.length,
    };
}
