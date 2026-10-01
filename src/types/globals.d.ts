/**
 * Build globals and template context for VG Page Assessor.
 */

import type * as Dialog from "../features/assessment/dialogs/assessment-dialog.ts";
import type * as Comparison from "../features/assessment/components/wikitext-comparison.ts";

type RawTemplateContext = ReturnType<
    typeof Dialog.createAssessmentDialogBindings
>;
type TemplateContext = {
    [Key in keyof RawTemplateContext]: RawTemplateContext[Key] extends {
        value: infer Value;
    }
        ? Value
        : RawTemplateContext[Key];
};

declare global {
    const __VG_PAGE_ASSESSOR_DIALOG_TEMPLATE__: string;
    const __VG_PAGE_ASSESSOR_DIALOG_STYLES__: string;
    const __VG_PAGE_ASSESSOR_LOADING_DIALOG_TEMPLATE__: string;
    const __VG_PAGE_ASSESSOR_LOADING_DIALOG_STYLES__: string;
    const __VG_PAGE_ASSESSOR_WIKITEXT_COMPARISON_TEMPLATE__: string;
    const __VG_PAGE_ASSESSOR_WIKITEXT_COMPARISON_STYLES__: string;
}

declare module "@vue/runtime-core" {
    interface GlobalComponents {
        WikitextComparison: new () => {
            $props: Comparison.WikitextComparisonProps;
        };
    }

    interface ComponentCustomProperties
        extends TemplateContext, Comparison.WikitextComparisonProps {}
}

export {};
