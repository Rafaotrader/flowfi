const hre = require("hardhat");
const { ethers } = hre;

const POSITION_MANAGER = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const PLATFORM_WALLET  = process.env.PLATFORM_WALLET || "0xb7516B25F52Ea4Cf3711D6fa83F844756209c07d";

async function main() {
  // validações
  if (!process.env.BASE_RPC_URL)
    throw new Error("BASE_RPC_URL ausente no .env");

  const rawKey = process.env.DEPLOYER_PRIVATE_KEY || "";
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(rawKey))
    throw new Error("DEPLOYER_PRIVATE_KEY inválido no .env (64 hex chars esperados)");

  if (!ethers.isAddress(PLATFORM_WALLET))
    throw new Error(`PLATFORM_WALLET inválido: ${PLATFORM_WALLET}`);

  if (hre.network.name !== "base")
    throw new Error(`Use --network base (rede atual: ${hre.network.name})`);

  // signer
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Nenhum signer — DEPLOYER_PRIVATE_KEY inválido");

  const balanceWei = await ethers.provider.getBalance(deployer.address);
  const balance    = ethers.formatEther(balanceWei);

  console.log("\n========================================");
  console.log(" Poll Yield Flow — Deploy Base Mainnet");
  console.log("========================================");
  console.log(" Deployer      :", deployer.address);
  console.log(" Balance       :", balance, "ETH");
  console.log(" PlatformWallet:", PLATFORM_WALLET);
  console.log("----------------------------------------\n");

  if (parseFloat(balance) < 0.001)
    throw new Error(`Saldo insuficiente: ${balance} ETH — deposite ETH em ${deployer.address}`);

  // deploy
  console.log(" Deployando contrato...");
  const Factory  = await ethers.getContractFactory("PollYieldFlowHarvester");
  const contract = await Factory.deploy(POSITION_MANAGER, PLATFORM_WALLET);
  const receipt  = await contract.deploymentTransaction().wait(1);

  if (!receipt || receipt.status !== 1)
    throw new Error(`Deploy falhou — receipt.status=${receipt?.status}`);

  const address = await contract.getAddress();

  console.log("\n ✓ Contrato deployado com sucesso!");
  console.log("----------------------------------------");
  console.log(" Endereço :", address);
  console.log(" Tx       :", receipt.hash);
  console.log(" Bloco    :", receipt.blockNumber);
  console.log(" Basescan : https://basescan.org/address/" + address);
  console.log("----------------------------------------");
  console.log("\n Próximos passos:");
  console.log(` backend/.env   → HARVESTER_CONTRACT_ADDRESS=${address}`);
  console.log(` frontend/.env.local → NEXT_PUBLIC_HARVESTER_ADDRESS=${address}\n`);
}

main().catch((err) => {
  console.error("\n ERRO:", err.message, "\n");
  process.exitCode = 1;
});
