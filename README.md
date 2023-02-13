# Hardhat testing integration tool

The hardhat-warp framework overwrites parts of hardhat so that it uses Warp
and StarkNet instead of solc and Ethereum.

NOTE: hardhat-warp is in beta and there might be bugs. Please open issues or reach out to
us on our [discord](https://discord.gg/cPqaZXev7P).

## Template for new project

If you're setting up a new project you can use [this repository](https://github.com/swapnilraj/hardhat-warp-template) as template.

## Installing dependencies

The project must use `@typechain/hardhat`, and `@typechain/ethers-v5 ^10.1.1`:

```bash
yarn add --dev @typechain/hardhat @typechain/ethers-v5
```

Install the required dependencies in the hardhat project:

```bash
yarn add --dev @nethermindeth/hardhat-warp @shardlabs/starknet-hardhat-plugin
```

Next you will need to ensure that the latest version of [`starknet-devnet`](https://github.com/Shard-Labs/starknet-devnet) is installed.

## Configuring hardhat

In `hardhat.config.ts`, add the following:

```js
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

Add the `harhdhat-warp` import **AFTER** for the hardhat related imports:

```js
import '@nethermindeth/hardhat-warp';
```

Here's an example configuration from the [UniStark repo](https://github.com/NethermindEth/UniStark/blob/main/hardhat.config.ts#L1):

```js
import 'hardhat-typechain';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import '@nethermindeth/hardhat-warp';
```

Make the required changes for compatibility with StarkNet, you can checkout some commonly required changes [here](https://nethermindeth.github.io/warp/docs/get_around_unsupported_features).

And then simply

```bash
yarn hardhat compile
```

or

```bash
yarn hardhat test
```

The Cairo files are written to the `artifacts` folder.
