const CHAIN_PARAMS = {
  1:     { chainId: '0x1',    chainName: 'Ethereum Mainnet', nativeCurrency: { name: 'Ether', symbol: 'ETH',  decimals: 18 }, rpcUrls: ['https://ethereum.publicnode.com'], blockExplorerUrls: ['https://etherscan.io'] },
  42161: { chainId: '0xa4b1', chainName: 'Arbitrum One',     nativeCurrency: { name: 'Ether', symbol: 'ETH',  decimals: 18 }, rpcUrls: ['https://arb1.arbitrum.io/rpc'], blockExplorerUrls: ['https://arbiscan.io'] },
  10:    { chainId: '0xa',    chainName: 'OP Mainnet',        nativeCurrency: { name: 'Ether', symbol: 'ETH',  decimals: 18 }, rpcUrls: ['https://mainnet.optimism.io'],  blockExplorerUrls: ['https://optimistic.etherscan.io'] },
  137:   { chainId: '0x89',   chainName: 'Polygon Mainnet',  nativeCurrency: { name: 'MATIC', symbol: 'MATIC',decimals: 18 }, rpcUrls: ['https://polygon-rpc.com'],      blockExplorerUrls: ['https://polygonscan.com'] },
  8453:  { chainId: '0x2105', chainName: 'Base',              nativeCurrency: { name: 'Ether', symbol: 'ETH',  decimals: 18 }, rpcUrls: ['https://mainnet.base.org'],     blockExplorerUrls: ['https://basescan.org'] },
  56:    { chainId: '0x38',   chainName: 'BNB Smart Chain',   nativeCurrency: { name: 'BNB',   symbol: 'BNB',  decimals: 18 }, rpcUrls: ['https://bsc-dataseed.binance.org'], blockExplorerUrls: ['https://bscscan.com'] },
};

export function isWalletAvailable() {
  return typeof window !== 'undefined' && Boolean(window.ethereum);
}

export async function connectWallet() {
  if (!isWalletAvailable()) throw new Error('MetaMask não encontrado. Instale em metamask.io');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const chainHex = await window.ethereum.request({ method: 'eth_chainId' });
  return { address: accounts[0], chainId: parseInt(chainHex, 16) };
}

export async function switchNetwork(targetChainId) {
  if (!isWalletAvailable()) throw new Error('MetaMask não encontrado');
  const hex = `0x${targetChainId.toString(16)}`;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (err) {
    if (err.code === 4902 || err.code === -32603) {
      const params = CHAIN_PARAMS[targetChainId];
      if (!params) throw new Error(`Rede ${targetChainId} não suportada`);
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [params] });
    } else {
      throw err;
    }
  }
}

export function getSavedAddress() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pyf_address');
}
