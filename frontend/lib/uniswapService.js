'use client';

/**
 * Uniswap V3 Service — NonfungiblePositionManager integration.
 * Prepared for real on-chain execution on all supported chains.
 *
 * Chains supported: Ethereum (1), Arbitrum (42161), Optimism (10),
 *                   Polygon (137), Base (8453)
 */

import {
  getPublicClient,
  getWalletClient,
  CHAINS,
  POSITION_MANAGER_BY_CHAIN,
  POSITION_MANAGER_ABI,
  checkERC20Allowance,
  approveERC20Token,
  addLiquidityToPool,
} from './web3';

// ─── Constants ────────────────────────────────────────────────────────────────

const NATIVE_ETH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const MAX_UINT128 = 2n ** 128n - 1n;
const MAX_UINT256 = 2n ** 256n - 1n;

// ─── ABIs (not in web3.js) ────────────────────────────────────────────────────

const DECREASE_LIQUIDITY_ABI = [{
  name: 'decreaseLiquidity', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'tokenId',    type: 'uint256' },
    { name: 'liquidity',  type: 'uint128' },
    { name: 'amount0Min', type: 'uint256' },
    { name: 'amount1Min', type: 'uint256' },
    { name: 'deadline',   type: 'uint256' },
  ]}],
  outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }],
}];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isNativeToken(addr) {
  return !addr || addr.toLowerCase() === NATIVE_ETH;
}

function deadline() {
  return BigInt(Math.floor(Date.now() / 1000) + 3600);
}

// ─── Approval ─────────────────────────────────────────────────────────────────

/**
 * Ensures token is approved for spender.
 * No-op for native ETH.
 * @returns {{ hash, receipt } | null} null when no approval is needed
 */
export async function ensureApproval({ tokenAddress, owner, spender, amount, chainId = 8453 }) {
  if (isNativeToken(tokenAddress)) return null;
  const allowance = await checkERC20Allowance(tokenAddress, owner, spender, chainId);
  if (allowance >= BigInt(amount)) return null;
  return approveERC20Token(tokenAddress, spender, MAX_UINT256, chainId);
}

// ─── Add Liquidity ────────────────────────────────────────────────────────────

/**
 * Mint a new Uniswap V3 liquidity position.
 * Calls NonfungiblePositionManager.mint() on-chain.
 *
 * @param {object} params
 * @param {string}  params.token0Address - token0 contract address
 * @param {string}  params.token1Address - token1 contract address
 * @param {number}  params.fee           - pool fee tier (500 | 3000 | 10000)
 * @param {bigint}  params.amount0       - desired token0 amount (wei)
 * @param {bigint}  params.amount1       - desired token1 amount (wei)
 * @param {number}  params.rangePercent  - price range ± (e.g. 0.20 = ±20%)
 * @param {number}  params.chainId
 * @returns {{ hash, receipt }}
 */
export async function addLiquidity({
  token0Address, token1Address, fee,
  amount0, amount1, rangePercent, chainId = 8453,
}) {
  return addLiquidityToPool({
    token0Addr:      token0Address,
    token1Addr:      token1Address,
    fee,
    amount0Desired:  amount0,
    amount1Desired:  amount1,
    rangePercent,
    chainId,
  });
}

// ─── Remove Liquidity ─────────────────────────────────────────────────────────

/**
 * Decrease (or fully close) a Uniswap V3 liquidity position.
 * Calls NonfungiblePositionManager.decreaseLiquidity() on-chain.
 *
 * @param {object} params
 * @param {string|number} params.tokenId   - NFT position token ID
 * @param {string|bigint} params.liquidity - liquidity units to remove
 * @param {number}        params.chainId
 * @returns {{ hash, receipt }}
 */
export async function removeLiquidity({ tokenId, liquidity, chainId = 8453 }) {
  const walletClient = await getWalletClient(chainId);
  const [account]    = await walletClient.getAddresses();
  const nftAddr      = POSITION_MANAGER_BY_CHAIN[chainId] || POSITION_MANAGER_BY_CHAIN[1];

  const hash = await walletClient.writeContract({
    account,
    address: nftAddr,
    abi: [...POSITION_MANAGER_ABI, ...DECREASE_LIQUIDITY_ABI],
    functionName: 'decreaseLiquidity',
    args: [{
      tokenId:    BigInt(tokenId),
      liquidity:  BigInt(liquidity),
      amount0Min: 0n,
      amount1Min: 0n,
      deadline:   deadline(),
    }],
    chain: CHAINS[chainId],
  });

  const receipt = await getPublicClient(chainId).waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

// ─── Collect Fees ─────────────────────────────────────────────────────────────

/**
 * Collect all accumulated fees from a Uniswap V3 position.
 * Calls NonfungiblePositionManager.collect() on-chain.
 *
 * @param {object} params
 * @param {string|number} params.tokenId   - NFT position token ID
 * @param {string}        params.recipient - address to receive fees (defaults to signer)
 * @param {number}        params.chainId
 * @returns {{ hash, receipt }}
 */
export async function collectFees({ tokenId, recipient, chainId = 8453 }) {
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
      recipient:  recipient || account,
      amount0Max: MAX_UINT128,
      amount1Max: MAX_UINT128,
    }],
    chain: CHAINS[chainId],
  });

  const receipt = await getPublicClient(chainId).waitForTransactionReceipt({ hash });
  return { hash, receipt };
}
