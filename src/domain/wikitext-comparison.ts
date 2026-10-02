/**
 * @file src/domain/wikitext-comparison.ts
 * Purpose: Structured line and word differences for reviewable wikitext.
 *
 * Table of contents:
 * 1. WikitextDiffLineKind
 * 2. WikitextDiffRowKind
 * 3. WikitextDiffSegmentKind
 * 4. WikitextDiffSegment
 * 5. WikitextDiffLine
 * 6. WikitextDiffRow
 * 7. WikitextComparison
 * 8. WikitextComparisonOptions
 * 9. SequenceOperationKind
 * 10. SequenceOperation
 * 11. InlineComparison
 * 12. ChangedLinePair
 * 13. compareWikitext
 * 14. normalizeContextLines
 * 15. compareSequences
 * 16. compareChangedSequences
 * 17. buildLcsLengths
 * 18. appendRemainingOperations
 * 19. countCommonPrefix
 * 20. countCommonSuffix
 * 21. buildDiffRows
 * 22. appendChangedRows
 * 23. alignChangedLines
 * 24. buildLineAlignmentScores
 * 25. getLineSimilarity
 * 26. createContextRow
 * 27. createChangedRow
 * 28. createOneSidedLine
 * 29. createDiffLine
 * 30. compareInlineText
 * 31. segmentWords
 * 32. appendSegment
 * 33. isChangedRow
 * 34. limitContextRows
 * 35. collectKeptRows
 * 36. createOmittedRow
 */

type WikitextDiffLineKind = "added" | "context" | "empty" | "removed";
type WikitextDiffRowKind = "line" | "omitted";
type WikitextDiffSegmentKind = "changed" | "unchanged";

interface WikitextDiffSegment {
    kind: WikitextDiffSegmentKind;
    text: string;
}

export interface WikitextDiffLine {
    kind: WikitextDiffLineKind;
    segments: WikitextDiffSegment[];
}

interface WikitextDiffRow {
    after: WikitextDiffLine;
    before: WikitextDiffLine;
    kind: WikitextDiffRowKind;
}

export interface WikitextComparison {
    changed: boolean;
    rows: WikitextDiffRow[];
}

export interface WikitextComparisonOptions {
    contextLines?: number;
    locale?: string;
}

type SequenceOperationKind = "added" | "equal" | "removed";

interface SequenceOperation {
    kind: SequenceOperationKind;
    text: string;
}

interface InlineComparison {
    after: WikitextDiffSegment[];
    before: WikitextDiffSegment[];
}

interface ChangedLinePair {
    added?: SequenceOperation;
    removed?: SequenceOperation;
}

/**
 * Compares wikitext as aligned lines and inline word segments.
 *
 * @param before - Current wikitext.
 * @param after - Proposed wikitext.
 * @param options - Context-line count and word-segmentation locale.
 * @returns Structured comparison safe for text-only rendering.
 */
export function compareWikitext(
    before: string,
    after: string,
    options: WikitextComparisonOptions = {},
): WikitextComparison {
    const operations = compareSequences(before.split("\n"), after.split("\n"));
    const locale = options.locale ?? "zh";
    const rows = buildDiffRows(operations, locale);
    const changed = rows.some(isChangedRow);

    if (!changed) {
        return { changed: false, rows: [] };
    }

    const contextLines = normalizeContextLines(options.contextLines);
    return {
        changed,
        rows: limitContextRows(rows, contextLines),
    };
}

function normalizeContextLines(value: number | undefined): number {
    if (value == null) {
        return 1;
    }
    if (!Number.isFinite(value) || value < 0) {
        throw new RangeError("contextLines must be a non-negative number.");
    }
    return Math.floor(value);
}

function compareSequences(
    before: string[],
    after: string[],
): SequenceOperation[] {
    const prefix = countCommonPrefix(before, after);
    const suffix = countCommonSuffix(before, after, prefix);
    const beforeEnd = before.length - suffix;
    const afterEnd = after.length - suffix;
    const operations = before
        .slice(0, prefix)
        .map((text): SequenceOperation => ({ kind: "equal", text }));

    operations.push(
        ...compareChangedSequences(
            before.slice(prefix, beforeEnd),
            after.slice(prefix, afterEnd),
        ),
    );
    operations.push(
        ...before
            .slice(beforeEnd)
            .map((text): SequenceOperation => ({ kind: "equal", text })),
    );
    return operations;
}

