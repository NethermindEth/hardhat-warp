import {
  Account,
  ProviderInterface,
  RpcProvider,
  SequencerProvider,
  ec,
} from "starknet";
import {getStarkNetDevNetAccounts} from "./utils";

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

  if (IS_DEVNET) {
    // accelerate the tests when running locally
    const originalWaitForTransaction = provider.waitForTransaction.bind(
      provider
    );
    provider.waitForTransaction = (txHash: string, retryInterval: any) => {
      return originalWaitForTransaction(txHash, retryInterval || 1000);
    };
  }

  return provider;
};

// test account with fee token balance
export const getTestAccounts = async (provider: ProviderInterface) =>
  (await getStarkNetDevNetAccounts()).map((account) => new Account(
    provider,
    account.address,
    ec.getKeyPair(account.private_key)
));
