require('dotenv').config();

const GRAPH_API_KEY = process.env.GRAPH_API_KEY || '';

function graphUrl(subgraphId, hostedFallback) {
  if (GRAPH_API_KEY) {
    return `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/${subgraphId}`;
  }
  return hostedFallback || '';
}

const NETWORKS = {
  1: {
    chainId: 1,
    name: 'Ethereum',
    slug: 'ethereum',
    badge: 'ETH',
    color: '#627EEA',
    rpcUrl: process.env.RPC_ETHEREUM || 'https://eth.llamarpc.com',
    subgraphUrl: process.env.ETHEREUM_SUBGRAPH_URL ||
      graphUrl(
        '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
        'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3'
      ),
    positionManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    explorerUrl: 'https://etherscan.io',
  },
  42161: {
    chainId: 42161,
    name: 'Arbitrum',
    slug: 'arbitrum',
    badge: 'ARB',
    color: '#28A0F0',
    rpcUrl: process.env.RPC_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
    subgraphUrl: process.env.ARBITRUM_SUBGRAPH_URL ||
      graphUrl(
        'FQ6JYszEKApsBpAmiHesRsd9Ygc6mzmpNRANeVQFYoVX',
        'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal'
      ),
    positionManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    explorerUrl: 'https://arbiscan.io',
  },
  10: {
    chainId: 10,
    name: 'Optimism',
    slug: 'optimism',
    badge: 'OP',
    color: '#FF0420',
    rpcUrl: process.env.RPC_OPTIMISM || 'https://mainnet.optimism.io',
    subgraphUrl: process.env.OPTIMISM_SUBGRAPH_URL ||
      graphUrl(
        'Cghf4LfVqPiFw6fp6Y5X5Ubc8UpmUhSfJL82kvsenAH',
        'https://api.thegraph.com/subgraphs/name/ianlapham/optimism-post-regenesis'
      ),
    positionManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    explorerUrl: 'https://optimistic.etherscan.io',
  },
  137: {
    chainId: 137,
    name: 'Polygon',
    slug: 'polygon',
    badge: 'POL',
    color: '#8247E5',
    rpcUrl: process.env.RPC_POLYGON || 'https://polygon-rpc.com',
    subgraphUrl: process.env.POLYGON_SUBGRAPH_URL ||
      graphUrl(
        '3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCDqsU',
        'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon'
      ),
    positionManagerAddress: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    explorerUrl: 'https://polygonscan.com',
  },
  8453: {
    chainId: 8453,
    name: 'Base',
    slug: 'base',
    badge: 'BASE',
    color: '#0052FF',
    rpcUrl: process.env.RPC_BASE || 'https://mainnet.base.org',
    subgraphUrl: process.env.BASE_SUBGRAPH_URL ||
      graphUrl(
        '43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG',
        'https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest'
      ),
    positionManagerAddress: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    explorerUrl: 'https://basescan.org',
  },
  56: {
    chainId: 56,
    name: 'BNB',
    slug: 'bnb',
    badge: 'BNB',
    color: '#F0B90B',
    rpcUrl: process.env.RPC_BNB || 'https://bsc-dataseed.binance.org',
    subgraphUrl: process.env.BNB_SUBGRAPH_URL ||
      graphUrl(
        'A1fvJJzWpd2hfdASBjZDqwgSFMNMQKG9D3b5ZSG9dZzp',
        'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc'
      ),
    positionManagerAddress: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    explorerUrl: 'https://bscscan.com',
  },
};

const SUPPORTED_CHAIN_IDS = Object.keys(NETWORKS).map(Number);
const DEFAULT_CHAIN_ID = parseInt(process.env.DEFAULT_CHAIN_ID) || 8453;

module.exports = { NETWORKS, SUPPORTED_CHAIN_IDS, DEFAULT_CHAIN_ID };
