/**
 * @file src/features/assessment/dialogs/category-dialog.ts
 * Purpose: Sequential article reading with background saves and later failure recovery.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. CategoryDialogOptions
 * 4. createCategoryDialogComponent
 * 5. createCategoryDialogBindings
 * 6. createArticleDocument
 */

import type {
    CategoryAssessmentPage,
    CategoryAssessmentSession,
    CategoryArticleStyles,
} from "../../../app/category-contracts.ts";
import type { PageAssessorRuntime } from "../../../app/dialog-contracts.ts";
import type { AssessmentSaveReview } from "../../../app/assessment-contracts.ts";
import { previewTalkPageTopSection } from "../../../domain/assessment.ts";
import projectConfig from "../../../domain/project-config.ts";
import { interfaceLocale, msg } from "../../../i18n/index.ts";
import type { VueModule } from "../../../platform/mediawiki/codex.ts";
import { buildEditSummary } from "../assessment-summary.ts";

const CATEGORY_DIALOG_TEMPLATE =
    typeof __VG_PAGE_ASSESSOR_CATEGORY_DIALOG_TEMPLATE__ === "undefined"
        ? ""
        : __VG_PAGE_ASSESSOR_CATEGORY_DIALOG_TEMPLATE__;

export const CATEGORY_DIALOG_STYLES =
    typeof __VG_PAGE_ASSESSOR_CATEGORY_DIALOG_STYLES__ === "undefined"
        ? ""
        : __VG_PAGE_ASSESSOR_CATEGORY_DIALOG_STYLES__;

const CLASS_GROUPS = [
    ["Stub", "Start", "D", "C", "B"],
    ["SL", "List", "CL", "BL"],
    ["Unassessed"],
] as const;

interface CategoryDialogOptions {
    runtime: PageAssessorRuntime;
    session: CategoryAssessmentSession;
    onClose(): void;
}

export function createCategoryDialogComponent(
    Vue: VueModule,
    options: CategoryDialogOptions,
): unknown {
    return Vue.defineComponent({
        name: "VgCategoryAssessmentDialog",
        setup: () => createCategoryDialogBindings(Vue, options),
        template: CATEGORY_DIALOG_TEMPLATE,
    });
}

