import { hexDataLength } from "ethers/lib/utils";
import { Account } from "starknet";
import { Wallet } from "../../node_modules/ethers";

export class WarpSigner extends Wallet {
  ethersSigner: Wallet;
  starkNetSigner: Account;

  constructor(ethersSigner: Wallet, starkNetSigner: Account) {
    super("0x2d3D958026b1Bf6Ad894A19ecFbba243c567738C2d3D958026b1Bf6Ad894A191");
    this.ethersSigner = ethersSigner;
    this.starkNetSigner = starkNetSigner;
  }
}
