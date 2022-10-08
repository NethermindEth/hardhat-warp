import { Account, ProviderInterface, SequencerProvider, ec } from 'starknet';
import { globalHRE } from './hardhat/runtime-environment';
import { StarknetDevnetGetAccountsResponse } from './utils';

export function getDevnetUrl(): string {
  const url =
    process.env.STARKNET_PROVIDER_BASE_URL || globalHRE.config.networks.integratedDevnet.url;
  if (!url)
    throw new Error(
      'Expected a devnet url to be sent as STARKNET_PROVIDER_BASE_URL or in the networks.integratedDevnet config',
    );
  return url;
}

export function getDevnetPort(): string {
  const url =
    process.env.STARKNET_PROVIDER_BASE_URL || globalHRE.config.networks.integratedDevnet.url;
  if (!url)
    throw new Error(
      'Expected a devnet url to be sent as STARKNET_PROVIDER_BASE_URL or in the networks.integratedDevnet config',
    );
  return new URL(url).port;
}

export async function getStarkNetDevNetAccounts(): Promise<
  Array<StarknetDevnetGetAccountsResponse>
> {
  const response = await fetch(`${getDevnetUrl()}/predeployed_accounts`, {
    method: 'GET',
  });
  return response.json();
}

// TODO use .starknet_accounts
export async function getDefaultAccount(): Promise<Account> {
  return (await getDevNetPreloadedAccounts(getDevnetProvider()))[0];
}

// Singleton
let provider: SequencerProvider;
export function getDevnetProvider(): SequencerProvider {
  if (provider) return provider;
  provider = new SequencerProvider({ baseUrl: getDevnetUrl() });
  const originalWaitForTransaction = provider.waitForTransaction.bind(provider);
  provider.waitForTransaction = (txHash: string, retryInterval: number) => {
    return originalWaitForTransaction(txHash, retryInterval || 1000);
  };
  return provider;
}

// test account with fee token balance
export const getDevNetPreloadedAccounts = async (provider: ProviderInterface) =>
  (await getStarkNetDevNetAccounts()).map(
    (account) => new Account(provider, account.address, ec.getKeyPair(account.private_key)),
  );
