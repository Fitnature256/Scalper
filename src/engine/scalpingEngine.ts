import { BASE_ANCHOR_PRICES } from '../data/brokersAndInstruments';
import {
  AccountTier,
  BrokerProfile,
  CandleBar,
  ClosedTradeRecord,
  EnvironmentMode,
  InstrumentSpec,
  RejectedOrderLog,
  RiskConfig,
  ScalpingSignal,
  TimeframeCode,
  TimeframeSnapshot,
  TradingSessionName,
  TruthStats,
} from '../types/trading';

export function getCurrentTradingSessionUTC(date = new Date()): TradingSessionName {
  const h = date.getUTCHours();
  if (h >= 7 && h < 12) return 'London Session';
  if (h >= 12 && h < 16) return 'London/NY Overlap';
  if (h >= 16 && h < 21) return 'New York Session';
  if (h >= 22 || h < 7) return 'Asian Session';
  return 'Rollover / Low Liquidity';
}

export function getTypicalBrokerLatencyThresholdMs(
  broker: BrokerProfile,
  tier: AccountTier
): number {
  const baseByTier: Record<AccountTier, number> = {
    'Raw Spread': 25,
    ECN: 40,
    Standard: 85,
    Cent: 110,
  };
  const tierBase = baseByTier[tier] ?? 50;
  // Tighter execution expectation on IOC low-stops-level brokers
  const brokerAdj = broker.typicalStopsLevelPts === 0 && broker.defaultFillingMode === 'IOC' ? 0 : 15;
  return tierBase + brokerAdj;
}

export function resolveBrokerSymbolName(
  instrument: InstrumentSpec,
  broker: BrokerProfile,
  manualSuffix: string
): string {
  const suffix = manualSuffix !== '' ? manualSuffix : broker.commonSuffixes[0] ?? '';
  if (broker.id === 'icmarkets' && instrument.id === 'NAS100') return `USTEC${suffix}`;
  if (broker.id === 'pepperstone' && instrument.id === 'SPX500') return `US500${suffix}`;
  return `${instrument.id}${suffix}`;
}

export function computeAdaptiveSpreadLimitPts(
  instrument: InstrumentSpec,
  broker: BrokerProfile,
  tier: AccountTier,
  baseMaxSpreadPts: number
): number {
  const tierFactor = tier === 'Raw Spread' || tier === 'ECN' ? 0.75 : tier === 'Cent' ? 1.35 : 1.0;
  const classFactor =
    instrument.assetClass === 'Metals'
      ? 2.2
      : instrument.assetClass === 'Indices'
        ? 9.0
        : instrument.assetClass === 'Crypto'
          ? 95.0
          : 1.0;
  return Number((baseMaxSpreadPts * tierFactor * classFactor * (broker.spreadMultiplier > 0.8 ? 1.05 : 0.9)).toFixed(1));
}

export function computeSimulatedBrokerSpreadPts(
  instrument: InstrumentSpec,
  broker: BrokerProfile,
  tier: AccountTier,
  tickStep: number
): number {
  const tierMult = tier === 'Raw Spread' ? 0.35 : tier === 'ECN' ? 0.5 : tier === 'Cent' ? 1.25 : 1.0;
  const jitter = 0.85 + ((Math.sin(tickStep * 1.7 + instrument.id.charCodeAt(0)) + 1) * 0.22);
  return Math.max(1, Math.round(instrument.baseSpreadPts * tierMult * (broker.spreadMultiplier / 0.7) * jitter));
}

export function calculateLotSizeForRisk(
  equity: number,
  riskConfig: RiskConfig,
  instrument: InstrumentSpec,
  entryPrice: number,
  stopLossPrice: number,
  isCentAccount: boolean
): number {
  if (riskConfig.useFixedLot) {
    return clampLot(riskConfig.fixedLotSize, instrument);
  }
  const slDist = Math.abs(entryPrice - stopLossPrice);
  if (slDist <= 0 || instrument.tickSize <= 0 || instrument.tickValuePerLotUsd <= 0) {
    return instrument.minLot;
  }
  const effectiveEquity = isCentAccount ? equity / 100 : equity;
  const riskMoney = effectiveEquity * (riskConfig.riskPercent / 100);
  const slTicks = slDist / instrument.tickSize;
  const lossPerLot = slTicks * instrument.tickValuePerLotUsd;
  if (lossPerLot <= 0) return instrument.minLot;
  const rawLot = riskMoney / lossPerLot;
  return clampLot(rawLot, instrument);
}

