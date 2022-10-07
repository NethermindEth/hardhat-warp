import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/src/signers';
import { extendConfig, extendEnvironment } from 'hardhat/config';
import { ethers } from 'ethers';

import { getDefaultAccount, getDevNetPreloadedAccounts, getDevnetProvider } from '../provider';
import { WarpSigner } from '../ethers/Signer';
import { ContractFactory, getStarknetContractFactory } from '../ethers/ContractFactory';
import { getContract } from '../utils';
import '../type-extensions';
import { devnet } from '../devnet';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

export let globalHRE: HardhatRuntimeEnvironment;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fixture<T> = (signers: WarpSigner[], provider: any) => Promise<T>;

interface Snapshot<T> {
  fixture: Fixture<T>;
  data: T;
  id: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any;
  signers: WarpSigner[];
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
  // @ts-ignore hre doesn't contain the ethers type information which is set by hardhat
  const getContractFactory = hre.ethers.getContractFactory;

  // @ts-ignore we don't support some of the overloads of getContractFactory
  hre.ethers.getContractFactory = async (name: string, signerOrOptions?: ethers.Signer) => {
    if (signerOrOptions === undefined) {
      signerOrOptions = new WarpSigner(await getDefaultAccount());
    } else if (signerOrOptions instanceof ethers.Signer) {
      // pass - we're happy
    } else {
      throw new Error('Factory options on getContractFactory not supported');
    }
    const ethersContractFactory = await getContractFactory(name, signerOrOptions);
    const starknetContractFactory = await getStarknetContractFactory(name);
    const contract = getContract(name);
    const cairoFile = contract.getCairoFile().slice(0, -6).concat('.cairo');
    return Promise.resolve(
      new ContractFactory(
        starknetContractFactory,
        ethersContractFactory,
        cairoFile,
      ) as ethers.ContractFactory,
    );
  };

  // @ts-ignore hre doesn't contain the ethers type information which is set by hardhat
  hre.ethers.getSigners = async () => {
    const starknetSigners = await getDevNetPreloadedAccounts(getDevnetProvider());

    // We use the first signer as the default account so give the user fresh ones
    const warpSigners = starknetSigners.map((starknetSigner) => new WarpSigner(starknetSigner));

    return Promise.resolve(warpSigners);
  };

  // @ts-ignore hre doesn't contain the ethers type information which is set by hardhat
  hre.ethers.getSigner = async (address: string) => {
    if (address) throw new Error('Signers at exact address not supported yet');
    const [starknetSigner] = await getDevNetPreloadedAccounts(getDevnetProvider());

    const warpSigner = new WarpSigner(starknetSigner);

    // @ts-ignore type abuse
    return Promise.resolve(warpSigner as SignerWithAddress);
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
    signers: WarpSigner[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: any,
  ) => {
    if (provider) throw new Error('Fixture providers not supported');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshots: Array<Snapshot<any>> = [];

    return async function load<T>(fixture: Fixture<T>): Promise<T> {
      const snapshot = snapshots.find((p) => p.fixture === fixture);
      if (snapshot !== undefined) {
        await devnet.load('fixture.' + snapshot.id);
        return snapshot.data;
      } else {
        const data = await fixture(signers, provider);
        const id = snapshots.length;
        await hre.devnet.dump('fixture.' + id);
        snapshots.push({ fixture, data, id, provider, signers });
        return data;
      }
    };
  };

  // @ts-ignore hre doesn't contain the waffle type information which is set by hardhat
  hre.waffle = {
    createFixtureLoader: createFixtureLoader,
    // @ts-ignore
    loadFixture: createFixtureLoader(),
  };

  hre.devnet = devnet;
});
