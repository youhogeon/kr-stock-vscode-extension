import * as https from 'https';

import { NEWS_DETAIL_URL, NEWS_URL } from '../constants';
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

interface NewsDetailApiResponse {
  id?: unknown;
  title?: unknown;
  content?: unknown;
  created_at?: unknown;
  source?: unknown;
}

export interface NewsDetail {
  id: string;
  title: string;
  source: string | null;
  createdAt: string | null;
  text: string;
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

function extractContentText(content: unknown): string {
  if (!Array.isArray(content)) { return ''; }

  return content
    .map((block) => {
      if (!block || typeof block !== 'object') { return ''; }
      const item = block as { type?: unknown; content?: unknown };
      if (item.type !== 'text' || typeof item.content !== 'string') { return ''; }
      return item.content.trim();
    })
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');
}

export async function fetchNewsDetail(id: string): Promise<NewsDetail> {
  const response = await fetchJson(NEWS_DETAIL_URL + encodeURIComponent(id)) as NewsDetailApiResponse;
  if (typeof response.title !== 'string') {
    throw new Error('SaveTicker news detail response is invalid');
  }

  return {
    id,
    title: response.title,
    source: typeof response.source === 'string' ? response.source : null,
    createdAt: typeof response.created_at === 'string' ? response.created_at : null,
    text: extractContentText(response.content),
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
