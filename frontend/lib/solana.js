const DEFAULT_SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

export function getSolanaRpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    || process.env.SOLANA_RPC_URL
    || DEFAULT_SOLANA_RPC;
}

export function lamportsToSol(lamports) {
  return Number(lamports || 0) / 1_000_000_000;
}

export async function getSolBalance(publicKey, rpcUrl = getSolanaRpcUrl()) {
  if (!publicKey) return null;
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'flowfy-sol-balance',
      method: 'getBalance',
      params: [publicKey],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Solana RPC ${res.status}`);
  }
  return BigInt(data.result?.value || 0);
}
