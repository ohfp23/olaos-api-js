import {utils, ethers, BytesLike} from "ethers";

import {
    hashBytecode,
    // hashMessage,
    // isValidOlaKey,
    // l2txToTransactionRequest,
    // poseidonHash,
    // rlp_tx,
    // toUint64Array,
    // txRequestToBytes,
} from "./utils";
import {TransactionType, type L2Tx, type TransactionRequest, Signature} from "./types";
import { TypedDataDomain, TypedDataSigner } from '@ethersproject/abstract-signer';

import {_TypedDataEncoder as TypedDataEncoder} from '@ethersproject/hash';
import {DEFAULT_GAS_PER_PUBDATA_LIMIT, ENTRYPOINT_ADDRESS} from "./constants";

export const eip712Types = {
    Transaction: [
        {name: 'txType', type: 'uint256'},
        {name: 'from', type: 'uint256'},
        {name: 'to', type: 'uint256'},
        {name: 'gasLimit', type: 'uint256'},
        {name: 'gasPerPubdataByteLimit', type: 'uint256'},
        {name: 'maxFeePerGas', type: 'uint256'},
        {name: 'maxPriorityFeePerGas', type: 'uint256'},
        {name: 'paymaster', type: 'uint256'},
        {name: 'nonce', type: 'uint256'},
        {name: 'value', type: 'uint256'},
        {name: 'data', type: 'bytes'},
        {name: 'factoryDeps', type: 'bytes32[]'},
        {name: 'paymasterInput', type: 'bytes'}
    ]
};

// function computePublicKey(privateKey: BytesLike) {
//     return "0x" + SigningKey.computePublicKey(privateKey).slice(4);
// }

// function privateKeyFromSeed(seed: Uint8Array) {
//     let privateKey = utils.sha256(seed);
//
//     let count = 0;
//     while (count < 10000) {
//         let publicKey = computePublicKey(privateKey);
//         if (isValidOlaKey(privateKey) && isValidOlaKey(publicKey)) {
//             return privateKey;
//         } else {
//             privateKey = utils.keccak256(privateKey);
//             count++;
//         }
//     }
// }

// export class OlaSigner {
//     readonly publicKey: BytesLike;
//     readonly address: string;
//
//     private constructor(readonly privateKey: BytesLike) {
//         this.publicKey = computePublicKey(privateKey);
//         const hashBytes = poseidonHash(new TextEncoder().encode(this.publicKey));
//         this.address = utils.hexlify(hashBytes);
//     }
//
//     getL2Tx(
//         chain_id: number,
//         from: string,
//         nonce: number,
//         calldata: Uint8Array,
//         factory_deps: Array<Uint8Array> | null = null
//     ) {
//         const fromAddress = Array.from(toUint64Array(from));
//         const txRequest: TransactionRequest = {
//             nonce,
//             from: fromAddress,
//             to: ENTRYPOINT_ADDRESS,
//             input: calldata,
//             type: TransactionType.OlaRawTransaction,
//             eip712_meta: {factory_deps, custom_signature: null, paymaster_params: null},
//             chain_id,
//         };
//
//         // signature in common_data should be 64 bytes.
//         const signature = this.signTransactionRequest(txRequest).slice(0, 64);
//
//         const tx: L2Tx = {
//             execute: {
//                 contract_address: ENTRYPOINT_ADDRESS,
//                 calldata,
//                 factory_deps,
//             },
//             common_data: {
//                 nonce,
//                 initiator_address: fromAddress,
//                 signature,
//                 transaction_type: TransactionType.OlaRawTransaction,
//             },
//             received_timestamp_ms: Date.now(),
//         };
//
//         return tx;
//     }
//
//     signMessage(message: string | Uint8Array) {
//         const _message = typeof message === "string" ? hashMessage(message) : message;
//         const privKey = new SigningKey(this.privateKey);
//         return privKey.sign(_message);
//     }
//
//     signTransactionRequest(tx: TransactionRequest) {
//         const message = txRequestToBytes(tx);
//         const messageHash = poseidonHash(message);
//         const signature = this.signMessage(Uint8Array.from(messageHash));
//         const sigBytes = new Uint8Array(65);
//         sigBytes.set(new TextEncoder().encode(signature.r), 0);
//         sigBytes.set(new TextEncoder().encode(signature.s), 32);
//         sigBytes[64] = signature.v;
//         return sigBytes;
//     }
//
//     createSignedTransactionRaw(l2tx: L2Tx, chainId: number) {
//         const txRequest = l2txToTransactionRequest(l2tx);
//         const txRequestSig = this.signTransactionRequest(txRequest);
//         const rawTx = rlp_tx(txRequest, txRequestSig, chainId);
//         return rawTx;
//     }
//
//     createTransaction(
//         chainId: number,
//         nonce: number,
//         calldata: Uint8Array,
//         factory_deps: Array<Uint8Array> | null = null
//     ) {
//         const l2tx = this.getL2Tx(chainId, this.address, nonce, calldata, factory_deps);
//         return this.createSignedTransactionRaw(l2tx, chainId);
//     }
//
//     // static async fromETHSignature(ethSigner: ethers.Signer): Promise<OlaSigner> {
//     //     const message = "Access OlaVM.\n" + "\n" + "This account is only for Sepolia testnet.";
//     //     const signature = await ethSigner.signMessage(message);
//     //     const seed = toBeArray(signature);
//     //     const olaPrivateKey = privateKeyFromSeed(seed);
//     //     if (!olaPrivateKey) throw new Error("Ola SDK: Private Key generate error.");
//     //     return new OlaSigner(olaPrivateKey);
//     // }
// }

