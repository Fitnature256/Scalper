//+------------------------------------------------------------------+
//|                                               ControlPanelUI.mqh |
//|     On-Chart Native MT5 Control Panel & Truth Mode Dashboard     |
//+------------------------------------------------------------------+
#ifndef __CONTROL_PANEL_UI_MQH__
#define __CONTROL_PANEL_UI_MQH__

#include "BrokerAdapter.mqh"
#include "RiskManager.mqh"
#include "ExecutionEngine.mqh"

enum ENUM_OPERATING_MODE
{
   MODE_AUTO_TRADING = 0,
   MODE_MANUAL_SIGNALS_ONLY
};

class CControlPanelUI
{
private:
   string m_prefix;
   int    m_x;
   int    m_y;

   void CreateLabel(const string name, int x, int y, const string text, color clr, int fontSize = 9, bool bold = false)
   {
      string obj = m_prefix + name;
      if(ObjectFind(0, obj) < 0)
         ObjectCreate(0, obj, OBJ_LABEL, 0, 0, 0);

      ObjectSetInteger(0, obj, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, obj, OBJPROP_XDISTANCE, x);
      ObjectSetInteger(0, obj, OBJPROP_YDISTANCE, y);
      ObjectSetString(0, obj, OBJPROP_TEXT, text);
      ObjectSetString(0, obj, OBJPROP_FONT, bold ? "Consolas Bold" : "Consolas");
      ObjectSetInteger(0, obj, OBJPROP_FONTSIZE, fontSize);
      ObjectSetInteger(0, obj, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, obj, OBJPROP_SELECTABLE, false);
   }

   void CreateButton(const string name, int x, int y, int w, int h, const string text, color bg, color fg)
   {
      string obj = m_prefix + name;
      if(ObjectFind(0, obj) < 0)
         ObjectCreate(0, obj, OBJ_BUTTON, 0, 0, 0);

      ObjectSetInteger(0, obj, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, obj, OBJPROP_XDISTANCE, x);
      ObjectSetInteger(0, obj, OBJPROP_YDISTANCE, y);
      ObjectSetInteger(0, obj, OBJPROP_XSIZE, w);
      ObjectSetInteger(0, obj, OBJPROP_YSIZE, h);
      ObjectSetString(0, obj, OBJPROP_TEXT, text);
      ObjectSetString(0, obj, OBJPROP_FONT, "Consolas Bold");
      ObjectSetInteger(0, obj, OBJPROP_FONTSIZE, 8);
      ObjectSetInteger(0, obj, OBJPROP_BGCOLOR, bg);
      ObjectSetInteger(0, obj, OBJPROP_COLOR, fg);
      ObjectSetInteger(0, obj, OBJPROP_BORDER_COLOR, clrSlateGray);
      ObjectSetInteger(0, obj, OBJPROP_STATE, false);
   }

   void CreatePanelBackground(int w, int h)
   {
      string obj = m_prefix + "BG";
      if(ObjectFind(0, obj) < 0)
         ObjectCreate(0, obj, OBJ_RECTANGLE_LABEL, 0, 0, 0);

      ObjectSetInteger(0, obj, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, obj, OBJPROP_XDISTANCE, m_x);
      ObjectSetInteger(0, obj, OBJPROP_YDISTANCE, m_y);
      ObjectSetInteger(0, obj, OBJPROP_XSIZE, w);
      ObjectSetInteger(0, obj, OBJPROP_YSIZE, h);
      ObjectSetInteger(0, obj, OBJPROP_BGCOLOR, C'15,23,42');
      ObjectSetInteger(0, obj, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, obj, OBJPROP_COLOR, C'51,65,85');
      ObjectSetInteger(0, obj, OBJPROP_BACK, false);
      ObjectSetInteger(0, obj, OBJPROP_SELECTABLE, false);
   }

public:
   CControlPanelUI()
   {
      m_prefix = "AEGIS_UI_";
      m_x      = 14;
      m_y      = 24;
   }

   void Destroy()
   {
      ObjectsDeleteAll(0, m_prefix);
      ChartRedraw(0);
   }

   string CurrentTradingSessionUTC() const
   {
      MqlDateTime dt;
      TimeToStruct(TimeGMT(), dt);
      int h = dt.hour;
      if(h >= 7 && h < 12)  return "London Session";
      if(h >= 12 && h < 16) return "London/NY Overlap";
      if(h >= 16 && h < 21) return "New York Session";
      if(h >= 22 || h < 7)  return "Asian Session";
      return "Rollover / Quiet";
   }

