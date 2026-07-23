export const CONFIG_SECTION = 'krStock';
export const OPEN_NEWS_COMMAND = 'krStock.openNews';
export const MARK_NEWS_AS_READ_COMMAND = 'krStock.markNewsAsRead';
export const SHOW_NEWS_COMMAND = 'krStock.showNews';

export const KOSPI_URL = 'https://finance.naver.com/sise/sise_index.naver?code=KOSPI';
export const KOSDAQ_URL = 'https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ';

export const KOSPI_LABEL = 'KP';
export const KOSDAQ_LABEL = 'KQ';

export const STOCK_ITEM_URL = 'https://finance.naver.com/item/main.naver?code=';
export const EXCHANGE_RATE_URL = 'https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_';
export const ESIGNAL_SPARKLINE_URL = 'https://esignal.co.kr/data/sparkline_';
export const ESIGNAL_REFERER = 'https://esignal.co.kr/';

// Special stock codes routed to esignal.co.kr futures quotes instead of Naver Finance.
// Maps the config `code` to esignal's sparkline data key.
export const FUTURE_KEYS: Record<string, string> = {
  FUTURE_KP: 'day',        // 코스피 주간선물
  FUTURE_KP_NIGHT: 'ngt',  // 코스피 야간선물
  FUTURE_SNP: 'spx',       // S&P 선물
  FUTURE_NASDAQ: 'nasdaq', // 나스닥 선물
  FUTURE_WTI: 'oil',       // WTI 선물
  FUTURE_GOLD: 'gold',     // 금 선물
};

export const NEWS_URL = 'https://saveticker.com/api/news/list?page=1&page_size=20&sort=created_at_desc&label_group=1&label_name=1';
export const NEWS_ITEM_URL = 'https://saveticker.com/news/';
export const NEWS_DETAIL_URL = 'https://saveticker.com/api/news/detail?id=';
export const NEWS_TEXT_SCHEME = 'kr-stock-news';

// Fetch stays at page_size=20, but news accumulates across refreshes so that
// unread items can pile up. Cap the retained pool to avoid unbounded growth.
export const MAX_NEWS_ITEMS = 1000;

// Only news created within this window is surfaced to the user; older items
// stay in the cache (up to MAX_NEWS_ITEMS) but are not shown.
export const NEWS_DISPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_ROTATION_INTERVAL_SEC = 5;
export const DEFAULT_REFRESH_INTERVAL_SEC = 30;
export const DEFAULT_NEWS_REFRESH_INTERVAL_SEC = 60;
