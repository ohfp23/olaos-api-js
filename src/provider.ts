import axios from "axios";
import {DEFAULT_CHAIN_ID, EIP712_TX_TYPE, ETH_ADDRESS} from "./constants";
import {ethers, utils, BigNumber, BytesLike, providers} from "ethers";
import { ConnectionInfo, poll } from '@ethersproject/web';
import {
    BlockTag,
    Block,
    TransactionReceipt,
    Log,
    Address,
    TransactionRequest,
    BatchDetails,
    TransactionResponse,
    BlockWithTransactions,
    BlockDetails,
    TransactionDetails,
    EventFilter
} from "./types";

import {
    isETH, parseTransaction,
    sleep
} from './utils'

let defaultFormatter: providers.Formatter;

export class OlaProvider extends providers.JsonRpcProvider {
    // public baseURL: string;
    private static _nextPollId = 1;
    protected contractAddresses: {
        mainContract?: Address;
        erc20BridgeL1?: Address;
        erc20BridgeL2?: Address;
        wethBridgeL1?: Address;
        wethBridgeL2?: Address;
    };

    // constructor(url: string, public chainId: number = DEFAULT_CHAIN_ID) {
    //     this.baseURL = url.replace(/\/$/, "");
    // }

    override async poll(): Promise<void> {
        const pollId = OlaProvider._nextPollId++;

        // Track all running promises, so we can trigger a post-poll once they are complete
        const runners: Array<Promise<void|null>> = [];

        let blockNumber: number;
        try {
            blockNumber = await this._getInternalBlockNumber(100 + this.pollingInterval / 2);
        } catch (error) {
            this.emit('error', error);
            return;
        }
        this._setFastBlockNumber(blockNumber);

        // Emit a poll event after we have the latest (fast) block number
        this.emit('poll', pollId, blockNumber);

        // If the block has not changed, meh.
        if (blockNumber === this._lastBlockNumber) {
            this.emit('didPoll', pollId);
            return;
        }

        // First polling cycle, trigger a "block" events
        if (this._emitted.block === -2) {
            this._emitted.block = blockNumber - 1;
        }

        if (Math.abs(<number>this._emitted.block - blockNumber) > 1000) {
            console.warn(
                `network block skew detected; skipping block events (emitted=${this._emitted.block} blockNumber=${blockNumber})`
            );
            this.emit('error', {
                blockNumber: blockNumber,
                event: 'blockSkew',
                previousBlockNumber: this._emitted.block
            });
            this.emit('block', blockNumber);
        } else {
            // Notify all listener for each block that has passed
            for (let i = <number>this._emitted.block + 1; i <= blockNumber; i++) {
                this.emit('block', i);
            }
        }

        // The emitted block was updated, check for obsolete events
        if (<number>this._emitted.block !== blockNumber) {
            this._emitted.block = blockNumber;

            Object.keys(this._emitted).forEach((key) => {
                // The block event does not expire
                if (key === 'block') {
                    return;
                }

                // The block we were at when we emitted this event
                const eventBlockNumber = this._emitted[key];

                // We cannot garbage collect pending transactions or blocks here
                // They should be garbage collected by the Provider when setting
                // "pending" events
                if (eventBlockNumber === 'pending') {
                    return;
                }

                // Evict any transaction hashes or block hashes over 12 blocks
                // old, since they should not return null anyways
                if (blockNumber - eventBlockNumber > 12) {
                    delete this._emitted[key];
                }
            });
        }

        // First polling cycle
        if (this._lastBlockNumber === -2) {
            this._lastBlockNumber = blockNumber - 1;
        }
        // Find all transaction hashes we are waiting on
        this._events.forEach((event) => {
            switch (event.type) {
                case 'tx': {
                    const hash = event.hash;
                    let runner = this.getTransactionReceipt(hash)
                        .then((receipt) => {
                            if (!receipt) {
                                return null;
                            }

                            // NOTE: receipts with blockNumber == null are OK.
                            // this means they were rejected in state-keeper or replaced in mempool.
                            // But we still check that they were actually rejected.
                            if (
                                receipt.blockNumber == null &&
                                !(receipt.status != null && BigNumber.from(receipt.status).isZero())
                            ) {
                                return null;
                            }

                            this._emitted['t:' + hash] = receipt.blockNumber;
                            this.emit(hash, receipt);
                            return null;
                        })
                        .catch((error: Error) => {
                            this.emit('error', error);
                        });

                    runners.push(runner);

                    break;
                }

                case 'filter': {
                    // We only allow a single getLogs to be in-flight at a time
                    if (!event._inflight) {
                        event._inflight = true;

                        // This is the first filter for this event, so we want to
                        // restrict events to events that happened no earlier than now
                        if (event._lastBlockNumber === -2) {
                            event._lastBlockNumber = blockNumber - 1;
                        }

                        // Filter from the last *known* event; due to load-balancing
                        // and some nodes returning updated block numbers before
                        // indexing events, a logs result with 0 entries cannot be
                        // trusted and we must retry a range which includes it again
                        const filter = event.filter;
                        filter.fromBlock = event._lastBlockNumber + 1;
                        filter.toBlock = blockNumber;

                        // Prevent fitler ranges from growing too wild, since it is quite
                        // likely there just haven't been any events to move the lastBlockNumber.
                        const minFromBlock = filter.toBlock - this._maxFilterBlockRange;
                        if (minFromBlock > filter.fromBlock) {
                            filter.fromBlock = minFromBlock;
                        }

                        if (filter.fromBlock < 0) {
                            filter.fromBlock = 0;
                        }

                        const runner = this.getLogs(filter)
                            .then((logs) => {
                                // Allow the next getLogs
                                event._inflight = false;

                                if (logs.length === 0) {
                                    return;
                                }

                                logs.forEach((log: Log) => {
                                    // Only when we get an event for a given block number
                                    // can we trust the events are indexed
                                    if (log.blockNumber > event._lastBlockNumber) {
                                        event._lastBlockNumber = log.blockNumber;
                                    }

                                    // Make sure we stall requests to fetch blocks and txs
                                    this._emitted['b:' + log.blockHash] = log.blockNumber;
                                    this._emitted['t:' + log.transactionHash] = log.blockNumber;

                                    this.emit(filter, log);
                                });
                            })
                            .catch((error: Error) => {
                                this.emit('error', error);

                                // Allow another getLogs (the range was not updated)
                                event._inflight = false;
                            });
                        runners.push(runner);
                    }

                    break;
                }
            }
        });

        this._lastBlockNumber = blockNumber;

        // Once all events for this loop have been processed, emit "didPoll"
        Promise.all(runners)
            .then(() => {
                this.emit('didPoll', pollId);
            })
            .catch((error) => {
                this.emit('error', error);
            });

        return;
    }

