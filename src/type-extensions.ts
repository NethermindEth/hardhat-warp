import 'hardhat/types/runtime';

declare module 'hardhat/types/runtime' {
  interface HardhatRuntimeEnvironment {
    devnet: {
      load: (id: string) => Promise<void>;
      dump: (id: string) => Promise<void>;
      restart: () => Promise<void>;
    };
  }
}

import 'hardhat/types/config';

declare module 'hardhat/types/config' {
  export interface ProjectPathsUserConfig {
    warp?: string;
  }

  export interface ProjectPathsConfig {
    warp: string;
  }

  export interface StarknetConfig {
    wallet: string;
  }

  export interface StarknetUserConfig {
    wallet?: string;
  }

  export interface HardhatConfig {
    starknet: StarknetConfig;
  }

  export interface HardhatUserConfig {
    starknet?: StarknetUserConfig;
  }
}
