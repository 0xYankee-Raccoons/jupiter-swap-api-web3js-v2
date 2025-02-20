import {
    createKeyPairSignerFromBytes,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    getBase64Encoder,
    getBase64EncodedWireTransaction,
    getTransactionDecoder,
} from '@solana/web3.js';

import { createRecentSignatureConfirmationPromiseFactory } from '@solana/transaction-confirmation';

const rpc_url = createSolanaRpc(process.env.RPC_URL || '');
const rpc_wss = createSolanaRpcSubscriptions(process.env.RPC_WSS || '');

// For Uint8Array format private key
const privateKeyArray = JSON.parse(process.env.PRIVATE_KEY_ARRAY || '[]');
const signer_account = await createKeyPairSignerFromBytes(new Uint8Array(privateKeyArray));

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

const base64EncodedTransaction = swapResponse.swapTransaction;

// console.log(base64EncodedTransaction);

// Deserialize the base64 transaction to sign (before sending)
// https://github.com/anza-xyz/solana-web3.js/blob/325925c76d939b2a8065f5174d99de6663255b8b/examples/deserialize-transaction/src/example.ts#L176
const transactionBytes = getBase64Encoder().encode(base64EncodedTransaction);
// console.log(transactionBytes);

const decodedTransaction = getTransactionDecoder().decode(transactionBytes);
// console.log(decodedTransaction);

// Sign the transaction
const [signatureDictionary] = await signer_account.signTransactions([decodedTransaction]);
const signatureBytes = signatureDictionary[signer_account.address];
// console.log(signatureBytes);

// Now we can serialize the transaction back to base64 for sending
const serializedTransaction = getBase64EncodedWireTransaction({
    messageBytes: decodedTransaction.messageBytes,
    signatures: { [signer_account.address]: signatureBytes }
});
// console.log(serializedTransaction);

// Send the transaction
const signature = await rpc_url.sendTransaction(serializedTransaction, { 
    encoding: 'base64',
    maxRetries: 0n,
    skipPreflight: true 
}).send();

// Wait for the transaction to be confirmed
const getRecentSignatureConfirmationPromise = createRecentSignatureConfirmationPromiseFactory({
    rpc: rpc_url,
    rpcSubscriptions: rpc_wss,
});
try {
    await getRecentSignatureConfirmationPromise({
        commitment: 'confirmed',
        signature,
        abortSignal: AbortSignal.timeout(60000),
    });
    console.log(`CONFIRMED: https://solscan.io/tx/${signature}`);
} catch (e) {
    console.error(`FAILED: https://solscan.io/tx/${signature}\n`);
    throw e;
}