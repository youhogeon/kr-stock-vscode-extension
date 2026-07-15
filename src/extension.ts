import * as vscode from 'vscode';

import { CONFIG_SECTION } from './constants';
import { getConfig } from './config';
import { clearCache, readCache, writeCache } from './services/cacheService';
import { appendHistory, getHistory } from './services/historyService';
import { showChart } from './services/chartService';
import { fetchAllMarkets } from './services/marketService';
import { StatusBarService } from './services/statusBarService';
import { MarketIndex } from './types';

let statusBar: StatusBarService | undefined;
let outputChannel: vscode.OutputChannel;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let rotationTimer: ReturnType<typeof setInterval> | undefined;
let markets: MarketIndex[] = [];
let currentIndex = 0;
let enabled = true;

function log(msg: string): void {
  const ts = new Date().toISOString();
  outputChannel.appendLine(`[${ts}] ${msg}`);
}

function clearTimers(): void {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = undefined; }
  if (rotationTimer) { clearInterval(rotationTimer); rotationTimer = undefined; }
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

function start(): void {
  clearTimers();
  const config = getConfig();
  enabled = config.enabled;
  log(`start() called - enabled: ${enabled}, config: ${JSON.stringify(config)}`);

  if (!enabled) {
    statusBar?.hide();
    log('Extension disabled, hiding status bar');
    return;
  }

  statusBar?.setHidden(config.hidden);
  statusBar?.setLoading();
  refresh();
  startRefresh();
  startRotation();
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('KR Stock');
  log('Extension activating...');

  statusBar = new StatusBarService();

  const chartCommand = vscode.commands.registerCommand('krStock.showChart', () => {
    const history = getHistory();
    showChart(history);
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
  context.subscriptions.push({ dispose: clearTimers });
  context.subscriptions.push(chartCommand);
  context.subscriptions.push(configListener);

  start();
  log('Extension activated');
}

export function deactivate(): void {
  clearTimers();
  statusBar?.dispose();
  statusBar = undefined;
  markets = [];
  currentIndex = 0;
}
