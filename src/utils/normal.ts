/**
 * capitalize the first letter.
 * @param value
 * @returns
 */

import {Address, EthereumSignature, PaymasterParams} from '../types'
import {EIP712_TX_TYPE, ETH_ADDRESS, L2_ETH_TOKEN_ADDRESS, MAX_BYTECODE_LEN_BYTES} from '../constants'
import {ethers, BigNumber, utils} from 'ethers'
import {EIP712Signer} from "../signer";

export function capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export function sleep(millis: number) {
    return new Promise((resolve) => setTimeout(resolve, millis));
}

export function isETH(token: Address) {
    return token.toLowerCase() == ETH_ADDRESS || token.toLowerCase() == L2_ETH_TOKEN_ADDRESS;
}

export function parseTransaction(payload: ethers.BytesLike): ethers.Transaction {
    function handleAddress(value: string): string {
        if (value === "0x") {
            return null;
        }
        return utils.getAddress(value);
    }

    function handleNumber(value: string): BigNumber {
        if (value === "0x") {
            return BigNumber.from(0);
        }
        return BigNumber.from(value);
    }

    function arrayToPaymasterParams(arr: string[]): PaymasterParams | undefined {
        if (arr.length == 0) {
            return undefined;
        }
        if (arr.length != 2) {
            throw new Error(
                `Invalid paymaster parameters, expected to have length of 2, found ${arr.length}`
            );
        }

        return {
            paymaster: utils.getAddress(arr[0]),
            paymasterInput: utils.arrayify(arr[1]),
        };
    }

    const bytes = utils.arrayify(payload);
    if (bytes[0] != EIP712_TX_TYPE) {
        return utils.parseTransaction(bytes);
    }

    const raw = utils.RLP.decode(bytes.slice(1));
    const transaction: any = {
        type: EIP712_TX_TYPE,
        nonce: handleNumber(raw[0]).toNumber(),
        maxPriorityFeePerGas: handleNumber(raw[1]),
        maxFeePerGas: handleNumber(raw[2]),
        gasLimit: handleNumber(raw[3]),
        to: handleAddress(raw[4]),
        value: handleNumber(raw[5]),
        data: raw[6],
        chainId: handleNumber(raw[10]),
        from: handleAddress(raw[11]),
        customData: {
            gasPerPubdata: handleNumber(raw[12]),
            factoryDeps: raw[13],
            customSignature: raw[14],
            paymasterParams: arrayToPaymasterParams(raw[15]),
        },
    };

    const ethSignature = {
        v: handleNumber(raw[7]).toNumber(),
        r: raw[8],
        s: raw[9],
    };

    if (
        (utils.hexlify(ethSignature.r) == "0x" || utils.hexlify(ethSignature.s) == "0x") &&
        !transaction.customData.customSignature
    ) {
        return transaction;
    }

    if (ethSignature.v !== 0 && ethSignature.v !== 1 && !transaction.customData.customSignature) {
        throw new Error("Failed to parse signature");
    }

    if (!transaction.customData.customSignature) {
        transaction.v = ethSignature.v;
        transaction.s = ethSignature.s;
        transaction.r = ethSignature.r;
    }

    transaction.hash = eip712TxHash(transaction, ethSignature);

    return transaction;
}

function eip712TxHash(transaction: any, ethSignature?: EthereumSignature) {
    const signedDigest = EIP712Signer.getSignedDigest(transaction);
    const hashedSignature = ethers.utils.keccak256(getSignature(transaction, ethSignature));

    return ethers.utils.keccak256(ethers.utils.hexConcat([signedDigest, hashedSignature]));
}

function getSignature(transaction: any, ethSignature?: EthereumSignature): Uint8Array {
    if (transaction?.customData?.customSignature && transaction.customData.customSignature.length) {
        return ethers.utils.arrayify(transaction.customData.customSignature);
    }

    if (!ethSignature) {
        throw new Error("No signature provided");
    }

    const r = ethers.utils.zeroPad(ethers.utils.arrayify(ethSignature.r), 32);
    const s = ethers.utils.zeroPad(ethers.utils.arrayify(ethSignature.s), 32);
    const v = ethSignature.v;

    return new Uint8Array([...r, ...s, v]);
}

export function hashBytecode(bytecode: ethers.BytesLike): Uint8Array {
    // For getting the consistent length we first convert the bytecode to UInt8Array
    const bytecodeAsArray = ethers.utils.arrayify(bytecode);

    if (bytecodeAsArray.length % 32 != 0) {
        throw new Error("The bytecode length in bytes must be divisible by 32");
    }

    if (bytecodeAsArray.length > MAX_BYTECODE_LEN_BYTES) {
        throw new Error(`Bytecode can not be longer than ${MAX_BYTECODE_LEN_BYTES} bytes`);
    }

    const hashStr = ethers.utils.sha256(bytecodeAsArray);
    const hash = ethers.utils.arrayify(hashStr);

    // Note that the length of the bytecode
    // should be provided in 32-byte words.
    const bytecodeLengthInWords = bytecodeAsArray.length / 32;
    if (bytecodeLengthInWords % 2 == 0) {
        throw new Error("Bytecode length in 32-byte words must be odd");
    }

    const bytecodeLength = ethers.utils.arrayify(bytecodeLengthInWords);

    // The bytecode should always take the first 2 bytes of the bytecode hash,
    // so we pad it from the left in case the length is smaller than 2 bytes.
    const bytecodeLengthPadded = ethers.utils.zeroPad(bytecodeLength, 2);

    const codeHashVersion = new Uint8Array([1, 0]);
    hash.set(codeHashVersion, 0);
    hash.set(bytecodeLengthPadded, 2);

    return hash;
}
