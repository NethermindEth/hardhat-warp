import os from 'os';
import debug from 'debug';
import semver from 'semver';
import * as fs from 'fs';
import { createHash } from 'crypto';
import {
  TASK_COMPILE_GET_COMPILATION_TASKS,
  TASK_COMPILE_SOLIDITY_COMPILE_JOBS,
  TASK_COMPILE_SOLIDITY_LOG_NOTHING_TO_COMPILE,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
} from 'hardhat/builtin-tasks/task-names';
import { subtask, types } from 'hardhat/config';
import { CompilationJob, CompilerInput } from 'hardhat/types';
import { HashInfo } from '../Hash';
import { TASK_COMPILE_WARP_GET_HASH } from '../task-names';
import { ContractInfo, checkHash, compile, warpPath, getContractNames } from '../utils';
import * as taskTypes from 'hardhat/types/builtin-tasks';
import { HardhatError } from 'hardhat/internal/core/errors';
import { ERRORS } from 'hardhat/internal/core/errors-list';
import { execSync } from 'child_process';

type ArtifactsEmittedPerFile = Array<{
  file: taskTypes.ResolvedFile;
  artifactsEmitted: string[];
}>;

type ArtifactsEmittedPerJob = Array<{
  compilationJob: CompilationJob;
  artifactsEmittedPerFile: ArtifactsEmittedPerFile;
}>;

const log = debug('hardhat:core:tasks:compile');
// TODO check this version
const COMPILE_TASK_FIRST_SOLC_VERSION_SUPPORTED = '0.8.0';

// // We also run
// subtask(TASK_COMPILE_SOLIDITY_RUN_SOLC).setAction(
//   async ({ input }: { input: CompilerInput; solcPath: string }) => {
//     const output = await compile(input);

//     const pathToWarp = warpPath();
//     execSync(`${pathToWarp} transpile ${[...Object.keys(input.sources)].join(" ")} --compile-cairo`, {stdio: 'inherit'});(input);

//     return output;
//   },
// );

subtask(TASK_COMPILE_GET_COMPILATION_TASKS, async (_, __, runSuper): Promise<string[]> => {
  return [...(await runSuper()) /*TASK_WRITE_CONTRACT_INFO*/];
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

subtask(TASK_COMPILE_SOLIDITY_COMPILE_JOBS).setAction(
  async (
    {
      compilationJobs,
      quiet,
      concurrency,
    }: {
      compilationJobs: CompilationJob[];
      quiet: boolean;
      concurrency: number;
    },
    { run },
  ): Promise<{ artifactsEmittedPerJob: ArtifactsEmittedPerJob }> => {
    if (compilationJobs.length === 0) {
      log(`No compilation jobs to compile`);
      await run(TASK_COMPILE_SOLIDITY_LOG_NOTHING_TO_COMPILE, { quiet });
      return { artifactsEmittedPerJob: [] };
    }

    log(`Compiling ${compilationJobs.length} jobs`);

    const versionList: string[] = [];
    for (const job of compilationJobs) {
      const solcVersion = job.getSolcConfig().version;

      if (!versionList.includes(solcVersion)) {
        // versions older than 0.4.11 don't work with hardhat
        // see issue https://github.com/nomiclabs/hardhat/issues/2004
        if (semver.lt(solcVersion, COMPILE_TASK_FIRST_SOLC_VERSION_SUPPORTED)) {
          throw new HardhatError(ERRORS.BUILTIN_TASKS.COMPILE_TASK_UNSUPPORTED_SOLC_VERSION, {
            version: solcVersion,
            firstSupportedVersion: COMPILE_TASK_FIRST_SOLC_VERSION_SUPPORTED,
          });
        }

        versionList.push(solcVersion);
      }
    }

    try {
      const files = new Set<string>();
      const artifactsEmittedPerJob: ArtifactsEmittedPerJob = [];
      for (const compilationJob of compilationJobs) {
        const artifactsEmittedPerFile: ArtifactsEmittedPerFile = [];
        for (const rf of compilationJob.getResolvedFiles()) {
          artifactsEmittedPerFile.push({
            file: rf,
            artifactsEmitted: await getContractNames(rf.absolutePath),
          });
          files.add(rf.absolutePath);
        }
        artifactsEmittedPerJob.push({ compilationJob, artifactsEmittedPerFile });
      }

      const pathToWarp = warpPath();
      execSync(`${pathToWarp} transpile ${[...files].join(' ')} --compile-cairo`, {
        stdio: 'inherit',
      });
      return { artifactsEmittedPerJob };
    } catch (e) {
      if (!(e instanceof AggregateError)) {
        throw e;
      }

      for (const error of e.errors) {
        if (!HardhatError.isHardhatErrorType(error, ERRORS.BUILTIN_TASKS.COMPILE_FAILURE)) {
          throw error;
        }
      }

      // error is an aggregate error, and all errors are compilation failures
      throw new HardhatError(ERRORS.BUILTIN_TASKS.COMPILE_FAILURE);
    }
  },
);

// /**
//  * This is an orchestrator task that uses other subtasks to compile a
//  * compilation job.
//  */
// subtask(TASK_COMPILE_SOLIDITY_COMPILE_JOB)
//   .addParam("compilationJob", undefined, undefined, types.any)
//   .addParam("compilationJobs", undefined, undefined, types.any)
//   .addParam("compilationJobIndex", undefined, undefined, types.int)
//   .addParam("quiet", undefined, undefined, types.boolean)
//   .addOptionalParam("emitsArtifacts", undefined, true, types.boolean)
//   .setAction(
//     async (
//       {
//         compilationJob,
//         compilationJobs,
//         compilationJobIndex,
//         quiet,
//         emitsArtifacts,
//       }: {
//         compilationJob: CompilationJob;
//         compilationJobs: CompilationJob[];
//         compilationJobIndex: number;
//         quiet: boolean;
//         emitsArtifacts: boolean;
//       },
//       { run }
//     ): Promise<{
//       artifactsEmittedPerFile: ArtifactsEmittedPerFile;
//       compilationJob: taskTypes.CompilationJob;
//       input: CompilerInput;
//       output: CompilerOutput;
//       solcBuild: any;
//     }> => {
//       log(
//         `Compiling job with version '${compilationJob.getSolcConfig().version}'`
//       );
//       const input: CompilerInput = await run(
//         TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT,
//         {
//           compilationJob,
//         }
//       );

//       const { output, solcBuild } = await run(TASK_COMPILE_SOLIDITY_COMPILE, {
//         solcVersion: compilationJob.getSolcConfig().version,
//         input,
//         quiet,
//         compilationJob,
//         compilationJobs,
//         compilationJobIndex,
//       });

//       await run(TASK_COMPILE_SOLIDITY_CHECK_ERRORS, { output, quiet });

//       let artifactsEmittedPerFile = [];
//       if (emitsArtifacts) {
//         artifactsEmittedPerFile = (
//           await run(TASK_COMPILE_SOLIDITY_EMIT_ARTIFACTS, {
//             compilationJob,
//             input,
//             output,
//             solcBuild,
//           })
//         ).artifactsEmittedPerFile;
//       }

//       return {
//         artifactsEmittedPerFile,
//         compilationJob,
//         input,
//         output,
//         solcBuild,
//       };
//     }
//   );
