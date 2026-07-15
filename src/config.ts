import * as vscode from 'vscode';

import {
  CONFIG_SECTION,
  DEFAULT_NEWS_REFRESH_INTERVAL_SEC,
  DEFAULT_ROTATION_INTERVAL_SEC,
  DEFAULT_REFRESH_INTERVAL_SEC,
} from './constants';
import { ExchangeRateItem, StockConfig, StockItem } from './types';

export function getConfig(): StockConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const configuredStocks = config.get<StockItem[]>('stocks', []);
  const isNewsItem = (item: StockItem): boolean => item.code.trim().toUpperCase() === 'NEWS';
  const newsItem = configuredStocks.find(isNewsItem);
  const parsedNewsInterval = Number(newsItem?.name);

  return {
    rotationInterval: Math.max(1, config.get<number>('rotationInterval', DEFAULT_ROTATION_INTERVAL_SEC)),
    refreshInterval: Math.max(5, config.get<number>('refreshInterval', DEFAULT_REFRESH_INTERVAL_SEC)),
    newsRefreshInterval: newsItem
      ? Number.isFinite(parsedNewsInterval) && parsedNewsInterval > 0
        ? Math.max(1, parsedNewsInterval)
        : DEFAULT_NEWS_REFRESH_INTERVAL_SEC
      : null,
    enabled: config.get<boolean>('enabled', true),
    hidden: config.get<boolean>('hidden', false),
    showMarketIndexes: config.get<boolean>('showMarketIndexes', true),
    exchangeRates: config.get<ExchangeRateItem[]>('exchangeRates', []),
    stocks: configuredStocks.filter((item) => !isNewsItem(item)),
  };
}
