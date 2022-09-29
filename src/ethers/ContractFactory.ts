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
import { encode } from "../transcode";
import { readFileSync } from "fs";
import { getStarknetContractFactory } from "../testing";

const declaredContracts: Set<string> = new Set();

export class ContractFactory {
  readonly interface: Interface;
  readonly bytecode: string;
  readonly signer: Signer;
  pathToCairoFile: string;

  constructor(
    private starknetContractFactory: StarknetContractFactory,
    private ethersContractFactory: EthersContractFactory,
    pathToCairoFile: string
  ) {
    this.interface = ethersContractFactory.interface;
    this.bytecode = ethersContractFactory.bytecode;
    this.signer = ethersContractFactory.signer; // Todo use starknet signers if possible
    this.pathToCairoFile = pathToCairoFile;
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

  getContractsToDeclare() {
    const declareRegex = /\/\/\s@declare\s(.*)/;
    const cairoFile = readFileSync(this.pathToCairoFile, "utf-8");
    const lines = cairoFile.split("\n");

    const declares = lines
      .map((l) => {
        const ma = l.match(declareRegex);
        return ma ? ma[1] : null;
      })
      .filter((d): d is string => !!d);

    return declares.map((v) => v.split("__").slice(-1)[0].split(".")[0]);
  }

  async deploy(...args: Array<any>): Promise<EthersContract> {
    const contractsToDeclare = this.getContractsToDeclare()
    console.log(contractsToDeclare);
    const fact = contractsToDeclare.filter(c => {
      if (declaredContracts.has(c)) {
        return false;
      }
      declaredContracts.add(c);
      return true;
    }).map((c) => getStarknetContractFactory(c));

    const declareTransactions = await Promise.all(fact.map((c) =>
      this.starknetContractFactory.providerOrAccount.declareContract({
        contract: c.compiledContract,
    })))
    console.log("Declared");

    const inputs = encode(
      this.interface.deploy.inputs,
      args,
    )

    const starknetContract = await this.starknetContractFactory.deploy(inputs);
    console.log("deploying", this.pathToCairoFile)
    console.log(starknetContract.deployTransactionHash)
    await starknetContract.deployed()
    const contract = new WarpContract(
      starknetContract,
      this.starknetContractFactory,
      this.ethersContractFactory,
      this.pathToCairoFile
    );
    console.log("deployed");
    return contract;
  }

  attach(address: string): EthersContract {
    const starknetContract = this.starknetContractFactory.attach(address);
    const contract = new WarpContract(
      starknetContract,
      this.starknetContractFactory,
      this.ethersContractFactory,
      this.pathToCairoFile
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
