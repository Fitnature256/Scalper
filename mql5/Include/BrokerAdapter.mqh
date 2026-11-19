//+------------------------------------------------------------------+
//|                                                BrokerAdapter.mqh |
//|                     Aegis MT5 Universal Scalper — Broker Layer   |
//|        Truth Mode: Never claim compatibility until verified.     |
//+------------------------------------------------------------------+
#ifndef __BROKER_ADAPTER_MQH__
#define __BROKER_ADAPTER_MQH__

enum ENUM_BROKER_PRESET
{
   BROKER_AUTO_DETECT = 0,
   BROKER_EXNESS,
   BROKER_XM,
   BROKER_DERIV,
   BROKER_IC_MARKETS,
   BROKER_PEPPERSTONE,
   BROKER_HFM,
   BROKER_ROBOFOREX,
   BROKER_FBS,
   BROKER_OCTA,
   BROKER_FXTM,
   BROKER_CUSTOM_OTHER
};

enum ENUM_ACCOUNT_TIER
{
   TIER_AUTO_DETECT = 0,
   TIER_STANDARD,
   TIER_ECN,
   TIER_RAW_SPREAD,
   TIER_CENT
};

enum ENUM_INSTRUMENT_CLASS
{
   CLASS_FOREX = 0,
   CLASS_METALS,
   CLASS_INDICES,
   CLASS_CRYPTO
};

struct BrokerProfile
{
   string              companyName;
   string              serverName;
   string              detectedBrokerLabel;
   ENUM_BROKER_PRESET  brokerPreset;
   ENUM_ACCOUNT_TIER   accountTier;
   string              accountCurrency;
   bool                isCentAccount;
   bool                isDemoAccount;
   bool                isLiveAccount;
   bool                hedgingAllowed;
   int                 leverage;
   double              stopoutLevel;
   string              detectedSuffix;
   bool                technicallyVerified;
   string              verificationNotes;
};

struct SymbolSpecs
{
   string                canonicalName;
   string                brokerSymbol;
   ENUM_INSTRUMENT_CLASS assetClass;
   bool                  available;
   double                point;
   int                   digits;
   double                tickSize;
   double                tickValue;
   double                contractSize;
   double                minLot;
   double                maxLot;
   double                lotStep;
   long                  stopsLevelPts;
   long                  freezeLevelPts;
   int                   currentSpreadPts;
   double                adaptiveMaxSpreadPts;
   ENUM_ORDER_TYPE_FILLING fillingMode;
   ENUM_SYMBOL_TRADE_MODE  tradeMode;
};

class CBrokerAdapter
{
private:
   BrokerProfile m_profile;
   string        m_customBrokerName;
   string        m_manualSuffix;

   string ToUpperSafe(string text)
   {
      StringToUpper(text);
      return text;
   }

   ENUM_BROKER_PRESET MatchBrokerFromStrings(const string company, const string server)
   {
      string combined = ToUpperSafe(company + " " + server);
      if(StringFind(combined, "EXNESS") >= 0)      return BROKER_EXNESS;
      if(StringFind(combined, "XM") >= 0 || StringFind(combined, "TRADING POINT") >= 0) return BROKER_XM;
      if(StringFind(combined, "DERIV") >= 0 || StringFind(combined, "BINARY") >= 0)    return BROKER_DERIV;
      if(StringFind(combined, "IC MARKETS") >= 0 || StringFind(combined, "ICMARKETS") >= 0) return BROKER_IC_MARKETS;
      if(StringFind(combined, "PEPPERSTONE") >= 0) return BROKER_PEPPERSTONE;
      if(StringFind(combined, "HFM") >= 0 || StringFind(combined, "HF MARKETS") >= 0 || StringFind(combined, "HOTFOREX") >= 0) return BROKER_HFM;
      if(StringFind(combined, "ROBOFOREX") >= 0)   return BROKER_ROBOFOREX;
      if(StringFind(combined, "FBS") >= 0)         return BROKER_FBS;
      if(StringFind(combined, "OCTA") >= 0)        return BROKER_OCTA;
      if(StringFind(combined, "FXTM") >= 0 || StringFind(combined, "FOREXTIME") >= 0) return BROKER_FXTM;
      return BROKER_CUSTOM_OTHER;
   }

