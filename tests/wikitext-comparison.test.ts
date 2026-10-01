/** Tests reusable structured wikitext comparisons. */

import assert from "node:assert/strict";
import test from "node:test";

import {
    compareWikitext,
    type WikitextDiffLine,
} from "../src/domain/wikitext-comparison.ts";

function getText(line: WikitextDiffLine): string {
    return line.segments.map((segment) => segment.text).join("");
}

function getChangedText(line: WikitextDiffLine): string {
    return line.segments
        .filter((segment) => segment.kind === "changed")
        .map((segment) => segment.text)
        .join("");
}

test("highlights words only within changed lines", () => {
    const comparison = compareWikitext(
        "Alpha line\nThe quick brown fox\nOmega line",
        "Alpha line\nThe quick blue fox\nOmega line",
    );

    assert.equal(comparison.changed, true);
    assert.deepEqual(
        comparison.rows.map((row) => [row.before.kind, row.after.kind]),
        [
            ["context", "context"],
            ["removed", "added"],
            ["context", "context"],
        ],
    );
    assert.equal(getChangedText(comparison.rows[1].before), "brown");
    assert.equal(getChangedText(comparison.rows[1].after), "blue");
    assert.ok(
        comparison.rows[0].before.segments.every(
            (segment) => segment.kind === "unchanged",
        ),
    );
});

test("segments Chinese word changes while preserving wikitext", () => {
    const before = "{{WikiProject|重要度=低|class=Start}}";
    const after = "{{WikiProject|重要度=高|class=Start}}";
    const [row] = compareWikitext(before, after).rows;

    assert.equal(getText(row.before), before);
    assert.equal(getText(row.after), after);
    assert.equal(getChangedText(row.before), "低");
    assert.equal(getChangedText(row.after), "高");
});

test("aligns inserted lines with an empty comparison cell", () => {
    const comparison = compareWikitext(
        "One\nTwo\nFour",
        "One\nTwo\nThree\nFour",
    );
    const added = comparison.rows.find((row) => row.after.kind === "added");

    assert.ok(added);
    assert.equal(added.before.kind, "empty");
    assert.equal(getText(added.after), "Three");
    assert.equal(getChangedText(added.after), "Three");
});

test("pairs a modified line beside the most similar removed line", () => {
    const comparison = compareWikitext(
        "Header\n|obsolete=yes\n|importance=Low\nFooter",
        "Header\n|importance=High\nFooter",
    );
    const modified = comparison.rows.find(
        (row) => getText(row.after) === "|importance=High",
    );

    assert.ok(modified);
    assert.equal(getText(modified.before), "|importance=Low");
    assert.equal(getChangedText(modified.before), "Low");
    assert.equal(getChangedText(modified.after), "High");
});

test("collapses distant unchanged lines without highlighting context", () => {
    const comparison = compareWikitext(
        "Old first\nTwo\nThree\nFour\nOld last",
        "New first\nTwo\nThree\nFour\nNew last",
        { contextLines: 0 },
    );

    assert.deepEqual(
        comparison.rows.map((row) => row.kind),
        ["line", "omitted", "line"],
    );
});

test("returns no rows when the sources are unchanged", () => {
    assert.deepEqual(compareWikitext("Same\nsource", "Same\nsource"), {
        changed: false,
        rows: [],
    });
});
