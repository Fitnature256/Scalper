//+------------------------------------------------------------------+
//|                                                  RiskManager.mqh |
//|     Universal Risk, Drawdown, News-Guard & Emergency Circuit     |
//|     Default Risk: 0.5% per trade. Capital preservation first.    |
//+------------------------------------------------------------------+
#ifndef __RISK_MANAGER_MQH__
#define __RISK_MANAGER_MQH__

#include "BrokerAdapter.mqh"

struct RiskState
{
   double   riskPercent;
   bool     useFixedLot;
   double   fixedLotSize;
   double   maxDailyLossPct;
   int      maxDailyTrades;
   double   maxDrawdownPct;
   bool     enableNewsProtection;
   int      newsBufferMinutes;
   bool     emergencyStopped;
   bool     tradingSuspended;
   string   suspensionReason;
   double   peakEquity;
   double   dailyStartBalance;
   int      tradesToday;
   int      lastResetDay;
   double   currentDrawdownPct;
   double   dailyPnL;
};

class CRiskManager
{
private:
   RiskState m_state;

   void RefreshDailyCounters()
   {
      MqlDateTime dt;
      TimeToStruct(TimeCurrent(), dt);
      if(m_state.lastResetDay != dt.day_of_year)
      {
         m_state.lastResetDay      = dt.day_of_year;
         m_state.dailyStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
         m_state.tradesToday       = 0;
      }

      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      if(equity > m_state.peakEquity)
         m_state.peakEquity = equity;

      if(m_state.peakEquity > 0.0)
         m_state.currentDrawdownPct = MathMax(0.0, (m_state.peakEquity - equity) / m_state.peakEquity * 100.0);

      m_state.dailyPnL = equity - m_state.dailyStartBalance;
   }

   bool IsHighImpactNewsWindow(const string brokerSymbol)
   {
      if(!m_state.enableNewsProtection)
         return false;

      // Note: MQL5 Economic Calendar works in Live/Demo terminals; Strategy Tester may return 0 events
      MqlCalendarValue values[];
      datetime from = TimeTradeServer() - m_state.newsBufferMinutes * 60;
      datetime to   = TimeTradeServer() + m_state.newsBufferMinutes * 60;

      ResetLastError();
      int count = CalendarValueHistory(values, from, to);
      if(count <= 0)
         return false;

      string baseCurr  = SymbolInfoString(brokerSymbol, SYMBOL_CURRENCY_BASE);
      string quoteCurr = SymbolInfoString(brokerSymbol, SYMBOL_CURRENCY_PROFIT);

      for(int i = 0; i < count; i++)
      {
         MqlCalendarEvent ev;
         if(!CalendarEventById(values[i].event_id, ev))
            continue;
         if(ev.importance != CALENDAR_IMPORTANCE_HIGH)
            continue;

         MqlCalendarCountry country;
         if(!CalendarCountryById(ev.country_id, country))
            continue;

         if(country.currency == baseCurr || country.currency == quoteCurr || country.currency == "USD")
            return true;
      }
      return false;
   }

public:
   CRiskManager()
   {
      ZeroMemory(m_state);
      m_state.riskPercent          = 0.5;
      m_state.useFixedLot          = false;
      m_state.fixedLotSize         = 0.01;
      m_state.maxDailyLossPct      = 2.0;
      m_state.maxDailyTrades       = 15;
      m_state.maxDrawdownPct       = 5.0;
      m_state.enableNewsProtection = true;
      m_state.newsBufferMinutes    = 15;
   }

   void Initialize(double riskPct, bool useFixedLot, double fixedLot,
                   double maxDailyLossPct, int maxDailyTrades,
                   double maxDrawdownPct, bool newsGuard, int newsMinutes)
   {
      m_state.riskPercent          = MathMax(0.05, MathMin(5.0, riskPct));
      m_state.useFixedLot          = useFixedLot;
      m_state.fixedLotSize         = MathMax(0.01, fixedLot);
      m_state.maxDailyLossPct      = MathMax(0.25, maxDailyLossPct);
      m_state.maxDailyTrades       = MathMax(1, maxDailyTrades);
      m_state.maxDrawdownPct       = MathMax(0.5, maxDrawdownPct);
      m_state.enableNewsProtection = newsGuard;
      m_state.newsBufferMinutes    = MathMax(5, newsMinutes);
      m_state.emergencyStopped     = false;
      m_state.tradingSuspended     = false;
      m_state.suspensionReason     = "";
      m_state.peakEquity           = AccountInfoDouble(ACCOUNT_EQUITY);
      m_state.dailyStartBalance    = AccountInfoDouble(ACCOUNT_BALANCE);
      m_state.tradesToday          = 0;

      MqlDateTime dt;
      TimeToStruct(TimeCurrent(), dt);
      m_state.lastResetDay = dt.day_of_year;
   }

