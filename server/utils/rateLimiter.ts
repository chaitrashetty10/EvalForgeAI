export class RateLimiter {
  private active = 0;
  private readonly maxConcurrent: number;
  private readonly maxPerMinute: number;
  private timestamps: number[] = [];

  constructor(maxConcurrent = 3, maxPerMinute = 36) {
    this.maxConcurrent = maxConcurrent;
    this.maxPerMinute = maxPerMinute;
  }

  getStatus() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((ts) => now - ts < 60_000);
    return {
      activeRequests: this.active,
      maxConcurrent: this.maxConcurrent,
      requestsLastMinute: this.timestamps.length,
      maxPerMinute: this.maxPerMinute,
    };
  }

  async acquire(): Promise<void> {
    const waitStart = Date.now();
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((ts) => now - ts < 60_000);

      if (this.active < this.maxConcurrent && this.timestamps.length < this.maxPerMinute) {
        this.active += 1;
        this.timestamps.push(now);
        return;
      }

      if (now - waitStart > 15_000) {
        throw new Error('Rate limit wait timeout exceeded (15s). Reduce concurrency or use Simulation Mode.');
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }
}

export const globalRateLimiter = new RateLimiter(3, 36);

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = 'Request'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function formatApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GenerateRequestsPerDay') || raw.includes('free_tier_requests')) {
    const modelMatch = raw.match(/"model":"([^"]+)"/);
    const mName = modelMatch ? modelMatch[1] : 'Gemini free-tier model';
    return `Free-tier daily quota reached for ${mName} (20 req/day). Use Simulation Mode for unlimited testing or select another model.`;
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return 'Rate limit exceeded (429 RESOURCE_EXHAUSTED). Wait briefly, disable LLM-as-a-Judge to halve API calls, or use Simulation Mode.';
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return 'Gemini API key missing or invalid. Check Settings > Secrets or run in Simulation Mode.';
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return 'Requested model identifier not found or unavailable for this API key.';
  }
  return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 1
): Promise<{ result: T; retries: number }> {
  let retries = 0;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, retries };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);

      // Fail fast on daily quota exhaustion, auth errors, 404s, or timeouts
      const isDailyQuota =
        msg.includes('GenerateRequestsPerDay') ||
        msg.includes('free_tier_requests') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('NOT_FOUND');

      if (isDailyQuota) {
        throw new Error(formatApiError(err));
      }

      const isTransient = msg.includes('429') || msg.includes('503') || msg.includes('500');
      if (!isTransient || attempt === maxRetries) {
        throw new Error(formatApiError(err));
      }

      retries += 1;
      const delayMs = 700 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
