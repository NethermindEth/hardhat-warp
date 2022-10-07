import * as fs from 'fs';
import { createHash } from 'crypto';
import {
  TASK_COMPILE_GET_COMPILATION_TASKS,
  TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
} from 'hardhat/builtin-tasks/task-names';
import { subtask, types } from 'hardhat/config';
import { glob } from 'hardhat/internal/util/glob';
import { CompilerInput } from 'hardhat/types';
import path from 'path';
import { HashInfo } from '../Hash';
import {
  TASK_COMPILE_WARP_GET_HASH,
  TASK_COMPILE_WARP_GET_SOURCE_PATHS,
  TASK_DEPLOY_WARP_GET_CAIRO_PATH,
  TASK_WRITE_CONTRACT_INFO,
} from '../task-names';
import {
  ContractInfo,
  checkHash,
  compile,
  getContract,
  getContractNames,
  saveContract,
} from '../utils';

subtask(TASK_COMPILE_SOLIDITY_RUN_SOLC).setAction(
  async ({ input }: { input: CompilerInput; solcPath: string }) => {
    const output = await compile(input);

    return output;
  },
);

subtask(TASK_COMPILE_GET_COMPILATION_TASKS, async (_, __, runSuper): Promise<string[]> => {
  return [...(await runSuper()), TASK_WRITE_CONTRACT_INFO];
});

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, (_, { config }): Promise<string[]> => {
  return glob(path.join(config.paths.root, 'contracts/**/*.sol'));
});

subtask(TASK_COMPILE_WARP_GET_SOURCE_PATHS, async (_, { config }): Promise<string[]> => {
  const starknetContracts = await glob(path.join(config.paths.root, 'contracts/**/*.sol'));

  return starknetContracts.map((contract) => path.relative(config.paths.root, contract));
});

subtask(TASK_COMPILE_WARP_GET_HASH)
  .addParam('contract', 'Path to Solidity contract', undefined, types.string, false)
  .setAction(async ({ contract }: { contract: string }): Promise<boolean> => {
    const readContract = fs.readFileSync(contract, 'utf-8');
    const hash = createHash('sha256').update(readContract).digest('hex');
    const hashObj = new HashInfo(contract, hash);
    const needToCompile = checkHash(hashObj);
    return needToCompile;
  });

subtask(TASK_WRITE_CONTRACT_INFO).setAction(async (_, { run }): Promise<void> => {
  const sourcePathsWarp: string[] = await run(TASK_COMPILE_WARP_GET_SOURCE_PATHS);

  for (const sourcepath of sourcePathsWarp) {
    const contractNames = await getContractNames(sourcepath);
    contractNames.map((contractName) => {
      const contractObj = new ContractInfo(contractName, sourcepath);
      saveContract(contractObj);
    });
  }
});

// subtask(TASK_COMPILE_WARP_RUN_BINARY)
//   .addParam(
//     "contract",
//     "Path to Solidity contract",
//     undefined,
//     types.string,
//     false
//   )
//   .addParam("warpPath", "Path to warp binary", undefined, types.string, false)
//   .setAction(
//     async ({
//       contract,
//       warpPath,
//     }: {
//       contract: string;
//       warpPath: string;
//     }): Promise<void> => {
//       const transpiler = new Transpiler(warpPath);
//       transpiler.transpile(contract);
//       const contractNames = await getContractNames(contract);
//       contractNames.map((contractName) => {
//         const contractObj = new ContractInfo(contractName, contract);
//         saveContract(contractObj);
//       });
//     }
//   );

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
  .addParam('contractName', 'Name of the contract to deploy', undefined, types.string, false)
  .setAction(async ({ contractName }: { contractName: string }) => {
    const contract = getContract(contractName);
    // TODO: catch exception
    return contract.getCairoFile();
  });
