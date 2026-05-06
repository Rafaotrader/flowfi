'use client';

import { createPublicClient, createWalletClient, custom, http, parseAbi } from 'viem';
import { mainnet, arbitrum, optimism, polygon, base } from 'viem/chains';

// ─── Chains & addresses ───────────────────────────────────────────────────────

export const CHAINS = { 1: mainnet, 42161: arbitrum, 10: optimism, 137: polygon, 8453: base };

const RPC_URLS = {
  1:     process.env.NEXT_PUBLIC_RPC_URL || 'https://eth.llamarpc.com',
  42161: 'https://arb1.arbitrum.io/rpc',
  10:    'https://mainnet.optimism.io',
  137:   'https://polygon-rpc.com',
  8453:  'https://mainnet.base.org',
};

export const POSITION_MANAGER_BY_CHAIN = {
  1:     '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  42161: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  10:    '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  137:   '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  8453:  '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
};

// Mantido por compatibilidade
export const UNISWAP_V3_POSITION_MANAGER = POSITION_MANAGER_BY_CHAIN[1];

// ─── ABIs ─────────────────────────────────────────────────────────────────────

export const HARVESTER_ABI = parseAbi([
  'function harvestWithFee(uint256 tokenId) external returns (uint256 userAmount0, uint256 userAmount1)',
  'function previewHarvest(uint256 amount0, uint256 amount1) external pure returns (uint256 userAmount0, uint256 userAmount1, uint256 platformFee0, uint256 platformFee1)',
  'function PLATFORM_FEE_BPS() external view returns (uint256)',
  'function setPlatformWallet(address newWallet) external',
  'function emergencyWithdraw(address token, uint256 amount) external',
  'event HarvestExecuted(address indexed user, uint256 indexed tokenId, address token0, address token1, uint256 userAmount0, uint256 userAmount1, uint256 fee0, uint256 fee1)',
]);

export const POSITION_MANAGER_ABI = [
  {
    name: 'positions', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'nonce',                        type: 'uint96'  },
      { name: 'operator',                     type: 'address' },
      { name: 'token0',                       type: 'address' },
      { name: 'token1',                       type: 'address' },
      { name: 'fee',                          type: 'uint24'  },
      { name: 'tickLower',                    type: 'int24'   },
      { name: 'tickUpper',                    type: 'int24'   },
      { name: 'liquidity',                    type: 'uint128' },
      { name: 'feeGrowthInside0LastX128',     type: 'uint256' },
      { name: 'feeGrowthInside1LastX128',     type: 'uint256' },
      { name: 'tokensOwed0',                  type: 'uint128' },
      { name: 'tokensOwed1',                  type: 'uint128' },
    ],
  },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'tokenOfOwnerByIndex', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'collect', type: 'function', stateMutability: 'nonpayable',
    inputs: [{
      name: 'params', type: 'tuple',
      components: [
        { name: 'tokenId',    type: 'uint256' },
        { name: 'recipient',  type: 'address' },
        { name: 'amount0Max', type: 'uint128' },
        { name: 'amount1Max', type: 'uint128' },
      ],
    }],
    outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }],
  },
  {
    name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'owner', type: 'address' }],
  },
  {
    name: 'getApproved', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'operator', type: 'address' }],
  },
  {
    name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'isApprovedForAll', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'decreaseLiquidity', type: 'function', stateMutability: 'nonpayable',
    inputs: [{
      name: 'params', type: 'tuple',
      components: [
        { name: 'tokenId',    type: 'uint256' },
        { name: 'liquidity',  type: 'uint128' },
        { name: 'amount0Min', type: 'uint256' },
        { name: 'amount1Min', type: 'uint256' },
        { name: 'deadline',   type: 'uint256' },
      ],
    }],
    outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }],
  },
];

const ERC20_ABI = [
  { name: 'symbol',   inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { name: 'decimals', inputs: [], outputs: [{ type: 'uint8'  }], stateMutability: 'view', type: 'function' },
];

export const ERC20_FULL_ABI = [
  ...ERC20_ABI,
  { name: 'balanceOf',  inputs: [{ name: 'account', type: 'address' }],                                                outputs: [{ type: 'uint256' }], stateMutability: 'view',         type: 'function' },
  { name: 'allowance',  inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],            outputs: [{ type: 'uint256' }], stateMutability: 'view',         type: 'function' },
  { name: 'approve',    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],           outputs: [{ type: 'bool'    }], stateMutability: 'nonpayable',   type: 'function' },
];

