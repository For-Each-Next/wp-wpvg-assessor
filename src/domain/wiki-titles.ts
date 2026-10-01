/** Database-scoped MediaWiki namespace prefixes used in wikitext. */

type NamespacePrefixMap = Readonly<Record<number, readonly string[]>>;

/**
 * Valid namespace prefixes reported by English and Chinese Wikipedia.
 *
 * Each namespace starts with its current name. A differing canonical
 * name and configured aliases follow. Data came from MediaWiki siteinfo
 * `namespaces` and `namespacealiases` properties.
 */
const WIKI_NAMESPACE_PREFIXES = freezeNamespaceCatalogs({
    enwiki: {
        "-2": ["Media"],
        "-1": ["Special"],
        0: [""],
        1: ["Talk"],
        2: ["User"],
        3: ["User talk"],
        4: ["Wikipedia", "Project", "WP"],
        5: ["Wikipedia talk", "Project talk", "WT"],
        6: ["File", "Image"],
        7: ["File talk", "Image talk"],
        8: ["MediaWiki"],
        9: ["MediaWiki talk"],
        10: ["Template", "TM"],
        11: ["Template talk"],
        12: ["Help"],
        13: ["Help talk"],
        14: ["Category"],
        15: ["Category talk"],
        100: ["Portal"],
        101: ["Portal talk"],
        118: ["Draft"],
        119: ["Draft talk"],
        126: ["MOS"],
        127: ["MOS talk"],
        710: ["TimedText"],
        711: ["TimedText talk"],
        828: ["Module"],
        829: ["Module talk"],
        1728: ["Event"],
        1729: ["Event talk"],
    },
    zhwiki: {
        "-2": [
            "Media",
            "媒体",
            "媒体文件",
            "媒体档案",
            "媒體",
            "媒體文件",
            "媒體檔案",
        ],
        "-1": ["Special", "特殊"],
        0: [""],
        1: ["Talk", "对话", "對話", "討論", "讨论"],
        2: ["User", "U", "使用者", "用戶", "用户"],
        3: [
            "User talk",
            "UT",
            "使用者对话",
            "使用者對話",
            "使用者討論",
            "使用者讨论",
            "用戶對話",
            "用戶討論",
            "用户对话",
            "用户讨论",
        ],
        4: [
            "Wikipedia",
            "Project",
            "WP",
            "专案",
            "專案",
            "維基百科",
            "维基百科",
        ],
        5: [
            "Wikipedia talk",
            "Project talk",
            "WT",
            "Wikipedia对话",
            "Wikipedia對話",
            "Wikipedia討論",
            "Wikipedia讨论",
            "专案讨论",
            "專案討論",
            "維基百科對話",
            "維基百科討論",
            "维基百科对话",
            "维基百科讨论",
        ],
        6: [
            "File",
            "Image",
            "图像",
            "图片",
            "圖像",
            "圖片",
            "文件",
            "档案",
            "檔案",
        ],
        7: [
            "File talk",
            "Image talk",
            "图像对话",
            "图像讨论",
            "图片讨论",
            "圖像對話",
            "圖像討論",
            "圖片討論",
            "文件对话",
            "文件對話",
            "文件討論",
            "文件讨论",
            "档案对话",
            "档案讨论",
            "檔案對話",
            "檔案討論",
        ],
        8: ["MediaWiki"],
        9: ["MediaWiki talk", "MediaWiki討論", "MediaWiki讨论"],
        10: ["Template", "T", "样板", "模板", "樣板"],
        11: [
            "Template talk",
            "样板对话",
            "样板讨论",
            "模板对话",
            "模板對話",
            "模板討論",
            "模板讨论",
            "樣板對話",
            "樣板討論",
        ],
        12: [
            "Help",
            "H",
            "使用說明",
            "使用说明",
            "帮助",
            "幫助",
            "說明",
            "说明",
        ],
        13: [
            "Help talk",
            "使用說明討論",
            "使用说明讨论",
            "帮助对话",
            "帮助讨论",
            "幫助對話",
            "幫助討論",
            "說明討論",
            "说明讨论",
        ],
        14: ["Category", "CAT", "分类", "分類"],
        15: ["Category talk", "分类对话", "分类讨论", "分類對話", "分類討論"],
        100: ["Portal", "P", "主題", "主题"],
        101: ["Portal talk", "主題對話", "主題討論", "主题对话", "主题讨论"],
        102: [
            "WikiProject",
            "PJ",
            "WPJ",
            "专题",
            "專題",
            "維基專題",
            "维基专题",
        ],
        103: [
            "WikiProject talk",
            "PJT",
            "WPJT",
            "专题对话",
            "专题讨论",
            "專題對話",
            "專題討論",
            "維基專題對話",
            "維基專題討論",
            "维基专题对话",
            "维基专题讨论",
        ],
        118: ["Draft", "草稿"],
        119: ["Draft talk", "草稿討論", "草稿讨论"],
        126: ["MOS"],
        127: ["MOS talk"],
        710: ["TimedText"],
        711: ["TimedText talk"],
        828: ["Module", "模块", "模塊", "模組", "模组"],
        829: [
            "Module talk",
            "模块对话",
            "模块讨论",
            "模塊對話",
            "模塊討論",
            "模組對話",
            "模組討論",
            "模组对话",
            "模组讨论",
        ],
        1728: ["Event"],
        1729: ["Event talk"],
        2600: ["Topic", "話題", "话题"],
    },
} as const satisfies Readonly<Record<string, NamespacePrefixMap>>);

