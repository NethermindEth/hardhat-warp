import './type-extensions';
import * as fs from 'fs';
import {createHash} from 'crypto';
import {
  TASK_COMPILE_GET_COMPILATION_TASKS, TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, TASK_COMPILE_SOLIDITY_RUN_SOLC,
} from 'hardhat/builtin-tasks/task-names';
import {extendConfig, subtask, task, types} from 'hardhat/config';
import {glob} from 'hardhat/internal/util/glob';
import {CompilerInput, HardhatConfig, HardhatUserConfig} from 'hardhat/types';
import path from 'path';
import {runTypeChain} from 'typechain';

import {ContractInfo} from './Contract';
import {HashInfo} from './Hash';
import {
  TASK_COMPILE_WARP, TASK_COMPILE_WARP_GET_HASH, TASK_COMPILE_WARP_GET_SOURCE_PATHS, TASK_COMPILE_WARP_GET_WARP_PATH,
  TASK_COMPILE_WARP_MAKE_TYPECHAIN, TASK_COMPILE_WARP_PRINT_ETHEREUM_PROMPT,
  TASK_COMPILE_WARP_PRINT_STARKNET_PROMPT, TASK_COMPILE_WARP_RUN_BINARY, TASK_DEPLOY_WARP,
  TASK_DEPLOY_WARP_GET_CAIRO_PATH, TASK_WRITE_CONTRACT_INFO
} from './task-names';
import {Transpiler} from './transpiler';
import {checkHash, colorLogger, getContract, saveContract, WarpPluginError} from './utils';

import { extendEnvironment } from "hardhat/config";
import {getStarknetContractFactory} from './testing';
import * as properties from "@ethersproject/properties"
import * as address from "@ethersproject/address"

const NETHERSOLC_PATH = "/Users/swp/dev/nethermind/warp/nethersolc/darwin_arm64/8/solc";

export class NativeCompiler {
  constructor(private _pathToSolc: string) {}

  public async compile(input: any) {
    const output: string = await new Promise((resolve, reject) => {
      const process = exec(
        `${this._pathToSolc} --standard-json`,
        {
          maxBuffer: 1024 * 1024 * 1024 * 1024,
        },
        (err: any, stdout: any) => {
          if (err !== null) {
            return reject(err);
          }
          resolve(stdout);
        }
      );

      process.stdin!.write(JSON.stringify(input));
      process.stdin!.end();
    });

    return JSON.parse(output);
  }
}
import {ContractFactory} from './ContractFactory';
import {exec, execSync} from 'child_process';

// Hack to wreck safety

// @ts-ignore
extendEnvironment((hre) => {
  //@ts-ignore
  const getContractFactory = hre.ethers.getContractFactory;
  
  // console.log(hre.ethers);
  //@ts-ignore
  hre.ethers.getContractFactory = async (name) => {
    const ethersContractFactory = await getContractFactory(name)
    const starknetContractFactory = getStarknetContractFactory(name)
    return Promise.resolve(new ContractFactory(starknetContractFactory, ethersContractFactory));
  };
  // @ts-ignore
  hre.ethers.provider.formatter.address = (address: string): string => {
    try {
      const addressVal = BigInt(address)
      if (addressVal >= 2 ** 251) {
        throw new Error(`Address is not a valid starknet address ${address}`)
      }
      return address
    } catch {
        throw new Error(`Address is not a valid starknet address ${address}`)
    }
  }

})

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

subtask(TASK_COMPILE_SOLIDITY_RUN_SOLC)
  .setAction(
    async ({ input, solcPath }: { input: CompilerInput; solcPath: string }) => {

      const compiler = new NativeCompiler(NETHERSOLC_PATH);

      const output = await compiler.compile(input);

      return output;
    }
  );

subtask(
    TASK_COMPILE_GET_COMPILATION_TASKS,
    async (_, __, runSuper): Promise<string[]> => {
      const otherTasks = await runSuper();
      return [
        TASK_COMPILE_WARP_PRINT_ETHEREUM_PROMPT,
        ...otherTasks,
        // TASK_COMPILE_WARP,
        TASK_WRITE_CONTRACT_INFO,
        TASK_COMPILE_WARP_MAKE_TYPECHAIN,
      ];
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
          path.join(config.paths.root, 'contracts/**/*.sol'),
      );

      return starknetContracts.map((contract) => path.relative(config.paths.root, contract));
    },
);

