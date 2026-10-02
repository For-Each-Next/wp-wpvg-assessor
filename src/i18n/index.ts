/**
 * @file src/i18n/index.ts
 * Purpose: VG Page Assessor locale registry.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. MessageId
 * 4. PageAssessorMessages
 * 5. buildNewPageListSummary
 */

import * as i18n from "../shared/i18n.ts";
import { getInterfaceLanguage } from "../platform/mediawiki/language.ts";
import englishCatalog from "./en.json" with { type: "json" };
import zhHansCatalog from "./zh-Hans.json" with { type: "json" };
import zhHantCatalog from "./zh-Hant.json" with { type: "json" };

export const english = englishCatalog;
export const simplifiedChinese: i18n.LocaleCatalog<typeof english> =
    zhHansCatalog;
export const traditionalChinese: i18n.LocaleCatalog<typeof english> =
    zhHantCatalog;

export type MessageId = Extract<keyof typeof english, string>;
export type PageAssessorMessages = i18n.TypedI18n<MessageId>;

const SUMMARY_SOURCE_LINK = [
    "[[:m:User:For Each ... Next/global.js",
    "/vg page assessor.js|🍄]]",
].join("");

const messages = i18n.createI18n(
    english,
    {
        "zh-Hans": simplifiedChinese,
        "zh-Hant": traditionalChinese,
    },
    getInterfaceLanguage(),
);

export const interfaceLocale = messages.interfaceLocale;
export const msg = messages.msg;

/**
 * Builds a localized edit summary for new-page registration.
 *
 * @param title - Registered page title.
 * @param creationDate - Page creation date.
 * @param translations - Runtime messages and interface locale.
 * @returns Localized edit summary.
 */
export function buildNewPageListSummary(
    title: string,
    creationDate: Date,
    translations: PageAssessorMessages = messages,
): string {
    const date = new Intl.DateTimeFormat(translations.interfaceLocale, {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
    }).format(creationDate);
    return translations.msg("registration.editSummary", {
        date,
        source: SUMMARY_SOURCE_LINK,
        title,
    });
}
