/** Offline checks for category read-only API parameters and response validation. */

import assert from "node:assert/strict";
import test from "node:test";

import {
    createCategoryApi,
    UNASSESSED_CATEGORY_TITLE,
} from "../src/platform/mediawiki/category-api.ts";
import type { ApiParameters } from "../src/platform/mediawiki/api-requests.ts";
import { createLogger } from "../src/shared/logging.ts";

const logger = createLogger("category-api-test", { level: "silent" });

test("reads article and talk members from the exact unassessed category", async () => {
    const fixture = createApi({
        continue: { continue: "-||", cmcontinue: "next-batch" },
        query: {
            categorymembers: [
                { pageid: 1, ns: 1, title: "Talk:One" },
                { pageid: 2, ns: 0, title: "Two" },
            ],
        },
    });
    const adapter = createCategoryApi(logger);
    assert.deepEqual(await adapter.fetchCategoryMembers(fixture.api), {
        titles: ["Talk:One", "Two"],
        continuation: "next-batch",
    });
    assert.deepEqual(
        [...fixture.requests],
        [
            {
                action: "query",
                formatversion: "2",
                list: "categorymembers",
                cmtitle: UNASSESSED_CATEGORY_TITLE,
                cmtype: "page",
                cmnamespace: "0|1",
                cmlimit: 50,
            },
        ],
    );
    await adapter.fetchCategoryMembers(fixture.api, "next-batch");
    assert.equal(fixture.requests[1]?.cmcontinue, "next-batch");
});

test("reads rendered article HTML through a GET parse request", async () => {
    const fixture = createApi({
        parse: { title: "One", text: "<p>Article</p>" },
    });
    const adapter = createCategoryApi(logger);
    assert.equal(
        await adapter.fetchArticleHtml(fixture.api, "One"),
        "<p>Article</p>",
    );
    assert.deepEqual(fixture.requests, [
        {
            action: "parse",
            formatversion: "2",
            page: "One",
            prop: "text",
            disableeditsection: true,
        },
    ]);
});

test("rejects missing, malformed, or unexpected category targets", async () => {
    const adapter = createCategoryApi(logger);
    for (const response of [
        {},
        { query: { categorymembers: "invalid" } },
        { query: { categorymembers: [null] } },
        { query: { categorymembers: [{ ns: 14, title: "Category:Other" }] } },
        { query: { categorymembers: [{ ns: 0, title: "" }] } },
        { query: { categorymembers: [] }, continue: { cmcontinue: "" } },
        { query: { categorymembers: [] }, continue: { cmcontinue: 5 } },
    ]) {
        await assert.rejects(
            adapter.fetchCategoryMembers(createApi(response).api),
        );
    }
    assert.deepEqual(
        await adapter.fetchCategoryMembers(
            createApi({ query: { categorymembers: [] } }).api,
        ),
        { titles: [], continuation: null },
    );
});

test("rejects parse responses that do not contain HTML text", async () => {
    const adapter = createCategoryApi(logger);
    for (const response of [
        {},
        { parse: {} },
        { parse: { text: { "*": "html" } } },
    ]) {
        await assert.rejects(
            adapter.fetchArticleHtml(createApi(response).api, "One"),
        );
    }
    assert.equal(
        await adapter.fetchArticleHtml(
            createApi({ parse: { text: "" } }).api,
            "One",
        ),
        "",
    );
});

function createApi(response: unknown) {
    const requests: ApiParameters[] = [];
    const api = {
        async get(params: ApiParameters) {
            requests.push(params);
            return response;
        },
        postWithToken() {
            throw new Error("Category loading must never perform an edit.");
        },
    } as unknown as mw.Api;
    return { api, requests };
}
