import { NomicLabsHardhatPluginError } from 'hardhat/plugins';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GetTransactionTraceResponse } from 'starknet';
import { globalHRE } from './hardhat/runtime-environment';
import { getDevnetPort } from './provider';

export class WarpPluginError extends NomicLabsHardhatPluginError {
  constructor(message: string, parent?: Error, shouldBeReported?: boolean) {
    super('hardhat-warp', message, parent, shouldBeReported);
  }
}

export function normalizeAddress(address: string): string {
  // For some reason starknet-devnet does not zero padd thier addresses
  // For some reason starknet zero pads their addresses
  return `0x${address.split('x')[1].padStart(64, '0')}`;
}

export function warpPath(): string {
  return path.resolve(require.resolve('@nethermindeth/warp'), '..', '..', 'bin', 'warp');
}

export type StarknetDevnetGetAccountsResponse = {
  address: string;
  initial_balance: number;
  private_key: string;
  public_key: string;
};

export async function getContractNames(inputPath: string) {
  const plainSolCode = fs.readFileSync(inputPath, 'utf-8');
  const solCode = plainSolCode.split('\n');

  const contracts = solCode
    .map((line) => {
      const [contract, name] = line.split(new RegExp('[ ]+'));
      if (contract !== 'contract') return '';
      return name;
    })
    .filter((val) => val !== '');
  return contracts;
}

export function calculateStarkNetAddress(
  salt: string,
  classHash: string,
  constructorCalldata: string,
  deployAddress: string,
): string {
  if (!globalHRE.config.networks.integratedDevnet.venv)
    throw new Error(
      'A path to venv with starknet-devnet is required, please check the hardhat-warp install documentation',
    );
  const WARP_VENV_PREFIX = path.resolve(globalHRE.config.networks.integratedDevnet.venv, 'bin');

  const PATH_PREFIX = `PATH=${WARP_VENV_PREFIX}:$PATH`;
  const SCRIPT_PATH = path.resolve(__dirname, '..', 'script', 'calculate_address.py');

  const output = execSync(
    `${PATH_PREFIX} python ${SCRIPT_PATH} ${salt} ${classHash} ${constructorCalldata} ${deployAddress}`,
  )
    .toString('utf-8')
    .trim();
  return output;
}

export function getContractsToDeclare(path: string): { [name: string]: string } {
  const declareRegex = /\/\/\s@declare\s(.*)\.cairo\s*\nconst\s.*\s=\s(.*);/g;
  const cairoFile = fs.readFileSync(path, 'utf-8');
  const matches = cairoFile.matchAll(declareRegex);
  return Object.fromEntries([...matches].map((match) => [match[1].trim(), match[2].trim()]));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Benchmark = { [file: string]: any };

export function benchmark(
  pathToCairoFile: string,
  functionName: string,
  txTrace: GetTransactionTraceResponse,
) {
  let benchmarkJSON: Benchmark = {};
  const port = getDevnetPort();
  try {
    benchmarkJSON = JSON.parse(
      fs.readFileSync(`.${port}.benchmark.json`, 'utf-8') || '{}',
    ) as Benchmark;
  } catch {
    benchmarkJSON = {};
  }
  benchmarkJSON[pathToCairoFile] = (benchmarkJSON[pathToCairoFile] || []).concat([
    {
      [functionName]: txTrace?.function_invocation?.execution_resources,
    },
  ]);
  fs.writeFileSync(`.${port}.benchmark.json`, JSON.stringify(benchmarkJSON, null, 2));
}

export function getCompiledCairoFile(path: string) {
  return path.slice(0, -6).concat('_compiled.json');
}
