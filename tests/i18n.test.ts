/**
 * @file tests/i18n.test.ts
 * Purpose: Tests VG Page Assessor locale catalogs and project-option labels.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. Test scenarios
 * 4. createMessages
 */

import assert from "node:assert/strict";
import test from "node:test";

import * as i18n from "../src/shared/i18n.ts";
import {
    buildNewPageListSummary,
    english,
    type PageAssessorMessages,
    simplifiedChinese,
    traditionalChinese,
} from "../src/i18n/index.ts";

const catalogs = {
    en: english,
    "zh-Hans": simplifiedChinese,
    "zh-Hant": traditionalChinese,
};

test("keeps translated catalogs aligned with English", () => {
    const messageIds = Object.keys(english).toSorted();

    assert.deepEqual(Object.keys(simplifiedChinese).toSorted(), messageIds);
    assert.deepEqual(Object.keys(traditionalChinese).toSorted(), messageIds);
});

test("localizes configured project and task-force labels", () => {
    const simplified = i18n.createTranslator(catalogs, "zh-CN");
    const traditional = i18n.createTranslator(catalogs, "zh-TW");

    assert.equal(simplified.text("taskForce.minecraft"), "我的世界");
    assert.equal(simplified.text("project.fictionalCharacters"), "虚构角色");
    assert.equal(traditional.text("taskForce.pokemon"), "寶可夢");
    assert.equal(traditional.text("project.biography"), "傳記");
});

test("localizes assessment codes without changing stored values", () => {
    const simplified = i18n.createTranslator(catalogs, "zh-CN");
    const traditional = i18n.createTranslator(catalogs, "zh-TW");

    assert.equal(simplified.text("assessmentClass.unassessed"), "未评");
    assert.equal(simplified.text("assessmentClass.substub"), "小小");
    assert.equal(simplified.text("assessmentClass.d"), "丁");
    assert.equal(simplified.text("assessmentClass.b"), "乙");
    assert.equal(simplified.text("assessmentClass.bPlus"), "乙上");
    assert.equal(simplified.text("assessmentClass.ga"), "优良");
    assert.equal(simplified.text("assessmentClass.a"), "甲");
    assert.equal(simplified.text("assessmentClass.fa"), "典范");
    assert.equal(simplified.text("assessmentClass.bl"), "乙表");
    assert.equal(simplified.text("assessmentClass.al"), "甲表");
    assert.equal(simplified.text("assessmentClass.fl"), "特表");
    assert.equal(simplified.text("assessmentImportance.top"), "极高");
    assert.equal(
        simplified.text("assessmentImportance.notVideoGame"),
        "非专题条目",
    );
    assert.equal(traditional.text("assessmentClass.unassessed"), "未評");
    assert.equal(traditional.text("assessmentClass.ga"), "優良");
    assert.equal(traditional.text("assessmentClass.fa"), "典範");
    assert.equal(traditional.text("assessmentImportance.top"), "極高");
    assert.equal(
        traditional.text("assessmentImportance.notVideoGame"),
        "非專題條目",
    );
});

test("names the new-page workflow as registration", () => {
    const simplified = i18n.createTranslator(catalogs, "zh-CN");
    const traditional = i18n.createTranslator(catalogs, "zh-TW");

    assert.equal(simplified.text("dialog.newPageList"), "新条目登记");
    assert.equal(traditional.text("dialog.newPageList"), "新條目登記");
});

test("puts the article name in the localized dialog title", () => {
    const simplified = i18n.createTranslator(catalogs, "zh-CN");
    const traditional = i18n.createTranslator(catalogs, "zh-TW");

    assert.equal(
        simplified.text("dialog.title", { title: "善记" }),
        "电子游戏评级工具（善记）",
    );
    assert.equal(
        traditional.text("dialog.title", { title: "善記" }),
        "電子遊戲評級工具（善記）",
    );
});

test("writes natural localized new-page registration summaries", () => {
    const title = "羅馬-阿雷羅車站";
    const date = new Date("2026-08-12T00:00:00Z");
    const source =
        "[[:m:User:For Each ... Next/global.js/" + "vg page assessor.js|🍄]]";

    assert.equal(
        buildNewPageListSummary(title, date, createMessages("en")),
        `Register [[${title}]] (August 12) ${source}`,
    );
    assert.equal(
        buildNewPageListSummary(title, date, createMessages("zh-CN")),
        `登记[[${title}]]（8月12日）${source}`,
    );
    assert.equal(
        buildNewPageListSummary(title, date, createMessages("zh-TW")),
        `登記[[${title}]]（8月12日）${source}`,
    );
});

test("describes an expired registration with its full creation date", () => {
    const simplified = i18n.createTranslator(catalogs, "zh-CN");

    assert.equal(
        simplified.text("registration.ineligible", {
            date: "2026年4月7日",
        }),
        "创建于2026年4月7日，已过登记期",
    );
});

function createMessages(locale: string): PageAssessorMessages {
    const translator = i18n.createTranslator(catalogs, locale);
    return {
        interfaceLocale: translator.locale,
        msg(id, values) {
            return translator.text(id, values);
        },
        msgParts(id, values) {
            return translator.parts(id, values);
        },
    };
}
