import React, { useState } from 'react';
import { CheckCircle2, Plus, Search, ShieldAlert } from 'lucide-react';
import {
  AccountTier,
  BrokerProfile,
  InstrumentSpec,
  RiskConfig,
} from '../types/trading';
import {
  calculateLotSizeForRisk,
  computeAdaptiveSpreadLimitPts,
  resolveBrokerSymbolName,
} from '../engine/scalpingEngine';

interface BrokerMatrixViewProps {
  brokers: BrokerProfile[];
  selectedBrokerId: string;
  onSelectBroker: (id: string) => void;
  onAddBroker: (broker: BrokerProfile) => void;
  onToggleBrokerVerified: (id: string, verified: boolean) => void;
  manualSuffix: string;
  onChangeManualSuffix: (suffix: string) => void;
  accountTier: AccountTier;
  equity: number;
  riskConfig: RiskConfig;
  instruments: InstrumentSpec[];
}

export const BrokerMatrixView: React.FC<BrokerMatrixViewProps> = ({
  brokers,
  selectedBrokerId,
  onSelectBroker,
  onAddBroker,
  onToggleBrokerVerified,
  manualSuffix,
  onChangeManualSuffix,
  accountTier,
  equity,
  riskConfig,
  instruments,
}) => {
  const [companyInput, setCompanyInput] = useState('IC Markets (SC) Ltd');
  const [serverInput, setServerInput] = useState('ICMarketsSC-MT5-Demo02');
  const [detectedResult, setDetectedResult] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [newName, setNewName] = useState('');
  const [newServer, setNewServer] = useState('');
  const [newSuffix, setNewSuffix] = useState('');
  const [newStopsLevel, setNewStopsLevel] = useState(10);
  const [newFilling, setNewFilling] = useState<'FOK' | 'IOC' | 'RETURN'>('IOC');
  const [newCommission, setNewCommission] = useState(7);

  const selectedBroker = brokers.find((b) => b.id === selectedBrokerId) ?? brokers[0];

  const handleRunAutoDetect = () => {
    const combined = `${companyInput} ${serverInput}`.toUpperCase();
    const matched = brokers.find(
      (b) =>
        combined.includes(b.companyMatchPattern.toUpperCase()) ||
        combined.includes(b.serverMatchPattern.toUpperCase()) ||
        combined.includes(b.name.toUpperCase())
    );
    if (matched) {
      onSelectBroker(matched.id);
      setDetectedResult(
        `Matched "${matched.name}" from MT5 Account strings. Default suffix "${matched.commonSuffixes[0] || '(none)'}", Filling=${matched.defaultFillingMode}, StopsLevel=${matched.typicalStopsLevelPts} pts. Status: ${matched.verificationStatus}.`
      );
    } else {
      setDetectedResult(
        'No built-in preset matched. Fallback to Custom MT5 Broker adapter — verify symbol suffixes and filling mode on a Demo account first.'
      );
    }
  };

  const handleCreateBroker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = `custom-${Date.now()}`;
    const created: BrokerProfile = {
      id,
      name: newName.trim(),
      companyMatchPattern: newName.trim(),
      serverMatchPattern: newServer.trim() || `${newName.trim()}-MT5`,
      supportedTiers: ['Standard', 'ECN', 'Raw Spread', 'Cent'],
      defaultTier: 'Standard',
      supportedCurrencies: ['USD', 'EUR', 'GBP'],
      defaultCurrency: 'USD',
      commonSuffixes: [newSuffix.trim()],
      typicalStopsLevelPts: Math.max(0, newStopsLevel),
      typicalFreezeLevelPts: 0,
      defaultFillingMode: newFilling,
      rawSpreadCommissionPerLot: Math.max(0, newCommission),
      spreadMultiplier: 1.0,
      verificationStatus: 'Unverified Custom',
      verifiedNotes: 'Custom MT5 broker added manually. Requires Demo Validation before Live Mode.',
      isCustom: true,
    };
    onAddBroker(created);
    onSelectBroker(id);
    setNewName('');
    setNewServer('');
    setNewSuffix('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Row: Auto-Detection Tester & Add New Broker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100">
              Automatic Broker & Symbol Suffix Detection
            </h2>
            <span className="text-xs font-mono text-slate-400">BrokerAdapter.mqh</span>
          </div>
          <p className="text-xs text-slate-400">
            In MetaTrader 5, the EA inspects <span className="font-mono text-slate-300">ACCOUNT_COMPANY</span>,{' '}
            <span className="font-mono text-slate-300">ACCOUNT_SERVER</span>, and{' '}
            <span className="font-mono text-slate-300">SymbolsTotal(false)</span> to detect broker tier, currency, and symbol suffixes automatically. Test detection below or override suffix manually.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">ACCOUNT_COMPANY</label>
              <input
                type="text"
                value={companyInput}
                onChange={(e) => setCompanyInput(e.target.value)}
                className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">ACCOUNT_SERVER</label>
              <input
                type="text"
                value={serverInput}
                onChange={(e) => setServerInput(e.target.value)}
                className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Manual Suffix Override</label>
              <input
                type="text"
                value={manualSuffix}
                placeholder="e.g. m, .r, _i"
                onChange={(e) => onChangeManualSuffix(e.target.value)}
                className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleRunAutoDetect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5" />
              Test Auto-Detection
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-md whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add New Broker
            </button>
          </div>

          {detectedResult && (
            <div className="bg-[#0B111E] border border-slate-800 rounded p-2.5 text-xs font-mono text-sky-300">
              {detectedResult}
            </div>
          )}
        </div>

        {/* Add New Broker Form or Selected Broker Verification Panel */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-3">
          {showAddForm ? (
            <form onSubmit={handleCreateBroker} className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-100">Add New MT5-Compatible Broker</h3>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Broker Name</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Tickmill"
                    className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">MT5 Server Pattern</label>
                  <input
                    type="text"
                    value={newServer}
                    onChange={(e) => setNewServer(e.target.value)}
                    placeholder="Tickmill-Demo"
                    className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Symbol Suffix</label>
                  <input
                    type="text"
                    value={newSuffix}
                    onChange={(e) => setNewSuffix(e.target.value)}
                    placeholder="e.g. .raw or m"
                    className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Filling Mode</label>
                  <select
                    value={newFilling}
                    onChange={(e) => setNewFilling(e.target.value as 'FOK' | 'IOC' | 'RETURN')}
                    className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="IOC">ORDER_FILLING_IOC</option>
                    <option value="FOK">ORDER_FILLING_FOK</option>
                    <option value="RETURN">ORDER_FILLING_RETURN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">StopsLevel (pts)</label>
                  <input
                    type="number"
                    min="0"
                    value={newStopsLevel}
                    onChange={(e) => setNewStopsLevel(Number(e.target.value))}
                    className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Commission ($/lot)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newCommission}
                    onChange={(e) => setNewCommission(Number(e.target.value))}
                    className="w-full bg-[#0B111E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded"
                >
                  Save Broker Profile
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  Truth Mode Broker Verification Gate
                </h3>
                {selectedBroker.verificationStatus === 'Demo Validated' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Compatibility with <span className="text-slate-100 font-medium">{selectedBroker.name}</span> is never claimed as verified until contract specs, symbol suffixes, filling modes, and stop distances have been tested on an MT5 Demo terminal.
              </p>
              <div className="bg-[#0B111E] border border-slate-800 rounded p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Status</span>
                  <span
                    className={`font-semibold ${
                      selectedBroker.verificationStatus === 'Demo Validated'
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {selectedBroker.verificationStatus}
                  </span>
                </div>
                <div className="flex justify-between font-mono tabular-nums">
                  <span className="text-slate-400 font-sans">Typical StopsLevel</span>
                  <span className="text-slate-200">{selectedBroker.typicalStopsLevelPts} pts</span>
                </div>
                <div className="flex justify-between font-mono tabular-nums">
                  <span className="text-slate-400 font-sans">Filling / Commission</span>
                  <span className="text-slate-200">
                    {selectedBroker.defaultFillingMode} · ${selectedBroker.rawSpreadCommissionPerLot.toFixed(2)}/lot
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onToggleBrokerVerified(
                    selectedBroker.id,
                    selectedBroker.verificationStatus !== 'Demo Validated'
                  )
                }
                className={`w-full py-2 text-xs font-medium rounded-md transition-colors ${
                  selectedBroker.verificationStatus === 'Demo Validated'
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                }`}
              >
                {selectedBroker.verificationStatus === 'Demo Validated'
                  ? 'Revoke Demo Validation Status'
                  : 'Confirm MT5 Demo Contract Validation Completed'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Broker Compatibility Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-100">
          Supported MT5 Broker Matrix ({brokers.length} Brokers)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Broker</th>
                <th className="py-2 px-2 font-medium">Server Pattern</th>
                <th className="py-2 px-2 font-medium">Tiers</th>
                <th className="py-2 px-2 font-medium">Suffixes</th>
                <th className="py-2 px-2 font-medium">Filling</th>
                <th className="py-2 px-2 font-medium text-right">StopsLvl</th>
                <th className="py-2 px-2 font-medium">Verification Status</th>
                <th className="py-2 pl-3 font-medium">Technical Validation Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {brokers.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => onSelectBroker(b.id)}
                  className={`cursor-pointer hover:bg-slate-800/40 ${
                    b.id === selectedBrokerId ? 'bg-sky-950/25' : ''
                  }`}
                >
                  <td className="py-2.5 pr-3 font-semibold text-slate-100 whitespace-nowrap">{b.name}</td>
                  <td className="py-2.5 px-2 font-mono text-slate-300 whitespace-nowrap">{b.serverMatchPattern}</td>
                  <td className="py-2.5 px-2 text-slate-300 whitespace-nowrap">{b.supportedTiers.join(' / ')}</td>
                  <td className="py-2.5 px-2 font-mono text-slate-300 whitespace-nowrap">
                    {b.commonSuffixes.map((s) => (s === '' ? 'none' : s)).join(', ')}
                  </td>
                  <td className="py-2.5 px-2 font-mono text-slate-300">{b.defaultFillingMode}</td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                    {b.typicalStopsLevelPts}p
                  </td>
                  <td
                    className={`py-2.5 px-2 font-medium whitespace-nowrap ${
                      b.verificationStatus === 'Demo Validated' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {b.verificationStatus}
                  </td>
                  <td className="py-2.5 pl-3 text-slate-400 max-w-xs truncate" title={b.verifiedNotes}>
                    {b.verifiedNotes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intelligent Adaptation Preview across Universal Instruments */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Intelligent Adaptation Preview — {selectedBroker.name} ({accountTier})
          </h3>
          <span className="text-xs text-slate-400">
            Auto-scaled for {equity.toFixed(2)} Equity · {riskConfig.riskPercent}% Risk / Trade
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Canonical</th>
                <th className="py-2 px-2 font-medium">Adapted Symbol</th>
                <th className="py-2 px-2 font-medium">Asset Class</th>
                <th className="py-2 px-2 font-medium text-right">Adapted Spread Cap</th>
                <th className="py-2 px-2 font-medium text-right">ATR SL Dist</th>
                <th className="py-2 px-2 font-medium text-right">ATR TP Dist</th>
                <th className="py-2 pl-2 font-medium text-right">Calculated Lot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {instruments.map((inst) => {
                const brokerSym = resolveBrokerSymbolName(inst, selectedBroker, manualSuffix);
                const maxSpr = computeAdaptiveSpreadLimitPts(
                  inst,
                  selectedBroker,
                  accountTier,
                  riskConfig.baseMaxSpreadPts
                );
                const minStop = selectedBroker.typicalStopsLevelPts * inst.point;
                const slDist = Math.max(minStop + inst.point * 2, inst.baseAtrPrice * riskConfig.atrSlMultiplier);
                const tpDist = Math.max(slDist * 1.4, inst.baseAtrPrice * riskConfig.atrTpMultiplier);
                const lot = calculateLotSizeForRisk(
                  equity,
                  riskConfig,
                  inst,
                  100,
                  100 - slDist,
                  accountTier === 'Cent'
                );

                return (
                  <tr key={inst.id} className="hover:bg-slate-800/30">
                    <td className="py-2 pr-3 text-slate-200">{inst.canonicalSymbol}</td>
                    <td className="py-2 px-2 font-semibold text-sky-300">{brokerSym}</td>
                    <td className="py-2 px-2 font-sans text-slate-400">{inst.assetClass}</td>
                    <td className="py-2 px-2 text-right text-slate-200">{maxSpr} pts</td>
                    <td className="py-2 px-2 text-right text-red-400">{slDist.toFixed(inst.digits)}</td>
                    <td className="py-2 px-2 text-right text-emerald-400">{tpDist.toFixed(inst.digits)}</td>
                    <td className="py-2 pl-2 text-right text-slate-100">{lot.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
