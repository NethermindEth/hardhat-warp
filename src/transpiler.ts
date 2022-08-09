import {exec} from 'child_process';
import {readFileSync} from 'fs';

export class Transpiler {
  constructor(private _pathToWarp: string) {}

  public async getContractNames(inputPath: string) {
    const plainSolCode = readFileSync(inputPath, 'utf-8');
    const solCode = plainSolCode.split('\n');

    const contracts = solCode.map((line) => {
      // eslint-disable-next-line no-unused-vars
      const [contract, name, ...other] = line.split(new RegExp('[ ]+'));
      if (contract !== 'contract') return '';
      return name;
    }).filter((val) => val !== '');
    return contracts;
  }

  public async transpile(inputPath: string) {
    const output: string = await new Promise((resolve, reject) => {
      console.log(`Compiling ${inputPath}`);
      const process = exec(
          `${this._pathToWarp} transpile ${inputPath}`,
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

  public async deploy(contractPath: string, parameters: string, testnet: boolean, wallet: string) {
    let command = `${this._pathToWarp} deploy ${contractPath} --inputs ${parameters}`;
    command = command.concat(` --network ${testnet ? 'alpha-goerli' : 'alpha-mainnet'}`);
    command = command.concat((wallet === 'noWallet') ? ' --no_wallet' : ` --wallet ${wallet}`);
    console.log(command);
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
