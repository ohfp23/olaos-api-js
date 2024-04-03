import {BytesLike, BigNumberish, providers, BigNumber} from 'ethers';
import {BlockWithTransactions as EthersBlockWithTransactions} from '@ethersproject/abstract-provider';

// 0x-prefixed, hex encoded, ethereum account address
export type Address = string;

export type DataHexString = string;

// 0x-prefixed, hex encoded, ECDSA signature.
export type Signature = string;

export enum TransactionType {
    EIP712Transaction = 113,
    EIP1559Transaction = 2,
    OlaRawTransaction = 16,
    PriorityOpTransaction = 255,
    ProtocolUpgradeTransaction = 254,
}

export type Eip712Meta = {
    gasPerPubdata?: BigNumberish;
    factoryDeps?: BytesLike[];
    customSignature?: BytesLike;
    paymasterParams?: PaymasterParams;
};

export type TransactionRequest = providers.TransactionRequest & {
    customData?: Eip712Meta;
};

interface Execute {
    contract_address: bigint[];
    calldata: Uint8Array;
    factory_deps: null | Array<Uint8Array>;
}

interface L2TxCommonData {
    nonce: number;
    initiator_address: bigint[];
    signature: Uint8Array;
    transaction_type: TransactionType;
    input?: {
        hash: Uint8Array;
        data: Uint8Array;
    };
}

export interface L2Tx {
    execute: Execute;
    common_data: L2TxCommonData;
    received_timestamp_ms: number;
}

export interface CallResponse {
    jsonrpc: string;
    result: string;
    id: number;
}

export interface Log extends providers.Log {
    l1BatchNumber: number;
}

export interface L2ToL1Log {
    blockNumber: number;
    blockHash: string;
    l1BatchNumber: number;
    transactionIndex: number;
    txIndexInL1Batch?: number;
    shardId: number;
    isService: boolean;
    sender: string;
    key: string;
    value: string;
    transactionHash: string;
    logIndex: number;
}

export interface TransactionReceipt extends providers.TransactionReceipt {
    l1BatchNumber: number;
    l1BatchTxIndex: number;
    logs: Array<Log>;
    l2ToL1Logs: Array<L2ToL1Log>;
}

export type BlockTag =
    | number
    | string // hex number
    | 'committed'
    | 'finalized'
    | 'latest'
    | 'earliest'
    | 'pending';

export interface Block extends providers.Block {
    l1BatchNumber: number;
    l1BatchTimestamp: number;
}

export interface BatchDetails {
    number: number;
    timestamp: number;
    l1TxCount: number;
    l2TxCount: number;
    rootHash?: string;
    status: string;
    commitTxHash?: string;
    committedAt?: Date;
    proveTxHash?: string;
    provenAt?: Date;
    executeTxHash?: string;
    executedAt?: Date;
    l1GasPrice: number;
    l2FairGasPrice: number;
}

export interface TransactionResponse extends providers.TransactionResponse {
    l1BatchNumber: number;
    l1BatchTxIndex: number;

    waitFinalize(): Promise<TransactionReceipt>;
}

export interface BlockWithTransactions extends EthersBlockWithTransactions {
    l1BatchNumber: number;
    l1BatchTimestamp: number;
    transactions: Array<TransactionResponse>;
}

export interface BlockDetails {
    number: number;
    timestamp: number;
    l1BatchNumber: number;
    l1TxCount: number;
    l2TxCount: number;
    rootHash?: string;
    status: string;
    commitTxHash?: string;
    committedAt?: Date;
    proveTxHash?: string;
    provenAt?: Date;
    executeTxHash?: string;
    executedAt?: Date;
}

export interface TransactionDetails {
    isL1Originated: boolean;
    status: string;
    fee: BigNumberish;
    gasPerPubdata?: BigNumberish;
    initiatorAddress: Address;
    receivedAt: Date;
    ethCommitTxHash?: string;
    ethProveTxHash?: string;
    ethExecuteTxHash?: string;
}

export interface EventFilter {
    topics?: Array<string | Array<string> | null>;
    address?: Address | Array<Address>;
    fromBlock?: BlockTag;
    toBlock?: BlockTag;
    blockHash?: string;
}

export type PaymasterParams = {
    paymaster: Address;
    paymasterInput: BytesLike;
};

export interface EthereumSignature {
    v: number;
    r: BytesLike;
    s: BytesLike;
}
