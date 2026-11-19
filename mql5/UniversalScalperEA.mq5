//+------------------------------------------------------------------+
//|                                          UniversalScalperEA.mq5  |
//|         Aegis MT5 Universal Multi-Broker, Multi-Pair Scalper     |
//|   Truth Mode Mandatory: Measured accuracy, capital protection.   |
//+------------------------------------------------------------------+
#property copyright "Aegis MT5 Universal Scalper"
#property version   "1.00"
#property description "Multi-broker, multi-instrument M1-H1 scalping EA with Truth Mode telemetry."

#include "Include/BrokerAdapter.mqh"
#include "Include/ScalpingEngine.mqh"
#include "Include/RiskManager.mqh"
#include "Include/ExecutionEngine.mqh"
#include "Include/ControlPanelUI.mqh"

//--- Broker & Account Inputs
input group "=== 1. Universal Broker Configuration ==="
input ENUM_BROKER_PRESET  InpBrokerPreset      = BROKER_AUTO_DETECT; // Broker Selection
input ENUM_ACCOUNT_TIER   InpAccountTier       = TIER_AUTO_DETECT;   // Account Tier
input string              InpCustomBrokerName  = "";                 // Custom Broker Name (if Other)
input string              InpManualSuffix      = "";                 // Manual Symbol Suffix Override
input bool                InpRequireDemoCheck  = true;               // Block Live Until Demo Validated

//--- Instrument Selection Inputs
input group "=== 2. Universal Instrument Selection ==="
input bool                InpAllInstruments    = false;              // Scan ALL Available Market Watch Instruments
input string              InpSelectedSymbol    = "EURUSD";           // Primary Symbol (if All=false)
input bool                InpIncludeForex      = true;               // Include Forex Pairs
input bool                InpIncludeMetals     = true;               // Include Metals (XAU/XAG)
input bool                InpIncludeIndices    = true;               // Include Indices (NAS100/US30/SPX500)
input bool                InpIncludeCrypto     = true;               // Include Crypto (BTC/ETH)

//--- Scalping Engine Inputs
input group "=== 3. Intelligent Scalping Engine ==="
input ENUM_OPERATING_MODE InpOperatingMode     = MODE_AUTO_TRADING;  // Operating Mode (Auto / Manual Signals)
input bool                InpAllowM1UltraShort = false;              // Allow M1 Ultra-Short Strategy (No 2s guarantee in MT5)
input double              InpAtrSlMultiplier   = 1.5;                // ATR Stop-Loss Multiplier
input double              InpAtrTpMultiplier   = 2.2;                // ATR Take-Profit Multiplier
input double              InpAdxMinThreshold   = 18.0;               // Minimum ADX Trend Strength
input double              InpTrailAtrMult      = 1.1;                // Trailing Stop ATR Multiplier
input double              InpBreakevenAtrMult  = 1.0;                // Breakeven Activation ATR Multiplier

//--- Risk Management Inputs
input group "=== 4. Universal Risk Management (0.5% Default) ==="
input double              InpRiskPercent       = 0.5;                // Risk Per Trade (%)
input bool                InpUseFixedLot       = false;              // Use Fixed Lot Instead of Risk %
input double              InpFixedLot          = 0.01;               // Fixed Lot Size
input double              InpMaxDailyLossPct   = 2.0;                // Max Daily Loss (%)
input int                 InpMaxDailyTrades    = 15;                 // Max Daily Trades
input double              InpMaxDrawdownPct    = 5.0;                // Max Equity Drawdown (%)
input bool                InpNewsProtection    = true;               // High-Impact News Guard
input int                 InpNewsBufferMinutes = 15;                 // News Guard Buffer (Minutes)
input bool                InpAutoCloseProfits  = true;               // Auto-Close Profitable Positions at Target
input double              InpAutoCloseProfitPct= 0.5;                // Basket Profit Lock Target (% Balance)

//--- Execution Inputs
input group "=== 5. Execution & Safety ==="
input ulong               InpMagicNumber       = 20260501;           // EA Magic Number
input double              InpBaseMaxSpreadPts  = 22.0;               // Base Max Spread (Forex Points)
input int                 InpMaxSlippagePts    = 15;                 // Max Allowed Slippage (Points)
input int                 InpCooldownBarsM5    = 2;                  // Cooldown M5 Bars Between Trades
input int                 InpMaxPosPerSymbol   = 1;                  // Max Open Positions Per Symbol
input int                 InpScanIntervalSec   = 3;                  // Multi-Pair Timer Interval (Seconds)

//--- Global Core Modules
CBrokerAdapter      g_broker;
CScalpingEngine     g_engine;
CRiskManager        g_risk;
CExecutionEngine    g_exec;
CControlPanelUI     g_ui;

ENUM_OPERATING_MODE g_opMode = MODE_AUTO_TRADING;
SymbolSpecs         g_universe[];
string              g_lastSignalSummary = "Initializing multi-timeframe engine...";
bool                g_demoValidated     = false;

