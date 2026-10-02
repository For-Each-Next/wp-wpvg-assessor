/**
 * @file src/domain/project-types.ts
 * Purpose: Static WikiProject banner configuration contracts.
 *
 * Table of contents:
 * 1. ProjectBannerConfig
 * 2. TaskForceConfig
 * 3. VideoGamesProjectConfig
 * 4. ProjectConfig
 */

export interface ProjectBannerConfig {
    readonly aliases: readonly string[];
    readonly id: string;
    readonly template: string;
}

interface TaskForceConfig {
    readonly aliases?: readonly string[];
    readonly id: string;
    readonly parameter: string;
}

export interface VideoGamesProjectConfig {
    readonly aliases: readonly string[];
    readonly classParameter: string;
    readonly importanceParameter: string;
    readonly taskForces: readonly TaskForceConfig[];
    readonly template: string;
}

export interface ProjectConfig {
    readonly otherProjects: readonly ProjectBannerConfig[];
    readonly videoGames: VideoGamesProjectConfig;
}