function compareChangedSequences(
    before: string[],
    after: string[],
): SequenceOperation[] {
    const lengths = buildLcsLengths(before, after);
    const operations: SequenceOperation[] = [];
    let beforeIndex = 0;
    let afterIndex = 0;

    while (beforeIndex < before.length && afterIndex < after.length) {
        if (before[beforeIndex] === after[afterIndex]) {
            operations.push({ kind: "equal", text: before[beforeIndex] });
            beforeIndex += 1;
            afterIndex += 1;
            continue;
        }
        if (
            lengths[beforeIndex + 1][afterIndex] >=
            lengths[beforeIndex][afterIndex + 1]
        ) {
            operations.push({ kind: "removed", text: before[beforeIndex] });
            beforeIndex += 1;
            continue;
        }
        operations.push({ kind: "added", text: after[afterIndex] });
        afterIndex += 1;
    }
    appendRemainingOperations(operations, before, beforeIndex, "removed");
    appendRemainingOperations(operations, after, afterIndex, "added");
    return operations;
}

function buildLcsLengths(before: string[], after: string[]): Uint32Array[] {
    const lengths = Array.from(
        { length: before.length + 1 },
        () => new Uint32Array(after.length + 1),
    );
    for (let left = before.length - 1; left >= 0; left -= 1) {
        for (let right = after.length - 1; right >= 0; right -= 1) {
            lengths[left][right] =
                before[left] === after[right]
                    ? lengths[left + 1][right + 1] + 1
                    : Math.max(
                          lengths[left + 1][right],
                          lengths[left][right + 1],
                      );
        }
    }
    return lengths;
}

function appendRemainingOperations(
    operations: SequenceOperation[],
    values: string[],
    start: number,
    kind: "added" | "removed",
): void {
    for (let index = start; index < values.length; index += 1) {
        operations.push({ kind, text: values[index] });
    }
}

function countCommonPrefix(before: string[], after: string[]): number {
    let index = 0;
    while (
        index < before.length &&
        index < after.length &&
        before[index] === after[index]
    ) {
        index += 1;
    }
    return index;
}

function countCommonSuffix(
    before: string[],
    after: string[],
    prefix: number,
): number {
    let count = 0;
    while (
        count < before.length - prefix &&
        count < after.length - prefix &&
        before[before.length - count - 1] === after[after.length - count - 1]
    ) {
        count += 1;
    }
    return count;
}

function buildDiffRows(
    operations: SequenceOperation[],
    locale: string,
): WikitextDiffRow[] {
    const rows: WikitextDiffRow[] = [];
    let changes: SequenceOperation[] = [];

    for (const operation of operations) {
        if (operation.kind !== "equal") {
            changes.push(operation);
            continue;
        }
        appendChangedRows(rows, changes, locale);
        changes = [];
        rows.push(createContextRow(operation.text));
    }
    appendChangedRows(rows, changes, locale);
    return rows;
}

function appendChangedRows(
    rows: WikitextDiffRow[],
    operations: SequenceOperation[],
    locale: string,
): void {
    const removed = operations.filter((item) => item.kind === "removed");
    const added = operations.filter((item) => item.kind === "added");
    const pairs = alignChangedLines(removed, added, locale);

    for (const pair of pairs) {
        rows.push(createChangedRow(pair.removed, pair.added, locale));
    }
}

function alignChangedLines(
    removed: SequenceOperation[],
    added: SequenceOperation[],
    locale: string,
): ChangedLinePair[] {
    const scores = buildLineAlignmentScores(removed, added, locale);
    const pairs: ChangedLinePair[] = [];
    let left = 0;
    let right = 0;
    while (left < removed.length || right < added.length) {
        if (left >= removed.length) {
            pairs.push({ added: added[right++] });
            continue;
        }
        if (right >= added.length) {
            pairs.push({ removed: removed[left++] });
            continue;
        }
        const paired =
            getLineSimilarity(removed[left].text, added[right].text, locale) +
            0.01 +
            scores[left + 1][right + 1];
        if (
            paired >= scores[left + 1][right] &&
            paired >= scores[left][right + 1]
        ) {
            pairs.push({ added: added[right++], removed: removed[left++] });
        } else if (scores[left + 1][right] >= scores[left][right + 1]) {
            pairs.push({ removed: removed[left++] });
        } else {
            pairs.push({ added: added[right++] });
        }
    }
    return pairs;
}

