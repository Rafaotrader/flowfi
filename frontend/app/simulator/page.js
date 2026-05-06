'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SimulatorForm from '../../components/simulator/SimulatorForm';
import { useWallet } from '../../components/common/WalletProvider';

function SimulatorContent() {
  const params = useSearchParams();
  const poolId  = params.get('poolId');
  const { address, connect } = useWallet();

  return (
    <div className="max-w-2xl mx-auto space-y-7 animate-fade-in">

      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-950/40 border border-violet-800/30 rounded-full text-xs text-violet-400 font-medium mb-3">
          <span className="text-base leading-none">📊</span>
          Simulação — sem custos, sem risco
        </div>
        <h1 className="text-3xl font-bold text-white">Simular posição</h1>
        <p className="text-slate-500 mt-1.5 text-sm leading-relaxed">
          Estime seus ganhos antes de entrar em um pool. Veja projeção de taxas, risco de impermanent loss e custo de gas.
        </p>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-3 bg-amber-950/20 border border-amber-900/25 rounded-xl px-4 py-3 text-xs text-amber-400/80">
        <span className="shrink-0 mt-0.5">⚠</span>
        <span>
          Esta simulação não garante retorno futuro. APR e fees são estimativas baseadas em dados históricos.
          Resultados reais podem variar conforme condições de mercado.
        </span>
      </div>

      {!address ? (
        <div className="card text-center space-y-5 py-10">
          <div className="w-16 h-16 rounded-2xl bg-violet-950/40 border border-violet-800/30 flex items-center justify-center mx-auto text-3xl">
            🔗
          </div>
          <div>
            <p className="text-white font-semibold">Conecte sua carteira para simular</p>
            <p className="text-slate-500 text-sm mt-1">É necessário para obter cotações precisas de fee tier e preço atual.</p>
          </div>
          <button onClick={connect} className="btn-primary">
            Conectar Carteira
          </button>
        </div>
      ) : (
        <SimulatorForm poolId={poolId} poolName={poolId ? `${poolId.slice(0, 8)}…` : null} />
      )}

    </div>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
        <div className="skeleton-shimmer h-8 w-48 rounded-xl" />
        <div className="skeleton-shimmer h-64 rounded-2xl" />
      </div>
    }>
      <SimulatorContent />
    </Suspense>
  );
}
