import * as path from 'path';
import { ContractFactory as StarknetContractFactory, json } from 'starknet';
import { BigNumber, BytesLike, Signer, Contract as EthersContract } from 'ethers';
import { Interface } from '@ethersproject/abi';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { ContractInterface } from '@ethersproject/contracts';
import { WarpContract } from './Contract';
import { abiCoder, encode, SolValue } from '../transcode';
import { readFileSync } from 'fs';
import { WarpSigner } from './Signer';
import { benchmark, getContractsToDeclare } from '../utils';
import { getDevnetProvider } from '../provider';
import { ethTopicToEvent } from '../eventRegistry';
import { globalHRE } from '../hardhat/runtime-environment';
import { callClassHashScript, warpEventCanonicalSignaturehash } from '@nethermindeth/warp';

export class ContractFactory {
  readonly interface: Interface;
  readonly bytecode: string = '';
  private sequencerProvider = getDevnetProvider();
  public pathToCairoFile: string;

  constructor(
    private starknetContractFactory: StarknetContractFactory,
    ifc: Interface,
    public signer: Signer,
    public pathToCompiledCairo: string,
    public contractName: string,
  ) {
    this.interface = ifc;
    this.pathToCairoFile = `${this.pathToCompiledCairo.slice(0, -'_compiled.json'.length)}.cairo`;

    Object.entries(this.interface.events).forEach(([_, eventFragment]) => {
      const eventName = eventFragment.name;
      const ethTopic = warpEventCanonicalSignaturehash(
        eventName,
        eventFragment.inputs.map((ef) => ef.type),
      );
      ethTopicToEvent[ethTopic] = eventFragment;
    });

    // @ts-ignore
    this.interface._abiCoder = abiCoder;
  }

  // @TODO: Future; rename to populateTransaction?
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  getDeployTransaction(...args: Array<any>): TransactionRequest {
    throw new Error('Not implemented yet');
  }

  async deploy(...args: Array<SolValue>): Promise<EthersContract> {
    await Promise.all(
      Object.entries(getContractsToDeclare(this.pathToCairoFile)).map(
        async ([name, expected_hash]) => {
          const compiledContractPath = `${name}_compiled.json`;
          const compiledContract = json.parse(
            readFileSync(path.join('artifacts', compiledContractPath), 'utf8'),
          );

          const declareResponse = await this.starknetContractFactory.account.declare({
            contract: compiledContract,
            classHash: callClassHashScript(compiledContractPath),
          });

          if (declareResponse.class_hash !== expected_hash) {
            throw new Error(
              `The hash of ${name} didn't match the hash expected by ${this.pathToCompiledCairo}\n` +
                `Please compile the solidity for ${this.pathToCompiledCairo} again or update the hash.\n` +
                `   ${name}'s expected hash: ${expected_hash}\n` +
                `   ${name}'s actuall hash:  ${declareResponse.class_hash}\n`,
            );
          }

          await this.starknetContractFactory.account.waitForTransaction(
            declareResponse.transaction_hash,
          );

          const txTrace = await this.sequencerProvider.getTransactionTrace(
            declareResponse.transaction_hash,
          );
          benchmark(this.pathToCompiledCairo, 'DECLARE', txTrace);
        },
      ),
    );

    const inputs = encode(this.interface.deploy.inputs, args);
    const starknetContract = await this.starknetContractFactory.deploy(inputs);
    const contract = new WarpContract(
      starknetContract,
      this.starknetContractFactory,
      this.signer,
      this.interface,
      this.pathToCompiledCairo,
    );
    return contract;
  }

  attach(address: string): EthersContract {
    const starknetContract = this.starknetContractFactory.attach(address);
    const contract = new WarpContract(
      starknetContract,
      this.starknetContractFactory,
      this.signer,
      this.interface,
      this.pathToCompiledCairo,
    );
    return contract;
  }

  connect(account: WarpSigner): ContractFactory {
    // @ts-ignore Types are borked. Doesn't get ethers is a member
    const connectedFactory = globalHRE.ethers.getContractFactory(
      this.contractName,
      account.starkNetSigner,
    );
    return new ContractFactory(
      connectedFactory,
      this.interface,
      account,
      this.pathToCompiledCairo,
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
