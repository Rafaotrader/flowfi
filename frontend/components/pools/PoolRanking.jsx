'use client';
import { useState } from 'react';
import PoolCard from './PoolCard';
import EnterPoolModal from './EnterPoolModal';
import { useWallet } from '../common/WalletProvider';

const BASE_CHAIN_ID = 8453;

export default function PoolRanking({ pools, onSimulate }) {
  const [enterPool, setEnterPool] = useState(null);
  const [switchError, setSwitchError] = useState(null);
  const { chainId, isConnected, switchNetwork } = useWallet();

  async function handleEnterPool(pool) {
    const targetChain = Number(pool?.chainId || pool?.networkId || BASE_CHAIN_ID);
    setSwitchError(null);
    if (isConnected && chainId && chainId !== targetChain) {
      try {
        await switchNetwork(targetChain);
      } catch (err) {
        const msg = err?.code === 4001
          ? 'Troca de rede cancelada.'
          : 'Não foi possível trocar de rede. Troque manualmente no MetaMask.';
        setSwitchError(msg);
        return;
      }
    }
    setEnterPool(pool);
  }

  if (!pools?.length) {
    return (
      <div className="card text-center text-gray-500 py-12">
        Nenhum pool encontrado.
      </div>
    );
  }

  return (
    <>
      {switchError && (
        <div className="flex items-center justify-between gap-3 bg-red-950/60 border border-red-800/50 rounded-xl px-4 py-3 mb-4 text-sm text-red-300">
          <span>{switchError}</span>
          <button onClick={() => setSwitchError(null)} className="text-red-500 hover:text-red-300 shrink-0">✕</button>
        </div>
      )}
      <div className="space-y-4">
        {pools.map((pool, i) => (
          <PoolCard
            key={pool.id}
            pool={pool}
            rank={i + 1}
            onSimulate={onSimulate}
            onEnterPool={handleEnterPool}
          />
        ))}
      </div>

      {enterPool && (
        <EnterPoolModal pool={enterPool} onClose={() => setEnterPool(null)} />
      )}
    </>
  );
}