    override async getTransactionReceipt(transactionHash: string | Promise<string>): Promise<TransactionReceipt> {
        await this.getNetwork();

        transactionHash = await transactionHash;

        const params = {transactionHash: this.formatter.hash(transactionHash, false)};

        return poll(
            async () => {
                const result = await this.perform('getTransactionReceipt', params);

                if (result == null) {
                    if (this._emitted['t:' + transactionHash] === undefined) {
                        return null;
                    }
                    return undefined;
                }

                if (result.blockNumber == null && result.status != null && BigNumber.from(result.status).isZero()) {
                    // transaction is rejected in the state-keeper
                    return {
                        ...this.formatter.receipt({
                            ...result,
                            confirmations: 1,
                            blockNumber: 0,
                            blockHash: ethers.constants.HashZero
                        }),
                        blockNumber: null,
                        blockHash: null,
                        l1BatchNumber: null,
                        l1BatchTxIndex: null
                    };
                }

                if (result.blockHash == null) {
                    // receipt is not ready
                    return undefined;
                } else {
                    const receipt: any = this.formatter.receipt(result);
                    if (receipt.blockNumber == null) {
                        receipt.confirmations = 0;
                    } else if (receipt.confirmations == null) {
                        const blockNumber = await this._getInternalBlockNumber(100 + 2 * this.pollingInterval);

                        // Add the confirmations using the fast block number (pessimistic)
                        let confirmations = blockNumber - receipt.blockNumber + 1;
                        if (confirmations <= 0) {
                            confirmations = 1;
                        }
                        receipt.confirmations = confirmations;
                    }
                    return receipt;
                }
            },
            {oncePoll: this}
        );
    }

