import {
  Account,
  ProviderInterface,
  RpcProvider,
  SequencerProvider,
  ec,
  json,
} from "starknet";

const DEFAULT_TEST_PROVIDER_BASE_URL = "http://127.0.0.1:5050/";
const DEFAULT_TEST_ACCOUNT_ADDRESS = // run `starknet-devnet --seed 0` and this will be the first account
  "0x7e00d496e324876bbc8531f2d9a82bf154d1a04a50218ee74cdd372f75a551a";
const DEFAULT_TEST_ACCOUNT_PRIVATE_KEY = "0xe3e70682c2094cac629f6fbed82c07cd";

const DEFAULT_TEST_ACCOUNTS = [
  {
    privateKey: "0xe3e70682c2094cac629f6fbed82c07cd",
    publicKey:
      "0x7e52885445756b313ea16849145363ccb73fb4ab0440dbac333cf9d13de82b9",
    address:
      "0x7e00d496e324876bbc8531f2d9a82bf154d1a04a50218ee74cdd372f75a551a",
  },
  {
    privateKey: "0xf728b4fa42485e3a0a5d2f346baa9455",
    publicKey:
      "0x175666e92f540a19eb24fa299ce04c23f3b75cb2d2332e3ff2021bf6d615fa5",
    address:
      "0x69b49c2cc8b16e80e86bfc5b0614a59aa8c9b601569c7b80dde04d3f3151b79",
  },
];

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
export const getTestAccounts = (provider: ProviderInterface) => {
  return  [new Account(
    provider,
    DEFAULT_TEST_ACCOUNTS[0].address,
    ec.getKeyPair(DEFAULT_TEST_ACCOUNTS[0].privateKey)
  ), new Account(
    provider,
    DEFAULT_TEST_ACCOUNTS[1].address,
    ec.getKeyPair(DEFAULT_TEST_ACCOUNTS[1].privateKey)
  )];
};
