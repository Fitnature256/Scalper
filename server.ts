import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = 3000;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"),
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/audit", async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({
      error: "GEMINI_API_KEY is not configured in the server environment. Set it in Settings > Secrets.",
    });
    return;
  }

  const { query, context } = req.body as {
    query?: string;
    context?: {
      broker?: string;
      accountType?: string;
      accountCurrency?: string;
      mode?: string;
      instrument?: string;
      riskPercent?: number;
      metrics?: Record<string, unknown>;
      activeSignals?: Array<Record<string, unknown>>;
    };
  };

  if (!query || typeof query !== "string" || !query.trim()) {
    res.status(400).json({ error: "A technical query or audit prompt is required." });
    return;
  }

  const systemInstruction = `You are a Principal MQL5 Quantitative Execution Auditor enforcing strict Truth Mode principles.
Rules you MUST obey:
1. Never claim 100% accuracy, guaranteed profits, or risk-free trading.
2. Never fabricate backtest results, signals, or broker compatibility. If a broker has not been verified on a live/demo terminal, explicitly state it requires demo validation.
3. Explain MetaTrader 5 architectural realities honestly (e.g., MT5 cannot guarantee genuine 2-second market execution due to network round-trip, tick arrival, and broker server queueing).
4. Evaluate spread-to-ATR ratios, minimum stops level (SYMBOL_TRADE_STOPS_LEVEL), filling modes (FOK/IOC/RETURN), slippage, commission/swap erosion, and risk management (0.5% default risk, drawdown caps).
5. Structure your answer concisely with clear technical headings, exact formulas/checks, and concrete MQL5 verification steps. Keep output under 700 words.`;

  const promptPayload = `TRADER AUDIT REQUEST:
${query.trim()}

CURRENT TERMINAL & STRATEGY SNAPSHOT (FROM CONTROL PANEL):
${JSON.stringify(context ?? {}, null, 2)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: promptPayload,
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    });

    const text = response.text;
    if (!text) {
      res.status(502).json({ error: "Empty response returned from Gemini audit model." });
      return;
    }

    res.json({
      analysis: text,
      modelUsed: "gemini-4-hydrogen",
      thinkingLevel: "HIGH",
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown upstream Gemini API error";
    const status = message.includes("403") || message.includes("PERMISSION_DENIED")
      ? 403
      : message.includes("429") || message.includes("RESOURCE_EXHAUSTED")
        ? 429
        : 500;
    res.status(status).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Aegis MT5 Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
