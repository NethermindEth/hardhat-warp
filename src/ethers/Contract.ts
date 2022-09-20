import path from 'path';
import {InvocationsDetails, GatewayError, Event as StarknetEvent, ContractFactory as StarknetContractFactory, SequencerProvider, Contract as StarknetContract, ProviderInterface, InvokeFunctionResponse, InvokeTransactionReceiptResponse} from "starknet";
import {BigNumberish, Contract as EthersContract,
  ContractFactory as EthersContractFactory,  ContractFunction,  
  PopulatedTransaction,  Signer, Event, BigNumber, ContractTransaction} from "ethers";
import {FunctionFragment, Indexed, ParamType} from 'ethers/lib/utils';
import {BlockTag, EventFilter, Listener, Provider, Log, TransactionRequest, TransactionResponse} from '@ethersproject/abstract-provider';
import {parse, TypeNode} from "solc-typed-ast"
import {decode, encodeValueOuter, SolValue} from '../encode';
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

    private starknetProvider: SequencerProvider;
    constructor(private starknetContract : StarknetContract, private starknetContractFactory : StarknetContractFactory, private ethersContractFactory : EthersContractFactory) {
      super(
        starknetContract.address, ethersContractFactory.interface, ethersContractFactory.signer)
      this.functions = starknetContract.functions;
      this.callStatic = starknetContract.callStatic;
      this.estimateGas = starknetContract.estimateGas;
      this.populateTransaction = starknetContract.populateTransaction;
      this.resolvedAddress = Promise.resolve(starknetContract.address);
      this._deployedPromise = Promise.resolve(this);
      // @ts-ignore
      this.starknetProvider = starknetContract.providerOrAccount.provider as SequencerProvider;
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
        return this.buildInvoke(solName, fragment);
    }

    private buildInvoke(solName : string, fragment : FunctionFragment) {
      const inputTypeNodes = fragment.inputs.map((tp) => {
        const res = parse(this.format(tp), {ctx : undefined, version : undefined}) as TypeNode
        return res
      })
      const cairoFuncName = solName + "_" + this.interface.getSighash(fragment).slice(2) // Todo finish this keccak (use web3)

      return async (...args : any[]) => {
        const calldata = args.flatMap((arg, i) => encodeValueOuter(inputTypeNodes[i], this.argStringifier(arg), "we don't care"));
        console.log(calldata)
        try {
          const invokeResponse = await this.starknetContract.providerOrAccount.invokeFunction({
            contractAddress: this.starknetContract.address,
            calldata,
            entrypoint: cairoFuncName,
          }, {});
          return this.toEtheresTransactionResponse(
            invokeResponse, this.ethersContractFactory.interface.encodeFunctionData(fragment, args)
          )
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
      }

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
            'pending'
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

    private async toEtheresTransactionResponse({transaction_hash}: InvokeFunctionResponse, data: string): Promise<ContractTransaction> {
      console.log(this.starknetProvider)
      const txStatus = await this.starknetProvider.getTransactionStatus(transaction_hash)

      if (txStatus.tx_status === "REJECTED" || txStatus.tx_status === "NOT_RECEIVED") {
        // Handle failure case
        throw new Error("Failed transactions not supported yet")
      }
      const txResponse = await this.starknetProvider.getTransaction(transaction_hash)
      const txBlock = await this.starknetProvider.getBlock(txStatus.block_hash)
      const latestBlock = await this.starknetProvider.getBlock()

      return {
        hash: txResponse.transaction_hash as string,
        blockNumber: txBlock.block_number,
        confirmations: latestBlock.block_number - txBlock.block_number,
        from: "Unkown sender", // TODO: Fetch this from the transaction trace,

        gasLimit: BigNumber.from(txResponse.max_fee || "0x" + FIELD_PRIME),
        nonce: txResponse.nonce ? parseInt(txResponse.nonce) : -1,
        data: data,
        value: BigNumber.from(-1),
        chainId: -1,
        wait: async (confirmations: number | undefined) => {
          this.starknetProvider.waitForTransaction(transaction_hash)
          const txStatus = await this.starknetProvider.getTransactionStatus(transaction_hash)
          const txBlock = await this.starknetProvider.getBlock(txStatus.block_hash)
          const txTrace = await this.starknetProvider.getTransactionTrace(transaction_hash)
          const txReceipt = await this.starknetProvider.getTransactionReceipt(transaction_hash) as InvokeTransactionReceiptResponse;
          const latestBlock = await this.starknetProvider.getBlock()
          return Promise.resolve({
            to: txTrace.function_invocation.contract_address,
            from: txTrace.function_invocation.caller_address,
            contractAddress: txTrace.function_invocation.contract_address,

            blockHash: txBlock.block_hash,
            blockNumber: txBlock.block_number,
            confirmations: latestBlock.block_number - txBlock.block_number,

            transactionIndex: -1, // TODO: find out how to pull this from starknet
            transactionHash: txReceipt.transaction_hash,

            gasUsed: BigNumber.from(
              0.05  * txTrace.function_invocation.execution_resources.n_steps + 
              25.60 * txTrace.function_invocation.execution_resources.builtin_instance_counter.ecdsa_builtin +
              0.40  * txTrace.function_invocation.execution_resources.builtin_instance_counter.range_check_builtin +
              12.80 * txTrace.function_invocation.execution_resources.builtin_instance_counter.bitwise_builtin +
              0.40  * txTrace.function_invocation.execution_resources.builtin_instance_counter.pedersen_builtin,
            ), // TODO make accurate
            cumulativeGasUsed: BigNumber.from(-1), // Doesn't make sense on starknet yet
            effectiveGasPrice: BigNumber.from(txReceipt.actual_fee),

            logsBloom: "", // TODO: error on access,
            logs: [], // TODO: parse logs from events,
            events: [], // TODO
            byzantium: true,
            type: 0 // TODO: check this is the right format
          })
        },
      }
    }
    private starknetEventsToEthLogs(starknetEvent: StarknetEvent[]): Log[] {
      this.ethersContractFactory.interface.events
      this.starknetContract.abi
      // this.starknetContract.
      return []
    }
}

