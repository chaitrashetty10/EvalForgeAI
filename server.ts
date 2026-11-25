import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProviderAvailability } from './server/adapters/modelAdapters.ts';
import { SANDBOXED_TOOLS } from './server/agent/tools.ts';
import { executeEvaluationRun } from './server/eval/engine.ts';
import type { RunEvaluationPayload } from './server/eval/engine.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'EvalForge AI' });
  });

  app.get('/api/providers/status', (_req, res) => {
    res.json(getProviderAvailability());
  });

  app.get('/api/agent/tools', (_req, res) => {
    res.json({ tools: SANDBOXED_TOOLS });
  });

  // Streaming SSE evaluation runner for real-time trace progress
  app.post('/api/evaluations/run-stream', async (req, res) => {
    const payload = req.body as Partial<RunEvaluationPayload>;
    if (
      !payload ||
      !payload.dataset ||
      !Array.isArray(payload.dataset.testCases) ||
      payload.dataset.testCases.length === 0
    ) {
      return res.status(400).json({
        error: 'Invalid evaluation payload: dataset with at least one test case is required.',
      });
    }
    if (!Array.isArray(payload.targetIds) || payload.targetIds.length === 0) {
      return res.status(400).json({
        error: 'Select at least one model or agent target to evaluate.',
      });
    }
    if (!Array.isArray(payload.models) || payload.models.length === 0) {
      return res.status(400).json({
        error: 'Model configurations must be supplied.',
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      const run = await executeEvaluationRun(
        payload as RunEvaluationPayload,
        (progress) => {
          sendEvent('progress', progress);
        }
      );
      sendEvent('complete', { run });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Evaluation execution error';
      sendEvent('error', { error: message });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  // Standard synchronous evaluation endpoint
  app.post('/api/evaluations/run', async (req, res) => {
    try {
      const payload = req.body as Partial<RunEvaluationPayload>;
      if (
        !payload ||
        !payload.dataset ||
        !Array.isArray(payload.dataset.testCases) ||
        payload.dataset.testCases.length === 0
      ) {
        return res.status(400).json({
          error: 'Invalid evaluation payload: dataset with at least one test case is required.',
        });
      }
      if (!Array.isArray(payload.targetIds) || payload.targetIds.length === 0) {
        return res.status(400).json({
          error: 'Select at least one model or agent target to evaluate.',
        });
      }
      if (!Array.isArray(payload.models) || payload.models.length === 0) {
        return res.status(400).json({
          error: 'Model configurations must be supplied.',
        });
      }

      const run = await executeEvaluationRun(payload as RunEvaluationPayload);
      return res.json({ run });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Evaluation execution error';
      return res.status(500).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (!isProd || !fs.existsSync(distDir)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`EvalForge AI listening on http://0.0.0.0:${port}`);
  });
}

startServer();
