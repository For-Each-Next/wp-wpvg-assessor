/**
 * @file src/features/assessment/components/wikitext-comparison.ts
 * Purpose: MediaWiki-styled rendering for structured wikitext comparisons.
 *
 * Table of contents:
 * 1. Imports
 * 2. WikitextComparisonProps
 * 3. Constants and state
 * 4. createWikitextComparisonComponent
 */

import type { VueModule } from "../../../platform/mediawiki/codex.ts";
import type { WikitextComparison } from "../../../domain/wikitext-comparison.ts";

export interface WikitextComparisonProps {
    afterLabel: string;
    beforeLabel: string;
    comparison: WikitextComparison;
    label: string;
    noChangesLabel: string;
}

const WIKITEXT_COMPARISON_TEMPLATE =
    typeof __VG_PAGE_ASSESSOR_WIKITEXT_COMPARISON_TEMPLATE__ === "undefined"
        ? ""
        : __VG_PAGE_ASSESSOR_WIKITEXT_COMPARISON_TEMPLATE__;

export const WIKITEXT_COMPARISON_STYLES =
    typeof __VG_PAGE_ASSESSOR_WIKITEXT_COMPARISON_STYLES__ === "undefined"
        ? ""
        : __VG_PAGE_ASSESSOR_WIKITEXT_COMPARISON_STYLES__;

/**
 * Creates a reusable MediaWiki-style comparison component.
 *
 * @param Vue - Vue value.
 * @returns MediaWiki-style wikitext comparison component.
 */
export function createWikitextComparisonComponent(Vue: VueModule): unknown {
    return Vue.defineComponent({
        name: "VgPageAssessorWikitextComparison",
        props: {
            afterLabel: { required: true, type: String },
            beforeLabel: { required: true, type: String },
            comparison: { required: true, type: Object },
            label: { required: true, type: String },
            noChangesLabel: { required: true, type: String },
        },
        template: WIKITEXT_COMPARISON_TEMPLATE,
    });
}
