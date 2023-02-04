import path from 'path';
import debug from 'debug';
import semver from 'semver';
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
} from 'hardhat/builtin-tasks/task-names';
import { subtask } from 'hardhat/config';
import {
  Artifacts,
  CompilationJob,
  CompilationJobsCreationResult,
  ResolvedFile,
} from 'hardhat/types';
import { warpPath, getContractNames } from '../utils';
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
import { TASK_TYPECHAIN_GENERATE_TYPES } from '@typechain/hardhat/dist/constants';
import { PublicConfig } from 'typechain';
import { copyFileSync, rmSync } from 'fs';
import { globalHRE } from '../hardhat/runtime-environment';

type ArtifactsEmittedPerFile = Array<{
  file: taskTypes.ResolvedFile;
  artifactsEmitted: string[];
}>;

type ArtifactsEmittedPerJob = Array<{
  compilationJob: CompilationJob;
  artifactsEmittedPerFile: ArtifactsEmittedPerFile;
}>;

const log = debug('hardhat:core:tasks:compile');
const COMPILE_TASK_FIRST_SOLC_VERSION_SUPPORTED = '0.8.0';

subtask(TASK_COMPILE_GET_COMPILATION_TASKS, async (_, __, runSuper): Promise<string[]> => {
  return [...(await runSuper()) /*TASK_WRITE_CONTRACT_INFO*/];
});

// We do the transpilation of the files in this step to avoid redundant
// retranspilation in TASK_COMPILE_SOLIDITY_RUN_SOLC
subtask(TASK_COMPILE_SOLIDITY_COMPILE_JOBS).setAction(
  async (
    {
      compilationJobs,
      quiet,
    }: {
      compilationJobs: CompilationJob[];
      quiet: boolean;
    },
    { config, run },
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

    const files = new Set<string>();
    const artifactsEmittedPerJob: ArtifactsEmittedPerJob = [];
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

    if (!globalHRE.config.networks.integratedDevnet.venv)
      throw new Error(
        'A path to venv with starknet-devnet is required, please check the hardhat-warp install documentation',
      );
    const WARP_VENV_PREFIX = path.resolve(globalHRE.config.networks.integratedDevnet.venv, 'bin');

    const PATH_PREFIX = `PATH=${WARP_VENV_PREFIX}:$PATH`;

    const pathToWarp = warpPath();
    execSync(
      `${PATH_PREFIX} ${pathToWarp} transpile --compile-cairo -o ${config.paths.artifacts} ${[
        ...files,
      ].join(' ')}`,
      { stdio: 'inherit' },
    );
    return { artifactsEmittedPerJob };
  },
);

subtask(
  TASK_COMPILE_SOLIDITY_COMPILE_JOBS,
  'Compiles the entire project, building all artifacts',
).setAction(async (taskArgs, { run }, runSuper) => {
  const compileSolOutput = await runSuper(taskArgs);
  await run(TASK_TYPECHAIN_GENERATE_TYPES, { compileSolOutput, quiet: taskArgs.quiet });
  return compileSolOutput;
});

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

subtask(TASK_TYPECHAIN_GENERATE_TYPES).setAction(
  async ({ compileSolOutput, quiet }, { config, artifacts }) => {
    const artifactFQNs: string[] = getFQNamesFromCompilationOutput(compileSolOutput);
    const artifactPaths = Array.from(
      new Set(
        artifactFQNs.map((fqn) =>
          artifacts
            .formArtifactPathFromFullyQualifiedName(fqn)
            .replace(/_compiled\.json$/, '_sol_abi.json'),
        ),
      ),
    );

    // We don'st support using the taskArgsStore because we can't access it
    // if (typechain.taskArgsStore.noTypechain) {
    //   return compileSolOutput
    // }

    // RUN TYPECHAIN TASK
    // @ts-ignore funky types cause we're not using normal imports here
    const typechainCfg = config.typechain;
    // NOTE: We replace the fullRequild from the taskArgsStore with our own in
    // the hardhat config.
    if (
      !typechainCfg.fullRebuild &&
      artifactPaths.length === 0 &&
      !typechainCfg.externalArtifacts
    ) {
      if (!quiet) {
        // eslint-disable-next-line no-console
        console.log('No need to generate any newer typings.');
      }

      return compileSolOutput;
    }

    // incremental generation is only supported in 'ethers-v5'
    // @todo: probably targets should specify somehow if then support incremental generation this won't work with custom targets
    // NOTE: We replace the fullRequild from the taskArgsStore with our own in
    // the hardhat config.
    const needsFullRebuild =
      /*typechain.taskArgsStore.fullRebuild || */ typechainCfg.target !== 'ethers-v5' ||
      typechainCfg.fullRebuild;
    if (!quiet) {
      // eslint-disable-next-line no-console
      console.log(
        `Generating typings for: ${artifactPaths.length} artifacts in dir: ${typechainCfg.outDir} for target: ${typechainCfg.target}`,
      );
    }
    const cwd = config.paths.root;

    const { glob } = await import('typechain');
    const allFiles = glob(cwd, [
      `${config.paths.artifacts}/!(build-info)/**/+([a-zA-Z0-9_])_sol_abi.json`,
    ]);
    if (typechainCfg.externalArtifacts) {
      allFiles.push(...glob(cwd, typechainCfg.externalArtifacts, false));
    }

    const typechainOptions: Omit<PublicConfig, 'filesToProcess'> = {
      cwd,
      allFiles: allFiles.map((f) => {
        const newFile = f.replace(/_sol_abi\.json$/, '.json');
        copyFileSync(f, newFile);
        return newFile;
      }),
      outDir: typechainCfg.outDir,
      target: typechainCfg.target,
      flags: {
        alwaysGenerateOverloads: typechainCfg.alwaysGenerateOverloads,
        discriminateTypes: typechainCfg.discriminateTypes,
        tsNocheck: typechainCfg.tsNocheck,
        environment: 'hardhat',
      },
    };

    // TODO come up with a cleaner way to handle all this solfile filestoprocess thing
    const filesToProcess = (needsFullRebuild ? allFiles : glob(cwd, artifactPaths)).map((f) =>
      f.replace(/_sol_abi\.json$/, '.json'),
    ); // only process changed files if not doing full rebuild
    const { runTypeChain } = await import('typechain');
    const result = await runTypeChain({
      ...typechainOptions,
      filesToProcess,
    });

    if (!quiet) {
      // eslint-disable-next-line no-console
      console.log(`Successfully generated ${result.filesGenerated} typings!`);
    }

    // if this is not full rebuilding, always re-generate types for external artifacts
    if (!needsFullRebuild && typechainCfg.externalArtifacts) {
      const result = await runTypeChain({
        ...typechainOptions,
        filesToProcess: glob(cwd, typechainCfg.externalArtifacts, false), // only process files with external artifacts
      });

      if (!quiet) {
        // eslint-disable-next-line no-console
        console.log(
          `Successfully generated ${result.filesGenerated} typings for external artifacts!`,
        );
      }
    }
    for (const file of allFiles) {
      rmSync(file.replace(/_sol_abi\.json$/, '.json'));
    }
  },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFQNamesFromCompilationOutput(compileSolOutput: any): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFQNNamesNested = compileSolOutput.artifactsEmittedPerJob.map((a: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a.artifactsEmittedPerFile.map((artifactPerFile: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artifactPerFile.artifactsEmitted.map((artifactName: any) =>
        getFullyQualifiedName(artifactPerFile.file.sourceName, artifactName),
      ),
    ),
  );

  return allFQNNamesNested.flat(2);
}
