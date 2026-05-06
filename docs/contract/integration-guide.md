# Integration Guide — Frontend & Backend → Contrato

## Fluxo completo do saque

```
Usuário clica "Preview do Saque"
         ↓
Frontend lê fees on-chain via readAccruedFees(tokenId)
         ↓
Frontend POST /api/harvest/preview { tokenId, amount0, amount1 }
         ↓
Backend calcula split e retorna preview
         ↓
Modal exibe: fees brutos / taxa 5% / valor líquido / gas
         ↓
Usuário clica "Executar Saque"
         ↓
Frontend chama MetaMask (viem.writeContract)
         ↓
Contrato executa collect() → divide → transfere
         ↓
Frontend recebe txHash → exibe link Etherscan
         ↓
Frontend POST /api/harvest/confirm { txHash, amounts... }
         ↓
Backend registra harvest no banco
```

---

## Frontend → Contrato (viem)

### Arquivo principal: `frontend/lib/web3.js`

#### ABI do contrato

```js
export const HARVESTER_ABI = parseAbi([
  'function harvestWithFee(uint256 tokenId) external returns (uint256 userAmount0, uint256 userAmount1)',
  'function previewHarvest(uint256 amount0, uint256 amount1) external view returns (uint256 userAmount0, uint256 userAmount1, uint256 platformFee0, uint256 platformFee1)',
  'function platformFeeBps() external view returns (uint256)',
  'event HarvestExecuted(address indexed user, uint256 indexed tokenId, address token0, address token1, uint256 userAmount0, uint256 userAmount1, uint256 platformFee0, uint256 platformFee1)',
]);
```

#### Executar harvest

```js
// frontend/lib/web3.js — executeHarvest()
export async function executeHarvest(tokenId, harvesterAddress) {
  if (!harvesterAddress) throw new Error('Contrato não configurado');

  const walletClient = await getWalletClient();       // MetaMask via viem
  const [account] = await walletClient.getAddresses();

  // writeContract → assina e envia a transação
  const hash = await walletClient.writeContract({
    account,
    address: harvesterAddress,
    abi: HARVESTER_ABI,
    functionName: 'harvestWithFee',
    args: [BigInt(tokenId)],
  });

  const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
  return { hash, receipt };
}
```

#### Ler fees acumulados (simulação de collect)

```js
// frontend/lib/web3.js — readAccruedFees()
export async function readAccruedFees(tokenId, chainId = 1) {
  const client = getPublicClient(chainId);
  // Simula collect() para obter valor real (inclui fees não cristalizados)
  const simulation = await client.simulateContract({
    address: POSITION_MANAGER_BY_CHAIN[chainId],
    abi: POSITION_MANAGER_ABI,
    functionName: 'collect',
    args: [{ tokenId: BigInt(tokenId), recipient: '0x000...001', amount0Max: MAX, amount1Max: MAX }],
  });
  return { amount0: simulation.result[0], amount1: simulation.result[1] };
}
```

---

## Frontend → Backend

### Arquivo: `frontend/lib/api.js`

#### Preview de saque

```js
export const harvestPreview = (data) =>
  request('/api/harvest/preview', { method: 'POST', body: JSON.stringify(data) });

// Chamada:
const preview = await harvestPreview({
  tokenId:      '12345',
  amount0:      150.5,       // em tokens (não wei)
  amount1:      0.042,
  token0Symbol: 'USDC',
  token1Symbol: 'WETH',
});
```

Resposta:
```json
{
  "tokenId": "12345",
  "canHarvest": true,
  "input": { "amount0": 150.5, "amount1": 0.042, "token0Symbol": "USDC", "token1Symbol": "WETH" },
  "platformFeePct": 5,
  "platformFeePercent": 5,
  "split": {
    "userAmount0": 142.975,
    "userAmount1": 0.0399,
    "platformFee0": 7.525,
    "platformFee1": 0.0021
  },
  "gasCost": { "estimatedUSD": 9.45, "gasPriceGwei": 18, "gasUnits": 150000 },
  "contractAddress": "0x...",
  "disclaimer": "Taxa de 5% sobre fees gerados, nunca sobre o capital."
}
```

#### Confirmar harvest (após tx on-chain)

```js
export const confirmHarvest = (data) =>
  request('/api/harvest/confirm', { method: 'POST', body: JSON.stringify(data) });

// Chamada após receber txHash:
await confirmHarvest({
  positionId:   position.id,
  txHash:       hash,
  amount0Gross: preview.input.amount0,
  amount1Gross: preview.input.amount1,
  amount0User:  preview.split.userAmount0,
  amount1User:  preview.split.userAmount1,
  platformFee0: preview.split.platformFee0,
  platformFee1: preview.split.platformFee1,
  feesUSDTotal: 0,       // preencher com preço real em produção
  platformFeeUSD: 0,
  gasCostUSD:   preview.gasCost.estimatedUSD,
});
```

---

## Backend → Endpoints

### `POST /api/harvest/preview` (mock, sem auth)

Localização: `backend/server.js`

Aceita:
```json
{ "tokenId": "123", "amount0": 100, "amount1": 0.04, "token0Symbol": "USDC", "token1Symbol": "WETH" }
```

Usado pelo HarvestModal para exibir o split antes da execução.

---

### `POST /api/harvest/preview` (real, com auth + DB)

Localização: `backend/src/routes/harvest.js`

Ativo apenas quando `DATABASE_URL` está configurado. Aceita `positionId`, `amount0Raw`, `amount1Raw`, `token0PriceUSD`, `token1PriceUSD`. Verifica ownership da posição no banco antes de calcular.

---

### `POST /api/harvest/execute`

Localização: `backend/server.js`

Retorna `503` se `HARVESTER_CONTRACT_ADDRESS` não estiver configurado (contrato não deployado). Retorna `202` quando pronto. A execução real ocorre 100% no frontend via MetaMask.

---

### `POST /api/harvest/confirm`

Localização: `backend/src/routes/harvest.js`

Registra o harvest no banco após a transação on-chain ser confirmada. Requer auth JWT.

---

## Variáveis de ambiente necessárias

**Backend (`backend/.env`):**
```env
PLATFORM_FEE_BPS=500
PLATFORM_WALLET=0xSUA_WALLET_PUBLICA
HARVESTER_CONTRACT_ADDRESS=0xENDERECO_DO_CONTRATO_APOS_DEPLOY
```

**Frontend (`frontend/.env.local`):**
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_RPC_URL=https://eth.llamarpc.com
NEXT_PUBLIC_HARVESTER_ADDRESS=0xENDERECO_DO_CONTRATO_APOS_DEPLOY
```

---

## Pré-requisito on-chain (aprovação do NFT)

Antes de chamar `harvestWithFee`, o usuário precisa aprovar o contrato:

```js
// O usuário deve chamar UMA das opções abaixo:

// Opção 1 — Aprovar apenas o tokenId específico
await walletClient.writeContract({
  address: POSITION_MANAGER_ADDRESS,
  abi: POSITION_MANAGER_ABI,
  functionName: 'approve',
  args: [HARVESTER_ADDRESS, BigInt(tokenId)],
});

// Opção 2 — Aprovar todos os tokens da carteira
await walletClient.writeContract({
  address: POSITION_MANAGER_ADDRESS,
  abi: POSITION_MANAGER_ABI,
  functionName: 'setApprovalForAll',
  args: [HARVESTER_ADDRESS, true],
});
```

**Implementação futura:** adicionar verificação de aprovação no `loadPreview` do HarvestModal e solicitar ao usuário antes do harvest.
