import React, { useState } from 'react';
import { AlertTriangle, BrainCircuit, Loader2, ShieldCheck } from 'lucide-react';
import { AccountTier, BrokerProfile, EnvironmentMode, RiskConfig, ScalpingSignal, TruthStats } from '../types/trading';

interface TruthAuditViewProps {
  broker: BrokerProfile;
  accountTier: AccountTier;
  accountCurrency: string;
  environmentMode: EnvironmentMode;
  activeSignal: ScalpingSignal;
  riskConfig: RiskConfig;
  truthStats: TruthStats;
}

const PRESET_AUDIT_PROMPTS = [
  'Audit my current broker contract specifications, spread-to-ATR ratio, and minimum StopsLevel risk for scalping.',
  'Why can MetaTrader 5 not guarantee genuine 2-second market execution, and how should M1 ultra-short strategies mitigate slippage?',
  'Evaluate my Truth Mode trade statistics for commission drag, drawdown exposure, and whether this configuration is safe for Demo validation.',
];

export const TruthAuditView: React.FC<TruthAuditViewProps> = ({
  broker,
  accountTier,
  accountCurrency,
  environmentMode,
  activeSignal,
  riskConfig,
  truthStats,
}) => {
  const [query, setQuery] = useState(PRESET_AUDIT_PROMPTS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ modelUsed?: string; thinkingLevel?: string } | null>(null);

  const runAudit = async (promptText: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: promptText,
          context: {
            broker: broker.name,
            accountType: accountTier,
            accountCurrency,
            verificationStatus: broker.verificationStatus,
            stopsLevelPts: broker.typicalStopsLevelPts,
            fillingMode: broker.defaultFillingMode,
            commissionPerLot: broker.rawSpreadCommissionPerLot,
            mode: environmentMode,
            instrument: activeSignal.brokerSymbol,
            riskPercent: riskConfig.riskPercent,
            metrics: {
              currentSpreadPts: activeSignal.currentSpreadPts,
              adaptiveMaxSpreadPts: activeSignal.adaptiveMaxSpreadPts,
              atrValue: activeSignal.atrValue,
              volatilityState: activeSignal.volatilityState,
              ...truthStats,
            },
            activeSignals: [
              {
                symbol: activeSignal.brokerSymbol,
                direction: activeSignal.direction,
                confluence: `${activeSignal.confluencePassed}/${activeSignal.confluenceTotal}`,
                explanation: activeSignal.technicalExplanation,
              },
            ],
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Audit request failed with HTTP ${res.status}`);
        return;
      }

      setAnalysis(data.analysis);
      setMeta({ modelUsed: data.modelUsed, thinkingLevel: data.thinkingLevel });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error calling quantitative audit endpoint.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mandatory Truth Mode Invariants */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <h2 className="text-base font-semibold text-slate-100">Truth Mode Invariants (Enforced)</h2>
          </div>
          <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
            <li>• Zero fabricated signals: Every BUY/SELL decision is derived from closed-bar EMA 9/21, RSI, ATR, MACD, ADX, S/R, and structure checks.</li>
            <li>• Zero hidden losses or masked order failures: Rejected orders, requotes, slippage, and losing trades are logged verbatim.</li>
            <li>• Broker compatibility is marked <span className="font-mono text-amber-400">Pending Demo Validation</span> until contract specifications are verified on an MT5 Demo terminal.</li>
            <li>• Accuracy is measured strictly from closed trade outcomes, never promised as 100% or guaranteed profit.</li>
          </ul>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-slate-100">MT5 Execution & Latency Reality</h2>
          </div>
          <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
            <li>• MetaTrader 5 cannot guarantee genuine 2-second market execution. Execution speed is governed by broker server routing, tick arrival intervals, and network RTT.</li>
            <li>• <span className="font-mono text-slate-100">SYMBOL_TRADE_STOPS_LEVEL</span> & <span className="font-mono text-slate-100">SYMBOL_TRADE_FREEZE_LEVEL</span> constrain how close SL/TP and trailing stops can sit to market price.</li>
            <li>• High-frequency M1 entries on Standard/Cent accounts with wider spreads suffer higher spread-to-ATR drag than Raw/ECN accounts.</li>
          </ul>
        </div>
      </div>

      {/* Gemini High-Thinking Quantitative Audit */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-semibold text-slate-100">
              Quantitative Execution & Risk Auditor (High-Thinking Reasoning)
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Context: {broker.name} · {accountTier} · {activeSignal.brokerSymbol}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESET_AUDIT_PROMPTS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setQuery(preset)}
              className="text-left px-3 py-1.5 text-xs bg-[#0B111E] hover:bg-slate-800 border border-slate-800 rounded-md text-slate-300 transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <textarea
            rows={3}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a quantitative execution, MQL5 contract spec, or risk management question..."
            className="w-full bg-[#0B111E] border border-slate-700 rounded-md p-3 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={loading || !query.trim()}
              onClick={() => runAudit(query)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-md transition-colors whitespace-nowrap"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
              {loading ? 'Analyzing Execution Parameters...' : 'Run High-Thinking Audit'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 rounded-md p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        {analysis && (
          <div className="bg-[#090E1A] border border-slate-800 rounded-md p-4 space-y-2">
            {meta && (
              <div className="text-[11px] font-mono text-slate-400 pb-2 border-b border-slate-800">
                Model: {meta.modelUsed} · ThinkingLevel: {meta.thinkingLevel}
              </div>
            )}
            <div className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
              {analysis}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
