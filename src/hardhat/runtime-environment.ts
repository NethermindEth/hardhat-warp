import '@nomicfoundation/hardhat-toolbox';
import { extendConfig, extendEnvironment } from 'hardhat/config';
import { ethers } from 'ethers';
import { Account, ContractFactory as StarkNetContractFactory } from 'starknet';

import {
  getDefaultAccount,
  getDevnetPort,
  getDevNetPreloadedAccounts,
  getDevnetProvider,
} from '../provider';
import { ContractFactory } from '../ethers/ContractFactory';
import '../type-extensions';
import { devnet } from '../devnet';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Artifacts } from './artifacts';
import { Interface } from 'ethers/lib/utils';
import { callClassHashScript } from '@nethermindeth/warp';

export let globalHRE: HardhatRuntimeEnvironment;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fixture<T> = (signers: Account[], provider: any) => Promise<T>;

interface Snapshot<T> {
  fixture: Fixture<T>;
  data: T;
  id: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any;
  signers: Account[];
}

extendConfig((config) => {
  // TODO use the venv here to run the python script
  const venv = config.networks.integratedDevnet?.venv;
  if (!venv) {
    throw new Error(
      'A path to a venv is required in order to invoke an instance of python with cairo-lang available, please check the hardhat-warp install documentation',
    );
  }
});

extendEnvironment((hre) => {
  globalHRE = hre;

  // @ts-ignore we don't support some of the overloads of getContractFactory
  // We assume signerOrOptions is a starknet account
  hre.ethers.getContractFactory = async (name: string, signerOrOptions?: Account) => {
    if (signerOrOptions === undefined) {
      signerOrOptions = await getDefaultAccount();
    } else if (signerOrOptions instanceof Account) {
      // pass - we're happy
    } else {
      throw new Error('Factory options on getContractFactory not supported');
    }

    const solidityAbi = await (hre.artifacts as unknown as Artifacts).getArtifactAbi(name);
    const artifact = await (hre.artifacts as unknown as Artifacts).getArtifact(name);
    const cairoFile = await (hre.artifacts as unknown as Artifacts).getArtifactPath(name);
    const starknetContractFactory = new StarkNetContractFactory(
      artifact,
      callClassHashScript(cairoFile),
      signerOrOptions,
      artifact.abi,
    );
    return Promise.resolve(
      new ContractFactory(
        starknetContractFactory,
        new Interface(solidityAbi),
        signerOrOptions,
        cairoFile,
        name,
      ) as unknown as ethers.ContractFactory, // Here be dragons: we're abusing the type system to get around the fact that we don't support everything in ethers' ContractFactory
    );
  };

  //@ts-ignore
  hre.ethers.constants = {
    //@ts-ignore
    ...hre.ethers.constants,
    AddressZero: '0x0000000000000000000000000000000000000000000000000000000000000000',
  };

  // @ts-ignore hre doesn't contain the ethers type information which is set by hardhat
  hre.ethers.getSigners = async () => {
    return getDevNetPreloadedAccounts(getDevnetProvider());
  };

  // @ts-ignore hre doesn't contain the ethers type information which is set by hardhat
  hre.ethers.getSigner = async (address: string) => {
    if (address) throw new Error('Signers at exact address not supported yet');
    const [starknetSigner] = await getDevNetPreloadedAccounts(getDevnetProvider());

    // @ts-ignore type abuse
    return Promise.resolve(starknetSigner);
  };

  // @ts-ignore hre doesn't contain the ethers type information which is set by hardhat
  hre.ethers.provider.formatter.address = (address: string): string => {
    try {
      const addressVal = BigInt(address);
      if (addressVal >= 2 ** 251) {
        throw new Error(`Address is not a valid starknet address ${address}`);
      }
      return address;
    } catch {
      throw new Error(`Address is not a valid starknet address ${address}`);
    }
  };

  // @ts-ignore hre doesn't contain the ethers type information which is set by hardhat
  hre.ethers.provider.formatter.hash = (address: string): string => {
    try {
      const addressVal = BigInt(address);
      if (addressVal >= 2 ** 251) {
        throw new Error(`Address is not a valid starknet address ${address}`);
      }
      return address;
    } catch {
      throw new Error(`Address is not a valid starknet address ${address}`);
    }
  };

  const createFixtureLoader = (
    signers: Account[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: any,
  ) => {
    if (provider) throw new Error('Fixture providers not supported');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshots: Array<Snapshot<any>> = [];

    return async function load<T>(fixture: Fixture<T>): Promise<T> {
      const snapshot = snapshots.find((p) => p.fixture === fixture);
      const port = getDevnetPort();
      if (snapshot !== undefined) {
        await devnet.load(`${port}.fixture.${snapshot.id}`);
        return snapshot.data;
      } else {
        const data = await fixture(signers, provider);
        const id = snapshots.length;
        await devnet.dump(`${port}.fixture.${id}`);
        snapshots.push({ fixture, data, id, provider, signers });
        return data;
      }
    };
  };

  // @ts-ignore hre doesn't contain the waffle type information which is set by hardhat
  hre.waffle = {
    createFixtureLoader,
    // @ts-ignore
    loadFixture: createFixtureLoader(),
    // @ts-ignore
    ...hre.waffle,
  };

  hre.devnet = devnet;

  // @ts-ignore readonly property
  hre.artifacts = new Artifacts(hre.config.paths.artifacts);
});
