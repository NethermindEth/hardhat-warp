import path from 'path';
import {
  GatewayError,
  Contract as StarknetContract,
  InvokeFunctionResponse,
  InvokeTransactionReceiptResponse,
  Event as StarkEvent,
  Account,
} from 'starknet';
import { starknetKeccak } from 'starknet/dist/utils/hash';
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
} from '../../node_modules/ethers';
import { EventFragment, FunctionFragment, Indexed, ParamType } from 'ethers/lib/utils';
import {
  BlockTag,
  EventFilter,
  Listener,
  Provider,
  TransactionRequest,
  TransactionResponse,
  Block,
  TransactionReceipt,
} from '@ethersproject/abstract-provider';
import { id as keccak } from '@ethersproject/hash';
import { abiCoder, decode, decodeEvents, decode_, encode, SolValue } from '../transcode';
import { FIELD_PRIME } from 'starknet/dist/constants';
import { readFileSync } from 'fs';
import { normalizeAddress } from '../utils';
import { WarpSigner } from './Signer';
import { getSequencerProvider } from '../provider';

const ASSERT_ERROR = 'An ASSERT_EQ instruction failed';

export class ContractInfo {
  private name: string;
  private solidityFile: string;

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

  getCairoFile() {
    const cairoFile = this.solidityFile
      .slice(0, -4)
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
  readonly functions: { [name: string]: ContractFunction };

  readonly callStatic: { [name: string]: ContractFunction };
  readonly estimateGas: { [name: string]: ContractFunction<BigNumber> };
  readonly populateTransaction: {
    [name: string]: ContractFunction<PopulatedTransaction>;
  };

  // This will always be an address. This will only differ from
  // address if an ENS name was used in the constructor
  readonly resolvedAddress: Promise<string>;

  private sequencerProvider = getSequencerProvider();

  snTopicToName: { [key: string]: string } = {};
  // ethTopic here referes to the keccak of "event_name + selector"
  // because that's the mangling that warp produces
  private ethTopicToEvent: { [key: string]: [EventFragment, string] } = {};

  public ignoredTopics = new Set([
    // Event topic for fee invocation, done by StarkNet
    '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9',
  ]);

  constructor(
    private starknetContract: StarknetContract,
    private ethersContractFactory: EthersContractFactory,
    private pathToCairoFile: string,
  ) {
    super(
      normalizeAddress(starknetContract.address),
      ethersContractFactory.interface,
      ethersContractFactory.signer,
    );
    this.functions = starknetContract.functions;
    this.callStatic = starknetContract.callStatic;
    this.estimateGas = starknetContract.estimateGas;
    this.populateTransaction = starknetContract.populateTransaction;
    this.resolvedAddress = Promise.resolve(starknetContract.address);
    this._deployedPromise = Promise.resolve(this);
    this.solidityCairoRemap();

    const compiledCairo = JSON.parse(readFileSync(this.getCompiledCairoFile(), 'utf-8'));
    let eventsJson = compiledCairo?.abi?.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data: { [key: string]: any }) => data?.type === 'event',
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventsJson = eventsJson.map((e: any) => ({
      topic: `0x${starknetKeccak(e?.name).toString(16)}`,
      ...e,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventsJson.forEach((e: any) => {
      this.snTopicToName[e.topic] = e.name;
    });

    Object.entries(this.ethersContractFactory.interface.events).forEach(
      ([eventName, eventFragment]) => {
        const selector = keccak(eventFragment.format('sighash'));
        const warpTopic = `${eventName.split('(')[0]}_${selector.slice(2).slice(0, 8)}`;
        this.ethTopicToEvent[warpTopic] = [eventFragment, selector];
      },
    );
    // @ts-ignore
    this.interface._abiCoder = abiCoder;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static getContractAddress(transaction: { from: string; nonce: BigNumberish }): string {
    throw new Error('Not implemented yet');
  }

  getCompiledCairoFile() {
    return this.pathToCairoFile.slice(0, -6).concat('_compiled.json');
  }

  // @TODO: Allow timeout?
  deployed(): Promise<EthersContract> {
    return Promise.resolve(this);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _deployed(blockTag?: BlockTag): Promise<EthersContract> {
    return Promise.resolve(this);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fallback(overrides?: TransactionRequest): Promise<TransactionResponse> {
    throw new Error('Not implemented yet');
  }

  // Reconnect to a different signer or provider
  connect(signerOrProvider: Signer | Provider | string): EthersContract {
    const warpSigner = signerOrProvider as WarpSigner;
    this.starknetContract.connect(warpSigner.starkNetSigner);
    return this;
  }

  // Re-attach to a different on-chain instance of this contract
  attach(addressOrName: string): EthersContract {
    this.starknetContract.attach(addressOrName);
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  static isIndexed(value: any): value is Indexed {
    throw new Error('Not implemented yet');
  }

  queryFilter(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    event: EventFilter | string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fromBlockOrBlockhash?: BlockTag | string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    toBlock?: BlockTag,
  ): Promise<Array<Event>> {
    throw new Error('Not implemented yet');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  on(event: EventFilter | string, listener: Listener): this {
    throw new Error('Not implemented yet');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  once(event: EventFilter | string, listener: Listener): this {
    throw new Error('Not implemented yet');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  emit(eventName: EventFilter | string, ...args: Array<any>): boolean {
    throw new Error('Not implemented yet');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  listenerCount(eventName?: EventFilter | string): number {
    throw new Error('Not implemented yet');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  listeners(eventName?: EventFilter | string): Array<Listener> {
    throw new Error('Not implemented yet');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  removeAllListeners(eventName?: EventFilter | string): this {
    throw new Error('Not implemented yet');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  off(eventName: EventFilter | string, listener: Listener): this {
    throw new Error('Not implemented yet');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  removeListener(eventName: EventFilter | string, listener: Listener): this {
    throw new Error('Not implemented yet');
  }

  private buildDefault(solName: string, fragment: FunctionFragment) {
    if (fragment.constant) {
      return this.buildCall(solName, fragment);
    }
    return this.buildInvoke(solName, fragment);
  }

  private buildInvoke(solName: string, fragment: FunctionFragment) {
    const cairoFuncName = solName + '_' + this.interface.getSighash(fragment).slice(2); // Todo finish this keccak (use web3)

    return async (...args: SolValue[]) => {
      const calldata = encode(fragment.inputs, args);

      if (!(this.starknetContract.providerOrAccount instanceof Account))
        throw new Error('Expect contract provider to be account');
      // abiCoder checks for correct Sol input
      const abiEncodedInputs = abiCoder.encode(fragment.inputs, args);
      const invokeResponse = await this.starknetContract.providerOrAccount.execute(
        {
          contractAddress: this.starknetContract.address,
          calldata: calldata,
          entrypoint: cairoFuncName,
        },
        undefined,
        {
          // Set maxFee to some high number for goerli
          maxFee: process.env.STARKNET_PROVIDER_BASE_URL ? undefined : (2n ** 250n).toString(),
        },
      );
      const sigHash = this.ethersContractFactory.interface.getSighash(fragment);
      const data = sigHash.concat(abiEncodedInputs.substring(2));
      return this.toEtheresTransactionResponse(invokeResponse, data);
    };
  }

  private buildCall(solName: string, fragment: FunctionFragment) {
    const cairoFuncName = solName + '_' + this.interface.getSighash(fragment).slice(2); // Todo finish this keccak (use web3)
    return async (...args: SolValue[]) => {
      // abiCoder checks for correct Sol input
      abiCoder.encode(fragment.inputs, args);
      const calldata = encode(fragment.inputs, args);
      try {
        const output_before = await this.starknetContract.providerOrAccount.callContract(
          {
            contractAddress: this.starknetContract.address,
            calldata,
            entrypoint: cairoFuncName,
          },
          'pending',
        );
        const output = this.parseResponse(fragment.outputs, output_before.result);
        return output;
      } catch (e) {
        if (e instanceof GatewayError && e.message.includes(ASSERT_ERROR)) {
          throw new Error('Starknet reverted transaction: ' + e.message);
        } else {
          throw e;
        }
      }
    };
  }

  private wrap([funcname, fragment]: [string, FunctionFragment]) {
    const solName = funcname.split('(')[0];

    // @ts-ignore
    this[solName] = this.buildDefault(solName, fragment);

    // TODO: functions have a slightly different return type for single value returns
    this.functions[solName] = this.buildDefault(solName, fragment);

    // TODO: callStatic have a slightly different return type for single value returns
    this.callStatic[solName] = this.buildCall(solName, fragment);
  }

  private parseResponse(returnTypes: ParamType[] | undefined, result: string[]) {
    if (returnTypes === undefined) return [];
    return decode(returnTypes, result);
  }

  private solidityCairoRemap() {
    Object.entries(this.interface.functions).forEach(this.wrap.bind(this));
  }

  private async toEtheresTransactionResponse(
    { transaction_hash }: InvokeFunctionResponse,
    data: string,
  ): Promise<ContractTransaction> {
    const txStatus = await this.sequencerProvider.getTransactionStatus(transaction_hash);
    const txTrace = await this.sequencerProvider.getTransactionTrace(transaction_hash);

    if (txStatus.tx_status === 'NOT_RECEIVED') {
      throw new Error('Failed transactions not supported yet');
    }
    const txResponse = await this.sequencerProvider.getTransaction(transaction_hash);
    // Handle failure case
    if (txStatus.tx_status === 'REJECTED') {
      throw new Error(
        'Starknet reverted transaction: ' + (JSON.stringify(txStatus.tx_failure_reason) || ''),
      );
    }
    const txBlock = await this.sequencerProvider.getBlock(txStatus.block_hash);
    const latestBlock = await this.sequencerProvider.getBlock();

    return {
      hash: txResponse.transaction_hash as string,
      blockNumber: txBlock.block_number,
      confirmations: latestBlock.block_number - txBlock.block_number,
      from: txTrace.function_invocation.caller_address,

      gasLimit: BigNumber.from(txResponse.max_fee || '0x' + FIELD_PRIME),
      nonce: txResponse.nonce ? parseInt(txResponse.nonce) : -1,
      data: data,
      value: BigNumber.from(0),
      chainId: -1,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      wait: async (_: number | undefined) => {
        this.sequencerProvider.waitForTransaction(transaction_hash);
        const txStatus = await this.sequencerProvider.getTransactionStatus(transaction_hash);
        const txBlock = await this.sequencerProvider.getBlock(txStatus.block_hash);
        const txTrace = await this.sequencerProvider.getTransactionTrace(transaction_hash);
        const txReceipt = (await this.sequencerProvider.getTransactionReceipt(
          transaction_hash,
        )) as InvokeTransactionReceiptResponse;
        const latestBlock = await this.sequencerProvider.getBlock();
        const ethEvents = this.starknetEventsToEthEvents(
          txReceipt.events,
          txBlock.block_number,
          txBlock.block_hash,
          -1,
          transaction_hash,
        );

        return Promise.resolve({
          to: normalizeAddress(txTrace.function_invocation.contract_address),
          from: txTrace.function_invocation.caller_address,
          contractAddress: normalizeAddress(txTrace.function_invocation.contract_address),

          blockHash: txBlock.block_hash,
          blockNumber: txBlock.block_number,
          confirmations: latestBlock.block_number - txBlock.block_number,

          transactionIndex: -1, // TODO: find out how to pull this from starknet
          transactionHash: txReceipt.transaction_hash,

          gasUsed: BigNumber.from(100), // TODO make accurate
          cumulativeGasUsed: BigNumber.from(0), // Doesn't make sense on starknet yet
          effectiveGasPrice: BigNumber.from(txReceipt?.actual_fee || 0),

          logsBloom: '', // TODO: error on access,
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
    transactionHash: string,
  ): Event[] {
    return events
      .filter((e) => !this.ignoredTopics.has(e.keys[0]))
      .map((e, i): Event => {
        const currentTopic = e.keys[0];
        const [eventFragment, selector] = this.ethTopicToEvent[this.snTopicToName[currentTopic]];

        const results = decodeEvents(eventFragment.inputs, e.data);
        const resultsArray = decode_(eventFragment.inputs, e.data.values());
        return {
          blockNumber,
          blockHash,
          transactionIndex,
          removed: false,
          address: normalizeAddress(e.from_address),
          // abi encoded data
          data: abiCoder.encode(eventFragment.inputs, resultsArray),
          topics: [selector],
          transactionHash,
          logIndex: i,
          event: eventFragment.name,
          eventSignature: eventFragment.format('sighash'),
          args: results,
          removeListener: () => {
            throw new Error('Duck you');
          },
          // TODO: use the functions when they are seperated
          getBlock: () => Promise.resolve({} as Block),
          getTransaction: () => Promise.resolve({} as TransactionResponse),
          getTransactionReceipt: () => Promise.resolve({} as TransactionReceipt),
        };
      });
  }
}
