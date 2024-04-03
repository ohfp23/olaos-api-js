// import {
//   SignatureLike,
//   SigningKey,
//   concat,
//   hexlify,
//   keccak256,
//   toBeArray,
//   toUtf8Bytes,
// } from "ethers";
// import { OlaMessagePrefix } from "../constants";
// // import { poseidonHash } from "./crypto";
//
// export function hashMessage(message: Uint8Array | string): string {
//   if (typeof message === "string") {
//     message = toUtf8Bytes(message);
//   }
//   return keccak256(
//     concat([toUtf8Bytes(OlaMessagePrefix), toUtf8Bytes(String(message.length)), message])
//   );
// }
//
// // export function recoverAddress(message: Uint8Array | string, sig: SignatureLike) {
// //   const digest = hashMessage(message);
// //   const publicKey = "0x" + SigningKey.recoverPublicKey(digest, sig).slice(4);
// //   const hashBytes = poseidonHash(toBeArray(publicKey));
// //   return hexlify(hashBytes);
// // }
//
// // export function verifySignature(message: Uint8Array | string, sig: SignatureLike, address: string) {
// //   return address.toLocaleLowerCase() === recoverAddress(message, sig).toLocaleLowerCase();
// // }
