/**
 * Performs one timestamp-protected talk-page edit.
 */

import type { PageSnapshot, PreparedTalkEdit } from "../../domain/types.ts";
import { type ApiParameters, createLoggedApiRequests } from "./api-requests.ts";
import type { Logger } from "../../shared/logging.ts";

export interface TalkPageApi {
    postTalkPageEdit(
        api: mw.Api,
        page: PageSnapshot,
        edit: PreparedTalkEdit,
        text: string,
        attempt: number,
    ): Promise<void>;
}

/** Creates the talk-page write adapter with scoped diagnostics. */
export function createTalkPageApi(logger: Logger): TalkPageApi {
    const requests = createLoggedApiRequests(logger.child("request"));
    async function postTalkPageEdit(
        api: mw.Api,
        page: PageSnapshot,
        edit: PreparedTalkEdit,
        text: string,
        attempt: number,
    ): Promise<void> {
        const params = createTalkEditParams(page, edit, text);
        await requests.postWithToken(api, "talk-page.save", "csrf", params);
        logger.info("talk-page.save.completed", {
            attempt,
            title: edit.title,
        });
    }
    return Object.freeze({ postTalkPageEdit });
}

function createTalkEditParams(
    page: PageSnapshot,
    edit: PreparedTalkEdit,
    text: string,
): ApiParameters {
    const params: ApiParameters = {
        action: "edit",
        starttimestamp: page.starttimestamp,
        summary: edit.summary,
        text,
        title: edit.title,
    };

    if (page.basetimestamp != null) {
        params.basetimestamp = page.basetimestamp;
    }
    if (!page.exists) {
        params.createonly = true;
    }
    return params;
}
