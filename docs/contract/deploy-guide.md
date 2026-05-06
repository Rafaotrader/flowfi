# Deploy Guide — PollYieldFlowHarvester

## Rede principal: Base (chainId 8453)

O PollYieldFlowHarvester é deployado na **Base Mainnet** como rede primária, aproveitando o gas reduzido (~$0.03 por harvest vs ~$9.45 na Ethereum).

- **RPC:** `https://mainnet.base.org`
- **Explorer:** `https://basescan.org`
- **NonfungiblePositionManager (Base):** `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`
- **Platform wallet:** `0xb7516B25F52Ea4Cf3711D6fa83F844756209c07d`
- **Taxa:** 5% fixo (PLATFORM_FEE_BPS = 500)

---

## Pré-requisitos

- Node.js >= 18
- Carteira com ETH na Base (para gas de deploy)
- API key do Basescan (para verificação)
- RPC URL da Base (público ou via Alchemy/Infura)

---

## Opção A — Hardhat (recomendado)

### 1. Instalar dependências

```bash
cd uni-fee-miner/contracts
npm install
```

Dependências em `package.json`:
```json
{
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "dotenv": "^16.0.0"
  },
  "dependencies": {
    "@openzeppelin/contracts": "^4.9.0",
    "@uniswap/v3-periphery": "^1.4.4"
  }
}
```

### 2. Configurar `contracts/.env`

```env
# NUNCA versione esta chave — adicione contracts/.env ao .gitignore
DEPLOYER_PRIVATE_KEY=0xSUA_CHAVE_PRIVADA_AQUI

# RPC da Base
BASE_RPC_URL=https://mainnet.base.org

# Basescan para verificação do contrato
BASESCAN_API_KEY=SUA_BASESCAN_KEY

# Carteira que receberá as taxas da plataforma (endereço público)
PLATFORM_WALLET=0xb7516B25F52Ea4Cf3711D6fa83F844756209c07d
```

### 3. Configurar `hardhat.config.js`

```js
require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

module.exports = {
  solidity: { version: '0.8.19', settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    base: {
      url: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      chainId: 8453,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: { base: process.env.BASESCAN_API_KEY },
    customChains: [{
      network: 'base',
      chainId: 8453,
      urls: {
        apiURL: 'https://api.basescan.org/api',
        browserURL: 'https://basescan.org',
      },
    }],
  },
};
```

### 4. Deploy na Base Mainnet

```bash
npx hardhat run contracts/deploy.js --network base
```

Output esperado:
```
  Poll Yield Flow — Deploy
  Rede      : base
  Deployer  : 0x...
  Balance   : 0.05 ETH

  NonfungiblePositionManager: 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
  Platform Wallet           : 0xb7516B25F52Ea4Cf3711D6fa83F844756209c07d
  Taxa da plataforma        : 5% (constante no contrato)

  ✓ PollYieldFlowHarvester deployado: 0xNOVO_ENDERECO
```

### 5. Verificar no Basescan

```bash
npx hardhat verify --network base 0xNOVO_ENDERECO \
  "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" \
  "0xb7516B25F52Ea4Cf3711D6fa83F844756209c07d"
```

### 6. Atualizar variáveis de ambiente

**Backend (`backend/.env`):**
```env
HARVESTER_CONTRACT_ADDRESS=0xNOVO_ENDERECO
PLATFORM_WALLET=0xb7516B25F52Ea4Cf3711D6fa83F844756209c07d
DEFAULT_CHAIN_ID=8453
```

**Frontend (`frontend/.env.local`):**
```env
NEXT_PUBLIC_HARVESTER_ADDRESS=0xNOVO_ENDERECO
NEXT_PUBLIC_DEFAULT_CHAIN_ID=8453
```

### 7. Reiniciar serviços

```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

---

## Opção B — Remix IDE (sem instalação local)

### 1. Abrir Remix

Acesse: [remix.ethereum.org](https://remix.ethereum.org)

### 2. Criar o arquivo

- Crie `PollYieldFlowHarvester.sol`
- Cole o conteúdo completo do arquivo `contracts/PollYieldFlowHarvester.sol`

### 3. Importar dependências via URL

```solidity
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.0/contracts/security/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.0/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.0/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.0/contracts/token/ERC20/utils/SafeERC20.sol";
```

### 4. Compilar

- Aba "Solidity Compiler"
- Versão: `0.8.19`
- Optimizer: ativado, 200 runs
- Clicar "Compile"

### 5. Deploy

- Aba "Deploy & Run Transactions"
- Environment: "Injected Provider - MetaMask"
- Conecte MetaMask e **selecione a rede Base**
- Preencher constructor (2 argumentos):
  - `_positionManager`: `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`
  - `_platformWallet`: `0xb7516B25F52Ea4Cf3711D6fa83F844756209c07d`
- Clicar "Deploy"

---

## Deploy em testnet (Sepolia — para testes)

O Position Manager da Sepolia é diferente:

```bash
npx hardhat run contracts/deploy.js --network sepolia
```

```bash
npx hardhat verify --network sepolia 0xNOVO_ENDERECO \
  "0x1238536071E1c677A632429e3655c799b22cDA52" \
  "0xSEU_ENDERECO_DE_TESTE"
```

> Atenção: após os testes em Sepolia, faça um deploy separado na Base Mainnet antes de ativar o produto.

---

## Checklist pós-deploy

- [ ] Contrato verificado no Basescan
- [ ] `HARVESTER_CONTRACT_ADDRESS` configurado no `backend/.env`
- [ ] `NEXT_PUBLIC_HARVESTER_ADDRESS` configurado no `frontend/.env.local`
- [ ] Botão "Executar Saque" habilitado no modal
- [ ] Carteira conectada à rede Base no MetaMask
- [ ] Teste de harvest com posição real (valor pequeno)
- [ ] Evento `HarvestExecuted` visível no Basescan
- [ ] `platformWallet` recebeu 5% corretamente

---

## Segurança — avisos críticos

- **NUNCA** coloque `DEPLOYER_PRIVATE_KEY` em código-fonte ou `.env` versionado
- Adicione `contracts/.env` ao `.gitignore`
- O `PLATFORM_WALLET` é público — é só um endereço de recebimento, não uma chave
- `BASESCAN_API_KEY` e `ETHERSCAN_API_KEY` são de baixo risco mas também devem ficar fora do repo
