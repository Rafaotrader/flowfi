export const EVM_CHAINS = [
  {
    id: 'ethereum',
    chainId: 1,
    name: 'Ethereum',
    type: 'evm',
    nativeSymbol: 'ETH',
    explorer: 'https://etherscan.io',
    rpcEnvKey: 'RPC_ETHEREUM',
    bridgeSupported: true,
    swapSupported: true,
    tokens: [
      { symbol: 'ETH', name: 'Ethereum', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, native: true },
      { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      { symbol: 'WETH', name: 'Wrapped ETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    ],
  },
  {
    id: 'base',
    chainId: 8453,
    name: 'Base',
    type: 'evm',
    nativeSymbol: 'ETH',
    explorer: 'https://basescan.org',
    rpcEnvKey: 'RPC_BASE',
    bridgeSupported: true,
    swapSupported: true,
    tokens: [
      { symbol: 'ETH', name: 'Ethereum', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, native: true },
      { symbol: 'USDC', name: 'USD Coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
      { symbol: 'WETH', name: 'Wrapped ETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    ],
  },
  {
    id: 'arbitrum',
    chainId: 42161,
    name: 'Arbitrum',
    type: 'evm',
    nativeSymbol: 'ETH',
    explorer: 'https://arbiscan.io',
    rpcEnvKey: 'RPC_ARBITRUM',
    bridgeSupported: true,
    swapSupported: true,
    tokens: [
      { symbol: 'ETH', name: 'Ethereum', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, native: true },
      { symbol: 'USDC', name: 'USD Coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
      { symbol: 'WETH', name: 'Wrapped ETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    ],
  },
  {
    id: 'optimism',
    chainId: 10,
    name: 'Optimism',
    type: 'evm',
    nativeSymbol: 'ETH',
    explorer: 'https://optimistic.etherscan.io',
    rpcEnvKey: 'RPC_OPTIMISM',
    bridgeSupported: true,
    swapSupported: true,
    tokens: [
      { symbol: 'ETH', name: 'Ethereum', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, native: true },
      { symbol: 'USDC', name: 'USD Coin', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
      { symbol: 'WETH', name: 'Wrapped ETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    ],
  },
  {
    id: 'bnb',
    chainId: 56,
    name: 'BNB Chain',
    type: 'evm',
    nativeSymbol: 'BNB',
    explorer: 'https://bscscan.com',
    rpcEnvKey: 'RPC_BNB',
    bridgeSupported: true,
    swapSupported: false,
    tokens: [
      { symbol: 'BNB', name: 'BNB', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, native: true },
      { symbol: 'USDC', name: 'USD Coin', address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
      { symbol: 'WBNB', name: 'Wrapped BNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
    ],
  },
];

export const NON_EVM_CHAINS = [
  {
    id: 'solana-mainnet',
    name: 'Solana',
    type: 'non-evm',
    nativeSymbol: 'SOL',
    explorer: 'https://solscan.io',
    rpcEnvKey: 'SOLANA_RPC_URL',
    bridgeSupported: false,
    swapSupported: false,
    lifiChainId: '1151111081099710',
    tokens: [
      { symbol: 'SOL', name: 'Solana', address: '11111111111111111111111111111111', decimals: 9, native: true },
      { symbol: 'USDC', name: 'USD Coin', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
    ],
  },
];

export const BRIDGE_CHAINS = [...EVM_CHAINS, ...NON_EVM_CHAINS];

export function getBridgeChain(id) {
  return BRIDGE_CHAINS.find(chain => chain.id === id || String(chain.chainId) === String(id));
}

export function getDefaultToken(chain) {
  return chain?.tokens?.[0] || null;
}

export function isSolanaRoute(fromChainId, toChainId) {
  return getBridgeChain(fromChainId)?.type === 'non-evm' || getBridgeChain(toChainId)?.type === 'non-evm';
}
