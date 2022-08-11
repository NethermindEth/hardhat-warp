import path from 'path';
export class ContractInfo {
  private name: string;
  private solidityFile: string;
  private deployedAddress = '';
  private deployTxHash = '';

  constructor(name: string, solidityFile: string) {
    this.name = name;
    this.solidityFile = solidityFile;
  }

  getName() {
    return this.name;
  }

  getSolidityFile() {
    return this.solidityFile;
  }

  setDeployedAddress(add: string) {
    this.deployedAddress = add;
  }

  setDeployTxHash(hash: string) {
    this.deployTxHash = hash;
  }

  getCairoFile() {
    const cairoFile = this.solidityFile.slice(0, -4).replace('_', '__').concat(`__WC__${this.name}.cairo`);
    return path.join('warp_output', cairoFile);
  }

  getCompiledJson() {
    return this.getCairoFile().slice(0, -6).concat('_compiled.json');
  }
}
