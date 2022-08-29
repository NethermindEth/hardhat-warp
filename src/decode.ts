import assert from 'assert';
import {AddressType, ArrayType, BoolType, BuiltinStructType, BuiltinType, BytesType, FixedBytesType, FunctionType, IntType, MappingType, PointerType, StringType, TypeNode, UserDefinedType} from "solc-typed-ast";
import {printTypeNode} from "./encode";

import {ParamType} from "ethers/lib/utils";

export type CairoValue = string | string[];

const uint128 = BigInt("0x100000000000000000000000000000000");

function uint256ToNumber(value: CairoValue): BigInt {
  if (
    Array.isArray(value) &&
    value.length == 2
  ) {
    const [low, high] = value;
    const number = BigInt(high) * uint128 + BigInt(low);
    return number;
  }

  throw Error(":Homie");
}

function decodeFeltOrUint256(
  tp: TypeNode,
  value: CairoValue,
  nBits: number
): BigInt {
  if (!Array.isArray(value)) throw new Error("");
  if (nBits == 256) {
    return uint256ToNumber(value);
  } else {
    return BigInt(value[0]);
  }
}

// export function structuralDecoding(ParamType, string | BigInt) {

// }

export type Decoded = BigInt | string | Decoded[];

export function decodeValue(
  tp: TypeNode,
  value: CairoValue
): Decoded {
  if (tp instanceof IntType) {
    return decodeFeltOrUint256(tp, value, tp.nBits);
  } else if (tp instanceof BoolType) {
    if (typeof value !== "string") {
      throw new Error(`Can't decode ${value} as boolType`);
    }
    return value == "0" ? "false" : "true";
  } else if (tp instanceof AddressType) {
    if (typeof value !== "string") {
      throw new Error(`Can't decode ${value} as address type`);
    }
    return decodeFeltOrUint256(tp, value, 251);
  } else if (tp instanceof FixedBytesType) {
    if (typeof value !== "string") {
      throw new Error(`Can't decode ${value} as fixedBytesType`);
    }
    return decodeFeltOrUint256(tp, value, tp.size * 8);
  } else if (tp instanceof BytesType) {
    if (Array.isArray(value)) {
      throw new Error(`Can't decode ${value} as bytesType`);
    }

    // Bytes is an array of felt where each felt represents one byte
    const [length, ...bytes] = value;
    assert(parseInt(length, 10) === bytes.length);
    return bytes;
  } else if (tp instanceof StringType) {
    if (Array.isArray(value)) {
      throw new Error(`Can't decode ${value} as stringType`);
    }

    // bytes is an array of felt where each felt represents one byte of a utf-8 encoded string
    const [length, ...bytes] = value;
    assert(parseInt(length, 10) === bytes.length);
    return bytes;
  } else if(tp instanceof ArrayType) {
    if (Array.isArray(value)) {
      throw new Error(`Can't decode ${value} as arrayType`);
    }

    // arr is an array of felt where each felt represents one felt
    const [length, ...arr] = value;
    assert(parseInt(length, 10) === arr.length);
    return arr.map(v => decodeValue(tp.elementT, v)).flat();

  } else if (tp instanceof BuiltinType) {
    throw new Error('Deserialising BuiltinType not supported yet');
  } else if (tp instanceof BuiltinStructType) {
    throw new Error('Deserialising BuiltinStructType not supported yet');
  } else if (tp instanceof MappingType) {
    throw new Error('Mappings cannot be serialised as external function paramenters');
  } else if (tp instanceof UserDefinedType) {
    throw new Error('UserDefinedType should not exist in raw abi');
  } else if (tp instanceof FunctionType) {
    throw new Error('Deserialising FunctionType not supported yet');
  } else if (tp instanceof PointerType) {
    return decodeValue(tp.to, value);
  }

  throw new Error(`Don't know how to convert type ${printTypeNode(tp)}`);
}
