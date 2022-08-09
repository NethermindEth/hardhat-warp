import './type-extensions';

import {
  TASK_COMPILE_GET_COMPILATION_TASKS, TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
} from 'hardhat/builtin-tasks/task-names';
import {extendConfig, subtask, task, types} from 'hardhat/config';
import {glob} from 'hardhat/internal/util/glob';
import path from 'path';

import {
  TASK_COMPILE_WARP,
  TASK_COMPILE_WARP_GET_SOURCE_PATHS,
  TASK_COMPILE_WARP_GET_WARP_PATH,
  TASK_COMPILE_WARP_PRINT_ETHEREUM_PROMPT,
  TASK_COMPILE_WARP_PRINT_STARKNET_PROMPT,
  TASK_COMPILE_WARP_RUN_BINARY,
  TASK_DEPLOY_WARP,
  TASK_DEPLOY_WARP_GET_CAIRO_PATH,
} from './task-names';
import {Transpiler} from './transpiler';
import {HardhatConfig, HardhatUserConfig} from 'hardhat/types';
import {WarpPluginError, colorLogger, saveContract} from './utils';
import {Contract} from './Contract';

extendConfig(
    (config: HardhatConfig, userConfig: Readonly<HardhatUserConfig>) => {
      const userWarpPath = userConfig.paths?.warp;

      let newPath: string;
      if (userWarpPath === undefined) {
        newPath = 'UNDEFINED';
      } else {
        if (path.isAbsolute(userWarpPath)) {
          newPath = userWarpPath;
        } else {
          newPath = path.normalize(path.join(config.paths.root, userWarpPath));
        }
      }

      config.paths.warp = newPath;
    },
);

subtask(
    TASK_COMPILE_GET_COMPILATION_TASKS,
    async (_, __, runSuper): Promise<string[]> => {
      const otherTasks = await runSuper();
      return [TASK_COMPILE_WARP_PRINT_ETHEREUM_PROMPT, ...otherTasks, TASK_COMPILE_WARP];
    },
);

subtask(TASK_COMPILE_WARP_PRINT_ETHEREUM_PROMPT,
    async (): Promise<void> => {
      colorLogger('\nCompiling Ethereum contracts: \n');
    },
);

subtask(TASK_COMPILE_WARP_PRINT_STARKNET_PROMPT,
    async (): Promise<void> => {
      colorLogger('\nCompiling Starknet contracts: \n');
    },
);

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
    async (_, {config}): Promise<string[]> => {
      const solPaths = await glob(path.join(config.paths.root, 'contracts/**/*.sol'));
      const cairoPaths = await glob(path.join(config.paths.root, 'contracts/**/*_cairo.sol'));

      return solPaths.filter((x) => !cairoPaths.includes(x));
    },
);

subtask(TASK_COMPILE_WARP_GET_SOURCE_PATHS,
    async (_, {config}): Promise<string[]> => {
      const starknetContracts = await glob(
          path.join(config.paths.root, 'starknet_contracts/**/*.sol'),
      );
      const contracts = await glob(path.join(config.paths.root, 'contracts/**/*_cairo.sol'));

      return starknetContracts.concat(contracts).map((contract) => path.relative(config.paths.root, contract));
    },
);

subtask(TASK_COMPILE_WARP_RUN_BINARY)
    .addParam('contract', 'Path to Solidity contract', undefined, types.string, false)
    .addParam('warpPath', 'Path to warp binary', undefined, types.string, false)
    .setAction(
        async ({
          contract,
          warpPath,
        }: {
      contract: string;
      warpPath: string;
    }): Promise<string> => {
          const transpiler = new Transpiler(warpPath);
          const contractNames = await transpiler.getContractNames(contract);
          contractNames.map((contractName) => {
            const contractObj = new Contract(contractName, contract);
            saveContract(contractObj);
          });

          const result = await transpiler.transpile(contract);
          return result;
        },
    );

subtask(TASK_COMPILE_WARP_GET_WARP_PATH,
    async (_, {config}): Promise<string> => {
      if (config.paths.warp === 'UNDEFINED') {
        throw new WarpPluginError(
            'Unable to find warp binary. Please set warp binary path in hardhat config',
        );
      }

      return config.paths.warp;
    },
);

subtask(TASK_COMPILE_WARP)
    .setAction(
        async (_, {run}) => {
          await run(TASK_COMPILE_WARP_PRINT_STARKNET_PROMPT);

          const warpPath: string = await run(
              TASK_COMPILE_WARP_GET_WARP_PATH,
          );

          const sourcePathsWarp: string[] = await run(
              TASK_COMPILE_WARP_GET_SOURCE_PATHS,
          );

          sourcePathsWarp.forEach(async (source) => await run(
              TASK_COMPILE_WARP_RUN_BINARY,
              {
                contract: source,
                warpPath: warpPath,
              },
          ));
        },
    );

subtask(TASK_DEPLOY_WARP_GET_CAIRO_PATH)
    .addParam('solidityPath',
        'Path of solidity contract to get the corresponding Cairo for',
        undefined,
        types.string,
        false)
    .addParam('contractName',
        'Name of the contract to deploy', undefined, types.string, false)
    .setAction(
        async (
            {solidityPath, contractName} : {solidityPath: string, contractName: string}, {config},
        ) => {
          // const contractPath = path.normalize(path.join(config.paths.root, solidityPath));
          const solPath = path.resolve(solidityPath);
          const cairoPath = path.relative(config.paths.root, solPath).slice(0, -4).replace('_', '__');
          // TODO: Check if this file exists
          const contractPath = cairoPath.concat(`__WC__${contractName}.cairo`);
          // TODO: Check if this contract exists
          return path.join('warp_output', contractPath);
        },
    );

task(TASK_DEPLOY_WARP)
    .addParam('contractPath', 'Path to solidity contract to be deployed to Starknet', undefined, types.string, false)
    .addParam('contractName',
        'Name of the contract to deploy', undefined, types.string, false)
    .addParam(
        'inputs',
        'Space separated constructor inputs for the solidity contract being deployed to Starknet',
        '',
        types.string, true)
    .addFlag('testnet', 'Flag to change deploy target to Starknet testnet')
    .addFlag('noWallet', 'Deploy without using wallet')
    .setAction(
        async (
            {
              contractPath,
              contractName,
              inputs,
              testnet,
              noWallet,
            } : {
            contractPath: string,
            contractName: string,
            inputs: string,
            testnet: boolean,
            noWallet: boolean,
          },
            {config, run}) => {
          const cairoPath = await run(
              TASK_DEPLOY_WARP_GET_CAIRO_PATH,
              {solidityPath: contractPath, contractName: contractName},
          );
          const transpiler = new Transpiler(config.paths.warp);

          const result = await transpiler.deploy(
              cairoPath,
              inputs,
              testnet,
            (noWallet) ? 'noWallet' : config.starknet.wallet);

          return result;
        },
    );