    override async getBlock(blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>): Promise<Block> {
        return <Promise<Block>>this._getBlock(blockHashOrBlockTag, false);
    }

    override async getBlockWithTransactions(
        blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>
    ): Promise<BlockWithTransactions> {
        return <Promise<BlockWithTransactions>>this._getBlock(blockHashOrBlockTag, true);
    }

    static override getFormatter(): providers.Formatter {
        if (defaultFormatter == null) {
            defaultFormatter = new providers.Formatter();
            const number = defaultFormatter.number.bind(defaultFormatter);
            const boolean = defaultFormatter.boolean.bind(defaultFormatter);
            const hash = defaultFormatter.hash.bind(defaultFormatter);
            const address = defaultFormatter.address.bind(defaultFormatter);

            defaultFormatter.formats.receiptLog.l1BatchNumber = providers.Formatter.allowNull(number);

            (defaultFormatter.formats as any).l2Tol1Log = {
                blockNumber: number,
                blockHash: hash,
                l1BatchNumber: providers.Formatter.allowNull(number),
                transactionIndex: number,
                shardId: number,
                isService: boolean,
                sender: address,
                key: hash,
                value: hash,
                transactionHash: hash,
                txIndexInL1Batch: providers.Formatter.allowNull(number),
                logIndex: number
            };

            defaultFormatter.formats.receipt.l1BatchNumber = providers.Formatter.allowNull(number);
            defaultFormatter.formats.receipt.l1BatchTxIndex = providers.Formatter.allowNull(number);
            defaultFormatter.formats.receipt.l2ToL1Logs = providers.Formatter.arrayOf((value) =>
                providers.Formatter.check((defaultFormatter.formats as any).l2Tol1Log, value)
            );

            defaultFormatter.formats.block.l1BatchNumber = providers.Formatter.allowNull(number);
            defaultFormatter.formats.block.l1BatchTimestamp = providers.Formatter.allowNull(number);
            defaultFormatter.formats.blockWithTransactions.l1BatchNumber = providers.Formatter.allowNull(number);
            defaultFormatter.formats.blockWithTransactions.l1BatchTimestamp = providers.Formatter.allowNull(number);
            defaultFormatter.formats.transaction.l1BatchNumber = providers.Formatter.allowNull(number);
            defaultFormatter.formats.transaction.l1BatchTxIndex = providers.Formatter.allowNull(number);

            defaultFormatter.formats.filterLog.l1BatchNumber = providers.Formatter.allowNull(number);
        }
        return defaultFormatter;
    }

    // override async getBalance(address: Address, blockTag?: BlockTag, tokenAddress?: Address) {
    //     const tag = this.formatter.blockTag(blockTag);
    //     if (tokenAddress == null || isETH(tokenAddress)) {
    //         // requesting ETH balance
    //         return await super.getBalance(address, tag);
    //     } else {
    //         try {
    //             let token = IERC20MetadataFactory.connect(tokenAddress, this);
    //             return await token.balanceOf(address, {blockTag: tag});
    //         } catch {
    //             return BigNumber.from(0);
    //         }
    //     }
    // }

    // async l2TokenAddress(token: Address) {
    //     if (token == ETH_ADDRESS) {
    //         return ETH_ADDRESS;
    //     }
    //
    //     const bridgeAddresses = await this.getDefaultBridgeAddresses();
    //     const l2WethBridge = IL2BridgeFactory.connect(bridgeAddresses.wethL2, this);
    //     const l2WethToken = await l2WethBridge.l2TokenAddress(token);
    //     // If the token is Wrapped Ether, return its L2 token address
    //     if (l2WethToken != ethers.constants.AddressZero) {
    //         return l2WethToken;
    //     }
    //
    //     const l2Erc20Bridge = IL2BridgeFactory.connect(bridgeAddresses.erc20L2, this);
    //     return await l2Erc20Bridge.l2TokenAddress(token);
    // }

