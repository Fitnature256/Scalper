import React from 'react';
import { CandleBar } from '../types/trading';

interface MiniPriceChartProps {
  candles: CandleBar[];
  support: number;
  resistance: number;
  digits: number;
  symbol: string;
}

export const MiniPriceChart: React.FC<MiniPriceChartProps> = ({
  candles,
  support,
  resistance,
  digits,
  symbol,
}) => {
  const visible = candles.slice(-40);
  if (visible.length === 0) return null;

  const width = 680;
  const height = 220;
  const padTop = 18;
  const padBottom = 24;
  const padLeft = 10;
  const padRight = 72;

  const highs = visible.map((c) => c.high);
  const lows = visible.map((c) => c.low);
  const minPrice = Math.min(...lows, support > 0 ? support : Infinity);
  const maxPrice = Math.max(...highs, resistance > 0 ? resistance : -Infinity);
  const range = Math.max(maxPrice - minPrice, 1e-6);

  const toY = (price: number) =>
    padTop + ((maxPrice - price) / range) * (height - padTop - padBottom);

  const plotW = width - padLeft - padRight;
  const candleStep = plotW / visible.length;
  const candleW = Math.max(3, candleStep * 0.62);

  // Compute EMA9 & EMA21 lines over visible bars
  const ema = (period: number) => {
    const k = 2 / (period + 1);
    let prev = visible[0].close;
    return visible.map((b, idx) => {
      prev = idx === 0 ? b.close : b.close * k + prev * (1 - k);
      const x = padLeft + idx * candleStep + candleStep / 2;
      const y = toY(prev);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  };

  const ema9Points = ema(9).join(' ');
  const ema21Points = ema(21).join(' ');

  return (
    <div className="w-full overflow-hidden">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-200">{symbol} · M5 Price Structure</span>
          <span aria-hidden="true">·</span>
          <span className="text-sky-400 font-mono">EMA 9</span>
          <span className="text-amber-400 font-mono">EMA 21</span>
        </div>
        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span>R: {resistance.toFixed(digits)}</span>
          <span>S: {support.toFixed(digits)}</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-52 bg-[#090E1A] border border-slate-800/90 rounded-lg"
        role="img"
        aria-label={`${symbol} M5 candlestick and EMA structure chart`}
      >
        {/* Horizontal grid */}
        {[0.25, 0.5, 0.75].map((pct) => {
          const y = padTop + pct * (height - padTop - padBottom);
          const p = maxPrice - pct * range;
          return (
            <g key={pct}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#1E293B"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={width - padRight + 6}
                y={y + 3}
                fill="#64748B"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {p.toFixed(digits)}
              </text>
            </g>
          );
        })}

        {/* Support & Resistance Lines */}
        {resistance > 0 && (
          <line
            x1={padLeft}
            y1={toY(resistance)}
            x2={width - padRight}
            y2={toY(resistance)}
            stroke="#EF4444"
            strokeOpacity="0.45"
            strokeDasharray="5 3"
            strokeWidth="1"
          />
        )}
        {support > 0 && (
          <line
            x1={padLeft}
            y1={toY(support)}
            x2={width - padRight}
            y2={toY(support)}
            stroke="#22C55E"
            strokeOpacity="0.45"
            strokeDasharray="5 3"
            strokeWidth="1"
          />
        )}

        {/* Candles */}
        {visible.map((c, idx) => {
          const xCenter = padLeft + idx * candleStep + candleStep / 2;
          const yHigh = toY(c.high);
          const yLow = toY(c.low);
          const yOpen = toY(c.open);
          const yClose = toY(c.close);
          const isBull = c.close >= c.open;
          const color = isBull ? '#16A34A' : '#DC2626';
          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));

          return (
            <g key={`${c.time}-${idx}`}>
              <line
                x1={xCenter}
                y1={yHigh}
                x2={xCenter}
                y2={yLow}
                stroke={color}
                strokeWidth="1"
              />
              <rect
                x={xCenter - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyHeight}
                fill={color}
                rx="0.5"
              />
            </g>
          );
        })}

        {/* EMA overlays */}
        <polyline fill="none" stroke="#38BDF8" strokeWidth="1.5" points={ema9Points} />
        <polyline fill="none" stroke="#F59E0B" strokeWidth="1.5" points={ema21Points} />
      </svg>
    </div>
  );
};

interface EquityCurveChartProps {
  points: { bar: number; equity: number }[];
  currency: string;
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({ points, currency }) => {
  if (points.length < 2) {
    return (
      <div className="h-36 flex items-center justify-center bg-[#090E1A] border border-slate-800/90 rounded-lg text-xs text-slate-500">
        Run Backtest Sandbox or import MT5 deals to plot equity progression.
      </div>
    );
  }

  const width = 520;
  const height = 140;
  const pad = 14;
  const vals = points.map((p) => p.equity);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const span = Math.max(maxVal - minVal, 1);

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (width - pad * 2);
    const y = pad + ((maxVal - p.equity) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastEquity = vals[vals.length - 1];
  const firstEquity = vals[0];
  const strokeColor = lastEquity >= firstEquity ? '#16A34A' : '#DC2626';

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
        <span>Sandbox Equity Curve ({points.length - 1} closed trades)</span>
        <span className="font-mono tabular-nums text-slate-200">
          {firstEquity.toFixed(2)} → {lastEquity.toFixed(2)} {currency}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-36 bg-[#090E1A] border border-slate-800/90 rounded-lg"
        role="img"
        aria-label="Equity curve chart"
      >
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          points={coords.join(' ')}
        />
      </svg>
    </div>
  );
};
