import {getContract} from '../utils';
import {ContractFactory, defaultProvider, json, Provider} from 'starknet';
import {readFileSync} from 'fs';

export function getStarknetContractFactory(contractName: string) {
  const contract = getContract(contractName);
  const compiledContract =
        json.parse(readFileSync(contract.getCompiledJson()).toString('ascii'));
  return new ContractFactory(
    compiledContract,
    process.env.STARKNET_PROVIDER_BASE_URL === undefined ?
        defaultProvider :
        new Provider({sequencer: {baseUrl: process.env.STARKNET_PROVIDER_BASE_URL}}),
    compiledContract.abi,
  );
}
