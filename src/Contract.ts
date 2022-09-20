import path from 'path';
import {GatewayError, ContractFactory as StarknetContractFactory, CallContractResponse, SuccessfulTransactionResponse, Contract as StarknetContract, AddTransactionResponse, InvokeFunctionTransactionResponse, ProviderInterface, SuccessfulTransactionReceiptResponse} from "starknet";
import BN from 'bn.js';
import {BigNumberish, Contract as EthersContract,
  ContractFactory as EthersContractFactory,  ContractFunction,  
  PopulatedTransaction,  Signer, Event, ContractInterface, BigNumber} from "ethers";
import {FormatTypes, FunctionFragment, Indexed, Interface, keccak256, ParamType} from 'ethers/lib/utils';
import {BlockTag, EventFilter, Listener, Provider, TransactionRequest} from '@ethersproject/abstract-provider';
import {parse, TypeNode} from "solc-typed-ast"
import {decode, encodeValue, encodeValueOuter, SolValue} from './encode';
import {FIELD_PRIME} from 'starknet/dist/constants';


const ASSERT_ERROR = "An ASSERT_EQ instruction failed"

export class ContractInfo {
  private name: string;
  private solidityFile: string;
  private deployedAddress = '';
  private deployTxHash = '';
  private cairoFiles: string[];

  constructor(name: string, solidityFile: string, cairoFile: string[] = []) {
    this.name = name;
    this.solidityFile = solidityFile;
    this.cairoFiles = cairoFile;
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

    private starknetProvider: ProviderInterface;
    constructor(private starknetContract : StarknetContract, private starknetContractFactory : StarknetContractFactory, private ethersContractFactory : EthersContractFactory) {
      super(
        starknetContract.address, ethersContractFactory.interface, ethersContractFactory.signer)
      this.functions = starknetContract.functions;
      this.callStatic = starknetContract.callStatic;
      this.estimateGas = starknetContract.estimateGas;
      this.populateTransaction = starknetContract.populateTransaction;
      this.resolvedAddress = Promise.resolve(starknetContract.address);
      this._deployedPromise = Promise.resolve(this);
      this.starknetProvider = starknetContract.providerOrAccount as ProviderInterface;
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

      this.functions[solName] = this.buildDefault(solName, fragment);

      this.callStatic[solName] = this.buildCall(solName, fragment);
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

    private async toEtheresTransactionResponse(transactionResponse: AddTransactionResponse, data: string): Promise<TransactionResponse> {
      await this.starknetProvider.waitForTransaction(transactionResponse.transaction_hash)
      const getTransactionResponse = await this.starknetProvider.getTransaction(transactionResponse.transaction_hash)
      if (getTransactionResponse.status === "REJECTED" || getTransactionResponse.status === "NOT_RECEIVED" || getTransactionResponse.status === "RECEIVED") {
        // Handle failure case
        throw new Error("Failed transactions not supported yet")
      } else {
        const invokeFunctionResponse = getTransactionResponse.transaction as InvokeFunctionTransactionResponse;

        const invokeFunctionRecepit = await this.starknetProvider.getTransactionReceipt(transactionResponse.transaction_hash) as SuccessfulTransactionReceiptResponse;
        return {
          hash: transactionResponse.transaction_hash,

          blockNumber: getTransactionResponse.block_number as number, // TODO: this doesn't work for 'pending' and 'latest'

          confirmations: getTransactionResponse.status === "PENDING" ? 0 : Infinity,

          from: "Unkown sender", // TODO: Fetch this from the transaction trace,

          wait: (confirmations: number | undefined) => {
            this.starknetProvider.waitForTransaction(transactionResponse.transaction_hash)
            return Promise.resolve({
              to: invokeFunctionResponse.contract_address,
              from: "Unkown sender", // TODO: get sender from trace
              contractAddress: invokeFunctionResponse.contract_address,
              transactionIndex: getTransactionResponse.transaction_index,
              gasUsed: BigNumber.from(invokeFunctionRecepit.execution_resources.n_steps),
              logsBloom: "", // TODO: error on access,
              blockHash: invokeFunctionRecepit.block_hash,
              transactionHash: invokeFunctionRecepit.transaction_hash,
              logs: [], // TODO: parse logs from events,
              blockNumber: invokeFunctionRecepit.block_number as number,
              confirmations: 9999999,
              cumulativeGasUsed: BigNumber.from(invokeFunctionRecepit.execution_resources.n_steps),
              effectiveGasPrice: BigNumber.from(invokeFunctionRecepit.actual_fee),
              byzantium: true,
              type: 0 // TODO: check this is the right format
            })
          },

          gasLimit: BigNumber.from(invokeFunctionResponse.max_fee || "0x" + FIELD_PRIME),
          nonce: invokeFunctionResponse.nonce?.valueOf() as number || -1,
          data: data,
          value: BigNumber.from(-1),
          chainId: -1,
        }
      }
    }
}


export interface Transaction {
    hash?: string;

    to?: string;
    from?: string;
    nonce: number;

    gasLimit: BigNumber;
    gasPrice?: BigNumber;

    data: string;
    value: BigNumber;
    chainId: number;

    r?: string;
    s?: string;
    v?: number;

    // Typed-Transaction features
    type?: number | null;

    // EIP-2930; Type 1 & EIP-1559; Type 2
    accessList?: AccessList;

    // EIP-1559; Type 2
    maxPriorityFeePerGas?: BigNumber;
    maxFeePerGas?: BigNumber;
}


export interface ContractTransaction extends TransactionResponse {
    wait(confirmations?: number): Promise<ContractReceipt>;
}

export interface ContractReceipt extends TransactionReceipt {
    events?: Array<Event>;
}

export interface TransactionResponse extends Transaction {
    hash: string;

    // Only if a transaction has been mined
    blockNumber?: number,
    blockHash?: string,
    timestamp?: number,

    confirmations: number,

    // Not optional (as it is in Transaction)
    from: string;

    // The raw transaction
    raw?: string,

    // This function waits until the transaction has been mined
    wait: (confirmations?: number) => Promise<TransactionReceipt>
};

export interface TransactionReceipt {
    to: string;
    from: string;
    contractAddress: string,
    transactionIndex: number,
    root?: string,
    gasUsed: BigNumber,
    logsBloom: string,
    blockHash: string,
    transactionHash: string,
    logs: Array<Log>,
    blockNumber: number,
    confirmations: number,
    cumulativeGasUsed: BigNumber,
    effectiveGasPrice: BigNumber,
    byzantium: boolean,
    type: number;
    status?: number
};

export interface Log {
    blockNumber: number;
    blockHash: string;
    transactionIndex: number;

    removed: boolean;

    address: string;
    data: string;

    topics: Array<string>;

    transactionHash: string;
    logIndex: number;
}

export type AccessList = Array<{ address: string, storageKeys: Array<string> }>;
