'use client';
import { useState } from 'react';
import PoolCard from './PoolCard';
import EnterPoolModal from './EnterPoolModal';

export default function PoolRanking({ pools, onSimulate }) {
  const [enterPool, setEnterPool] = useState(null);

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
            onEnterPool={setEnterPool}
          />
        ))}
      </div>

      {enterPool && (
        <EnterPoolModal pool={enterPool} onClose={() => setEnterPool(null)} />
      )}
    </>
  );
}
