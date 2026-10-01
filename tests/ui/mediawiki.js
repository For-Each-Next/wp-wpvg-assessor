/** In-memory MediaWiki boundary. The tests exercise the production bundle. */
(() => {
    const options = globalThis.__fixtureOptions ?? {};
    const listTitle = "WikiProject:电子游戏/新进条目";
    const pageTitle = options.pageTitle ?? "Example game";
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
    const fixture = {
        calls: [],
        posts: JSON.parse(sessionStorage.getItem("fixture-posts") ?? "[]"),
        notifications: [],
        talkText: `${lead}\n\n${body}`,
        base: "2026-09-30T23:00:00Z",
        failList: Boolean(options.failList),
        failTalk: Boolean(options.failTalk),
        conflict: Boolean(options.conflict),
        listText: [
            "== 2026年 ==",
            options.alreadyRegistered
                ? `* 9月30日 - {{vgc|${subjectTitle}}}`
                : "* 9月30日 - {{vgc|Earlier game}}",
            "* 9月29日 - 無新條目",
            "",
        ].join("\n"),
    };
    globalThis.__fixture = fixture;
    document.documentElement.lang = options.locale ?? "en";
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
            await loadHold;
            if (options.loadError)
                throw new Error("The fixture is unavailable");
            if (options.delay)
                await new Promise((resolve) =>
                    setTimeout(resolve, options.delay),
                );
            if (params.action !== "query") {
                throw new Error(
                    `Unexpected offline API action: ${params.action}`,
                );
            }
            const titles = String(params.titles ?? "").split("|");
            if (params.prop === "info") {
                return { query: { pages: [{ title: subjectTitle, ns: 0 }] } };
            }
            if (params.rvdir === "newer") {
                return {
                    query: {
                        pages: titles.map((title) => ({
                            title,
                            revisions: [
                                {
                                    timestamp:
                                        title === "Earlier game"
                                            ? "2026-09-30T01:00:00Z"
                                            : creationDate,
                                },
                            ],
                        })),
                    },
                };
            }
            if (params.prop === "revisions") {
                return {
                    curtimestamp: timestamp,
                    query: {
                        pages: titles.map((title) => {
                            if (title === talkTitle)
                                return revisionPage(title, fixture.talkText, 1);
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
                fixture.listText = params.text;
            } else if (params.title === talkTitle) {
                await talkHold;
                if (fixture.failTalk)
                    throw new Error("Talk page temporarily unavailable");
                if (fixture.conflict) {
                    fixture.conflict = false;
                    fixture.base = "2026-10-01T00:30:00Z";
                    fixture.talkText =
                        "{{Concurrent lead}}\n\n== Discussion ==\nConcurrent discussion survives.\n";
                    throw { error: { code: "editconflict" } };
                }
                fixture.talkText = params.text;
            } else {
                throw new Error(
                    `Unexpected offline edit title: ${params.title}`,
                );
            }
            return { edit: { result: "Success" } };
        }
    }

    class Title {
        constructor(text, namespace = 0) {
            this.text = text;
            this.namespace = namespace;
        }
        static newFromText(text) {
            return text.startsWith("Talk:")
                ? new Title(text.slice(5), 1)
                : new Title(text, 0);
        }
        getNamespaceId() {
            return this.namespace;
        }
        getMainText() {
            return this.text;
        }
        getPrefixedText() {
            return this.namespace === 1 ? `Talk:${this.text}` : this.text;
        }
    }

    const values = {
        wgDBname: options.wikiId ?? "zhwiki",
        wgWikiID: options.wikiId ?? "zhwiki",
        wgNamespaceNumber: pageTitle.startsWith("Talk:") ? 1 : 0,
        wgPageName: pageTitle,
        wgUserLanguage: options.locale ?? "en",
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
