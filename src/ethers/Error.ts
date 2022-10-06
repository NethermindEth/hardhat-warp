export class WarpError extends Error {
  // These properties are needed to place nice with mocha revert matchers
  // This is a carefully crafted hack so check before changing
  name: string;
  errorArgs: string;
  errorName: string;
  receipt: { revertString: string };

  constructor(message: string) {
    super(message);
    this.name = 'WarpError';
    this.stack = message;

    const reason = this.extractRevertReason();
    this.errorArgs = reason;
    this.errorName = reason;
    this.receipt = { revertString: reason };
    this.message = 'revert';
  }

  extractRevertReason(): string {
    const messageRegex = /Error\smessage:\s(.*)\n/;
    const matches = this.message.match(messageRegex);
    if (matches === null) {
      console.warn(`Could not extract revert reason`);
      return '';
    }
    return matches[1];
  }
}
