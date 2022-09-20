import path from "path";
import {
  GatewayError,
  Event as StarknetEvent,
  ContractFactory as StarknetContractFactory,
  SequencerProvider,
  Contract as StarknetContract,
  ProviderInterface,
  InvokeFunctionResponse,
  InvokeTransactionReceiptResponse,
  Event as StarkEvent,
} from "starknet";
import {
  BigNumberish,
  Contract as EthersContract,
  ContractFactory as EthersContractFactory,
  ContractFunction,
  PopulatedTransaction,
  Signer,
  Event,
  BigNumber,
  ContractTransaction,
} from "ethers";
import { FunctionFragment, Indexed, ParamType } from "ethers/lib/utils";
import {id as keccak} from "@ethersproject/hash";
import { EventFragment } from "@ethersproject/abi";
import {
  BlockTag,
  EventFilter,
  Listener,
  Provider,
  Log,
  TransactionRequest,
  TransactionResponse,
  Block,
} from "@ethersproject/abstract-provider";
import { parse, TypeNode } from "solc-typed-ast";
import { decode, encodeValueOuter, SolValue } from "./encode";
import { FIELD_PRIME } from "starknet/dist/constants";
import { starknetKeccak } from "starknet/dist/utils/hash";
import {readFileSync} from "fs";

const ASSERT_ERROR = "An ASSERT_EQ instruction failed";

export class ContractInfo {
  private name: string;
  private solidityFile: string;
  private deployedAddress = "";
  private deployTxHash = "";
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
    const cairoFile = this.solidityFile
      .slice(0, -4)
      .replaceAll("_", "__")
      .replaceAll("-", "_")
      .concat(`__WC__${this.name}.cairo`);
    return path.join("warp_output", cairoFile);
  }

  getCompiledJson() {
    return this.getCairoFile().slice(0, -6).concat("_compiled.json");
  }
}

export class WarpContract extends EthersContract {
  readonly functions: { [name: string]: ContractFunction };

  readonly callStatic: { [name: string]: ContractFunction };
  readonly estimateGas: { [name: string]: ContractFunction<BigNumber> };
  readonly populateTransaction: {
    [name: string]: ContractFunction<PopulatedTransaction>;
  };

  // This will always be an address. This will only differ from
  // address if an ENS name was used in the constructor
  readonly resolvedAddress: Promise<string>;

  snTopicToName: {[key :string]: string} = {};
  // ethTopic here referes to the keccak of "event_name + selector"
  // because that's the mangling that warp produces
  private ethTopicToEvent: {[key: string]: [EventFragment, string]} = {};

  private starknetProvider: SequencerProvider;
  constructor(
    private starknetContract: StarknetContract,
    private starknetContractFactory: StarknetContractFactory,
    private ethersContractFactory: EthersContractFactory,
    private pathToCairoFile: string,
  ) {
    super(
      starknetContract.address,
      ethersContractFactory.interface,
      ethersContractFactory.signer
    );
    this.functions = starknetContract.functions;
    this.callStatic = starknetContract.callStatic;
    this.estimateGas = starknetContract.estimateGas;
    this.populateTransaction = starknetContract.populateTransaction;
    this.resolvedAddress = Promise.resolve(starknetContract.address);
    this._deployedPromise = Promise.resolve(this);
    this.starknetProvider = starknetContract.providerOrAccount as SequencerProvider;
    this.solidityCairoRemap();

    const compiledCairo = JSON.parse(readFileSync(this.getCompiledCairoFile(), 'utf-8'));
    let eventsJson = compiledCairo?.abi?.filter((data: {[key: string]: any}) => data?.type === "event");
    eventsJson = eventsJson.map((e: any) => ({topic: starknetKeccak(e?.name), ...e}));
    eventsJson.forEach((e: any) => {
      this.snTopicToName[e.topic] = e.name;
    })

    Object.entries(this.ethersContractFactory.interface.events).forEach(([eventName, eventFragment]) => {
      const selector =keccak(eventFragment.format("sighash")); 
      const warpTopic = `${eventName}_${selector.slice(2)}`;
      this.ethTopicToEvent[warpTopic] = [eventFragment, selector];
    })
  }
  static getContractAddress(transaction: {
    from: string;
    nonce: BigNumberish;
  }): string {
    throw new Error("Not implemented yet");
  }

