# UNI Fee Miner — Guia de Setup

## Arquivos alterados nesta sessão

| Arquivo | Alteração |
|---|---|
| `backend/server.js` | Porta 5000, mock data completo, rotas inline |
| `backend/.env.example` | PORT=5000, FRONTEND_URL=http://localhost:6000 |
| `backend/src/services/subgraph.js` | Volatilidade log-return, retry + fallback URL |
| `backend/src/services/scoreEngine.js` | 6 critérios, feeConsistency + feeAlignment |
| `backend/src/services/simulator.js` | 3 cenários (pior/esperado/melhor), concentração corrigida |
| `backend/src/services/rangeManager.js` | Tick snapping, histerese, urgência por dias |
| `backend/src/services/poolScanner.js` | Stale-while-revalidate, trending/opportunity/stable |
| `backend/src/services/gasOracle.js` | Gas oracle Etherscan + fallback |
| `backend/src/routes/harvest.js` | Guard zero-profit, gas > profit, tx_hash duplicado |
| `backend/src/db/schema.sql` | UNIQUE tx_hash, CHECK constraints, tabela simulations |
| `frontend/package.json` | `next dev -p 6000` |
| `frontend/.env.local` | NEXT_PUBLIC_API_URL=http://localhost:5000 |
| `frontend/lib/api.js` | URL padrão porta 5000, checkApiHealth(), novos endpoints |
| `frontend/app/page.js` | Status API, botões CTA, fallback mock completo |
| `frontend/components/pools/PoolCard.jsx` | Prop onSimulate, breakdown 6 critérios, barra feeConsistency |
| `frontend/components/pools/PoolRanking.jsx` | Repassa prop onSimulate |

---

## 1. Rodar o Backend (porta 5000)

```bash
cd uni-fee-miner/backend
npm install
npm run dev
```

O backend sobe em **http://localhost:5000** com dados mock prontos.  
Não é necessário banco de dados para testar — tudo funciona offline.

Para usar banco real, copie `.env.example` para `.env` e preencha `DATABASE_URL`.

---

## 2. Rodar o Frontend (porta 6000)

Abra um **segundo terminal**:

```bash
cd uni-fee-miner/frontend
npm install
npm run dev
```

O frontend sobe em **http://localhost:6000**.

---

## 3. URLs de acesso

| Serviço | URL |
|---|---|
| Frontend (app) | http://localhost:6000 |
| Backend (API) | http://localhost:5000 |
| Health check | http://localhost:5000/api/health |
| Top pools | http://localhost:5000/api/pools/top |
| Simulador | http://localhost:5000/api/simulate (POST) |
| Harvest preview | http://localhost:5000/api/harvest-preview (POST) |

---

## 4. Fluxo de teste completo

### Passo 1 — Verificar status da API
- Abra http://localhost:6000
- O indicador no topo mostra **Online** (verde) ou **Offline** (vermelho)
- Clique em **"Testar conexão"** para forçar re-verificação

### Passo 2 — Buscar pools
- Clique em **"Encontrar melhores pools agora"**
- A lista de pools ranqueados aparece com scores, APR, TVL e métricas
- Se a API estiver offline, dados mock aparecem com banner amarelo de aviso

### Passo 3 — Simular posição
- Clique em **"Simular Posição"** em qualquer pool
- O painel de simulação exibe:
  - 3 cenários: Pessimista / Esperado / Otimista
  - Fees estimadas, impermanent loss, probabilidade de ficar no range
  - Viabilidade (alerta se gas > receita esperada)

### Passo 4 — Preview do harvest
- Após simular, clique em **"Preview do Saque de Fees"**
- Exibe breakdown:
  - Fees brutas coletadas
  - Taxa da plataforma (3%)
  - Valor líquido que você recebe

### Passo 5 — Confirmar funcionamento
- Backend online: dados reais do Subgraph Uniswap V3
- Backend offline: dados mock com banner de aviso — UI 100% funcional

---

## 5. Variáveis de ambiente

### Backend (`backend/.env`)
```env
PORT=5000
FRONTEND_URL=http://localhost:6000
DATABASE_URL=postgresql://user:pass@localhost:5432/unifeeminer  # opcional
ETHERSCAN_API_KEY=sua_chave_aqui  # opcional, para gas oracle real
SUBGRAPH_API_KEY=sua_chave_aqui   # opcional, para subgraph autenticado
```

### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_RPC_URL=https://eth.llamarpc.com
NEXT_PUBLIC_HARVESTER_ADDRESS=0x0000000000000000000000000000000000000000
```

---

## Arquitetura resumida

```
┌─────────────────────┐         ┌──────────────────────────┐
│  Next.js Frontend   │ ──────► │  Express Backend          │
│  localhost:6000     │         │  localhost:5000           │
│                     │         │                           │
│  • Dashboard        │         │  • Mock data (sem DB)     │
│  • Pool Ranking     │         │  • Subgraph Uniswap V3    │
│  • Simulador        │         │  • Score Engine (6 crit.) │
│  • Harvest Preview  │         │  • Simulator (3 cenários) │
│  • Fallback mock    │         │  • Gas Oracle             │
└─────────────────────┘         └──────────────────────────┘
                                           │
                                ┌──────────┴──────────┐
                                │  PostgreSQL (opt.)   │
                                │  + Subgraph GraphQL  │
                                └─────────────────────┘
```