export class EIP712Signer {
    private eip712Domain: Promise<TypedDataDomain>;

    constructor(private ethSigner: ethers.Signer & TypedDataSigner, chainId: number | Promise<number>) {
        this.eip712Domain = Promise.resolve(chainId).then((chainId) => ({
            name: 'zkSync',
            version: '2',
            chainId
        }));
    }

    static getSignInput(transaction: TransactionRequest) {
        const maxFeePerGas = transaction.maxFeePerGas ?? transaction.gasPrice ?? 0;
        const maxPriorityFeePerGas = transaction.maxPriorityFeePerGas ?? maxFeePerGas;
        const gasPerPubdataByteLimit = transaction.customData?.gasPerPubdata ?? DEFAULT_GAS_PER_PUBDATA_LIMIT;
        const signInput = {
            txType: transaction.type,
            from: transaction.from,
            to: transaction.to,
            gasLimit: transaction.gasLimit,
            gasPerPubdataByteLimit: gasPerPubdataByteLimit,
            maxFeePerGas,
            maxPriorityFeePerGas,
            paymaster: transaction.customData?.paymasterParams?.paymaster || ethers.constants.AddressZero,
            nonce: transaction.nonce,
            value: transaction.value,
            data: transaction.data,
            factoryDeps: transaction.customData?.factoryDeps?.map((dep) => hashBytecode(dep)) || [],
            paymasterInput: transaction.customData?.paymasterParams?.paymasterInput || '0x'
        };
        return signInput;
    }

    async sign(transaction: TransactionRequest): Promise<Signature> {
        return await this.ethSigner._signTypedData(
            await this.eip712Domain,
            eip712Types,
            EIP712Signer.getSignInput(transaction)
        );
    }

    static getSignedDigest(transaction: TransactionRequest): ethers.BytesLike {
        if (!transaction.chainId) {
            throw Error("Transaction chainId isn't set");
        }
        const domain = {
            name: 'zkSync',
            version: '2',
            chainId: transaction.chainId
        };
        return TypedDataEncoder.hash(domain, eip712Types, EIP712Signer.getSignInput(transaction));
    }
}
