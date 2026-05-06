'use client';
import { useState, useRef } from 'react';
import { harvestPreview, confirmHarvest } from '../../lib/api';
import { executeHarvest, readAccruedFees, checkNftApproval, approveHarvester } from '../../lib/web3';

const HARVESTER_ADDRESS = process.env.NEXT_PUBLIC_HARVESTER_ADDRESS;

export default function HarvestModal({ position, onClose, onSuccess }) {
  const [step, setStep] = useState('idle'); // idle | loading_fees | preview | approving | confirming | success | error
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const executingRef = useRef(false);

  async function loadPreview() {
    setStep('loading_fees');
    setError(null);
    try {
      // Lê fees acumulados diretamente da blockchain (fonte de verdade)
      const { amount0, amount1 } = await readAccruedFees(position.token_id);

      // Calcula split via backend canônico (/api/harvest/preview)
      const dec0 = position.decimals0 ?? 18;
      const dec1 = position.decimals1 ?? 18;
      const data = await harvestPreview({
        tokenId:      position.token_id,
        amount0:      Number(amount0) / 10 ** dec0,
        amount1:      Number(amount1) / 10 ** dec1,
        token0Symbol: position.token0_symbol,
        token1Symbol: position.token1_symbol,
      });

      setPreview({ ...data, amount0Raw: amount0, amount1Raw: amount1 });
      setStep('preview');
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }

  async function executeHarvestFlow() {
    if (executingRef.current) return;
    executingRef.current = true;
    setStep('confirming');
    setError(null);
    try {
      // Verifica se o contrato já tem aprovação para o NFT; solicita se não tiver
      const isApproved = await checkNftApproval(position.token_id, HARVESTER_ADDRESS);
      if (!isApproved) {
        setStep('approving');
        await approveHarvester(position.token_id, HARVESTER_ADDRESS);
        setStep('confirming');
      }

      const { hash } = await executeHarvest(position.token_id, HARVESTER_ADDRESS);
      setTxHash(hash);

      await confirmHarvest({
        positionId:   position.id,
        txHash:       hash,
        amount0Gross: preview.input.amount0,
        amount1Gross: preview.input.amount1,
        amount0User:  preview.split.userAmount0,
        amount1User:  preview.split.userAmount1,
        platformFee0: preview.split.platformFee0,
        platformFee1: preview.split.platformFee1,
        feesUSDTotal: 0,
        platformFeeUSD: 0,
        gasCostUSD:   preview.gasCost.estimatedUSD,
      });

      setStep('success');
      onSuccess?.();
    } catch (err) {
      setError(err.message);
      setStep('error');
    } finally {
      executingRef.current = false;
    }
  }

  const canExecute = Boolean(HARVESTER_ADDRESS);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h3 className="font-semibold text-lg">
            Preview do Saque via FlowFi — {position.token0_symbol}/{position.token1_symbol}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {step === 'idle' && (
            <>
              <p className="text-gray-400 text-sm">
                Os fees acumulados pela sua posição serão coletados. A plataforma cobra uma{' '}
                <strong className="text-white">taxa sobre os fees gerados</strong>,{' '}
                nunca sobre o capital investido.
              </p>
              <div className="bg-gray-800/50 rounded-xl p-4 text-sm text-gray-400 space-y-2">
                <div className="flex justify-between items-center">
                  <span>Fees até $500</span>
                  <span className="text-white font-medium">5%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Fees acima de $500</span>
                  <span className="text-white font-medium">10%</span>
                </div>
                <div className="border-t border-gray-700 pt-2 space-y-1">
                  <p>Capital investido: retorna 100% para você.</p>
                  <p>Ganhamos apenas quando você retira lucros.</p>
                  <p>Gas da rede é um custo separado (pago pela blockchain).</p>
                </div>
              </div>
              <button onClick={loadPreview} className="btn-primary w-full">
                Preview do Saque
              </button>
            </>
          )}

          {step === 'loading_fees' && (
            <div className="text-center py-8 text-gray-400 space-y-2">
              <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p>Lendo fees acumulados da blockchain...</p>
            </div>
          )}

          {step === 'approving' && (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-300 font-medium">Aprovação necessária</p>
              <p className="text-gray-500 text-sm">
                Confirme a aprovação na sua carteira para permitir que o contrato acesse o NFT desta posição.
              </p>
              <p className="text-xs text-gray-600">Esta aprovação é feita uma única vez por posição.</p>
            </div>
          )}

          {step === 'preview' && preview && (
            <>
              <div className="space-y-3">
                <Row
                  label="Fees disponíveis (bruto)"
                  value0={preview.input.amount0?.toFixed(6)}
                  value1={preview.input.amount1?.toFixed(6)}
                  sym0={preview.input.token0Symbol}
                  sym1={preview.input.token1Symbol}
                />
                <Row
                  label="Você recebe (líquido)"
                  value0={preview.split.userAmount0?.toFixed(6)}
                  value1={preview.split.userAmount1?.toFixed(6)}
                  sym0={preview.input.token0Symbol}
                  sym1={preview.input.token1Symbol}
                  accent
                />
                <Row
                  label={`Taxa plataforma (${preview.platformFeePercent ?? preview.platformFeePct}%)`}
                  value0={preview.split.platformFee0?.toFixed(6)}
                  value1={preview.split.platformFee1?.toFixed(6)}
                  sym0={preview.input.token0Symbol}
                  sym1={preview.input.token1Symbol}
                  muted
                />
              </div>

              <div className="bg-gray-800/50 rounded-xl p-3 text-sm text-gray-400 flex justify-between">
                <span>Gas estimado (rede)</span>
                <span className="text-white">${preview.gasCost.estimatedUSD?.toFixed(2)}</span>
              </div>

              <p className="text-xs text-gray-600">
                {preview.disclaimer || 'Taxa aplicada apenas sobre as fees, nunca sobre o capital.'}
              </p>

              <div className="flex gap-3">
                <button onClick={() => setStep('idle')} className="btn-outline flex-1">
                  Cancelar
                </button>
                {canExecute ? (
                  <button onClick={executeHarvestFlow} className="btn-primary flex-1">
                    Executar Saque
                  </button>
                ) : (
                  <button
                    disabled
                    title="Aguardando deploy do contrato em testnet"
                    className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed"
                  >
                    Executar Saque
                    <span className="block text-xs font-normal text-gray-600 mt-0.5">Aguardando deploy</span>
                  </button>
                )}
              </div>
            </>
          )}

          {step === 'confirming' && (
            <div className="text-center py-8 space-y-2">
              <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-400">Aguardando confirmação da transação...</p>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8 space-y-3">
              <div className="w-14 h-14 bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto text-2xl">✓</div>
              <p className="font-semibold text-emerald-400">Harvest realizado com sucesso!</p>
              {txHash && (
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 text-sm hover:underline"
                >
                  Ver no Basescan →
                </a>
              )}
              <button onClick={onClose} className="btn-primary w-full mt-4">Fechar</button>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-3">
              <div className="text-red-400 text-sm">{error}</div>
              <button onClick={() => setStep('idle')} className="btn-outline w-full">Tentar Novamente</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value0, value1, sym0, sym1, accent, muted }) {
  const textColor = accent ? 'text-emerald-400' : muted ? 'text-gray-500' : 'text-white';
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className={`text-sm font-medium ${textColor}`}>
        {value0} {sym0} / {value1} {sym1}
      </span>
    </div>
  );
}