  getCompiledCairoFile() {
    return this.pathToCairoFile.slice(0, -6).concat("_compiled.json");
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

  queryFilter(
    event: EventFilter | string,
    fromBlockOrBlockhash?: BlockTag | string,
    toBlock?: BlockTag
  ): Promise<Array<Event>> {
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

  private argStringifier(arg: any): SolValue {
    return Array.isArray(arg) ? arg.map(this.argStringifier) : arg.toString();
  }

  private format(paramType: ParamType): string {
    if (paramType.type === "tuple") {
      return `tuple(${paramType.components.map(this.format).join(",")})`;
    } else if (paramType.arrayChildren !== null) {
      return `${this.format(paramType.arrayChildren)}[${
        paramType.arrayLength >= 0 ? paramType.arrayLength : ""
      }]`;
    } else {
      return paramType.type;
    }
  }
  private buildDefault(solName: string, fragment: FunctionFragment) {
    if (fragment.constant) {
      return this.buildCall(solName, fragment);
    }

    const inputTypeNodes = fragment.inputs.map((tp) => {
      const res = parse(this.format(tp), {
        ctx: undefined,
        version: undefined,
      }) as TypeNode;
      return res;
    });

    const cairoFuncName =
      solName + "_" + this.interface.getSighash(fragment).slice(2); // Todo finish this keccak (use web3)
    // @ts-ignore
    return async (...args: any[]) => {
      const calldata = args.flatMap((arg, i) =>
        encodeValueOuter(
          inputTypeNodes[i],
          this.argStringifier(arg),
          "we don't care"
        )
      );
      console.log(calldata);
      try {
        const invokeOptions = {
          contractAddress: this.starknetContract.address,
          calldata,
          entrypoint: cairoFuncName,
        };
        // Do an invoke to make state change
        const invokeResponse = await this.starknetContract.providerOrAccount.invokeFunction(
          invokeOptions
        );
        await this.starknetContract.providerOrAccount.waitForTransaction(
          invokeResponse.transaction_hash
        );
        return this.toEtheresTransactionResponse(
          invokeResponse,
          this.ethersContractFactory.interface.encodeFunctionData(
            fragment,
            args
          )
        );
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
  private buildCall(solName: string, fragment: FunctionFragment) {
    const inputTypeNodes = fragment.inputs.map(
      (tp) =>
        parse(this.format(tp), {
          ctx: undefined,
          version: undefined,
        }) as TypeNode
    );

    const cairoFuncName =
      solName + "_" + this.interface.getSighash(fragment).slice(2); // Todo finish this keccak (use web3)
    // @ts-ignore
    return async (...args: any[]) => {
      const calldata = args.flatMap((arg, i) =>
        encodeValueOuter(
          inputTypeNodes[i],
          this.argStringifier(arg),
          "we don't care"
        )
      );
      console.log(calldata);
      try {
        const output_before = await this.starknetContract.providerOrAccount.callContract(
          {
            contractAddress: this.starknetContract.address,
            calldata,
            entrypoint: cairoFuncName,
          },
          "pending"
        );
        const output = this.parseResponse(
          fragment.outputs,
          output_before.result
        );
        return output;
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
    const solName = funcname.split("(")[0];

    // @ts-ignore
    this[solName] = this.buildDefault(solName, fragment);

    this.functions[solName] = this.buildDefault(solName, fragment);

    this.callStatic[solName] = this.buildCall(solName, fragment);
  }

  private parseResponse(
    returnTypes: ParamType[] | undefined,
    result: string[]
  ) {
    if (returnTypes === undefined) return [];
    return decode(returnTypes, result);
  }

  private async toEtheresTransactionResponse(
    { transaction_hash }: InvokeFunctionResponse,
    data: string
  ): Promise<ContractTransaction> {
    const txStatus = await this.starknetProvider.getTransactionStatus(
      transaction_hash
    );

    if (
      txStatus.tx_status === "REJECTED" ||
      txStatus.tx_status === "NOT_RECEIVED"
    ) {
      // Handle failure case
      throw new Error("Failed transactions not supported yet");
    }
    const txResponse = await this.starknetProvider.getTransaction(
      transaction_hash
    );
    const txBlock = await this.starknetProvider.getBlock(txStatus.block_hash);
    const latestBlock = await this.starknetProvider.getBlock();

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
      wait: async (confirmations: number | undefined): Promise<ContractReceipt> => {
        this.starknetProvider.waitForTransaction(transaction_hash);
        const txStatus = await this.starknetProvider.getTransactionStatus(
          transaction_hash
        );
        const txBlock = await this.starknetProvider.getBlock(
          txStatus.block_hash
        );
        const txTrace = await this.starknetProvider.getTransactionTrace(
          transaction_hash
        );
        const txReceipt = (await this.starknetProvider.getTransactionReceipt(
          transaction_hash
        )) as InvokeTransactionReceiptResponse;
        const latestBlock = await this.starknetProvider.getBlock();


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
            0.05 * txTrace.function_invocation.execution_resources.n_steps +
              25.6 *
                txTrace.function_invocation.execution_resources
                  .builtin_instance_counter.ecdsa_builtin +
              0.4 *
                txTrace.function_invocation.execution_resources
                  .builtin_instance_counter.range_check_builtin +
              12.8 *
                txTrace.function_invocation.execution_resources
                  .builtin_instance_counter.bitwise_builtin +
              0.4 *
                txTrace.function_invocation.execution_resources
                  .builtin_instance_counter.pedersen_builtin
          ), // TODO make accurate
          cumulativeGasUsed: BigNumber.from(-1), // Doesn't make sense on starknet yet
          effectiveGasPrice: BigNumber.from(txReceipt.actual_fee),

          logsBloom: "", // TODO: error on access,
          logs: ethEvents,
          events: ethEvents,
          byzantium: true,
          type: 0, // TODO: check this is the right format
        } as ContractReceipt);
      },
    };
  }

  private solidityCairoRemap() {
    Object.entries(this.interface.functions).forEach(this.wrap.bind(this));
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

export interface ContractReceipt extends TransactionReceipt {
  events?: Array<Event>;
}

export interface TransactionReceipt {
  to: string;
  from: string;
  contractAddress: string;
  transactionIndex: number;
  root?: string;
  gasUsed: BigNumber;
  logsBloom: string;
  blockHash: string;
  transactionHash: string;
  logs: Array<Log>;
  blockNumber: number;
  confirmations: number;
  cumulativeGasUsed: BigNumber;
  effectiveGasPrice: BigNumber;
  byzantium: boolean;
  type: number;
  status?: number;
}

export type AccessList = Array<{ address: string; storageKeys: Array<string> }>;