subtask(TASK_COMPILE_WARP_GET_HASH)
    .addParam('contract', 'Path to Solidity contract', undefined, types.string, false)
    .setAction(
        async ({
          contract,
        }: {
      contract: string;
    }): Promise<boolean> => {
          const readContract = fs.readFileSync(contract, 'utf-8');
          const hash = createHash('sha256').update(readContract).digest('hex');
          const hashObj = new HashInfo(contract, hash);
          const needToCompile = checkHash(hashObj);
          return needToCompile;
        },
    );

subtask(TASK_WRITE_CONTRACT_INFO)
    .setAction( async (_, {run}): Promise<void> => {
          const warpPath: string = await run(
              TASK_COMPILE_WARP_GET_WARP_PATH,
          );

          const sourcePathsWarp: string[] = await run(
              TASK_COMPILE_WARP_GET_SOURCE_PATHS,
          );


          const transpiler = new Transpiler(warpPath);
          for (let sourcepath of sourcePathsWarp) {
            const contractNames = await transpiler.getContractNames(sourcepath);
            contractNames.map((contractName) => {
              const contractObj = new ContractInfo(contractName, sourcepath);
              saveContract(contractObj);
            });
          }
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
    }): Promise<void> => {
          const transpiler = new Transpiler(warpPath);
          transpiler.transpile(contract);
          const contractNames = await transpiler.getContractNames(contract);
          contractNames.map((contractName) => {
            const contractObj = new ContractInfo(contractName, contract);
            saveContract(contractObj);
          });
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

subtask(TASK_COMPILE_WARP_MAKE_TYPECHAIN,
    async (_, {config}) => {
      const abiPaths = await glob(
          path.join(config.paths.root, 'warp_output/**/*_compiled.json'),
      );
      if (abiPaths.length === 0) {
        console.log('No compiled Starknet contracts found, no typechains to build');
        return;
      }
      const cwd = process.cwd();
      runTypeChain({
        cwd: cwd,
        filesToProcess: abiPaths,
        allFiles: abiPaths,
        outDir: 'typechain-types',
        target: 'starknet',
      });
    },
);

// subtask(TASK_COMPILE_WARP)
//     .setAction(
//         async (_, {run}) => {
//           await run(TASK_COMPILE_WARP_PRINT_STARKNET_PROMPT);

//           const warpPath: string = await run(
//               TASK_COMPILE_WARP_GET_WARP_PATH,
//           );

//           const sourcePathsWarp: string[] = await run(
//               TASK_COMPILE_WARP_GET_SOURCE_PATHS,
//           );

//           const results = await Promise.all(sourcePathsWarp.map(async (source) => {
//             return await run(
//                 TASK_COMPILE_WARP_GET_HASH,
//                 {
//                   contract: source,
//                 },
//             );
//           }));

//           sourcePathsWarp.forEach(async (source, i) => {
//             if (results[i]) {
//               await run(
//                   TASK_COMPILE_WARP_RUN_BINARY,
//                   {
//                     contract: source,
//                     warpPath: warpPath,
//                   },
//               );
//             }
//           });
//         },
//     );

subtask(TASK_DEPLOY_WARP_GET_CAIRO_PATH)
    .addParam('contractName',
        'Name of the contract to deploy', undefined, types.string, false)
    .setAction(
        async (
            {contractName} : {contractName: string},
        ) => {
          const contract = getContract(contractName);
          // TODO: catch exception
          return contract.getCairoFile();
        },
    );

task(TASK_DEPLOY_WARP)
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
              contractName,
              inputs,
              testnet,
              noWallet,
            } : {
            contractName: string,
            inputs: string,
            testnet: boolean,
            noWallet: boolean,
          },
            {config, run}) => {
          const cairoPath = await run(
              TASK_DEPLOY_WARP_GET_CAIRO_PATH,
              {contractName: contractName},
          );
          const transpiler = new Transpiler(config.paths.warp);

          const result = await transpiler.deploy(
              cairoPath,
              inputs,
              testnet,
            (noWallet) ? 'noWallet' : config.starknet.wallet);

          const contAd = result.match('Contract address: (0x[0-9a-z]+)');
          const TxHash = result.match('Transaction hash: (0x[0-9a-z]+)');

          if (contAd === null || TxHash === null) {
            throw new WarpPluginError('Failed to save contract deploy details');
            return result;
          }

          const Contract = getContract(contractName);
          Contract.setDeployTxHash(TxHash[1]);
          Contract.setDeployedAddress(contAd[1]);
          saveContract(Contract);
          console.log('Deployment details of the contract have been saved');
          return result;
        },
    );
