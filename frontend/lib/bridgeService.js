import { getBridgeChain, isSolanaRoute } from './chains';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export function normalizeBridgeAmount(value) {
  const cleaned = String(value || '').replace(',', '.').replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  const singleDot = firstDot === -1
    ? cleaned
    : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  const [wholeRaw = '', fraction = ''] = singleDot.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || (fraction ? '0' : '');
  return singleDot.includes('.') ? `${whole}.${fraction}` : whole;
}

export function parseBridgeAmountRaw(value, decimals) {
  const normalized = normalizeBridgeAmount(value);
  if (!normalized || normalized === '.') return { normalized, raw: null, error: 'Informe um valor válido.' };
  if (!/^\d+(\.\d*)?$/.test(normalized)) return { normalized, raw: null, error: 'Informe um valor válido.' };
  const [whole = '0', fraction = ''] = normalized.split('.');
  const padded = `${whole}${fraction.slice(0, decimals).padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, '');
  const raw = padded || '0';
  if (BigInt(raw) <= 0n) return { normalized, raw, error: 'Informe um valor maior que zero.' };
  return { normalized, raw, error: null };
}

export function getBridgeRouteStatus({ fromChainId, toChainId, solanaAddress }) {
  const fromChain = getBridgeChain(fromChainId);
  const toChain = getBridgeChain(toChainId);
  if (!fromChain || !toChain) return { ok: false, message: 'Rede não suportada para bridge.' };
  if (fromChain.id === toChain.id) return { ok: false, message: 'Escolha redes diferentes para fazer bridge.' };
  if (isSolanaRoute(fromChain.id, toChain.id) && !solanaAddress) {
    return { ok: false, message: 'Conecte uma carteira Solana, como Phantom, para usar esta rota.' };
  }
  if (isSolanaRoute(fromChain.id, toChain.id)) {
    return { ok: false, message: 'Bridge com Solana em preparação. Esta rota exige integração com provedor compatível.' };
  }
  return { ok: false, message: 'Bridge EVM em preparação. Integração com LI.FI/Socket/Across necessária.' };
}

export async function getBridgeQuote(params) {
  const res = await fetch(`${API_URL}/api/bridge/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Bridge quote HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}