    // async l1TokenAddress(token: Address) {
    //     if (token == ETH_ADDRESS) {
    //         return ETH_ADDRESS;
    //     }
    //
    //     const bridgeAddresses = await this.getDefaultBridgeAddresses();
    //     const l2WethBridge = IL2BridgeFactory.connect(bridgeAddresses.wethL2, this);
    //     const l1WethToken = await l2WethBridge.l1TokenAddress(token);
    //     // If the token is Wrapped Ether, return its L1 token address
    //     if (l1WethToken != ethers.constants.AddressZero) {
    //         return l1WethToken;
    //     }
    //
    //     const erc20Bridge = IL2BridgeFactory.connect(bridgeAddresses.erc20L2, this);
    //     return await erc20Bridge.l1TokenAddress(token);
    // }

    static override hexlifyTransaction(
        transaction: ethers.providers.TransactionRequest,
        allowExtra?: Record<string, boolean>
    ) {
        const result = ethers.providers.JsonRpcProvider.hexlifyTransaction(transaction, {
            ...allowExtra,
            customData: true,
            from: true
        });
        if (transaction.customData == null) {
            return result;
        }
        result.eip712Meta = {
            gasPerPubdata: utils.hexValue(transaction.customData.gasPerPubdata ?? 0)
        } as any;
        transaction.type = EIP712_TX_TYPE;
        if (transaction.customData.factoryDeps) {
            // @ts-ignore
            result.eip712Meta.factoryDeps = transaction.customData.factoryDeps.map((dep: ethers.BytesLike) =>
                // TODO (SMA-1605): we arraify instead of hexlifying because server expects Vec<u8>.
                //  We should change deserialization there.
                Array.from(utils.arrayify(dep))
            );
        }
        if (transaction.customData.paymasterParams) {
            // @ts-ignore
            result.eip712Meta.paymasterParams = {
                paymaster: utils.hexlify(transaction.customData.paymasterParams.paymaster),
                paymasterInput: Array.from(utils.arrayify(transaction.customData.paymasterParams.paymasterInput))
            };
        }
        return result;
    }

    override async estimateGas(transaction: utils.Deferrable<TransactionRequest>): Promise<BigNumber> {
        await this.getNetwork();
        const params = await utils.resolveProperties({
            transaction: this._getTransactionRequest(transaction)
        });
        if (transaction.customData != null) {
            // @ts-ignore
            params.transaction.customData = transaction.customData;
        }
        const result = await this.perform('estimateGas', params);
        try {
            return BigNumber.from(result);
        } catch (error) {
            throw new Error(`bad result from backend (estimateGas): ${result}`);
        }
    }

    async estimateGasL1(transaction: utils.Deferrable<TransactionRequest>): Promise<BigNumber> {
        await this.getNetwork();
        const params = await utils.resolveProperties({
            transaction: this._getTransactionRequest(transaction)
        });
        if (transaction.customData != null) {
            // @ts-ignore
            params.transaction.customData = transaction.customData;
        }
        const result = await this.send('ola_estimateGasL1ToL2', [
            OlaProvider.hexlifyTransaction(params.transaction, {from: true})
        ]);
        try {
            return BigNumber.from(result);
        } catch (error) {
            throw new Error(`bad result from backend (ola_estimateGasL1ToL2): ${result}`);
        }
    }

    override async getGasPrice(token?: Address): Promise<BigNumber> {
        const params = token ? [token] : [];
        const price = await this.send('eth_gasPrice', params);
        return BigNumber.from(price);
    }

