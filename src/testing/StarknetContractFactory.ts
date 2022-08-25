import {ContractInfo} from '../Contract';
import {getContract} from '../utils';
import {AsyncContractFunction, Contract, ContractFactory, defaultProvider, FunctionAbi, json, Provider} from 'starknet';
import {readFileSync} from 'fs';

function getMangledFunctionName(solidityFunctionName: string, args: Array<any>): string {
  return 'NOT IMPLEMENTED';
}

function buildCall(cairoContract: Contract, cairoFunctionAbi: FunctionAbi): AsyncContractFunction {
  return async function(...args: Array<any>) {
    const solidityName: string = cairoFunctionAbi.name.slice(0, -9);
    // Use the args and solidityName together to derive Cairo function Name
    const cairoFunctionName: string = getMangledFunctionName(solidityName, args);
    return cairoContract.call(cairoFunctionName, args);
  };
}

function buildDefault(cairoContract: Contract, cairoFunctionAbi: FunctionAbi): AsyncContractFunction {
  if (cairoFunctionAbi.stateMutability === 'view') {
    return buildCall(cairoContract, cairoFunctionAbi);
  }
  // return buildInvoke(cairoContract, cairoFunctionAbi);
}
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
    let contract: Contract;
    if (args.length === 0) {
      contract = await this.starknetFactory.deploy();
    } else {
      contract = await this.starknetFactory.deploy([args]);
    }
    return this.reset(contract);
  }

  reset(contract: Contract) {
    contract.abi.forEach((abiElement) => {
      if (abiElement.type !== 'function') {
        return;
      }
      const signature = abiElement.name;
      const plainSig = signature.slice(0, -9); // Get the Sol func name for signature
      if (!contract[plainSig]) {
        Object.defineProperty(contract, plainSig, {
          enumerable: true,
          value: buildDefault(contract, abiElement),
          writable: false,
        });
      }
    });
    return contract;
  }
}

export function getStarknetContractFactory(contractName: string) {
  const contract = getContract(contractName);
  return new StarknetContractFactory(contract);
}
