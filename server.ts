import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  handleAgentTools,
  handleHealth,
  handleProvidersStatus,
  handleRunEvaluation,
  handleRunEvaluationStream,
} from './server/http/evalHandlers.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => {
    handleHealth(req, res);
  });

  app.get('/api/providers/status', (req, res) => {
    handleProvidersStatus(req, res);
  });

  app.get('/api/agent/tools', (req, res) => {
    handleAgentTools(req, res);
  });

  // Streaming SSE evaluation runner for real-time trace progress
  app.post('/api/evaluations/run-stream', async (req, res) => {
    await handleRunEvaluationStream(req, res);
  });

  // Standard synchronous evaluation endpoint
  app.post('/api/evaluations/run', async (req, res) => {
    await handleRunEvaluation(req, res);
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
