import {exec, execSync} from 'child_process';
import {readFileSync} from 'fs';

export class Transpiler {
  constructor(private _pathToWarp: string) {}

  public transpile(inputPath: string) {
    console.log(`Compiling: ${inputPath}`);
    console.log(this._pathToWarp)
    execSync(`${this._pathToWarp} transpile ${inputPath} --compile-cairo`, {stdio: 'inherit'});
  }

  public async deploy(contractPath: string, parameters: string, testnet: boolean, wallet: string) {
    let command = `${this._pathToWarp} deploy ${contractPath} --inputs ${parameters}`;
    command = command.concat(` --network ${testnet ? 'alpha-goerli' : 'alpha-mainnet'}`);
    command = command.concat((wallet === 'noWallet') ? ' --no_wallet' : ` --wallet ${wallet}`);
    // console.log(command);
    const output: string = await new Promise((resolve, reject) => {
      const process = exec(
          command,
          (error, stdout) => {
            if (error !== null) return reject(error);
            resolve(stdout);
          },
      );

      process.stdin!.end();
    });

    console.log(output);
    return output;
  }
}
