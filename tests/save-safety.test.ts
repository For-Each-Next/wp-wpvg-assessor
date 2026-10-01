/** Writes require readable snapshots and a confirmed MediaWiki edit result. */
import assert from "node:assert/strict";
import test from "node:test";

import { createTalkSaveWorkflow } from "../src/app/save-talk-assessment.ts";
import { createAssessmentPageApi } from "../src/platform/mediawiki/assessment-page-api.ts";
import {
    createNewPageListApi,
    NEW_PAGE_LIST_TITLE,
} from "../src/platform/mediawiki/new-page-list-api.ts";
import {
    createPageApi,
    decodePageTextResponse,
} from "../src/platform/mediawiki/page-api.ts";
import { createTalkPageApi } from "../src/platform/mediawiki/talk-page-api.ts";
import { createLogger } from "../src/shared/logging.ts";

const logger = createLogger("save-safety-test", { level: "silent" });
const pageApi = createPageApi(logger, { read: () => ({}), write() {} });
const talkApi = createTalkPageApi(logger);
const listApi = createNewPageListApi(logger);
const assessmentApi = createAssessmentPageApi(logger);
const saveTalk = createTalkSaveWorkflow({
    fetchPageText: pageApi.fetchPageText,
    logger,
    postTalkPageEdit: talkApi.postTalkPageEdit,
});
const edit = {
    summary: "Reviewed summary",
    title: "Talk:Example",
    topSection: "{{Reviewed banner}}\n",
};
const invalidRevisions = [
    ["omitted revisions", undefined],
    ["hidden revision", [{ timestamp: "base", texthidden: true }]],
    [
        "numeric content",
        [{ timestamp: "base", slots: { main: { content: 123 } } }],
    ],
    [
        "object content",
        [{ timestamp: "base", slots: { main: { content: {} } } }],
    ],
    [
        "omitted base timestamp",
        [{ slots: { main: { content: "Body to preserve" } } }],
    ],
] as const;

function responseFor(page: Record<string, unknown>): unknown {
    return { curtimestamp: "query-time", query: { pages: [page] } };
}

function readablePage(title = "Talk:Example"): Record<string, unknown> {
    return {
        title,
        revisions: [
            {
                timestamp: "base",
                slots: {
                    main: {
                        content:
                            "{{Old banner}}\n\n== Discussion ==\nBody to preserve",
                    },
                },
            },
        ],
    };
}

for (const [description, revisions] of invalidRevisions) {
    test(`an existing talk page with ${description} stops before any post`, async () => {
        let posts = 0;
        const api = {
            async get() {
                return responseFor({ title: edit.title, revisions });
            },
            async postWithToken() {
                posts += 1;
                return { edit: { result: "Success" } };
            },
        } as unknown as mw.Api;
        await assert.rejects(saveTalk(api, edit));
        assert.equal(posts, 0);
    });

    test(`batched existing talk and list pages reject ${description}`, async () => {
        for (const invalidTitle of [edit.title, NEW_PAGE_LIST_TITLE]) {
            const api = {
                async get() {
                    return {
                        curtimestamp: "query-time",
                        query: {
                            pages: [
                                readablePage(edit.title),
                                readablePage(NEW_PAGE_LIST_TITLE),
                            ].map((page) =>
                                page.title === invalidTitle
                                    ? { ...page, revisions }
                                    : page,
                            ),
                        },
                    };
                },
            } as unknown as mw.Api;
            await assert.rejects(
                assessmentApi.fetchAssessmentPages(api, edit.title),
            );
        }
    });
}

test("an explicitly missing talk page is saved with createonly", async () => {
    const missingResponse = responseFor({ title: edit.title, missing: true });
    assert.deepEqual(decodePageTextResponse(missingResponse), {
        exists: false,
        starttimestamp: "query-time",
        text: "",
    });
    const posts: Array<Record<string, unknown>> = [];
    const api = {
        async get() {
            return missingResponse;
        },
        async postWithToken(_token: string, params: Record<string, unknown>) {
            posts.push(params);
            return { edit: { result: "Success" } };
        },
    } as unknown as mw.Api;
    assert.equal(await saveTalk(api, edit), edit.topSection);
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.createonly, true);
    assert.equal(posts[0]?.basetimestamp, undefined);
    assert.equal(posts[0]?.text, edit.topSection);
});

test("a batch can contain a genuinely missing talk page and a readable list", async () => {
    const api = {
        async get() {
            return {
                curtimestamp: "query-time",
                query: {
                    pages: [
                        { title: edit.title, missing: true },
                        readablePage(NEW_PAGE_LIST_TITLE),
                    ],
                },
            };
        },
    } as unknown as mw.Api;
    const pages = await assessmentApi.fetchAssessmentPages(api, edit.title);
    assert.deepEqual(pages.talkPage, {
        exists: false,
        starttimestamp: "query-time",
        text: "",
    });
    assert.equal(pages.newPageList.basetimestamp, "base");
});

for (const [description, response] of [
    ["an empty response", {}],
    [
        "a CAPTCHA challenge",
        { edit: { result: "Failure", captcha: { id: "123" } } },
    ],
    [
        "an abuse-filter warning",
        { edit: { result: "Failure", code: "abusefilter-warning" } },
    ],
] as const) {
    test(`${description} never confirms a talk save or triggers an uncertain retry`, async () => {
        let posts = 0;
        const api = {
            async get() {
                return responseFor(readablePage());
            },
            async postWithToken() {
                posts += 1;
                return response;
            },
        } as unknown as mw.Api;
        await assert.rejects(saveTalk(api, edit));
        assert.equal(posts, 1);
    });

    test(`${description} never confirms a list registration`, async () => {
        const api = {
            async postWithToken() {
                return response;
            },
        } as unknown as mw.Api;
        await assert.rejects(
            listApi.savePreparedNewPageList(
                api,
                {
                    basetimestamp: "base",
                    starttimestamp: "start",
                    text: "Old list",
                },
                "Reviewed list",
                "Reviewed summary",
            ),
        );
    });
}

test("a fulfilled editconflict response retries using the refreshed revision", async () => {
    const posts: Array<Record<string, unknown>> = [];
    const api = {
        async get() {
            const page = readablePage();
            page.revisions = [
                {
                    timestamp: `base-${posts.length}`,
                    slots: {
                        main: {
                            content: `{{Old}}\n\n== Discussion ==\nBody ${posts.length}`,
                        },
                    },
                },
            ];
            return responseFor(page);
        },
        async postWithToken(_token: string, params: Record<string, unknown>) {
            posts.push(params);
            return posts.length === 1
                ? { error: { code: "editconflict" } }
                : { edit: { result: "Success" } };
        },
    } as unknown as mw.Api;
    const result = await saveTalk(api, edit);
    assert.equal(posts.length, 2);
    assert.equal(posts[1]?.basetimestamp, "base-1");
    assert.equal(result, `${edit.topSection}\n== Discussion ==\nBody 1`);
});

test("a readable existing empty page accepts a confirmed successful edit", async () => {
    const empty = readablePage();
    empty.revisions = [{ timestamp: "base", slots: { main: { content: "" } } }];
    let posts = 0;
    const api = {
        async get() {
            return responseFor(empty);
        },
        async postWithToken() {
            posts += 1;
            return { edit: { result: "Success" } };
        },
    } as unknown as mw.Api;
    assert.equal(await saveTalk(api, edit), edit.topSection);
    assert.equal(posts, 1);
});
