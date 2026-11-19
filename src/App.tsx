/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Code2,
  Globe2,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ALL_INSTRUMENTS, INITIAL_BROKERS } from './data/brokersAndInstruments';
import {
  computeTruthStatsFromTrades,
  evaluateInstrumentSignal,
  getCurrentTradingSessionUTC,
  getTypicalBrokerLatencyThresholdMs,
  runDeterministicBacktestSandbox,
} from './engine/scalpingEngine';
import {
  AccountTier,
  BrokerProfile,
  ClosedTradeRecord,
  EnvironmentMode,
  OpenPosition,
  OperatingMode,
  RejectedOrderLog,
  RiskConfig,
  ScalpingSignal,
  TruthStats,
} from './types/trading';
import { ControlPanelView } from './components/ControlPanelView';
import { BrokerMatrixView } from './components/BrokerMatrixView';
import { Mql5CodeView } from './components/Mql5CodeView';
import { TruthAuditView } from './components/TruthAuditView';

type NavTab = 'panel' | 'brokers' | 'mql5' | 'audit';

const DEFAULT_RISK_CONFIG: RiskConfig = {
  riskPercent: 0.5,
  useFixedLot: false,
  fixedLotSize: 0.01,
  maxDailyLossPct: 2.0,
  maxDailyTrades: 15,
  maxDrawdownPct: 5.0,
  newsProtectionEnabled: true,
  newsBufferMinutes: 15,
  allowUltraShortM1: false,
  atrSlMultiplier: 1.5,
  atrTpMultiplier: 2.2,
  adxMinThreshold: 18,
  baseMaxSpreadPts: 22,
  latencyThresholdMs: 0,
  autoCloseProfitsEnabled: true,
  autoCloseProfitTargetPct: 0.5,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('panel');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [brokers, setBrokers] = useState<BrokerProfile[]>(INITIAL_BROKERS);
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('icmarkets');
  const [allBrokersMode, setAllBrokersMode] = useState<boolean>(false);
  const [manualSuffix, setManualSuffix] = useState<string>('');

  const [accountTier, setAccountTier] = useState<AccountTier>('Raw Spread');
  const [accountCurrency, setAccountCurrency] = useState<string>('USD');
  const [balance, setBalance] = useState<number>(10000);
  const [equity, setEquity] = useState<number>(10000);

  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('EURUSD');
  const [allInstrumentsMode, setAllInstrumentsMode] = useState<boolean>(true);

  const [operatingMode, setOperatingMode] = useState<OperatingMode>('MANUAL');
  const [environmentMode, setEnvironmentMode] = useState<EnvironmentMode>('BACKTEST');
  const [emergencyStopped, setEmergencyStopped] = useState<boolean>(false);

  const [riskConfig, setRiskConfig] = useState<RiskConfig>(DEFAULT_RISK_CONFIG);
  const [tickStep, setTickStep] = useState<number>(14);

  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTradeRecord[]>([]);
  const [rejectedOrders, setRejectedOrders] = useState<RejectedOrderLog[]>([]);
  const [equityCurve, setEquityCurve] = useState<{ bar: number; equity: number }[]>([]);
  const [truthStats, setTruthStats] = useState<TruthStats>({
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    rejectedOrders: 0,
    actualWinRatePct: 0,
    netPnL: 0,
    maxDrawdownPct: 0,
    avgSpreadPts: 0,
    avgSlippagePts: 0,
    totalFees: 0,
    profitFactor: 0,
  });

  const selectedBroker = useMemo(
    () => brokers.find((b) => b.id === selectedBrokerId) ?? brokers[0],
    [brokers, selectedBrokerId]
  );

  const selectedInstrument = useMemo(
    () => ALL_INSTRUMENTS.find((i) => i.id === selectedInstrumentId) ?? ALL_INSTRUMENTS[0],
    [selectedInstrumentId]
  );

  // Sync default tier/currency when switching broker
  const handleSelectBroker = (id: string) => {
    const next = brokers.find((b) => b.id === id);
    setSelectedBrokerId(id);
    if (next) {
      setAccountTier(next.defaultTier);
      setAccountCurrency(next.defaultCurrency);
      if (next.defaultTier === 'Cent' || next.defaultCurrency === 'USC') {
        setBalance(100000);
        setEquity(100000);
      } else {
        setBalance(10000);
        setEquity(10000);
      }
    }
  };

  // Run initial deterministic Backtest Sandbox on load so user sees transparent Truth Mode telemetry
  useEffect(() => {
    const result = runDeterministicBacktestSandbox(
      selectedInstrument,
      selectedBroker,
      accountTier,
      balance,
      riskConfig,
      260
    );
    setClosedTrades(result.trades);
    setRejectedOrders(result.rejected);
    setEquityCurve(result.equityCurve);
    setTruthStats(result.stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Evaluate multi-pair, multi-timeframe signals across all instruments and measure cycle duration
  const evaluationBundle = useMemo(() => {
    const startMs = performance.now();
    const allEvaluations = ALL_INSTRUMENTS.map((inst) =>
      evaluateInstrumentSignal(
        inst,
        selectedBroker,
        accountTier,
        manualSuffix,
        equity,
        riskConfig,
        tickStep
      )
    );
    const activeEval =
      allEvaluations.find((e) => e.signal.instrumentId === selectedInstrumentId) ?? allEvaluations[0];
    const cycleDurationMs = Number(Math.max(0.1, performance.now() - startMs).toFixed(1));

    return {
      allSignals: allEvaluations.map((e) => e.signal),
      activeSignal: activeEval.signal,
      activeCandles: activeEval.m5Candles,
      cycleDurationMs,
    };
  }, [selectedBroker, accountTier, manualSuffix, equity, riskConfig, tickStep, selectedInstrumentId]);

  const brokerLatencyThresholdMs =
    riskConfig.latencyThresholdMs > 0
      ? riskConfig.latencyThresholdMs
      : getTypicalBrokerLatencyThresholdMs(selectedBroker, accountTier);

  const executeOrderForSignal = (sig: ScalpingSignal) => {
    if (emergencyStopped || sig.direction === 'WAIT') return;

    if (environmentMode === 'LIVE' && selectedBroker.verificationStatus !== 'Demo Validated') {
      setRejectedOrders((prev) => [
        {
          id: `REJ-${Date.now()}`,
          timestamp: new Date().toISOString().slice(11, 19),
          symbol: sig.brokerSymbol,
          attemptedDirection: sig.direction as 'BUY' | 'SELL',
          reason: 'Truth Mode Gate: Live Mode blocked until broker completes Demo Validation.',
          spreadPts: sig.currentSpreadPts,
          maxAllowedSpreadPts: sig.adaptiveMaxSpreadPts,
        },
        ...prev,
      ]);
      return;
    }

    if (sig.blockedReason) {
      setRejectedOrders((prev) => [
        {
          id: `REJ-${Date.now()}`,
          timestamp: new Date().toISOString().slice(11, 19),
          symbol: sig.brokerSymbol,
          attemptedDirection: sig.direction as 'BUY' | 'SELL',
          reason: sig.blockedReason!,
          spreadPts: sig.currentSpreadPts,
          maxAllowedSpreadPts: sig.adaptiveMaxSpreadPts,
        },
        ...prev,
      ]);
      return;
    }

    // Prevent duplicate position on same symbol
    if (openPositions.some((p) => p.symbol === sig.brokerSymbol)) {
      setRejectedOrders((prev) => [
        {
          id: `REJ-${Date.now()}`,
          timestamp: new Date().toISOString().slice(11, 19),
          symbol: sig.brokerSymbol,
          attemptedDirection: sig.direction as 'BUY' | 'SELL',
          reason: 'Duplicate order guard: Active position already open on symbol.',
          spreadPts: sig.currentSpreadPts,
          maxAllowedSpreadPts: sig.adaptiveMaxSpreadPts,
        },
        ...prev,
      ]);
      return;
    }

    const inst = ALL_INSTRUMENTS.find((i) => i.id === sig.instrumentId) ?? selectedInstrument;
    const slipPts = Number((Math.abs(Math.sin(tickStep * 2.1)) * 1.6).toFixed(1));
    const commission = Number(
      (
        (accountTier === 'Raw Spread' || accountTier === 'ECN'
          ? selectedBroker.rawSpreadCommissionPerLot
          : 0) * sig.lotSizePreview
      ).toFixed(2)
    );

    const filledEntry =
      sig.direction === 'BUY'
        ? Number((sig.entryPrice + slipPts * inst.point).toFixed(inst.digits))
        : Number((sig.entryPrice - slipPts * inst.point).toFixed(inst.digits));

    const newPos: OpenPosition = {
      ticket: `POS-${Math.floor(100000 + Math.random() * 899999)}`,
      symbol: sig.brokerSymbol,
      direction: sig.direction,
      lots: sig.lotSizePreview,
      entryPrice: filledEntry,
      currentPrice: filledEntry,
      stopLoss: sig.stopLoss,
      takeProfit: sig.takeProfit,
      spreadAtEntryPts: sig.currentSpreadPts,
      slippagePts: slipPts,
      commission,
      unrealizedPnL: Number((-commission).toFixed(2)),
      openedAt: new Date().toISOString().slice(11, 19),
      technicalReason: sig.technicalExplanation,
    };

    setOpenPositions((prev) => [newPos, ...prev]);
  };

  const closeOpenPosition = (ticket: string) => {
    const pos = openPositions.find((p) => p.ticket === ticket);
    if (!pos) return;

    const net = Number(pos.unrealizedPnL.toFixed(2));
    const closed: ClosedTradeRecord = {
      ticket: pos.ticket,
      symbol: pos.symbol,
      direction: pos.direction,
      lots: pos.lots,
      entryPrice: pos.entryPrice,
      exitPrice: pos.currentPrice,
      spreadPts: pos.spreadAtEntryPts,
      slippagePts: pos.slippagePts,
      fees: pos.commission,
      grossPnL: Number((net + pos.commission).toFixed(2)),
      netPnL: net,
      closedAt: new Date().toISOString().slice(11, 19),
      outcome: net >= 0 ? 'WIN' : 'LOSS',
      environment: environmentMode,
      technicalReason: pos.technicalReason,
    };

    const nextTrades = [closed, ...closedTrades];
    const nextBalance = Number((balance + net).toFixed(2));
    setOpenPositions((prev) => prev.filter((p) => p.ticket !== ticket));
    setClosedTrades(nextTrades);
    setBalance(nextBalance);
    setEquity(nextBalance);
    setTruthStats(computeTruthStatsFromTrades(nextTrades, rejectedOrders.length, 10000));
  };

  const closeAllProfitablePositions = (reasonPrefix = 'Manual Close Profits') => {
    const winners = openPositions.filter((p) => p.unrealizedPnL > 0);
    if (winners.length === 0) return;

    const nowTime = new Date().toISOString().slice(11, 19);
    const closedWinners: ClosedTradeRecord[] = winners.map((pos) => {
      const net = Number(pos.unrealizedPnL.toFixed(2));
      return {
        ticket: pos.ticket,
        symbol: pos.symbol,
        direction: pos.direction,
        lots: pos.lots,
        entryPrice: pos.entryPrice,
        exitPrice: pos.currentPrice,
        spreadPts: pos.spreadAtEntryPts,
        slippagePts: pos.slippagePts,
        fees: pos.commission,
        grossPnL: Number((net + pos.commission).toFixed(2)),
        netPnL: net,
        closedAt: nowTime,
        outcome: 'WIN',
        environment: environmentMode,
        technicalReason: `${reasonPrefix}: ${pos.technicalReason}`,
      };
    });

    const winnerTickets = new Set(winners.map((w) => w.ticket));
    const remaining = openPositions.filter((p) => !winnerTickets.has(p.ticket));
    const lockedProfit = closedWinners.reduce((sum, t) => sum + t.netPnL, 0);
    const remainingUnrealized = remaining.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const nextBalance = Number((balance + lockedProfit).toFixed(2));
    const nextTrades = [...closedWinners, ...closedTrades];

    setOpenPositions(remaining);
    setClosedTrades(nextTrades);
    setBalance(nextBalance);
    setEquity(Number((nextBalance + remainingUnrealized).toFixed(2)));
    setTruthStats(computeTruthStatsFromTrades(nextTrades, rejectedOrders.length, 10000));
  };

  // Step market tick + update open position mark-to-market + auto TP/SL & Auto-Close Profits + AUTO mode execution
  const handleStepMarketCycle = () => {
    const nextStep = tickStep + 1;
    setTickStep(nextStep);

    const nowTime = new Date().toISOString().slice(11, 19);
    const newlyClosed: ClosedTradeRecord[] = [];
    const survivingPositions: OpenPosition[] = [];

    // 1. Update mark-to-market PnL & execute automatic TP/SL hits
    openPositions.forEach((pos) => {
      const sig = evaluationBundle.allSignals.find((s) => s.brokerSymbol === pos.symbol);
      const inst = ALL_INSTRUMENTS.find((i) => i.id === sig?.instrumentId);
      if (!sig || !inst) {
        survivingPositions.push(pos);
        return;
      }

      const marketPrice = sig.entryPrice;
      const diff = pos.direction === 'BUY' ? marketPrice - pos.entryPrice : pos.entryPrice - marketPrice;
      const ticks = diff / inst.tickSize;
      const pnl = Number((ticks * inst.tickValuePerLotUsd * pos.lots - pos.commission).toFixed(2));

      const hitTp =
        (pos.direction === 'BUY' && marketPrice >= pos.takeProfit) ||
        (pos.direction === 'SELL' && marketPrice <= pos.takeProfit);
      const hitSl =
        (pos.direction === 'BUY' && marketPrice <= pos.stopLoss) ||
        (pos.direction === 'SELL' && marketPrice >= pos.stopLoss);

      if (hitTp || hitSl) {
        const net = pnl;
        newlyClosed.push({
          ticket: pos.ticket,
          symbol: pos.symbol,
          direction: pos.direction,
          lots: pos.lots,
          entryPrice: pos.entryPrice,
          exitPrice: marketPrice,
          spreadPts: pos.spreadAtEntryPts,
          slippagePts: pos.slippagePts,
          fees: pos.commission,
          grossPnL: Number((net + pos.commission).toFixed(2)),
          netPnL: net,
          closedAt: nowTime,
          outcome: net >= 0 ? 'WIN' : 'LOSS',
          environment: environmentMode,
          technicalReason: `${hitTp ? 'Auto Take-Profit Hit' : 'Auto Stop-Loss Hit'}: ${pos.technicalReason}`,
        });
      } else {
        survivingPositions.push({
          ...pos,
          currentPrice: marketPrice,
          unrealizedPnL: pnl,
        });
      }
    });

    // 2. Auto-Close Profits basket target check
    let finalOpen = survivingPositions;
    if (riskConfig.autoCloseProfitsEnabled && survivingPositions.length > 0) {
      const profitableOpen = survivingPositions.filter((p) => p.unrealizedPnL > 0);
      const totalFloatingProfit = profitableOpen.reduce((sum, p) => sum + p.unrealizedPnL, 0);
      const targetProfitMoney = Math.max(0.01, balance * (riskConfig.autoCloseProfitTargetPct / 100));

      if (profitableOpen.length > 0 && totalFloatingProfit >= targetProfitMoney) {
        const winnerIds = new Set(profitableOpen.map((p) => p.ticket));
        profitableOpen.forEach((pos) => {
          newlyClosed.push({
            ticket: pos.ticket,
            symbol: pos.symbol,
            direction: pos.direction,
            lots: pos.lots,
            entryPrice: pos.entryPrice,
            exitPrice: pos.currentPrice,
            spreadPts: pos.spreadAtEntryPts,
            slippagePts: pos.slippagePts,
            fees: pos.commission,
            grossPnL: Number((pos.unrealizedPnL + pos.commission).toFixed(2)),
            netPnL: pos.unrealizedPnL,
            closedAt: nowTime,
            outcome: 'WIN',
            environment: environmentMode,
            technicalReason: `Auto-Close Profits (${riskConfig.autoCloseProfitTargetPct}% target): ${pos.technicalReason}`,
          });
        });
        finalOpen = survivingPositions.filter((p) => !winnerIds.has(p.ticket));
      }
    }

    const realizedDelta = newlyClosed.reduce((sum, t) => sum + t.netPnL, 0);
    const totalUnrealized = finalOpen.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const nextBalance = Number((balance + realizedDelta).toFixed(2));

    setOpenPositions(finalOpen);
    if (newlyClosed.length > 0) {
      const nextTrades = [...newlyClosed, ...closedTrades];
      setClosedTrades(nextTrades);
      setBalance(nextBalance);
      setTruthStats(computeTruthStatsFromTrades(nextTrades, rejectedOrders.length, 10000));
    }
    setEquity(Number((nextBalance + totalUnrealized).toFixed(2)));

    if (operatingMode === 'AUTO' && !emergencyStopped) {
      const candidatePool = allInstrumentsMode
        ? evaluationBundle.allSignals
        : [evaluationBundle.activeSignal];
      const actionable = candidatePool.find(
        (s) => s.direction !== 'WAIT' && !s.blockedReason && !finalOpen.some((p) => p.symbol === s.brokerSymbol)
      );
      if (actionable) {
        executeOrderForSignal(actionable);
      }
    }
  };

  // Auto-cycle timer when AUTO MODE is enabled
  useEffect(() => {
    if (operatingMode !== 'AUTO' || emergencyStopped) return;
    const timer = setInterval(() => {
      handleStepMarketCycle();
    }, 3500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatingMode, emergencyStopped, tickStep, openPositions.length]);

  const handleRunBacktestSandbox = () => {
    setEnvironmentMode('BACKTEST');
    const result = runDeterministicBacktestSandbox(
      selectedInstrument,
      selectedBroker,
      accountTier,
      balance,
      riskConfig,
      260
    );
    setClosedTrades(result.trades);
    setRejectedOrders(result.rejected);
    setEquityCurve(result.equityCurve);
    setTruthStats(result.stats);
  };

  const handleEmergencyStop = () => {
    setEmergencyStopped(true);
    setOperatingMode('MANUAL');
    // Close all open positions on Emergency Stop
    if (openPositions.length > 0) {
      const closedNow: ClosedTradeRecord[] = openPositions.map((pos) => {
        const net = Number(pos.unrealizedPnL.toFixed(2));
        return {
          ticket: pos.ticket,
          symbol: pos.symbol,
          direction: pos.direction,
          lots: pos.lots,
          entryPrice: pos.entryPrice,
          exitPrice: pos.currentPrice,
          spreadPts: pos.spreadAtEntryPts,
          slippagePts: pos.slippagePts,
          fees: pos.commission,
          grossPnL: Number((net + pos.commission).toFixed(2)),
          netPnL: net,
          closedAt: new Date().toISOString().slice(11, 19),
          outcome: net >= 0 ? 'WIN' : 'LOSS',
          environment: environmentMode,
          technicalReason: 'Emergency Stop All Trading executed',
        };
      });
      const totalDelta = closedNow.reduce((acc, t) => acc + t.netPnL, 0);
      const nextTrades = [...closedNow, ...closedTrades];
      const nextBal = Number((balance + totalDelta).toFixed(2));
      setOpenPositions([]);
      setClosedTrades(nextTrades);
      setBalance(nextBal);
      setEquity(nextBal);
      setTruthStats(computeTruthStatsFromTrades(nextTrades, rejectedOrders.length, 10000));
    }
  };

  const handleImportMt5Csv = (csvText: string) => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: ClosedTradeRecord[] = [];
    lines.forEach((line, idx) => {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length < 9) return;
      const [sym, dirRaw, lotsStr, entryStr, exitStr, sprStr, slipStr, feeStr, netStr] = parts;
      const dir = dirRaw.toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      const netPnL = Number(netStr);
      if (Number.isNaN(netPnL)) return;
      const fees = Number(feeStr) || 0;
      parsed.push({
        ticket: `CSV-${100 + idx}`,
        symbol: sym,
        direction: dir,
        lots: Number(lotsStr) || 0.01,
        entryPrice: Number(entryStr) || 0,
        exitPrice: Number(exitStr) || 0,
        spreadPts: Number(sprStr) || 0,
        slippagePts: Number(slipStr) || 0,
        fees: Math.abs(fees),
        grossPnL: Number((netPnL + Math.abs(fees)).toFixed(2)),
        netPnL,
        closedAt: 'MT5 Import',
        outcome: netPnL >= 0 ? 'WIN' : 'LOSS',
        environment: environmentMode,
        technicalReason: 'Imported MT5 Terminal History CSV Deal',
      });
    });

    if (parsed.length > 0) {
      const curve = [{ bar: 0, equity: balance }];
      let running = balance;
      parsed.forEach((t, i) => {
        running = Number((running + t.netPnL).toFixed(2));
        curve.push({ bar: i + 1, equity: running });
      });
      setClosedTrades(parsed);
      setEquityCurve(curve);
      setTruthStats(computeTruthStatsFromTrades(parsed, rejectedOrders.length, balance));
    }
  };

  const handleAddBroker = (broker: BrokerProfile) => {
    setBrokers((prev) => [...prev, broker]);
  };

  const handleToggleBrokerVerified = (id: string, verified: boolean) => {
    setBrokers((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              verificationStatus: verified ? 'Demo Validated' : 'Pending Demo Validation',
              verifiedNotes: verified
                ? 'MT5 Demo contract specifications, symbol suffix, and execution rules validated by trader.'
                : 'Requires MT5 Demo contract & execution check before Live Mode.',
            }
          : b
      )
    );
  };

  const tradingSession = getCurrentTradingSessionUTC();

  const navItems: { id: NavTab; label: string; icon: typeof Activity }[] = [
    { id: 'panel', label: 'Control Panel', icon: Activity },
    { id: 'brokers', label: 'Broker Matrix', icon: Globe2 },
    { id: 'mql5', label: 'MQL5 Codebase', icon: Code2 },
    { id: 'audit', label: 'Truth Audit', icon: ShieldCheck },
  ];

  const pageTitleMap: Record<NavTab, string> = {
    panel: 'MT5 Control Panel',
    brokers: 'Universal Broker & Instrument Matrix',
    mql5: 'MQL5 Expert Advisor Source',
    audit: 'Truth Mode & Quantitative Audit',
  };

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-100 flex">
      {/* Desktop Sidebar (248px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-62 shrink-0 bg-[#0F172A] border-r border-slate-800">
        <div className="h-14 px-5 flex items-center border-b border-slate-800">
          <span className="font-display text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
            Aegis MT5 Scalper
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-600/15 text-sky-400 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-1">
          <div className="font-medium text-slate-200">Truth Mode Policy</div>
          <p className="leading-relaxed">
            Capital protection and verified execution take precedence over profit claims. Default risk: 0.5% per trade.
          </p>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 bg-[#0F172A] border-r border-slate-800 flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800">
              <span className="font-display text-base font-bold text-slate-100">Aegis MT5 Scalper</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md ${
                      active ? 'bg-sky-600/15 text-sky-400' : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileNavOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb/Title Left — Nav/Context — 1 Primary Action Right */}
        <header className="h-14 px-4 sm:px-6 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 text-slate-400 hover:text-slate-100"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 truncate">
              {pageTitleMap[activeTab]}
            </h1>
          </div>

          <div className="hidden md:flex items-center gap-6 text-xs text-slate-400 whitespace-nowrap shrink-0">
            <span>{selectedBroker.name}</span>
            <span aria-hidden="true">·</span>
            <span>{accountTier}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-200">
              {equity.toFixed(2)} {accountCurrency}
            </span>
          </div>

          <div className="shrink-0">
            {emergencyStopped ? (
              <button
                type="button"
                onClick={() => setEmergencyStopped(false)}
                className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Resume Monitoring
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEmergencyStop}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-red-700 hover:bg-red-600 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                STOP ALL TRADING
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'panel' && (
            <ControlPanelView
              brokers={brokers}
              selectedBrokerId={selectedBrokerId}
              onSelectBroker={handleSelectBroker}
              allBrokersMode={allBrokersMode}
              onToggleAllBrokers={setAllBrokersMode}
              accountTier={accountTier}
              onChangeAccountTier={setAccountTier}
              accountCurrency={accountCurrency}
              onChangeCurrency={setAccountCurrency}
              balance={balance}
              equity={equity}
              instruments={ALL_INSTRUMENTS}
              selectedInstrumentId={selectedInstrumentId}
              onSelectInstrument={setSelectedInstrumentId}
              allInstrumentsMode={allInstrumentsMode}
              onToggleAllInstruments={setAllInstrumentsMode}
              operatingMode={operatingMode}
              onChangeOperatingMode={setOperatingMode}
              environmentMode={environmentMode}
              onChangeEnvironmentMode={setEnvironmentMode}
              emergencyStopped={emergencyStopped}
              onEmergencyStop={handleEmergencyStop}
              onClearEmergencyStop={() => setEmergencyStopped(false)}
              tradingSession={tradingSession}
              cycleDurationMs={evaluationBundle.cycleDurationMs}
              brokerLatencyThresholdMs={brokerLatencyThresholdMs}
              activeSignal={evaluationBundle.activeSignal}
              allSignals={evaluationBundle.allSignals}
              candles={evaluationBundle.activeCandles}
              openPositions={openPositions}
              closedTrades={closedTrades}
              rejectedOrders={rejectedOrders}
              truthStats={truthStats}
              equityCurve={equityCurve}
              riskConfig={riskConfig}
              onUpdateRiskConfig={setRiskConfig}
              onStepTick={handleStepMarketCycle}
              onRunBacktestSandbox={handleRunBacktestSandbox}
              onExecuteManualSignal={executeOrderForSignal}
              onClosePosition={closeOpenPosition}
              onCloseAllProfits={() => closeAllProfitablePositions('Manual Profit Lock')}
              onImportMt5Csv={handleImportMt5Csv}
            />
          )}

          {activeTab === 'brokers' && (
            <BrokerMatrixView
              brokers={brokers}
              selectedBrokerId={selectedBrokerId}
              onSelectBroker={handleSelectBroker}
              onAddBroker={handleAddBroker}
              onToggleBrokerVerified={handleToggleBrokerVerified}
              manualSuffix={manualSuffix}
              onChangeManualSuffix={setManualSuffix}
              accountTier={accountTier}
              equity={equity}
              riskConfig={riskConfig}
              instruments={ALL_INSTRUMENTS}
            />
          )}

          {activeTab === 'mql5' && <Mql5CodeView />}

          {activeTab === 'audit' && (
            <TruthAuditView
              broker={selectedBroker}
              accountTier={accountTier}
              accountCurrency={accountCurrency}
              environmentMode={environmentMode}
              activeSignal={evaluationBundle.activeSignal}
              riskConfig={riskConfig}
              truthStats={truthStats}
            />
          )}
        </main>
      </div>
    </div>
  );
}
