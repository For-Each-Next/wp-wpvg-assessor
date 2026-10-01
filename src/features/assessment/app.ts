/**
 * Mounts the assessor UI in supported MediaWiki pages.
 */

import type { PageAssessorRuntime } from "../../app/dialog-contracts.ts";
import {
    ASSESSMENT_DIALOG_STYLES,
    createAssessmentDialogComponent,
} from "./dialogs/assessment-dialog.ts";
import * as Comparison from "./components/wikitext-comparison.ts";
import {
    LOADING_DIALOG_STYLES,
    createLoadingDialogComponent,
} from "./dialogs/loading-dialog.ts";
import {
    type ResourceLoaderRequire,
    type VueApp,
    registerPageAssessorComponents,
} from "../../platform/mediawiki/codex.ts";
import { msg } from "../../i18n/index.ts";
import {
    CATEGORY_DIALOG_STYLES,
    createCategoryDialogComponent,
} from "./dialogs/category-dialog.ts";

const HOST_ID = "avgp-dialog-host";
const STYLE_ID = "avgp-styles";

let activeDialogCleanup: (() => void) | null = null;
let dialogGeneration = 0;
let runtime: PageAssessorRuntime | null = null;

/**
 * Starts the dialog UI with composed workflow dependencies.
 *
 * @param dependencies - Dependencies value.
 */
export function startPageAssessor(dependencies: PageAssessorRuntime): void {
    if (runtime != null) {
        return;
    }

    runtime = dependencies;
    void initializePageAssessorRuntime(
        dependencies,
        () =>
            mw.loader.using([
                "mediawiki.api",
                "mediawiki.Title",
                "mediawiki.util",
            ]),
        init,
    );
}

/** Reports ResourceLoader or initialization failures during startup. */
export async function initializePageAssessorRuntime(
    feedback: Pick<PageAssessorRuntime, "logger" | "notify">,
    loadDependencies: () => PromiseLike<unknown> | unknown,
    initialize: () => void,
): Promise<void> {
    try {
        await loadDependencies();
        initialize();
    } catch (error) {
        feedback.logger.error("initialize.failed", { error });
        feedback.notify({
            key: "initialize-failed",
            message: msg("tool.startFailed", {
                error: getErrorMessage(error),
            }),
            type: "error",
        });
    }
}

/**
 * Mounts the toolbox action after MediaWiki is ready.
 */
function init(): void {
    const dbName = mw.config.get("wgDBname");
    const namespaceNumber = mw.config.get("wgNamespaceNumber");

    getRuntime().logger.debug("initialize.started", {
        dbName,
        namespaceNumber,
    });
    if (dbName !== "zhwiki" || namespaceNumber < 0) {
        getRuntime().logger.debug("initialize.skipped");
        return;
    }

    installDialogStyles();
    addToolboxLink();
}

function addToolboxLink(): void {
    getRuntime().logger.debug("toolbox-link.install.started");
    const link = mw.util.addPortletLink(
        "p-tb",
        "#",
        msg(isUnassessedCategory() ? "tool.batchName" : "tool.name"),
        "t-assess-vg-page",
    );
    link?.addEventListener("click", handleToolboxClick);
}

function handleToolboxClick(event: Event): void {
    event.preventDefault();
    getRuntime().logger.info("toolbox-link.activated");
    (isUnassessedCategory() ? openCategoryDialog() : openDialog()).catch(
        handleOpenDialogError,
    );
}

function isUnassessedCategory(): boolean {
    if (mw.config.get("wgNamespaceNumber") !== 14) return false;
    const title = mw.Title.newFromText(mw.config.get("wgPageName"));
    return (
        title != null &&
        ["未评级电子游戏条目", "未評級電子遊戲條目"].includes(
            title.getMainText(),
        )
    );
}

async function openCategoryDialog(): Promise<void> {
    const generation = ++dialogGeneration;
    const assessorRuntime = getRuntime();
    const workflow = assessorRuntime.categoryAssessment;
    if (workflow == null) {
        throw new Error("Category assessment is unavailable.");
    }
    const sessionPromise = workflow.open(
        assessorRuntime.createDialogPageContext().api,
    );
    void sessionPromise.catch(() => undefined);
    let require: ResourceLoaderRequire;
    try {
        require = await loadVueAndCodex();
    } catch (error) {
        void sessionPromise.then(
            (session) => session.dispose(),
            () => undefined,
        );
        throw error;
    }
    if (generation !== dialogGeneration) {
        void sessionPromise.then(
            (session) => session.dispose(),
            () => undefined,
        );
        return;
    }
    activeDialogCleanup?.();
    mountLoadingDialog(require);
    let session: Awaited<ReturnType<typeof workflow.open>>;
    try {
        session = await sessionPromise;
    } catch (error) {
        if (generation !== dialogGeneration) return;
        activeDialogCleanup?.();
        throw error;
    }
    if (generation !== dialogGeneration) {
        session.dispose();
        return;
    }
    activeDialogCleanup?.();
    const Vue = require("vue");
    const host = document.createElement("div");
    host.id = HOST_ID;
    document.documentElement.append(host);
    let application: VueApp | null = null;
    let cleaned = false;
    function cleanup(): void {
        if (cleaned) return;
        cleaned = true;
        application?.unmount();
        session.dispose();
        host.remove();
        if (activeDialogCleanup === cleanup) activeDialogCleanup = null;
    }
    application = Vue.createMwApp(
        createCategoryDialogComponent(Vue, {
            runtime: assessorRuntime,
            session,
            onClose() {
                cleanup();
                restoreToolboxFocus();
            },
        }),
    );
    registerPageAssessorComponents(application, require("@wikimedia/codex"));
    application.mount(host);
    activeDialogCleanup = cleanup;
}

