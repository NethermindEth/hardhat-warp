export class HashInfo {
  private solidityFile: string;
  private hash: string;

  constructor(solidityFile: string, hash: string) {
    this.solidityFile = solidityFile;
    this.hash = hash;
  }

  getSolidityFile() {
    return this.solidityFile;
  }

  getHash() {
    return this.hash;
  }

  setHash(hash: string) {
    this.hash = hash;
  }
}
