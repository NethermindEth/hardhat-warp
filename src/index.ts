import {Transpiler} from './transpiler';
import {task, types} from 'hardhat/config';

task('transpile')
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

task('test')
    .setAction(async () => console.log('Yeah this is a test'));
