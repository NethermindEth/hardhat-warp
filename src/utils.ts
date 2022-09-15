import {NomicLabsHardhatPluginError} from 'hardhat/plugins';
import 'colors';
import {ContractInfo} from './Contract';
import {HashInfo} from './Hash';
import * as fs from 'fs';

export class WarpPluginError extends NomicLabsHardhatPluginError {
  constructor(message: string, parent?: Error, shouldBeReported?: boolean) {
    super('hardhat-warp', message, parent, shouldBeReported);
  }
}

export function colorLogger(str: any) {
  console.log(str.blue.bold);
}

export function checkHash(hash: HashInfo) {
  const hashes = [hash];
  let needToCompile = true;

  if (!fs.existsSync('warp_output')) {
    fs.mkdirSync('warp_output');
  }

  if (fs.existsSync('warp_output/hash.json')) {
    const readData = fs.readFileSync('warp_output/hash.json', 'utf-8');
    const existingData = JSON.parse(readData) as HashInfo[];
    existingData.forEach((ctr) => {
      const temp = new HashInfo('', '');
      Object.assign(temp, ctr);
      if (temp.getSolidityFile() === hash.getSolidityFile()) {
        if (temp.getHash() === hash.getHash()) {
          needToCompile = false;
        }
      } else {
        hashes.push(temp);
      }
    });
  }

  fs.writeFileSync('warp_output/hash.json', JSON.stringify(hashes));
  return needToCompile;
}

export function saveContract(contract: ContractInfo) {
  const contracts = [contract];
  if (fs.existsSync('warp_output/contracts.json')) {
    const readData = fs.readFileSync('warp_output/contracts.json', 'utf-8');
    const existingData = JSON.parse(readData) as ContractInfo[];
    existingData.forEach((ctr) => {
      const temp = new ContractInfo('', '', []);
      Object.assign(temp, ctr);
      if (temp.getName() !== contract.getName()) contracts.push(temp);
    });
  }
  fs.writeFileSync('warp_output/contracts.json', JSON.stringify(contracts));
}

export function getContract(contractName: string) {
  if (!fs.existsSync('warp_output/contracts.json')) {
    throw new WarpPluginError('No Starknet contracts found. Please run hardhat compile');
  }

  const readData = fs.readFileSync('warp_output/contracts.json', 'utf-8');
  const existingData = JSON.parse(readData) as ContractInfo[];
  const contracts = existingData.map((ctr) => {
    const temp = new ContractInfo('', '');
    Object.assign(temp, ctr);
    return temp;
  });
  const res = contracts.find((ctr) => {
    return ctr.getName() === contractName;
  });

  if (res === undefined) {
    throw new WarpPluginError('Given object was not found in Starknet contracts.');
  }

  return res;
}
