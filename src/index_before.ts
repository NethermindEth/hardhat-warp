import * as properties from '@ethersproject/properties';
import * as providers from '@ethersproject/providers';
import * as address from '@ethersproject/address';

// @ts-ignore
providers.Formatter.prototype.address = function (address: string): string {
  try {
    const addressVal = BigInt(address);
    if (addressVal >= 2 ** 251) {
      throw new Error(`Address is not a valid starknet address ${address}`);
    }
    return address;
  } catch {
    throw new Error(`Address is not a valid starknet address ${address}`);
  }
};

// @ts-ignore
address.getAddress = (address: string): string => {
  try {
    const addressVal = BigInt(address);
    if (addressVal >= 2 ** 251) {
      throw new Error(`Address is not a valid starknet address ${address}`);
    }
    return address;
  } catch {
    throw new Error(`Address is not a valid starknet address ${address}`);
  }
};

// @ts-ignore
properties.defineReadOnly = <T, K extends keyof T>(object: T, name: K, value: T[K]) => {
  Object.defineProperty(object, name, {
    enumerable: true,
    value: value,
    writable: true,
  });
};

// @ts-ignore
address.getAddress = (address: string): string => {
  try {
    const addressVal = BigInt(address);
    if (addressVal >= 2 ** 251) {
      throw new Error(`Address is not a valid starknet address ${address}`);
    }
    return address;
  } catch {
    throw new Error(`Address is not a valid starknet address ${address}`);
  }
};

export function freedom(require: NodeRequire) {
  const properties = require('@ethersproject/properties');
  // @ts-ignore
  properties.defineReadOnly = <T, K extends keyof T>(object: T, name: K, value: T[K]) => {
    Object.defineProperty(object, name, {
      enumerable: true,
      value: value,
      writable: true,
    });
  };
}
