import {ContractFactory as StarknetContractFactory} from 'starknet';
import {BigNumber, BytesLike, ContractFactory as EthersContractFactory, Signer, Contract as EthersContract} from 'ethers';
import {Interface} from "@ethersproject/abi";
import {TransactionRequest} from "@ethersproject/abstract-provider";
import {ContractInterface} from "@ethersproject/contracts";
import {WarpContract} from './Contract';

export class ContractFactory {
    readonly interface: Interface;
    readonly bytecode: string;
    readonly signer: Signer;


    constructor(
      private starknetContractFactory : StarknetContractFactory,
      private ethersContractFactory : EthersContractFactory
    ) {
      this.interface = ethersContractFactory.interface;
      this.bytecode = ethersContractFactory.bytecode;
      this.signer = ethersContractFactory.signer;
    }

    // @TODO: Future; rename to populateTransaction?
    getDeployTransaction(...args: Array<any>): TransactionRequest {
      console.warn("getDeployTransaction not implemented for Starknet: using the Eth transaction instead");
      return this.ethersContractFactory.getDeployTransaction(...args);
    }

    async deploy(...args: Array<any>): Promise<EthersContract> {
      const starknetContract = this.starknetContractFactory.deploy(args);
      const contract = new WarpContract(await starknetContract, this.starknetContractFactory, this.ethersContractFactory);
      return contract;
    }

    attach(address: string): EthersContract {
      const starknetContract = this.starknetContractFactory.attach(address)
      const contract = new WarpContract(starknetContract, this.starknetContractFactory, this.ethersContractFactory);
      return contract;
    }

    connect(signer: Signer) {
      throw new Error("connect not yet supported")
    }

    static fromSolidity(compilerOutput: any, signer?: Signer): ContractFactory {
      throw new Error("fromSolidity not yet supported")
    }

    static getInterface(contractInterface: ContractInterface) {
      throw new Error("getInterface not yet supported")
    }

    static getContractAddress(tx: { from: string, nonce: BytesLike | BigNumber | number }): string {
      throw new Error("getContractAddress not supported")
    }

    static getContract(address: string, contractInterface: ContractInterface, signer?: Signer): EthersContract {
      throw new Error("getContract not supported")
    }
}
