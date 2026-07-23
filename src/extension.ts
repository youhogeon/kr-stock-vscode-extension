import * as vscode from 'vscode';

import {
  CONFIG_SECTION,
  MARK_NEWS_AS_READ_COMMAND,
  MAX_NEWS_ITEMS,
  NEWS_DISPLAY_WINDOW_MS,
  OPEN_NEWS_COMMAND,
  SHOW_NEWS_COMMAND,
} from './constants';
import { getConfig } from './config';
import {
  clearCache,
  initCacheService,
  markNewsCacheAsRead,
  readCache,
  readNewsCache,
  watchNewsCache,
  writeCache,
  writeNewsCache,
} from './services/cacheService';
import { appendHistory, getHistory } from './services/historyService';
import { showChart } from './services/chartService';
import { fetchAllMarkets } from './services/marketService';
import { fetchLatestNews, fetchNewsDetail } from './services/newsService';
import { NewsStatusBarService, showNewsQuickPick } from './services/newsStatusBarService';
import { openNewsDocument, registerNewsViewer } from './services/newsViewerService';
import { StatusBarService } from './services/statusBarService';
import { MarketIndex, NewsCacheState, NewsItem } from './types';

let statusBar: StatusBarService | undefined;
let newsStatusBar: NewsStatusBarService | undefined;
let outputChannel: vscode.OutputChannel;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let rotationTimer: ReturnType<typeof setInterval> | undefined;
let newsRefreshTimer: ReturnType<typeof setInterval> | undefined;
let markets: MarketIndex[] = [];
let news: NewsItem[] = [];
let currentIndex = 0;
let enabled = true;

function log(msg: string): void {
  const ts = new Date().toISOString();
  outputChannel.appendLine(`[${ts}] ${msg}`);
}

function clearTimers(): void {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = undefined; }
  if (rotationTimer) { clearInterval(rotationTimer); rotationTimer = undefined; }
  if (newsRefreshTimer) { clearInterval(newsRefreshTimer); newsRefreshTimer = undefined; }
}

function startRotation(): void {
  if (rotationTimer) { clearInterval(rotationTimer); }
  const config = getConfig();

  rotationTimer = setInterval(() => {
    if (markets.length === 0) { return; }
    currentIndex = (currentIndex + 1) % markets.length;
    statusBar?.update(markets[currentIndex], markets);
  }, config.rotationInterval * 1000);
  log(`Rotation started: every ${config.rotationInterval}s`);
}

async function refresh(): Promise<void> {
  log('Refreshing market data...');
  try {
    const config = getConfig();

    const cached = readCache(config.refreshInterval);
    if (cached && cached.length > 0) {
      log(`Using cached data (${cached.length} items)`);
      markets = cached;
      appendHistory(markets);
      if (currentIndex >= markets.length) { currentIndex = 0; }
      statusBar?.update(markets[currentIndex], markets);
      return;
    }

    const result = await fetchAllMarkets(
      config.stocks,
      config.showMarketIndexes,
      config.exchangeRates,
    );
    log(`Fetch result: ${result.length} items - ${JSON.stringify(result)}`);
    if (result.length > 0) {
      markets = result;
      writeCache(markets);
      appendHistory(markets);
      if (currentIndex >= markets.length) { currentIndex = 0; }
      statusBar?.update(markets[currentIndex], markets);
      log(`StatusBar updated: ${markets[currentIndex].label} ${markets[currentIndex].value}`);
    } else {
      log('No market data received, showing error');
      statusBar?.setError();
    }
  } catch (e) {
    log(`Refresh error: ${e}`);
    statusBar?.setError();
  }
}

function startRefresh(): void {
  if (refreshTimer) { clearInterval(refreshTimer); }
  const config = getConfig();
  refreshTimer = setInterval(refresh, config.refreshInterval * 1000);
  log(`Refresh started: every ${config.refreshInterval}s`);
}

function unreadNews(state: NewsCacheState): NewsItem[] {
  const readIds = new Set(state.readIds);
  const cutoff = Date.now() - NEWS_DISPLAY_WINDOW_MS;
  return state.news.filter((item) => {
    if (readIds.has(item.id)) { return false; }
    const created = new Date(item.createdAt).getTime();
    return Number.isNaN(created) || created >= cutoff;
  });
}

// Merge freshly fetched news with what we already have so unread items can
// accumulate beyond a single page. Newer fetches win on id collision, and the
// pool is sorted newest-first and capped at MAX_NEWS_ITEMS.
function mergeNews(fetched: NewsItem[], previous: NewsItem[]): NewsItem[] {
  const byId = new Map<string, NewsItem>();
  for (const item of previous) { byId.set(item.id, item); }
  for (const item of fetched) { byId.set(item.id, item); }

  return [...byId.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_NEWS_ITEMS);
}

