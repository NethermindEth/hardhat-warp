import {ContractInfo} from '../Contract';
import {getContract} from '../utils';
import {ContractFactory, defaultProvider, json, Provider} from 'starknet';
import {readFileSync} from 'fs';

export class StarknetContractFactory {
  private contract: ContractInfo;
  private starknetFactory: ContractFactory;
  private provider: Provider;

  constructor(contract: ContractInfo) {
    this.contract = contract;
    const compiledCairoContract = json.parse(
        readFileSync(this.contract.getCompiledJson()).toString('ascii'),
    );
    this.provider = process.env.STARKNET_PROVIDER_BASE_URL === undefined ?
      defaultProvider :
      new Provider({baseUrl: process.env.STARKNET_PROVIDER_BASE_URL});
    this.starknetFactory = new ContractFactory(
        compiledCairoContract,
        this.provider,
        compiledCairoContract.abi,
    );
  }

  public async deploy(...args: any) {
    return this.starknetFactory.deploy([args]);
  }
}

export function getStarknetContractFactory(contractName: string) {
  const contract = getContract(contractName);
  return new StarknetContractFactory(contract);
}