// Uniswap V3 factory addresses per chain
export const FACTORY_BY_CHAIN = {
  1:     '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  42161: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  10:    '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  137:   '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  8453:  '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  56:    '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
};

const FACTORY_ABI = [
  { name: 'getPool', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }], outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
];

const POOL_SLOT0_ABI = [
  { name: 'slot0', inputs: [], outputs: [{ name: 'sqrtPriceX96', type: 'uint160' }, { name: 'tick', type: 'int24' }, { type: 'uint16' }, { type: 'uint16' }, { type: 'uint16' }, { type: 'uint8' }, { name: 'unlocked', type: 'bool' }], stateMutability: 'view', type: 'function' },
];

export const MINT_ABI = [{
  name: 'mint', type: 'function', stateMutability: 'payable',
  inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'token0',          type: 'address' },
    { name: 'token1',          type: 'address' },
    { name: 'fee',             type: 'uint24'  },
    { name: 'tickLower',       type: 'int24'   },
    { name: 'tickUpper',       type: 'int24'   },
    { name: 'amount0Desired',  type: 'uint256' },
    { name: 'amount1Desired',  type: 'uint256' },
    { name: 'amount0Min',      type: 'uint256' },
    { name: 'amount1Min',      type: 'uint256' },
    { name: 'recipient',       type: 'address' },
    { name: 'deadline',        type: 'uint256' },
  ]}],
  outputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'liquidity', type: 'uint128' }, { name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }],
}];

export const TICK_SPACINGS = { 100: 1, 500: 10, 3000: 60, 10000: 200 };

export function priceToTick(price) {
  if (!price || price <= 0) return 0;
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

export function nearestUsableTick(tick, tickSpacing) {
  return Math.round(tick / tickSpacing) * tickSpacing;
}

// sqrtPriceX96 → human-readable price (token1 per token0, decimal-adjusted)
export function sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1) {
  const sq = Number(sqrtPriceX96) / 2 ** 96;
  return (sq * sq) * (10 ** decimals0) / (10 ** decimals1);
}

const FEE_LABELS = { 100: '0.01%', 500: '0.05%', 3000: '0.3%', 10000: '1%' };

// Known token metadata by address (lowercase) — fallback when on-chain read fails
const TOKEN_META_MAP = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC',  decimals: 6,  isStable: true  },
  '0xcbb7c0000ab88b473b1f5a45fa9e8cedab6feaa1': { symbol: 'cbBTC', decimals: 8,  isStable: false },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH',  decimals: 18, isStable: false },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT',  decimals: 6,  isStable: true  },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI',   decimals: 18, isStable: true  },
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': { symbol: 'USDbC', decimals: 6,  isStable: true  },
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': { symbol: 'cbETH', decimals: 18, isStable: false },
};

// Never returns '???' — falls back to abbreviated address
export function resolveTokenMeta(address) {
  const key = String(address || '').toLowerCase();
  if (TOKEN_META_MAP[key]) return TOKEN_META_MAP[key];
  const short = key.startsWith('0x') && key.length >= 10
    ? `${key.slice(0, 6)}…${key.slice(-4)}`
    : key || '—';
  return { symbol: short, decimals: 18, isStable: false };
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export function getPublicClient(chainId = 8453) {
  return createPublicClient({
    chain: CHAINS[chainId] || mainnet,
    transport: http(RPC_URLS[chainId] || RPC_URLS[1]),
  });
}

// Uses MetaMask's own RPC when available — avoids public RPC rate-limits.
// Falls back to getPublicClient when window.ethereum is absent (SSR / no wallet).
export function getMetaMaskPublicClient(chainId = 8453) {
  if (typeof window !== 'undefined' && window.ethereum) {
    return createPublicClient({
      chain: CHAINS[chainId] || mainnet,
      transport: custom(window.ethereum),
    });
  }
  return getPublicClient(chainId);
}

export async function getWalletClient(chainId = 8453) {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask não encontrado. Instale a extensão MetaMask.');
  }
  const chain = CHAINS[chainId] || base;
  return createWalletClient({ chain, transport: custom(window.ethereum) });
}

