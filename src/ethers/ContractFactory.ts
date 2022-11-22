import {
  Account,
  AccountInterface,
  Contract,
  ContractFactory as StarknetContractFactory,
  json,
  ProviderInterface,
} from 'starknet';
import {
  BigNumber,
  BytesLike,
  ContractFactory as EthersContractFactory,
  Signer,
  Contract as EthersContract,
} from 'ethers';
import { Interface } from '@ethersproject/abi';
import { id as keccak } from '@ethersproject/hash';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { ContractInterface } from '@ethersproject/contracts';
import { WarpContract } from './Contract';
import { abiCoder, encode, SolValue } from '../transcode';
import { readFileSync } from 'fs';
import { WarpSigner } from './Signer';
import { benchmark, getCompiledCairoFile, getContract, getContractsToDeclare } from '../utils';
import { getDevnetProvider } from '../provider';
import { starknetKeccak } from 'starknet/dist/utils/hash';
import { ethTopicToEvent, snTopicToName } from '../eventRegistry';

const UDC_ADDRESS = '0x41a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf';

export class ContractFactory {
  readonly interface: Interface;
  readonly bytecode: string;
  readonly signer: Signer;
  pathToCairoFile: string;
  private sequencerProvider = getDevnetProvider();

  constructor(
    private starknetContractFactory: StarknetContractFactory,
    private ethersContractFactory: EthersContractFactory,
    pathToCairoFile: string,
    public contractName: string,
  ) {
    this.interface = ethersContractFactory.interface;
    this.bytecode = ethersContractFactory.bytecode;
    this.signer = ethersContractFactory.signer; // Todo use starknet signers if possible
    this.pathToCairoFile = pathToCairoFile;

    const compiledCairo = JSON.parse(
      readFileSync(getCompiledCairoFile(this.pathToCairoFile), 'utf-8'),
    );
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
      snTopicToName[e.topic] = e.name;
    });

    Object.entries(this.ethersContractFactory.interface.events).forEach(
      ([eventName, eventFragment]) => {
        const selector = keccak(eventFragment.format('sighash'));
        const warpTopic = `${eventName.split('(')[0]}_${selector.slice(2).slice(0, 8)}`;
        ethTopicToEvent[warpTopic] = [eventFragment, selector];
      },
    );

    // @ts-ignore
    this.interface._abiCoder = abiCoder;
  }

  // @TODO: Future; rename to populateTransaction?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDeployTransaction(...args: Array<any>): TransactionRequest {
    console.warn(
      'getDeployTransaction not implemented for Starknet: using the Eth transaction instead',
    );
    return this.ethersContractFactory.getDeployTransaction(...args);
  }

  async deploy(...args: Array<SolValue>): Promise<EthersContract> {
    await Promise.all(
      Object.entries(getContractsToDeclare(this.pathToCairoFile)).map(
        async ([name, expected_hash]) => {
          const factory = getStarknetContractFactory(
            name,
            this.starknetContractFactory.providerOrAccount,
          );

          const declareResponse =
            await this.starknetContractFactory.providerOrAccount.declareContract({
              contract: factory.compiledContract,
            });

          if (declareResponse.class_hash.trim() !== expected_hash.trim()) {
            throw new Error(
              `The hash of ${name} didn't match the hash expected by ${this.pathToCairoFile}\n` +
                `Please compile the solidity for ${this.pathToCairoFile} again or update the hash.\n` +
                `   ${name}'s expected hash: ${expected_hash}\n` +
                `   ${name}'s actuall hash:  ${declareResponse.class_hash}\n`,
            );
          }

          await this.starknetContractFactory.providerOrAccount.waitForTransaction(
            declareResponse.transaction_hash,
          );

          const txTrace = await this.sequencerProvider.getTransactionTrace(
            declareResponse.transaction_hash,
          );
          benchmark(getContract(name).getCairoFile(), 'DECLARE', txTrace);
        },
      ),
    );

    // Declare this contract
    const declareResponse = await this.starknetContractFactory.providerOrAccount.declareContract({
      contract: this.starknetContractFactory.compiledContract,
    });
    await this.starknetContractFactory.providerOrAccount.waitForTransaction(
      declareResponse.transaction_hash,
    );
    const declareTrace = await this.sequencerProvider.getTransactionTrace(
      declareResponse.transaction_hash,
    );
    benchmark(this.pathToCairoFile, 'DECLARE', declareTrace);

    const inputs = encode(this.interface.deploy.inputs, args);

    const deployInputs = [
      declareResponse.class_hash,
      // using random salt, so that that the computed address is different each
      // time and starknet-devnet doesn't complain
      Math.floor(Math.random() * 1000000).toString(),
      '1', // unique
      inputs.length.toString(),
      ...inputs,
    ];
    if (!(this.starknetContractFactory.providerOrAccount instanceof Account))
      throw new Error('Expect contract provider to be account');
    const { transaction_hash: deployTxHash } =
      await this.starknetContractFactory.providerOrAccount.execute({
        contractAddress: UDC_ADDRESS,
        calldata: deployInputs,
        entrypoint: 'deployContract',
      });
    await this.starknetContractFactory.providerOrAccount.waitForTransaction(deployTxHash);
    const txTrace = await this.sequencerProvider.getTransactionTrace(deployTxHash);
    benchmark(this.pathToCairoFile, 'constructor', txTrace);
    const deployAddress = txTrace.function_invocation.result[0];
    const starknetContract = new Contract(
      this.starknetContractFactory.abi,
      deployAddress,
      this.starknetContractFactory.providerOrAccount,
    );
    const contract = new WarpContract(
      starknetContract,
      this.starknetContractFactory,
      this.ethersContractFactory,
      this.pathToCairoFile,
    );
    return contract;
  }

  attach(address: string): EthersContract {
    const starknetContract = this.starknetContractFactory.attach(address);
    const contract = new WarpContract(
      starknetContract,
      this.starknetContractFactory,
      this.ethersContractFactory,
      this.pathToCairoFile,
    );
    return contract;
  }

  connect(account: WarpSigner): ContractFactory {
    const connectedFactory = getStarknetContractFactory(this.contractName, account.starkNetSigner);
    return new ContractFactory(
      connectedFactory,
      this.ethersContractFactory,
      this.pathToCairoFile,
      this.contractName,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  static fromSolidity(compilerOutput: any, signer?: Signer): ContractFactory {
    throw new Error('fromSolidity not yet supported');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static getInterface(contractInterface: ContractInterface) {
    throw new Error('getInterface not yet supported');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static getContractAddress(tx: { from: string; nonce: BytesLike | BigNumber | number }): string {
    throw new Error('getContractAddress not supported');
  }

  static getContract(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    address: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    contractInterface: ContractInterface,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    signer?: Signer,
  ): EthersContract {
    throw new Error('getContract not supported');
  }
}

export function getStarknetContractFactory(
  contractName: string,
  defaultAccount: ProviderInterface | AccountInterface,
): StarknetContractFactory {
  const contract = getContract(contractName);
  const compiledContract = json.parse(readFileSync(contract.getCompiledJson()).toString('ascii'));
  return new StarknetContractFactory(compiledContract, defaultAccount, compiledContract.abi);
}