type NamespaceDatabaseName = keyof typeof WIKI_NAMESPACE_PREFIXES;

type NamespaceSource = NamespaceDatabaseName;

const EMPTY_NAMESPACE_PREFIXES: readonly string[] = Object.freeze([]);
const WIKI_NAMESPACE_IDS = Object.freeze({
    enwiki: createNamespaceIds(WIKI_NAMESPACE_PREFIXES.enwiki),
    zhwiki: createNamespaceIds(WIKI_NAMESPACE_PREFIXES.zhwiki),
}) satisfies Readonly<
    Record<NamespaceDatabaseName, Readonly<Record<string, number>>>
>;

/**
 * Normalizes a namespace prefix like MediaWiki's `wgNamespaceIds` keys.
 *
 * @param prefix - Entered namespace prefix without a colon.
 * @returns Case-folded prefix with spaces and underscores normalized.
 */
function normalizeNamespacePrefix(prefix: string): string {
    return prefix
        .trim()
        .replace(/[_\s]+/gu, "_")
        .toLowerCase();
}

/**
 * Gets the namespace ID for a database-scoped prefix.
 *
 * @param source - Static database name.
 * @param prefix - Namespace prefix without a colon.
 * @returns Namespace ID when configured for the database.
 */
function getNamespaceId(
    source: NamespaceSource,
    prefix: string,
): number | undefined {
    return getNamespaceIds(source)[normalizeNamespacePrefix(prefix)];
}

/**
 * Gets every configured prefix for one namespace.
 *
 * @param source - Static database name.
 * @param namespaceId - MediaWiki namespace ID.
 * @returns Current name, canonical name when different, and aliases.
 */
function getNamespacePrefixes(
    source: NamespaceSource,
    namespaceId: number,
): readonly string[] {
    const prefixes: NamespacePrefixMap = WIKI_NAMESPACE_PREFIXES[source];
    return prefixes[namespaceId] ?? EMPTY_NAMESPACE_PREFIXES;
}

/**
 * Gets a reverse map compatible with `wgNamespaceIds` keys.
 *
 * @param source - Static database name.
 * @returns Normalized namespace prefixes keyed to namespace IDs.
 */
function getNamespaceIds(
    source: NamespaceSource,
): Readonly<Record<string, number>> {
    return WIKI_NAMESPACE_IDS[source];
}

/**
 * Gets a title's namespace ID from its database-scoped prefix.
 *
 * Bare titles and unknown prefixes remain in the main namespace.
 * One leading colon used to force a wikitext link is ignored.
 *
 * @param value - Title to inspect.
 * @param source - Static database name.
 * @returns Resolved namespace ID.
 */
export function getTitleNamespaceId(
    value: string,
    source: NamespaceSource,
): number {
    const entered = readEnteredNamespacePrefix(value);
    return entered == null ? 0 : (getNamespaceId(source, entered.prefix) ?? 0);
}

/**
 * Removes a matching database-scoped namespace prefix from a title.
 *
 * @param value - Title with or without a namespace prefix.
 * @param source - Static database name.
 * @param namespaceId - Namespace ID to remove.
 * @returns Trimmed title without a matching prefix.
 */
export function stripNamespacePrefix(
    value: string,
    source: NamespaceSource,
    namespaceId: number,
): string {
    const title = value.trim();
    const entered = readEnteredNamespacePrefix(title);
    if (entered == null) {
        return title;
    }
    if (getNamespaceId(source, entered.prefix) !== namespaceId) {
        return title;
    }
    return title.slice(entered.separator + 1).trim();
}

/**
 * Formats a title with the database's current namespace name.
 *
 * @param value - Title with or without a matching namespace prefix.
 * @param source - Static database name.
 * @param namespaceId - Namespace ID to apply.
 * @returns Title formatted with the current namespace name.
 */
export function formatNamespaceTitle(
    value: string,
    source: NamespaceSource,
    namespaceId: number,
): string {
    const prefixes = getNamespacePrefixes(source, namespaceId);
    const prefix = prefixes[0];
    if (prefix == null) {
        const databaseName = source;
        throw new RangeError(
            `Unknown ${databaseName} namespace ID: ${namespaceId}`,
        );
    }
    const title = stripNamespacePrefix(value, source, namespaceId);
    return prefix === "" ? title : `${prefix}:${title}`;
}

function createNamespaceIds(
    prefixes: NamespacePrefixMap,
): Readonly<Record<string, number>> {
    const namespaceIds = Object.create(null) as Record<string, number>;
    for (const [namespaceId, values] of Object.entries(prefixes)) {
        for (const prefix of values) {
            namespaceIds[normalizeNamespacePrefix(prefix)] =
                Number(namespaceId);
        }
    }
    return Object.freeze(namespaceIds);
}

function freezeNamespaceCatalogs<
    Catalogs extends Readonly<Record<string, NamespacePrefixMap>>,
>(catalogs: Catalogs): Catalogs {
    for (const prefixes of Object.values(catalogs)) {
        for (const aliases of Object.values(prefixes)) {
            Object.freeze(aliases);
        }
        Object.freeze(prefixes);
    }
    return Object.freeze(catalogs);
}

function readEnteredNamespacePrefix(
    value: string,
): { prefix: string; separator: number } | null {
    const title = value.trim();
    let start = title.startsWith(":") ? 1 : 0;
    while (/\s/u.test(title[start] ?? "")) {
        start += 1;
    }
    const separator = title.indexOf(":", start);
    if (separator < 0) {
        return null;
    }
    return { prefix: title.slice(start, separator), separator };
}