function clampLot(lot: number, instrument: InstrumentSpec): number {
  const clamped = Math.max(instrument.minLot, Math.min(instrument.maxLot, lot));
  const stepped = Math.floor(clamped / instrument.lotStep) * instrument.lotStep;
  const decimals = instrument.lotStep >= 1 ? 0 : instrument.lotStep >= 0.1 ? 1 : 2;
  return Number(Math.max(instrument.minLot, stepped).toFixed(decimals));
}

// Deterministic pseudo-random wave generator for reproducible sandbox candle histories
export function generateDeterministicCandles(
  instrument: InstrumentSpec,
  tf: TimeframeCode,
  count: number,
  seedOffset: number
): CandleBar[] {
  const anchor = BASE_ANCHOR_PRICES[instrument.id] ?? 1.10000;
  const tfScale: Record<TimeframeCode, number> = {
    M1: 0.45,
    M5: 1.0,
    M15: 1.65,
    M30: 2.3,
    H1: 3.1,
  };
  const stepVol = instrument.baseAtrPrice * tfScale[tf] * 0.55;
  const candles: CandleBar[] = [];

  let price = anchor;
  const symHash = instrument.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const now = Date.now();
  const tfMinutes: Record<TimeframeCode, number> = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60 };

  for (let i = 0; i < count; i++) {
    const idx = i + seedOffset;
    const macroCycle = Math.sin((idx + symHash) * 0.085) * stepVol * 1.45;
    const microCycle = Math.cos((idx * 1.9 + symHash * 0.7)) * stepVol * 0.75;
    const impulse = Math.sin((idx * 0.37 + symHash * 1.3)) * stepVol * 0.9;

    const open = price;
    const delta = macroCycle * 0.45 + microCycle * 0.35 + impulse * 0.2;
    const close = Math.max(instrument.point * 10, open + delta);
    const wickUp = Math.abs(Math.sin(idx * 2.3 + symHash)) * stepVol * 0.65;
    const wickDn = Math.abs(Math.cos(idx * 2.7 + symHash)) * stepVol * 0.65;
    const high = Math.max(open, close) + wickUp;
    const low = Math.max(instrument.point * 5, Math.min(open, close) - wickDn);

    const barTime = new Date(now - (count - 1 - i) * tfMinutes[tf] * 60_000);
    const hh = String(barTime.getUTCHours()).padStart(2, '0');
    const mm = String(barTime.getUTCMinutes()).padStart(2, '0');

    candles.push({
      time: `${hh}:${mm}`,
      open: Number(open.toFixed(instrument.digits)),
      high: Number(high.toFixed(instrument.digits)),
      low: Number(low.toFixed(instrument.digits)),
      close: Number(close.toFixed(instrument.digits)),
    });
    price = close;
  }

  return candles;
}

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[i] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 2) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 75;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

function calcATRSeries(candles: CandleBar[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].high - candles[i].low);
    } else {
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prevClose),
        Math.abs(candles[i].low - prevClose)
      );
      trs.push(tr);
    }
  }
  return calcEMA(trs, period);
}

function calcADX(candles: CandleBar[], period = 14): { adx: number; plusDI: number; minusDI: number } {
  if (candles.length < period + 5) return { adx: 16, plusDI: 20, minusDI: 20 };
  const start = candles.length - period;
  let trSum = 0;
  let plusDmSum = 0;
  let minusDmSum = 0;

  for (let i = start; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trSum += tr;
    plusDmSum += plusDm;
    minusDmSum += minusDm;
  }

  if (trSum <= 0) return { adx: 15, plusDI: 15, minusDI: 15 };
  const plusDI = (plusDmSum / trSum) * 100;
  const minusDI = (minusDmSum / trSum) * 100;
  const diSum = plusDI + minusDI;
  const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 15;
  return {
    adx: Number(Math.min(60, Math.max(8, dx)).toFixed(2)),
    plusDI: Number(plusDI.toFixed(2)),
    minusDI: Number(minusDI.toFixed(2)),
  };
}

