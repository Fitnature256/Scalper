//+------------------------------------------------------------------+
//|                                              ExecutionEngine.mqh |
//|     Slippage-Aware Execution, Stop-Distance & Truth Logger       |
//|     Truth Mode: Never pretend an order filled when it failed.    |
//+------------------------------------------------------------------+
#ifndef __EXECUTION_ENGINE_MQH__
#define __EXECUTION_ENGINE_MQH__

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include "BrokerAdapter.mqh"
#include "ScalpingEngine.mqh"

struct ExecutionTelemetry
{
   bool     executed;
   ulong    dealTicket;
   ulong    orderTicket;
   uint     retcode;
   string   retcodeDescription;
   double   requestedPrice;
   double   filledPrice;
   double   slippagePts;
   string   explanation;
};

struct TruthPerformanceStats
{
   int    totalTrades;
   int    winningTrades;
   int    losingTrades;
   int    rejectedOrders;
   double netProfit;
   double totalFees;       // Commission + Swap
   double totalSlippagePts;
   double avgSlippagePts;
   double actualWinRatePct;
   double maxObservedSpreadPts;
};

struct SymbolCooldown
{
   string   symbol;
   datetime lastBarTime;
};

class CExecutionEngine
{
private:
   CTrade                m_trade;
   CPositionInfo         m_pos;
   ulong                 m_magic;
   int                   m_maxDeviationPts;
   int                   m_cooldownBars;
   int                   m_maxOpenPerSymbol;
   SymbolCooldown        m_cooldowns[];
   TruthPerformanceStats m_stats;

   string RetcodeToString(uint retcode) const
   {
      switch(retcode)
      {
         case TRADE_RETCODE_DONE:           return "DONE";
         case TRADE_RETCODE_DONE_PARTIAL:   return "DONE_PARTIAL";
         case TRADE_RETCODE_REQUOTE:        return "REQUOTE";
         case TRADE_RETCODE_REJECT:         return "REJECTED";
         case TRADE_RETCODE_INVALID_PRICE:  return "INVALID_PRICE";
         case TRADE_RETCODE_INVALID_STOPS:  return "INVALID_STOPS";
         case TRADE_RETCODE_INVALID_VOLUME: return "INVALID_VOLUME";
         case TRADE_RETCODE_MARKET_CLOSED:  return "MARKET_CLOSED";
         case TRADE_RETCODE_NO_MONEY:       return "INSUFFICIENT_MARGIN";
         case TRADE_RETCODE_TOO_MANY_REQUESTS: return "TOO_MANY_REQUESTS";
         case TRADE_RETCODE_CONNECTION:     return "NO_CONNECTION";
         default:                           return StringFormat("RETCODE_%u", retcode);
      }
   }

   bool ValidateStopsDistance(const SymbolSpecs &specs, ENUM_SIGNAL_DIRECTION dir, double price, double sl, double tp, string &outReason) const
   {
      double minStopDist   = (double)specs.stopsLevelPts * specs.point;
      double freezeDist    = (double)specs.freezeLevelPts * specs.point;
      double requiredDist  = MathMax(minStopDist, freezeDist) + specs.point;

      if(dir == SIGNAL_BUY)
      {
         if((price - sl) < requiredDist)
         {
            outReason = StringFormat("BUY SL distance %.5f < broker minimum %.5f (StopsLevel=%d)", price - sl, requiredDist, specs.stopsLevelPts);
            return false;
         }
         if((tp - price) < requiredDist)
         {
            outReason = StringFormat("BUY TP distance %.5f < broker minimum %.5f (StopsLevel=%d)", tp - price, requiredDist, specs.stopsLevelPts);
            return false;
         }
      }
      else if(dir == SIGNAL_SELL)
      {
         if((sl - price) < requiredDist)
         {
            outReason = StringFormat("SELL SL distance %.5f < broker minimum %.5f (StopsLevel=%d)", sl - price, requiredDist, specs.stopsLevelPts);
            return false;
         }
         if((price - tp) < requiredDist)
         {
            outReason = StringFormat("SELL TP distance %.5f < broker minimum %.5f (StopsLevel=%d)", price - tp, requiredDist, specs.stopsLevelPts);
            return false;
         }
      }
      return true;
   }

