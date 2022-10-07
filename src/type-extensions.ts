import 'hardhat/types/runtime';
import '@shardlabs/starknet-hardhat-plugin';

declare module 'hardhat/types/runtime' {
  export interface HardhatRuntimeEnvironment {
    devnet: {
      load: (id: string) => Promise<void>;
      dump: (id: string) => Promise<void>;
      restart: () => Promise<void>;
    };
  }
}

import 'hardhat/types/config';

declare module 'hardhat/types/config' {
  export interface NetworksConfig {
    alpha: HttpNetworkConfig;
    alphaMainnet: HttpNetworkConfig;
    integratedDevnet: HardhatNetworkConfig;
  }

  export interface HardhatNetworkConfig {
    port: string;
    snapshots: string;
  }
}