export function computeTimeframeSnapshot(candles: CandleBar[], tf: TimeframeCode): TimeframeSnapshot {
  const closes = candles.map((c) => c.close);
  const ema9Arr = calcEMA(closes, 9);
  const ema21Arr = calcEMA(closes, 21);
  const ema12Arr = calcEMA(closes, 12);
  const ema26Arr = calcEMA(closes, 26);
  const macdLine = ema12Arr.map((v, i) => v - ema26Arr[i]);
  const macdSignalArr = calcEMA(macdLine, 9);
  const atrArr = calcATRSeries(candles, 14);
  const { adx, plusDI, minusDI } = calcADX(candles, 14);

  const lastIdx = candles.length - 1;
  const ema9 = ema9Arr[lastIdx] ?? 0;
  const ema21 = ema21Arr[lastIdx] ?? 0;
  const macdMain = macdLine[lastIdx] ?? 0;
  const macdSignal = macdSignalArr[lastIdx] ?? 0;
  const rsi14 = calcRSI(closes, 14);
  const atr14 = atrArr[lastIdx] ?? 0;

  let trendBias: 1 | -1 | 0 = 0;
  if (ema9 > ema21 && macdMain > macdSignal && plusDI >= minusDI) trendBias = 1;
  else if (ema9 < ema21 && macdMain < macdSignal && minusDI >= plusDI) trendBias = -1;

  return {
    timeframe: tf,
    ema9,
    ema21,
    rsi14,
    atr14,
    macdMain,
    macdSignal,
    adx14: adx,
    plusDI,
    minusDI,
    trendBias,
  };
}