async function refreshNews(): Promise<void> {
  log('Refreshing news...');
  try {
    const config = getConfig();
    if (config.newsRefreshInterval === null) {
      newsStatusBar?.hide();
      return;
    }

    const cached = readNewsCache(config.newsRefreshInterval);
    if (cached) {
      news = cached.news;
      newsStatusBar?.update(unreadNews(cached));
      log(`Using cached news (${news.length} items)`);
      return;
    }

    const previous = readNewsCache();
    const result = await fetchLatestNews();
    if (result.length === 0) {
      log('No news received, showing error');
      newsStatusBar?.setError();
      return;
    }

    const readIds = previous?.readIds ?? [];
    news = mergeNews(result, previous?.news ?? []);
    writeNewsCache(news, readIds);
    const unread = unreadNews({ news, readIds });
    newsStatusBar?.update(unread);
    log(`News updated: ${news.length} stored, unread (24h): ${unread.length}`);
  } catch (e) {
    log(`News refresh error: ${e}`);
    newsStatusBar?.setError();
  }
}

function startNewsRefresh(): void {
  if (newsRefreshTimer) { clearInterval(newsRefreshTimer); }
  const config = getConfig();
  if (config.newsRefreshInterval === null) { return; }

  newsRefreshTimer = setInterval(refreshNews, config.newsRefreshInterval * 1000);
  log(`News refresh started: every ${config.newsRefreshInterval}s`);
}

function start(): void {
  clearTimers();
  const config = getConfig();
  enabled = config.enabled;
  log(`start() called - enabled: ${enabled}, config: ${JSON.stringify(config)}`);

  if (!enabled) {
    statusBar?.hide();
    newsStatusBar?.hide();
    log('Extension disabled, hiding status bars');
    return;
  }

  statusBar?.setHidden(config.hidden);
  statusBar?.setLoading();
  refresh();
  startRefresh();
  startRotation();

  if (config.newsRefreshInterval !== null) {
    newsStatusBar?.setLoading();
    refreshNews();
    startNewsRefresh();
  } else {
    newsStatusBar?.hide();
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('KR Stock');
  log('Extension activating...');

  initCacheService(String(context.extension.packageJSON.version ?? '0'));

  statusBar = new StatusBarService();
  newsStatusBar = new NewsStatusBarService();

  const chartCommand = vscode.commands.registerCommand('krStock.showChart', () => {
    const history = getHistory();
    showChart(history);
  });

  const openNewsCommand = vscode.commands.registerCommand(OPEN_NEWS_COMMAND, async (newsId: unknown) => {
    if (typeof newsId !== 'string' || newsId.length === 0) { return; }

    try {
      const detail = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: '뉴스 본문을 불러오는 중...' },
        () => fetchNewsDetail(newsId),
      );
      await openNewsDocument(detail);
    } catch (e) {
      log(`Failed to open news ${newsId}: ${e}`);
      vscode.window.showWarningMessage('뉴스 본문을 불러오지 못했습니다.');
    }
  });

  const showNewsCommand = vscode.commands.registerCommand(SHOW_NEWS_COMMAND, async () => {
    const cached = readNewsCache();
    await showNewsQuickPick(cached ? unreadNews(cached) : []);
  });

  const markNewsAsReadCommand = vscode.commands.registerCommand(MARK_NEWS_AS_READ_COMMAND, () => {
    markNewsCacheAsRead();
    newsStatusBar?.update([]);
    log('All news marked as read');
  });

  const newsCacheWatcher = watchNewsCache(() => {
    if (!enabled || getConfig().newsRefreshInterval === null) { return; }

    const cached = readNewsCache();
    if (!cached) { return; }

    news = cached.news;
    newsStatusBar?.update(unreadNews(cached));
    log('News cache changed externally, status bar synced');
  });

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      log('Configuration changed, restarting...');
      clearCache();
      start();
    }
  });

  context.subscriptions.push(outputChannel);
  context.subscriptions.push(statusBar as unknown as vscode.Disposable);
  context.subscriptions.push(newsStatusBar as unknown as vscode.Disposable);
  context.subscriptions.push({ dispose: clearTimers });
  context.subscriptions.push(chartCommand);
  context.subscriptions.push(registerNewsViewer());
  context.subscriptions.push(openNewsCommand);
  context.subscriptions.push(showNewsCommand);
  context.subscriptions.push(markNewsAsReadCommand);
  context.subscriptions.push(newsCacheWatcher);
  context.subscriptions.push(configListener);

  start();
  log('Extension activated');
}

export function deactivate(): void {
  clearTimers();
  statusBar?.dispose();
  statusBar = undefined;
  newsStatusBar?.dispose();
  newsStatusBar = undefined;
  markets = [];
  news = [];
  currentIndex = 0;
}
