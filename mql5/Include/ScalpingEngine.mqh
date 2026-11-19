//+------------------------------------------------------------------+
//|                                               ScalpingEngine.mqh |
//|     Multi-Indicator, Multi-Timeframe Intelligent Scalping Engine |
//|     Note: MT5 cannot guarantee sub-2s execution; logic uses      |
//|     verified M1/M5/M15/M30/H1 bar & tick confirmation.           |
//+------------------------------------------------------------------+
#ifndef __SCALPING_ENGINE_MQH__
#define __SCALPING_ENGINE_MQH__

#include "BrokerAdapter.mqh"

enum ENUM_SIGNAL_DIRECTION
{
   SIGNAL_NONE = 0,
   SIGNAL_BUY  = 1,
   SIGNAL_SELL = -1
};

struct TimeframeSnapshot
{
   ENUM_TIMEFRAMES timeframe;
   double          ema9;
   double          ema21;
   double          rsi;
   double          atr;
   double          macdMain;
   double          macdSignal;
   double          adxMain;
   double          plusDI;
   double          minusDI;
   int             trendBias;       // +1 bullish, -1 bearish, 0 neutral
   bool            valid;
};

struct ScalpingSignal
{
   string                symbol;
   ENUM_SIGNAL_DIRECTION direction;
   double                entryPrice;
   double                stopLoss;
   double                takeProfit;
   double                atrValue;
   double                confidenceScore; // Internal confluence count (out of 7 checks), not a profit promise
   int                   confluenceChecksPassed;
   bool                  liquiditySweepDetected;
   bool                  structureAligned;
   bool                  volatilityOptimal;
   string                technicalExplanation;
   datetime              signalTime;
};

struct IndicatorHandleSet
{
   string          symbol;
   ENUM_TIMEFRAMES tf;
   int             hEma9;
   int             hEma21;
   int             hRsi;
   int             hAtr;
   int             hMacd;
   int             hAdx;
};

class CScalpingEngine
{
private:
   IndicatorHandleSet m_handles[];
   double             m_atrSlMultiplier;
   double             m_atrTpMultiplier;
   double             m_adxMinThreshold;
   bool               m_enableUltraShortM1;

   int FindOrCreateHandles(const string symbol, ENUM_TIMEFRAMES tf)
   {
      for(int i = 0; i < ArraySize(m_handles); i++)
      {
         if(m_handles[i].symbol == symbol && m_handles[i].tf == tf)
            return i;
      }

      IndicatorHandleSet set;
      set.symbol = symbol;
      set.tf     = tf;
      set.hEma9  = iMA(symbol, tf, 9, 0, MODE_EMA, PRICE_CLOSE);
      set.hEma21 = iMA(symbol, tf, 21, 0, MODE_EMA, PRICE_CLOSE);
      set.hRsi   = iRSI(symbol, tf, 14, PRICE_CLOSE);
      set.hAtr   = iATR(symbol, tf, 14);
      set.hMacd  = iMACD(symbol, tf, 12, 26, 9, PRICE_CLOSE);
      set.hAdx   = iADX(symbol, tf, 14);

      if(set.hEma9 == INVALID_HANDLE || set.hEma21 == INVALID_HANDLE ||
         set.hRsi  == INVALID_HANDLE || set.hAtr   == INVALID_HANDLE ||
         set.hMacd == INVALID_HANDLE || set.hAdx   == INVALID_HANDLE)
      {
         ReleaseSet(set);
         return -1;
      }

      int idx = ArraySize(m_handles);
      ArrayResize(m_handles, idx + 1);
      m_handles[idx] = set;
      return idx;
   }

   void ReleaseSet(IndicatorHandleSet &set)
   {
      if(set.hEma9  != INVALID_HANDLE) IndicatorRelease(set.hEma9);
      if(set.hEma21 != INVALID_HANDLE) IndicatorRelease(set.hEma21);
      if(set.hRsi   != INVALID_HANDLE) IndicatorRelease(set.hRsi);
      if(set.hAtr   != INVALID_HANDLE) IndicatorRelease(set.hAtr);
      if(set.hMacd  != INVALID_HANDLE) IndicatorRelease(set.hMacd);
      if(set.hAdx   != INVALID_HANDLE) IndicatorRelease(set.hAdx);
   }

   bool ReadBufferValue(int handle, int bufferNum, int shift, double &outVal)
   {
      double buf[1];
      if(CopyBuffer(handle, bufferNum, shift, 1, buf) <= 0)
         return false;
      outVal = buf[0];
      return MathIsValidNumber(outVal);
   }

