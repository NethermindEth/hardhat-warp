import {ContractInfo} from '../Contract';
import {getContract} from '../utils';
import {AsyncContractFunction, Contract, ContractFactory, defaultProvider, FunctionAbi, json, Provider} from 'starknet';
import {readFileSync} from 'fs';


function buildCall(contract: Contract, functionAbi: FunctionAbi): AsyncContractFunction {
  return async function(...args: Array<any>): Promise<any> {
    const res = await contract.call(functionAbi.name, args);
    return res[0];
  };
}

function buildInvoke(contract: Contract, functionAbi: FunctionAbi): AsyncContractFunction {
  return async function(...args: Array<any>): Promise<any> {
    const {inputs} = functionAbi;
    const inputsLength = inputs.reduce((acc, input) => {
      if (!/_len$/.test(input.name)) {
        return acc + 1;
      }
      return acc;
    }, 0);
    const options = {};
    if (inputsLength + 1 === args.length && typeof args[args.length - 1] === 'object') {
      Object.assign(options, args.pop());
    }
    return contract.invoke(functionAbi.name, args, options);
  };
}

function buildDefault(cairoContract: Contract, cairoFunctionAbi: FunctionAbi): AsyncContractFunction {
  if (cairoFunctionAbi.stateMutability === 'view') {
    return buildCall(cairoContract, cairoFunctionAbi);
  }
  return buildInvoke(cairoContract, cairoFunctionAbi);
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
      if (!contract.functions[plainSig]) {
        Object.defineProperty(contract.functions, plainSig, {
          enumerable: true,
          value: buildDefault(contract, abiElement),
          writable: false,
        });
      }

      if (!contract.callStatic[plainSig]) {
        Object.defineProperty(contract.callStatic, plainSig, {
          enumerable: true,
          value: buildCall(contract, abiElement),
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
