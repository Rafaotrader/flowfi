'use client';
import { useState } from 'react';
import PoolCard from './PoolCard';
import EnterPoolModal from './EnterPoolModal';
import { useWallet } from '../common/WalletProvider';

const BASE_CHAIN_ID = 8453;

export default function PoolRanking({ pools, onSimulate }) {
  const [enterPool, setEnterPool] = useState(null);
  const { chainId, isConnected, switchNetwork } = useWallet();

  async function handleEnterPool(pool) {
    const targetChain = Number(pool?.chainId || pool?.networkId || BASE_CHAIN_ID);
    if (isConnected && chainId && chainId !== targetChain) {
      switchNetwork(targetChain).catch(() => {});
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
