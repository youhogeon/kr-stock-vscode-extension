import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MarketIndex, NewsCacheState, NewsItem } from '../types';

interface CacheData {
  timestamp: number;
  markets: MarketIndex[];
}

interface NewsCacheData extends NewsCacheState {
  timestamp: number;
}

const BASE_DIR = path.join(os.homedir(), '.kr-stock');
const CACHE_FILE_NAME = 'cache.json';
const NEWS_CACHE_FILE_NAME = 'news-cache.json';

let versionDirName = '0';

export function initCacheService(extensionVersion: string): void {
  versionDirName = extensionVersion.replace(/[^0-9A-Za-z.\-]/g, '_') || '0';
}

function dataDir(): string {
  return path.join(BASE_DIR, versionDirName);
}

function cacheFilePath(): string {
  return path.join(dataDir(), CACHE_FILE_NAME);
}

function newsCacheFilePath(): string {
  return path.join(dataDir(), NEWS_CACHE_FILE_NAME);
}

export function readCache(maxAgeSec: number): MarketIndex[] | null {
  try {
    const raw = fs.readFileSync(cacheFilePath(), 'utf-8');
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
  if (!fs.existsSync(dataDir())) {
    fs.mkdirSync(dataDir(), { recursive: true });
  }
}

export function writeCache(markets: MarketIndex[]): void {
  try {
    ensureDataDir();
    const data: CacheData = { timestamp: Date.now(), markets };
    fs.writeFileSync(cacheFilePath(), JSON.stringify(data), 'utf-8');
  } catch {
    // ignore write errors
  }
}

export function readNewsCache(maxAgeSec?: number): NewsCacheState | null {
  try {
    const raw = fs.readFileSync(newsCacheFilePath(), 'utf-8');
    const data: NewsCacheData = JSON.parse(raw);
    if (typeof data.timestamp !== 'number' || !Array.isArray(data.news)) {
      return null;
    }

    if (maxAgeSec !== undefined && Date.now() - data.timestamp >= maxAgeSec * 1000) {
      return null;
    }

    const readIds = Array.isArray(data.readIds)
      ? data.readIds.filter((id): id is string => typeof id === 'string')
      : [];
    return { news: data.news, readIds };
  } catch {
    return null;
  }
}

export function writeNewsCache(news: NewsItem[], readIds: string[]): void {
  try {
    ensureDataDir();
    const newsIds = new Set(news.map((item) => item.id));
    const data: NewsCacheData = {
      timestamp: Date.now(),
      news,
      readIds: readIds.filter((id) => newsIds.has(id)),
    };
    fs.writeFileSync(newsCacheFilePath(), JSON.stringify(data), 'utf-8');
  } catch {
    // ignore write errors
  }
}

export function markNewsCacheAsRead(): void {
  try {
    const raw = fs.readFileSync(newsCacheFilePath(), 'utf-8');
    const data: NewsCacheData = JSON.parse(raw);
    if (typeof data.timestamp !== 'number' || !Array.isArray(data.news)) { return; }

    data.readIds = data.news.map((item) => item.id);
    fs.writeFileSync(newsCacheFilePath(), JSON.stringify(data), 'utf-8');
  } catch {
    // ignore read/write errors
  }
}

export function watchNewsCache(onChange: () => void): { dispose(): void } {
  try {
    ensureDataDir();
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const watcher = fs.watch(dataDir(), (_event, filename) => {
      if (filename && filename !== NEWS_CACHE_FILE_NAME) { return; }
      if (debounceTimer) { clearTimeout(debounceTimer); }
      debounceTimer = setTimeout(onChange, 200);
    });

    return {
      dispose: () => {
        if (debounceTimer) { clearTimeout(debounceTimer); }
        watcher.close();
      },
    };
  } catch {
    return { dispose: () => { /* noop */ } };
  }
}

export function clearCache(): void {
  try {
    fs.unlinkSync(cacheFilePath());
  } catch {
    // ignore delete errors
  }
}
