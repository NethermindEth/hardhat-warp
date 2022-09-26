import path from "path";
import {
  InvocationsDetails,
  GatewayError,
  Event as StarknetEvent,
  ContractFactory as StarknetContractFactory,
  SequencerProvider,
  Contract as StarknetContract,
  ProviderInterface,
  InvokeFunctionResponse,
  InvokeTransactionReceiptResponse,
  Event as StarkEvent,
  Account,
} from "starknet";
import { starknetKeccak } from "starknet/dist/utils/hash";
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
} from "../../node_modules/ethers";
import {
  EventFragment,
  FunctionFragment,
  Indexed,
  ParamType,
} from "ethers/lib/utils";
import {
  BlockTag,
  EventFilter,
  Listener,
  Provider,
  Log,
  TransactionRequest,
  TransactionResponse,
  Block,
  TransactionReceipt,
} from "@ethersproject/abstract-provider";
import { id as keccak } from "@ethersproject/hash";
import { parse, TypeNode } from "solc-typed-ast";
import { decode, decode_, encodeValueOuter, SolValue } from "../encode";
import { FIELD_PRIME } from "starknet/dist/constants";
import { readFileSync } from "fs";
import { colorLogger, normalizeAddress } from "../utils";
import { abiEncode } from "../abiEncode";

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

  snTopicToName: { [key: string]: string } = {};
  // ethTopic here referes to the keccak of "event_name + selector"
  // because that's the mangling that warp produces
  private ethTopicToEvent: { [key: string]: [EventFragment, string] } = {};

  private starknetProvider: SequencerProvider;
  constructor(
    private starknetAccount: Account,
    private starknetContract: StarknetContract,
    private starknetContractFactory: StarknetContractFactory,
    private ethersContractFactory: EthersContractFactory,
    private pathToCairoFile: string
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
    this.starknetProvider = starknetContract.providerOrAccount // @ts-ignore
      .provider as SequencerProvider;
    this.solidityCairoRemap();

    const compiledCairo = JSON.parse(
      readFileSync(this.getCompiledCairoFile(), "utf-8")
    );
    let eventsJson = compiledCairo?.abi?.filter(
      (data: { [key: string]: any }) => data?.type === "event"
    );
    eventsJson = eventsJson.map((e: any) => ({
      topic: `0x${starknetKeccak(e?.name).toString(16)}`,
      ...e,
    }));
    eventsJson.forEach((e: any) => {
      this.snTopicToName[e.topic] = e.name;
    });

    Object.entries(this.ethersContractFactory.interface.events).forEach(
      ([eventName, eventFragment]) => {
        const selector = keccak(eventFragment.format("sighash"));
        const warpTopic = `${eventName.split("(")[0]}_${selector
          .slice(2)
          .slice(0, 8)}`;
        this.ethTopicToEvent[warpTopic] = [eventFragment, selector];
      }
    );
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
    this.starknetContract.connect(this.starknetAccount);
    return this;
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

  public argStringifier(arg: any): SolValue {
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
    return this.buildInvoke(solName, fragment);
  }

  private buildInvoke(solName: string, fragment: FunctionFragment) {
    const inputTypeNodes = fragment.inputs.map((tp) => {
      const res = parse(this.format(tp), {
        ctx: undefined,
        version: undefined,
      }) as TypeNode;
      return res;
    });
    const cairoFuncName =
      solName + "_" + this.interface.getSighash(fragment).slice(2); // Todo finish this keccak (use web3)

    return async (...args: any[]) => {
      console.log({ cairoFuncName });
      const calldata = args.flatMap((arg, i) =>
        encodeValueOuter(
          inputTypeNodes[i],
          this.argStringifier(arg),
          "we don't care"
        )
      );
      try {
        console.log("INVOKE FUNCTION");
        this.starknetContract = new StarknetContract(
          this.starknetContract.abi,
          this.starknetContract.address,
          this.starknetAccount
        );
        this.starknetContract.connect(this.starknetAccount);
        console.log(
          `this.starknetContract.functions: ${JSON.stringify(
            this.starknetContract.functions
          )}`
        );
        // TODO
        // this.starknetContract.setOwner();
        const invokeRes: InvokeFunctionResponse = await this.starknetContract.invoke(
          cairoFuncName,
          calldata
        );
        console.log(`invokeRes: ${JSON.stringify(invokeRes, undefined, 2)}`);
        const invokeResponse = await this.starknetAccount.execute(
          {
            contractAddress: this.starknetContract.address,
            calldata,
            entrypoint: cairoFuncName,
          },
          undefined,
          {
            maxFee: "999999995330000",
          }
        );
        console.log("Before to etheresTransaction");
        const abiEncodedInputs = abiEncode(
          fragment.inputs,
          args.map((a) => this.argStringifier(a))
        );
        const sigHash = this.ethersContractFactory.interface.getSighash(
          fragment
        );
        const data = sigHash.concat(abiEncodedInputs.substring(2));
        return this.toEtheresTransactionResponse(invokeResponse, data);
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
            throw new Error("Starknet reverted transaction: " + e.message);
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

  private solidityCairoRemap() {
    Object.entries(this.interface.functions).forEach(this.wrap.bind(this));
  }

  private async toEtheresTransactionResponse(
    { transaction_hash }: InvokeFunctionResponse,
    data: string
  ): Promise<ContractTransaction> {
    const txStatus = await this.starknetProvider.getTransactionStatus(
      transaction_hash
    );
    const txTrace = await this.starknetProvider.getTransactionTrace(
      transaction_hash
    );

    if (txStatus.tx_status === "NOT_RECEIVED") {
      throw new Error("Failed transactions not supported yet");
    }
    const txResponse = await this.starknetProvider.getTransaction(
      transaction_hash
    );
    // Handle failure case
    if (txStatus.tx_status === "REJECTED") {
      throw new Error(
        "Starknet reverted transaction: " +
          (JSON.stringify(txStatus.tx_failure_reason) || "")
      );
    }
    const txBlock = await this.starknetProvider.getBlock(txStatus.block_hash);
    const latestBlock = await this.starknetProvider.getBlock();

    console.log("To ethers conversion happened");
    return {
      hash: txResponse.transaction_hash as string,
      blockNumber: txBlock.block_number,
      confirmations: latestBlock.block_number - txBlock.block_number,
      from: txTrace.function_invocation.caller_address,

      gasLimit: BigNumber.from(txResponse.max_fee || "0x" + FIELD_PRIME),
      nonce: txResponse.nonce ? parseInt(txResponse.nonce) : -1,
      data: data,
      value: BigNumber.from(0),
      chainId: -1,
      wait: async (_: number | undefined) => {
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
        const ethEvents = this.starknetEventsToEthEvents(
          txReceipt.events,
          txBlock.block_number,
          txBlock.block_hash,
          -1,
          transaction_hash
        );

        console.log("Encode is done");
        return Promise.resolve({
          to: normalizeAddress(txTrace.function_invocation.contract_address),
          from: txTrace.function_invocation.caller_address,
          contractAddress: normalizeAddress(
            txTrace.function_invocation.contract_address
          ),

          blockHash: txBlock.block_hash,
          blockNumber: txBlock.block_number,
          confirmations: latestBlock.block_number - txBlock.block_number,

          transactionIndex: -1, // TODO: find out how to pull this from starknet
          transactionHash: txReceipt.transaction_hash,

          gasUsed: BigNumber.from(100), // TODO make accurate
          cumulativeGasUsed: BigNumber.from(0), // Doesn't make sense on starknet yet
          effectiveGasPrice: BigNumber.from(txReceipt?.actual_fee || 0),

          logsBloom: "", // TODO: error on access,
          logs: ethEvents,
          events: ethEvents,
          byzantium: true,
          type: 0, // TODO: check this is the right format
        });
      },
    };
  }

  private starknetEventsToEthEvents(
    events: Array<StarkEvent>,
    blockNumber: number,
    blockHash: string,
    transactionIndex: number,
    transactionHash: string
  ): Array<Event> {
    return events.map((e, i) => {
      const currentTopic = e.keys[0];
      const [eventFragment, selector] = this.ethTopicToEvent[
        this.snTopicToName[currentTopic]
      ];

      const results = decode(eventFragment.inputs, e.data);
      const resultsArray = decode_(eventFragment.inputs, e.data.values());
      console.log("Going to encode");
      return {
        blockNumber,
        blockHash,
        transactionIndex,
        removed: false,
        address: normalizeAddress(e.from_address),
        // abi encoded data
        data: this.ethersContractFactory.interface._abiCoder.encode(
          eventFragment.inputs,
          resultsArray
        ),
        topics: [selector],
        transactionHash,
        logIndex: i,

        event: eventFragment.name,
        eventSignature: eventFragment.format("sighash"),
        args: results,
        removeListener: () => {
          throw new Error("Duck you");
        },
        // TODO: use the functions when they are seperated
        getBlock: () => Promise.resolve({} as Block),
        getTransaction: () => Promise.resolve({} as TransactionResponse),
        getTransactionReceipt: () => Promise.resolve({} as TransactionReceipt),
      };
    });
  }
}
