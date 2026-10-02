/**
 * @file tests/new-page-list.test.ts
 * Purpose: Characterizes pure new-page-list parsing and insertion.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. Test scenarios
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    getTitlesForDate,
    prepareNewPageListRegistration,
} from "../src/domain/new-page-list.ts";

const LIST_TEXT = [
    "Intro",
    "",
    "== 2026年 ==",
    "* 7月29日 - {{vgc|Later}}、{{vgc|Earlier}}",
    "*:模板：{{vgc|Template:Old}}",
    "* 7月28日 - {{vgc|Yesterday}}",
    "",
    "== 2025年 ==",
    "* 12月31日 - {{vgc|Old}}",
    "",
].join("\n");

test("finds main and subgroup titles for a UTC date", () => {
    const titles = getTitlesForDate(
        LIST_TEXT,
        new Date("2026-07-29T23:59:59Z"),
    );

    assert.deepEqual(titles, ["Later", "Earlier", "Template:Old"]);
});

test("inserts an article by known creation time", () => {
    const creationTimes = new Map([
        ["Earlier", new Date("2026-07-29T01:00:00Z")],
        ["New", new Date("2026-07-29T02:00:00Z")],
        ["Later", new Date("2026-07-29T03:00:00Z")],
    ]);
    const result = prepareNewPageListRegistration({
        creationDate: new Date("2026-07-29T02:00:00Z"),
        creationTimes,
        namespaceNumber: 0,
        text: LIST_TEXT,
        title: "New",
    });

    assert.equal(result.changed, true);
    assert.equal(result.eligible, true);
    assert.ok(
        result.proposedText.includes(
            "* 7月29日 - " + "{{vgc|Earlier}}、{{vgc|New}}、{{vgc|Later}}",
        ),
    );
});

test("removes the target date no-new-entry marker for an article", () => {
    const source = [
        "== 2026年 ==",
        "* 7月29日 - 無新條目",
        "* 7月28日 - 无新条目",
        "",
    ].join("\n");
    const result = prepareNewPageListRegistration({
        creationDate: new Date("2026-07-29T02:00:00Z"),
        namespaceNumber: 0,
        text: source,
        title: "New",
    });

    assert.match(result.proposedText, /^\* 7月29日 - \{\{vgc\|New\}\}$/mu);
    assert.match(result.proposedText, /^\* 7月28日 - 无新条目$/mu);
    assert.doesNotMatch(result.proposedText, /7月29日[^\n]*[无無]新[条條]目/u);
});

test("removes the target placeholder for every subgroup namespace", () => {
    const cases = [
        [118, "草稿", "无新条目"],
        [14, "分類", "無新條目"],
        [6, "檔案", "无新條目"],
        [10, "模板", "無新条目"],
        [4, "雜頁", "無新條目"],
    ] as const;

    for (const [namespaceNumber, label, placeholder] of cases) {
        const source = [
            "== 2026年 ==",
            `* 7月29日 - {{vgc|Keep}}、${placeholder}`,
            "* 7月28日 - 無新條目",
            "",
        ].join("\n");
        const result = prepareNewPageListRegistration({
            creationDate: new Date("2026-07-29T02:00:00Z"),
            namespaceNumber,
            text: source,
            title: `${label}:New`,
        });

        assert.match(result.proposedText, /^\* 7月29日 - \{\{vgc\|Keep\}\}$/mu);
        assert.ok(
            result.proposedText.includes(`*:${label}：{{vgc|${label}:New}}`),
        );
        assert.match(result.proposedText, /^\* 7月28日 - 無新條目$/mu);
    }
});

test("adds a DYK icon only to the new registration", () => {
    const existing = "{{vgc|Existing}}{{Dykico | custom = keep }}";
    const source = [
        "== 2026年 ==",
        `* 7月29日 - ${existing}、{{vgc|Without icon}}`,
        "",
    ].join("\n");
    const result = prepareNewPageListRegistration({
        creationDate: new Date("2026-07-29T12:00:00Z"),
        includeDykIcon: true,
        namespaceNumber: 0,
        text: source,
        title: "New",
    });
    const expected = source.replace(
        `* 7月29日 - ${existing}、{{vgc|Without icon}}`,
        `* 7月29日 - ${existing}、{{vgc|Without icon}}、` +
            "{{vgc|New}}{{Dykico}}",
    );

    assert.equal(result.proposedText, expected);
});

test("inserts templates into the existing template subgroup", () => {
    const result = prepareNewPageListRegistration({
        creationDate: new Date("2026-07-29T12:00:00Z"),
        namespaceNumber: 10,
        text: LIST_TEXT,
        title: "Template:New",
    });

    assert.match(
        result.proposedText,
        /^\*:模板：\{\{vgc\|Template:Old\}\}、\{\{vgc\|Template:New\}\}$/mu,
    );
});

test("preserves an existing registration and rejects expired dates", () => {
    const existing = prepareNewPageListRegistration({
        creationDate: new Date("2026-07-29T12:00:00Z"),
        namespaceNumber: 0,
        text: LIST_TEXT,
        title: "Earlier",
    });
    const expired = prepareNewPageListRegistration({
        creationDate: new Date("2025-01-01T12:00:00Z"),
        namespaceNumber: 0,
        text: LIST_TEXT,
        title: "Too old",
    });

    assert.equal(existing.alreadyRegistered, true);
    assert.equal(existing.changed, false);
    assert.equal(existing.existing?.listedTitle, "Earlier");
    assert.equal(expired.eligible, false);
    assert.equal(expired.changed, false);
    assert.equal(expired.proposedText, LIST_TEXT);
});
