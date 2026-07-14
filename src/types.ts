export interface MarketIndex {
  label: string;
  value: string;
  changeRate: string;
}

export interface StockItem {
  code: string;
  name: string;
}

export interface ExchangeRateItem {
  code: string;
  name: string;
}

export interface StockConfig {
  rotationInterval: number;
  refreshInterval: number;
  enabled: boolean;
  showMarketIndexes: boolean;
  exchangeRates: ExchangeRateItem[];
  stocks: StockItem[];
}

export interface PricePoint {
  time: string;   // HH:mm
  value: number;
  changeRate: string;
}

export interface HistoryData {
  date: string;    // YYYY-MM-DD
  series: Record<string, PricePoint[]>;  // label -> points
}