function buildLineAlignmentScores(
    removed: SequenceOperation[],
    added: SequenceOperation[],
    locale: string,
): Float64Array[] {
    const scores = Array.from(
        { length: removed.length + 1 },
        () => new Float64Array(added.length + 1),
    );
    for (let left = removed.length - 1; left >= 0; left -= 1) {
        for (let right = added.length - 1; right >= 0; right -= 1) {
            const paired =
                getLineSimilarity(
                    removed[left].text,
                    added[right].text,
                    locale,
                ) +
                0.01 +
                scores[left + 1][right + 1];
            scores[left][right] = Math.max(
                paired,
                scores[left + 1][right],
                scores[left][right + 1],
            );
        }
    }
    return scores;
}

function getLineSimilarity(
    before: string,
    after: string,
    locale: string,
): number {
    const operations = compareSequences(
        segmentWords(before, locale),
        segmentWords(after, locale),
    );
    const commonLength = operations
        .filter((operation) => operation.kind === "equal")
        .reduce((total, operation) => total + operation.text.length, 0);
    return commonLength / Math.max(before.length, after.length, 1);
}

function createContextRow(text: string): WikitextDiffRow {
    const before = createDiffLine("context", [{ kind: "unchanged", text }]);
    const after = createDiffLine("context", [{ kind: "unchanged", text }]);
    return { after, before, kind: "line" };
}

function createChangedRow(
    removed: SequenceOperation | undefined,
    added: SequenceOperation | undefined,
    locale: string,
): WikitextDiffRow {
    if (removed != null && added != null) {
        const inline = compareInlineText(removed.text, added.text, locale);
        return {
            after: createDiffLine("added", inline.after),
            before: createDiffLine("removed", inline.before),
            kind: "line",
        };
    }
    return {
        after: createOneSidedLine(added, "added"),
        before: createOneSidedLine(removed, "removed"),
        kind: "line",
    };
}

function createOneSidedLine(
    operation: SequenceOperation | undefined,
    kind: "added" | "removed",
): WikitextDiffLine {
    if (operation == null) {
        return createDiffLine("empty", []);
    }
    return createDiffLine(kind, [{ kind: "changed", text: operation.text }]);
}

function createDiffLine(
    kind: WikitextDiffLineKind,
    segments: WikitextDiffSegment[],
): WikitextDiffLine {
    return { kind, segments };
}

function compareInlineText(
    before: string,
    after: string,
    locale: string,
): InlineComparison {
    const beforeSegments: WikitextDiffSegment[] = [];
    const afterSegments: WikitextDiffSegment[] = [];
    const operations = compareSequences(
        segmentWords(before, locale),
        segmentWords(after, locale),
    );

    for (const operation of operations) {
        if (operation.kind !== "added") {
            appendSegment(beforeSegments, operation);
        }
        if (operation.kind !== "removed") {
            appendSegment(afterSegments, operation);
        }
    }
    return { after: afterSegments, before: beforeSegments };
}

function segmentWords(text: string, locale: string): string[] {
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    return [...segmenter.segment(text)].map((segment) => segment.segment);
}

function appendSegment(
    segments: WikitextDiffSegment[],
    operation: SequenceOperation,
): void {
    const kind = operation.kind === "equal" ? "unchanged" : "changed";
    const previous = segments.at(-1);
    if (previous?.kind === kind) {
        previous.text += operation.text;
        return;
    }
    segments.push({ kind, text: operation.text });
}

function isChangedRow(row: WikitextDiffRow): boolean {
    return (
        row.kind === "line" &&
        (row.before.kind !== "context" || row.after.kind !== "context")
    );
}

function limitContextRows(
    rows: WikitextDiffRow[],
    contextLines: number,
): WikitextDiffRow[] {
    const keep = rows.map(() => false);
    for (let index = 0; index < rows.length; index += 1) {
        if (!isChangedRow(rows[index])) {
            continue;
        }
        const start = Math.max(0, index - contextLines);
        const end = Math.min(rows.length, index + contextLines + 1);
        keep.fill(true, start, end);
    }
    return collectKeptRows(rows, keep);
}

function collectKeptRows(
    rows: WikitextDiffRow[],
    keep: boolean[],
): WikitextDiffRow[] {
    const result: WikitextDiffRow[] = [];
    let omitted = false;
    for (let index = 0; index < rows.length; index += 1) {
        if (keep[index]) {
            result.push(rows[index]);
            omitted = false;
        } else if (!omitted) {
            result.push(createOmittedRow());
            omitted = true;
        }
    }
    return result;
}

function createOmittedRow(): WikitextDiffRow {
    return {
        after: createDiffLine("empty", []),
        before: createDiffLine("empty", []),
        kind: "omitted",
    };
}
