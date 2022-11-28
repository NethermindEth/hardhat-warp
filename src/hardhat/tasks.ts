import os from 'os';
import path from 'path';
import debug from 'debug';
import semver from 'semver';
import * as fs from 'fs';
import { createHash } from 'crypto';
import {
  TASK_COMPILE_GET_COMPILATION_TASKS,
  TASK_COMPILE_SOLIDITY,
  TASK_COMPILE_SOLIDITY_COMPILE_JOBS,
  TASK_COMPILE_SOLIDITY_FILTER_COMPILATION_JOBS,
  TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOBS,
  TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH,
  TASK_COMPILE_SOLIDITY_GET_SOURCE_NAMES,
  TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
  TASK_COMPILE_SOLIDITY_HANDLE_COMPILATION_JOBS_FAILURES,
  TASK_COMPILE_SOLIDITY_LOG_COMPILATION_RESULT,
  TASK_COMPILE_SOLIDITY_LOG_NOTHING_TO_COMPILE,
  TASK_COMPILE_SOLIDITY_MERGE_COMPILATION_JOBS,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
} from 'hardhat/builtin-tasks/task-names';
import { subtask, types } from 'hardhat/config';
import {
  Artifacts,
  CompilationJob,
  CompilationJobsCreationResult,
  CompilerInput,
  ResolvedFile,
} from 'hardhat/types';
import { HashInfo } from '../Hash';
import { TASK_COMPILE_WARP_GET_HASH } from '../task-names';
import { ContractInfo, checkHash, compile, warpPath, getContractNames } from '../utils';
import * as taskTypes from 'hardhat/types/builtin-tasks';
import { HardhatError } from 'hardhat/internal/core/errors';
import { ERRORS } from 'hardhat/internal/core/errors-list';
import {
  getSolidityFilesCachePath,
  SolidityFilesCache,
} from 'hardhat/builtin-tasks/utils/solidity-files-cache';
import { Artifacts as ArtifactsImpl } from 'hardhat/internal/artifacts';

import { execSync } from 'child_process';
import { getFullyQualifiedName } from 'hardhat/utils/contract-names';

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

