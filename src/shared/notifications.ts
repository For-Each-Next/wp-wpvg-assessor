/** Plain-text user-facing notifications supplied by the host adapter. */
export type ActionNotificationType = "error" | "info" | "success" | "warning";

export interface ActionNotification {
    key: string;
    message: string;
    type: ActionNotificationType;
}

export type ActionNotifier = (notification: ActionNotification) => void;
