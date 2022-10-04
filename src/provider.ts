import {
  Account,
  ProviderInterface,
  RpcProvider,
  SequencerProvider,
  ec,
} from "starknet";
import {getKeyPair} from "starknet/dist/utils/ellipticCurve";
import {StarknetDevnetGetAccountsResponse} from "./utils";

export async function getStarkNetDevNetAccounts(): Promise<
  Array<StarknetDevnetGetAccountsResponse>
> {
  const devnetBaseURL = process.env.STARKNET_PROVIDER_BASE_URL ||  "http://127.0.0.1:5050";
  const response = await fetch(
    `${devnetBaseURL}/predeployed_accounts`,
    { method: "GET" }
  );
  return response.json();
}

export async function restartDevnet(): Promise<boolean> {
  const devnetBaseURL = process.env.STARKNET_PROVIDER_BASE_URL ||  "http://127.0.0.1:5050";
  const response = await fetch(`${devnetBaseURL}/restart`, { method: "POST" });
  return response.status === 200;
}

// TODO use .starknet_accounts
export async function getDefaultAccount() : Promise<Account> {
  return (await getDevNetPreloadedAccounts(getSequencerProvder()))[0]
}

export function getSequencerProvder() : SequencerProvider {
  const provider = process.env.STARKNET_PROVIDER_BASE_URL === undefined ?
    new SequencerProvider() :
    new SequencerProvider({baseUrl: process.env.STARKNET_PROVIDER_BASE_URL});

  // if (IS_SEQUENCER_DEVNET) {
  //   // accelerate the tests when running locally
  //   const originalWaitForTransaction = provider.waitForTransaction.bind(
  //     provider
  //   );
  //   provider.waitForTransaction = (txHash: string, retryInterval: any) => {
  //     return originalWaitForTransaction(txHash, retryInterval || 1000);
  //   };
  // }
  return provider;
}

// TODO clean this up and unify with the provider getters above
const DEFAULT_TEST_PROVIDER_BASE_URL = "http://127.0.0.1:5050/";

const BASE_URL =
  process.env.TEST_PROVIDER_BASE_URL || DEFAULT_TEST_PROVIDER_BASE_URL;
const RPC_URL = process.env.TEST_RPC_URL;

const IS_RPC = !!RPC_URL;
const IS_RPC_DEVNET = Boolean(
  RPC_URL && (RPC_URL.includes("localhost") || RPC_URL.includes("127.0.0.1"))
);
const IS_SEQUENCER = !IS_RPC;
const IS_SEQUENCER_DEVNET = !BASE_URL.includes("starknet.io");
export const IS_DEVNET = IS_SEQUENCER ? IS_SEQUENCER_DEVNET : IS_RPC_DEVNET;

export const getTestProvider = () => {
  const provider = RPC_URL
    ? new RpcProvider({ nodeUrl: RPC_URL })
    : new SequencerProvider({ baseUrl: BASE_URL });

  // if (IS_DEVNET) {
  //   // accelerate the tests when running locally
  //   const originalWaitForTransaction = provider.waitForTransaction.bind(
  //     provider
  //   );
  //   provider.waitForTransaction = (txHash: string, retryInterval: any) => {
  //     return originalWaitForTransaction(txHash, retryInterval || 1000);
  //   };
  // }

  return provider;
};

// test account with fee token balance
export const getDevNetPreloadedAccounts = async (provider: ProviderInterface) =>
  (await getStarkNetDevNetAccounts()).map((account) => new Account(
    provider,
    account.address,
    ec.getKeyPair(account.private_key)
));
