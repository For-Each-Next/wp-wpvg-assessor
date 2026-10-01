/** Startup error reporting at the page-assessor UI boundary. */

import assert from "node:assert/strict";
import test from "node:test";

import { createLogger, type LogOutput } from "../src/shared/logging.ts";
import type { ActionNotification } from "../src/shared/notifications.ts";
import { initializePageAssessorRuntime } from "../src/features/assessment/app.ts";

interface StartupFailureFixture {
    initialize(): void;
    loadDependencies(): Promise<void>;
    message: string;
}

test(
    "reports loader and initialization failures without rejecting",
    reportStartupFailures,
);

async function reportStartupFailures(): Promise<void> {
    const cases = [
        {
            initialize() {
                assert.fail("Initialization ran after ResourceLoader failed.");
            },
            loadDependencies: () => Promise.reject(new Error("loader down")),
            message: "Unable to start VG Page Assessor: loader down",
        },
        {
            initialize() {
                throw new Error("initialization broke");
            },
            loadDependencies: () => Promise.resolve(),
            message: "Unable to start VG Page Assessor: initialization broke",
        },
    ];

    for (const fixture of cases) {
        await verifyStartupFailure(fixture);
    }
}

async function verifyStartupFailure(
    fixture: StartupFailureFixture,
): Promise<void> {
    const errors: unknown[][] = [];
    const notifications: ActionNotification[] = [];
    const logger = createLogger("vg-page-assessor-test", {
        level: "error",
        output: createLogOutput(errors),
    });

    await assert.doesNotReject(() =>
        initializePageAssessorRuntime(
            {
                logger,
                notify(notification) {
                    notifications.push(notification);
                },
            },
            fixture.loadDependencies,
            fixture.initialize,
        ),
    );

    assert.match(
        String(errors[0]?.[0]),
        /\[vg-page-assessor-test\] initialize\.failed$/u,
    );
    assert.deepEqual(notifications, [
        {
            key: "initialize-failed",
            message: fixture.message,
            type: "error",
        },
    ]);
}

function createLogOutput(errors: unknown[][]): LogOutput {
    return {
        debug() {},
        error(...values) {
            errors.push(values);
        },
        info() {},
        warn() {},
    };
}
