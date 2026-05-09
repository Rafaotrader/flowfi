import { formatUnits } from 'viem';
import { ERC20_FULL_ABI, getPublicClient } from './web3';

export const NATIVE_MAX_RESERVE = {
  ethereum: '0.003',
  base: '0.0001',
  arbitrum: '0.0001',
  optimism: '0.0001',
  bnb: '0.001',
  'solana-mainnet': '0.01',
};

function decimalToRaw(value, decimals) {
  const [whole = '0', fraction = ''] = String(value).split('.');
  return BigInt(`${whole}${fraction.slice(0, decimals).padEnd(decimals, '0')}` || '0');
}

export function isNativeToken(token) {
  return Boolean(token?.native);
}

export async function getNativeBalance(chain, address) {
  if (!chain?.chainId || !address) return null;
  const client = getPublicClient(chain.chainId);
  return client.getBalance({ address });
}

export async function getErc20Balance(chain, tokenAddress, address) {
  if (!chain?.chainId || !tokenAddress || !address) return null;
  const client = getPublicClient(chain.chainId);
  return client.readContract({
    address: tokenAddress,
    abi: ERC20_FULL_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
}

export function formatTokenBalance(raw, decimals = 18, precision = 6) {
  if (raw == null) return '-';
  const value = Number(formatUnits(raw, decimals));
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(Math.min(4, precision));
  return value.toFixed(precision);
}

export function rawToInput(raw, decimals = 18) {
  if (raw == null) return '';
  const value = formatUnits(raw, decimals);
  return value.replace(/\.?0+$/, '');
}

export function applyMaxReserve(balance, chain, token) {
  if (balance == null) return 0n;
  if (!isNativeToken(token)) return balance;
  const reserveRaw = decimalToRaw(NATIVE_MAX_RESERVE[chain?.id] || '0', token.decimals);
  return balance > reserveRaw ? balance - reserveRaw : 0n;
}

export function percentOfBalance(balance, percent, chain, token) {
  if (balance == null || balance <= 0n) return 0n;
  const spendable = percent === 100 ? applyMaxReserve(balance, chain, token) : balance;
  return spendable * BigInt(percent) / 100n;
}

export function hasEnoughBalance(amountRaw, balance) {
  if (!amountRaw || balance == null) return false;
  return BigInt(amountRaw) <= balance;
}
