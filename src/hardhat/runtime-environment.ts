import { extendEnvironment } from 'hardhat/config';
import { ethers } from 'ethers';

import { getDefaultAccount, getDevNetPreloadedAccounts, getTestProvider } from '../provider';
import { WarpSigner } from '../ethers/Signer';
import { ContractFactory, getStarknetContractFactory } from '../ethers/ContractFactory';
import { getContract } from '../utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/src/signers';

type Fixture<T> = (signers: WarpSigner[], provider: any) => Promise<T>;

interface Snapshot<T> {
  fixture: Fixture<T>;
  data: T;
  id: number;
  provider: any;
  signers: WarpSigner[];
}

extendEnvironment((hre) => {
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
    const testProvider = getTestProvider();
    const starknetSigners = await getDevNetPreloadedAccounts(testProvider);

    // We use the first signer as the default account so give the user fresh ones
    const warpSigners = starknetSigners
      .map((starknetSigner) => new WarpSigner(starknetSigner))
      .slice(1);

    return Promise.resolve(warpSigners);
  };

  // @ts-ignore hre doesn't contain the ethers type information which is set by hardhat
  hre.ethers.getSigner = async (address: string) => {
    if (address) throw new Error('Signers at exact address not supported yet');
    const testProvider = getTestProvider();
    // We use the first signer as the default account so give the user a fresh one
    const [, starknetSigner] = await getDevNetPreloadedAccounts(testProvider);

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
    // eslint-disable-next-line no-unused-vars
    provider: any,
  ) => {
    if (provider) throw new Error('Fixture providers not supported');
    const snapshots: Array<Snapshot<any>> = [];

    return async function load<T>(fixture: Fixture<T>): Promise<T> {
      if (process.env.STARKNET_PROVIDER_BASE_URL === undefined)
        throw new Error('Fixtures only supported on local devnet');
      const snapshot = snapshots.find((p) => p.fixture === fixture);
      if (snapshot !== undefined) {
        await fetch(new URL('load', process.env.STARKNET_PROVIDER_BASE_URL), {
          method: 'POST',
          body: JSON.stringify({
            path: `.${snapshot.id}.snapshot`,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        return snapshot.data;
      } else {
        const data = await fixture(signers, provider);
        const id = snapshots.length;
        await fetch(new URL('dump', process.env.STARKNET_PROVIDER_BASE_URL), {
          method: 'POST',
          body: JSON.stringify({
            path: `.${id}.snapshot`,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        });

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
});
