export const SOLANA_TOKENS = [
  {
    symbol: 'SOL',
    name: 'Solana',
    mint: '11111111111111111111111111111111',
    decimals: 9,
    native: true,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    native: false,
  },
];

export function getSolanaToken(symbol) {
  return SOLANA_TOKENS.find(token => token.symbol === symbol);
}