   bool IsCooldownActive(const string symbol)
   {
      datetime barTime = iTime(symbol, PERIOD_M5, 0);
      for(int i = 0; i < ArraySize(m_cooldowns); i++)
      {
         if(m_cooldowns[i].symbol == symbol)
         {
            long elapsedBars = (long)((barTime - m_cooldowns[i].lastBarTime) / PeriodSeconds(PERIOD_M5));
            return (elapsedBars < m_cooldownBars);
         }
      }
      return false;
   }

   void StampCooldown(const string symbol)
   {
      datetime barTime = iTime(symbol, PERIOD_M5, 0);
      for(int i = 0; i < ArraySize(m_cooldowns); i++)
      {
         if(m_cooldowns[i].symbol == symbol)
         {
            m_cooldowns[i].lastBarTime = barTime;
            return;
         }
      }
      int n = ArraySize(m_cooldowns);
      ArrayResize(m_cooldowns, n + 1);
      m_cooldowns[n].symbol      = symbol;
      m_cooldowns[n].lastBarTime = barTime;
   }

public:
   CExecutionEngine()
   {
      m_magic            = 20260501;
      m_maxDeviationPts  = 15;
      m_cooldownBars     = 2;
      m_maxOpenPerSymbol = 1;
      ZeroMemory(m_stats);
   }

   void Initialize(ulong magic, int maxDeviationPts, int cooldownBars, int maxOpenPerSymbol)
   {
      m_magic            = magic;
      m_maxDeviationPts  = MathMax(3, maxDeviationPts);
      m_cooldownBars     = MathMax(1, cooldownBars);
      m_maxOpenPerSymbol = MathMax(1, maxOpenPerSymbol);
      m_trade.SetExpertMagicNumber(m_magic);
      m_trade.SetDeviationInPoints(m_maxDeviationPts);
      ZeroMemory(m_stats);
   }

