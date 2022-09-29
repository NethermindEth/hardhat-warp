import {Account, SequencerProvider} from "starknet";
import {getTestAccounts} from "./utils";

// TODO use .starknet_accounts
export async function getDefaultAccount() : Promise<Account> {
  return (await getTestAccounts(getSequencerProvder()))[0]
}

export function getSequencerProvder() : SequencerProvider {
  return process.env.STARKNET_PROVIDER_BASE_URL === undefined ?
    new SequencerProvider() :
    new SequencerProvider({baseUrl: process.env.STARKNET_PROVIDER_BASE_URL});
}