function handleOpenDialogError(error: unknown): void {
    const assessorRuntime = getRuntime();
    assessorRuntime.logger.error("dialog.open.failed", { error });
    assessorRuntime.notify({
        key: "dialog-open-failed",
        message: msg("tool.openFailed", { error: getErrorMessage(error) }),
        type: "error",
    });
}

async function openDialog(): Promise<void> {
    const generation = ++dialogGeneration;
    const assessorRuntime = getRuntime();

    assessorRuntime.logger.info("dialog.open.started");
    const statePromise = loadDialogStateForCurrentPage(assessorRuntime);
    // Observe early failures while ResourceLoader is still preparing the UI.
    // The original promise is awaited below so the normal failure UI still runs.
    void statePromise.catch(function observeEarlyStateFailure() {
        return undefined;
    });
    const require = await loadVueAndCodex();
    if (generation !== dialogGeneration) {
        return;
    }

    activeDialogCleanup?.();
    mountLoadingDialog(require);
    let state: Awaited<ReturnType<PageAssessorRuntime["loadDialogState"]>>;
    try {
        state = await statePromise;
    } catch (error) {
        if (generation !== dialogGeneration) {
            return;
        }
        activeDialogCleanup?.();
        throw error;
    }
    if (generation !== dialogGeneration) {
        return;
    }
    activeDialogCleanup?.();
    mountAssessmentDialog(require, state, assessorRuntime);
    assessorRuntime.logger.info("dialog.open.completed");
}

/** Loads state with browser values supplied by the composition root. */
function loadDialogStateForCurrentPage(
    assessorRuntime: Pick<
        PageAssessorRuntime,
        "createDialogPageContext" | "loadDialogState"
    >,
): ReturnType<PageAssessorRuntime["loadDialogState"]> {
    const { api, pageName, title } = assessorRuntime.createDialogPageContext();

    if (title == null) {
        throw new Error(`Unable to resolve the current page: ${pageName}`);
    }
    return assessorRuntime.loadDialogState(api, title);
}

async function loadVueAndCodex(): Promise<ResourceLoaderRequire> {
    return (await mw.loader.using([
        "vue",
        "@wikimedia/codex",
        "mediawiki.diff.styles",
    ])) as ResourceLoaderRequire;
}

function mountLoadingDialog(require: ResourceLoaderRequire): void {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");
    const host = document.createElement("div");
    let application: VueApp | null = null;
    let cleaned = false;
    host.id = HOST_ID;
    document.documentElement.append(host);
    function cleanup(): void {
        if (cleaned) {
            return;
        }
        cleaned = true;
        application?.unmount();
        host.remove();
        if (activeDialogCleanup === cleanup) {
            activeDialogCleanup = null;
        }
    }
    function cancelLoading(): void {
        dialogGeneration += 1;
        cleanup();
        restoreToolboxFocus();
    }
    application = Vue.createMwApp(
        createLoadingDialogComponent(Vue, cancelLoading),
    );
    registerPageAssessorComponents(application, Codex);
    application.mount(host);
    activeDialogCleanup = cleanup;
}

function mountAssessmentDialog(
    require: ResourceLoaderRequire,
    state: Awaited<ReturnType<PageAssessorRuntime["loadDialogState"]>>,
    assessorRuntime: PageAssessorRuntime,
): void {
    const Vue = require("vue");
    const Codex = require("@wikimedia/codex");
    const host = document.createElement("div");
    let application: VueApp | null = null;
    let cleaned = false;

    host.id = HOST_ID;
    document.documentElement.append(host);

    function cleanup(): void {
        if (cleaned) {
            return;
        }
        cleaned = true;
        application?.unmount();
        host.remove();
        if (activeDialogCleanup === cleanup) {
            activeDialogCleanup = null;
        }
    }

    const component = createAssessmentDialogComponent(Vue, {
        currentNamespace: mw.config.get("wgNamespaceNumber"),
        onClose() {
            cleanup();
            restoreToolboxFocus();
        },
        onSaved: refreshPage,
        runtime: assessorRuntime,
        state,
    });
    application = Vue.createMwApp(component);
    registerPageAssessorComponents(application, Codex);
    application.mount(host);
    activeDialogCleanup = cleanup;
}

function refreshPage(): void {
    location.reload();
}

function restoreToolboxFocus(): void {
    document
        .querySelector<HTMLElement>("#t-assess-vg-page a, #t-assess-vg-page")
        ?.focus();
}

function installDialogStyles(): void {
    if (document.getElementById(STYLE_ID) != null) {
        getRuntime().logger.debug("styles.install.skipped");
        return;
    }

    const style = document.createElement("style");

    style.id = STYLE_ID;
    style.textContent = [
        ASSESSMENT_DIALOG_STYLES,
        LOADING_DIALOG_STYLES,
        Comparison.WIKITEXT_COMPARISON_STYLES,
        CATEGORY_DIALOG_STYLES,
    ].join("\n");
    document.head.append(style);
    getRuntime().logger.debug("styles.install.completed");
}

function getRuntime(): PageAssessorRuntime {
    if (runtime == null) {
        throw new Error("Page assessor UI has not been composed.");
    }
    return runtime;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
