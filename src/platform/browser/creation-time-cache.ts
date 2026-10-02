/**
 * @file src/platform/browser/creation-time-cache.ts
 * Purpose: Stores disposable page-creation timestamps in browser local storage.
 *
 * Table of contents:
 * 1. Imports
 * 2. Constants and state
 * 3. CreationTimeCache
 * 4. CreationTimeCacheStore
 * 5. createCreationTimeCacheStore
 * 6. normalizeCreationTimeCacheTitle
 * 7. isCreationTimeCache
 */

import type { Logger } from "../../shared/logging.ts";

const CREATION_CACHE_KEY = "vg-page-assessor.creation-datetimes.v1";

export type CreationTimeCache = Record<string, string>;

export interface CreationTimeCacheStore {
    read(): CreationTimeCache;
    write(cache: CreationTimeCache): void;
}

/** Creates the browser cache adapter with scoped diagnostics. */
export function createCreationTimeCacheStore(
    logger: Logger,
): CreationTimeCacheStore {
    function read(): CreationTimeCache {
        try {
            const raw = globalThis.localStorage?.getItem(CREATION_CACHE_KEY);
            if (!raw) {
                return {};
            }
            const parsed: unknown = JSON.parse(raw);
            return isCreationTimeCache(parsed) ? parsed : {};
        } catch (error) {
            logger.warn("creation-time-cache.read.failed", { error });
            return {};
        }
    }

    function write(cache: CreationTimeCache): void {
        try {
            const storage = globalThis.localStorage;
            if (storage != null) {
                storage.setItem(CREATION_CACHE_KEY, JSON.stringify(cache));
            }
            logger.debug("creation-time-cache.write.completed", {
                size: Object.keys(cache).length,
            });
        } catch (error) {
            logger.warn("creation-time-cache.write.failed", { error });
        }
    }

    return Object.freeze({ read, write });
}

export function normalizeCreationTimeCacheTitle(title: string): string {
    return String(title || "")
        .replace(/_/gu, " ")
        .trim();
}

function isCreationTimeCache(value: unknown): value is CreationTimeCache {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every((entry) => typeof entry === "string");
}
