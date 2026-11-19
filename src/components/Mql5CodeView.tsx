import React, { useState } from 'react';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import mainEaCode from '../../mql5/UniversalScalperEA.mq5?raw';
import brokerAdapterCode from '../../mql5/Include/BrokerAdapter.mqh?raw';
import scalpingEngineCode from '../../mql5/Include/ScalpingEngine.mqh?raw';
import riskManagerCode from '../../mql5/Include/RiskManager.mqh?raw';
import executionEngineCode from '../../mql5/Include/ExecutionEngine.mqh?raw';
import controlPanelUiCode from '../../mql5/Include/ControlPanelUI.mqh?raw';
import testerPresetCode from '../../mql5/UniversalScalper.set?raw';

interface Mql5FileEntry {
  id: string;
  path: string;
  filename: string;
  role: string;
  content: string;
}

const MQL5_FILES: Mql5FileEntry[] = [
  {
    id: 'main',
    path: 'MQL5/Experts/AegisScalper/UniversalScalperEA.mq5',
    filename: 'UniversalScalperEA.mq5',
    role: 'Main Expert Advisor lifecycle (OnInit, OnTick, OnTimer, OnTradeTransaction, OnChartEvent, OnTester)',
    content: mainEaCode,
  },
  {
    id: 'broker',
    path: 'MQL5/Experts/AegisScalper/Include/BrokerAdapter.mqh',
    filename: 'BrokerAdapter.mqh',
    role: 'Auto broker detection, dynamic symbol suffix scanner, contract specs & filling mode resolver',
    content: brokerAdapterCode,
  },
  {
    id: 'engine',
    path: 'MQL5/Experts/AegisScalper/Include/ScalpingEngine.mqh',
    filename: 'ScalpingEngine.mqh',
    role: 'Multi-timeframe (M1-H1) EMA9/21, RSI, ATR, MACD, ADX, Price Action, S/R, Structure & Liquidity',
    content: scalpingEngineCode,
  },
  {
    id: 'risk',
    path: 'MQL5/Experts/AegisScalper/Include/RiskManager.mqh',
    filename: 'RiskManager.mqh',
    role: '0.5% risk sizing, daily loss/trade caps, max drawdown guard, MT5 Economic Calendar news filter',
    content: riskManagerCode,
  },
  {
    id: 'exec',
    path: 'MQL5/Experts/AegisScalper/Include/ExecutionEngine.mqh',
    filename: 'ExecutionEngine.mqh',
    role: 'OrderCheck/OrderSend, stop-distance validation, slippage measurement, trailing stop & Truth Mode logger',
    content: executionEngineCode,
  },
  {
    id: 'ui',
    path: 'MQL5/Experts/AegisScalper/Include/ControlPanelUI.mqh',
    filename: 'ControlPanelUI.mqh',
    role: 'On-chart MT5 dashboard with clickable AUTO/MANUAL, STOP ALL TRADING & Reset Guard buttons',
    content: controlPanelUiCode,
  },
  {
    id: 'preset',
    path: 'MQL5/Profiles/Tester/UniversalScalper.set',
    filename: 'UniversalScalper.set',
    role: 'MetaTrader 5 Strategy Tester parameter preset (0.5% default risk, Real Ticks recommended)',
    content: testerPresetCode,
  },
];

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const Mql5CodeView: React.FC = () => {
  const [activeFileId, setActiveFileId] = useState<string>('main');
  const [copied, setCopied] = useState(false);

  const activeFile = MQL5_FILES.find((f) => f.id === activeFileId) ?? MQL5_FILES[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission errors silently
    }
  };

  const handleDownloadAll = () => {
    MQL5_FILES.forEach((f, idx) => {
      setTimeout(() => triggerDownload(f.filename, f.content), idx * 140);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#111827] border border-slate-800 rounded-lg p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Modular MQL5 Expert Advisor Codebase
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Place <span className="font-mono text-slate-300">UniversalScalperEA.mq5</span> and the <span className="font-mono text-slate-300">Include/</span> header files inside <span className="font-mono text-slate-300">MQL5/Experts/AegisScalper/</span>, then compile in MetaEditor 5 (F7).
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadAll}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Download All 7 MQL5 Files
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* File Explorer */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-3 space-y-1.5">
            <div className="text-xs font-medium text-slate-400 px-2 pb-1">Project Files</div>
            {MQL5_FILES.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => setActiveFileId(file.id)}
                className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                  file.id === activeFileId
                    ? 'bg-sky-600/20 border border-sky-500/40 text-slate-100'
                    : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 font-mono text-xs font-semibold">
                  <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">{file.filename}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">{file.role}</div>
              </button>
            ))}
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-2.5 text-xs">
            <h3 className="font-semibold text-slate-100">MetaEditor 5 & Demo Validation Steps</h3>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400 leading-relaxed">
              <li>Open MetaTrader 5 → <span className="font-mono text-slate-200">File → Open Data Folder</span>.</li>
              <li>Copy <span className="font-mono text-slate-200">UniversalScalperEA.mq5</span> and all 5 <span className="font-mono text-slate-200">.mqh</span> files into <span className="font-mono text-slate-200">MQL5/Experts/AegisScalper/</span> (preserving <span className="font-mono text-slate-200">Include/</span>).</li>
              <li>Open <span className="font-mono text-slate-200">UniversalScalperEA.mq5</span> in MetaEditor 5 and press <span className="font-mono text-slate-200">F7</span> to verify 0 errors.</li>
              <li>Run MT5 Strategy Tester using <span className="font-mono text-slate-200">Every tick based on real ticks</span> and load <span className="font-mono text-slate-200">UniversalScalper.set</span>.</li>
              <li>Validate live ticks, symbol suffix, filling mode, and stop distances on a Demo account before enabling Live trading.</li>
            </ol>
          </div>
        </div>

        {/* Code Viewer */}
        <div className="lg:col-span-8 bg-[#111827] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800 bg-[#0F172A]">
            <div>
              <div className="text-xs font-mono font-semibold text-slate-100">{activeFile.path}</div>
              <div className="text-[11px] text-slate-400">{activeFile.content.split('\n').length} lines</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy Code'}
              </button>
              <button
                type="button"
                onClick={() => triggerDownload(activeFile.filename, activeFile.content)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          </div>

          <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[620px] overflow-y-auto leading-relaxed bg-[#090E1A]">
            <code>{activeFile.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
