import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  AccountTier,
  BrokerProfile,
  ClosedTradeRecord,
  EnvironmentMode,
  InstrumentSpec,
  OpenPosition,
  OperatingMode,
  RejectedOrderLog,
  RiskConfig,
  ScalpingSignal,
  TimeframeCode,
  TradingSessionName,
  TruthStats,
} from '../types/trading';
import { CandleBar } from '../types/trading';
import { EquityCurveChart, MiniPriceChart } from './MiniPriceChart';

interface ControlPanelViewProps {
  brokers: BrokerProfile[];
  selectedBrokerId: string;
  onSelectBroker: (id: string) => void;
  allBrokersMode: boolean;
  onToggleAllBrokers: (enabled: boolean) => void;
  accountTier: AccountTier;
  onChangeAccountTier: (tier: AccountTier) => void;
  accountCurrency: string;
  onChangeCurrency: (curr: string) => void;
  balance: number;
  equity: number;
  instruments: InstrumentSpec[];
  selectedInstrumentId: string;
  onSelectInstrument: (id: string) => void;
  allInstrumentsMode: boolean;
  onToggleAllInstruments: (enabled: boolean) => void;
  operatingMode: OperatingMode;
  onChangeOperatingMode: (mode: OperatingMode) => void;
  environmentMode: EnvironmentMode;
  onChangeEnvironmentMode: (mode: EnvironmentMode) => void;
  emergencyStopped: boolean;
  onEmergencyStop: () => void;
  onClearEmergencyStop: () => void;
  tradingSession: TradingSessionName;
  cycleDurationMs: number;
  brokerLatencyThresholdMs: number;
  activeSignal: ScalpingSignal;
  allSignals: ScalpingSignal[];
  candles: CandleBar[];
  openPositions: OpenPosition[];
  closedTrades: ClosedTradeRecord[];
  rejectedOrders: RejectedOrderLog[];
  truthStats: TruthStats;
  equityCurve: { bar: number; equity: number }[];
  riskConfig: RiskConfig;
  onUpdateRiskConfig: (next: RiskConfig) => void;
  onStepTick: () => void;
  onRunBacktestSandbox: () => void;
  onExecuteManualSignal: (sig: ScalpingSignal) => void;
  onClosePosition: (ticket: string) => void;
  onCloseAllProfits: () => void;
  onImportMt5Csv: (csvText: string) => void;
}

