/**
 * @file src/types/config.d.ts
 * Purpose: src / types / config.d module.
 *
 * Table of contents:
 * 1. Imports
 * 2. Ambient declarations
 * 3. Exports
 */

import type { LogLevel } from "../shared/logging.ts";

declare global {
    interface Window {
        wpvgAssessorConfig?: { logLevel?: LogLevel };
    }
}

export {};
