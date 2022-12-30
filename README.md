# Hardhat testing integration tool

The hardhat-warp framework overwrites parts of hardhat so that it uses Warp
and StarkNet instead of solc and Ethereum.

NOTE: hardhat-warp is in beta and there might be bugs with this. Please open issues and reach out to
us on our [discord](https://discord.gg/cPqaZXev7P).

## Installing dependencies

Install the required dependencies in the hardhat project:

```
yarn add @nethermindeth/harhdhat-warp
yarn add @shardlabs/starknet-hardhat-plugin
```

If the project doesn't already have `@typechain/hardhat`; then you will need to install them:

```
yarn add @typechain/hardhat
```

Next you will need `starknet-devnet`; configure a virtual environment using `python3.9`:

```
python3.9 -m venv venv
```

Installing our modified version of `starknet-devnet`:

```
pip install git+https://github.com/swapnilraj/starknet-devnet
```

## Configuring hardhat

In `hardhat.config.ts`, add the following:

```
starknet: {
  network: "integrated-devnet",
}
networks: {
  integratedDevnet: {
    url: `http://127.0.0.1:5050`,

    venv: "<path/to/venv/from/before>",
    args: ["--seed", "0", "--timeout", "10000"],
    stdout: `stdout.log`, // <- logs redirected to log file
    stderr: "STDERR"  // <- logs stderr to the terminal
  },
},
```

Add the following two lines **BEFORE** any hardhat related imports in your
`hardhat.config.ts`:

```typescript
import { freedom } from '@nethermindeth/hardhat-warp/src/index_before';
freedom(require);
```

Add the `harhdhat-warp` import **AFTER** all the hardhat related imports:

```
import 'hardhat-warp';
```

Here's an example configuration from the [UniStark repo](https://github.com/NethermindEth/UniStark/blob/main/hardhat.config.ts#L1):

```
import 'hardhat-typechain'
import {freedom} from '@nethermindeth/hardhat-warp/src/index_before'
freedom(require)
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-etherscan'
import '@nethermindeth/hardhat-warp'
```

Make the required changes for compatibility with StarkNet, you can checkout some commonly required changes [here](https://nethermindeth.github.io/warp/docs/get_around_unsupported_features).

And then simply

```
yarn compile
```

or

```
yarn test
```

The Cairo files are written to the `artifacts` folder.
