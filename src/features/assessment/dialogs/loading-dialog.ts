/**
 * @file src/features/assessment/dialogs/loading-dialog.ts
 * Purpose: Loading dialog shown while complete initial state is prepared.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. LoadingBindings
 * 4. createLoadingDialogComponent
 */

import { interfaceLocale, msg } from "../../../i18n/index.ts";
import type { VueModule, VueRef } from "../../../platform/mediawiki/codex.ts";

const LOADING_DIALOG_TEMPLATE =
    typeof __VG_PAGE_ASSESSOR_LOADING_DIALOG_TEMPLATE__ === "undefined"
        ? ""
        : __VG_PAGE_ASSESSOR_LOADING_DIALOG_TEMPLATE__;

export const LOADING_DIALOG_STYLES =
    typeof __VG_PAGE_ASSESSOR_LOADING_DIALOG_STYLES__ === "undefined"
        ? ""
        : __VG_PAGE_ASSESSOR_LOADING_DIALOG_STYLES__;

interface LoadingBindings {
    interfaceLocale: string;
    msg: typeof msg;
    onOpenChange(value: boolean): void;
    open: VueRef<boolean>;
}

/**
 * Creates progress UI shown while assessment state is loading.
 *
 * @param Vue - Vue value.
 * @param onClose - On close value.
 * @returns Created progress UI shown while assessment state is loading.
 */
export function createLoadingDialogComponent(
    Vue: VueModule,
    onClose: () => void,
): unknown {
    function setup(): LoadingBindings {
        const open = Vue.ref(true);
        return {
            interfaceLocale,
            msg,
            onOpenChange(value) {
                open.value = value;
                if (!value) {
                    queueMicrotask(onClose);
                }
            },
            open,
        };
    }
    return Vue.defineComponent({
        name: "VgPageAssessorLoadingDialog",
        setup,
        template: LOADING_DIALOG_TEMPLATE,
    });
}
