export type AccountTier = 'Standard' | 'ECN' | 'Raw Spread' | 'Cent';

export type VerificationStatus = 'Pending Demo Validation' | 'Demo Validated' | 'Unverified Custom';

export type AssetClass = 'Forex' | 'Metals' | 'Indices' | 'Crypto';

export type TimeframeCode = 'M1' | 'M5' | 'M15' | 'M30' | 'H1';

export type EnvironmentMode = 'BACKTEST' | 'DEMO' | 'LIVE';

export type OperatingMode = 'AUTO' | 'MANUAL';

export type TradingSessionName =
  | 'Asian Session'
  | 'London Session'
  | 'London/NY Overlap'
  | 'New York Session'
  | 'Rollover / Low Liquidity';

export interface BrokerProfile {
  id: string;
  name: string;
  companyMatchPattern: string;
  serverMatchPattern: string;
  supportedTiers: AccountTier[];
  defaultTier: AccountTier;
  supportedCurrencies: string[];
  defaultCurrency: string;
  commonSuffixes: string[];
  typicalStopsLevelPts: number;
  typicalFreezeLevelPts: number;
  defaultFillingMode: 'FOK' | 'IOC' | 'RETURN';
  rawSpreadCommissionPerLot: number; // USD per round turn lot
  spreadMultiplier: number; // 1.0 = Standard, 0.35 = Raw/ECN, 1.3 = Cent
  verificationStatus: VerificationStatus;
  verifiedNotes: string;
  isCustom?: boolean;
}

export interface InstrumentSpec {
  id: string;
  canonicalSymbol: string;
  displayName: string;
  assetClass: AssetClass;
  digits: number;
  point: number;
  tickSize: number;
  tickValuePerLotUsd: number;
  contractSize: number;
  baseSpreadPts: number;
  baseAtrPrice: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  aliases: string[];
}

export interface CandleBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TimeframeSnapshot {
  timeframe: TimeframeCode;
  ema9: number;
  ema21: number;
  rsi14: number;
  atr14: number;
  macdMain: number;
  macdSignal: number;
  adx14: number;
  plusDI: number;
  minusDI: number;
  trendBias: 1 | -1 | 0;
}

export interface ScalpingSignal {
  instrumentId: string;
  canonicalSymbol: string;
  brokerSymbol: string;
  assetClass: AssetClass;
  direction: 'BUY' | 'SELL' | 'WAIT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  atrValue: number;
  currentSpreadPts: number;
  adaptiveMaxSpreadPts: number;
  stopsLevelPts: number;
  confluencePassed: number;
  confluenceTotal: number;
  supportLevel: number;
  resistanceLevel: number;
  marketStructure: 'Bullish HH/HL' | 'Bearish LH/LL' | 'Consolidation';
  liquiditySweep: 'Bullish Sweep' | 'Bearish Sweep' | 'None';
  volatilityState: 'Optimal' | 'Compressed' | 'Shock Spike';
  timeframeSnapshots: Record<TimeframeCode, TimeframeSnapshot>;
  technicalExplanation: string;
  lotSizePreview: number;
  blockedReason?: string;
}

export interface OpenPosition {
  ticket: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  spreadAtEntryPts: number;
  slippagePts: number;
  commission: number;
  unrealizedPnL: number;
  openedAt: string;
  technicalReason: string;
}

export interface ClosedTradeRecord {
  ticket: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  exitPrice: number;
  spreadPts: number;
  slippagePts: number;
  fees: number; // Commission + Swap
  grossPnL: number;
  netPnL: number;
  closedAt: string;
  outcome: 'WIN' | 'LOSS';
  environment: EnvironmentMode;
  technicalReason: string;
}

export interface RejectedOrderLog {
  id: string;
  timestamp: string;
  symbol: string;
  attemptedDirection: 'BUY' | 'SELL';
  reason: string;
  spreadPts: number;
  maxAllowedSpreadPts: number;
}

export interface RiskConfig {
  riskPercent: number; // default 0.5
  useFixedLot: boolean;
  fixedLotSize: number;
  maxDailyLossPct: number;
  maxDailyTrades: number;
  maxDrawdownPct: number;
  newsProtectionEnabled: boolean;
  newsBufferMinutes: number;
  allowUltraShortM1: boolean;
  atrSlMultiplier: number;
  atrTpMultiplier: number;
  adxMinThreshold: number;
  baseMaxSpreadPts: number;
  latencyThresholdMs: number; // 0 = Auto-adapt to broker & account tier
  autoCloseProfitsEnabled: boolean;
  autoCloseProfitTargetPct: number; // % of balance to auto-lock net profitable positions
}

export interface TruthStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  rejectedOrders: number;
  actualWinRatePct: number;
  netPnL: number;
  maxDrawdownPct: number;
  avgSpreadPts: number;
  avgSlippagePts: number;
  totalFees: number;
  profitFactor: number;
}
