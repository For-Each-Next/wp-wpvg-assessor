/**
 * @file src/platform/mediawiki/response.ts
 * Purpose: Decodes the small MediaWiki response shapes used by the gadget.
 *
 * Table of contents:
 * 1. UnknownRecord
 * 2. asRecord
 * 3. getFirstQueryPage
 * 4. getQueryPages
 * 5. getFirstRevision
 * 6. getRevisionContent
 * 7. getRequiredString
 */

export type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | null {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    return value as UnknownRecord;
}

export function getFirstQueryPage(response: unknown): UnknownRecord | null {
    return getQueryPages(response)[0] ?? null;
}

export function getQueryPages(response: unknown): Array<UnknownRecord> {
    const responseRecord = asRecord(response);
    const query = asRecord(responseRecord?.query);
    const pages = query?.pages;

    if (!Array.isArray(pages)) return [];
    return pages.flatMap(function readPage(page) {
        const record = asRecord(page);
        return record == null ? [] : [record];
    });
}

export function getFirstRevision(
    page: UnknownRecord | null,
): UnknownRecord | null {
    const revisions = page?.revisions;
    return Array.isArray(revisions) ? asRecord(revisions[0]) : null;
}

export function getRevisionContent(revision: UnknownRecord | null): string {
    const slots = asRecord(revision?.slots);
    const main = asRecord(slots?.main);
    const content = main?.content;
    if (typeof content !== "string") {
        throw new Error(
            "MediaWiki response omitted readable revision content.",
        );
    }
    return content;
}

export function getRequiredString(
    record: UnknownRecord | null,
    key: string,
    description: string,
): string {
    const value = record?.[key];
    if (typeof value !== "string" || value === "") {
        throw new Error(`MediaWiki response omitted ${description}.`);
    }

    return value;
}
