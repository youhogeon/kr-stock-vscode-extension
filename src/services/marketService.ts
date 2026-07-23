import * as https from 'https';
import {
  KOSPI_URL,
  KOSDAQ_URL,
  KOSPI_LABEL,
  KOSDAQ_LABEL,
  STOCK_ITEM_URL,
  EXCHANGE_RATE_URL,
  ESIGNAL_SPARKLINE_URL,
  ESIGNAL_REFERER,
  FUTURE_KEYS,
} from '../constants';
import { ExchangeRateItem, MarketIndex, StockItem } from '../types';

const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; KR-Stock/0.1)';

function fetchHtml(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        ...extraHeaders,
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Naver Finance returned HTTP ${res.statusCode ?? 'unknown'}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
      res.on('end', () => {
        // The index pages use EUC-KR, but all markup and values parsed below are ASCII.
        resolve(Buffer.concat(chunks).toString('latin1'));
      });
      res.on('error', reject);
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Naver Finance request timed out'));
    });
    request.on('error', reject);
  });
}

function elementHtmlById(html: string, id: string, maxLength = 1_000): string | null {
  const pattern = new RegExp(`<[^>]+\\bid\\s*=\\s*["']${id}["'][^>]*>`, 'i');
  const match = pattern.exec(html);
  return match ? html.slice(match.index, match.index + maxLength) : null;
}

function elementHtmlByClass(html: string, tag: string, className: string): string | null {
  const pattern = new RegExp(
    `<${tag}\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    'i',
  );
  const match = pattern.exec(html);
  if (!match) { return null; }

  const end = html.indexOf(`</${tag}>`, match.index + match[0].length);
  return html.slice(match.index, end === -1 ? match.index + 1_000 : end + tag.length + 3);
}

function formatRate(value: string, isDown = false): string | null {
  const rate = parseFloat(value.replace(/\s/g, ''));
  if (!Number.isFinite(rate)) { return null; }

  const signedRate = isDown ? -Math.abs(rate) : rate;
  const sign = signedRate >= 0 ? '+' : '';
  return `${sign}${signedRate.toFixed(2)}%`;
}

function parseIndexData(html: string, label: string): MarketIndex | null {
  const valueHtml = elementHtmlById(html, 'now_value');
  const rateHtml = elementHtmlById(html, 'change_value_and_rate');
  const value = valueHtml?.match(/>([\d,]+(?:\.\d+)?)</)?.[1];
  const rate = rateHtml?.match(/([+-]?\s*\d+(?:\.\d+)?)\s*%/)?.[1];
  if (!value || !rate) { return null; }

  return { label, value, changeRate: formatRate(rate) ?? rate };
}

function parseExchangeRateData(html: string, name: string): MarketIndex | null {
  const todayHtml = elementHtmlByClass(html, 'p', 'no_today');
  const exdayHtml = elementHtmlByClass(html, 'p', 'no_exday');
  if (!todayHtml || !exdayHtml) { return null; }

  const valueText = todayHtml.replace(/<[^>]+>/g, '').replace(/\s/g, '');
  const rateText = exdayHtml.replace(/<[^>]+>/g, '').replace(/\s/g, '');
  const value = valueText.match(/\d[\d,]*(?:\.\d+)?/)?.[0];
  const rate = rateText.match(/([+-]?\d+(?:\.\d+)?)%/)?.[1];
  if (!value || !rate) { return null; }

  const changeRate = formatRate(rate);
  return changeRate ? { label: name, value, changeRate } : null;
}

function parseStockData(html: string, name: string): MarketIndex | null {
  const marketStatusHtml = elementHtmlById(html, 'market_status');
  const isAfterMarket = marketStatusHtml ? /After-Market/i.test(marketStatusHtml) : false;
  const nxtHtml = isAfterMarket ? elementHtmlById(html, 'rate_info_nxt', 15_000) : null;
  const exchangeHtml = nxtHtml ?? elementHtmlById(html, 'rate_info_krx', 15_000);
  if (!exchangeHtml) { return null; }

  const todayHtml = elementHtmlByClass(exchangeHtml, 'p', 'no_today');
  const exdayHtml = elementHtmlByClass(exchangeHtml, 'p', 'no_exday');
  const value = todayHtml?.match(/<span\b[^>]*class\s*=\s*["']blind["'][^>]*>\s*([\d,]+)\s*<\/span>/i)?.[1];
  const exdayValues = exdayHtml
    ? Array.from(exdayHtml.matchAll(/<span\b[^>]*class\s*=\s*["']blind["'][^>]*>\s*([\d,]+(?:\.\d+)?)\s*<\/span>/gi))
    : [];
  const rate = exdayValues.at(-1)?.[1];
  if (!value || !rate || !exdayHtml) { return null; }

  const isDown = /class\s*=\s*["'][^"']*\b(?:no_down|minus|down)\b/i.test(exdayHtml);
  const changeRate = formatRate(rate, isDown);
  return changeRate ? { label: name, value, changeRate } : null;
}

async function fetchIndex(url: string, label: string): Promise<MarketIndex | null> {
  try {
    return parseIndexData(await fetchHtml(url), label);
  } catch {
    return null;
  }
}

async function fetchStock(item: StockItem): Promise<MarketIndex | null> {
  try {
    return parseStockData(await fetchHtml(`${STOCK_ITEM_URL}${encodeURIComponent(item.code)}`), item.name);
  } catch {
    return null;
  }
}

function parseFutureData(js: string, key: string, name: string): MarketIndex | null {
  // esignal serves `var sl_close_<key> = 'CURRENT (CHANGE)';` where CHANGE is an
  // absolute point delta. We convert it to a percentage to match every other item.
  const closeMatch = new RegExp(`sl_close_${key}\\s*=\\s*'([^']*)'`).exec(js);
  const raw = closeMatch?.[1];
  const parts = raw?.match(/^([\d,]+(?:\.\d+)?)\s*\(([+-]?[\d,]+(?:\.\d+)?)\)/);
  if (!parts) { return null; }

  const value = parts[1];
  const current = parseFloat(value.replace(/,/g, ''));
  const change = parseFloat(parts[2].replace(/,/g, ''));
  const previous = current - change;
  if (!Number.isFinite(current) || !Number.isFinite(change) || previous === 0) { return null; }

  const changeRate = formatRate(String((change / previous) * 100));
  return changeRate ? { label: name, value, changeRate } : null;
}

