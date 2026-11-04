import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Minimal .env loader (no dependency). Never logs values.
export function loadEnv(file = '.env') {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

// API key: env var first, else ~/.secrets/napster_api_key. Never printed.
export function getApiKey() {
  if (process.env.NAPSTER_API_KEY) return process.env.NAPSTER_API_KEY.trim();
  const p = path.join(os.homedir(), '.secrets', 'napster_api_key');
  if (fs.existsSync(p)) {
    process.env.NAPSTER_API_KEY = fs.readFileSync(p, 'utf8').trim();
    return process.env.NAPSTER_API_KEY;
  }
  return null;
}
