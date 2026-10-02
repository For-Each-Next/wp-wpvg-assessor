/**
 * @file src/shared/notifications.ts
 * Purpose: Plain-text user-facing notifications supplied by the host adapter.
 *
 * Table of contents:
 * 1. ActionNotificationType
 * 2. ActionNotification
 * 3. ActionNotifier
 */

export type ActionNotificationType = "error" | "info" | "success" | "warning";

export interface ActionNotification {
    key: string;
    message: string;
    type: ActionNotificationType;
}

export type ActionNotifier = (notification: ActionNotification) => void;
