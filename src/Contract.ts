import path from 'path';
import {GatewayError, ContractFactory as StarknetContractFactory, CallContractResponse,Contract as StarknetContract} from "starknet";
import BN from 'bn.js';
import {BigNumberish, Contract as EthersContract,
  ContractFactory as EthersContractFactory,  ContractFunction,  
  PopulatedTransaction,  Signer, Event, ContractInterface, BigNumber} from "ethers";
import {FormatTypes, FunctionFragment, Indexed, Interface, keccak256, ParamType} from 'ethers/lib/utils';
import {BlockTag, EventFilter, Listener, Provider, TransactionRequest, TransactionResponse} from '@ethersproject/abstract-provider';
import {parse, TypeNode} from "solc-typed-ast"
import {decode, encodeValue, encodeValueOuter, SolValue} from './encode';


const ASSERT_ERROR = "An ASSERT_EQ instruction failed"

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
      this.solidityCairoRemap()
    }

    static getContractAddress(transaction: { from: string, nonce: BigNumberish }): string {
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

    private format(paramType: ParamType): string {
      if (paramType.type === "tuple") {
        return `tuple(${paramType.components.map(this.format).join(",")})`;
      } else if (paramType.arrayChildren !== null) {
        return `${this.format(paramType.arrayChildren)}[${paramType.arrayLength >= 0 ? paramType.arrayLength : ""}]`;
      } else {
        return paramType.type;
      }
    }
    private buildDefault(solName : string, fragment : FunctionFragment) {
        if (fragment.constant) {
          return this.buildCall(solName, fragment);
        }

      const inputTypeNodes = fragment.inputs.map((tp) => {
        const res = parse(this.format(tp), {ctx : undefined, version : undefined}) as TypeNode
        return res
      })

      const cairoFuncName = solName + "_" + this.interface.getSighash(fragment).slice(2) // Todo finish this keccak (use web3)
      // @ts-ignore
      return async (...args : any[]) => {
        const calldata = args.flatMap((arg, i) => encodeValueOuter(inputTypeNodes[i], this.argStringifier(arg), "we don't care"));
        console.log(calldata)
        try {
          const invokeOptions = {
              contractAddress: this.starknetContract.address,
              calldata,
              entrypoint: cairoFuncName,
            };
          const output_before = await this.starknetContract.providerOrAccount.callContract(invokeOptions,
            { blockIdentifier: 'pending'}
        )
        const output =  this.parseResponse(fragment.outputs, output_before.result)
        // Do an invoke to make state change
        const invokeResponse = await this.starknetContract.providerOrAccount.invokeFunction(invokeOptions);
        await this.starknetContract.providerOrAccount.waitForTransaction(invokeResponse.transaction_hash);
        return output
        } catch (e) {
          if (e instanceof GatewayError) {
            if (e.message.includes(ASSERT_ERROR)) {
            } else {
              throw e;
            }
          } else {
            throw e;
          }
        }
      };

    }
    private buildCall(solName : string, fragment : FunctionFragment) {
      const inputTypeNodes = fragment.inputs.map((tp) => parse(this.format(tp), {ctx : undefined, version : undefined}) as TypeNode)

      const cairoFuncName = solName + "_" + this.interface.getSighash(fragment).slice(2) // Todo finish this keccak (use web3)
      // @ts-ignore
      return async (...args : any[]) => {
        const calldata = args.flatMap((arg, i) => encodeValueOuter(inputTypeNodes[i], this.argStringifier(arg), "we don't care"));
        console.log(calldata)
        try {
          const output_before = await this.starknetContract.providerOrAccount.callContract(
            {
              contractAddress: this.starknetContract.address,
              calldata,
              entrypoint: cairoFuncName,
            },
            { blockIdentifier: 'pending'}
        )
        const output =  this.parseResponse(fragment.outputs, output_before.result)
        return output
        } catch (e) {
          if (e instanceof GatewayError) {
            if (e.message.includes(ASSERT_ERROR)) {
            } else {
              throw e;
            }
          } else {
            throw e;
          }
        }
      };
    }

    private wrap([funcname, fragment]: [string, FunctionFragment]) {
      const solName = funcname.split("(")[0]

      // @ts-ignore
      this[solName] = this.buildDefault(solName, fragment);

      this.functions[funcname] = this.buildDefault(solName, fragment);

      this.callStatic[funcname] = this.buildCall(solName, fragment);
    }

    private parseResponse(returnTypes : ParamType[] | undefined, result : string[]) {
      if (returnTypes === undefined) return [];
      return decode(returnTypes, result)
    }

    private solidityCairoRemap() {
      Object.entries(this.interface.functions).forEach(
        this.wrap.bind(this)
      );
    }
}