    constructor(url?: ConnectionInfo | string, network?: ethers.providers.Networkish) {
      super(url, network);
      this.pollingInterval = 500;

      const blockTag = this.formatter.blockTag.bind(this.formatter);
      this.formatter.blockTag = (tag: any) => {
        if (tag == 'committed' || tag == 'finalized') {
          return tag;
        }
        return blockTag(tag);
      };
      this.contractAddresses = {};
      this.formatter.transaction = parseTransaction;
    }

    async getL1BatchNumber(): Promise<number> {
        const number = await this.send('ola_getL1BatchNumber', []);
        return BigNumber.from(number).toNumber();
    }

    async getL1BatchDetails(number: number): Promise<BatchDetails> {
        return await this.send('ola_getL1BatchDetails', [number]);
    }

    async getBlockDetails(number: number): Promise<BlockDetails> {
        return await this.send('ola_getBlockDetails', [number]);
    }

    async getTransactionDetails(txHash: BytesLike): Promise<TransactionDetails> {
        return await this.send('ola_getTransactionDetails', [txHash]);
    }

    override async getLogs(filter: EventFilter | Promise<EventFilter> = {}): Promise<Array<Log>> {
        filter = await filter;
        const logs = await this.send('eth_getLogs', [this._prepareFilter(filter)]);
        return this._parseLogs(logs);
    }

    protected _prepareFilter(filter: EventFilter) {
        return {
            ...filter,
            fromBlock: filter.fromBlock == null ? null : this.formatter.blockTag(filter.fromBlock),
            toBlock: filter.fromBlock == null ? null : this.formatter.blockTag(filter.toBlock)
        };
    }

    protected _parseLogs(logs: any[]): Array<Log> {
        return providers.Formatter.arrayOf(this.formatter.filterLog.bind(this.formatter))(logs);
    }

    override async getTransaction(hash: string | Promise<string>): Promise<TransactionResponse> {
        hash = await hash;
        const tx = await super.getTransaction(hash);
        return tx ? this._wrapTransaction(tx, hash) : null;
    }

    override _wrapTransaction(tx: ethers.Transaction, hash?: string): TransactionResponse {
        const response = super._wrapTransaction(tx, hash) as TransactionResponse;

        response.waitFinalize = async () => {
            const receipt = await response.wait();
            while (true) {
                const block = await this.getBlock('finalized');
                if (receipt.blockNumber <= block.number) {
                    return await this.getTransactionReceipt(receipt.transactionHash);
                } else {
                    await sleep(this.pollingInterval);
                }
            }
        };

        return response;
    }

    static getDefaultProvider() {
        // TODO (SMA-1606): Add different urls for different networks.
        return new OlaProvider(process.env.ZKSYNC_WEB3_API_URL || 'http://localhost:3050');
    }

    async getDefaultBridgeAddresses() {
        if (!this.contractAddresses.erc20BridgeL1) {
            let addresses = await this.send('ola_getBridgeContracts', []);
            this.contractAddresses.erc20BridgeL1 = addresses.l1Erc20DefaultBridge;
            this.contractAddresses.erc20BridgeL2 = addresses.l2Erc20DefaultBridge;
            this.contractAddresses.wethBridgeL1 = addresses.l1WethBridge;
            this.contractAddresses.wethBridgeL2 = addresses.l2WethBridge;
        }
        return {
            erc20L1: this.contractAddresses.erc20BridgeL1,
            erc20L2: this.contractAddresses.erc20BridgeL2,
            wethL1: this.contractAddresses.wethBridgeL1,
            wethL2: this.contractAddresses.wethBridgeL2
        };
    }

    // async health() {
        // const res = await axios.get(`${this.baseURL}/health`);
        // console.log(res);
    // }

    // async request<T>(method: string, params: Record<string, any> | null) {
    //     const requestBody = {
    //         id: 1,
    //         jsonrpc: "2.0",
    //         method,
    //         params,
    //     };
    //
    //     const {data} = await axios.post(this.baseURL, requestBody);
    //     if (data.error) {
    //         throw Error(data.error.message);
    //     }
    //     return data.result as T;
    // }

    // async getNonce(address: string) {
    //     return this.request<number>("eth_getTransactionCount", {address});
    // }
}