   void TriggerEmergencyStop(const string reason)
   {
      m_state.emergencyStopped = true;
      m_state.tradingSuspended = true;
      m_state.suspensionReason = reason;
   }

   void ClearEmergencyStop()
   {
      m_state.emergencyStopped = false;
      m_state.tradingSuspended = false;
      m_state.suspensionReason = "";
   }

   void IncrementDailyTradeCount()
   {
      m_state.tradesToday++;
   }

   bool CanOpenNewTrade(const SymbolSpecs &specs, string &outDenyReason)
   {
      RefreshDailyCounters();
      outDenyReason = "";

      if(m_state.emergencyStopped)
      {
         outDenyReason = "Emergency Stop Active: " + m_state.suspensionReason;
         return false;
      }

      if(!TerminalInfoInteger(TERMINAL_CONNECTED))
      {
         m_state.tradingSuspended = true;
         m_state.suspensionReason = "Terminal disconnected from broker server";
         outDenyReason = m_state.suspensionReason;
         return false;
      }

      if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !AccountInfoInteger(ACCOUNT_TRADE_EXPERT))
      {
         outDenyReason = "Algo trading disabled in terminal or broker account settings";
         return false;
      }

      if(m_state.currentDrawdownPct >= m_state.maxDrawdownPct)
      {
         m_state.tradingSuspended = true;
         m_state.suspensionReason = StringFormat("Max Drawdown Limit Reached (%.2f%% >= %.2f%%)", m_state.currentDrawdownPct, m_state.maxDrawdownPct);
         outDenyReason = m_state.suspensionReason;
         return false;
      }

      double dailyLossLimit = m_state.dailyStartBalance * (m_state.maxDailyLossPct / 100.0);
      if(m_state.dailyPnL <= -dailyLossLimit)
      {
         m_state.tradingSuspended = true;
         m_state.suspensionReason = StringFormat("Max Daily Loss Limit Hit (%.2f <= -%.2f)", m_state.dailyPnL, dailyLossLimit);
         outDenyReason = m_state.suspensionReason;
         return false;
      }

      if(m_state.tradesToday >= m_state.maxDailyTrades)
      {
         outDenyReason = StringFormat("Max Daily Trades Reached (%d/%d)", m_state.tradesToday, m_state.maxDailyTrades);
         return false;
      }

      // Abnormal market condition: spread spike above adaptive ceiling
      if((double)specs.currentSpreadPts > specs.adaptiveMaxSpreadPts)
      {
         outDenyReason = StringFormat("Abnormal Spread Guard: %d pts > max %.1f pts", specs.currentSpreadPts, specs.adaptiveMaxSpreadPts);
         return false;
      }

      if(IsHighImpactNewsWindow(specs.brokerSymbol))
      {
         outDenyReason = StringFormat("News Protection Active (+/- %d min high-impact event)", m_state.newsBufferMinutes);
         return false;
      }

      m_state.tradingSuspended = false;
      m_state.suspensionReason = "";
      return true;
   }

   double CalculateLotSize(const SymbolSpecs &specs, double entryPrice, double stopLossPrice)
   {
      if(m_state.useFixedLot)
         return NormalizeLot(specs, m_state.fixedLotSize);

      double slDistance = MathAbs(entryPrice - stopLossPrice);
      if(slDistance <= 0.0 || specs.tickSize <= 0.0 || specs.tickValue <= 0.0)
         return specs.minLot;

      double equity     = AccountInfoDouble(ACCOUNT_EQUITY);
      double riskMoney  = equity * (m_state.riskPercent / 100.0);
      double slTicks    = slDistance / specs.tickSize;
      double lossPerLot = slTicks * specs.tickValue;

      if(lossPerLot <= 0.0)
         return specs.minLot;

      double rawLot = riskMoney / lossPerLot;
      return NormalizeLot(specs, rawLot);
   }

   double NormalizeLot(const SymbolSpecs &specs, double lot) const
   {
      double clamped = MathMax(specs.minLot, MathMin(specs.maxLot, lot));
      double stepped = MathFloor(clamped / specs.lotStep) * specs.lotStep;
      int lotDigits  = (specs.lotStep >= 1.0 ? 0 : (specs.lotStep >= 0.1 ? 1 : 2));
      return NormalizeDouble(MathMax(specs.minLot, MathMin(specs.maxLot, stepped)), lotDigits);
   }

   RiskState GetState()
   {
      RefreshDailyCounters();
      return m_state;
   }
};

#endif