//+------------------------------------------------------------------+
//| Refresh tradable symbol universe                                 |
//+------------------------------------------------------------------+
void BuildSymbolUniverse()
{
   ArrayResize(g_universe, 0);

   if(InpAllInstruments)
   {
      g_broker.DiscoverAllTradableSymbols(g_universe, InpIncludeForex, InpIncludeMetals, InpIncludeIndices, InpIncludeCrypto, InpBaseMaxSpreadPts);
      return;
   }

   string target = (InpSelectedSymbol == "" ? _Symbol : InpSelectedSymbol);
   SymbolSpecs specs;
   ENUM_INSTRUMENT_CLASS cls = CLASS_FOREX;
   string up = target;
   StringToUpper(up);
   if(StringFind(up, "XAU") >= 0 || StringFind(up, "XAG") >= 0) cls = CLASS_METALS;
   else if(StringFind(up, "NAS") >= 0 || StringFind(up, "US30") >= 0 || StringFind(up, "SPX") >= 0) cls = CLASS_INDICES;
   else if(StringFind(up, "BTC") >= 0 || StringFind(up, "ETH") >= 0) cls = CLASS_CRYPTO;

   if(g_broker.ReadSymbolSpecs(target, cls, InpBaseMaxSpreadPts, specs))
   {
      ArrayResize(g_universe, 1);
      g_universe[0] = specs;
   }
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   g_opMode = InpOperatingMode;
   g_broker.Initialize(InpBrokerPreset, InpAccountTier, InpCustomBrokerName, InpManualSuffix);
   BrokerProfile bp = g_broker.GetProfile();

   g_engine.Configure(InpAtrSlMultiplier, InpAtrTpMultiplier, InpAdxMinThreshold, InpAllowM1UltraShort);
   g_risk.Initialize(InpRiskPercent, InpUseFixedLot, InpFixedLot, InpMaxDailyLossPct, InpMaxDailyTrades, InpMaxDrawdownPct, InpNewsProtection, InpNewsBufferMinutes);
   g_exec.Initialize(InpMagicNumber, InpMaxSlippagePts, InpCooldownBarsM5, InpMaxPosPerSymbol);

   BuildSymbolUniverse();

   // Truth Mode: Require explicit Demo Validation before live real-money execution
   if(bp.isDemoAccount || MQLInfoInteger(MQL_TESTER))
   {
      g_demoValidated = true;
      g_broker.MarkTechnicallyVerified("Demo/Tester contract specs verified.");
   }
   else
   {
      g_demoValidated = !InpRequireDemoCheck;
      if(InpRequireDemoCheck)
         Print("[TRUTH MODE] Live account detected. Live execution locked until demo validation is confirmed.");
   }

   EventSetTimer(MathMax(1, InpScanIntervalSec));
   PrintFormat("[INIT] Broker=%s | Server=%s | Currency=%s | Suffix='%s' | Universe=%d symbols",
               bp.detectedBrokerLabel, bp.serverName, bp.accountCurrency, bp.detectedSuffix, ArraySize(g_universe));

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   g_engine.ReleaseAll();
   g_ui.Destroy();
}

