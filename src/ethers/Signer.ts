import { Account } from 'starknet';
import { Wallet } from 'ethers';
import { normalizeAddress } from '../utils';

export class WarpSigner extends Wallet {
  starkNetSigner: Account;

  constructor(starkNetSigner: Account) {
    // We don't care what the key is - this is random and has no meaning
    super('0x2d3D958026b1Bf6Ad894A19ecFbba243c567738C2d3D958026b1Bf6Ad894A191');
    this.starkNetSigner = starkNetSigner;
    // @ts-ignore we need to overwrite the address
    this.address = normalizeAddress(starkNetSigner.address);
    starkNetSigner.address = normalizeAddress(starkNetSigner.address);
  }
}
