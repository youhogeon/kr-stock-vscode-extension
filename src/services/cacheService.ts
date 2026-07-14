import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MarketIndex } from '../types';

interface CacheData {
  timestamp: number;
  markets: MarketIndex[];
}

const DATA_DIR = path.join(os.homedir(), '.kr-stock');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');

export function readCache(maxAgeSec: number): MarketIndex[] | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const data: CacheData = JSON.parse(raw);
    const ageMs = Date.now() - data.timestamp;
    if (ageMs < maxAgeSec * 1000) {
      return data.markets;
    }
    return null;
  } catch {
    return null;
  }
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function writeCache(markets: MarketIndex[]): void {
  try {
    ensureDataDir();
    const data: CacheData = { timestamp: Date.now(), markets };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8');
  } catch {
    // ignore write errors
  }
}

export function clearCache(): void {
  try {
    fs.unlinkSync(CACHE_FILE);
  } catch {
    // ignore delete errors
  }
}
