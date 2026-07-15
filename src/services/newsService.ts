import * as https from 'https';

import { NEWS_URL } from '../constants';
import { NewsItem } from '../types';

const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; KR-Stock/0.1)';

interface NewsApiItem {
  id?: unknown;
  title?: unknown;
  created_at?: unknown;
  source?: unknown;
}

interface NewsApiResponse {
  news_list?: unknown;
}

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`SaveTicker returned HTTP ${res.statusCode ?? 'unknown'}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        } catch {
          reject(new Error('SaveTicker returned invalid JSON'));
        }
      });
      res.on('error', reject);
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('SaveTicker request timed out'));
    });
    request.on('error', reject);
  });
}

function parseNewsItem(value: unknown): NewsItem | null {
  if (!value || typeof value !== 'object') { return null; }

  const item = value as NewsApiItem;
  if (
    (typeof item.id !== 'string' && typeof item.id !== 'number')
    || typeof item.title !== 'string'
    || typeof item.created_at !== 'string'
  ) {
    return null;
  }

  return {
    id: String(item.id),
    title: item.title,
    createdAt: item.created_at,
    source: typeof item.source === 'string' ? item.source : null,
  };
}

export async function fetchLatestNews(): Promise<NewsItem[]> {
  const response = await fetchJson(NEWS_URL) as NewsApiResponse;
  if (!Array.isArray(response.news_list)) {
    throw new Error('SaveTicker response does not contain a news list');
  }

  return response.news_list
    .map(parseNewsItem)
    .filter((item): item is NewsItem => item !== null);
}
