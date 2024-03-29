import {
  GatewayError,
  Contract as StarknetContract,
  InvokeFunctionResponse,
  InvokeTransactionReceiptResponse,
  Event as StarkEvent,
  Account,
  ContractFactory as StarknetContractFactory,
} from 'starknet';
import {
  BigNumberish,
  ContractFunction,
  PopulatedTransaction,
  Event,
  BigNumber,
  ContractTransaction,
  ContractReceipt,
} from 'ethers';
import { FunctionFragment, Indexed, Interface, ParamType } from 'ethers/lib/utils';
import {
  BlockTag,
  EventFilter,
  Listener,
  TransactionRequest,
  TransactionResponse,
  Block,
  TransactionReceipt,
} from '@ethersproject/abstract-provider';
import { abiCoder, decode, decodeEvents, decode_, encode, SolValue } from '../transcode';
import { benchmark, normalizeAddress } from '../utils';
import { getDevnetPort, getDevnetProvider } from '../provider';
import { WarpError } from './Error';
import { ethTopicToEvent } from '../eventRegistry';
import { devnet } from '../devnet';
import { decodeEventLog } from '@nethermindeth/warp';
import { FIELD_PRIME } from '../constants';

const ASSERT_ERRORS = ['An ASSERT_EQ instruction failed', 'AssertionError:'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CairoContractReceipt = ContractReceipt & { cairoResult: any[] };
interface CairoContractTransaction extends ContractTransaction {
  wait(confirmations?: number): Promise<CairoContractReceipt>;
}

export class Contract /* extends EthersContract */ {
  readonly functions: { [name: string]: ContractFunction };
  public address: string;
  public signerOrProvider: Account;

  readonly callStatic: { [name: string]: ContractFunction };
  readonly estimateGas: { [name: string]: ContractFunction<BigNumber> };
  readonly populateTransaction: {
    [name: string]: ContractFunction<PopulatedTransaction>;
  };

  // This will always be an address. This will only differ from
  // address if an ENS name was used in the constructor
  readonly resolvedAddress: Promise<string>;

  // Defined in the original ethers
  readonly _deployedPromise: Promise<Contract>;

  private sequencerProvider = getDevnetProvider();
  public interface: Interface;

  public ignoredTopics = new Set([
    // Event topic for fee invocation, done by StarkNet
    '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9',
  ]);

  constructor(
    private starknetContract: StarknetContract,
    private starknetContractFactory: StarknetContractFactory,
    public signer: Account,
    ifc: Interface,
    private pathToCairoFile: string,
  ) {
    this.interface = ifc;
    this.functions = starknetContract.functions;
    this.callStatic = starknetContract.callStatic;
    this.estimateGas = starknetContract.estimateGas;
    this.populateTransaction = starknetContract.populateTransaction;
    this.resolvedAddress = Promise.resolve(starknetContract.address);
    this._deployedPromise = Promise.resolve(this);
    this.solidityCairoRemap();
    this.address = starknetContract.address;
    this.signerOrProvider = signer;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static getContractAddress(transaction: { from: string; nonce: BigNumberish }): string {
    throw new Error('Not implemented yet');
  }

  // @TODO: Allow timeout?
  deployed(): Promise<Contract> {
    return Promise.resolve(this);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _deployed(blockTag?: BlockTag): Promise<Contract> {
    return Promise.resolve(this);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fallback(overrides?: TransactionRequest): Promise<TransactionResponse> {
    throw new Error('Not implemented yet');
  }

  // Reconnect to a different signer or provider
  connect(signerOrProvider: Account): Contract {
    const connected = new Contract(
      this.starknetContractFactory.attach(this.address),
      this.starknetContractFactory,
      this.signerOrProvider,
      this.interface,
      this.pathToCairoFile,
    );
    connected.starknetContract.connect(signerOrProvider);
    return connected;
  }

  // Re-attach to a different on-chain instance of this contract
  attach(addressOrName: string): Contract {
    const attached = new Contract(
      this.starknetContractFactory.attach(addressOrName),
      this.starknetContractFactory,
      this.signer,
      this.interface,
      this.pathToCairoFile,
    );
    return attached;
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

  private buildInvoke(
    solName: string,
    fragment: FunctionFragment,
  ): (...args: SolValue[]) => Promise<CairoContractTransaction> {
    const cairoFuncName = solName + '_' + this.interface.getSighash(fragment).slice(2); // Todo finish this keccak (use web3)

    return async (...args: SolValue[]) => {
      const calldata = encode(fragment.inputs, args);

      if (!(this.starknetContract.providerOrAccount instanceof Account))
        throw new Error('Expect contract provider to be account');
      // abiCoder checks for correct Sol input
      const abiEncodedInputs = abiCoder.encode(fragment.inputs, args);
      try {
        const invokeResponse = await this.starknetContract.providerOrAccount.execute(
          {
            contractAddress: this.starknetContract.address,
            calldata: calldata,
            entrypoint: cairoFuncName,
          },
          undefined,
          // TODO support this again when we look at using goerli
          // {
          //   // Set maxFee to some high number for goerli
          //   maxFee: process.env.STARKNET_PROVIDER_BASE_URL ? undefined : (2n ** 250n).toString(),
          // },
        );
        const sigHash = this.interface.getSighash(fragment);
        const data = sigHash.concat(abiEncodedInputs.substring(2));
        return this.toEtheresTransactionResponse(invokeResponse, data, solName);
      } catch (e) {
        if (
          e instanceof GatewayError &&
          ASSERT_ERRORS.some((err) => (e as GatewayError).message.includes(err))
        ) {
          throw new WarpError(e.message);
        } else throw e;
      }
    };
  }

  private buildCall(solName: string, fragment: FunctionFragment) {
    const inv = this.buildInvoke(solName, fragment);
    return async (...args: SolValue[]) => {
      // Ada forgive us
      const port = getDevnetPort();
      await devnet.dump(`${port}.CALL_ROLLBACK`);
      const result = (await (await inv(...args)).wait()).cairoResult;
      const output = this.parseResponse(fragment.outputs, result);
      await devnet.load(`${port}.CALL_ROLLBACK`);
      return output;
    };
  }

  private wrap([funcname, fragment]: [string, FunctionFragment]) {
    const solName = funcname.split('(')[0];

    // @ts-ignore
    this[solName] = this.buildDefault(solName, fragment);

    // TODO: functions have a slightly different return type for single value returns
    this.functions[solName] = this.buildDefault(solName, fragment);

    this.callStatic[solName] = this.buildCall(solName, fragment);
  }

  private parseResponse(returnTypes: ParamType[] | undefined, result: string[]) {
    if (returnTypes === undefined) return [];

    // Results changed shape recently and are now always lists with the length of
    // the number of felts contained in them as the first element.
    // We need to drop the length prefix
    return decode(returnTypes, result.slice(1));
  }

  private solidityCairoRemap() {
    Object.entries(this.interface.functions).forEach(this.wrap.bind(this));
  }

  private async toEtheresTransactionResponse(
    { transaction_hash }: InvokeFunctionResponse,
    data: string,
    functionName: string,
  ): Promise<CairoContractTransaction> {
    const txStatus = await this.sequencerProvider.getTransactionStatus(transaction_hash);
    const txTrace = await this.sequencerProvider.getTransactionTrace(transaction_hash);
    benchmark(this.pathToCairoFile, functionName, txTrace);
    if (txStatus.tx_status === 'NOT_RECEIVED') {
      throw new Error('Failed transactions not supported yet');
    }
    const txResponse = await this.sequencerProvider.getTransaction(transaction_hash);
    // Handle failure case
    if (txStatus.tx_status === 'REJECTED') {
      throw new WarpError(txStatus.tx_failure_reason?.error_message || '');
    }
    if (txTrace.function_invocation === undefined) {
      throw new Error('Function invocation not found');
    }
    const txBlock = await this.sequencerProvider.getBlock(txStatus.block_hash);
    const latestBlock = await this.sequencerProvider.getBlock();
    const chainId = parseInt(await this.sequencerProvider.getChainId(), 16);

    return {
      hash: txResponse.transaction_hash as string,
      blockNumber: txBlock.block_number,
      confirmations: latestBlock.block_number - txBlock.block_number,
      from: txTrace.function_invocation.caller_address,

      gasLimit: BigNumber.from(txResponse.max_fee || '0x' + FIELD_PRIME),
      nonce: txResponse.nonce ? parseInt(txResponse.nonce) : -1,
      data: data,
      value: BigNumber.from(0),
      chainId,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      wait: async (_: number | undefined) => {
        await this.sequencerProvider.waitForTransaction(transaction_hash);
        const txStatus = await this.sequencerProvider.getTransactionStatus(transaction_hash);
        const txBlock = await this.sequencerProvider.getBlock(txStatus.block_hash);
        const txTrace = await this.sequencerProvider.getTransactionTrace(transaction_hash);
        if (txTrace.function_invocation === undefined) {
          throw new Error('Function invocation not found');
        }
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
          cairoResult: txTrace.function_invocation.result,
        });
      },
    };
  }

  private starknetEventsToEthEvents(
    events: Array<StarkEvent> | undefined,
    blockNumber: number,
    blockHash: string,
    transactionIndex: number,
    transactionHash: string,
  ): Event[] {
    if (events === undefined) return [];
    return events
      .filter((e) => !this.ignoredTopics.has(e.keys[0]))
      .map((e, i): Event => {
        const currentTopic = `${e.keys[0]}${e.keys[1]?.slice(2, 4)}`;
        const eventFragment = ethTopicToEvent[currentTopic];

        const warpEvent = decodeEventLog([{ keys: e.keys, data: e.data, order: NaN }]);
        const results = decodeEvents(eventFragment.inputs, warpEvent[0].data);
        const resultsArray = decode_(eventFragment.inputs, warpEvent[0].data.values());
        return {
          blockNumber,
          blockHash,
          transactionIndex,
          removed: false,
          address: normalizeAddress(e.from_address),
          // abi encoded data
          data: abiCoder.encode(eventFragment.inputs, resultsArray),
          topics: [currentTopic],
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