   string BrokerPresetToString(ENUM_BROKER_PRESET preset)
   {
      switch(preset)
      {
         case BROKER_EXNESS:      return "Exness";
         case BROKER_XM:          return "XM";
         case BROKER_DERIV:       return "Deriv";
         case BROKER_IC_MARKETS:  return "IC Markets";
         case BROKER_PEPPERSTONE: return "Pepperstone";
         case BROKER_HFM:         return "HFM";
         case BROKER_ROBOFOREX:   return "RoboForex";
         case BROKER_FBS:         return "FBS";
         case BROKER_OCTA:        return "Octa";
         case BROKER_FXTM:        return "FXTM";
         case BROKER_CUSTOM_OTHER:return (m_customBrokerName != "" ? m_customBrokerName : "Custom MT5 Broker");
         default:                 return "Auto-Detect";
      }
   }

   ENUM_ACCOUNT_TIER DetectAccountTier(const string server, const string currency, const string suffix)
   {
      string s = ToUpperSafe(server + " " + suffix);
      string c = ToUpperSafe(currency);

      if(c == "USC" || c == "EUC" || c == "GBC" || StringFind(s, "CENT") >= 0 || StringFind(s, "PRO-CENT") >= 0 || StringFind(s, "MICRO") >= 0)
         return TIER_CENT;
      if(StringFind(s, "RAW") >= 0 || StringFind(s, ".R") >= 0 || StringFind(s, "ZERO") >= 0)
         return TIER_RAW_SPREAD;
      if(StringFind(s, "ECN") >= 0 || StringFind(s, "RAZOR") >= 0 || StringFind(s, "PRIME") >= 0)
         return TIER_ECN;

      return TIER_STANDARD;
   }

   string DetectSuffixFromMarketWatch()
   {
      if(m_manualSuffix != "")
         return m_manualSuffix;

      string probeRoots[] = {"EURUSD", "GBPUSD", "USDJPY", "XAUUSD"};
      int total = SymbolsTotal(false);

      for(int r = 0; r < ArraySize(probeRoots); r++)
      {
         string root = probeRoots[r];
         for(int i = 0; i < total; i++)
         {
            string sym = SymbolName(i, false);
            string upper = ToUpperSafe(sym);
            int pos = StringFind(upper, root);
            if(pos == 0 && StringLen(sym) >= StringLen(root))
            {
               string suffix = StringSubstr(sym, StringLen(root));
               if(StringLen(suffix) <= 6)
                  return suffix;
            }
         }
      }
      return "";
   }

public:
   CBrokerAdapter()
   {
      m_customBrokerName = "";
      m_manualSuffix     = "";
      ZeroMemory(m_profile);
   }