async function fetchFuture(item: StockItem, key: string): Promise<MarketIndex | null> {
  try {
    const url = `${ESIGNAL_SPARKLINE_URL}${key}.js?cb=${Date.now()}`;
    const js = await fetchHtml(url, { Referer: ESIGNAL_REFERER, Accept: '*/*' });
    return parseFutureData(js, key, item.name);
  } catch {
    return null;
  }
}

async function fetchExchangeRate(item: ExchangeRateItem): Promise<MarketIndex | null> {
  try {
    const code = item.code.trim().toUpperCase();
    if (!/^[A-Z]{6}$/.test(code)) { return null; }

    return parseExchangeRateData(
      await fetchHtml(`${EXCHANGE_RATE_URL}${encodeURIComponent(code)}`),
      item.name,
    );
  } catch {
    return null;
  }
}

export async function fetchAllMarkets(
  stocks: StockItem[],
  showMarketIndexes = true,
  exchangeRates: ExchangeRateItem[] = [],
): Promise<MarketIndex[]> {
  const indexPromises = showMarketIndexes
    ? [fetchIndex(KOSPI_URL, KOSPI_LABEL), fetchIndex(KOSDAQ_URL, KOSDAQ_LABEL)]
    : [];
  const promises: Promise<MarketIndex | null>[] = [
    ...indexPromises,
    ...exchangeRates.map((item) => fetchExchangeRate(item)),
    ...stocks.map((s) => {
      const futureKey = FUTURE_KEYS[s.code.trim().toUpperCase()];
      return futureKey ? fetchFuture(s, futureKey) : fetchStock(s);
    }),
  ];

  const results = await Promise.all(promises);
  return results.filter((r): r is MarketIndex => r !== null);
}
