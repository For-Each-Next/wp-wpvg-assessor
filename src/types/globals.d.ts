/**
 * @file src/types/globals.d.ts
 * Purpose: Build globals and template context for VG Page Assessor.
 *
 * Table of contents:
 * 1. Imports
 * 2. RawTemplateContext
 * 3. TemplateContext
 * 4. RawCategoryContext
 * 5. CategoryTemplateContext
 * 6. Ambient declarations
 * 7. Exports
 */

import type * as Dialog from "../features/assessment/dialogs/assessment-dialog.ts";
import type * as Comparison from "../features/assessment/components/wikitext-comparison.ts";
import type * as Category from "../features/assessment/dialogs/category-dialog.ts";

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
type RawCategoryContext = ReturnType<
    typeof Category.createCategoryDialogBindings
>;
type CategoryTemplateContext = {
    [Key in keyof RawCategoryContext]: RawCategoryContext[Key] extends {
        value: infer Value;
    }
        ? Value
        : RawCategoryContext[Key];
};

declare global {
    const __VG_PAGE_ASSESSOR_DIALOG_TEMPLATE__: string;
    const __VG_PAGE_ASSESSOR_DIALOG_STYLES__: string;
    const __VG_PAGE_ASSESSOR_LOADING_DIALOG_TEMPLATE__: string;
    const __VG_PAGE_ASSESSOR_LOADING_DIALOG_STYLES__: string;
    const __VG_PAGE_ASSESSOR_WIKITEXT_COMPARISON_TEMPLATE__: string;
    const __VG_PAGE_ASSESSOR_WIKITEXT_COMPARISON_STYLES__: string;
    const __VG_PAGE_ASSESSOR_CATEGORY_DIALOG_TEMPLATE__: string;
    const __VG_PAGE_ASSESSOR_CATEGORY_DIALOG_STYLES__: string;
}

declare module "@vue/runtime-core" {
    interface GlobalComponents {
        WikitextComparison: new () => {
            $props: Comparison.WikitextComparisonProps;
        };
    }

    interface ComponentCustomProperties
        extends
            TemplateContext,
            CategoryTemplateContext,
            Comparison.WikitextComparisonProps {}
}

export {};
