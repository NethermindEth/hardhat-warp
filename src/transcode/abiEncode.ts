import { AbiCoder, ParamType } from 'ethers/lib/utils';
import { Logger } from '@ethersproject/logger';
import { Coder, Reader } from '@ethersproject/abi/lib/coders/abstract-coder';
import { AddressCoder } from '@ethersproject/abi/lib/coders/address';
import { ArrayCoder } from '@ethersproject/abi/lib/coders/array';
import { BooleanCoder } from '@ethersproject/abi/lib/coders/boolean';
import { BytesCoder } from '@ethersproject/abi/lib/coders/bytes';
import { FixedBytesCoder } from '@ethersproject/abi/lib/coders/fixed-bytes';
import { NullCoder } from '@ethersproject/abi/lib/coders/null';
import { NumberCoder } from '@ethersproject/abi/lib/coders/number';
import { StringCoder } from '@ethersproject/abi/lib/coders/string';
import { TupleCoder } from '@ethersproject/abi/lib/coders/tuple';
import { version } from '@ethersproject/abi/lib/_version';
import { normalizeAddress } from '../utils';

const logger = new Logger(version);
const paramTypeBytes = new RegExp(/^bytes([0-9]*)$/);
const paramTypeNumber = new RegExp(/^(u?int)([0-9]*)$/);

class WarpAbiCoder extends AbiCoder {
  getAddressCoder(param: ParamType) {
    const addressCoder = new AddressCoder(param.name);
    addressCoder.encode = (writer, value) => {
      const addressVal = BigInt(value);
      if (addressVal >= 2 ** 251) {
        throw new Error(`Address is not a valid starknet address ${value}`);
      }
      return writer.writeValue(value);
    };
    addressCoder.decode = (reader: Reader) => {
      return normalizeAddress(reader.readValue().toHexString());
    };
    return addressCoder;
  }

  _getCoder(param: ParamType): Coder {
    switch (param.baseType) {
      case 'address':
        return this.getAddressCoder(param);
      case 'bool':
        return new BooleanCoder(param.name);
      case 'string':
        return new StringCoder(param.name);
      case 'bytes':
        return new BytesCoder(param.name);
      case 'array':
        return new ArrayCoder(this._getCoder(param.arrayChildren), param.arrayLength, param.name);
      case 'tuple':
        return new TupleCoder(
          (param.components || []).map((component) => {
            return this._getCoder(component);
          }),
          param.name,
        );
      case '':
        return new NullCoder(param.name);
    }

    // u?int[0-9]*
    let match = param.type.match(paramTypeNumber);
    if (match) {
      const size = parseInt(match[2] || '256');
      if (size === 0 || size > 256 || size % 8 !== 0) {
        logger.throwArgumentError('invalid ' + match[1] + ' bit length', 'param', param);
      }
      return new NumberCoder(size / 8, match[1] === 'int', param.name);
    }

    // bytes[0-9]+
    match = param.type.match(paramTypeBytes);
    if (match) {
      const size = parseInt(match[1]);
      if (size === 0 || size > 32) {
        logger.throwArgumentError('invalid bytes length', 'param', param);
      }
      return new FixedBytesCoder(size, param.name);
    }

    return logger.throwArgumentError('invalid type', 'type', param.type);
  }
}

export const abiCoder = new WarpAbiCoder();
