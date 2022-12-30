// method id of 'Error(string)'
const ERROR_STRING_PREFIX = '0x08c379a0';

import { defaultAbiCoder } from '@ethersproject/abi';

export class WarpError extends Error {
  // These properties are needed to place nice with mocha revert matchers
  // This is a carefully crafted hack so check before changing
  name: string;
  errorArgs: string;
  errorName: string;
  data: string;
  receipt: { revertString: string };

  constructor(message: string) {
    super(message);
    const reason = this.extractRevertReason();
    // Needed for hardhat chai matchers
    const encodedReason = defaultAbiCoder.encode(['string'], [reason]).slice('0x'.length);

    this.name = 'WarpError';
    this.stack = message;
    this.errorArgs = reason;
    this.errorName = reason;
    this.data = `${ERROR_STRING_PREFIX}${encodedReason}`;
    this.receipt = { revertString: reason };
    this.message = `VM Exception while processing transaction: revert ${reason}`;
  }

  extractRevertReason(): string {
    const messageRegex = /Error\smessage:\s(.*)\n/;
    const matches = this.message.match(messageRegex);
    if (matches === null) {
      return '';
    }
    return matches[1].trim();
  }
}
