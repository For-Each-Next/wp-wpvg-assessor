/**
 * Minimal MediaWiki Vue and Codex contracts used by VG Page Assessor.
 */

export interface VueRef<T> {
    value: T;
}

export interface VueModule {
    computed: <T>(getter: () => T) => VueRef<T>;
    createMwApp: (component: unknown) => VueApp;
    defineComponent: (component: unknown) => unknown;
    onMounted: (callback: () => void) => void;
    onUnmounted: (callback: () => void) => void;
    reactive: <T extends object>(value: T) => T;
    ref: <T>(value: T) => VueRef<T>;
}

export interface VueApp {
    component: (name: string, component: unknown) => void;
    mount: (host: HTMLElement) => void;
    unmount: () => void;
}

export interface CodexComponents {
    CdxCheckbox: unknown;
    CdxCombobox: unknown;
    CdxDialog: unknown;
    CdxField: unknown;
    CdxMessage: unknown;
    CdxProgressBar: unknown;
    CdxSelect: unknown;
    CdxTextArea: unknown;
    CdxTextInput: unknown;
}

export interface ResourceLoaderRequire {
    (module: "vue"): VueModule;
    (module: "@wikimedia/codex"): CodexComponents;
}

/**
 * Registers the Codex components used by the assessment dialog.
 *
 * @param app - App value.
 * @param Codex - Codex value.
 */
export function registerPageAssessorComponents(
    app: VueApp,
    Codex: CodexComponents,
): void {
    app.component("CdxCheckbox", Codex.CdxCheckbox);
    app.component("CdxCombobox", Codex.CdxCombobox);
    app.component("CdxDialog", Codex.CdxDialog);
    app.component("CdxField", Codex.CdxField);
    app.component("CdxMessage", Codex.CdxMessage);
    app.component("CdxProgressBar", Codex.CdxProgressBar);
    app.component("CdxSelect", Codex.CdxSelect);
    app.component("CdxTextArea", Codex.CdxTextArea);
    app.component("CdxTextInput", Codex.CdxTextInput);
}
