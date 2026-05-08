# Flowfy

**Liquidity made simple.**

Flowfy é uma interface DeFi para encontrar pools de liquidez, simular rendimento, criar posições, acompanhar taxas acumuladas e gerenciar liquidez em redes de baixo custo como Base.

---

## Features

- **Dashboard financeiro** — visão consolidada de posições, patrimônio e gas atual
- **Ranking de pools** — ranqueadas por volume, liquidez, consistência de fees e custo de gas
- **Swap integrado** — troca de tokens via 0x Protocol (sem roteamento próprio)
- **Simulador** — estime ganhos, impermanent loss e custo de gas antes de entrar
- **Minhas posições** — acompanhe cada posição NFT em tempo real
- **Sacar lucro** — colete fees acumuladas sem retirar liquidez
- **Finalizar posição** — retire liquidez e colete fees em uma transação
- **Foco em Base** — rede principal com gas ultra-baixo; suporte a Arbitrum, Optimism, Polygon e BNB

---

## Stack

| Camada    | Tecnologia                              |
|-----------|-----------------------------------------|
| Frontend  | Next.js 14, React 18, Tailwind CSS      |
| Web3      | Viem v2, MetaMask / EIP-1193 wallets    |
| Backend   | Node.js, Express (pool data & scoring)  |
| Contratos | Solidity, Hardhat, OpenZeppelin         |
| Redes     | Base (principal), Arbitrum, Optimism, Polygon, BNB |

---

## Como rodar localmente

### Pré-requisitos

- Node.js 18+
- MetaMask ou carteira compatível com EIP-1193

### Frontend

```bash
cd frontend
cp .env.example .env.local
# edite .env.local se necessário
npm install
npm run dev
# disponível em http://localhost:5173
```

### Backend (opcional — para dados de pools reais)

```bash
cd backend
cp .env.example .env
# adicione sua ZEROX_API_KEY e, se necessario, GRAPH_API_KEY no .env
npm install
npm run dev
# disponível em http://localhost:5001
```

---

## Variáveis de ambiente

Copie `frontend/.env.example` para `frontend/.env.local` e preencha:

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL do backend (vazio = sem backend) |
| `NEXT_PUBLIC_CHAIN_ID` | Chain ID padrão (8453 = Base) |
| `NEXT_PUBLIC_PLATFORM_WALLET` | Carteira que recebe a taxa da plataforma |
| `NEXT_PUBLIC_HARVESTER_ADDRESS` | Endereço do contrato FlowfyHarvester após deploy |

### Configuracao da cotacao 0x

O swap real depende da variavel `ZEROX_API_KEY` configurada no backend. Em desenvolvimento local, copie `backend/.env.example` para `backend/.env` e preencha `ZEROX_API_KEY` com sua chave da 0x. Em producao, configure a mesma variavel nas Environment Variables da Vercel para Production, Preview e Development.

Nunca versione uma chave real. Arquivos `.env`, `.env.local`, `backend/.env`, `backend/.env.local`, `frontend/.env`, `frontend/.env.local` e `.vercel` devem permanecer ignorados pelo Git.

---

## Deploy (Vercel)

1. Faça fork / push para GitHub
2. Importe o repositório no [Vercel](https://vercel.com)
3. Defina **Root Directory** como `frontend`
4. Adicione as variáveis de ambiente do `.env.example`
5. Clique em Deploy

O frontend funciona sem backend — pools serão mostradas via dados mock até que o backend seja configurado.

---

## Contrato

O `FlowfyHarvester.sol` gerencia coleta de fees via Uniswap V3 Position Manager.

- Taxa da plataforma: **5% sobre fees sacadas** (nunca sobre capital)
- Deploy na Base via Hardhat: `npx hardhat run scripts/deploy-base.js --network base`
- Após deploy, atualize `NEXT_PUBLIC_HARVESTER_ADDRESS` no frontend

---

## Aviso de risco

DeFi envolve risco de perda total de capital. APR histórico não garante retorno futuro. Perda impermanente pode reduzir o valor da posição. Opere com valores que está disposto a perder.