// We do the transpilation of the files in this step to avoid redundant
// retranspilation in TASK_COMPILE_SOLIDITY_RUN_SOLC
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
    { config, run },
  ): Promise<{ artifactsEmittedPerJob: ArtifactsEmittedPerJob }> => {
    if (compilationJobs.length === 0) {
      log(`No compilation jobs to compile`);
      await run(TASK_COMPILE_SOLIDITY_LOG_NOTHING_TO_COMPILE, { quiet });
      return { artifactsEmittedPerJob: [] };
    }

    log(`Compiling ${compilationJobs.length} jobs`);

    const { default: pMap } = await import('p-map');

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

    const pMapOptions = { concurrency: os.cpus().length, stopOnError: false };
    try {
      let files = new Set<string>();
      let artifactsEmittedPerJob: ArtifactsEmittedPerJob = [];
      const basePath = path.resolve('./');
      for (const compilationJob of compilationJobs) {
        const artifactsEmittedPerFile: ArtifactsEmittedPerFile = [];
        for (const rf of compilationJob.getResolvedFiles()) {
          artifactsEmittedPerFile.push({
            file: rf,
            artifactsEmitted: await getContractNames(rf.absolutePath),
          });
          // TEMP fix while warp is fixing it's support for resolved file paths
          if (rf.absolutePath.startsWith(basePath)) {
            files.add(rf.absolutePath.slice(basePath.length + 1));
          } else {
            throw new Error('path outside of project');
          }
        }
        artifactsEmittedPerJob.push({ compilationJob, artifactsEmittedPerFile });
      }

      // const pathToWarp = warpPath();
      // execSync(
      //   `${pathToWarp} transpile --base-path . --include-paths node_modules --compile-cairo -o ${
      //     config.paths.artifacts
      //   } ${[...files].join(' ')}`,
      //   { stdio: 'inherit' },
      // );
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

/**
 * Main task for compiling the solidity files in the project.
 *
 * The main responsibility of this task is to orchestrate and connect most of
 * the subtasks related to compiling solidity.
 */
subtask(TASK_COMPILE_SOLIDITY).setAction(
  async ({ force, quiet }: { force: boolean; quiet: boolean }, { artifacts, config, run }) => {
    const sourcePaths: string[] = await run(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS);

    const sourceNames: string[] = await run(TASK_COMPILE_SOLIDITY_GET_SOURCE_NAMES, {
      sourcePaths,
    });

    const solidityFilesCachePath = getSolidityFilesCachePath(config.paths);
    let solidityFilesCache = await SolidityFilesCache.readFromFile(solidityFilesCachePath);

    const dependencyGraph: taskTypes.DependencyGraph = await run(
      TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH,
      { sourceNames, solidityFilesCache },
    );

    solidityFilesCache = await invalidateCacheMissingArtifacts(
      solidityFilesCache,
      artifacts,
      dependencyGraph.getResolvedFiles(),
    );

    const compilationJobsCreationResult: CompilationJobsCreationResult = await run(
      TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOBS,
      {
        dependencyGraph,
        solidityFilesCache,
      },
    );

    await run(TASK_COMPILE_SOLIDITY_HANDLE_COMPILATION_JOBS_FAILURES, {
      compilationJobsCreationErrors: compilationJobsCreationResult.errors,
    });

    const compilationJobs = compilationJobsCreationResult.jobs;

    const filteredCompilationJobs: CompilationJob[] = await run(
      TASK_COMPILE_SOLIDITY_FILTER_COMPILATION_JOBS,
      { compilationJobs, force, solidityFilesCache },
    );

    const mergedCompilationJobs: CompilationJob[] = await run(
      TASK_COMPILE_SOLIDITY_MERGE_COMPILATION_JOBS,
      { compilationJobs: filteredCompilationJobs },
    );

    const { artifactsEmittedPerJob }: { artifactsEmittedPerJob: ArtifactsEmittedPerJob } =
      await run(TASK_COMPILE_SOLIDITY_COMPILE_JOBS, {
        compilationJobs: mergedCompilationJobs,
        quiet,
      });

    // update cache using the information about the emitted artifacts
    for (const {
      compilationJob: compilationJob,
      artifactsEmittedPerFile: artifactsEmittedPerFile,
    } of artifactsEmittedPerJob) {
      for (const { file, artifactsEmitted } of artifactsEmittedPerFile) {
        solidityFilesCache.addFile(file.absolutePath, {
          lastModificationDate: file.lastModificationDate.valueOf(),
          contentHash: file.contentHash,
          sourceName: file.sourceName,
          solcConfig: compilationJob.getSolcConfig(),
          imports: file.content.imports,
          versionPragmas: file.content.versionPragmas,
          artifacts: artifactsEmitted,
        });
      }
    }

    const allArtifactsEmittedPerFile = solidityFilesCache.getEntries();

    // We know this is the actual implementation, so we use some
    // non-public methods here.
    const artifactsImpl = artifacts as ArtifactsImpl;
    artifactsImpl.addValidArtifacts(allArtifactsEmittedPerFile);

    await solidityFilesCache.writeToFile(solidityFilesCachePath);

    await run(TASK_COMPILE_SOLIDITY_LOG_COMPILATION_RESULT, {
      compilationJobs: mergedCompilationJobs,
      quiet,
    });
  },
);

/**
 * If a file is present in the cache, but some of its artifacts are missing on
 * disk, we remove it from the cache to force it to be recompiled.
 */
async function invalidateCacheMissingArtifacts(
  solidityFilesCache: SolidityFilesCache,
  artifacts: Artifacts,
  resolvedFiles: ResolvedFile[],
): Promise<SolidityFilesCache> {
  for (const file of resolvedFiles) {
    const cacheEntry = solidityFilesCache.getEntry(file.absolutePath);

    if (cacheEntry === undefined) {
      continue;
    }

    const { artifacts: emittedArtifacts } = cacheEntry;

    for (const emittedArtifact of emittedArtifacts) {
      const artifactExists = await artifacts.artifactExists(
        getFullyQualifiedName(file.sourceName, emittedArtifact),
      );
      if (!artifactExists) {
        log(
          `Invalidate cache for '${file.absolutePath}' because artifact '${emittedArtifact}' doesn't exist`,
        );
        solidityFilesCache.removeEntry(file.absolutePath);
        break;
      }
    }
  }

  return solidityFilesCache;
}

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
