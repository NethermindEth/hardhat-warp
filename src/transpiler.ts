import {execSync} from 'child_process';
import {readFileSync} from 'fs';

export class Transpiler {
  constructor(private _pathToWarp: string) {}

  public async getContractNames(inputPath: string) {
    const plainSolCode = readFileSync(inputPath, 'utf-8');
    const solCode = plainSolCode.split('\n');

    const contracts = solCode.map((line) => {
      const [contract, name] = line.split(new RegExp('[ ]+'));
      if (contract !== 'contract') return '';
      return name;
    }).filter((val) => val !== '');
    return contracts;
  }

  public transpile(inputPath: string) {
    console.log(`Compiling: ${inputPath}`);
    console.log(this._pathToWarp)
    execSync(`${this._pathToWarp} transpile ${inputPath} --compile-cairo`, {stdio: 'inherit'});
  }
}
