/**
 * Domain and workflow contracts for VG Page Assessor.
 */

export const CLASS_VALUES = [
    "Unassessed",
    "Substub",
    "Stub",
    "Start",
    "D",
    "C",
    "B",
    "B+",
    "GA",
    "A",
    "FA",
    "SL",
    "List",
    "CL",
    "BL",
    "AL",
    "FL",
] as const;

export const NOT_VIDEO_GAME_IMPORTANCE = "NotVG";

export const IMPORTANCE_VALUES = [
    "",
    "Low",
    "Mid",
    "High",
    "Top",
    NOT_VIDEO_GAME_IMPORTANCE,
] as const;

export type KnownAssessmentClass = (typeof CLASS_VALUES)[number];
export type KnownAssessmentImportance = (typeof IMPORTANCE_VALUES)[number];
export type AssessmentClass = string;
export type AssessmentImportance = string;
export type SelectionMap = Record<string, boolean>;

export interface AssessmentMaintenance {
    cover: boolean;
    needsInfobox: boolean;
    reassess: boolean;
    screenshot: boolean;
}

export interface Assessment {
    className: AssessmentClass;
    importance: AssessmentImportance;
    maintenance: AssessmentMaintenance;
    otherProjects: SelectionMap;
    taskForces: SelectionMap;
}

export interface AssessmentProjectOption {
    readonly id: string;
    readonly label: string;
}

export interface PageSnapshot {
    basetimestamp?: string;
    exists: boolean;
    starttimestamp: string;
    text: string;
}

export interface NewPageListSnapshot {
    basetimestamp: string;
    starttimestamp: string;
    text: string;
}

export interface AssessmentPageSnapshots {
    newPageList: NewPageListSnapshot;
    talkPage: PageSnapshot;
}

export interface SubjectPageInfo {
    creationDate: Date;
    isRedirect: boolean;
    listedTitle: string;
    namespaceNumber: number;
    targetTitle: string;
}

export interface ExistingRegistration {
    date: Date;
    listedTitle: string;
}

export interface RegistrationResult {
    alreadyRegistered: boolean;
    changed: boolean;
    earliestDate: Date | null;
    eligible: boolean;
    existing: ExistingRegistration | null;
    proposedText: string;
}

export interface PreparedTalkEdit {
    summary: string;
    title: string;
    topSection: string;
}