// ─── Posições on-chain ────────────────────────────────────────────────────────

// Fallback RPC endpoints for Base — tried in order when one is unavailable/rate-limited
const BASE_RPCS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://base-rpc.publicnode.com',
];

// Calls fn(publicClient) trying each RPC until one succeeds.
// Does NOT retry on contract reverts or user rejections.
async function readWithFallback(fn, chainId = 8453) {
  const rpcs = chainId === 8453 ? BASE_RPCS : [RPC_URLS[chainId] || RPC_URLS[1]];
  let lastErr;
  for (const rpc of rpcs) {
    try {
      const c = createPublicClient({ chain: CHAINS[chainId] || base, transport: http(rpc) });
      return await fn(c);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '').toLowerCase();
      if (err?.code === 4001 || msg.includes('user rejected') || msg.includes('execution reverted')) throw err;
    }
  }
  throw lastErr;
}

function safeBigInt(v, fallback = 0n) {
  try {
    if (v === undefined || v === null) return fallback;
    return BigInt(v.toString());
  } catch { return fallback; }
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Parses raw positions() output — supports viem named object and array-indexed tuple
function parseRawPosition(raw, tokenId) {
  return {
    tokenId:     tokenId?.toString?.() || String(tokenId),
    token0:      raw?.token0      ?? raw?.[2]  ?? null,
    token1:      raw?.token1      ?? raw?.[3]  ?? null,
    fee:         safeNumber(raw?.fee         ?? raw?.[4]),
    tickLower:   safeNumber(raw?.tickLower   ?? raw?.[5]),
    tickUpper:   safeNumber(raw?.tickUpper   ?? raw?.[6]),
    liquidity:   safeBigInt(raw?.liquidity   ?? raw?.[7]),
    tokensOwed0: safeBigInt(raw?.tokensOwed0 ?? raw?.[10]),
    tokensOwed1: safeBigInt(raw?.tokensOwed1 ?? raw?.[11]),
  };
}

export async function getPositionsForAddress(address, chainId = 8453) {
  const nftAddr  = POSITION_MANAGER_BY_CHAIN[chainId] || POSITION_MANAGER_BY_CHAIN[1];
  const erc20Cli = getPublicClient(chainId);

  // ── Camada A: balance ──────────────────────────────────────────────────────
  const balance = await readWithFallback(
    c => c.readContract({ address: nftAddr, abi: POSITION_MANAGER_ABI, functionName: 'balanceOf', args: [address] }),
    chainId
  );
  const totalBalance = Number(balance);
  if (totalBalance === 0) return { positions: [], totalBalance: 0, failedCount: 0 };

  // ── Camada A: tokenIds (sequential to avoid rate-limit bursts) ─────────────
  const count    = Math.min(totalBalance, 20);
  const tokenIds = [];
  for (let i = 0; i < count; i++) {
    try {
      const id = await readWithFallback(
        c => c.readContract({ address: nftAddr, abi: POSITION_MANAGER_ABI, functionName: 'tokenOfOwnerByIndex', args: [address, BigInt(i)] }),
        chainId
      );
      tokenIds.push(id);
    } catch (e) {
      console.warn('[positions] tokenOfOwnerByIndex failed', { index: i, error: e?.message });
    }
  }

  // ── Camadas B + C: positions() + ERC20 enrichment ─────────────────────────
  // A failure in any single position produces a partial card — never crashes the page.
  const results = await Promise.allSettled(
    tokenIds.map(async tokenId => {

      // Camada B: raw position data
      let raw;
      try {
        raw = await readWithFallback(
          c => c.readContract({ address: nftAddr, abi: POSITION_MANAGER_ABI, functionName: 'positions', args: [tokenId] }),
          chainId
        );
      } catch (e) {
        console.warn('[positions] positions() failed', { tokenId: tokenId.toString(), error: e?.message });
        return {
          tokenId: tokenId.toString(),
          token0: null, token1: null,
          token0Symbol: '—', token1Symbol: '—',
          decimals0: 18, decimals1: 18,
          fee: null, feeTierLabel: '—',
          tickLower: 0, tickUpper: 0,
          liquidity: '0', tokensOwed0: '0', tokensOwed1: '0',
          hasLiquidity: false, syncStatus: 'partial',
        };
      }

      // Parse — never throws
      const p  = parseRawPosition(raw, tokenId);
      const t0 = p.token0;
      const t1 = p.token1;
      const m0 = resolveTokenMeta(t0);
      const m1 = resolveTokenMeta(t1);

      // Camada C: ERC20 symbol + decimals — each has individual catch → meta fallback
      const [sym0, sym1, dec0, dec1] = await Promise.all([
        t0 ? erc20Cli.readContract({ address: t0, abi: ERC20_ABI, functionName: 'symbol'   }).catch(() => m0.symbol)   : Promise.resolve(m0.symbol),
        t1 ? erc20Cli.readContract({ address: t1, abi: ERC20_ABI, functionName: 'symbol'   }).catch(() => m1.symbol)   : Promise.resolve(m1.symbol),
        t0 ? erc20Cli.readContract({ address: t0, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => m0.decimals) : Promise.resolve(m0.decimals),
        t1 ? erc20Cli.readContract({ address: t1, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => m1.decimals) : Promise.resolve(m1.decimals),
      ]);

      return {
        tokenId:      p.tokenId,
        token0:       t0,
        token1:       t1,
        token0Symbol: String(sym0 || m0.symbol),
        token1Symbol: String(sym1 || m1.symbol),
        decimals0:    safeNumber(dec0, m0.decimals),
        decimals1:    safeNumber(dec1, m1.decimals),
        fee:          p.fee,
        feeTierLabel: FEE_LABELS[p.fee] || (p.fee ? `${p.fee / 10000}%` : '—'),
        tickLower:    p.tickLower,
        tickUpper:    p.tickUpper,
        liquidity:    p.liquidity.toString(),
        tokensOwed0:  p.tokensOwed0.toString(),
        tokensOwed1:  p.tokensOwed1.toString(),
        hasLiquidity: p.liquidity > 0n,
        syncStatus:   'synced',
      };
    })
  );

  const allPositions = [];
  let failedCount = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allPositions.push(r.value);
      if (r.value.syncStatus === 'partial') failedCount++;
    }
    // rejected can't happen (inner catch covers all paths)
  }

  console.group('[positions] sync');
  console.log('wallet', address);
  console.log('tokenIds', tokenIds.map(String));
  console.log('synced', allPositions.filter(p => p.syncStatus === 'synced').length, '/ partial', failedCount);
  console.groupEnd();

  return { positions: allPositions, totalBalance, failedCount };
}

// ─── Fees acumuladas ──────────────────────────────────────────────────────────

export async function readAccruedFees(tokenId, chainId = 8453) {
  const client  = getPublicClient(chainId);
  const nftAddr = POSITION_MANAGER_BY_CHAIN[chainId] || POSITION_MANAGER_BY_CHAIN[1];

  try {
    // Simula collect para obter valor real (inclui fees desde último collect)
    const simulation = await client.simulateContract({
      address: nftAddr,
      abi: POSITION_MANAGER_ABI,
      functionName: 'collect',
      args: [{
        tokenId:    BigInt(tokenId),
        recipient:  '0x0000000000000000000000000000000000000001',
        amount0Max: 340282366920938463463374607431768211455n,
        amount1Max: 340282366920938463463374607431768211455n,
      }],
    });
    return { amount0: simulation.result[0], amount1: simulation.result[1] };
  } catch {
    // Fallback: tokensOwed direto do estado on-chain
    const pos = await client.readContract({
      address: nftAddr, abi: POSITION_MANAGER_ABI, functionName: 'positions', args: [BigInt(tokenId)],
    });
    return {
      amount0: pos?.tokensOwed0 ?? pos?.[10] ?? 0n,
      amount1: pos?.tokensOwed1 ?? pos?.[11] ?? 0n,
    };
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function authenticateWithWallet(address) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
  const nonceRes = await fetch(`${apiUrl}/api/auth/nonce/${address}`);
  const { message } = await nonceRes.json();
  const walletClient = await getWalletClient();
  const signature = await walletClient.signMessage({ account: address, message });
  const authRes = await fetch(`${apiUrl}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: address, signature }),
  });
  if (!authRes.ok) throw new Error('Falha na autenticação');
  const { token } = await authRes.json();
  if (typeof window !== 'undefined') localStorage.setItem('ufm_token', token);
  return token;
}

// ─── NFT Approval ────────────────────────────────────────────────────────────

export async function checkNftApproval(tokenId, harvesterAddress, chainId = 8453) {
  const client  = getPublicClient(chainId);
  const nftAddr = POSITION_MANAGER_BY_CHAIN[chainId] || POSITION_MANAGER_BY_CHAIN[1];

  const [approved, owner] = await Promise.all([
    client.readContract({ address: nftAddr, abi: POSITION_MANAGER_ABI, functionName: 'getApproved',   args: [BigInt(tokenId)] }),
    client.readContract({ address: nftAddr, abi: POSITION_MANAGER_ABI, functionName: 'ownerOf',       args: [BigInt(tokenId)] }),
  ]);

  if (approved?.toLowerCase() === harvesterAddress?.toLowerCase()) return true;

  return client.readContract({
    address: nftAddr, abi: POSITION_MANAGER_ABI, functionName: 'isApprovedForAll',
    args: [owner, harvesterAddress],
  });
}

export async function approveHarvester(tokenId, harvesterAddress, chainId = 8453) {
  const walletClient = await getWalletClient();
  const [account]    = await walletClient.getAddresses();
  const nftAddr      = POSITION_MANAGER_BY_CHAIN[chainId] || POSITION_MANAGER_BY_CHAIN[1];
  const hash = await walletClient.writeContract({
    account, address: nftAddr, abi: POSITION_MANAGER_ABI,
    functionName: 'approve', args: [harvesterAddress, BigInt(tokenId)],
  });
  const receipt = await getPublicClient(chainId).waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

// ─── ERC20 helpers ───────────────────────────────────────────────────────────

export async function getTokenInfo(tokenAddress, chainId = 8453) {
  const client = getPublicClient(chainId);
  const meta = resolveTokenMeta(tokenAddress);
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: tokenAddress, abi: ERC20_FULL_ABI, functionName: 'symbol'   }).catch(() => meta.symbol),
    client.readContract({ address: tokenAddress, abi: ERC20_FULL_ABI, functionName: 'decimals' }).catch(() => meta.decimals),
  ]);
  return { symbol, decimals: Number(decimals) };
}

export async function getTokenBalance(tokenAddress, owner, chainId = 8453) {
  const client = getPublicClient(chainId);
  return client.readContract({ address: tokenAddress, abi: ERC20_FULL_ABI, functionName: 'balanceOf', args: [owner] });
}

export async function checkERC20Allowance(tokenAddress, owner, spender, chainId = 8453) {
  const client = getPublicClient(chainId);
  return client.readContract({ address: tokenAddress, abi: ERC20_FULL_ABI, functionName: 'allowance', args: [owner, spender] });
}

export async function approveERC20Token(tokenAddress, spender, amount, chainId = 8453) {
  const walletClient = await getWalletClient(chainId);
  const [account] = await walletClient.getAddresses();
  const MAX = 2n ** 256n - 1n;
  const hash = await walletClient.writeContract({
    account, address: tokenAddress, abi: ERC20_FULL_ABI,
    functionName: 'approve', args: [spender, amount ?? MAX],
    chain: CHAINS[chainId] || base,
  });
  const receipt = await getPublicClient(chainId).waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

// ─── Collect & close position ────────────────────────────────────────────────

const MaxUint128 = 340282366920938463463374607431768211455n;

export async function collectPositionFees(tokenId, recipientAddress, chainId = 8453) {
  const walletClient = await getWalletClient(chainId);
  const [account]    = await walletClient.getAddresses();
  const nftAddr      = POSITION_MANAGER_BY_CHAIN[chainId] || POSITION_MANAGER_BY_CHAIN[1];
  const hash = await walletClient.writeContract({
    account,
    address: nftAddr,
    abi: POSITION_MANAGER_ABI,
    functionName: 'collect',
    args: [{
      tokenId:    BigInt(tokenId),
      recipient:  recipientAddress || account,
      amount0Max: MaxUint128,
      amount1Max: MaxUint128,
    }],
    chain: CHAINS[chainId] || base,
  });
  const receipt = await getPublicClient(chainId).waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

export async function closePosition(tokenId, liquidityAmount, recipientAddress, chainId = 8453) {
  const walletClient = await getWalletClient(chainId);
  const [account]    = await walletClient.getAddresses();
  const nftAddr      = POSITION_MANAGER_BY_CHAIN[chainId] || POSITION_MANAGER_BY_CHAIN[1];
  const recipient    = recipientAddress || account;
  const deadline     = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Step 1: remove all liquidity
  const decHash = await walletClient.writeContract({
    account,
    address: nftAddr,
    abi: POSITION_MANAGER_ABI,
    functionName: 'decreaseLiquidity',
    args: [{
      tokenId:    BigInt(tokenId),
      liquidity:  BigInt(liquidityAmount),
      amount0Min: 0n,
      amount1Min: 0n,
      deadline,
    }],
    chain: CHAINS[chainId] || base,
  });
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: decHash });

  // Step 2: collect tokens + accrued fees
  const colHash = await walletClient.writeContract({
    account,
    address: nftAddr,
    abi: POSITION_MANAGER_ABI,
    functionName: 'collect',
    args: [{
      tokenId:    BigInt(tokenId),
      recipient,
      amount0Max: MaxUint128,
      amount1Max: MaxUint128,
    }],
    chain: CHAINS[chainId] || base,
  });
  const receipt = await getPublicClient(chainId).waitForTransactionReceipt({ hash: colHash });
  return { hash: colHash, receipt };
}

// ─── Pool price lookup ────────────────────────────────────────────────────────

export async function getPoolCurrentPrice(token0Addr, token1Addr, fee, chainId = 8453) {
  const client = getPublicClient(chainId);
  const factoryAddr = FACTORY_BY_CHAIN[chainId] || FACTORY_BY_CHAIN[1];

  // Sort tokens (Uniswap V3 requires token0 < token1)
  const [t0, t1] = token0Addr.toLowerCase() < token1Addr.toLowerCase()
    ? [token0Addr, token1Addr]
    : [token1Addr, token0Addr];
  const isFlipped = t0.toLowerCase() !== token0Addr.toLowerCase();

  const poolAddr = await client.readContract({
    address: factoryAddr, abi: FACTORY_ABI, functionName: 'getPool', args: [t0, t1, BigInt(fee)],
  });

  if (!poolAddr || poolAddr === '0x0000000000000000000000000000000000000000') {
    throw new Error('Pool não encontrada on-chain');
  }

  const slot0 = await client.readContract({ address: poolAddr, abi: POOL_SLOT0_ABI, functionName: 'slot0' });
  return { poolAddress: poolAddr, sqrtPriceX96: slot0[0], currentTick: Number(slot0[1]), isFlipped };
}

// ─── Add liquidity (Uniswap V3 mint) ─────────────────────────────────────────

export async function addLiquidityToPool({
  token0Addr, token1Addr, fee, amount0Desired, amount1Desired,
  rangePercent = 0.2, chainId = 8453,
}) {
  const walletClient = await getWalletClient(chainId);
  const [account] = await walletClient.getAddresses();
  const nftAddr = POSITION_MANAGER_BY_CHAIN[chainId] || POSITION_MANAGER_BY_CHAIN[1];

  // Sort tokens (Uniswap V3: token0 < token1 always)
  const t0lower = token0Addr.toLowerCase();
  const t1lower = token1Addr.toLowerCase();
  const isFlipped = t0lower > t1lower;
  const sorted0  = isFlipped ? token1Addr : token0Addr;
  const sorted1  = isFlipped ? token0Addr : token1Addr;
  const sortedA0 = isFlipped ? amount1Desired : amount0Desired;
  const sortedA1 = isFlipped ? amount0Desired : amount1Desired;

  // Get current tick and compute range
  const { currentTick } = await getPoolCurrentPrice(token0Addr, token1Addr, fee, chainId);
  const tickSpacing = TICK_SPACINGS[fee] || 60;
  const halfRange = Math.abs(priceToTick(1 + rangePercent) - priceToTick(1));
  // Clamp to Uniswap V3 valid tick range [-887272, 887272]
  const TICK_MIN = -887272;
  const TICK_MAX =  887272;
  const tickLower = Math.max(TICK_MIN, nearestUsableTick(currentTick - halfRange, tickSpacing));
  const tickUpper = Math.min(TICK_MAX, nearestUsableTick(currentTick + halfRange, tickSpacing));

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const hash = await walletClient.writeContract({
    account, address: nftAddr, abi: [...POSITION_MANAGER_ABI, ...MINT_ABI],
    functionName: 'mint',
    args: [{
      token0: sorted0, token1: sorted1,
      fee: BigInt(fee),
      tickLower, tickUpper,
      amount0Desired: sortedA0, amount1Desired: sortedA1,
      amount0Min: 0n, amount1Min: 0n,
      recipient: account, deadline,
    }],
    chain: CHAINS[chainId] || base,
  });

  const receipt = await getPublicClient(chainId).waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

// ─── Uniswap V3 position value (tick math) ───────────────────────────────────

/**
 * Calculates amount0 and amount1 held in a Uniswap V3 position using on-chain data.
 * Returns human-readable amounts (i.e. divided by 10^decimals).
 * Also returns `inRange` and `currentTick` for status display.
 */
export async function getPositionLiquidityAmounts(pos, chainId = 8453) {
  if (!pos || !pos.hasLiquidity || BigInt(pos.liquidity || '0') === 0n || !pos.token0 || !pos.token1) {
    return { amount0: 0, amount1: 0, inRange: false, currentTick: null };
  }

  try {
    const factoryAddr = FACTORY_BY_CHAIN[chainId] || FACTORY_BY_CHAIN[1];
    const fee         = Number(pos.fee || 3000);

    const poolAddr = await readWithFallback(
      c => c.readContract({ address: factoryAddr, abi: FACTORY_ABI, functionName: 'getPool', args: [pos.token0, pos.token1, BigInt(fee)] }),
      chainId
    );

    if (!poolAddr || poolAddr === '0x0000000000000000000000000000000000000000') {
      return { amount0: 0, amount1: 0, inRange: false, currentTick: null };
    }

    const slot0 = await readWithFallback(
      c => c.readContract({ address: poolAddr, abi: POOL_SLOT0_ABI, functionName: 'slot0' }),
      chainId
    );
    const sqrtPriceX96 = slot0[0]; // BigInt
    const currentTick  = Number(slot0[1]);
    const tickLower    = Number(pos.tickLower);
    const tickUpper    = Number(pos.tickUpper);
    const inRange      = currentTick >= tickLower && currentTick < tickUpper;

    // Convert to float for math (approximate but sufficient for display)
    const Q96     = 2 ** 96;
    const liq     = Number(pos.liquidity) || 0;
    const sqrtP   = Number(sqrtPriceX96) / Q96;
    const sqrtPLo = Math.sqrt(1.0001 ** tickLower);
    const sqrtPHi = Math.sqrt(1.0001 ** tickUpper);

    let rawAmount0 = 0;
    let rawAmount1 = 0;

    if (sqrtP <= sqrtPLo) {
      rawAmount0 = liq * (1 / sqrtPLo - 1 / sqrtPHi);
    } else if (sqrtP >= sqrtPHi) {
      rawAmount1 = liq * (sqrtPHi - sqrtPLo);
    } else {
      rawAmount0 = liq * (1 / sqrtP - 1 / sqrtPHi);
      rawAmount1 = liq * (sqrtP - sqrtPLo);
    }

    const amount0 = Math.max(0, rawAmount0) / 10 ** pos.decimals0;
    const amount1 = Math.max(0, rawAmount1) / 10 ** pos.decimals1;

    return { amount0, amount1, inRange, currentTick };
  } catch {
    return { amount0: 0, amount1: 0, inRange: false, currentTick: null };
  }
}

// ─── Harvest (transação real — habilitada em produção) ────────────────────────

export async function executeHarvest(tokenId, harvesterAddress, chainId = 8453) {
  if (!harvesterAddress) throw new Error('Endereço do contrato de harvest não configurado.');
  const walletClient = await getWalletClient(chainId);
  const [account]    = await walletClient.getAddresses();
  const hash = await walletClient.writeContract({
    account, address: harvesterAddress, abi: HARVESTER_ABI,
    functionName: 'harvestWithFee', args: [BigInt(tokenId)],
    chain: CHAINS[chainId] || base,
  });
  const receipt = await getPublicClient(chainId).waitForTransactionReceipt({ hash });
  return { hash, receipt };
}
