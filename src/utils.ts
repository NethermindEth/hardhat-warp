import {NomicLabsHardhatPluginError} from 'hardhat/plugins';

export class WarpPluginError extends NomicLabsHardhatPluginError {
  constructor(message: string, parent?: Error, shouldBeReported?: boolean) {
    super('hardhat-warp', message, parent, shouldBeReported);
  }
}