//+------------------------------------------------------------------+
//| Core Multi-Pair Scan & Execution Cycle                           |
//+------------------------------------------------------------------+
void ProcessUniverseCycle()
{
   ulong cycleStartUs = GetMicrosecondCount();
   BrokerProfile bp = g_broker.GetProfile();
   if(ArraySize(g_universe) == 0)
   {
      g_lastSignalSummary = "No tradable symbols resolved for current broker suffix.";
      return;
   }

   for(int i = 0; i < ArraySize(g_universe); i++)
   {
      // Refresh live spread for this symbol
      g_universe[i].currentSpreadPts = (int)SymbolInfoInteger(g_universe[i].brokerSymbol, SYMBOL_SPREAD);

      ScalpingSignal sig;
      bool hasSignal = g_engine.EvaluateSymbol(g_universe[i], sig);

      // Update trailing stops on existing positions regardless of new entry
      if(sig.atrValue > 0.0)
         g_exec.ManageTrailingStops(g_universe[i], sig.atrValue, InpTrailAtrMult, InpBreakevenAtrMult);

      if(i == 0 || hasSignal)
         g_lastSignalSummary = g_universe[i].brokerSymbol + " -> " + sig.technicalExplanation;

      if(!hasSignal)
         continue;

      string denyReason = "";
      if(!g_risk.CanOpenNewTrade(g_universe[i], denyReason))
      {
         g_lastSignalSummary = g_universe[i].brokerSymbol + " BLOCKED: " + denyReason;
         continue;
      }

      if(g_opMode == MODE_MANUAL_SIGNALS_ONLY)
      {
         Print("[MANUAL SIGNAL] ", g_universe[i].brokerSymbol, " | ", sig.technicalExplanation);
         continue;
      }

      if(bp.isLiveAccount && !g_demoValidated)
      {
         g_lastSignalSummary = "LIVE BLOCKED: Complete Demo Validation before Live Mode.";
         continue;
      }

      double lot = g_risk.CalculateLotSize(g_universe[i], sig.entryPrice, sig.stopLoss);
      ExecutionTelemetry tel;
      if(g_exec.ExecuteSignal(g_universe[i], sig, lot, tel))
      {
         g_risk.IncrementDailyTradeCount();
         Print("[EXECUTED] ", g_universe[i].brokerSymbol, " | ", tel.explanation, " | ", sig.technicalExplanation);
      }
      else
      {
         Print("[REJECTED/FAILED] ", g_universe[i].brokerSymbol, " | ", tel.explanation);
      }
   }

   if(InpAutoCloseProfits)
   {
      double targetMoney = AccountInfoDouble(ACCOUNT_BALANCE) * (InpAutoCloseProfitPct / 100.0);
      double lockedProfit = 0.0;
      int closedWins = g_exec.CheckAndAutoCloseProfits(targetMoney, lockedProfit);
      if(closedWins > 0)
         PrintFormat("[AUTO-CLOSE PROFITS] Closed %d profitable positions, locked %.2f %s.", closedWins, lockedProfit, bp.accountCurrency);
   }

   double cycleMs = (double)(GetMicrosecondCount() - cycleStartUs) / 1000.0;
   double thresholdMs = (bp.accountTier == TIER_RAW_SPREAD ? 25.0 : (bp.accountTier == TIER_ECN ? 40.0 : 85.0));

   RiskState rs = g_risk.GetState();
   TruthPerformanceStats stats = g_exec.GetStats();
   int spread0 = (ArraySize(g_universe) > 0 ? g_universe[0].currentSpreadPts : 0);
   string sym0 = (ArraySize(g_universe) > 0 ? g_universe[0].brokerSymbol : _Symbol);

   g_ui.Render(bp, rs, stats, sym0, spread0, g_exec.CountOpenPositions(), g_lastSignalSummary, g_opMode, g_demoValidated, cycleMs, thresholdMs);
}

//+------------------------------------------------------------------+
//| Tick handler                                                     |
//+------------------------------------------------------------------+
void OnTick()
{
   ProcessUniverseCycle();
}

//+------------------------------------------------------------------+
//| Timer handler for simultaneous multi-pair scanning               |
//+------------------------------------------------------------------+
void OnTimer()
{
   ProcessUniverseCycle();
}

//+------------------------------------------------------------------+
//| Track real closed deal outcomes for Truth Mode reporting         |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;

   if(!HistoryDealSelect(trans.deal))
      return;

   if((ulong)HistoryDealGetInteger(trans.deal, DEAL_MAGIC) != InpMagicNumber)
      return;

   ENUM_DEAL_ENTRY entryType = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   if(entryType == DEAL_ENTRY_OUT || entryType == DEAL_ENTRY_INOUT || entryType == DEAL_ENTRY_OUT_BY)
   {
      double profit     = HistoryDealGetDouble(trans.deal, DEAL_PROFIT);
      double commission = HistoryDealGetDouble(trans.deal, DEAL_COMMISSION);
      double swap       = HistoryDealGetDouble(trans.deal, DEAL_SWAP);
      g_exec.RecordClosedDeal(profit, commission, swap);
   }
}

//+------------------------------------------------------------------+
//| Chart event handler for interactive buttons                      |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   bool stopNow = false;
   bool resetNow = false;
   bool closeProfitsNow = false;
   if(g_ui.HandleChartEvent(id, sparam, g_opMode, stopNow, resetNow, closeProfitsNow))
   {
      if(stopNow)
      {
         g_risk.TriggerEmergencyStop("Manual STOP ALL TRADING pressed");
         int closed = g_exec.CloseAllPositions();
         PrintFormat("[EMERGENCY STOP] Trading halted. Closed %d open EA positions.", closed);
      }
      else if(closeProfitsNow)
      {
         double locked = 0.0;
         int closed = g_exec.CloseAllProfitableNow(locked);
         PrintFormat("[CLOSE PROFITS] Closed %d profitable positions (net %.2f).", closed, locked);
      }
      else if(resetNow)
      {
         g_risk.ClearEmergencyStop();
         Print("[GUARD RESET] Emergency/Suspension flag cleared by trader.");
      }
      ProcessUniverseCycle();
   }
}

//+------------------------------------------------------------------+
//| Custom Strategy Tester fitness metric (Truth Mode)               |
//+------------------------------------------------------------------+
double OnTester()
{
   double trades = TesterStatistics(STAT_TRADES);
   double net    = TesterStatistics(STAT_PROFIT);
   double ddPct  = TesterStatistics(STAT_EQUITY_DDREL_PERCENT);
   double pf     = TesterStatistics(STAT_PROFIT_FACTOR);

   // Require statistically meaningful sample (>= 15 trades) before scoring
   if(trades < 15.0 || net <= 0.0)
      return 0.0;

   return (net * MathMin(pf, 3.0)) / MathMax(1.0, ddPct);
}
//+------------------------------------------------------------------+
