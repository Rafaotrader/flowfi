export function getPhantomProvider() {
  if (typeof window === 'undefined') return null;
  const provider = window.solana;
  return provider?.isPhantom ? provider : null;
}

export function isPhantomInstalled() {
  return Boolean(getPhantomProvider());
}

export async function connectSolanaWallet() {
  const provider = getPhantomProvider();
  if (!provider) {
    throw new Error('Phantom não encontrado. Instale uma carteira Solana para continuar.');
  }
  const response = await provider.connect();
  return response.publicKey?.toString?.() || provider.publicKey?.toString?.() || null;
}

export async function disconnectSolanaWallet() {
  const provider = getPhantomProvider();
  if (provider?.disconnect) await provider.disconnect();
}

export function getConnectedSolanaAddress() {
  const provider = getPhantomProvider();
  return provider?.publicKey?.toString?.() || null;
}
