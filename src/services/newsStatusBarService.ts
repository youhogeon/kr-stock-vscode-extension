import * as vscode from 'vscode';

import {
  MARK_NEWS_AS_READ_COMMAND,
  OPEN_NEWS_COMMAND,
  SHOW_NEWS_COMMAND,
} from '../constants';
import { NewsItem } from '../types';

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  'reuters': '로이터',
  'financial-juice': '파이넨셜주스',
};

interface NewsQuickPickItem extends vscode.QuickPickItem {
  newsId: string | null;
}

export function formatSource(source: string | null): string {
  if (!source) { return ''; }

  return SOURCE_LABELS[source.trim().toLowerCase()] ?? source;
}

export function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) { return ''; }

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  return `${elapsedMinutes}분 전`;
}

export async function showNewsQuickPick(unreadNews: NewsItem[]): Promise<void> {
  if (unreadNews.length === 0) {
    vscode.window.showInformationMessage('새로운 뉴스가 없습니다.');
    return;
  }

  const newsItems: NewsQuickPickItem[] = unreadNews.map((item) => ({
    label: item.title,
    description: [formatSource(item.source), formatRelativeTime(item.createdAt)]
      .filter(Boolean)
      .join(' · '),
    newsId: item.id,
  }));

  const markAllAsReadItem: NewsQuickPickItem = {
    label: '$(check-all) 모두 읽음으로 표시',
    newsId: null,
  };

  const picked = await vscode.window.showQuickPick<NewsQuickPickItem>(
    [
      ...newsItems,
      { label: '', kind: vscode.QuickPickItemKind.Separator, newsId: null },
      markAllAsReadItem,
    ],
    { placeHolder: '열어볼 뉴스를 선택하세요' },
  );
  if (!picked) { return; }

  if (picked === markAllAsReadItem) {
    await vscode.commands.executeCommand(MARK_NEWS_AS_READ_COMMAND);
    return;
  }

  if (picked.newsId) {
    await vscode.commands.executeCommand(OPEN_NEWS_COMMAND, picked.newsId);
  }
}

export class NewsStatusBarService {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, -1);
    this.statusBarItem.name = 'KR Stock News';
    this.statusBarItem.command = SHOW_NEWS_COMMAND;
  }

  update(unreadNews: NewsItem[]): void {
    this.statusBarItem.text = unreadNews.length > 0 ? '$(rss)' : '$(issue-closed)';
    this.statusBarItem.tooltip = unreadNews.length > 0
      ? `안 읽은 뉴스 ${unreadNews.length}건 — 클릭해서 보기`
      : '새로운 뉴스가 없습니다.';
    this.statusBarItem.show();
  }

  setLoading(): void {
    this.statusBarItem.text = '$(rss)';
    this.statusBarItem.tooltip = '최신 뉴스를 불러오는 중입니다...';
    this.statusBarItem.show();
  }

  setError(): void {
    this.statusBarItem.text = '$(rss)';
    this.statusBarItem.tooltip = '최신 뉴스를 가져오지 못했습니다.';
    this.statusBarItem.show();
  }

  hide(): void {
    this.statusBarItem.hide();
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
