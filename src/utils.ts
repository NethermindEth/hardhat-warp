import {NomicLabsHardhatPluginError} from 'hardhat/plugins';
import 'colors';
import {Contract} from './Contract';
import * as fs from 'fs';

export class WarpPluginError extends NomicLabsHardhatPluginError {
  constructor(message: string, parent?: Error, shouldBeReported?: boolean) {
    super('hardhat-warp', message, parent, shouldBeReported);
  }
}

export function colorLogger(str: any) {
  console.log(str.blue.bold);
}

export function saveContract(contract: Contract) {
  const contractsMap: Map<string, Contract> = new Map<string, Contract>();
  if (fs.existsSync('warp_output/contracts.json')) {
    // const readData = fs.readFileSync('contracts.json', 'utf-8');
  }
  contractsMap.set(contract.getName(), contract);
  const data = Object.fromEntries(contractsMap);
  fs.writeFileSync('warp_output/contracts.json', JSON.stringify(data));
}
