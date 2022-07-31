import {NomicLabsHardhatPluginError} from 'hardhat/plugins';
import 'colors';

export class WarpPluginError extends NomicLabsHardhatPluginError {
  constructor(message: string, parent?: Error, shouldBeReported?: boolean) {
    super('hardhat-warp', message, parent, shouldBeReported);
  }
}

export function colorLogger(str: any) {
  console.log(str.blue.bold);
}

