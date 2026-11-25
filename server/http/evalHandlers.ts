import type { IncomingMessage, ServerResponse } from 'http';
import { getProviderAvailability } from '../adapters/modelAdapters.ts';
import { SANDBOXED_TOOLS } from '../agent/tools.ts';
import { executeEvaluationRun } from '../eval/engine.ts';
import type { RunEvaluationPayload } from '../eval/engine.ts';

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
}

export type ApiResponse = ServerResponse;

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_TEST_CASES = 25;
const MAX_TARGETS = 12;

export function sendJson(res: ApiResponse, statusCode: number, data: unknown): void {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export async function parseJsonBody(req: ApiRequest): Promise<unknown> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      return req.body.trim() ? JSON.parse(req.body) : {};
    }
    if (Buffer.isBuffer(req.body)) {
      const text = req.body.toString('utf8');
      return text.trim() ? JSON.parse(text) : {};
    }
    if (typeof req.body === 'object') {
      return req.body;
    }
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      totalBytes += buf.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('Request payload exceeds 2MB limit.'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Malformed JSON request body.'));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

export function validateEvaluationPayload(
  raw: unknown
): { ok: true; payload: RunEvaluationPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid evaluation payload: JSON object expected.' };
  }

  const payload = raw as Partial<RunEvaluationPayload>;

  if (
    !payload.dataset ||
    !Array.isArray(payload.dataset.testCases) ||
    payload.dataset.testCases.length === 0
  ) {
    return {
      ok: false,
      error: 'Invalid evaluation payload: dataset with at least one test case is required.',
    };
  }
  if (payload.dataset.testCases.length > MAX_TEST_CASES) {
    return {
      ok: false,
      error: `Dataset exceeds maximum of ${MAX_TEST_CASES} test cases per run.`,
    };
  }
  if (!Array.isArray(payload.targetIds) || payload.targetIds.length === 0) {
    return {
      ok: false,
      error: 'Select at least one model or agent target to evaluate.',
    };
  }
  if (payload.targetIds.length > MAX_TARGETS) {
    return {
      ok: false,
      error: `Select at most ${MAX_TARGETS} targets per evaluation run.`,
    };
  }
  if (!Array.isArray(payload.models) || payload.models.length === 0) {
    return {
      ok: false,
      error: 'Model configurations must be supplied.',
    };
  }
  if (payload.track !== 'llm' && payload.track !== 'agent') {
    return {
      ok: false,
      error: 'Invalid evaluation track: must be "llm" or "agent".',
    };
  }
  const validModes = ['auto', 'live', 'local', 'simulated'];
  if (!payload.mode || !validModes.includes(payload.mode)) {
    return {
      ok: false,
      error: 'Invalid execution mode specified.',
    };
  }

  return { ok: true, payload: payload as RunEvaluationPayload };
}

export function handleHealth(req: ApiRequest, res: ApiResponse): void {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  sendJson(res, 200, { status: 'ok', service: 'EvalForge AI' });
}

export function handleProvidersStatus(req: ApiRequest, res: ApiResponse): void {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  sendJson(res, 200, getProviderAvailability());
}

export function handleAgentTools(req: ApiRequest, res: ApiResponse): void {
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  sendJson(res, 200, { tools: SANDBOXED_TOOLS });
}

export async function handleRunEvaluation(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await parseJsonBody(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request body';
    sendJson(res, 400, { error: message });
    return;
  }

  const validation = validateEvaluationPayload(parsedBody);
  if (validation.ok === false) {
    sendJson(res, 400, { error: validation.error });
    return;
  }

  try {
    const run = await executeEvaluationRun(validation.payload);
    sendJson(res, 200, { run });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Evaluation execution error';
    sendJson(res, 500, { error: message });
  }
}

export async function handleRunEvaluationStream(
  req: ApiRequest,
  res: ApiResponse
): Promise<void> {
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await parseJsonBody(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request body';
    sendJson(res, 400, { error: message });
    return;
  }

  const validation = validateEvaluationPayload(parsedBody);
  if (validation.ok === false) {
    sendJson(res, 400, { error: validation.error });
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const run = await executeEvaluationRun(validation.payload, (progress) => {
      sendEvent('progress', progress);
    });
    sendEvent('complete', { run });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Evaluation execution error';
    sendEvent('error', { error: message });
  } finally {
    if (!res.writableEnded) res.end();
  }
}
