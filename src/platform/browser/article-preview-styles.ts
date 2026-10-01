/** Copies the host wiki's loaded CSS into an isolated article reading frame. */

export interface ArticlePreviewStyles {
    /** Safely serialized stylesheet links and inline style elements. */
    styles: string;
    /** HTTP(S) origin permitted by the frame's stylesheet content policy. */
    origin: string;
}

/** Keeps ResourceLoader and site CSS in their original cascade order. */
export function getArticlePreviewStyles(
    sourceDocument: Document = globalThis.document,
): ArticlePreviewStyles {
    const pageUrl = new URL(sourceDocument.URL);
    const origin = isHttpUrl(pageUrl) ? pageUrl.origin : "";
    const styles: string[] = [];

    for (const element of Array.from(
        sourceDocument.querySelectorAll("link, style"),
    )) {
        const tag = element.tagName.toLowerCase();
        const media = element.getAttribute("media");
        const mediaAttribute =
            media == null ? "" : ` media="${escapeAttribute(media)}"`;
        if (tag === "style") {
            const css = element.textContent ?? "";
            if (css !== "") {
                styles.push(
                    `<style${mediaAttribute}>${escapeStyleText(css)}</style>`,
                );
            }
            continue;
        }
        if (
            tag !== "link" ||
            !(element.getAttribute("rel") ?? "")
                .split(/\s+/u)
                .some((value) => value.toLowerCase() === "stylesheet") ||
            element.hasAttribute("disabled") ||
            (element as HTMLLinkElement).disabled
        ) {
            continue;
        }
        const href = element.getAttribute("href");
        if (href == null || href.trim() === "") continue;
        let url: URL;
        try {
            url = new URL(href, sourceDocument.baseURI);
        } catch {
            continue;
        }
        if (!isHttpUrl(url) || url.origin !== origin) continue;
        styles.push(
            `<link rel="stylesheet" href="${escapeAttribute(url.href)}"${mediaAttribute}>`,
        );
    }

    return { styles: styles.join("\n"), origin };
}

function isHttpUrl(url: URL): boolean {
    return url.protocol === "https:" || url.protocol === "http:";
}

function escapeAttribute(value: string): string {
    return value.replace(
        /[&<>"']/gu,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[character]!,
    );
}

function escapeStyleText(css: string): string {
    // A CSS escape preserves the character without ending HTML's raw-text node.
    return css.replace(/<\/style/giu, (closing) => `\\3c ${closing.slice(1)}`);
}
