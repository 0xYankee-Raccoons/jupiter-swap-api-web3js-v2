import {
    createKeyPairSignerFromPrivateKeyBytes,
    createSolanaRpc,
    getBase64EncodedWireTransaction,
    getTransactionDecoder,
    signTransaction,
} from '@solana/web3.js';

const rpc = createSolanaRpc(process.env.rpc || '');

// For 32 bytes Uint8Array format private key
const privateKeyArray = JSON.parse(process.env.PRIVATE_KEY_ARRAY || '[]');
const signer_account = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(privateKeyArray));

// For 64 bytes Uint8Array format private key
// const privateKeyArray = JSON.parse(process.env.PRIVATE_KEY_ARRAY || '[]');
// const signer_account = await createKeyPairSignerFromBytes(new Uint8Array(privateKeyArray));

// For base58 format private key
// Import getBase58Encoder
// const privateKeyBase58 = process.env.PRIVATE_KEY_BASE58 || '';
// const signer_account = await createKeyPairSignerFromBytes(new Uint8Array(getBase58Encoder().encode(privateKeyBase58)));

// console.log(signer_account);

const quoteResponse = await (
    await fetch(
        'https://api.jup.ag/swap/v1/quote?inputMint=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000&slippageBps=10'
    )
).json();
// console.log(quoteResponse);

const swapResponse = await (
    await fetch('https://api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        // 'x-api-key': '',
        },
        body: JSON.stringify({
            quoteResponse,
            userPublicKey: signer_account.address,
        })
    })
).json();
// console.log(swapResponse);

// Extract the transaction from the swap response
const base64EncodedTransaction = swapResponse.swapTransaction;
// console.log(base64EncodedTransaction);

// Convert the base64 encoded transaction to a buffer
const swapTransactionBuffer = Buffer.from(base64EncodedTransaction, 'base64');
// console.log(swapTransactionBuffer);

// Decode the buffer to a transaction (messageBytes and signatures)
const decodedTransaction = getTransactionDecoder().decode(swapTransactionBuffer);
// console.log(decodedTransaction);

// Sign the transaction
const signedTransaction = await signTransaction(
    [signer_account.keyPair],
    decodedTransaction
)
// console.log(signedTransaction);

// Serialize the signed transaction back to base64 format
const serializedTransaction = getBase64EncodedWireTransaction(signedTransaction);
// console.log(serializedTransaction);

// Send the transaction to the network
const signature = await rpc.sendTransaction(serializedTransaction, { 
    encoding: 'base64',
    maxRetries: 0n,
    skipPreflight: true 
}).send();

// Wait for the transaction to be confirmed and handle expiry, timeout, error or success.
const startTime = Date.now();

while (true) {
    try {
        // Check if block height exceeded first
        const currentBlockHeight = await rpc.getBlockHeight({ commitment: 'confirmed' }).send();
        if (currentBlockHeight > BigInt(swapResponse.lastValidBlockHeight)) {
            console.error('Transaction expired: Block height exceeded');
            break;
        }

        // Check if transaction is confirmed
        const transaction = await rpc.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
        }).send();

        if (transaction === null) {
            await new Promise(resolve => setTimeout(resolve, 400));
            continue;
        }

        if (transaction === null || transaction.meta === null) {
            throw new Error('Transaction not found or not confirmed');
        }

        if (transaction.meta.err) {
            console.error('Transaction failed with error:', transaction.meta.err);
            break;
        }

        console.log(`https://solscan.io/tx/${signature}`);
        break;
    } catch (error) {
        if (error instanceof Error) {
            console.error('Error checking transaction:', error.message);
        } else {
            console.error('Error checking transaction:', error);
        }
    }
};