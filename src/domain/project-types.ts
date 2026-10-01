/** Static WikiProject banner configuration contracts. */

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
