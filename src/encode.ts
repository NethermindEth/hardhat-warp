import { BigNumber, BigNumberish } from "ethers";
import BN from "bn.js";
import { ParamType, Result } from "ethers/lib/utils";
import {
  AddressType,
  ArrayType,
  BoolType,
  BuiltinStructType,
  BuiltinType,
  BytesType,
  ContractDefinition,
  EnumDefinition,
  FixedBytesType,
  FunctionType,
  IntType,
  MappingType,
  parse,
  PointerType,
  StringType,
  TypeNameType,
  TypeNode,
  UserDefinedType,
  TupleType,
} from "solc-typed-ast";

export type SolValue = string | SolValue[];

function format(paramType: ParamType): string {
  if (paramType.type === "tuple") {
    return `tuple(${paramType.components.map(format).join(",")})`;
  } else if (paramType.arrayChildren !== null) {
    return `${format(paramType.arrayChildren)}[${
      paramType.arrayLength >= 0 ? paramType.arrayLength : ""
    }]`;
  } else {
    return paramType.type;
  }
}

export function paramTypeToTypeNode(ty: ParamType) {
  const res = parse(format(ty), {
    ctx: undefined,
    version: undefined,
  }) as TypeNode;
  return res;
}

export function encodeValueOuter(
  tp: TypeNode,
  value: SolValue,
  compilerVersion: string
): string[] {
  return encodeValue(tp, value, compilerVersion);
}

export function encodeValue(
  tp: TypeNode,
  value: SolValue,
  compilerVersion: string
): string[] {
  console.log("Encoding", printTypeNode(tp), "with value", value);

  if (tp instanceof IntType) {
    return encodeAsUintOrFelt(tp, value, tp.nBits);
  } else if (tp instanceof ArrayType) {
    if (!(value instanceof Array)) {
      throw new Error(`Can't encode ${value} as arrayType`);
    }
    if (tp.size === undefined) {
      return [
        value.length.toString(),
        ...value.flatMap((v) => encodeValue(tp.elementT, v, compilerVersion)),
      ];
    } else {
      return value.flatMap((v) => encodeValue(tp.elementT, v, compilerVersion));
    }
  } else if (tp instanceof BoolType) {
    if (typeof value !== "string") {
      throw new Error(`Can't encode ${value} as boolType`);
    }
    return [value === "true" ? "1" : "0"];
  } else if (tp instanceof BytesType) {
    if (value === null) return ["0"];
    if (typeof value !== "string") {
      throw new Error(`Can't encode ${value} as bytesType`);
    }
    // removing 0x
    value = value.substring(2);
    const length = value.length / 2;
    if (length !== Math.floor(length)) throw new Error("bytes must be even");

    const cairoBytes: string[] = [];
    for (let index = 0; index < value.length; index += 2) {
      const byte = value.substring(index, index + 2);
      cairoBytes.push(BigInt("0x" + byte).toString());
    }
    return [length.toString(), cairoBytes].flat();
  } else if (tp instanceof FixedBytesType) {
    return encodeAsUintOrFelt(tp, value, tp.size * 8);
  } else if (tp instanceof StringType) {
    if (typeof value !== "string") {
      throw new Error(`Can't encode ${value} as stringType`);
    }
    const valueEncoded: number[] = Buffer.from(value).toJSON().data;

    const byteString: string[] = [];
    valueEncoded.forEach((val) => byteString.push(val.toString()));
    return [byteString.length.toString()].concat(byteString);
  } else if (tp instanceof AddressType) {
    return encodeAsUintOrFelt(tp, value, 160);
  } else if (tp instanceof BuiltinType) {
    throw new Error("Serialising BuiltinType not supported yet");
  } else if (tp instanceof BuiltinStructType) {
    throw new Error("Serialising BuiltinStructType not supported yet");
  } else if (tp instanceof MappingType) {
    throw new Error(
      "Mappings cannot be serialised as external function paramenters"
    );
  } else if (tp instanceof UserDefinedType) {
    throw new Error("UserDefinedType should not exist in raw abi");
  } else if (tp instanceof FunctionType) {
    throw new Error("Serialising FunctionType not supported yet");
  } else if (tp instanceof PointerType) {
    return encodeValue(tp.to, value, compilerVersion);
  } else if (tp instanceof TupleType) {
    if (!(value instanceof Array)) {
      throw new Error(`Can't encode ${value} as a TupleType`);
    }
    return tp.elements.flatMap((elem, index) =>
      encodeValue(elem, value[index], compilerVersion)
    );
  }
  throw new Error(`Don't know how to convert type ${printTypeNode(tp)}`);
}

