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
  const contracts = [contract];
  if (fs.existsSync('warp_output/contracts.json')) {
    const readData = fs.readFileSync('warp_output/contracts.json', 'utf-8');
    const existingData = JSON.parse(readData) as Contract[];
    existingData.forEach((ctr) => {
      const temp = new Contract('', '');
      Object.assign(temp, ctr);
      if (temp.getName() !== contract.getName()) contracts.push(temp);
    });
  }
  fs.writeFileSync('warp_output/contracts.json', JSON.stringify(contracts));
}