export function evaluateInstrumentSignal(
  instrument: InstrumentSpec,
  broker: BrokerProfile,
  tier: AccountTier,
  manualSuffix: string,
  equity: number,
  riskConfig: RiskConfig,
  tickStep: number
): { signal: ScalpingSignal; m5Candles: CandleBar[] } {
  const tfs: TimeframeCode[] = ['M1', 'M5', 'M15', 'M30', 'H1'];
  const candleMap = {} as Record<TimeframeCode, CandleBar[]>;
  const snapshots = {} as Record<TimeframeCode, TimeframeSnapshot>;

  for (const tf of tfs) {
    candleMap[tf] = generateDeterministicCandles(instrument, tf, 60, tickStep);
    snapshots[tf] = computeTimeframeSnapshot(candleMap[tf], tf);
  }

  const m5 = candleMap.M5;
  const m15 = candleMap.M15;
  const execTf: TimeframeCode = riskConfig.allowUltraShortM1 ? 'M1' : 'M5';
  const execSnap = snapshots[execTf];
  const macroScore = snapshots.M15.trendBias + snapshots.M30.trendBias + snapshots.H1.trendBias;

  // Support & Resistance + Market Structure + Liquidity Sweep on M15
  const recentBars = m15.slice(35, 58);
  const priorBars = m15.slice(15, 35);
  const recentHigh = Math.max(...recentBars.map((b) => b.high));
  const recentLow = Math.min(...recentBars.map((b) => b.low));
  const priorHigh = Math.max(...priorBars.map((b) => b.high));
  const priorLow = Math.min(...priorBars.map((b) => b.low));

  let marketStructure: ScalpingSignal['marketStructure'] = 'Consolidation';
  if (recentHigh > priorHigh && recentLow > priorLow) marketStructure = 'Bullish HH/HL';
  else if (recentHigh < priorHigh && recentLow < priorLow) marketStructure = 'Bearish LH/LL';

  const lastBar = m15[m15.length - 2];
  const prevBar = m15[m15.length - 3];
  const body = Math.abs(lastBar.close - lastBar.open);
  const lowerWick = Math.min(lastBar.open, lastBar.close) - lastBar.low;
  const upperWick = lastBar.high - Math.max(lastBar.open, lastBar.close);

  let liquiditySweep: ScalpingSignal['liquiditySweep'] = 'None';
  if (lastBar.low <= recentLow * 1.0005 && lastBar.close > recentLow && lowerWick > body * 0.9) {
    liquiditySweep = 'Bullish Sweep';
  } else if (lastBar.high >= recentHigh * 0.9995 && lastBar.close < recentHigh && upperWick > body * 0.9) {
    liquiditySweep = 'Bearish Sweep';
  }

  const bullPA =
    (prevBar.close < prevBar.open && lastBar.close > lastBar.open && lastBar.close > prevBar.open) ||
    (lowerWick > body * 1.3 && lastBar.close >= lastBar.open);
  const bearPA =
    (prevBar.close > prevBar.open && lastBar.close < lastBar.open && lastBar.close < prevBar.open) ||
    (upperWick > body * 1.3 && lastBar.close <= lastBar.open);

  const atrSeries = calcATRSeries(candleMap[execTf], 14);
  const avgAtr = atrSeries.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const atrRatio = avgAtr > 0 ? execSnap.atr14 / avgAtr : 1.0;
  const volatilityState: ScalpingSignal['volatilityState'] =
    atrRatio < 0.65 ? 'Compressed' : atrRatio > 2.4 ? 'Shock Spike' : 'Optimal';

  const currentSpreadPts = computeSimulatedBrokerSpreadPts(instrument, broker, tier, tickStep);
  const adaptiveMaxSpreadPts = computeAdaptiveSpreadLimitPts(instrument, broker, tier, riskConfig.baseMaxSpreadPts);
  const spreadOk = currentSpreadPts <= adaptiveMaxSpreadPts;

  const currentPrice = m5[m5.length - 1].close;
  const spreadPrice = currentSpreadPts * instrument.point;
  const ask = Number((currentPrice + spreadPrice).toFixed(instrument.digits));
  const bid = Number(currentPrice.toFixed(instrument.digits));

  // 7 technical confluence checks matching ScalpingEngine.mqh
  let buyChecks = 0;
  let sellChecks = 0;

  if (execSnap.ema9 > execSnap.ema21) buyChecks++;
  if (execSnap.ema9 < execSnap.ema21) sellChecks++;

  if (execSnap.rsi14 > 45 && execSnap.rsi14 < 72) buyChecks++;
  if (execSnap.rsi14 < 55 && execSnap.rsi14 > 28) sellChecks++;

  if (execSnap.macdMain > execSnap.macdSignal) buyChecks++;
  if (execSnap.macdMain < execSnap.macdSignal) sellChecks++;

  if (execSnap.adx14 >= riskConfig.adxMinThreshold && execSnap.plusDI > execSnap.minusDI) buyChecks++;
  if (execSnap.adx14 >= riskConfig.adxMinThreshold && execSnap.minusDI > execSnap.plusDI) sellChecks++;

  if (macroScore >= 1) buyChecks++;
  if (macroScore <= -1) sellChecks++;

  if (marketStructure !== 'Bearish LH/LL' && (bullPA || liquiditySweep === 'Bullish Sweep')) buyChecks++;
  if (marketStructure !== 'Bullish HH/HL' && (bearPA || liquiditySweep === 'Bearish Sweep')) sellChecks++;

  const minBrokerStopDist = broker.typicalStopsLevelPts * instrument.point;
  const slDist = Math.max(minBrokerStopDist + instrument.point * 2, execSnap.atr14 * riskConfig.atrSlMultiplier);
  const tpDist = Math.max(slDist * 1.4, execSnap.atr14 * riskConfig.atrTpMultiplier);

  if (ask > recentLow && recentHigh - ask >= tpDist * 0.25) buyChecks++;
  if (bid < recentHigh && bid - recentLow >= tpDist * 0.25) sellChecks++;

  let direction: ScalpingSignal['direction'] = 'WAIT';
  if (volatilityState === 'Optimal' && buyChecks >= 5 && sellChecks <= 3) direction = 'BUY';
  else if (volatilityState === 'Optimal' && sellChecks >= 5 && buyChecks <= 3) direction = 'SELL';

  const entryPrice = direction === 'SELL' ? bid : ask;
  const stopLoss =
    direction === 'SELL'
      ? Number((entryPrice + slDist).toFixed(instrument.digits))
      : Number((entryPrice - slDist).toFixed(instrument.digits));
  const takeProfit =
    direction === 'SELL'
      ? Number((entryPrice - tpDist).toFixed(instrument.digits))
      : Number((entryPrice + tpDist).toFixed(instrument.digits));

  const brokerSymbol = resolveBrokerSymbolName(instrument, broker, manualSuffix);
  const lotSizePreview = calculateLotSizeForRisk(
    equity,
    riskConfig,
    instrument,
    entryPrice,
    stopLoss,
    tier === 'Cent'
  );

  let blockedReason: string | undefined;
  if (!spreadOk && direction !== 'WAIT') {
    blockedReason = `Spread ${currentSpreadPts} pts exceeds adapted ceiling ${adaptiveMaxSpreadPts} pts`;
  } else if (volatilityState !== 'Optimal') {
    blockedReason = `Volatility state ${volatilityState} (ATR ratio ${atrRatio.toFixed(2)}x)`;
  }

  const technicalExplanation =
    direction === 'WAIT'
      ? `WAIT [${execTf}]: Confluence ${Math.max(buyChecks, sellChecks)}/7 (Buy=${buyChecks}, Sell=${sellChecks}). EMA9=${execSnap.ema9.toFixed(instrument.digits)} vs EMA21=${execSnap.ema21.toFixed(instrument.digits)}, RSI=${execSnap.rsi14}, ADX=${execSnap.adx14}, M15-H1 bias=${macroScore >= 0 ? `+${macroScore}` : macroScore}, Structure=${marketStructure}.`
      : `${direction} [${execTf}] ${direction === 'BUY' ? buyChecks : sellChecks}/7 checks: EMA9(${execSnap.ema9.toFixed(instrument.digits)}) ${direction === 'BUY' ? '>' : '<'} EMA21(${execSnap.ema21.toFixed(instrument.digits)}), RSI=${execSnap.rsi14}, MACD ${direction === 'BUY' ? '>' : '<'} Signal, ADX=${execSnap.adx14}, M15-H1=${macroScore >= 0 ? `+${macroScore}` : macroScore}, ${marketStructure}${liquiditySweep !== 'None' ? `, ${liquiditySweep}` : ''}.`;

  return {
    signal: {
      instrumentId: instrument.id,
      canonicalSymbol: instrument.canonicalSymbol,
      brokerSymbol,
      assetClass: instrument.assetClass,
      direction,
      entryPrice,
      stopLoss,
      takeProfit,
      atrValue: execSnap.atr14,
      currentSpreadPts,
      adaptiveMaxSpreadPts,
      stopsLevelPts: broker.typicalStopsLevelPts,
      confluencePassed: direction === 'BUY' ? buyChecks : direction === 'SELL' ? sellChecks : Math.max(buyChecks, sellChecks),
      confluenceTotal: 7,
      supportLevel: Number(recentLow.toFixed(instrument.digits)),
      resistanceLevel: Number(recentHigh.toFixed(instrument.digits)),
      marketStructure,
      liquiditySweep,
      volatilityState,
      timeframeSnapshots: snapshots,
      technicalExplanation,
      lotSizePreview,
      blockedReason,
    },
    m5Candles: m5,
  };
}