export const ControlPanelView: React.FC<ControlPanelViewProps> = ({
  brokers,
  selectedBrokerId,
  onSelectBroker,
  allBrokersMode,
  onToggleAllBrokers,
  accountTier,
  onChangeAccountTier,
  accountCurrency,
  onChangeCurrency,
  balance,
  equity,
  instruments,
  selectedInstrumentId,
  onSelectInstrument,
  allInstrumentsMode,
  onToggleAllInstruments,
  operatingMode,
  onChangeOperatingMode,
  environmentMode,
  onChangeEnvironmentMode,
  emergencyStopped,
  onEmergencyStop,
  onClearEmergencyStop,
  tradingSession,
  cycleDurationMs,
  brokerLatencyThresholdMs,
  activeSignal,
  allSignals,
  candles,
  openPositions,
  closedTrades,
  rejectedOrders,
  truthStats,
  equityCurve,
  riskConfig,
  onUpdateRiskConfig,
  onStepTick,
  onRunBacktestSandbox,
  onExecuteManualSignal,
  onClosePosition,
  onCloseAllProfits,
  onImportMt5Csv,
}) => {
  const [ledgerTab, setLedgerTab] = useState<'signals' | 'positions' | 'history' | 'rejected'>('signals');
  const [assetFilter, setAssetFilter] = useState<'ALL' | 'Forex' | 'Metals' | 'Indices' | 'Crypto'>('ALL');
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvDraft, setCsvDraft] = useState('');

  const selectedBroker = brokers.find((b) => b.id === selectedBrokerId) ?? brokers[0];
  const selectedInstrument = instruments.find((i) => i.id === selectedInstrumentId) ?? instruments[0];

  const dailyPnL = Number((equity - balance).toFixed(2));
  const currentDrawdownPct = balance > 0 ? Math.max(0, ((balance - equity) / balance) * 100) : truthStats.maxDrawdownPct;

  const robotStatusLabel = emergencyStopped
    ? 'EMERGENCY STOPPED'
    : environmentMode === 'LIVE' && selectedBroker.verificationStatus !== 'Demo Validated'
      ? 'LIVE LOCKED (DEMO VALIDATION REQUIRED)'
      : operatingMode === 'AUTO'
        ? `AUTO SCANNING (${environmentMode})`
        : `MANUAL SIGNAL MONITOR (${environmentMode})`;

  const filteredSignals = useMemo(() => {
    if (assetFilter === 'ALL') return allSignals;
    return allSignals.filter((s) => s.assetClass === assetFilter);
  }, [allSignals, assetFilter]);

  const timeframes: TimeframeCode[] = ['M1', 'M5', 'M15', 'M30', 'H1'];

  const isLatencyExceeded = cycleDurationMs > brokerLatencyThresholdMs;

  return (
    <div className="space-y-6">
      {/* Truth Mode Environment Notice */}
      <div
        className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-4 py-3 rounded-lg border transition-colors ${
          isLatencyExceeded
            ? 'bg-amber-950/20 border-amber-500/60'
            : 'bg-[#111827] border-slate-800'
        }`}
      >
        <div className="flex items-start gap-3">
          {isLatencyExceeded ? (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          ) : selectedBroker.verificationStatus === 'Demo Validated' ? (
            <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-medium text-slate-100">
              <span>
                Truth Mode Active · Environment:{' '}
                {environmentMode === 'BACKTEST'
                  ? 'Backtest Sandbox'
                  : environmentMode === 'DEMO'
                    ? 'Demo Validation'
                    : 'Live Execution Gate'}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span
                className={`font-mono tabular-nums text-xs ${
                  isLatencyExceeded ? 'text-amber-300 font-semibold' : 'text-emerald-400'
                }`}
              >
                {isLatencyExceeded
                  ? `LATENCY WARNING: ${cycleDurationMs.toFixed(1)} ms > ${brokerLatencyThresholdMs} ms threshold`
                  : `Cycle: ${cycleDurationMs.toFixed(1)} ms / ${brokerLatencyThresholdMs} ms threshold`}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Browser telemetry runs deterministic MQL5-parity logic for verification. Real broker order routing executes inside MetaTrader 5 via{' '}
              <span className="font-mono text-slate-300">UniversalScalperEA.mq5</span>. Accuracy is measured from actual trades, never promised.
            </p>
            {isLatencyExceeded && (
              <div
                role="alert"
                className="mt-2 flex items-start gap-2 text-xs text-amber-200 bg-amber-950/40 border border-amber-500/40 rounded px-2.5 py-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Simulated market cycle execution ({cycleDurationMs.toFixed(1)} ms) exceeded the typical {selectedBroker.name} {accountTier} latency threshold ({brokerLatencyThresholdMs} ms). Expect elevated slippage risk on M1/M5 entries.
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onStepTick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Step Market Cycle
          </button>
          <button
            type="button"
            onClick={onRunBacktestSandbox}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            Run Backtest Sandbox
          </button>
        </div>
      </div>

      {/* Mode & Safety Controls Toolbar */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 bg-[#111827] border border-slate-800 rounded-lg p-4">
        <div className="xl:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Broker Selection</label>
            <div className="flex items-center gap-2">
              <select
                value={allBrokersMode ? 'ALL' : selectedBrokerId}
                onChange={(e) => {
                  if (e.target.value === 'ALL') {
                    onToggleAllBrokers(true);
                  } else {
                    onToggleAllBrokers(false);
                    onSelectBroker(e.target.value);
                  }
                }}
                className="w-full bg-[#0B111E] border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="ALL">ALL BROKERS ({brokers.length})</option>
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.verificationStatus === 'Demo Validated' ? 'Verified' : 'Unverified'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Instrument Universe</label>
            <select
              value={allInstrumentsMode ? 'ALL' : selectedInstrumentId}
              onChange={(e) => {
                if (e.target.value === 'ALL') {
                  onToggleAllInstruments(true);
                } else {
                  onToggleAllInstruments(false);
                  onSelectInstrument(e.target.value);
                }
              }}
              className="w-full bg-[#0B111E] border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">ALL INSTRUMENTS ({instruments.length})</option>
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.canonicalSymbol} · {inst.assetClass}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Account Type</label>
            <select
              value={accountTier}
              onChange={(e) => onChangeAccountTier(e.target.value as AccountTier)}
              className="w-full bg-[#0B111E] border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              {selectedBroker.supportedTiers.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Account Currency</label>
            <select
              value={accountCurrency}
              onChange={(e) => onChangeCurrency(e.target.value)}
              className="w-full bg-[#0B111E] border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              {selectedBroker.supportedCurrencies.map((c) => (
                <option key={c} value={c}>
                  {c} {c === 'USC' ? '(Cent)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Operating & Environment Mode Toggles + Emergency Stop */}
        <div className="xl:col-span-7 flex flex-col justify-between gap-3 xl:border-l xl:border-slate-800 xl:pl-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="block text-xs text-slate-400 mb-1">Execution Mode</span>
              <div className="inline-flex p-0.5 bg-[#0B111E] border border-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => onChangeOperatingMode('AUTO')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    operatingMode === 'AUTO'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  AUTO MODE
                </button>
                <button
                  type="button"
                  onClick={() => onChangeOperatingMode('MANUAL')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    operatingMode === 'MANUAL'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  MANUAL MODE
                </button>
              </div>
            </div>

            <div>
              <span className="block text-xs text-slate-400 mb-1">Account Environment</span>
              <div className="inline-flex p-0.5 bg-[#0B111E] border border-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => onChangeEnvironmentMode('BACKTEST')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    environmentMode === 'BACKTEST'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  BACKTEST
                </button>
                <button
                  type="button"
                  onClick={() => onChangeEnvironmentMode('DEMO')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    environmentMode === 'DEMO'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  DEMO MODE
                </button>
                <button
                  type="button"
                  onClick={() => onChangeEnvironmentMode('LIVE')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    environmentMode === 'LIVE'
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  LIVE MODE
                </button>
              </div>
            </div>

            <div className="flex items-end">
              {emergencyStopped ? (
                <button
                  type="button"
                  onClick={onClearEmergencyStop}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  Reset Emergency Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onEmergencyStop}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-red-700 hover:bg-red-600 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  STOP ALL TRADING
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs">
            <div className="text-slate-400">
              Robot Status:{' '}
              <span
                className={`font-semibold ${
                  emergencyStopped
                    ? 'text-red-400'
                    : environmentMode === 'LIVE' && selectedBroker.verificationStatus !== 'Demo Validated'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }`}
              >
                {robotStatusLabel}
              </span>
            </div>
            <div className="text-slate-400">
              Session: <span className="text-slate-200 font-medium">{tradingSession}</span>
              <span aria-hidden="true" className="mx-2">·</span>
              Active Scope:{' '}
              <span className="text-slate-200 font-mono">
                {allBrokersMode ? 'All Brokers' : selectedBroker.name} / {allInstrumentsMode ? 'All Instruments' : activeSignal.brokerSymbol}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Control Panel Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-slate-800 border border-slate-800 rounded-lg overflow-hidden">
        <div className="bg-[#111827] p-3.5">
          <div className="text-xs text-slate-400">Broker & Tier</div>
          <div className="text-sm font-semibold text-slate-100 mt-1 truncate">{selectedBroker.name}</div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">
            {accountTier} · {selectedBroker.defaultFillingMode}
          </div>
        </div>

        <div className="bg-[#111827] p-3.5">
          <div className="text-xs text-slate-400">Balance / Equity</div>
          <div className="text-sm font-semibold font-mono tabular-nums text-slate-100 mt-1">
            {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accountCurrency}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-300 mt-0.5">
            Eq: {equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-[#111827] p-3.5">
          <div className="text-xs text-slate-400">Selected Instrument</div>
          <div className="text-sm font-semibold font-mono text-slate-100 mt-1 truncate">
            {activeSignal.brokerSymbol}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-400 mt-0.5">
            Spread: {activeSignal.currentSpreadPts} / {activeSignal.adaptiveMaxSpreadPts} pts
          </div>
        </div>

        <div className="bg-[#111827] p-3.5">
          <div className="text-xs text-slate-400">Daily P/L & Open Pos</div>
          <div
            className={`text-sm font-semibold font-mono tabular-nums mt-1 ${
              dailyPnL >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {dailyPnL >= 0 ? '+' : ''}
            {dailyPnL.toFixed(2)} {accountCurrency}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-400 mt-0.5">
            Open Positions: {openPositions.length}
          </div>
        </div>

        <div className="bg-[#111827] p-3.5">
          <div className="text-xs text-slate-400">Actual Win Rate</div>
          <div className="text-sm font-semibold font-mono tabular-nums text-slate-100 mt-1">
            {truthStats.totalTrades > 0 ? `${truthStats.actualWinRatePct.toFixed(1)}%` : '0.0% (No Trades)'}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-400 mt-0.5">
            W:{truthStats.winningTrades} · L:{truthStats.losingTrades} · Rej:{truthStats.rejectedOrders}
          </div>
        </div>

        <div className="bg-[#111827] p-3.5">
          <div className="text-xs text-slate-400">Max Drawdown & Fees</div>
          <div
            className={`text-sm font-semibold font-mono tabular-nums mt-1 ${
              Math.max(currentDrawdownPct, truthStats.maxDrawdownPct) > riskConfig.maxDrawdownPct * 0.7
                ? 'text-amber-400'
                : 'text-slate-100'
            }`}
          >
            {Math.max(currentDrawdownPct, truthStats.maxDrawdownPct).toFixed(2)}% DD
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-400 mt-0.5">
            Fees: ${truthStats.totalFees.toFixed(2)} · Slip: {truthStats.avgSlippagePts.toFixed(1)}p
          </div>
        </div>
      </div>

      {/* Main Analysis Grid: Price Chart + Multi-Timeframe Matrix & Risk Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Columns: Chart + M1-H1 Technical Matrix + Signal Explanation */}
        <div className="lg:col-span-8 bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                {activeSignal.canonicalSymbol} Intelligent Scalping Engine
              </h2>
              <p className="text-xs text-slate-400">
                Broker Symbol: <span className="font-mono text-slate-200">{activeSignal.brokerSymbol}</span>
                <span className="mx-2" aria-hidden="true">·</span>
                Structure: <span className="text-slate-200">{activeSignal.marketStructure}</span>
                <span className="mx-2" aria-hidden="true">·</span>
                Liquidity: <span className="text-slate-200">{activeSignal.liquiditySweep}</span>
                <span className="mx-2" aria-hidden="true">·</span>
                Volatility: <span className="text-slate-200">{activeSignal.volatilityState}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold font-mono rounded border ${
                  activeSignal.direction === 'BUY'
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                    : activeSignal.direction === 'SELL'
                      ? 'bg-red-950/70 text-red-300 border-red-800'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700'
                }`}
              >
                {activeSignal.direction === 'BUY' && <ArrowUpRight className="w-3.5 h-3.5" />}
                {activeSignal.direction === 'SELL' && <ArrowDownRight className="w-3.5 h-3.5" />}
                {activeSignal.direction} ({activeSignal.confluencePassed}/{activeSignal.confluenceTotal})
              </span>

              {activeSignal.direction !== 'WAIT' && !emergencyStopped && (
                <button
                  type="button"
                  onClick={() => onExecuteManualSignal(activeSignal)}
                  className="px-3 py-1 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded transition-colors whitespace-nowrap shrink-0"
                >
                  Execute {activeSignal.direction} ({activeSignal.lotSizePreview} lots)
                </button>
              )}
            </div>
          </div>

          <MiniPriceChart
            candles={candles}
            support={activeSignal.supportLevel}
            resistance={activeSignal.resistanceLevel}
            digits={selectedInstrument.digits}
            symbol={activeSignal.brokerSymbol}
          />

          {/* Truth Mode Signal Technical Explanation */}
          <div className="bg-[#0B111E] border border-slate-800 rounded-md p-3">
            <div className="text-xs font-medium text-slate-400 mb-1">
              Technical Signal Explanation (Mandatory Truth Audit)
            </div>
            <p className="text-xs font-mono text-slate-200 leading-relaxed">
              {activeSignal.technicalExplanation}
            </p>
            {activeSignal.blockedReason && (
              <p className="text-xs font-mono text-amber-400 mt-1.5">
                Execution Guard Blocked: {activeSignal.blockedReason}
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-2.5 border-t border-slate-800/80 text-xs font-mono tabular-nums">
              <div>
                <span className="text-slate-400">Entry: </span>
                <span className="text-slate-100">{activeSignal.entryPrice.toFixed(selectedInstrument.digits)}</span>
              </div>
              <div>
                <span className="text-slate-400">Stop Loss: </span>
                <span className="text-red-400">{activeSignal.stopLoss.toFixed(selectedInstrument.digits)}</span>
              </div>
              <div>
                <span className="text-slate-400">Take Profit: </span>
                <span className="text-emerald-400">{activeSignal.takeProfit.toFixed(selectedInstrument.digits)}</span>
              </div>
              <div>
                <span className="text-slate-400">Adapted Lot: </span>
                <span className="text-sky-400">{activeSignal.lotSizePreview.toFixed(2)} lots</span>
              </div>
            </div>
          </div>

          {/* Multi-Timeframe Matrix Table (M1 - H1) */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Timeframe</th>
                  <th className="py-2 px-2 font-medium text-right">EMA 9</th>
                  <th className="py-2 px-2 font-medium text-right">EMA 21</th>
                  <th className="py-2 px-2 font-medium text-right">RSI (14)</th>
                  <th className="py-2 px-2 font-medium text-right">MACD Hist</th>
                  <th className="py-2 px-2 font-medium text-right">ADX (14)</th>
                  <th className="py-2 px-2 font-medium text-right">ATR (14)</th>
                  <th className="py-2 pl-2 font-medium text-right">Bias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                {timeframes.map((tf) => {
                  const snap = activeSignal.timeframeSnapshots[tf];
                  const hist = snap.macdMain - snap.macdSignal;
                  return (
                    <tr key={tf} className="hover:bg-slate-800/30">
                      <td className="py-2 pr-3 font-semibold text-slate-200">
                        {tf} {tf === 'M1' && !riskConfig.allowUltraShortM1 ? '(Monitor)' : ''}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-300">
                        {snap.ema9.toFixed(selectedInstrument.digits)}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-300">
                        {snap.ema21.toFixed(selectedInstrument.digits)}
                      </td>
                      <td
                        className={`py-2 px-2 text-right ${
                          snap.rsi14 > 70 ? 'text-amber-400' : snap.rsi14 < 30 ? 'text-amber-400' : 'text-slate-200'
                        }`}
                      >
                        {snap.rsi14.toFixed(1)}
                      </td>
                      <td className={`py-2 px-2 text-right ${hist >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {hist >= 0 ? '+' : ''}
                        {hist.toFixed(selectedInstrument.digits)}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-200">{snap.adx14.toFixed(1)}</td>
                      <td className="py-2 px-2 text-right text-slate-300">
                        {snap.atr14.toFixed(selectedInstrument.digits)}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <span
                          className={
                            snap.trendBias === 1
                              ? 'text-emerald-400 font-semibold'
                              : snap.trendBias === -1
                                ? 'text-red-400 font-semibold'
                                : 'text-slate-400'
                          }
                        >
                          {snap.trendBias === 1 ? 'BULLISH' : snap.trendBias === -1 ? 'BEARISH' : 'NEUTRAL'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 4 Columns: Universal Risk Management & Equity Curve */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Universal Risk Management</h3>
              <span className="text-xs font-mono text-slate-400">Default 0.5%</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Risk / Trade (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.05"
                  max="5"
                  disabled={riskConfig.useFixedLot}
                  value={riskConfig.riskPercent}
                  onChange={(e) =>
                    onUpdateRiskConfig({
                      ...riskConfig,
                      riskPercent: Math.max(0.05, Math.min(5, Number(e.target.value) || 0.5)),
                    })
                  }
                  className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono tabular-nums text-slate-100 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Fixed Lot Override</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={riskConfig.useFixedLot}
                    onChange={(e) => onUpdateRiskConfig({ ...riskConfig, useFixedLot: e.target.checked })}
                    className="rounded border-slate-700 bg-[#0B111E]"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    disabled={!riskConfig.useFixedLot}
                    value={riskConfig.fixedLotSize}
                    onChange={(e) =>
                      onUpdateRiskConfig({
                        ...riskConfig,
                        fixedLotSize: Math.max(0.01, Number(e.target.value) || 0.01),
                      })
                    }
                    className="w-full bg-[#0B111E] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-slate-100 disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Max Daily Loss (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="20"
                  value={riskConfig.maxDailyLossPct}
                  onChange={(e) =>
                    onUpdateRiskConfig({
                      ...riskConfig,
                      maxDailyLossPct: Math.max(0.5, Number(e.target.value) || 2.0),
                    })
                  }
                  className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono tabular-nums text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Max Daily Trades</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={riskConfig.maxDailyTrades}
                  onChange={(e) =>
                    onUpdateRiskConfig({
                      ...riskConfig,
                      maxDailyTrades: Math.max(1, Math.round(Number(e.target.value) || 15)),
                    })
                  }
                  className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono tabular-nums text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Max Drawdown (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="30"
                  value={riskConfig.maxDrawdownPct}
                  onChange={(e) =>
                    onUpdateRiskConfig({
                      ...riskConfig,
                      maxDrawdownPct: Math.max(1, Number(e.target.value) || 5.0),
                    })
                  }
                  className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono tabular-nums text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Base Spread Cap (pts)</label>
                <input
                  type="number"
                  step="2"
                  min="5"
                  max="100"
                  value={riskConfig.baseMaxSpreadPts}
                  onChange={(e) =>
                    onUpdateRiskConfig({
                      ...riskConfig,
                      baseMaxSpreadPts: Math.max(5, Number(e.target.value) || 22),
                    })
                  }
                  className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono tabular-nums text-slate-100"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-slate-400 mb-1">
                  Latency Alert Threshold (ms, 0 = Auto {brokerLatencyThresholdMs}ms)
                </label>
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="1000"
                  value={riskConfig.latencyThresholdMs}
                  onChange={(e) =>
                    onUpdateRiskConfig({
                      ...riskConfig,
                      latencyThresholdMs: Math.max(0, Math.round(Number(e.target.value) || 0)),
                    })
                  }
                  className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono tabular-nums text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-400 mb-1">
                  Auto-Close Profit Target (% of Balance)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={riskConfig.autoCloseProfitsEnabled}
                    onChange={(e) =>
                      onUpdateRiskConfig({
                        ...riskConfig,
                        autoCloseProfitsEnabled: e.target.checked,
                      })
                    }
                    className="rounded border-slate-700 bg-[#0B111E]"
                  />
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="25"
                    disabled={!riskConfig.autoCloseProfitsEnabled}
                    value={riskConfig.autoCloseProfitTargetPct}
                    onChange={(e) =>
                      onUpdateRiskConfig({
                        ...riskConfig,
                        autoCloseProfitTargetPct: Math.max(0.1, Number(e.target.value) || 0.5),
                      })
                    }
                    className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono tabular-nums text-slate-100 disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-slate-300">Auto-Close Profits (Target & TP)</span>
                <input
                  type="checkbox"
                  checked={riskConfig.autoCloseProfitsEnabled}
                  onChange={(e) =>
                    onUpdateRiskConfig({ ...riskConfig, autoCloseProfitsEnabled: e.target.checked })
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-slate-300">News-Event Protection (±{riskConfig.newsBufferMinutes}m)</span>
                <input
                  type="checkbox"
                  checked={riskConfig.newsProtectionEnabled}
                  onChange={(e) =>
                    onUpdateRiskConfig({ ...riskConfig, newsProtectionEnabled: e.target.checked })
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-slate-300">Enable M1 Ultra-Short Strategy</span>
                <input
                  type="checkbox"
                  checked={riskConfig.allowUltraShortM1}
                  onChange={(e) =>
                    onUpdateRiskConfig({ ...riskConfig, allowUltraShortM1: e.target.checked })
                  }
                />
              </label>

              {riskConfig.allowUltraShortM1 && (
                <p className="text-[11px] text-amber-400 leading-snug">
                  MT5 Disclosure: Ultra-short M1 logic uses bar/tick triggers. MT5 cannot guarantee genuine 2-second market execution due to broker server & network round-trip latency.
                </p>
              )}
            </div>
          </div>

          {/* Truth Mode Performance & Equity */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Verified Performance Metrics</h3>
              <button
                type="button"
                onClick={() => setCsvModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                Import MT5 CSV
              </button>
            </div>

            <EquityCurveChart points={equityCurve} currency={accountCurrency} />

            <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums pt-1">
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-slate-400">Total Trades</span>
                <span className="text-slate-100">{truthStats.totalTrades}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-slate-400">Profit Factor</span>
                <span className="text-slate-100">{truthStats.profitFactor.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-slate-400">Net P/L</span>
                <span className={truthStats.netPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {truthStats.netPnL >= 0 ? '+' : ''}
                  {truthStats.netPnL.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/70">
                <span className="text-slate-400">Avg Spread</span>
                <span className="text-slate-100">{truthStats.avgSpreadPts.toFixed(1)} pts</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Ledger: Multi-Pair Signals, Open Positions, Closed Trades, Rejected Orders */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-1 p-1 bg-[#0B111E] border border-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setLedgerTab('signals')}
              className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
                ledgerTab === 'signals' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Multi-Pair Scanner ({allSignals.length})
            </button>
            <button
              type="button"
              onClick={() => setLedgerTab('positions')}
              className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
                ledgerTab === 'positions' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Open Positions ({openPositions.length})
            </button>
            <button
              type="button"
              onClick={() => setLedgerTab('history')}
              className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
                ledgerTab === 'history' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Closed Trades ({closedTrades.length})
            </button>
            <button
              type="button"
              onClick={() => setLedgerTab('rejected')}
              className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
                ledgerTab === 'rejected' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rejected / Blocked ({rejectedOrders.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {openPositions.some((p) => p.unrealizedPnL > 0) && (
              <button
                type="button"
                onClick={onCloseAllProfits}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-md transition-colors whitespace-nowrap shrink-0 font-mono tabular-nums"
              >
                Close Profits (+
                {openPositions
                  .filter((p) => p.unrealizedPnL > 0)
                  .reduce((sum, p) => sum + p.unrealizedPnL, 0)
                  .toFixed(2)}{' '}
                {accountCurrency})
              </button>
            )}

            {ledgerTab === 'signals' && (
              <div className="flex items-center gap-1">
                {(['ALL', 'Forex', 'Metals', 'Indices', 'Crypto'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setAssetFilter(cat)}
                    className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                      assetFilter === cat
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 bg-[#0B111E]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {ledgerTab === 'signals' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Symbol</th>
                  <th className="py-2 px-2 font-medium">Class</th>
                  <th className="py-2 px-2 font-medium">Signal</th>
                  <th className="py-2 px-2 font-medium text-right">Spread / Max</th>
                  <th className="py-2 px-2 font-medium text-right">Checks</th>
                  <th className="py-2 px-2 font-medium text-right">Lot (0.5%)</th>
                  <th className="py-2 px-3 font-medium">Technical Explanation</th>
                  <th className="py-2 pl-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredSignals.map((sig) => (
                  <tr
                    key={sig.instrumentId}
                    onClick={() => {
                      onToggleAllInstruments(false);
                      onSelectInstrument(sig.instrumentId);
                    }}
                    className={`cursor-pointer hover:bg-slate-800/40 ${
                      sig.instrumentId === selectedInstrumentId && !allInstrumentsMode ? 'bg-sky-950/20' : ''
                    }`}
                  >
                    <td className="py-2.5 pr-3 font-mono font-semibold text-slate-100 whitespace-nowrap">
                      {sig.brokerSymbol}
                    </td>
                    <td className="py-2.5 px-2 text-slate-400 whitespace-nowrap">{sig.assetClass}</td>
                    <td
                      className={`py-2.5 px-2 font-mono font-semibold whitespace-nowrap ${
                        sig.direction === 'BUY'
                          ? 'text-emerald-400'
                          : sig.direction === 'SELL'
                            ? 'text-red-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {sig.direction}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                        sig.currentSpreadPts > sig.adaptiveMaxSpreadPts ? 'text-amber-400' : 'text-slate-300'
                      }`}
                    >
                      {sig.currentSpreadPts} / {sig.adaptiveMaxSpreadPts}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                      {sig.confluencePassed}/{sig.confluenceTotal}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200">
                      {sig.lotSizePreview.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 max-w-md truncate" title={sig.technicalExplanation}>
                      {sig.technicalExplanation}
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      {sig.direction !== 'WAIT' && !sig.blockedReason ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onExecuteManualSignal(sig);
                          }}
                          className="px-2.5 py-1 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded whitespace-nowrap"
                        >
                          Trade
                        </button>
                      ) : (
                        <span className="text-slate-500 font-mono text-[11px]">
                          {sig.blockedReason ? 'Blocked' : 'Standby'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ledgerTab === 'positions' && (
          <div className="overflow-x-auto">
            {openPositions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No open positions. Switch to AUTO MODE or trigger a valid signal from the Multi-Pair Scanner.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Ticket</th>
                    <th className="py-2 px-2 font-medium">Symbol</th>
                    <th className="py-2 px-2 font-medium">Dir</th>
                    <th className="py-2 px-2 font-medium text-right">Lots</th>
                    <th className="py-2 px-2 font-medium text-right">Entry</th>
                    <th className="py-2 px-2 font-medium text-right">SL / TP</th>
                    <th className="py-2 px-2 font-medium text-right">Slip / Fee</th>
                    <th className="py-2 px-2 font-medium text-right">Unrealized P/L</th>
                    <th className="py-2 pl-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {openPositions.map((pos) => (
                    <tr key={pos.ticket}>
                      <td className="py-2.5 pr-3 text-slate-300">{pos.ticket}</td>
                      <td className="py-2.5 px-2 font-semibold text-slate-100">{pos.symbol}</td>
                      <td className={`py-2.5 px-2 font-semibold ${pos.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pos.direction}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-200">{pos.lots.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right text-slate-200">{pos.entryPrice}</td>
                      <td className="py-2.5 px-2 text-right text-slate-400">
                        {pos.stopLoss} / {pos.takeProfit}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-400">
                        {pos.slippagePts}p / ${pos.commission.toFixed(2)}
                      </td>
                      <td className={`py-2.5 px-2 text-right font-semibold ${pos.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pos.unrealizedPnL >= 0 ? '+' : ''}
                        {pos.unrealizedPnL.toFixed(2)}
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => onClosePosition(pos.ticket)}
                          className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-red-700 text-slate-200 rounded transition-colors"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {ledgerTab === 'history' && (
          <div className="overflow-x-auto">
            {closedTrades.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No closed trades recorded yet. Click "Run Backtest Sandbox" or import an MT5 CSV report.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Ticket</th>
                    <th className="py-2 px-2 font-medium">Env</th>
                    <th className="py-2 px-2 font-medium">Symbol</th>
                    <th className="py-2 px-2 font-medium">Dir</th>
                    <th className="py-2 px-2 font-medium text-right">Lots</th>
                    <th className="py-2 px-2 font-medium text-right">Spread / Slip</th>
                    <th className="py-2 px-2 font-medium text-right">Fees</th>
                    <th className="py-2 px-2 font-medium text-right">Net P/L</th>
                    <th className="py-2 pl-3 font-medium">Technical Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {closedTrades.slice(0, 60).map((tr) => (
                    <tr key={tr.ticket}>
                      <td className="py-2 pr-3 text-slate-400">{tr.ticket}</td>
                      <td className="py-2 px-2 text-slate-400">{tr.environment}</td>
                      <td className="py-2 px-2 font-semibold text-slate-100">{tr.symbol}</td>
                      <td className={`py-2 px-2 ${tr.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {tr.direction}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-200">{tr.lots.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right text-slate-400">
                        {tr.spreadPts}p / {tr.slippagePts}p
                      </td>
                      <td className="py-2 px-2 text-right text-slate-400">${tr.fees.toFixed(2)}</td>
                      <td className={`py-2 px-2 text-right font-semibold ${tr.netPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {tr.netPnL >= 0 ? '+' : ''}
                        {tr.netPnL.toFixed(2)}
                      </td>
                      <td className="py-2 pl-3 font-sans text-slate-400 max-w-sm truncate" title={tr.technicalReason}>
                        {tr.technicalReason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {ledgerTab === 'rejected' && (
          <div className="overflow-x-auto">
            {rejectedOrders.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No rejected or blocked order attempts logged yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 px-2 font-medium">Symbol</th>
                    <th className="py-2 px-2 font-medium">Attempted</th>
                    <th className="py-2 px-2 font-medium text-right">Spread / Cap</th>
                    <th className="py-2 pl-3 font-medium">Truth Mode Rejection Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {rejectedOrders.slice(0, 40).map((rej) => (
                    <tr key={rej.id}>
                      <td className="py-2 pr-3 text-slate-400">{rej.timestamp}</td>
                      <td className="py-2 px-2 font-semibold text-slate-200">{rej.symbol}</td>
                      <td className="py-2 px-2 text-amber-400">{rej.attemptedDirection}</td>
                      <td className="py-2 px-2 text-right text-slate-300">
                        {rej.spreadPts} / {rej.maxAllowedSpreadPts}
                      </td>
                      <td className="py-2 pl-3 font-sans text-amber-300">{rej.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* MT5 CSV Import Modal */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#111827] border border-slate-700 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">Import MetaTrader 5 Trade History CSV</h3>
              <button
                type="button"
                onClick={() => setCsvModalOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Paste CSV rows exported from MT5 Strategy Tester or Account History (format: <span className="font-mono text-slate-300">symbol,direction,lots,entry,exit,spreadPts,slippagePts,fees,netPnL</span>) to compute verified Truth Mode metrics.
            </p>
            <textarea
              rows={6}
              value={csvDraft}
              onChange={(e) => setCsvDraft(e.target.value)}
              placeholder={`EURUSDm,BUY,0.10,1.08420,1.08540,12,0.5,-0.70,11.30\nXAUUSDm,SELL,0.05,2634.50,2638.10,28,1.2,-0.35,-18.35`}
              className="w-full bg-[#0B111E] border border-slate-700 rounded-md p-3 font-mono text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCsvModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onImportMt5Csv(csvDraft);
                  setCsvModalOpen(false);
                  setCsvDraft('');
                }}
                className="px-4 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md"
              >
                Parse & Audit Trades
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