   bool Initialize(ENUM_BROKER_PRESET requestedPreset,
                   ENUM_ACCOUNT_TIER  requestedTier,
                   const string       customBrokerName,
                   const string       manualSuffixOverride)
   {
      m_customBrokerName = customBrokerName;
      m_manualSuffix     = manualSuffixOverride;

      m_profile.companyName     = AccountInfoString(ACCOUNT_COMPANY);
      m_profile.serverName      = AccountInfoString(ACCOUNT_SERVER);
      m_profile.accountCurrency = AccountInfoString(ACCOUNT_CURRENCY);
      m_profile.leverage        = (int)AccountInfoInteger(ACCOUNT_LEVERAGE);
      m_profile.stopoutLevel    = AccountInfoDouble(ACCOUNT_MARGIN_SO_SO);
      m_profile.hedgingAllowed  = ((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE) == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);

      ENUM_ACCOUNT_TRADE_MODE tradeMode = (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE);
      m_profile.isDemoAccount = (tradeMode == ACCOUNT_TRADE_MODE_DEMO);
      m_profile.isLiveAccount = (tradeMode == ACCOUNT_TRADE_MODE_REAL);

      if(requestedPreset == BROKER_AUTO_DETECT)
         m_profile.brokerPreset = MatchBrokerFromStrings(m_profile.companyName, m_profile.serverName);
      else
         m_profile.brokerPreset = requestedPreset;

      m_profile.detectedBrokerLabel = BrokerPresetToString(m_profile.brokerPreset);
      m_profile.detectedSuffix      = DetectSuffixFromMarketWatch();

      if(requestedTier == TIER_AUTO_DETECT)
         m_profile.accountTier = DetectAccountTier(m_profile.serverName, m_profile.accountCurrency, m_profile.detectedSuffix);
      else
         m_profile.accountTier = requestedTier;

      string upperCurr = ToUpperSafe(m_profile.accountCurrency);
      m_profile.isCentAccount = (m_profile.accountTier == TIER_CENT || upperCurr == "USC" || upperCurr == "EUC");

      // Truth Mode: Technical verification requires live terminal connection + contract validation
      m_profile.technicallyVerified = false;
      m_profile.verificationNotes   = "Pending runtime contract & demo execution check on " + m_profile.serverName;

      return true;
   }

   string AccountTierToString(ENUM_ACCOUNT_TIER tier) const
   {
      switch(tier)
      {
         case TIER_STANDARD:   return "Standard";
         case TIER_ECN:        return "ECN";
         case TIER_RAW_SPREAD: return "Raw Spread";
         case TIER_CENT:       return "Cent";
         default:              return "Auto";
      }
   }

   BrokerProfile GetProfile() const { return m_profile; }

   void MarkTechnicallyVerified(const string note)
   {
      m_profile.technicallyVerified = true;
      m_profile.verificationNotes   = note;
   }

   ENUM_ORDER_TYPE_FILLING ResolveFillingMode(const string brokerSymbol) const
   {
      uint filling = (uint)SymbolInfoInteger(brokerSymbol, SYMBOL_FILLING_MODE);
      if((filling & SYMBOL_FILLING_FOK) == SYMBOL_FILLING_FOK)
         return ORDER_FILLING_FOK;
      if((filling & SYMBOL_FILLING_IOC) == SYMBOL_FILLING_IOC)
         return ORDER_FILLING_IOC;
      return ORDER_FILLING_RETURN;
   }

   string ResolveBrokerSymbol(const string canonicalName)
   {
      string clean = canonicalName;
      StringReplace(clean, "/", "");
      StringToUpper(clean);

      // Build alias candidates for indices, metals, and crypto across brokers
      string candidates[];
      ArrayResize(candidates, 1);
      candidates[0] = clean;

      if(clean == "XAUUSD") { AddCandidate(candidates, "GOLD"); }
      else if(clean == "XAGUSD") { AddCandidate(candidates, "SILVER"); }
      else if(clean == "NAS100") { AddCandidate(candidates, "USTEC"); AddCandidate(candidates, "NDX100"); AddCandidate(candidates, "US100"); }
      else if(clean == "US30")   { AddCandidate(candidates, "DJ30"); AddCandidate(candidates, "WS30"); AddCandidate(candidates, "DOW30"); }
      else if(clean == "SPX500") { AddCandidate(candidates, "US500"); AddCandidate(candidates, "SP500"); }
      else if(clean == "BTCUSD") { AddCandidate(candidates, "BTCUSDm"); AddCandidate(candidates, "BITCOIN"); }
      else if(clean == "ETHUSD") { AddCandidate(candidates, "ETHUSDm"); AddCandidate(candidates, "ETHEREUM"); }

      int total = SymbolsTotal(false);
      // 1. Exact match with detected suffix
      for(int c = 0; c < ArraySize(candidates); c++)
      {
         string target = candidates[c] + m_profile.detectedSuffix;
         if(SymbolSelect(target, true))
            return target;
         if(SymbolSelect(candidates[c], true))
            return candidates[c];
      }

      // 2. Prefix/suffix scan across broker symbol catalog
      for(int c = 0; c < ArraySize(candidates); c++)
      {
         string root = candidates[c];
         for(int i = 0; i < total; i++)
         {
            string sym = SymbolName(i, false);
            string up  = ToUpperSafe(sym);
            if(StringFind(up, root) == 0 && StringLen(sym) <= StringLen(root) + 6)
            {
               if(SymbolSelect(sym, true))
                  return sym;
            }
         }
      }
      return "";
   }

