// import { hexlify, toUtf8Bytes } from "ethers";
import { encode_input_from_js, decode_output_from_js } from "@sin7y/ola-abi-wasm";
// import { toUint8Array } from "./crypto";
import type { DataHexString } from "../types";
import { capitalize } from "./normal";
import { OlaAddress } from "../libs";

// function getAbiBytes(abi: any[]) {
//   const abiJson = JSON.stringify(abi);
//   return toUtf8Bytes(abiJson);
// }

/**
 *
 * @param abi abi array
 * @param method method signature
 * @param params params array
 * @returns BigUint64Array
 */
// export function encodeAbi(abi: any[], method: string, params: Record<string, any>[]) {
//   const result = encode_input_from_js(getAbiBytes(abi), method, params) as string[];
//   return BigUint64Array.from(result.map((item) => BigInt(item)));
// }

// export function decodeAbi(abi: any[], method: string, data: BigUint64Array) {
//   // console.log("decodeAbi", getAbiBytes(abi), method, data);
//   const result = decode_output_from_js(getAbiBytes(abi), method, data);
//   return result;
// }

type OlaDataType = "tuple" | "address" | "u32" | "hash" | "bool" | "hash[]" | "fields";
interface OlaParam {
  name: string;
  type: OlaDataType;
}

// @todo: multi outputs
// export function parseOutputs(outputs: any) {
//   const type = outputs.param.type as OlaDataType;
//   switch (type) {
//     case "fields":
//       return parseFieldsOutputs(outputs);
//     case "tuple":
//       return parseTupleOutputs(outputs);
//     case "hash[]":
//       return parseArrayOutputs(outputs);
//     default:
//       return parseNormalOutputs(outputs);
//   }
// }

function parseNormalOutputs(outputs: any) {
  const outputType = outputs.param.type;
  return outputs.value[capitalize(outputType)];
}

// function parseArrayOutputs(outputs: any): any[] {
//   const values = outputs.value.Array[0];
//   const type = outputs.value.Array[1];
//   const result = values.map((item: Record<string, any>) => {
//     let itemValue = item[type];
//     if (type === "Hash") itemValue = hexlify(toUint8Array(itemValue as bigint[]));
//     return itemValue;
//   });
//   return result;
// }

// function parseTupleOutputs(outputs: any) {
//   const componentsValue = outputs.value.Tuple;
//   const componentsType = Object.fromEntries(
//     outputs.param.components.map((item: OlaParam) => {
//       return [item.name, item.type];
//     })
//   );
//   const output = Object.fromEntries(
//     componentsValue.map((item: [string, any]) => {
//       const itemKey = item[0];
//       const itemType = componentsType[itemKey] as OlaDataType;
//       let itemValue = item[1][capitalize(itemType)];
//       if (itemType === "address") itemValue = OlaAddress.toHexString(itemValue);
//       return [itemKey, itemValue];
//     })
//   );
//   return output;
// }
// function parseFieldsOutputs(outputs: any): DataHexString {
//   const value = outputs.value.Fields as bigint[];
//   return hexlify(toUint8Array(value));
// }
