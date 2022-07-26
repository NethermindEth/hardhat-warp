import {Transpiler} from './transpiler';
import {subtask, types} from 'hardhat/config';
import {TASK_COMPILE_GET_COMPILATION_TASKS}
  from 'hardhat/builtin-tasks/task-names';
import {TASK_COMPILE_WARP, TASK_COMPILE_WARP_RUN_BINARY} from './task-names';

subtask(
    TASK_COMPILE_GET_COMPILATION_TASKS,
    async (_, __, runSuper): Promise<string[]> => {
      const otherTasks = await runSuper();
      return [...otherTasks, TASK_COMPILE_WARP];
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
