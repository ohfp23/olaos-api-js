import { providers, BigNumberish, BytesLike, ethers, utils, BigNumber } from 'ethers';
import { ConnectionInfo } from '@ethersproject/web';
import { BlockWithTransactions as BlockWithTransactions$1 } from '@ethersproject/abstract-provider';

type Address = string;
type Eip712Meta = {
    gasPerPubdata?: BigNumberish;
    factoryDeps?: BytesLike[];
    customSignature?: BytesLike;
    paymasterParams?: PaymasterParams;
};
type TransactionRequest = providers.TransactionRequest & {
    customData?: Eip712Meta;
};
interface Log extends providers.Log {
    l1BatchNumber: number;
}
interface L2ToL1Log {
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
interface TransactionReceipt extends providers.TransactionReceipt {
    l1BatchNumber: number;
    l1BatchTxIndex: number;
    logs: Array<Log>;
    l2ToL1Logs: Array<L2ToL1Log>;
}
type BlockTag = number | string | 'committed' | 'finalized' | 'latest' | 'earliest' | 'pending';
interface Block extends providers.Block {
    l1BatchNumber: number;
    l1BatchTimestamp: number;
}
interface BatchDetails {
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
interface TransactionResponse extends providers.TransactionResponse {
    l1BatchNumber: number;
    l1BatchTxIndex: number;
    waitFinalize(): Promise<TransactionReceipt>;
}
interface BlockWithTransactions extends BlockWithTransactions$1 {
    l1BatchNumber: number;
    l1BatchTimestamp: number;
    transactions: Array<TransactionResponse>;
}
interface BlockDetails {
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
interface TransactionDetails {
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
interface EventFilter {
    topics?: Array<string | Array<string> | null>;
    address?: Address | Array<Address>;
    fromBlock?: BlockTag;
    toBlock?: BlockTag;
    blockHash?: string;
}
type PaymasterParams = {
    paymaster: Address;
    paymasterInput: BytesLike;
};

declare class OlaProvider extends providers.JsonRpcProvider {
    private static _nextPollId;
    protected contractAddresses: {
        mainContract?: Address;
        erc20BridgeL1?: Address;
        erc20BridgeL2?: Address;
        wethBridgeL1?: Address;
        wethBridgeL2?: Address;
    };
    poll(): Promise<void>;
    getTransactionReceipt(transactionHash: string | Promise<string>): Promise<TransactionReceipt>;
    getBlock(blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>): Promise<Block>;
    getBlockWithTransactions(blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>): Promise<BlockWithTransactions>;
    static getFormatter(): providers.Formatter;
    static hexlifyTransaction(transaction: ethers.providers.TransactionRequest, allowExtra?: Record<string, boolean>): {
        [key: string]: string | ethers.utils.AccessList;
    };
    estimateGas(transaction: utils.Deferrable<TransactionRequest>): Promise<BigNumber>;
    estimateGasL1(transaction: utils.Deferrable<TransactionRequest>): Promise<BigNumber>;
    getGasPrice(token?: Address): Promise<BigNumber>;
    constructor(url?: ConnectionInfo | string, network?: ethers.providers.Networkish);
    getL1BatchNumber(): Promise<number>;
    getL1BatchDetails(number: number): Promise<BatchDetails>;
    getBlockDetails(number: number): Promise<BlockDetails>;
    getTransactionDetails(txHash: BytesLike): Promise<TransactionDetails>;
    getLogs(filter?: EventFilter | Promise<EventFilter>): Promise<Array<Log>>;
    protected _prepareFilter(filter: EventFilter): {
        fromBlock: string;
        toBlock: string;
        topics?: (string | string[])[];
        address?: string | string[];
        blockHash?: string;
    };
    protected _parseLogs(logs: any[]): Array<Log>;
    getTransaction(hash: string | Promise<string>): Promise<TransactionResponse>;
    _wrapTransaction(tx: ethers.Transaction, hash?: string): TransactionResponse;
    static getDefaultProvider(): OlaProvider;
    getDefaultBridgeAddresses(): Promise<{
        erc20L1: string;
        erc20L2: string;
        wethL1: string;
        wethL2: string;
    }>;
}

declare class OlaAddress {
}

declare const DEFAULT_CHAIN_ID = 1027;

export { DEFAULT_CHAIN_ID, OlaAddress, OlaProvider };