// Deterministic Backtest Sandbox Runner (Truth Mode: includes real losing trades, slippage, spread, and fees)
export function runDeterministicBacktestSandbox(
  instrument: InstrumentSpec,
  broker: BrokerProfile,
  tier: AccountTier,
  initialBalance: number,
  riskConfig: RiskConfig,
  barsToTest = 260
): {
  trades: ClosedTradeRecord[];
  rejected: RejectedOrderLog[];
  equityCurve: { bar: number; equity: number }[];
  stats: TruthStats;
} {
  const m5 = generateDeterministicCandles(instrument, 'M5', barsToTest, 17);
  const trades: ClosedTradeRecord[] = [];
  const rejected: RejectedOrderLog[] = [];
  const equityCurve: { bar: number; equity: number }[] = [{ bar: 0, equity: initialBalance }];

  let equity = initialBalance;
  let peakEquity = initialBalance;
  let maxDrawdownPct = 0;
  let totalSpread = 0;
  let totalSlippage = 0;
  let totalFees = 0;

  let activeTrade: {
    dir: 'BUY' | 'SELL';
    entry: number;
    sl: number;
    tp: number;
    lots: number;
    spreadPts: number;
    slipPts: number;
    fee: number;
    reason: string;
    openBar: number;
  } | null = null;

  for (let i = 45; i < m5.length; i++) {
    const slice = m5.slice(i - 45, i + 1);
    const bar = m5[i];
    const snap = computeTimeframeSnapshot(slice, 'M5');

    // Manage active trade exit first
    if (activeTrade) {
      let exitPrice: number | null = null;
      if (activeTrade.dir === 'BUY') {
        if (bar.low <= activeTrade.sl) exitPrice = activeTrade.sl;
        else if (bar.high >= activeTrade.tp) exitPrice = activeTrade.tp;
      } else {
        if (bar.high >= activeTrade.sl) exitPrice = activeTrade.sl;
        else if (bar.low <= activeTrade.tp) exitPrice = activeTrade.tp;
      }

      if (exitPrice !== null) {
        const priceDiff = activeTrade.dir === 'BUY' ? exitPrice - activeTrade.entry : activeTrade.entry - exitPrice;
        const ticks = priceDiff / instrument.tickSize;
        const grossPnL = Number((ticks * instrument.tickValuePerLotUsd * activeTrade.lots).toFixed(2));
        const netPnL = Number((grossPnL - activeTrade.fee).toFixed(2));

        equity = Number((equity + netPnL).toFixed(2));
        if (equity > peakEquity) peakEquity = equity;
        const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
        if (dd > maxDrawdownPct) maxDrawdownPct = dd;

        trades.push({
          ticket: `BT-${1000 + trades.length}`,
          symbol: instrument.canonicalSymbol,
          direction: activeTrade.dir,
          lots: activeTrade.lots,
          entryPrice: activeTrade.entry,
          exitPrice: Number(exitPrice.toFixed(instrument.digits)),
          spreadPts: activeTrade.spreadPts,
          slippagePts: activeTrade.slipPts,
          fees: activeTrade.fee,
          grossPnL,
          netPnL,
          closedAt: bar.time,
          outcome: netPnL >= 0 ? 'WIN' : 'LOSS',
          environment: 'BACKTEST',
          technicalReason: activeTrade.reason,
        });

        totalSpread += activeTrade.spreadPts;
        totalSlippage += activeTrade.slipPts;
        totalFees += activeTrade.fee;
        activeTrade = null;
        equityCurve.push({ bar: i, equity });
      }
      continue;
    }

    // Check drawdown circuit breaker
    if (maxDrawdownPct >= riskConfig.maxDrawdownPct) {
      rejected.push({
        id: `REJ-${i}`,
        timestamp: bar.time,
        symbol: instrument.canonicalSymbol,
        attemptedDirection: snap.trendBias >= 0 ? 'BUY' : 'SELL',
        reason: `Max Drawdown Circuit Breaker (${maxDrawdownPct.toFixed(2)}% >= ${riskConfig.maxDrawdownPct}%)`,
        spreadPts: 0,
        maxAllowedSpreadPts: riskConfig.baseMaxSpreadPts,
      });
      break;
    }

    const simSpreadPts = computeSimulatedBrokerSpreadPts(instrument, broker, tier, i);
    const maxSpreadPts = computeAdaptiveSpreadLimitPts(instrument, broker, tier, riskConfig.baseMaxSpreadPts);

    const buySignal = snap.ema9 > snap.ema21 && snap.rsi14 > 47 && snap.rsi14 < 70 && snap.macdMain > snap.macdSignal && snap.adx14 >= riskConfig.adxMinThreshold;
    const sellSignal = snap.ema9 < snap.ema21 && snap.rsi14 < 53 && snap.rsi14 > 30 && snap.macdMain < snap.macdSignal && snap.adx14 >= riskConfig.adxMinThreshold;

    if (!buySignal && !sellSignal) continue;
    const dir: 'BUY' | 'SELL' = buySignal ? 'BUY' : 'SELL';

    if (simSpreadPts > maxSpreadPts) {
      rejected.push({
        id: `REJ-${i}`,
        timestamp: bar.time,
        symbol: instrument.canonicalSymbol,
        attemptedDirection: dir,
        reason: `Spread guard blocked entry (${simSpreadPts} pts > ${maxSpreadPts} pts)`,
        spreadPts: simSpreadPts,
        maxAllowedSpreadPts: maxSpreadPts,
      });
      continue;
    }

    const slipPts = Number((Math.abs(Math.sin(i * 1.3)) * 2.4).toFixed(1));
    const spreadCost = simSpreadPts * instrument.point;
    const slipCost = slipPts * instrument.point;
    const entry = dir === 'BUY' ? bar.close + spreadCost + slipCost : bar.close - slipCost;

    const minStopDist = broker.typicalStopsLevelPts * instrument.point;
    const slDist = Math.max(minStopDist + instrument.point * 2, snap.atr14 * riskConfig.atrSlMultiplier);
    const tpDist = Math.max(slDist * 1.35, snap.atr14 * riskConfig.atrTpMultiplier);

    const sl = dir === 'BUY' ? entry - slDist : entry + slDist;
    const tp = dir === 'BUY' ? entry + tpDist : entry - tpDist;
    const lots = calculateLotSizeForRisk(equity, riskConfig, instrument, entry, sl, tier === 'Cent');
    const fee = Number(((tier === 'Raw Spread' || tier === 'ECN' ? broker.rawSpreadCommissionPerLot : 0) * lots).toFixed(2));

    activeTrade = {
      dir,
      entry: Number(entry.toFixed(instrument.digits)),
      sl: Number(sl.toFixed(instrument.digits)),
      tp: Number(tp.toFixed(instrument.digits)),
      lots,
      spreadPts: simSpreadPts,
      slipPts,
      fee,
      reason: `M5 ${dir}: EMA9/21 cross, RSI=${snap.rsi14}, ADX=${snap.adx14}, ATR=${snap.atr14.toFixed(instrument.digits)}`,
      openBar: i,
    };
  }

  const wins = trades.filter((t) => t.outcome === 'WIN');
  const losses = trades.filter((t) => t.outcome === 'LOSS');
  const grossWin = wins.reduce((s, t) => s + t.netPnL, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnL, 0));
  const netPnL = Number((equity - initialBalance).toFixed(2));

  return {
    trades,
    rejected,
    equityCurve,
    stats: {
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      rejectedOrders: rejected.length,
      actualWinRatePct: trades.length > 0 ? Number(((wins.length / trades.length) * 100).toFixed(1)) : 0,
      netPnL,
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
      avgSpreadPts: trades.length > 0 ? Number((totalSpread / trades.length).toFixed(1)) : 0,
      avgSlippagePts: trades.length > 0 ? Number((totalSlippage / trades.length).toFixed(2)) : 0,
      totalFees: Number(totalFees.toFixed(2)),
      profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99 : 0,
    },
  };
}

