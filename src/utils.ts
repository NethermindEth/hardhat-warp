import { NomicLabsHardhatPluginError } from 'hardhat/plugins';
import 'colors';
import { HashInfo } from './Hash';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec, execSync } from 'child_process';
import { GetTransactionTraceResponse } from 'starknet/dist/types/api';

export class WarpPluginError extends NomicLabsHardhatPluginError {
  constructor(message: string, parent?: Error, shouldBeReported?: boolean) {
    super('hardhat-warp', message, parent, shouldBeReported);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function compile(input: any): Promise<any> {
  const output: string = await new Promise((resolve, reject) => {
    const process = exec(
      // TODO: support both sol 7 aswell
      `${nethersolcPath('8')} --standard-json`,
      {
        maxBuffer: 1024 * 1024 * 1024 * 1024,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: any, stdout: any) => {
        if (err !== null) {
          return reject(err);
        }
        resolve(stdout);
      },
    );

    if (process.stdin) {
      process.stdin.write(JSON.stringify(input));
      process.stdin.end();
    }
  });

  return JSON.parse(output);
}

export function colorLogger(str: string) {
  console.log(str.blue.bold);
}

export function checkHash(hash: HashInfo) {
  const hashes = [hash];
  let needToCompile = true;

  if (!fs.existsSync('warp_output')) {
    fs.mkdirSync('warp_output');
  }

  if (fs.existsSync('warp_output/hash.json')) {
    const readData = fs.readFileSync('warp_output/hash.json', 'utf-8');
    const existingData = JSON.parse(readData) as HashInfo[];
    existingData.forEach((ctr) => {
      const temp = new HashInfo('', '');
      Object.assign(temp, ctr);
      if (temp.getSolidityFile() === hash.getSolidityFile()) {
        if (temp.getHash() === hash.getHash()) {
          needToCompile = false;
        }
      } else {
        hashes.push(temp);
      }
    });
  }

  fs.writeFileSync('warp_output/hash.json', JSON.stringify(hashes));
  return needToCompile;
}

export function saveContract(contract: ContractInfo) {
  const contracts = [contract];
  if (fs.existsSync('warp_output/contracts.json')) {
    const readData = fs.readFileSync('warp_output/contracts.json', 'utf-8');
    const existingData = JSON.parse(readData) as ContractInfo[];
    existingData.forEach((ctr) => {
      const temp = new ContractInfo('', '');
      Object.assign(temp, ctr);
      if (temp.getName() !== contract.getName()) contracts.push(temp);
    });
  }
  fs.writeFileSync('warp_output/contracts.json', JSON.stringify(contracts));
}

export function getContract(contractName: string) {
  if (!fs.existsSync('warp_output/contracts.json')) {
    throw new WarpPluginError('No Starknet contracts found. Please run hardhat compile');
  }

  const readData = fs.readFileSync('warp_output/contracts.json', 'utf-8');
  const existingData = JSON.parse(readData) as ContractInfo[];
  const contracts = existingData.map((ctr) => {
    const temp = new ContractInfo('', '');
    Object.assign(temp, ctr);
    return temp;
  });
  const res = contracts.find((ctr) => {
    return ctr.getName() === contractName;
  });

  if (res === undefined) {
    throw new WarpPluginError('Given object was not found in Starknet contracts.');
  }

  return res;
}

export function normalizeAddress(address: string): string {
  // For some reason starknet-devnet does not zero padd thier addresses
  // For some reason starknet zero pads their addresses
  return `0x${address.split('x')[1].padStart(64, '0')}`;
}

/////////////// nethersolc

type SupportedPlatforms = 'linux_x64' | 'darwin_x64' | 'darwin_arm64';
export type SupportedSolcVersions = '7' | '8';

function getPlatform(): SupportedPlatforms {
  const platform = `${os.platform()}_${os.arch()}`;

  switch (platform) {
    case 'linux_x64':
    case 'darwin_x64':
    case 'darwin_arm64':
      return platform;
    default:
      throw new Error(`Unsupported plaform ${platform}`);
  }
}

export function nethersolcPath(version: SupportedSolcVersions): string {
  const platform = getPlatform();
  return path.resolve(
    __dirname,
    '..',
    'node_modules',
    '@nethermindeth/warp',
    'nethersolc',
    platform,
    version,
    'solc',
  );
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
      // eslint-disable-next-line no-unused-vars
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
  const WARP_VENV_PREFIX = path.resolve(
    __dirname,
    '..',
    'node_modules',
    '@nethermindeth',
    'warp',
    'warp_venv',
    'bin',
  );

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
  const declareRegex = /\/\/\s@declare\s.*__WC__(.*)\.cairo\s*\nconst\s.*\s=\s(.*);/g;
  const cairoFile = fs.readFileSync(path, 'utf-8');
  const matches = cairoFile.matchAll(declareRegex);
  return Object.fromEntries([...matches].map((match) => [match[1], match[2]]));
}

type Benchmark = { [file: string]: any };

export function benchmark(
  pathToCairoFile: string,
  functionName: string,
  txTrace: GetTransactionTraceResponse,
) {
  let benchmarkJSON: Benchmark = {};
  try {
    benchmarkJSON = JSON.parse(fs.readFileSync('benchmark.json', 'utf-8') || '{}') as Benchmark;
  } catch {
    benchmarkJSON = {};
  }
  benchmarkJSON[pathToCairoFile] = (benchmarkJSON[pathToCairoFile] || []).concat([
    {
      [functionName]: txTrace?.function_invocation?.execution_resources,
    },
  ]);
  fs.writeFileSync('benchmark.json', JSON.stringify(benchmarkJSON, null, 2));
}

export function getCompiledCairoFile(path: string) {
  return path.slice(0, -6).concat('_compiled.json');
}

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
