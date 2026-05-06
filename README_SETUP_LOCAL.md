# UNI Fee Miner — Setup Local

## Pré-requisitos

- Node.js 18+
- npm 9+
- Windows, macOS ou Linux

---

## 1. Backend (porta 5000)

```bash
cd uni-fee-miner/backend
npm install
npm run dev
```

Saída esperada:
```
  UNI Fee Miner API rodando em http://localhost:5000
   Frontend esperado em : http://localhost:6000
   Banco de dados       : nao configurado (usando mocks)
   Rotas disponiveis    : GET / | GET /api/health | GET /api/pools/top | POST /api/harvest-preview
```

---

## 2. Frontend (porta 6000)

Abra um **segundo terminal**:

```bash
cd uni-fee-miner/frontend
npm install
npm run dev
```

Saída esperada:
```
  ▲ Next.js 14.x.x
  - Local: http://localhost:6000
```

---

## 3. URLs de acesso

| Serviço | URL |
|---|---|
| App (frontend) | http://localhost:6000 |
| API root | http://localhost:5000 |
| Health check | http://localhost:5000/api/health |
| Top 5 pools | http://localhost:5000/api/pools/top |

---

## 4. Testar rotas da API no browser (ou curl)

```bash
# Raiz
curl http://localhost:5000

# Health
curl http://localhost:5000/api/health

# Top 5 pools
curl http://localhost:5000/api/pools/top

# Harvest preview (POST)
curl -X POST http://localhost:5000/api/harvest-preview \
  -H "Content-Type: application/json" \
  -d '{"amount0Raw":150,"amount1Raw":0.04,"token0Symbol":"USDC","token1Symbol":"WETH","token0PriceUSD":1,"token1PriceUSD":3486}'
```

---

## 5. Fluxo de teste no browser

1. Abra **http://localhost:6000**
2. Veja o indicador de status (verde = API online)
3. Clique **"Encontrar melhores pools agora"** → top 5 pools aparecem
4. Clique **"💰 Preview saque"** (botão ao lado do título da lista) → aparece:
   - Lucro disponível
   - Gas estimado
   - Taxa UNI Fee Miner (5%)
   - Valor líquido que você recebe
5. [Opcional] Clique **"Simular Posição"** em qualquer pool → 3 cenários (pior / esperado / melhor)

---

## 6. Porta ocupada? (EADDRINUSE)

Execute o script de limpeza (Windows):
```cmd
kill-ports.bat
```

Ou manualmente:
```cmd
netstat -ano | findstr :5000
taskkill /PID <PID> /F

netstat -ano | findstr :6000
taskkill /PID <PID> /F
```

Veja mais detalhes em `RESET_LOCAL_PORTS_WINDOWS.md`.

---

## 7. Variáveis de ambiente

### Backend — `backend/.env` (opcional)
```env
PORT=5000
FRONTEND_URL=http://localhost:6000
DATABASE_URL=          # deixe vazio para usar mocks
```

### Frontend — `frontend/.env.local` (já configurado)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_RPC_URL=https://eth.llamarpc.com
NEXT_PUBLIC_HARVESTER_ADDRESS=0x0000000000000000000000000000000000000000
```

---

## 8. Se a API estiver offline

O frontend exibe automaticamente:
> ⚠ API offline — exibindo dados simulados.

Todos os botões continuam funcionando com dados mock. Nenhuma configuração adicional necessária.
