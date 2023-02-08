# Hardhat testing integration tool

The hardhat-warp framework overwrites parts of hardhat so that it uses Warp
and StarkNet instead of solc and Ethereum.

NOTE: hardhat-warp is in beta and there might be bugs. Please open issues or reach out to
us on our [discord](https://discord.gg/cPqaZXev7P).

## Template for new project

If you're setting up a new project you can use [this repository](https://github.com/swapnilraj/hardhat-warp-template) as template.

## Configuring you project

The project has two peer dependencies which must be used in your hardhat repo.
These are `@typechain/hardhat` (over hardhat-typechain) and the latest version
of `@typechain/ethers-v5` (^10.1.1). Many older projects have old versions of
these dependencies already installed. Updating them is simple.

Install hardhat-warp

```
yarn add --dev @nethermindeth/harhdhat-warp
```

You will need to have python env with an instance of `starknet-devnet`.
See instructions for setting up `starknet-devnet`
[here](https://shard-labs.github.io/starknet-devnet/docs/intro).

```
python3.9 -m venv venv
source venv/bin/activate
pip install starknet-devnet
```

We will support
[starknet-hardhat-plguin](https://github.com/Shard-Labs/starknet-hardhat-plugin)'s
dockerized devnet and starknet cli soon

In `hardhat.config.ts` add the import after importing hardhat:

```
import '@nethermindeth/hardhat-warp';
```

Then add the following to run on a local testnet:

```
starknet: {
  network: "integrated-devnet",
}
networks: {
  integratedDevnet: {
    url: `http://127.0.0.1:5050`,

    venv: "<path/to/venv/with/starknet-devnet>",
    args: ["--seed", "0", "--timeout", "10000"],
    stdout: `stdout.log`, // <- logs redirected to log file
    stderr: "STDERR"  // <- logs stderr to the terminal
  },
},
```

Install the python dependencies of hardhat-warp:

```
yarn hardhat warp-install
```

Here's an example configuration from the [UniStark repo](https://github.com/NethermindEth/UniStark/blob/main/hardhat.config.ts#L1).

## Solidity changes

Make the required changes for compatibility with StarkNet, you can checkout
some commonly required changes
[here](https://nethermindeth.github.io/warp/docs/get_around_unsupported_features).

## Using hardhat warp

```
yarn hardhat test
```

The Cairo files are written to the `artifacts` folder.
