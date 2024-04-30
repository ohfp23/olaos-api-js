'use strict';

var ethers = require('ethers');
var web = require('@ethersproject/web');
var hash = require('@ethersproject/hash');

const DEFAULT_CHAIN_ID = 1027;
const EIP712_TX_TYPE = 0x71;
const MAX_BYTECODE_LEN_BYTES = ((1 << 16) - 1) * 32;
const DEFAULT_GAS_PER_PUBDATA_LIMIT = 50000;

const eip712Types = {
    Transaction: [
        { name: 'txType', type: 'uint256' },
        { name: 'from', type: 'uint256' },
        { name: 'to', type: 'uint256' },
        { name: 'gasLimit', type: 'uint256' },
        { name: 'gasPerPubdataByteLimit', type: 'uint256' },
        { name: 'maxFeePerGas', type: 'uint256' },
        { name: 'maxPriorityFeePerGas', type: 'uint256' },
        { name: 'paymaster', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'factoryDeps', type: 'bytes32[]' },
        { name: 'paymasterInput', type: 'bytes' }
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
class EIP712Signer {
    constructor(ethSigner, chainId) {
        this.ethSigner = ethSigner;
        this.eip712Domain = Promise.resolve(chainId).then((chainId) => ({
            name: 'zkSync',
            version: '2',
            chainId
        }));
    }
    static getSignInput(transaction) {
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
            paymaster: transaction.customData?.paymasterParams?.paymaster || ethers.ethers.constants.AddressZero,
            nonce: transaction.nonce,
            value: transaction.value,
            data: transaction.data,
            factoryDeps: transaction.customData?.factoryDeps?.map((dep) => hashBytecode(dep)) || [],
            paymasterInput: transaction.customData?.paymasterParams?.paymasterInput || '0x'
        };
        return signInput;
    }
    async sign(transaction) {
        return await this.ethSigner._signTypedData(await this.eip712Domain, eip712Types, EIP712Signer.getSignInput(transaction));
    }
    static getSignedDigest(transaction) {
        if (!transaction.chainId) {
            throw Error("Transaction chainId isn't set");
        }
        const domain = {
            name: 'zkSync',
            version: '2',
            chainId: transaction.chainId
        };
        return hash._TypedDataEncoder.hash(domain, eip712Types, EIP712Signer.getSignInput(transaction));
    }
}

/**
 * capitalize the first letter.
 * @param value
 * @returns
 */
function sleep(millis) {
    return new Promise((resolve) => setTimeout(resolve, millis));
}
function parseTransaction(payload) {
    function handleAddress(value) {
        if (value === "0x") {
            return null;
        }
        return ethers.utils.getAddress(value);
    }
    function handleNumber(value) {
        if (value === "0x") {
            return ethers.BigNumber.from(0);
        }
        return ethers.BigNumber.from(value);
    }
    function arrayToPaymasterParams(arr) {
        if (arr.length == 0) {
            return undefined;
        }
        if (arr.length != 2) {
            throw new Error(`Invalid paymaster parameters, expected to have length of 2, found ${arr.length}`);
        }
        return {
            paymaster: ethers.utils.getAddress(arr[0]),
            paymasterInput: ethers.utils.arrayify(arr[1]),
        };
    }
    const bytes = ethers.utils.arrayify(payload);
    if (bytes[0] != EIP712_TX_TYPE) {
        return ethers.utils.parseTransaction(bytes);
    }
    const raw = ethers.utils.RLP.decode(bytes.slice(1));
    const transaction = {
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
    if ((ethers.utils.hexlify(ethSignature.r) == "0x" || ethers.utils.hexlify(ethSignature.s) == "0x") &&
        !transaction.customData.customSignature) {
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
function eip712TxHash(transaction, ethSignature) {
    const signedDigest = EIP712Signer.getSignedDigest(transaction);
    const hashedSignature = ethers.ethers.utils.keccak256(getSignature(transaction, ethSignature));
    return ethers.ethers.utils.keccak256(ethers.ethers.utils.hexConcat([signedDigest, hashedSignature]));
}
function getSignature(transaction, ethSignature) {
    if (transaction?.customData?.customSignature && transaction.customData.customSignature.length) {
        return ethers.ethers.utils.arrayify(transaction.customData.customSignature);
    }
    if (!ethSignature) {
        throw new Error("No signature provided");
    }
    const r = ethers.ethers.utils.zeroPad(ethers.ethers.utils.arrayify(ethSignature.r), 32);
    const s = ethers.ethers.utils.zeroPad(ethers.ethers.utils.arrayify(ethSignature.s), 32);
    const v = ethSignature.v;
    return new Uint8Array([...r, ...s, v]);
}
function hashBytecode(bytecode) {
    // For getting the consistent length we first convert the bytecode to UInt8Array
    const bytecodeAsArray = ethers.ethers.utils.arrayify(bytecode);
    if (bytecodeAsArray.length % 32 != 0) {
        throw new Error("The bytecode length in bytes must be divisible by 32");
    }
    if (bytecodeAsArray.length > MAX_BYTECODE_LEN_BYTES) {
        throw new Error(`Bytecode can not be longer than ${MAX_BYTECODE_LEN_BYTES} bytes`);
    }
    const hashStr = ethers.ethers.utils.sha256(bytecodeAsArray);
    const hash = ethers.ethers.utils.arrayify(hashStr);
    // Note that the length of the bytecode
    // should be provided in 32-byte words.
    const bytecodeLengthInWords = bytecodeAsArray.length / 32;
    if (bytecodeLengthInWords % 2 == 0) {
        throw new Error("Bytecode length in 32-byte words must be odd");
    }
    const bytecodeLength = ethers.ethers.utils.arrayify(bytecodeLengthInWords);
    // The bytecode should always take the first 2 bytes of the bytecode hash,
    // so we pad it from the left in case the length is smaller than 2 bytes.
    const bytecodeLengthPadded = ethers.ethers.utils.zeroPad(bytecodeLength, 2);
    const codeHashVersion = new Uint8Array([1, 0]);
    hash.set(codeHashVersion, 0);
    hash.set(bytecodeLengthPadded, 2);
    return hash;
}

let defaultFormatter;
class OlaProvider extends ethers.providers.JsonRpcProvider {
    // constructor(url: string, public chainId: number = DEFAULT_CHAIN_ID) {
    //     this.baseURL = url.replace(/\/$/, "");
    // }
    async poll() {
        const pollId = OlaProvider._nextPollId++;
        // Track all running promises, so we can trigger a post-poll once they are complete
        const runners = [];
        let blockNumber;
        try {
            blockNumber = await this._getInternalBlockNumber(100 + this.pollingInterval / 2);
        }
        catch (error) {
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
        if (Math.abs(this._emitted.block - blockNumber) > 1000) {
            console.warn(`network block skew detected; skipping block events (emitted=${this._emitted.block} blockNumber=${blockNumber})`);
            this.emit('error', {
                blockNumber: blockNumber,
                event: 'blockSkew',
                previousBlockNumber: this._emitted.block
            });
            this.emit('block', blockNumber);
        }
        else {
            // Notify all listener for each block that has passed
            for (let i = this._emitted.block + 1; i <= blockNumber; i++) {
                this.emit('block', i);
            }
        }
        // The emitted block was updated, check for obsolete events
        if (this._emitted.block !== blockNumber) {
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
                        if (receipt.blockNumber == null &&
                            !(receipt.status != null && ethers.BigNumber.from(receipt.status).isZero())) {
                            return null;
                        }
                        this._emitted['t:' + hash] = receipt.blockNumber;
                        this.emit(hash, receipt);
                        return null;
                    })
                        .catch((error) => {
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
                            logs.forEach((log) => {
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
                            .catch((error) => {
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
    async getTransactionReceipt(transactionHash) {
        await this.getNetwork();
        transactionHash = await transactionHash;
        const params = { transactionHash: this.formatter.hash(transactionHash, false) };
        return web.poll(async () => {
            const result = await this.perform('getTransactionReceipt', params);
            if (result == null) {
                if (this._emitted['t:' + transactionHash] === undefined) {
                    return null;
                }
                return undefined;
            }
            if (result.blockNumber == null && result.status != null && ethers.BigNumber.from(result.status).isZero()) {
                // transaction is rejected in the state-keeper
                return {
                    ...this.formatter.receipt({
                        ...result,
                        confirmations: 1,
                        blockNumber: 0,
                        blockHash: ethers.ethers.constants.HashZero
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
            }
            else {
                const receipt = this.formatter.receipt(result);
                if (receipt.blockNumber == null) {
                    receipt.confirmations = 0;
                }
                else if (receipt.confirmations == null) {
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
        }, { oncePoll: this });
    }
    async getBlock(blockHashOrBlockTag) {
        return this._getBlock(blockHashOrBlockTag, false);
    }
    async getBlockWithTransactions(blockHashOrBlockTag) {
        return this._getBlock(blockHashOrBlockTag, true);
    }
    static getFormatter() {
        if (defaultFormatter == null) {
            defaultFormatter = new ethers.providers.Formatter();
            const number = defaultFormatter.number.bind(defaultFormatter);
            const boolean = defaultFormatter.boolean.bind(defaultFormatter);
            const hash = defaultFormatter.hash.bind(defaultFormatter);
            const address = defaultFormatter.address.bind(defaultFormatter);
            defaultFormatter.formats.receiptLog.l1BatchNumber = ethers.providers.Formatter.allowNull(number);
            defaultFormatter.formats.l2Tol1Log = {
                blockNumber: number,
                blockHash: hash,
                l1BatchNumber: ethers.providers.Formatter.allowNull(number),
                transactionIndex: number,
                shardId: number,
                isService: boolean,
                sender: address,
                key: hash,
                value: hash,
                transactionHash: hash,
                txIndexInL1Batch: ethers.providers.Formatter.allowNull(number),
                logIndex: number
            };
            defaultFormatter.formats.receipt.l1BatchNumber = ethers.providers.Formatter.allowNull(number);
            defaultFormatter.formats.receipt.l1BatchTxIndex = ethers.providers.Formatter.allowNull(number);
            defaultFormatter.formats.receipt.l2ToL1Logs = ethers.providers.Formatter.arrayOf((value) => ethers.providers.Formatter.check(defaultFormatter.formats.l2Tol1Log, value));
            defaultFormatter.formats.block.l1BatchNumber = ethers.providers.Formatter.allowNull(number);
            defaultFormatter.formats.block.l1BatchTimestamp = ethers.providers.Formatter.allowNull(number);
            defaultFormatter.formats.blockWithTransactions.l1BatchNumber = ethers.providers.Formatter.allowNull(number);
            defaultFormatter.formats.blockWithTransactions.l1BatchTimestamp = ethers.providers.Formatter.allowNull(number);
            defaultFormatter.formats.transaction.l1BatchNumber = ethers.providers.Formatter.allowNull(number);
            defaultFormatter.formats.transaction.l1BatchTxIndex = ethers.providers.Formatter.allowNull(number);
            defaultFormatter.formats.filterLog.l1BatchNumber = ethers.providers.Formatter.allowNull(number);
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
    static hexlifyTransaction(transaction, allowExtra) {
        const result = ethers.ethers.providers.JsonRpcProvider.hexlifyTransaction(transaction, {
            ...allowExtra,
            customData: true,
            from: true
        });
        if (transaction.customData == null) {
            return result;
        }
        result.eip712Meta = {
            gasPerPubdata: ethers.utils.hexValue(transaction.customData.gasPerPubdata ?? 0)
        };
        transaction.type = EIP712_TX_TYPE;
        if (transaction.customData.factoryDeps) {
            // @ts-ignore
            result.eip712Meta.factoryDeps = transaction.customData.factoryDeps.map((dep) => 
            // TODO (SMA-1605): we arraify instead of hexlifying because server expects Vec<u8>.
            //  We should change deserialization there.
            Array.from(ethers.utils.arrayify(dep)));
        }
        if (transaction.customData.paymasterParams) {
            // @ts-ignore
            result.eip712Meta.paymasterParams = {
                paymaster: ethers.utils.hexlify(transaction.customData.paymasterParams.paymaster),
                paymasterInput: Array.from(ethers.utils.arrayify(transaction.customData.paymasterParams.paymasterInput))
            };
        }
        return result;
    }
    async estimateGas(transaction) {
        await this.getNetwork();
        const params = await ethers.utils.resolveProperties({
            transaction: this._getTransactionRequest(transaction)
        });
        if (transaction.customData != null) {
            // @ts-ignore
            params.transaction.customData = transaction.customData;
        }
        const result = await this.perform('estimateGas', params);
        try {
            return ethers.BigNumber.from(result);
        }
        catch (error) {
            throw new Error(`bad result from backend (estimateGas): ${result}`);
        }
    }
    async estimateGasL1(transaction) {
        await this.getNetwork();
        const params = await ethers.utils.resolveProperties({
            transaction: this._getTransactionRequest(transaction)
        });
        if (transaction.customData != null) {
            // @ts-ignore
            params.transaction.customData = transaction.customData;
        }
        const result = await this.send('ola_estimateGasL1ToL2', [
            OlaProvider.hexlifyTransaction(params.transaction, { from: true })
        ]);
        try {
            return ethers.BigNumber.from(result);
        }
        catch (error) {
            throw new Error(`bad result from backend (ola_estimateGasL1ToL2): ${result}`);
        }
    }
    async getGasPrice(token) {
        const params = token ? [token] : [];
        const price = await this.send('eth_gasPrice', params);
        return ethers.BigNumber.from(price);
    }
    constructor(url, network) {
        super(url, network);
        this.pollingInterval = 500;
        const blockTag = this.formatter.blockTag.bind(this.formatter);
        this.formatter.blockTag = (tag) => {
            if (tag == 'committed' || tag == 'finalized') {
                return tag;
            }
            return blockTag(tag);
        };
        this.contractAddresses = {};
        this.formatter.transaction = parseTransaction;
    }
    async getL1BatchNumber() {
        const number = await this.send('ola_getL1BatchNumber', []);
        return ethers.BigNumber.from(number).toNumber();
    }
    async getL1BatchDetails(number) {
        return await this.send('ola_getL1BatchDetails', [number]);
    }
    async getBlockDetails(number) {
        return await this.send('ola_getBlockDetails', [number]);
    }
    async getTransactionDetails(txHash) {
        return await this.send('ola_getTransactionDetails', [txHash]);
    }
    async getLogs(filter = {}) {
        filter = await filter;
        const logs = await this.send('eth_getLogs', [this._prepareFilter(filter)]);
        return this._parseLogs(logs);
    }
    _prepareFilter(filter) {
        return {
            ...filter,
            fromBlock: filter.fromBlock == null ? null : this.formatter.blockTag(filter.fromBlock),
            toBlock: filter.fromBlock == null ? null : this.formatter.blockTag(filter.toBlock)
        };
    }
    _parseLogs(logs) {
        return ethers.providers.Formatter.arrayOf(this.formatter.filterLog.bind(this.formatter))(logs);
    }
    async getTransaction(hash) {
        hash = await hash;
        const tx = await super.getTransaction(hash);
        return tx ? this._wrapTransaction(tx, hash) : null;
    }
    _wrapTransaction(tx, hash) {
        const response = super._wrapTransaction(tx, hash);
        response.waitFinalize = async () => {
            const receipt = await response.wait();
            while (true) {
                const block = await this.getBlock('finalized');
                if (receipt.blockNumber <= block.number) {
                    return await this.getTransactionReceipt(receipt.transactionHash);
                }
                else {
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
}
// public baseURL: string;
OlaProvider._nextPollId = 1;

// import { toUint64Array, toUint8Array } from "../utils/crypto";
class OlaAddress {
}

exports.DEFAULT_CHAIN_ID = DEFAULT_CHAIN_ID;
exports.OlaAddress = OlaAddress;
exports.OlaProvider = OlaProvider;