export function encodeAsUintOrFelt(
  tp: TypeNode,
  value: SolValue,
  nBits: number
): string[] {
  if (typeof value !== "string") {
    throw new Error(`Can't encode ${value} as ${printTypeNode(tp)}`);
  }
  try {
    return toUintOrFelt(BigInt(value.toString()), nBits).map((x) =>
      x.toString()
    );
  } catch {
    throw new Error(`Can't encode ${value} as ${printTypeNode(tp)}`);
  }
}

export function printTypeNode(node: TypeNode, detail?: boolean): string {
  let type = `${node.constructor.name}`;
  if (detail) {
    type = `${printTypeNodeTypes(node)}`;
  }
  return `${node.pp()} (${type})`;
}

function printTypeNodeTypes(node: TypeNode): string {
  let subTypes = "";
  if (node instanceof ArrayType) {
    subTypes = `(${printTypeNodeTypes(node.elementT)}, ${node.size})`;
  } else if (node instanceof MappingType) {
    subTypes = `(${printTypeNodeTypes(node.keyType)}, ${printTypeNodeTypes(
      node.valueType
    )})`;
  } else if (node instanceof PointerType) {
    subTypes = `(${printTypeNodeTypes(node.to)}, ${node.location})`;
  } else if (node instanceof TypeNameType) {
    subTypes = `(${printTypeNodeTypes(node.type)})`;
  }
  return `${node.constructor.name} ${subTypes}`;
}

const uint128 = BigInt("0x100000000000000000000000000000000");

export function toUintOrFelt(value: bigint, nBits: number): bigint[] {
  const val = bigintToTwosComplement(BigInt(value.toString()), nBits);
  if (nBits > 251) {
    const [high, low] = divmod(val, uint128);
    return [low, high];
  } else {
    return [val];
  }
}

export function divmod(x: bigint, y: bigint): [bigint, bigint] {
  const div = BigInt(x / y);
  const rem = BigInt(x % y);
  return [div, rem];
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
    const allBits = `${"0".repeat(
      Math.max(width - absBits.length, 0)
    )}${absBits}`;
    const inverted = `0b${[...allBits]
      .map((c) => (c === "0" ? "1" : "0"))
      .join("")}`;
    const twosComplement = (BigInt(inverted) + 1n).toString(2).slice(-width);
    return BigInt(`0b${twosComplement}`);
  }
}

export function isPrimitiveParam(type: ParamType): boolean {
  // because why use types in a sensisble manner?
  // indexed can be false or null for primitive types
  return (
    (type.indexed === false || type.indexed === null) &&
    type.components === null
  );
}

export function decode(types: ParamType[], outputs: string[]) {
  const decoded = decode_(types, outputs.values());
  const namedMembers: { [key: string]: any } = {};
  types.forEach((ty, i) => {
    namedMembers[ty.name] = decoded[i];
  });

  if (types.length === 1) {
    return decoded[0];
  }
  return { ...namedMembers, ...decoded };
}

export function decode_(
  types: ParamType[],
  outputs: IterableIterator<string>
): Result {
  return types.map((ty) => {
    if (isPrimitiveParam(ty)) {
      return decodePrimitive(ty.baseType, outputs);
    } else {
      return decodeComplex(ty, outputs);
    }
  });
}

