import { BigNumberish } from 'ethers';
import { ParamType } from 'ethers/lib/utils';

export type SolValue = BigNumberish | boolean | string | { [key: string]: SolValue } | SolValue[];

export function getWidthInFeltsOf(type: ParamType): number {
  if (type.baseType.startsWith('uint')) {
    const width = parseInt(type.baseType.slice(4), 10);
    return width < 256 ? 1 : 2;
  } else if (type.baseType.startsWith('int')) {
    const width = parseInt(type.baseType.slice(3), 10);
    return width < 256 ? 1 : 2;
  } else if (type.baseType.startsWith('address')) {
    return 1;
  } else if (type.baseType.startsWith('bool')) {
    return 1;
  } else if (/byte\d*$/.test(type.baseType)) {
    const width = parseInt(type.baseType.slice(4), 10);
    return width * 8;
  } else if (type.baseType.startsWith('ufixed') || type.baseType.startsWith('fixed')) {
    throw new Error('Fixed types not supported by Warp');
  } else if (type.baseType.startsWith('bytes')) {
    throw new Error('Nested dynamic types not supported in Warp');
  } else if (type.indexed) {
    // array
    if (type.arrayLength === -1) {
      throw new Error('Nested dynamic types not supported in Warp');
    } else {
      // static array
      return type.arrayLength * getWidthInFeltsOf(type.arrayChildren);
    }
  } else if (type.components.length !== 0) {
    // struct
    return type.components.reduce((acc, ty) => {
      return acc + getWidthInFeltsOf(ty);
    }, 0);
  }
  throw new Error('Not Supported ' + type.baseType);
}

export function divmod(x: bigint, y: bigint): [bigint, bigint] {
  const div = BigInt(x / y);
  const rem = BigInt(x % y);
  return [div, rem];
}

export function isPrimitiveParam(type: ParamType): boolean {
  // because why use types in a sensisble manner?
  // indexed can be false or null for primitive types
  return type.arrayLength === null && type.components === null;
}

const uint128 = BigInt('0x100000000000000000000000000000000');

export function toUintOrFelt(value: bigint, nBits: number): bigint[] {
  const val = bigintToTwosComplement(BigInt(value.toString()), nBits);
  if (nBits > 251) {
    const [high, low] = divmod(val, uint128);
    return [low, high];
  } else {
    return [val];
  }
}
export function bigintToTwosComplement(val: bigint, width: number): bigint {
  if (val >= 0n) {
    // Non-negative values just need to be truncated to the given bitWidth
    const bits = val.toString(2);
    return BigInt(`0b${bits.slice(-width)}`);
  } else {
    // Negative values need to be converted to two's complement
    // This is done by flipping the bits, adding one, and truncating
    const absBits = (-val).toString(2);
    const allBits = `${'0'.repeat(Math.max(width - absBits.length, 0))}${absBits}`;
    const inverted = `0b${[...allBits].map((c) => (c === '0' ? '1' : '0')).join('')}`;
    const twosComplement = (BigInt(inverted) + 1n).toString(2).slice(-width);
    return BigInt(`0b${twosComplement}`);
  }
}

export function twosComplementToBigInt(val: bigint, width: number): bigint {
  const mask = 2n ** BigInt(width) - 1n;
  const max = 2n ** BigInt(width - 1) - 1n;
  if (val > max) {
    // Negative number
    const pos = (val ^ mask) + 1n;
    return -pos;
  } else {
    // Positive numbers as are
    return val;
  }
}

export function safeNext<T>(iter: IterableIterator<T>): T {
  const next = iter.next();
  if (!next.done) {
    return next.value;
  }
  throw new Error('Unexpected end of input in Solidity to Cairo encode');
}
