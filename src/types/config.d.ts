import type { LogLevel } from "../shared/logging.ts";

declare global {
    interface Window {
        wpvgAssessorConfig?: { logLevel?: LogLevel };
    }
}

export {};