function decodePrimitive(
  typeString: string,
  outputs: IterableIterator<string>
): BigNumberish | boolean {
  if (typeString.startsWith("uint")) {
    return decodeUint(
      typeString.length > 4 ? parseInt(typeString.slice(4), 10) : 256,
      outputs
    );
  }
  if (typeString.startsWith("int")) {
    return decodeInt(
      typeString.length > 3 ? parseInt(typeString.slice(3), 10) : 256,
      outputs
    );
  }
  if (typeString === "address") {
    return readFelt(outputs);
  }
  if (typeString === "bool") {
    return readFelt(outputs) === 0n ? false : true;
  }
  if (typeString === "fixed" || typeString === "ufixed") {
    throw new Error("Not Supported");
  }
  if (typeString.startsWith("bytes")) {
    return typeString.length === 5
      ? decodeBytes(outputs)
      : decodeFixedBytes(outputs, parseInt(typeString.slice(5)));
  }
  return 1n;
}

function readFelt(outputs: IterableIterator<string>): bigint {
  return BigInt(outputs.next().value);
}

function useNumberIfSafe(n: bigint, width: number): BigNumber | number {
  return width <= 48 ? Number(n) : BigNumber.from(n);
}

function readUint(outputs: IterableIterator<string>): bigint {
  const low = BigInt(outputs.next().value);
  const high = BigInt(outputs.next().value);
  return (high << 128n) + low;
}

function decodeUint(
  nbits: number,
  outputs: IterableIterator<string>
): BigNumber | number {
  return useNumberIfSafe(
    nbits < 256 ? readFelt(outputs) : readUint(outputs),
    nbits
  );
}

function decodeInt(
  nbits: number,
  outputs: IterableIterator<string>
): BigNumber | number {
  return useNumberIfSafe(
    twosComplementToBigInt(
      nbits < 256 ? BigInt(readFelt(outputs)) : readUint(outputs),
      nbits
    ),
    nbits
  );
}

function decodeBytes(outputs: IterableIterator<string>): bigint {
  const len = readFelt(outputs);
  let result = 0n;
  for (let i = 0; i < len; i++) {
    result << 8n;
    result += BigInt(readFelt(outputs));
  }
  return result;
}

function decodeFixedBytes(
  outputs: IterableIterator<string>,
  length: number
): BigNumber | number {
  return useNumberIfSafe(
    length < 32 ? readFelt(outputs) : readUint(outputs),
    length * 8
  );
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

export function decodeComplex(
  type: ParamType,
  outputs: IterableIterator<string>
) {
  if (type.indexed) {
    // array type
    const length =
      type.arrayLength === -1 ? readFelt(outputs) : type.arrayLength;
    const result: Result = [];
    for (let i = 0; i < length; ++i) {
      result.push(decode_([type.arrayChildren], outputs));
    }
    return result;
  } else if (type.components !== null) {
    // struct type
    const indexedMembers = type.components.map((m) => decode_([m], outputs));
    const namedMembers: { [key: string]: any } = {};
    type.components.forEach((member, i) => {
      namedMembers[member.name] = indexedMembers[i];
    });

    return { ...namedMembers, ...indexedMembers } as Result;
  }
}

export function getWidthOf(type: ParamType): number {
  if (type.baseType.startsWith("uint")) {
    const width = parseInt(type.baseType.slice(4), 10);
    return width < 256 ? 1 : 2;
  } else if (type.baseType.startsWith("int")) {
    const width = parseInt(type.baseType.slice(3), 10);
    return width < 256 ? 1 : 2;
  } else if (type.baseType.startsWith("address")) {
    return 1;
  } else if (type.baseType.startsWith("bool")) {
    return 1;
  } else if (/byte\d*$/.test(type.baseType)) {
    const width = parseInt(type.baseType.slice(4), 10);
    return width * 8;
  } else if (
    type.baseType.startsWith("ufixed") ||
    type.baseType.startsWith("fixed")
  ) {
    throw new Error("Not Supported");
  } else if (type.baseType.startsWith("bytes")) {
    throw new Error("Not supported dynamic in dynamic types");
  } else if (type.indexed) {
    // array
    if (type.arrayLength === -1) {
      throw new Error("Not supported dynamic in dynamic types");
    } else {
      // static array
      return type.arrayLength * getWidthOf(type.arrayChildren);
    }
  } else if (type.components.length !== 0) {
    // struct
    return type.components.reduce((acc, ty) => {
      return acc + getWidthOf(ty);
    }, 0);
  }
  throw new Error("Not Supported " + type.baseType);
}
