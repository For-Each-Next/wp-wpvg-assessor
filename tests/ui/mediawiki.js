/** In-memory MediaWiki boundary. The tests exercise the production bundle. */
(() => {
    const options = globalThis.__fixtureOptions ?? {};
    const listTitle = "WikiProject:电子游戏/新进条目";
    const pageTitle =
        new URL(location.href).searchParams.get("page") ??
        options.pageTitle ??
        "Example game";
    const subjectTitle = pageTitle.replace(/^Talk:/u, "");
    const talkTitle = `Talk:${subjectTitle}`;
    const timestamp = "2026-10-01T01:00:00Z";
    const creationDate = options.expired
        ? "2025-01-01T00:00:00Z"
        : "2026-09-30T12:00:00Z";
    const lead =
        options.lead ??
        [
            "{{Talk header}}",
            "{{WikiProject banner shell|class=Start|1=",
            "{{WikiProject Video games|importance=Low|Sega=yes}}",
            "{{WikiProject Role-playing games|custom=keep}}",
            "}}",
        ].join("\n");
    const body = "== Discussion ==\nKeep this discussion exactly.\n";
    const persisted = JSON.parse(
        sessionStorage.getItem("fixture-pages") ?? "{}",
    );
    const talkPages = persisted.talkPages ?? {};
    talkPages[talkTitle] ??= `${lead}\n\n${body}`;
    const fixture = {
        calls: JSON.parse(sessionStorage.getItem("fixture-calls") ?? "[]"),
        posts: JSON.parse(sessionStorage.getItem("fixture-posts") ?? "[]"),
        notifications: [],
        talkPages,
        get talkText() {
            return talkPages[talkTitle];
        },
        set talkText(value) {
            talkPages[talkTitle] = value;
        },
        base: persisted.base ?? "2026-09-30T23:00:00Z",
        failList: Boolean(options.failList),
        failTalk: Boolean(options.failTalk),
        conflict: Boolean(options.conflict),
        listConflict: Boolean(options.listConflict),
        failTalkTitle: options.failTalkTitle ?? null,
        listText:
            persisted.listText ??
            options.listText ??
            [
                "== 2026年 ==",
                options.alreadyRegistered
                    ? `* 9月30日 - {{vgc|${subjectTitle}}}`
                    : "* 9月30日 - {{vgc|Earlier game}}",
                "* 9月29日 - 無新條目",
                "",
            ].join("\n"),
    };
    function persistPages() {
        sessionStorage.setItem(
            "fixture-pages",
            JSON.stringify({
                talkPages,
                listText: fixture.listText,
                base: fixture.base,
            }),
        );
    }
    persistPages();
    globalThis.__fixture = fixture;
    document.documentElement.lang = options.locale ?? "en";
    if (options.articleCss != null) {
        const style = document.createElement("style");
        style.setAttribute("data-mw-deduplicate", "fixture.article.styles");
        style.textContent = options.articleCss;
        document.head.append(style);
    }
    const loadHold = options.holdLoad
        ? new Promise((resolve) => {
              fixture.releaseLoad = resolve;
          })
        : Promise.resolve();
    const talkHold = options.holdTalk
        ? new Promise((resolve) => {
              fixture.releaseTalk = resolve;
          })
        : Promise.resolve();
    const articleHold = options.holdArticle
        ? new Promise((resolve) => {
              fixture.releaseArticle = resolve;
          })
        : Promise.resolve();

    function escapeHtml(text) {
        return String(text)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function namespaceForTitle(title) {
        if (title.startsWith("Talk:")) return 1;
        if (title.startsWith("File:")) return 6;
        if (/^(?:Category|分类|分類):/u.test(title)) return 14;
        return 0;
    }

    function missingPage(title) {
        return options.missingTitles?.includes(title)
            ? { title, ns: namespaceForTitle(title), missing: true }
            : null;
    }

    function revisionPage(title, content, namespace = 0) {
        return {
            title,
            ns: namespace,
            revisions: [
                {
                    timestamp: fixture.base,
                    slots: { main: { content } },
                },
            ],
        };
    }

    class Api {
        async get(params) {
            fixture.calls.push(structuredClone(params));
            sessionStorage.setItem(
                "fixture-calls",
                JSON.stringify(fixture.calls),
            );
            await loadHold;
            if (options.loadError)
                throw new Error("The fixture is unavailable");
            if (options.delay)
                await new Promise((resolve) =>
                    setTimeout(resolve, options.delay),
                );
            if (params.action === "parse") {
                await articleHold;
                const title = String(params.page);
                return {
                    parse: {
                        title,
                        pageid: 1,
                        text:
                            options.articleHtml?.[title] ??
                            `<h1>${escapeHtml(title)}</h1><p>Article preview for ${escapeHtml(title)}</p>`,
                    },
                };
            }
            if (params.action !== "query") {
                throw new Error(
                    `Unexpected offline API action: ${params.action}`,
                );
            }
            if (params.list === "categorymembers") {
                if (options.categoryError)
                    throw new Error("Category temporarily unavailable");
                const members = options.categoryMembers ?? [
                    "Talk:First game",
                    "Talk:Second game",
                    "Talk:Third game",
                    "Talk:Fourth game",
                    "Talk:Fifth game",
                ];
                const offset = Number(params.cmcontinue ?? 0);
                const count = options.categoryPageSize ?? members.length;
                const next = offset + count;
                return {
                    ...(next < members.length
                        ? {
                              continue: {
                                  cmcontinue: String(next),
                                  continue: "-||",
                              },
                          }
                        : {}),
                    query: {
                        categorymembers: members
                            .slice(offset, next)
                            .map((title, index) => ({
                                pageid: offset + index + 1,
                                ns: namespaceForTitle(title),
                                title,
                            })),
                    },
                };
            }
            const titles = String(params.titles ?? "").split("|");
            if (
                options.unavailableRegistrationList &&
                titles.includes(listTitle)
            ) {
                throw new Error("The registration fixture is unavailable");
            }
            if (params.prop === "info") {
                return {
                    query: {
                        pages: titles.map(
                            (title) =>
                                missingPage(title) ?? {
                                    title,
                                    ns: namespaceForTitle(title),
                                },
                        ),
                    },
                };
            }
            if (params.rvdir === "newer") {
                return {
                    query: {
                        pages: titles.map(
                            (title) =>
                                missingPage(title) ?? {
                                    title,
                                    revisions: [
                                        {
                                            timestamp:
                                                title === "Earlier game"
                                                    ? "2026-09-30T01:00:00Z"
                                                    : (options.creationDates?.[
                                                          title
                                                      ] ?? creationDate),
                                        },
                                    ],
                                },
                        ),
                    },
                };
            }
            if (params.prop === "revisions") {
                return {
                    curtimestamp: timestamp,
                    query: {
                        pages: titles.map((title) => {
                            const missing = missingPage(title);
                            if (missing != null) return missing;
                            if (title.startsWith("Talk:")) {
                                talkPages[title] ??= `${lead}\n\n${body}`;
                                return revisionPage(title, talkPages[title], 1);
                            }
                            if (title === listTitle)
                                return revisionPage(
                                    title,
                                    fixture.listText,
                                    102,
                                );
                            return revisionPage(title, "Article source");
                        }),
                    },
                };
            }
            throw new Error(
                `Unexpected offline API request: ${JSON.stringify(params)}`,
            );
        }

        async postWithToken(token, params) {
            if (token !== "csrf" || params.action !== "edit") {
                throw new Error("Unexpected offline API mutation");
            }
            fixture.posts.push({ token, ...structuredClone(params) });
            sessionStorage.setItem(
                "fixture-posts",
                JSON.stringify(fixture.posts),
            );
            if (params.title === listTitle) {
                if (fixture.failList)
                    throw new Error("Registration temporarily unavailable");
                if (fixture.listConflict)
                    throw { error: { code: "editconflict" } };
                fixture.listText = params.text;
            } else if (params.title.startsWith("Talk:")) {
                await talkHold;
                if (fixture.failTalk || fixture.failTalkTitle === params.title)
                    throw new Error("Talk page temporarily unavailable");
                if (fixture.conflict) {
                    fixture.conflict = false;
                    fixture.base = "2026-10-01T00:30:00Z";
                    talkPages[params.title] =
                        "{{Concurrent lead}}\n\n== Discussion ==\nConcurrent discussion survives.\n";
                    persistPages();
                    throw { error: { code: "editconflict" } };
                }
                talkPages[params.title] = params.text;
            } else {
                throw new Error(
                    `Unexpected offline edit title: ${params.title}`,
                );
            }
            persistPages();
            return { edit: { result: "Success" } };
        }
    }

    class Title {
        constructor(text, namespace = 0) {
            this.text = text;
            this.namespace = namespace;
        }
        static newFromText(text) {
            const namespace = namespaceForTitle(text);
            return namespace === 0
                ? new Title(text, 0)
                : new Title(text.slice(text.indexOf(":") + 1), namespace);
        }
        getNamespaceId() {
            return this.namespace;
        }
        getMainText() {
            return this.text;
        }
        getPrefixedText() {
            if (this.namespace === 1) return `Talk:${this.text}`;
            if (this.namespace === 14) return `Category:${this.text}`;
            return this.text;
        }
    }

    const values = {
        wgDBname: options.wikiId ?? "zhwiki",
        wgWikiID: options.wikiId ?? "zhwiki",
        wgNamespaceNumber: namespaceForTitle(pageTitle),
        wgPageName: pageTitle,
        wgUserLanguage: options.locale ?? "en",
        wgUserName: options.userName ?? "Fixture editor",
        wgAction: "view",
        wgPageContentModel: "wikitext",
    };
    const vue = { ...Vue, createMwApp: Vue.createApp };
    globalThis.mw = {
        Api,
        Title,
        config: { get: (key) => values[key] },
        loader: {
            using: async () => (name) => {
                if (name === "vue") return vue;
                if (name === "@wikimedia/codex") return codex;
                throw new Error(`Unexpected ResourceLoader module: ${name}`);
            },
        },
        notify(message, settings) {
            fixture.notifications.push({ message, settings });
            document.querySelector("#notifications").textContent = message;
        },
        util: {
            addPortletLink(portlet, href, text, id) {
                const link = document.createElement("a");
                link.href = href;
                link.textContent = text;
                link.id = id;
                document.getElementById(portlet).append(link);
                return link;
            },
        },
    };
})();
