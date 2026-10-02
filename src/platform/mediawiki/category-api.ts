/**
 * @file src/platform/mediawiki/category-api.ts
 * Purpose: Reads category members and article previews without performing edits.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. CategoryApi
 * 4. createCategoryApi
 */

import type { CategoryMemberBatch } from "../../app/category-contracts.ts";
import type { Logger } from "../../shared/logging.ts";
import { createLoggedApiRequests } from "./api-requests.ts";
import { asRecord, getRequiredString } from "./response.ts";

export const UNASSESSED_CATEGORY_TITLE = "Category:未评级电子游戏条目";

export interface CategoryApi {
    fetchCategoryMembers(
        api: mw.Api,
        continuation?: string,
    ): Promise<CategoryMemberBatch>;
    fetchArticleHtml(api: mw.Api, title: string): Promise<string>;
}

/** Binds the read-only category adapter to injected diagnostics. */
export function createCategoryApi(logger: Logger): CategoryApi {
    const requests = createLoggedApiRequests(logger.child("request"));

    async function fetchCategoryMembers(
        api: mw.Api,
        continuation?: string,
    ): Promise<CategoryMemberBatch> {
        const response = await requests.get(api, "category-members.fetch", {
            action: "query",
            formatversion: "2",
            list: "categorymembers",
            cmtitle: UNASSESSED_CATEGORY_TITLE,
            cmtype: "page",
            cmnamespace: "0|1",
            cmlimit: 50,
            ...(continuation == null ? {} : { cmcontinue: continuation }),
        });
        const record = asRecord(response);
        const members = asRecord(record?.query)?.categorymembers;
        if (!Array.isArray(members)) {
            throw new Error("MediaWiki response omitted category members.");
        }
        const titles = members.map((member) => {
            const page = asRecord(member);
            if (page?.ns !== 0 && page?.ns !== 1) {
                throw new Error(
                    "MediaWiki returned a category member outside article and talk namespaces.",
                );
            }
            return getRequiredString(page, "title", "a category member title");
        });
        const next = asRecord(record?.continue)?.cmcontinue;
        if (next != null && (typeof next !== "string" || next === "")) {
            throw new Error(
                "MediaWiki returned invalid category continuation.",
            );
        }
        logger.debug("category-members.fetch.completed", {
            itemCount: titles.length,
            hasContinuation: next != null,
        });
        return { titles, continuation: next ?? null };
    }

    async function fetchArticleHtml(
        api: mw.Api,
        title: string,
    ): Promise<string> {
        const response = await requests.get(api, "article-preview.fetch", {
            action: "parse",
            formatversion: "2",
            page: title,
            prop: "text",
            disableeditsection: true,
        });
        const html = asRecord(asRecord(response)?.parse)?.text;
        if (typeof html !== "string") {
            throw new Error("MediaWiki response omitted the article preview.");
        }
        logger.debug("article-preview.fetch.completed", {
            characterCount: html.length,
        });
        return html;
    }

    return Object.freeze({ fetchCategoryMembers, fetchArticleHtml });
}
