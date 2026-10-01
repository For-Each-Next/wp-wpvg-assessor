/** Reads the host interface language for the pure catalog translator. */
export function getInterfaceLanguage(): string {
    return typeof mw === "undefined"
        ? "en"
        : String(mw.config.get("wgUserLanguage") || "en");
}