   bool CaptureSnapshot(const string symbol, ENUM_TIMEFRAMES tf, TimeframeSnapshot &snap)
   {
      ZeroMemory(snap);
      snap.timeframe = tf;

      int idx = FindOrCreateHandles(symbol, tf);
      if(idx < 0) return false;

      if(BarsCalculated(m_handles[idx].hEma9) < 30 || BarsCalculated(m_handles[idx].hAdx) < 30)
         return false;

      // Read closed candle [1] to prevent intra-bar repainting
      if(!ReadBufferValue(m_handles[idx].hEma9,  0, 1, snap.ema9))       return false;
      if(!ReadBufferValue(m_handles[idx].hEma21, 0, 1, snap.ema21))      return false;
      if(!ReadBufferValue(m_handles[idx].hRsi,   0, 1, snap.rsi))        return false;
      if(!ReadBufferValue(m_handles[idx].hAtr,   0, 1, snap.atr))        return false;
      if(!ReadBufferValue(m_handles[idx].hMacd,  0, 1, snap.macdMain))   return false;
      if(!ReadBufferValue(m_handles[idx].hMacd,  1, 1, snap.macdSignal)) return false;
      if(!ReadBufferValue(m_handles[idx].hAdx,   0, 1, snap.adxMain))    return false;
      if(!ReadBufferValue(m_handles[idx].hAdx,   1, 1, snap.plusDI))     return false;
      if(!ReadBufferValue(m_handles[idx].hAdx,   2, 1, snap.minusDI))    return false;

      if(snap.ema9 > snap.ema21 && snap.macdMain > snap.macdSignal && snap.plusDI > snap.minusDI)
         snap.trendBias = 1;
      else if(snap.ema9 < snap.ema21 && snap.macdMain < snap.macdSignal && snap.minusDI > snap.plusDI)
         snap.trendBias = -1;
      else
         snap.trendBias = 0;

      snap.valid = true;
      return true;
   }

   // Detect swing S/R, market structure (HH/HL vs LH/LL), and liquidity sweeps over recent bars
   void AnalyzeStructureAndLiquidity(const string symbol, ENUM_TIMEFRAMES tf,
                                     double &outSupport, double &outResistance,
                                     int &outStructureDir, bool &outSweepBull, bool &outSweepBear,
                                     bool &outBullPA, bool &outBearPA)
   {
      outSupport      = 0.0;
      outResistance   = 0.0;
      outStructureDir = 0;
      outSweepBull    = false;
      outSweepBear    = false;
      outBullPA       = false;
      outBearPA       = false;

      MqlRates rates[];
      ArraySetAsSeries(rates, true);
      int copied = CopyRates(symbol, tf, 0, 40, rates);
      if(copied < 25) return;

      double recentHigh = rates[2].high;
      double recentLow  = rates[2].low;
      for(int i = 2; i < 22; i++)
      {
         if(rates[i].high > recentHigh) recentHigh = rates[i].high;
         if(rates[i].low  < recentLow)  recentLow  = rates[i].low;
      }

      double priorHigh = rates[22].high;
      double priorLow  = rates[22].low;
      for(int i = 22; i < copied; i++)
      {
         if(rates[i].high > priorHigh) priorHigh = rates[i].high;
         if(rates[i].low  < priorLow)  priorLow  = rates[i].low;
      }

      outSupport    = recentLow;
      outResistance = recentHigh;

      if(recentHigh > priorHigh && recentLow > priorLow)      outStructureDir = 1;
      else if(recentHigh < priorHigh && recentLow < priorLow) outStructureDir = -1;

      // Liquidity sweep: bar[1] pierced equal/prior swing extreme then closed back inside
      MqlRates c1 = rates[1];
      MqlRates c2 = rates[2];
      double body1 = MathAbs(c1.close - c1.open);
      double lowerWick1 = MathMin(c1.open, c1.close) - c1.low;
      double upperWick1 = c1.high - MathMax(c1.open, c1.close);

      if(c1.low < recentLow && c1.close > recentLow && lowerWick1 > body1 * 1.1)
         outSweepBull = true;
      if(c1.high > recentHigh && c1.close < recentHigh && upperWick1 > body1 * 1.1)
         outSweepBear = true;

      // Price action: Bullish/Bearish engulfing or rejection pin bar
      bool bullEngulf = (c2.close < c2.open && c1.close > c1.open && c1.close > c2.open && c1.open <= c2.close);
      bool bearEngulf = (c2.close > c2.open && c1.close < c1.open && c1.close < c2.open && c1.open >= c2.close);
      bool bullPin    = (lowerWick1 > body1 * 1.8 && c1.close > c1.open);
      bool bearPin    = (upperWick1 > body1 * 1.8 && c1.close < c1.open);

      outBullPA = (bullEngulf || bullPin);
      outBearPA = (bearEngulf || bearPin);
   }

