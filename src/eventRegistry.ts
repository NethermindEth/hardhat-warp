import { EventFragment } from 'ethers/lib/utils';

// ethTopic here referes to the keccak of "event_name"
// because that's the mangling that warp produces
export const ethTopicToEvent: { [key: string]: EventFragment } = {};