export function computeTruthStatsFromTrades(
  trades: ClosedTradeRecord[],
  rejectedCount: number,
  initialBalance: number
): TruthStats {
  let equity = initialBalance;
  let peak = initialBalance;
  let maxDd = 0;

  for (const t of trades) {
    equity += t.netPnL;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }

  const wins = trades.filter((t) => t.outcome === 'WIN');
  const losses = trades.filter((t) => t.outcome === 'LOSS');
  const grossWin = wins.reduce((s, t) => s + t.netPnL, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnL, 0));
  const netPnL = Number(trades.reduce((s, t) => s + t.netPnL, 0).toFixed(2));
  const totalFees = Number(trades.reduce((s, t) => s + t.fees, 0).toFixed(2));
  const avgSpreadPts =
    trades.length > 0 ? Number((trades.reduce((s, t) => s + t.spreadPts, 0) / trades.length).toFixed(1)) : 0;
  const avgSlippagePts =
    trades.length > 0 ? Number((trades.reduce((s, t) => s + t.slippagePts, 0) / trades.length).toFixed(2)) : 0;

  return {
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    rejectedOrders: rejectedCount,
    actualWinRatePct: trades.length > 0 ? Number(((wins.length / trades.length) * 100).toFixed(1)) : 0,
    netPnL,
    maxDrawdownPct: Number(maxDd.toFixed(2)),
    avgSpreadPts,
    avgSlippagePts,
    totalFees,
    profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99 : 0,
  };
}