   bool CheckVolatilityOptimal(const string symbol, ENUM_TIMEFRAMES tf, double currentAtr)
   {
      int idx = FindOrCreateHandles(symbol, tf);
      if(idx < 0 || currentAtr <= 0.0) return false;

      double atrHist[];
      ArraySetAsSeries(atrHist, true);
      if(CopyBuffer(m_handles[idx].hAtr, 0, 1, 20, atrHist) < 20)
         return false;

      double sum = 0.0;
      for(int i = 0; i < 20; i++) sum += atrHist[i];
      double avgAtr = sum / 20.0;
      if(avgAtr <= 0.0) return false;

      // Reject dead flat market (< 0.65x avg ATR) or abnormal flash shock (> 2.4x avg ATR)
      double ratio = currentAtr / avgAtr;
      return (ratio >= 0.65 && ratio <= 2.40);
   }

public:
   CScalpingEngine()
   {
      m_atrSlMultiplier    = 1.5;
      m_atrTpMultiplier    = 2.2;
      m_adxMinThreshold    = 18.0;
      m_enableUltraShortM1 = false;
   }

   ~CScalpingEngine()
   {
      ReleaseAll();
   }

   void Configure(double atrSlMult, double atrTpMult, double adxMin, bool allowM1UltraShort)
   {
      m_atrSlMultiplier    = atrSlMult;
      m_atrTpMultiplier    = atrTpMult;
      m_adxMinThreshold    = adxMin;
      m_enableUltraShortM1 = allowM1UltraShort;
   }

   void ReleaseAll()
   {
      for(int i = 0; i < ArraySize(m_handles); i++)
         ReleaseSet(m_handles[i]);
      ArrayResize(m_handles, 0);
   }

