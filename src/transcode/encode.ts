import { BigNumber } from "ethers";
import { isBytes, ParamType } from "ethers/lib/utils";
import { isBigNumberish } from "@ethersproject/bignumber/lib/bignumber";
import { isPrimitiveParam, SolValue, toUintOrFelt, safeNext } from "./utils";

export function encode(types: ParamType[], inputs: SolValue[]): string[] {
  return encodeParams(types, inputs.values());
}

export function encodeParams(
  types: ParamType[],
  inputs: IterableIterator<SolValue>
): string[] {
  return types.flatMap((ty) => encode_(ty, inputs));
}

export function encode_(
  type: ParamType,
  inputs: IterableIterator<SolValue>
): string[] {
  if (isPrimitiveParam(type)) {
    return encodePrimitive(type.type, inputs);
  } else {
    return encodeComplex(type, inputs);
  }
}

function encodePrimitive(
  typeString: string,
  inputs: IterableIterator<SolValue>
): string[] {
  if (typeString.startsWith("uint")) {
    return encodeAsUintOrFelt(
      typeString,
      inputs,
      parseInt(typeString.slice(4), 10)
    );
  }
  if (typeString.startsWith("int")) {
    return encodeAsUintOrFelt(
      typeString,
      inputs,
      parseInt(typeString.slice(3), 10)
    );
  }
  if (typeString === "address") {
    return encodeAsUintOrFelt(typeString, inputs, 251);
  }
  if (typeString === "bool") {
    const val = safeNext(inputs);
    if (typeof val === "boolean") {
      return val ? ["1"] : ["0"];
    }
  }
  if (typeString === "fixed" || typeString === "ufixed") {
    throw new Error("Fixed types not supported by Warp");
  }
  if (/byte\d*$/.test(typeString)) {
    const nbits = parseInt(typeString.slice(4), 10) * 8;
    return encodeAsUintOrFelt(typeString, inputs, nbits);
  }
  if (typeString === "bytes") {
    let value = safeNext(inputs);
    if (typeof value === "string") {
      // remove 0x
      value = value.substring(2);
      const length = value.length / 2;
      if (length !== Math.floor(length)) throw new Error("bytes must be even");

      const cairoBytes: string[] = [];
      for (let index = 0; index < value.length; index += 2) {
        const byte = value.substring(index, index + 2);
        cairoBytes.push(`0x${byte}`);
      }
      return [length.toString(), cairoBytes].flat();
    } else if (isBytes(value)) {
      const length = value.length / 2;
      if (length % 2 !== 0) throw new Error("bytes must be even");

      const bytes = Array.from(value).map((byte) => byte.toString());
      return [length.toString(), ...bytes];
    }
    throw new Error(`Can't encode ${value} as bytes`);
  }
  throw new Error(`Failed to encode type ${typeString}`);
}

export function encodeComplex(
  type: ParamType,
  inputs: IterableIterator<SolValue>
): string[] {
  const value = safeNext(inputs);

  if (type.baseType === "array") {
    if (!Array.isArray(value)) throw new Error(`Array must be of array type`);
    // array type
    const length = type.arrayLength === -1 ? [value.length.toString()] : [];
    return [
      ...length,
      ...value.flatMap((val) => encode_(type.arrayChildren, makeIterator(val))),
    ];
  } else if (type.baseType === "tuple") {
    if (typeof value !== "object") {
      throw new Error("Expected Object input for transcoding tuple types");
    }

    const value_ = value as { [key: string]: SolValue };
    const tupleValues = Object.values(value_);

    return type.components.flatMap((type, index) =>
      encode_(type, makeIterator(tupleValues[index]))
    );
  }
  throw new Error(`Can't encode complex type ${type}`);
}

export function makeIterator(value: SolValue) {
  if (Array.isArray(value)) {
    return value.values();
  }

  return [value].values();
}

export function encodeAsUintOrFelt(
  tp: string,
  inputs: IterableIterator<SolValue>,
  nbits: number
): string[] {
  const value = safeNext(inputs);
  if (isBigNumberish(value)) {
    return toUintOrFelt(BigNumber.from(value).toBigInt(), nbits).map((x) =>
      x.toString()
    );
  }
  throw new Error(`Can't encode ${value} as ${tp}`);
}
