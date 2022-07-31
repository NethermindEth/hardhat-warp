import 'hardhat/types/config';

declare module 'hardhat/types/config' {
    export interface ProjectPathsUserConfig {
        warp?: string;
    }

    export interface ProjectPathsConfig {
        warp: string;
    }
}
