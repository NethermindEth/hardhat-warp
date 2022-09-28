import { BigNumber, BigNumberish } from "ethers";
import BN from "bn.js";
import { ParamType } from "ethers/lib/utils";
import { bigintToTwosComplement, SolValue } from "./encode";
import assert from "assert";

export function abiEncode(tp: ParamType[], value: SolValue[]): string {
  const stream = value.values();
  const result = "0x" + tp.flatMap((ty) => abiEncode_(ty, stream)).join("");
  console.log("abiencoding final", result);
  return result;
}

export function abiEncode_(
  tp: ParamType,
  values: IterableIterator<SolValue>
): string[] {
  console.log(`abiencoding ${tp.baseType}`);
  if (tp.baseType.startsWith("uint") || tp.baseType.startsWith("address")) {
    const uint = BigInt(values.next().value);
    return [uint.toString(16).padStart(64, "0")];
  } else if (tp.baseType.startsWith("int")) {
    const width = parseInt(tp.baseType.slice(3), 10);
    const value = BigInt(values.next().value);
    const isNegative = value < 0n;
    const int = bigintToTwosComplement(value, width);
    return [int.toString(16).padStart(64, isNegative ? "f" : "0")];
  } else if (tp.baseType.startsWith("bool")) {
    const bool = Number(values.next().value === "true");
    return [bool.toString().padStart(2, "0")];
  } else if (/byte\d*$/.test(tp.baseType)) {
    const width = parseInt(tp.baseType.slice(4), 10);
    const bytes = BigInt(values.next().value);
    return [bytes.toString(16).padEnd((width * 8) / 4, "0")];
  } else if (tp.baseType.startsWith("bytes")) {
    let value = values.next().value;
    if (typeof value !== "string") {
      throw new Error(`Can't encode ${value} as bytesType`);
    }
    // removing 0x
    value = value.substring(2);
    const length = value.length / 2;
    if (length % 2 !== 0) throw new Error("bytes must be even");

    const bytes: string[] = [];
    for (let index = 0; index < value.length; index += 2) {
      const byte = value.substring(index, index + 2);
      bytes.push(BigInt(byte).toString(16).padEnd(2, "0"));
    }
    const encoded = [length.toString(16).padStart(64, "0"), bytes].join("");
    const mod = encoded.length % 64;
    const padded =
      mod == 0
        ? encoded
        : encoded.padEnd(Math.floor(encoded.length / 64) + 1, "0");
    return [padded];
  } else if (tp.baseType.startsWith("tuple")) {
    const value = values.next().value;
    if (!(value instanceof Array)) {
      throw new Error(`Can't abi encode ${value} as tupleType`);
    }
    return value.flatMap((v: SolValue, index) =>
      abiEncode_(tp.components[index], [v].values())
    );
  } else if (tp.indexed === true) {
    const value = values.next().value;
    if (!(value instanceof Array)) {
      throw new Error(`Can't abi encode ${value} as arrayType`);
    }
    if (tp.arrayLength === -1) {
      return [
        value.length.toString(),
        ...value.flatMap((v) => abiEncode_(tp.arrayChildren, v)),
      ];
    } else {
      return value.flatMap((v) => abiEncode_(tp.arrayChildren, v));
    }
  }
  throw new Error(`Can't abi encode type ${tp}`);
}
