import { NomicLabsHardhatPluginError } from "hardhat/plugins";
import "colors";
import { ContractInfo } from "./ethers/Contract";
import { HashInfo } from "./Hash";
import * as fs from "fs";
import * as os from 'os';
import * as path from 'path';
import {exec} from 'child_process';

export class WarpPluginError extends NomicLabsHardhatPluginError {
  constructor(message: string, parent?: Error, shouldBeReported?: boolean) {
    super("hardhat-warp", message, parent, shouldBeReported);
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
      }
    );

    process.stdin!.write(JSON.stringify(input));
    process.stdin!.end();
  });

  return JSON.parse(output);
}


export function colorLogger(str: string) {
  console.log(str.blue.bold);
}

export function checkHash(hash: HashInfo) {
  const hashes = [hash];
  let needToCompile = true;

  if (!fs.existsSync("warp_output")) {
    fs.mkdirSync("warp_output");
  }

  if (fs.existsSync("warp_output/hash.json")) {
    const readData = fs.readFileSync("warp_output/hash.json", "utf-8");
    const existingData = JSON.parse(readData) as HashInfo[];
    existingData.forEach((ctr) => {
      const temp = new HashInfo("", "");
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

  fs.writeFileSync("warp_output/hash.json", JSON.stringify(hashes));
  return needToCompile;
}

export function saveContract(contract: ContractInfo) {
  const contracts = [contract];
  if (fs.existsSync("warp_output/contracts.json")) {
    const readData = fs.readFileSync("warp_output/contracts.json", "utf-8");
    const existingData = JSON.parse(readData) as ContractInfo[];
    existingData.forEach((ctr) => {
      const temp = new ContractInfo("", "", []);
      Object.assign(temp, ctr);
      if (temp.getName() !== contract.getName()) contracts.push(temp);
    });
  }
  fs.writeFileSync("warp_output/contracts.json", JSON.stringify(contracts));
}

export function getContract(contractName: string) {
  if (!fs.existsSync("warp_output/contracts.json")) {
    throw new WarpPluginError(
      "No Starknet contracts found. Please run hardhat compile"
    );
  }

  const readData = fs.readFileSync("warp_output/contracts.json", "utf-8");
  const existingData = JSON.parse(readData) as ContractInfo[];
  const contracts = existingData.map((ctr) => {
    const temp = new ContractInfo("", "");
    Object.assign(temp, ctr);
    return temp;
  });
  const res = contracts.find((ctr) => {
    return ctr.getName() === contractName;
  });

  if (res === undefined) {
    throw new WarpPluginError(
      "Given object was not found in Starknet contracts."
    );
  }

  return res;
}

export function normalizeAddress(address: string): string {
  // For some reason starknet-devnet does not zero padd thier addresses
  // For some reason starknet zero pads their addresses
  return `0x${address.split("x")[1].padStart(64, "0")}`;
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
  return path.resolve(__dirname, '..', 'node_modules', '@nethermindeth/warp', 'nethersolc', platform, version, 'solc');
}
