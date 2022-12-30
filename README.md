# Hardhat testing integration tool

The hardhat-warp framework overwrites sections of hardhat so that it uses warp
and StarkNet instead of solc and Ethereum.

## Getting started

In `hardhat.config.ts` configure the `integratedDevnet` under `networks`.

```
networks: {
  integratedDevnet: {
    url: `http://127.0.0.1:5050`,

    // venv: "active" <- for the active virtual environment with installed starknet-devnet
    // venv: "path/to/venv" <- for env with installed starknet-devnet (created with e.g. `python -m venv path/to/venv`)
    venv: "<path/to/venv>",
    args: ["--seed", "0", "--timeout", "10000"],
    stdout: `stdout.log`, // <- logs redirected to log file
    stderr: "STDERR"  // <- logs stderr to the terminal
  },
},
```

In the venv path make sure to install our version of the devnet:

```
pip install git+https://github.com/swapnilraj/starknet-devnet
```

Add the following two lines **BEFORE** any hardhat related imports in your
`hardhat.config.ts`:

```typescript
import { freedom } from 'hardhat-warp/src/index_before';
freedom(require);
```

Add the `harhdhat-warp` import **AFTER** all the hardhat related imports:

```
import 'hardhat-warp';
```

Here's an example configuration from the [UniStark repo](https://github.com/NethermindEth/UniStark/blob/main/hardhat.config.ts#L1):

```
import 'hardhat-typechain'
import {freedom} from 'hardhat-warp/src/index_before'
freedom(require)
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-etherscan'
import 'hardhat-warp'
```

Make the required changes for compatibility with StarkNet, you can checkout some commonly required changes [here](https://nethermindeth.github.io/warp/docs/get_around_unsupported_features).

<!-- TODO: write up docs on changes required to code using the blog as a template and link to them here -->

And then simply

```
yarn compile
```

or

```
yarn test
```

The Cairo files are written to the `artifacts` folder.

# TypeChain

`@typechain/hardhat` is required.
