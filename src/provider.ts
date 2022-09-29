import {SequencerProvider} from "starknet";

export function getSequencerProvder() : SequencerProvider {
  return process.env.STARKNET_PROVIDER_BASE_URL === undefined ?
        new SequencerProvider() :
        new SequencerProvider({baseUrl: process.env.STARKNET_PROVIDER_BASE_URL});
}



