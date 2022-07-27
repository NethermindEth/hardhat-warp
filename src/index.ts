import {
  TASK_COMPILE_GET_COMPILATION_TASKS, TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
} from 'hardhat/builtin-tasks/task-names';
import {subtask, types} from 'hardhat/config';
import {glob} from 'hardhat/internal/util/glob';
import path from 'path';
import {
  TASK_COMPILE_WARP,
  TASK_COMPILE_WARP_RUN_BINARY,
} from './task-names';
import {Transpiler} from './transpiler';

subtask(
    TASK_COMPILE_GET_COMPILATION_TASKS,
    async (_, __, runSuper): Promise<string[]> => {
      const otherTasks = await runSuper();
      return [...otherTasks, TASK_COMPILE_WARP];
    },
);

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, undefined,
    async (_, {config}): Promise<string[]> => {
      const solPaths = await glob(path.join(config.paths.root, 'contracts/**/*.sol'));
      const cairoPaths = await glob(path.join(config.paths.root, 'contracts/**/*.cairo.sol'));

      return solPaths.filter((x) => !cairoPaths.includes(x));
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

          const result = await transpiler.transpile(contract);

          return result;
        },
    );