   bool EvaluateSymbol(const SymbolSpecs &specs, ScalpingSignal &outSignal)
   {
      ZeroMemory(outSignal);
      outSignal.symbol     = specs.brokerSymbol;
      outSignal.direction  = SIGNAL_NONE;
      outSignal.signalTime = TimeCurrent();

      if(!specs.available)
      {
         outSignal.technicalExplanation = "Rejected: Symbol unavailable or trade mode restricted.";
         return false;
      }

      // Capture multi-timeframe snapshots: M1, M5, M15, M30, H1
      TimeframeSnapshot m1, m5, m15, m30, h1;
      bool okM5  = CaptureSnapshot(specs.brokerSymbol, PERIOD_M5,  m5);
      bool okM15 = CaptureSnapshot(specs.brokerSymbol, PERIOD_M15, m15);
      bool okM30 = CaptureSnapshot(specs.brokerSymbol, PERIOD_M30, m30);
      bool okH1  = CaptureSnapshot(specs.brokerSymbol, PERIOD_H1,  h1);
      bool okM1  = m_enableUltraShortM1 ? CaptureSnapshot(specs.brokerSymbol, PERIOD_M1, m1) : false;

      if(!okM5 || !okM15 || !okM30 || !okH1)
      {
         outSignal.technicalExplanation = "Pending: Insufficient multi-timeframe bar history (M5/M15/M30/H1).";
         return false;
      }

      ENUM_TIMEFRAMES execTf = (m_enableUltraShortM1 && okM1) ? PERIOD_M1 : PERIOD_M5;
      TimeframeSnapshot execSnap = (execTf == PERIOD_M1) ? m1 : m5;

      // Macro bias across M15 + M30 + H1
      int macroScore = m15.trendBias + m30.trendBias + h1.trendBias;

      double sup = 0.0, res = 0.0;
      int structDir = 0;
      bool sweepBull = false, sweepBear = false, paBull = false, paBear = false;
      AnalyzeStructureAndLiquidity(specs.brokerSymbol, PERIOD_M15, sup, res, structDir, sweepBull, sweepBear, paBull, paBear);

      bool volOk = CheckVolatilityOptimal(specs.brokerSymbol, execTf, execSnap.atr);
      outSignal.volatilityOptimal = volOk;
      outSignal.atrValue          = execSnap.atr;

      if(!volOk)
      {
         outSignal.technicalExplanation = StringFormat("Standby: Volatility outside optimal ATR band (ATR=%.5f).", execSnap.atr);
         return false;
      }

      MqlTick tick;
      if(!SymbolInfoTick(specs.brokerSymbol, tick))
      {
         outSignal.technicalExplanation = "Rejected: Unable to read live tick quote.";
         return false;
      }

      // Evaluate BUY vs SELL confluence (7 explicit technical checks)
      int buyChecks  = 0;
      int sellChecks = 0;

      if(execSnap.ema9 > execSnap.ema21) buyChecks++;
      if(execSnap.ema9 < execSnap.ema21) sellChecks++;

      if(execSnap.rsi > 45.0 && execSnap.rsi < 72.0) buyChecks++;
      if(execSnap.rsi < 55.0 && execSnap.rsi > 28.0) sellChecks++;

      if(execSnap.macdMain > execSnap.macdSignal) buyChecks++;
      if(execSnap.macdMain < execSnap.macdSignal) sellChecks++;

      if(execSnap.adxMain >= m_adxMinThreshold && execSnap.plusDI > execSnap.minusDI) buyChecks++;
      if(execSnap.adxMain >= m_adxMinThreshold && execSnap.minusDI > execSnap.plusDI) sellChecks++;

      if(macroScore >= 2)  buyChecks++;
      if(macroScore <= -2) sellChecks++;

      if(structDir >= 0 && (paBull || sweepBull)) buyChecks++;
      if(structDir <= 0 && (paBear || sweepBear)) sellChecks++;

      // S/R clearance check
      double minStopDist = MathMax((double)specs.stopsLevelPts * specs.point, execSnap.atr * m_atrSlMultiplier);
      double tpDist      = MathMax(minStopDist * 1.4, execSnap.atr * m_atrTpMultiplier);

      if(tick.ask > sup && (res - tick.ask) >= tpDist * 0.6) buyChecks++;
      if(tick.bid < res && (tick.bid - sup) >= tpDist * 0.6) sellChecks++;

      if(buyChecks >= 6 && sellChecks < 4)
      {
         outSignal.direction              = SIGNAL_BUY;
         outSignal.entryPrice             = NormalizeDouble(tick.ask, specs.digits);
         outSignal.stopLoss               = NormalizeDouble(tick.ask - minStopDist, specs.digits);
         outSignal.takeProfit             = NormalizeDouble(tick.ask + tpDist, specs.digits);
         outSignal.confluenceChecksPassed = buyChecks;
         outSignal.confidenceScore        = (double)buyChecks / 7.0 * 100.0;
         outSignal.liquiditySweepDetected = sweepBull;
         outSignal.structureAligned       = (structDir >= 0);
         outSignal.technicalExplanation   = StringFormat(
            "BUY [%s] %d/7 checks: EMA9(%.5f)>EMA21(%.5f), RSI=%.1f, MACD>Sig, ADX=%.1f(+DI> -DI), M15-H1 bias=%+d, ATR=%.5f, S/R=%.5f/%.5f%s.",
            EnumToString(execTf), buyChecks, execSnap.ema9, execSnap.ema21, execSnap.rsi,
            execSnap.adxMain, macroScore, execSnap.atr, sup, res,
            sweepBull ? ", Bullish Liquidity Sweep" : ""
         );
         return true;
      }

      if(sellChecks >= 6 && buyChecks < 4)
      {
         outSignal.direction              = SIGNAL_SELL;
         outSignal.entryPrice             = NormalizeDouble(tick.bid, specs.digits);
         outSignal.stopLoss               = NormalizeDouble(tick.bid + minStopDist, specs.digits);
         outSignal.takeProfit             = NormalizeDouble(tick.bid - tpDist, specs.digits);
         outSignal.confluenceChecksPassed = sellChecks;
         outSignal.confidenceScore        = (double)sellChecks / 7.0 * 100.0;
         outSignal.liquiditySweepDetected = sweepBear;
         outSignal.structureAligned       = (structDir <= 0);
         outSignal.technicalExplanation   = StringFormat(
            "SELL [%s] %d/7 checks: EMA9(%.5f)<EMA21(%.5f), RSI=%.1f, MACD<Sig, ADX=%.1f(-DI>+DI), M15-H1 bias=%+d, ATR=%.5f, S/R=%.5f/%.5f%s.",
            EnumToString(execTf), sellChecks, execSnap.ema9, execSnap.ema21, execSnap.rsi,
            execSnap.adxMain, macroScore, execSnap.atr, sup, res,
            sweepBear ? ", Bearish Liquidity Sweep" : ""
         );
         return true;
      }

      outSignal.confluenceChecksPassed = MathMax(buyChecks, sellChecks);
      outSignal.technicalExplanation   = StringFormat(
         "WAIT: Confluence insufficient (Buy=%d/7, Sell=%d/7). EMA9=%.5f EMA21=%.5f RSI=%.1f ADX=%.1f M15-H1=%+d.",
         buyChecks, sellChecks, execSnap.ema9, execSnap.ema21, execSnap.rsi, execSnap.adxMain, macroScore
      );
      return false;
   }
};

#endif
