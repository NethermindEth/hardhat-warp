import { ContractFactory as StarknetContractFactory } from "starknet";
import {
  BigNumber,
  BytesLike,
  ContractFactory as EthersContractFactory,
  Signer,
  Contract as EthersContract,
  BigNumberish,
} from "ethers";
import { Interface } from "@ethersproject/abi";
import { TransactionRequest } from "@ethersproject/abstract-provider";
import { ContractInterface } from "@ethersproject/contracts";
import { WarpContract } from "./Contract";
import { BN } from "bn.js";
import { encodeValueOuter, paramTypeToTypeNode } from "./encode";

export class ContractFactory {
  readonly interface: Interface;
  readonly bytecode: string;
  readonly signer: Signer;

  constructor(
    private starknetContractFactory: StarknetContractFactory,
    private ethersContractFactory: EthersContractFactory
  ) {
    this.interface = ethersContractFactory.interface;
    this.bytecode = ethersContractFactory.bytecode;
    this.signer = ethersContractFactory.signer; // Todo use starknet signers if possible
  }

  // @TODO: Future; rename to populateTransaction?
  getDeployTransaction(...args: Array<any>): TransactionRequest {
    console.warn(
      "getDeployTransaction not implemented for Starknet: using the Eth transaction instead"
    );
    return this.ethersContractFactory.getDeployTransaction(...args);
  }

  debignumber(args: Array<any>): any {
    return args.map((arg) => {
      if (Array.isArray(arg)) return arg.map(this.debignumber);
      if (arg instanceof Object && arg._isBigNumber) {
        return arg.toHexString();
      }
      return arg;
    });
  }

  async deploy(...args: Array<any>): Promise<EthersContract> {
    const inputs = args
      .map((x) => x.toString())
      .flatMap((solValue, i) =>
        encodeValueOuter(
          paramTypeToTypeNode(this.interface.deploy.inputs[i]),
          solValue,
          "undefined"
        )
      );

    const starknetContract = await this.starknetContractFactory.deploy(inputs);
    const contract = new WarpContract(
      starknetContract,
      this.starknetContractFactory,
      this.ethersContractFactory
    );
    return contract;
  }

  attach(address: string): EthersContract {
    const starknetContract = this.starknetContractFactory.attach(address);
    const contract = new WarpContract(
      starknetContract,
      this.starknetContractFactory,
      this.ethersContractFactory
    );
    return contract;
  }

  connect(signer: Signer) {
    throw new Error("connect not yet supported");
  }

  static fromSolidity(compilerOutput: any, signer?: Signer): ContractFactory {
    throw new Error("fromSolidity not yet supported");
  }

  static getInterface(contractInterface: ContractInterface) {
    throw new Error("getInterface not yet supported");
  }

  static getContractAddress(tx: {
    from: string;
    nonce: BytesLike | BigNumber | number;
  }): string {
    throw new Error("getContractAddress not supported");
  }

  static getContract(
    address: string,
    contractInterface: ContractInterface,
    signer?: Signer
  ): EthersContract {
    throw new Error("getContract not supported");
  }
}

function toBN(value: BigNumberish) {
  const hex = BigNumber.from(value).toHexString();
  if (hex[0] === "-") {
    return new BN("-" + hex.substring(3), 16);
  }
  return new BN(hex.substring(2), 16);
}