   void Render(const BrokerProfile &bp,
               const RiskState &rs,
               const TruthPerformanceStats &stats,
               const string selectedInstrument,
               int currentSpreadPts,
               int openPositions,
               const string latestSignalSummary,
               ENUM_OPERATING_MODE opMode,
               bool demoValidated,
               double cycleDurationMs = 0.0,
               double latencyThresholdMs = 50.0)
   {
      if(MQLInfoInteger(MQL_TESTER) && !MQLInfoInteger(MQL_VISUAL_MODE))
         return;

      CreatePanelBackground(460, 376);
      int x = m_x + 12;
      int y = m_y + 10;

      string envLabel = MQLInfoInteger(MQL_TESTER) ? "BACKTEST" : (bp.isDemoAccount ? "DEMO MODE" : "LIVE MODE");
      color  envColor = MQLInfoInteger(MQL_TESTER) ? clrGold : (bp.isDemoAccount ? clrDeepSkyBlue : clrOrangeRed);

      CreateLabel("TITLE", x, y, "AEGIS MT5 UNIVERSAL SCALPER  [TRUTH MODE]", clrWhite, 10, true);
      y += 20;
      CreateLabel("ENV", x, y, StringFormat("Environment: %s | Mode: %s", envLabel, (opMode == MODE_AUTO_TRADING ? "AUTO" : "MANUAL")), envColor, 9, true);
      y += 18;
      CreateLabel("BRK", x, y, StringFormat("Broker: %s (%s) | Suffix: '%s'", bp.detectedBrokerLabel, (bp.accountTier == TIER_RAW_SPREAD ? "Raw" : (bp.accountTier == TIER_ECN ? "ECN" : (bp.accountTier == TIER_CENT ? "Cent" : "Std"))), bp.detectedSuffix), clrSilver, 9);
      y += 16;
      CreateLabel("BAL", x, y, StringFormat("Balance: %.2f %s | Equity: %.2f %s", AccountInfoDouble(ACCOUNT_BALANCE), bp.accountCurrency, AccountInfoDouble(ACCOUNT_EQUITY), bp.accountCurrency), clrWhite, 9);
      y += 16;
      CreateLabel("SYM", x, y, StringFormat("Instrument: %s | Spread: %d pts | %s", selectedInstrument, currentSpreadPts, CurrentTradingSessionUTC()), clrSilver, 9);
      y += 16;
      CreateLabel("POS", x, y, StringFormat("Open Pos: %d | Daily P/L: %+.2f | Drawdown: %.2f%%", openPositions, rs.dailyPnL, rs.currentDrawdownPct), (rs.dailyPnL >= 0 ? clrLimeGreen : clrTomato), 9);
      y += 16;
      CreateLabel("STAT", x, y, StringFormat("Trades: %d (W:%d / L:%d) | WinRate: %.1f%% | Rejected: %d", stats.totalTrades, stats.winningTrades, stats.losingTrades, stats.actualWinRatePct, stats.rejectedOrders), clrSilver, 9);
      y += 16;
      CreateLabel("FEES", x, y, StringFormat("Net P/L: %+.2f | Fees: %.2f | Avg Slip: %.2f pts", stats.netProfit, stats.totalFees, stats.avgSlippagePts), clrSilver, 9);
      y += 16;

      bool latencyWarn = (cycleDurationMs > latencyThresholdMs);
      string latTxt = latencyWarn
                      ? StringFormat("LATENCY WARNING: Cycle %.1f ms > %.0f ms threshold", cycleDurationMs, latencyThresholdMs)
                      : StringFormat("Cycle Latency: %.1f ms (Threshold: %.0f ms)", cycleDurationMs, latencyThresholdMs);
      CreateLabel("LAT", x, y, latTxt, (latencyWarn ? clrOrange : clrSilver), 8, latencyWarn);
      y += 18;

      CreateLabel("SIG", x, y, "Signal: " + StringSubstr(latestSignalSummary, 0, 58), clrAqua, 8);
      y += 16;

      string statusTxt = rs.emergencyStopped ? ("EMERGENCY STOP: " + rs.suspensionReason) : (rs.tradingSuspended ? ("SUSPENDED: " + rs.suspensionReason) : (demoValidated || bp.isDemoAccount ? "ACTIVE / MONITORING" : "DEMO VALIDATION REQUIRED"));
      color  statusClr = rs.emergencyStopped ? clrRed : (rs.tradingSuspended ? clrGold : clrLimeGreen);
      CreateLabel("RSTAT", x, y, "Status: " + statusTxt, statusClr, 9, true);
      y += 24;

      CreateButton("BTN_MODE", x,       y, 102, 26, (opMode == MODE_AUTO_TRADING ? "MANUAL" : "AUTO"), C'30,58,138', clrWhite);
      CreateButton("BTN_PROFIT", x + 108, y, 110, 26, "CLOSE PROFITS", C'21,128,61', clrWhite);
      CreateButton("BTN_STOP", x + 224, y, 122, 26, "STOP ALL", C'153,27,27', clrWhite);
      CreateButton("BTN_RESUME", x + 352, y, 86, 26, "RESET", C'51,65,85', clrWhite);

      ChartRedraw(0);
   }

   bool HandleChartEvent(const int id, const string &sparam, ENUM_OPERATING_MODE &opMode, bool &outTriggerEmergencyStop, bool &outResetGuard, bool &outCloseProfits)
   {
      outTriggerEmergencyStop = false;
      outResetGuard           = false;
      outCloseProfits         = false;

      if(id != CHARTEVENT_OBJECT_CLICK)
         return false;

      if(sparam == m_prefix + "BTN_MODE")
      {
         opMode = (opMode == MODE_AUTO_TRADING) ? MODE_MANUAL_SIGNALS_ONLY : MODE_AUTO_TRADING;
         ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
         return true;
      }
      if(sparam == m_prefix + "BTN_PROFIT")
      {
         outCloseProfits = true;
         ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
         return true;
      }
      if(sparam == m_prefix + "BTN_STOP")
      {
         outTriggerEmergencyStop = true;
         ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
         return true;
      }
      if(sparam == m_prefix + "BTN_RESUME")
      {
         outResetGuard = true;
         ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
         return true;
      }
      return false;
   }
};

#endif
