# EvalForge AI — Unified AI Model & Agent Evaluation Harness

EvalForge AI is a modular, zero-cost enterprise evaluation harness for benchmarking, comparing, and validating both **foundational LLMs** and **autonomous AI agents**.

## Architecture

- **Client Layer (`src/`)**: React 19 + TypeScript + Tailwind CSS v4 with browser-persisted evaluation history (`localStorage`), SVG radar/scatter/trend charts, 11 dedicated operational modules, and Markdown/JSON report exports.
- **Server Layer (`server.ts`, `server/`)**: Express + Vite middleware server handling all AI provider calls securely server-side (`GEMINI_API_KEY`, optional `GROQ_API_KEY`, optional `OLLAMA_BASE_URL`), concurrency & rate-limiting, sandboxed agent tool execution, deterministic evaluators, and blind LLM-as-a-Judge scoring.
- **Shared Scoring & Statistics (`src/shared/`)**: Weighted 100%-validated scoring for separate LLM & Agent tracks, inverse metric normalization (latency & cost), missing-metric `N/A` preservation, mandatory safety gates, 95% confidence intervals, and inconclusive comparison detection.

## Zero-Cost Runtime & Provider Adapters

1. **Google Gemini Free Tier (`@google/genai`)**: Uses `gemini-4-hydrogen` and `gemini-3.1-flash-lite` via server-side `GEMINI_API_KEY`.
2. **Local Self-Hosted Models (Ollama)**: Set `OLLAMA_BASE_URL` (e.g. `http://127.0.0.1:11434`) on the server for zero-cost local inference.
3. **Groq Free Tier (Optional)**: Set `GROQ_API_KEY` on the server to enable optional Groq adapters.
4. **Explicit Simulation Mode**: Fully functional end-to-end evaluation & trace generation without API credentials, always labeled `Simulated Demo` and never presented as live API results.

## Local Setup & Running

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production Build

```bash
npm run build
npm start
```
