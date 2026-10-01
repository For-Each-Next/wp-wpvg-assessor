/**
 * Plain-text catalog translation with explicit locale selection.
 */

export type MessageCatalog = Record<string, string>;
export type MessageCatalogs = Record<string, MessageCatalog>;
type MessagePartValues<T> = Record<string, T | T[]>;
type MessageValues = Record<string, string | number>;
export type LocaleCatalog<Source extends MessageCatalog> = {
    [Id in keyof Source]: string;
};

export interface Translator {
    locale: string;
    parts<T>(message: string, values: MessagePartValues<T>): Array<string | T>;
    text(message: string, values?: MessageValues): string;
}

export interface TypedI18n<Id extends string> {
    interfaceLocale: string;
    msg(id: Id, values?: MessageValues): string;
    msgParts<T>(id: Id, values: MessagePartValues<T>): Array<string | T>;
}

/**
 * Creates a typed translator from its English source catalog.
 *
 * @param english - English value.
 * @param translations - Translations value.
 * @returns A typed translator from its English source catalog.
 */
export function createI18n<Source extends MessageCatalog>(
    english: Source,
    translations: Record<string, LocaleCatalog<Source>>,
    locale: string = "en",
): TypedI18n<Extract<keyof Source, string>> {
    const translator = createTranslator(
        { en: english, ...translations },
        locale,
    );
    const result: TypedI18n<Extract<keyof Source, string>> = {
        interfaceLocale: translator.locale,
        msg(id, values) {
            return translator.text(id, values);
        },
        msgParts(id, values) {
            return translator.parts(id, values);
        },
    };
    return result;
}

/**
 * Creates a translator for a set of locale catalogs.
 *
 * @param catalogs - Catalogs value.
 * @param locale - Locale value.
 * @returns A translator for a set of locale catalogs.
 */
export function createTranslator(
    catalogs: MessageCatalogs,
    locale: string = "en",
): Translator {
    const availableLocales = Object.keys(catalogs);
    const resolvedLocale = resolveLocale(locale, availableLocales);
    const result: Translator = {
        locale: resolvedLocale,
        parts(message, values) {
            const translated = getTranslatedMessage(
                catalogs,
                resolvedLocale,
                message,
            );
            const result = interpolateMessageParts(translated, values);
            return result;
        },
        text(message, values = {}) {
            const translated = getTranslatedMessage(
                catalogs,
                resolvedLocale,
                message,
            );
            return interpolateMessage(translated, values);
        },
    };
    return result;
}

/**
 * Gets a translated message with English and source-key fallback.
 *
 * @param catalogs - Catalogs value.
 * @param locale - Locale value.
 * @param message - Message value.
 * @returns A translated message with English and source-key fallback.
 */
function getTranslatedMessage(
    catalogs: MessageCatalogs,
    locale: string,
    message: string,
): string {
    return catalogs[locale]?.[message] || catalogs.en?.[message] || message;
}

/**
 * Resolves a requested locale against available catalogs.
 *
 * @param locale - Locale value.
 * @param availableLocales - Available locales value.
 * @returns A requested locale against available catalogs.
 */
function resolveLocale(locale: string, availableLocales: string[]): string {
    const localeEntries = availableLocales.map(createLocaleEntry);
    const available = new Map(localeEntries);
    const normalized = normalizeLocale(locale);
    const normalizedKey = normalized.toLocaleLowerCase();
    const exact = available.get(normalizedKey);
    if (exact != null) {
        return exact;
    }
    const baseLocale = normalized.split("-")[0];
    const baseKey = baseLocale.toLocaleLowerCase();
    const base = available.get(baseKey);
    if (base != null) {
        return base;
    }
    const english = available.get("en");
    return english || availableLocales[0] || "en";
}

/**
 * Normalizes common MediaWiki Chinese language variants.
 *
 * @param locale - Locale value.
 * @returns Common MediaWiki Chinese language variants.
 */
function normalizeLocale(locale: string): string {
    const value = String(locale || "en").replace(/_/gu, "-");
    if (/^zh(?:-(?:cn|hans|my|sg))?$/iu.test(value)) {
        return "zh-Hans";
    }
    if (/^zh-(?:hk|hant|mo|tw)$/iu.test(value)) {
        return "zh-Hant";
    }
    return value;
}

/**
 * Substitutes named values in a translated message.
 *
 * @param message - Message value.
 * @param values - Input values.
 * @returns Result when the function
 *   substitutes named values in a translated message.
 */
function interpolateMessage(message: string, values: MessageValues): string {
    const parts = interpolateMessageParts(message, values);
    const result = parts.join("");
    return result;
}

/**
 * Creates one case-insensitive locale lookup entry.
 *
 * @param locale - Available locale.
 * @returns Lowercase lookup key and original locale.
 */
function createLocaleEntry(locale: string): [string, string] {
    return [locale.toLocaleLowerCase(), locale];
}

/**
 * Substitutes non-text values into named message placeholders.
 *
 * @param message - Message value.
 * @param values - Input values.
 * @returns Result when the function
 *   substitutes non-text values into named message
 *   placeholders.
 */
function interpolateMessageParts<T>(
    message: string,
    values: MessagePartValues<T>,
): Array<string | T> {
    const parts: Array<string | T> = [];
    const pattern = /\{([A-Za-z][A-Za-z0-9]*)\}/gu;
    let offset = 0;
    for (const match of message.matchAll(pattern)) {
        const precedingText = message.slice(offset, match.index);
        parts.push(precedingText);
        appendMessagePart(parts, values[match[1]], match[0]);
        offset = match.index + match[0].length;
    }
    const trailingText = message.slice(offset);
    parts.push(trailingText);
    return parts.filter((part) => part !== "");
}

/**
 * Appends a scalar, list, or unresolved placeholder.
 *
 * @param parts - Parts value.
 * @param value - Input value.
 * @param placeholder - Placeholder value.
 */
function appendMessagePart<T>(
    parts: Array<string | T>,
    value: T | T[] | undefined,
    placeholder: string,
): void {
    if (Array.isArray(value)) {
        parts.push(...value);
        return;
    }
    parts.push(value == null ? placeholder : value);
}
