import { EventFragment } from 'ethers/lib/utils';

export const snTopicToName: { [key: string]: string } = {};
// ethTopic here referes to the keccak of "event_name + selector"
// because that's the mangling that warp produces
export const ethTopicToEvent: { [key: string]: [EventFragment, string] } = {};
