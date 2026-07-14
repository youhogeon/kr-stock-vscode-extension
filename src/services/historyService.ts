import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MarketIndex, HistoryData, PricePoint } from '../types';

const DATA_DIR = path.join(os.homedir(), '.kr-stock');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function today(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nowTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function parseValue(value: string): number {
  return parseFloat(value.replace(/,/g, ''));
}

function readHistory(): HistoryData {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const data: HistoryData = JSON.parse(raw);
    if (data.date === today()) {
      return data;
    }
  } catch {
    // ignore
  }
  return { date: today(), series: {} };
}

function writeHistory(data: HistoryData): void {
  try {
    ensureDataDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data), 'utf-8');
  } catch {
    // ignore
  }
}

export function appendHistory(markets: MarketIndex[]): void {
  const data = readHistory();
  const time = nowTime();

  for (const m of markets) {
    if (!data.series[m.label]) {
      data.series[m.label] = [];
    }
    const points = data.series[m.label];
    if (points.length > 0 && points[points.length - 1].time === time) {
      points[points.length - 1].value = parseValue(m.value);
      points[points.length - 1].changeRate = m.changeRate;
    } else {
      points.push({ time, value: parseValue(m.value), changeRate: m.changeRate });
    }
  }

  writeHistory(data);
}

export function getHistory(): HistoryData {
  return readHistory();
}
