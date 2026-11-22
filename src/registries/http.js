// Hardened HTTP client for slop-deps registry probes
// Features: bounded concurrency (<=8), stable User-Agent, exponential backoff
// on 429/5xx, Retry-After compliance, request timeouts, and wall-time caps.

export const USER_AGENT = 'slop-deps/0.0.2';

const MAX_CONCURRENCY = 8;
let activeRequests = 0;
const queue = [];

function acquireSlot() {
  if (activeRequests < MAX_CONCURRENCY) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    queue.push(resolve);
  });
}

function releaseSlot() {
  activeRequests--;
  if (queue.length > 0) {
    activeRequests++;
    const next = queue.shift();
    next();
  }
}

export async function fetchWithRetry(
  url,
  options = {},
  { maxRetries = 2, timeoutMs = 6000, maxWallTimeMs = 15000, initialDelayMs = 100 } = {}
) {
  const startTime = Date.now();
  await acquireSlot();

  try {
    const headers = {
      'User-Agent': USER_AGENT,
      ...(options.headers || {})
    };

    let attempt = 0;
    while (true) {
      attempt++;
      const timeRemaining = maxWallTimeMs - (Date.now() - startTime);
      if (timeRemaining <= 0) {
        const timeoutErr = new Error(`Total wall time exceeded (${maxWallTimeMs}ms) for ${url}`);
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }

      const controller = new AbortController();
      const currentTimeout = Math.min(timeoutMs, timeRemaining);
      const timer = setTimeout(() => controller.abort(), currentTimeout);

      try {
        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal
        });
        clearTimeout(timer);

        const status = response.status;
        const isRetryable = status === 429 || (status >= 500 && status <= 504);

        if (isRetryable && attempt <= maxRetries) {
          let delayMs = initialDelayMs * Math.pow(2, attempt - 1);
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed) && parsed > 0) {
              delayMs = Math.min(parsed * 1000, 3000); // cap to 3s for responsiveness
            }
          }
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }

        return response;
      } catch (err) {
        clearTimeout(timer);
        const isAbort = err.name === 'AbortError';
        const isConnErr = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'UND_ERR_CONNECT_TIMEOUT';

        if ((isAbort || isConnErr) && attempt <= maxRetries) {
          const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
  } finally {
    releaseSlot();
  }
}
