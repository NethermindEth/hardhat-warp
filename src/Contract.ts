import path from 'path';
import {ContractFactory as StarknetContractFactory, Contract as StarknetContract} from "starknet";
import {BaseContract, BigNumber, BigNumberish, Contract as EthersContract,
  ContractFactory as EthersContractFactory,  ContractFunction,  
  PopulatedTransaction,  Signer, Event, ContractInterface} from "ethers"; import {Indexed, Interface} from
'ethers/lib/utils';
import {BlockTag, EventFilter, Listener, Provider, TransactionRequest, TransactionResponse} from '@ethersproject/abstract-provider';
import {parse, TypeNode} from "solc-typed-ast"
import {encodeValue, SolValue} from './encode';
export class ContractInfo {
  private name: string;
  private solidityFile: string;
  private deployedAddress = '';
  private deployTxHash = '';

  constructor(name: string, solidityFile: string) {
    this.name = name;
    this.solidityFile = solidityFile;
  }

  getName() {
    return this.name;
  }

  getSolidityFile() {
    return this.solidityFile;
  }

  setDeployedAddress(add: string) {
    this.deployedAddress = add;
  }

  setDeployTxHash(hash: string) {
    this.deployTxHash = hash;
  }

  getCairoFile() {
    const cairoFile = this.solidityFile.slice(0, -4)
        .replaceAll('_', '__')
        .replaceAll('-', '_')
        .concat(`__WC__${this.name}.cairo`);
    return path.join('warp_output', cairoFile);
  }

  getCompiledJson() {
    return this.getCairoFile().slice(0, -6).concat('_compiled.json');
  }
}

export class WarpContract extends EthersContract {

    readonly functions: { [ name: string ]: ContractFunction };

    readonly callStatic: { [ name: string ]: ContractFunction };
    readonly estimateGas: { [ name: string ]: ContractFunction<BigNumber> };
    readonly populateTransaction: { [ name: string ]: ContractFunction<PopulatedTransaction> };

    // This will always be an address. This will only differ from
    // address if an ENS name was used in the constructor
    readonly resolvedAddress: Promise<string>;

    constructor(private starknetContract : StarknetContract, private starknetContractFactory : StarknetContractFactory, private ethersContractFactory : EthersContractFactory) {
      super(
        starknetContract.address, ethersContractFactory.interface, ethersContractFactory.signer)
      this.functions = starknetContract.functions;
      this.callStatic = starknetContract.callStatic;
      this.estimateGas = starknetContract.estimateGas;
      this.populateTransaction = starknetContract.populateTransaction;
      this.resolvedAddress = Promise.resolve(starknetContract.address);
      this._deployedPromise = Promise.resolve(this);
    }

    static getContractAddress(transaction: { from: string, nonce: BigNumberish }): string {
      throw new Error("Not implemented yet");
    }

    static getInterface(contractInterface: ContractInterface): Interface {
      throw new Error("Not implemented yet");
    }

    // @TODO: Allow timeout?
    deployed(): Promise<EthersContract> {
      return Promise.resolve(this);
    }

    _deployed(blockTag?: BlockTag): Promise<EthersContract> {
      return Promise.resolve(this);
    }

    fallback(overrides?: TransactionRequest): Promise<TransactionResponse> {
      throw new Error("Not implemented yet");
    }

    // Reconnect to a different signer or provider
    connect(signerOrProvider: Signer | Provider | string): EthersContract {
      throw new Error("Not implemented yet");
    }

    // Re-attach to a different on-chain instance of this contract
    attach(addressOrName: string): EthersContract {
      this.starknetContract.attach(addressOrName);
      return this;
    }

    static isIndexed(value: any): value is Indexed {
      throw new Error("Not implemented yet");
    }

    queryFilter(event: EventFilter | string, fromBlockOrBlockhash?: BlockTag | string, toBlock?: BlockTag): Promise<Array<Event>> {
      throw new Error("Not implemented yet");
    }

    on(event: EventFilter | string, listener: Listener): this {
      throw new Error("Not implemented yet");
    }

    once(event: EventFilter | string, listener: Listener): this {
      throw new Error("Not implemented yet");
    }

    emit(eventName: EventFilter | string, ...args: Array<any>): boolean {
      throw new Error("Not implemented yet");
    }

    listenerCount(eventName?: EventFilter | string): number {
      throw new Error("Not implemented yet");
    }

    listeners(eventName?: EventFilter | string): Array<Listener> {
      throw new Error("Not implemented yet");
    }

    removeAllListeners(eventName?: EventFilter | string): this {
      throw new Error("Not implemented yet");
    }

    off(eventName: EventFilter | string, listener: Listener): this {
      throw new Error("Not implemented yet");
    }

    removeListener(eventName: EventFilter | string, listener: Listener): this {
      throw new Error("Not implemented yet");
    }

    private argStringifier(arg: any) : SolValue {
      return Array.isArray(arg) ? arg.map(this.argStringifier) : arg.toString();
    }

    private wrap(funcname : string, signature : string, inputTypes: string[], outputTypes: string[]) {
      const functionToWrap : (...args : any) => Promise<any> = this[signature];
      const inputTypeNodes = inputTypes.map((tp) => parse(tp, {ctx : undefined, version : undefined}) as TypeNode)
      const outputTypeNodes = outputTypes.map((tp) => parse(tp, {ctx : undefined, version : undefined}) as TypeNode)

      // @ts-ignore
      this[signature] = async (...args : any[]) => {
        return await this.starknetContract[](
          ...args.map((arg, i) => encodeValue(inputTypeNodes[i], this.argStringifier(arg), "we don't care").flat())
        )
      };

      this.functions[signature]

      this.callStatic[signature]
    }

    private solidityCairoRemap() {
      Object.entries(this.interface.functions).forEach(
        ([funcName, abiElement]) => {
          const inputTypes = abiElement.inputs.map((pt) => pt.type);
          const outputTypes = abiElement.outputs?.map((pt) => pt.type) || [];
          const signature = abiElement.type;
          this.wrap(funcName, signature, inputTypes, outputTypes)
        });
    }
}