   bool ReadSymbolSpecs(const string canonicalName, ENUM_INSTRUMENT_CLASS assetClass, double baseMaxSpreadPts, SymbolSpecs &outSpecs)
   {
      ZeroMemory(outSpecs);
      outSpecs.canonicalName = canonicalName;
      outSpecs.assetClass    = assetClass;
      outSpecs.brokerSymbol  = ResolveBrokerSymbol(canonicalName);

      if(outSpecs.brokerSymbol == "")
      {
         outSpecs.available = false;
         return false;
      }

      outSpecs.tradeMode = (ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(outSpecs.brokerSymbol, SYMBOL_TRADE_MODE);
      if(outSpecs.tradeMode != SYMBOL_TRADE_MODE_FULL)
      {
         outSpecs.available = false;
         return false;
      }

      outSpecs.point            = SymbolInfoDouble(outSpecs.brokerSymbol, SYMBOL_POINT);
      outSpecs.digits           = (int)SymbolInfoInteger(outSpecs.brokerSymbol, SYMBOL_DIGITS);
      outSpecs.tickSize         = SymbolInfoDouble(outSpecs.brokerSymbol, SYMBOL_TRADE_TICK_SIZE);
      outSpecs.tickValue        = SymbolInfoDouble(outSpecs.brokerSymbol, SYMBOL_TRADE_TICK_VALUE);
      outSpecs.contractSize     = SymbolInfoDouble(outSpecs.brokerSymbol, SYMBOL_TRADE_CONTRACT_SIZE);
      outSpecs.minLot           = SymbolInfoDouble(outSpecs.brokerSymbol, SYMBOL_VOLUME_MIN);
      outSpecs.maxLot           = SymbolInfoDouble(outSpecs.brokerSymbol, SYMBOL_VOLUME_MAX);
      outSpecs.lotStep          = SymbolInfoDouble(outSpecs.brokerSymbol, SYMBOL_VOLUME_STEP);
      outSpecs.stopsLevelPts    = SymbolInfoInteger(outSpecs.brokerSymbol, SYMBOL_TRADE_STOPS_LEVEL);
      outSpecs.freezeLevelPts   = SymbolInfoInteger(outSpecs.brokerSymbol, SYMBOL_TRADE_FREEZE_LEVEL);
      outSpecs.currentSpreadPts = (int)SymbolInfoInteger(outSpecs.brokerSymbol, SYMBOL_SPREAD);
      outSpecs.fillingMode      = ResolveFillingMode(outSpecs.brokerSymbol);

      // Intelligent adaptation of spread ceiling per account tier and asset class
      double tierMultiplier = 1.0;
      if(m_profile.accountTier == TIER_RAW_SPREAD || m_profile.accountTier == TIER_ECN)
         tierMultiplier = 0.75;
      else if(m_profile.accountTier == TIER_CENT)
         tierMultiplier = 1.35;

      double classMultiplier = 1.0;
      if(assetClass == CLASS_METALS)  classMultiplier = 2.0;
      if(assetClass == CLASS_INDICES) classMultiplier = 3.5;
      if(assetClass == CLASS_CRYPTO)  classMultiplier = 8.0;

      outSpecs.adaptiveMaxSpreadPts = baseMaxSpreadPts * tierMultiplier * classMultiplier;
      outSpecs.available = (outSpecs.point > 0.0 && outSpecs.tickSize > 0.0 && outSpecs.tickValue > 0.0 && outSpecs.lotStep > 0.0);
      return outSpecs.available;
   }

   int DiscoverAllTradableSymbols(SymbolSpecs &list[], bool includeForex, bool includeMetals, bool includeIndices, bool includeCrypto, double baseMaxSpreadPts)
   {
      ArrayResize(list, 0);
      int total = SymbolsTotal(false);

      for(int i = 0; i < total; i++)
      {
         string sym = SymbolName(i, false);
         ENUM_SYMBOL_TRADE_MODE mode = (ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(sym, SYMBOL_TRADE_MODE);
         if(mode != SYMBOL_TRADE_MODE_FULL)
            continue;

         string up = ToUpperSafe(sym);
         ENUM_INSTRUMENT_CLASS cls = ClassifySymbol(up);

         if(cls == CLASS_FOREX   && !includeForex)   continue;
         if(cls == CLASS_METALS  && !includeMetals)  continue;
         if(cls == CLASS_INDICES && !includeIndices) continue;
         if(cls == CLASS_CRYPTO  && !includeCrypto)  continue;

         // Filter out obscure non-standard symbols without valid tick math
         if(!SymbolSelect(sym, true))
            continue;

         SymbolSpecs specs;
         ZeroMemory(specs);
         specs.canonicalName    = sym;
         specs.brokerSymbol     = sym;
         specs.assetClass       = cls;
         specs.point            = SymbolInfoDouble(sym, SYMBOL_POINT);
         specs.digits           = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         specs.tickSize         = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
         specs.tickValue        = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
         specs.contractSize     = SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE);
         specs.minLot           = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
         specs.maxLot           = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
         specs.lotStep          = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
         specs.stopsLevelPts    = SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL);
         specs.freezeLevelPts   = SymbolInfoInteger(sym, SYMBOL_TRADE_FREEZE_LEVEL);
         specs.currentSpreadPts = (int)SymbolInfoInteger(sym, SYMBOL_SPREAD);
         specs.fillingMode      = ResolveFillingMode(sym);
         specs.tradeMode        = mode;

         double classMult = (cls == CLASS_METALS ? 2.0 : (cls == CLASS_INDICES ? 3.5 : (cls == CLASS_CRYPTO ? 8.0 : 1.0)));
         specs.adaptiveMaxSpreadPts = baseMaxSpreadPts * classMult;
         specs.available = (specs.point > 0.0 && specs.tickValue > 0.0 && specs.lotStep > 0.0);

         if(specs.available)
         {
            int n = ArraySize(list);
            ArrayResize(list, n + 1);
            list[n] = specs;
         }
      }
      return ArraySize(list);
   }

private:
   void AddCandidate(string &arr[], const string val)
   {
      int n = ArraySize(arr);
      ArrayResize(arr, n + 1);
      arr[n] = val;
   }

   ENUM_INSTRUMENT_CLASS ClassifySymbol(const string up) const
   {
      if(StringFind(up, "XAU") >= 0 || StringFind(up, "XAG") >= 0 || StringFind(up, "GOLD") >= 0 || StringFind(up, "SILVER") >= 0)
         return CLASS_METALS;
      if(StringFind(up, "BTC") >= 0 || StringFind(up, "ETH") >= 0 || StringFind(up, "SOL") >= 0 || StringFind(up, "XRP") >= 0 || StringFind(up, "LTC") >= 0)
         return CLASS_CRYPTO;
      if(StringFind(up, "NAS") >= 0 || StringFind(up, "US30") >= 0 || StringFind(up, "SPX") >= 0 || StringFind(up, "US500") >= 0 || StringFind(up, "USTEC") >= 0 || StringFind(up, "GER40") >= 0 || StringFind(up, "UK100") >= 0 || StringFind(up, "DJ30") >= 0)
         return CLASS_INDICES;
      return CLASS_FOREX;
   }
};

#endif