   int CountOpenPositions(const string symbol = "")
   {
      int count = 0;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         if(m_pos.SelectByIndex(i))
         {
            if(m_pos.Magic() != m_magic) continue;
            if(symbol == "" || m_pos.Symbol() == symbol)
               count++;
         }
      }
      return count;
   }

   bool HasOppositeOrDuplicatePosition(const string symbol, ENUM_SIGNAL_DIRECTION dir)
   {
      int openCount = 0;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         if(m_pos.SelectByIndex(i))
         {
            if(m_pos.Magic() != m_magic || m_pos.Symbol() != symbol)
               continue;
            openCount++;
            if(openCount >= m_maxOpenPerSymbol)
               return true;
            if(dir == SIGNAL_BUY && m_pos.PositionType() == POSITION_TYPE_BUY)
               return true;
            if(dir == SIGNAL_SELL && m_pos.PositionType() == POSITION_TYPE_SELL)
               return true;
         }
      }
      return false;
   }

   bool ExecuteSignal(const SymbolSpecs &specs, const ScalpingSignal &signal, double lotSize, ExecutionTelemetry &outTel)
   {
      ZeroMemory(outTel);
      if(signal.direction == SIGNAL_NONE)
      {
         outTel.executed    = false;
         outTel.explanation = "No actionable signal.";
         return false;
      }

      if((double)specs.currentSpreadPts > m_stats.maxObservedSpreadPts)
         m_stats.maxObservedSpreadPts = (double)specs.currentSpreadPts;

      if(IsCooldownActive(specs.brokerSymbol))
      {
         outTel.executed    = false;
         outTel.explanation = "Excessive trading guard: Symbol cooldown active.";
         return false;
      }

      if(HasOppositeOrDuplicatePosition(specs.brokerSymbol, signal.direction))
      {
         outTel.executed    = false;
         outTel.explanation = "Duplicate order guard: Open position already exists on symbol.";
         return false;
      }

      MqlTick tick;
      if(!SymbolInfoTick(specs.brokerSymbol, tick))
      {
         outTel.executed    = false;
         outTel.explanation = "Tick quote unavailable at execution time.";
         m_stats.rejectedOrders++;
         return false;
      }

      double reqPrice = (signal.direction == SIGNAL_BUY) ? tick.ask : tick.bid;
      string stopErr  = "";
      if(!ValidateStopsDistance(specs, signal.direction, reqPrice, signal.stopLoss, signal.takeProfit, stopErr))
      {
         outTel.executed    = false;
         outTel.explanation = "Pre-trade Stop Validation Failed: " + stopErr;
         m_stats.rejectedOrders++;
         return false;
      }

      MqlTradeRequest req;
      MqlTradeResult  res;
      MqlTradeCheckResult chk;
      ZeroMemory(req);
      ZeroMemory(res);
      ZeroMemory(chk);

      req.action       = TRADE_ACTION_DEAL;
      req.symbol       = specs.brokerSymbol;
      req.volume       = lotSize;
      req.type         = (signal.direction == SIGNAL_BUY) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      req.price        = NormalizeDouble(reqPrice, specs.digits);
      req.sl           = NormalizeDouble(signal.stopLoss, specs.digits);
      req.tp           = NormalizeDouble(signal.takeProfit, specs.digits);
      req.deviation    = (ulong)m_maxDeviationPts;
      req.magic        = m_magic;
      req.type_filling = specs.fillingMode;
      req.comment      = "AegisScalper";

      if(!OrderCheck(req, chk))
      {
         outTel.executed           = false;
         outTel.retcode            = chk.retcode;
         outTel.retcodeDescription = RetcodeToString(chk.retcode);
         outTel.explanation        = StringFormat("OrderCheck failed [%s]: %s", outTel.retcodeDescription, chk.comment);
         m_stats.rejectedOrders++;
         return false;
      }

      // Execute with at most 1 retry only on transient requote
      bool sent = OrderSend(req, res);
      if(!sent && res.retcode == TRADE_RETCODE_REQUOTE)
      {
         if(SymbolInfoTick(specs.brokerSymbol, tick))
         {
            req.price = NormalizeDouble((signal.direction == SIGNAL_BUY) ? tick.ask : tick.bid, specs.digits);
            sent = OrderSend(req, res);
         }
      }

      outTel.retcode            = res.retcode;
      outTel.retcodeDescription = RetcodeToString(res.retcode);
      outTel.requestedPrice     = req.price;
      outTel.filledPrice        = res.price;
      outTel.orderTicket        = res.order;
      outTel.dealTicket         = res.deal;

      if(sent && (res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_DONE_PARTIAL))
      {
         double actualFill = (res.price > 0.0) ? res.price : req.price;
         double slipPts    = MathAbs(actualFill - req.price) / specs.point;
         outTel.filledPrice = actualFill;
         outTel.slippagePts = slipPts;
         outTel.executed    = true;
         outTel.explanation = StringFormat("Filled %.2f lots @ %.5f (req %.5f, slip %.1f pts).", lotSize, actualFill, req.price, slipPts);

         m_stats.totalSlippagePts += slipPts;
         StampCooldown(specs.brokerSymbol);
         return true;
      }

      // Truth Mode: Explicit failure recording — never mask failed execution
      outTel.executed    = false;
      outTel.explanation = StringFormat("OrderSend failed [%s]: %s", outTel.retcodeDescription, res.comment);
      m_stats.rejectedOrders++;
      return false;
   }

   void ManageTrailingStops(const SymbolSpecs &specs, double atrValue, double trailAtrMult, double breakevenAtrMult)
   {
      if(atrValue <= 0.0) return;

      MqlTick tick;
      if(!SymbolInfoTick(specs.brokerSymbol, tick)) return;

      double minStopDist = (double)MathMax(specs.stopsLevelPts, specs.freezeLevelPts) * specs.point + specs.point;
      double trailDist   = MathMax(minStopDist, atrValue * trailAtrMult);
      double beTrigger   = MathMax(minStopDist, atrValue * breakevenAtrMult);

      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         if(!m_pos.SelectByIndex(i)) continue;
         if(m_pos.Magic() != m_magic || m_pos.Symbol() != specs.brokerSymbol) continue;

         double openPrice = m_pos.PriceOpen();
         double curSl     = m_pos.StopLoss();
         double curTp     = m_pos.TakeProfit();

         if(m_pos.PositionType() == POSITION_TYPE_BUY)
         {
            double profitDist = tick.bid - openPrice;
            if(profitDist < beTrigger) continue;

            double newSl = NormalizeDouble(MathMax(openPrice + specs.point * 2.0, tick.bid - trailDist), specs.digits);
            if(newSl > curSl + specs.point && (tick.bid - newSl) >= minStopDist)
            {
               m_trade.PositionModify(m_pos.Ticket(), newSl, curTp);
            }
         }
         else if(m_pos.PositionType() == POSITION_TYPE_SELL)
         {
            double profitDist = openPrice - tick.ask;
            if(profitDist < beTrigger) continue;

            double candidateSl = NormalizeDouble(MathMin(openPrice - specs.point * 2.0, tick.ask + trailDist), specs.digits);
            if((curSl == 0.0 || candidateSl < curSl - specs.point) && (candidateSl - tick.ask) >= minStopDist)
            {
               m_trade.PositionModify(m_pos.Ticket(), candidateSl, curTp);
            }
         }
      }
   }

   int CloseAllPositions()
   {
      int closed = 0;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         if(m_pos.SelectByIndex(i))
         {
            if(m_pos.Magic() == m_magic)
            {
               if(m_trade.PositionClose(m_pos.Ticket()))
                  closed++;
            }
         }
      }
      return closed;
   }

   int CloseAllProfitableNow(double &outLockedProfit)
   {
      int closed = 0;
      outLockedProfit = 0.0;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         if(m_pos.SelectByIndex(i))
         {
            if(m_pos.Magic() != m_magic) continue;
            double netFloat = m_pos.Profit() + m_pos.Swap() + m_pos.Commission();
            if(netFloat > 0.0)
            {
               if(m_trade.PositionClose(m_pos.Ticket()))
               {
                  closed++;
                  outLockedProfit += netFloat;
               }
            }
         }
      }
      return closed;
   }

   int CheckAndAutoCloseProfits(double targetProfitMoney, double &outLockedProfit)
   {
      outLockedProfit = 0.0;
      if(targetProfitMoney <= 0.0) return 0;

      double totalNetProfit = 0.0;
      int profitCount = 0;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         if(m_pos.SelectByIndex(i))
         {
            if(m_pos.Magic() != m_magic) continue;
            double netFloat = m_pos.Profit() + m_pos.Swap() + m_pos.Commission();
            if(netFloat > 0.0)
            {
               totalNetProfit += netFloat;
               profitCount++;
            }
         }
      }

      if(profitCount > 0 && totalNetProfit >= targetProfitMoney)
         return CloseAllProfitableNow(outLockedProfit);

      return 0;
   }

   void RecordClosedDeal(double profit, double commission, double swap)
   {
      double net = profit + commission + swap;
      m_stats.totalTrades++;
      m_stats.netProfit += net;
      m_stats.totalFees += (commission + swap);

      if(net >= 0.0) m_stats.winningTrades++;
      else           m_stats.losingTrades++;

      if(m_stats.totalTrades > 0)
      {
         m_stats.actualWinRatePct = (double)m_stats.winningTrades / (double)m_stats.totalTrades * 100.0;
         m_stats.avgSlippagePts   = m_stats.totalSlippagePts / (double)m_stats.totalTrades;
      }
   }

   TruthPerformanceStats GetStats() const { return m_stats; }
};

#endif