/** Class buttons capture a save before immediately moving to the next article. */
export function createCategoryDialogBindings(
    Vue: VueModule,
    options: CategoryDialogOptions,
) {
    const { runtime, session } = options;
    const batchOpen = Vue.ref(true);
    const batchBusy = Vue.ref(false);
    const batchError = Vue.ref("");
    const batchArticle = Vue.ref<CategoryAssessmentPage | null>(null);
    const batchClass = Vue.ref("");
    const batchPreview = Vue.ref("");
    const batchSummary = Vue.ref("");
    const batchDocument = Vue.ref("");
    const batchFinished = Vue.ref(false);
    const batchPendingSaves = Vue.ref(session.pendingSaveCount());
    let active = true;
    let generation = 0;
    let loadedArticle = false;
    let unsubscribe: (() => void) | undefined;

    function release(): void {
        if (!active) return;
        active = false;
        generation += 1;
        unsubscribe?.();
        unsubscribe = undefined;
        session.dispose();
        batchDocument.value = "";
    }
    Vue.onUnmounted(release);

    function displayArticle(article: CategoryAssessmentPage | null): void {
        batchArticle.value = article;
        if (article == null) {
            batchFinished.value = loadedArticle;
            batchDocument.value = "";
            return;
        }
        loadedArticle = true;
        batchFinished.value = false;
        const { state, review } = article;
        batchClass.value = state.assessment.className;
        batchPreview.value =
            review?.previewText ??
            previewTalkPageTopSection(
                state.page.text,
                state.assessment,
                projectConfig,
            );
        batchSummary.value =
            review?.summary ??
            buildEditSummary(state.assessment, undefined, state.page.text);
        batchError.value =
            article.saveError == null
                ? ""
                : msg("batch.saveFailed", { error: article.saveError });
        batchDocument.value = createArticleDocument(
            article.articleHtml,
            state.subjectTitle,
            runtime.getArticlePreviewStyles?.() ?? { styles: "", origin: "" },
        );
    }

    function resumeFailedArticles(): void {
        if (
            active &&
            !batchBusy.value &&
            batchArticle.value == null &&
            session.hasFailedPages()
        ) {
            void navigate(() => session.current());
        }
    }

    function onSessionChange(): void {
        if (!active) return;
        batchPendingSaves.value = session.pendingSaveCount();
        resumeFailedArticles();
    }

    async function navigate(
        load: () => Promise<CategoryAssessmentPage | null>,
    ): Promise<void> {
        if (!active || batchBusy.value) return;
        const request = ++generation;
        batchBusy.value = true;
        batchError.value = "";
        // A failed or pending next page must not leave the previous actions active.
        batchArticle.value = null;
        batchDocument.value = "";
        try {
            const article = await load();
            if (!active || request !== generation) return;
            displayArticle(article);
        } catch (error) {
            if (!active || request !== generation) return;
            runtime.logger.error("category.article.failed", { error });
            batchError.value =
                error instanceof Error ? error.message : String(error);
        } finally {
            if (active && request === generation) {
                batchBusy.value = false;
                // A save may have failed while the next article was loading.
                if (!batchError.value) resumeFailedArticles();
            }
        }
    }

    function setBatchClass(value: string): void {
        const article = batchArticle.value;
        if (article == null) return;
        const state = article.state;
        state.assessment.className = value;
        batchClass.value = value;
        batchPreview.value = previewTalkPageTopSection(
            batchPreview.value,
            state.assessment,
            projectConfig,
        );
        state.previewDirty = true;
        if (!state.summaryDirty) {
            batchSummary.value = buildEditSummary(
                state.assessment,
                undefined,
                state.page.text,
            );
        }
    }

    function setBatchSummary(value: string): void {
        if (!active || batchBusy.value || batchArticle.value == null) return;
        batchSummary.value = value;
        batchArticle.value.state.summaryDirty = true;
    }

    async function onBatchAction(value: unknown): Promise<void> {
        const article = batchArticle.value;
        if (!active || batchBusy.value || article == null) return;
        if (value === "Skip") {
            await navigate(() => session.next());
            return;
        }
        if (
            typeof value !== "string" ||
            !CLASS_GROUPS.some((group) =>
                (group as readonly string[]).includes(value),
            )
        )
            return;
        setBatchClass(value);
        const review: AssessmentSaveReview = {
            previewText: batchPreview.value,
            summary: batchSummary.value.trim(),
        };
        try {
            session.save(article, review);
        } catch (error) {
            runtime.logger.error("category.save.capture.failed", { error });
            batchError.value =
                error instanceof Error ? error.message : String(error);
            return;
        }
        await navigate(() => session.next());
    }

    function onBatchCancel(): void {
        if (!active) return;
        batchOpen.value = false;
        release();
        queueMicrotask(options.onClose);
    }

    Vue.onMounted(() => {
        unsubscribe = session.subscribe(onSessionChange);
        onSessionChange();
        void navigate(() => session.current());
    });

    return {
        interfaceLocale,
        msg,
        batchOpen,
        batchBusy,
        batchError,
        batchArticle,
        batchClass,
        batchPreview,
        batchSummary,
        batchDocument,
        batchFinished,
        batchPendingSaves,
        batchButtonGroups: CLASS_GROUPS.map((group, index) => [
            ...group.map((value) => ({ value, label: value })),
            ...(index === 2
                ? [{ value: "Skip", label: msg("batch.skip") }]
                : []),
        ]),
        batchArticleLabel: Vue.computed(() =>
            batchArticle.value == null
                ? ""
                : msg("batch.articlePosition", {
                      position: batchArticle.value.position,
                      title: batchArticle.value.state.subjectTitle,
                  }),
        ),
        setBatchSummary,
        onBatchAction,
        onBatchCancel,
        onBatchRetry: () => navigate(() => session.current()),
        onBatchOpenChange(value: boolean) {
            if (!value) onBatchCancel();
        },
    };
}

/** Parsed article markup is contained in an opaque, script-free reading frame. */
function createArticleDocument(
    html: string,
    title: string,
    articleStyles: CategoryArticleStyles,
): string {
    let hasArticleRoot = false;
    if (typeof document !== "undefined") {
        // Template contents remain inert while checking the parser's root markup.
        const parsed = document.createElement("template");
        parsed.innerHTML = html;
        hasArticleRoot = Array.from(parsed.content.children).some((element) =>
            element.classList.contains("mw-parser-output"),
        );
    }
    const articleMarkup = hasArticleRoot
        ? html
        : `<div class="mw-parser-output">${html}</div>`;
    const escape = (value: string) =>
        value.replace(
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
    return `<!doctype html><html lang="${escape(interfaceLocale)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://upload.wikimedia.org data:; style-src 'unsafe-inline' ${escape(articleStyles.origin)}; base-uri 'none'; form-action 'none'"><title>${escape(title)}</title>${articleStyles.styles}<style>body{font:16px/1.65 sans-serif;margin:1.5rem;color:#202122;background:#fff;overflow-wrap:anywhere}#content,#bodyContent,#mw-content-text{margin:0;padding:0;border:0;max-width:none}img,video{max-width:100%;height:auto}table{max-width:100%}a{color:#36c;pointer-events:none}.mw-editsection{display:none}h1,h2,h3{line-height:1.3}pre{white-space:pre-wrap} @media(max-width:640px){body{margin:1rem}.infobox{float:none;max-width:100%;margin:0}}</style></head><body class="mediawiki"><main id="content" class="mw-body"><div id="bodyContent" class="mw-body-content"><div id="mw-content-text" class="mw-body-content">${articleMarkup}</div></div></main></body></html>`;
}
