const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ufm_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Verifica se o backend está online.
 * Retorna { online: bool, latencyMs: number }.
 */
export async function checkApiHealth() {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    return { online: data.status === 'ok', latencyMs: Date.now() - start, data };
  } catch {
    return { online: false, latencyMs: null, data: null };
  }
}

// ─── Pools ────────────────────────────────────────────────────────────────────

export const getPools = (limit = 20) =>
  request(`/api/pools?limit=${limit}`);

export const getTopPools = (chainId = 8453) =>
  request(`/api/pools/top?chainId=${chainId}`);

// Top 20 global — combina todas as redes
export const getGlobalPools = (chains) =>
  request(`/api/pools/global${chains ? `?chains=${chains.join(',')}` : ''}`);

export const getPoolCategories = () =>
  request('/api/pools/categories');

export const getPool = (id) =>
  request(`/api/pools/${id}`);

export const getGasPrice = () =>
  request('/api/pools/gas');

export const getTrendingPools = () =>
  request('/api/pools/trending');

export const getOpportunityOfDay = () =>
  request('/api/pools/opportunity');

// ─── Simulador ────────────────────────────────────────────────────────────────

export const simulate = (params) =>
  request('/api/simulate', { method: 'POST', body: JSON.stringify(params) });

// ─── Harvest ──────────────────────────────────────────────────────────────────

// Endpoint canônico: aceita tokenId + amounts lidos do chain
export const harvestPreview = (data) =>
  request('/api/harvest/preview', { method: 'POST', body: JSON.stringify(data) });

// Legado: aceita amounts diretamente (usado em page.js demo)
export const previewHarvest = (data) =>
  request('/api/harvest-preview', { method: 'POST', body: JSON.stringify(data) });

export const harvestExecute = (data) =>
  request('/api/harvest/execute', { method: 'POST', body: JSON.stringify(data) });

export const confirmHarvest = (data) =>
  request('/api/harvest/confirm', { method: 'POST', body: JSON.stringify(data) });

export const getHarvestHistory = () =>
  request('/api/harvest/history');

// ─── Posições ─────────────────────────────────────────────────────────────────

export const getPositions = () =>
  request('/api/positions');

export const getPositionStatus = (id) =>
  request(`/api/positions/${id}/status`);

export const registerPosition = (data) =>
  request('/api/positions', { method: 'POST', body: JSON.stringify(data) });

export const closePosition = (id) =>
  request(`/api/positions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) });

// ─── Alertas ──────────────────────────────────────────────────────────────────

export const getAlerts = (unreadOnly = false) =>
  request(`/api/alerts?unreadOnly=${unreadOnly}`);

export const markAlertsRead = (alertIds) =>
  request('/api/alerts/read', { method: 'PATCH', body: JSON.stringify({ alertIds }) });

// ─── Swap ─────────────────────────────────────────────────────────────────────

export const getSwapQuote = (params) => {
  const q = new URLSearchParams(params).toString();
  return request(`/api/swap/quote?${q}`);
};
