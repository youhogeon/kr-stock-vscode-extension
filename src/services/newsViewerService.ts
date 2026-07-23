import * as vscode from 'vscode';

import { NEWS_ITEM_URL, NEWS_TEXT_SCHEME } from '../constants';
import { NewsDetail } from './newsService';
import { formatRelativeTime, formatSource } from './newsStatusBarService';

const MAX_CACHED_DOCUMENTS = 20;

const documentContents = new Map<string, string>();

class NewsTextContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    return documentContents.get(uri.toString()) ?? '뉴스 본문을 찾을 수 없습니다. 목록에서 다시 열어주세요.';
  }
}

export function registerNewsViewer(): vscode.Disposable {
  return vscode.workspace.registerTextDocumentContentProvider(
    NEWS_TEXT_SCHEME,
    new NewsTextContentProvider(),
  );
}

function buildDocumentText(detail: NewsDetail): string {
  const metadata = [
    formatSource(detail.source),
    detail.createdAt ? formatRelativeTime(detail.createdAt) : '',
  ].filter(Boolean).join(' · ');

  const lines = [`# ${detail.title}`, ''];
  if (metadata) { lines.push(`**${metadata}**`, ''); }
  lines.push('---', '');
  lines.push(detail.text || '(본문이 없는 기사입니다.)');
  lines.push('', `[원문 보기](${NEWS_ITEM_URL}${encodeURIComponent(detail.id)})`);
  return lines.join('\n');
}

export async function openNewsDocument(detail: NewsDetail): Promise<void> {
  const safeTitle = detail.title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || detail.id;
  const uri = vscode.Uri.from({
    scheme: NEWS_TEXT_SCHEME,
    path: `/${safeTitle}`,
    query: `id=${encodeURIComponent(detail.id)}`,
  });

  documentContents.set(uri.toString(), buildDocumentText(detail));
  while (documentContents.size > MAX_CACHED_DOCUMENTS) {
    const oldestKey = documentContents.keys().next().value;
    if (oldestKey === undefined) { break; }
    documentContents.delete(oldestKey);
  }

  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.languages.setTextDocumentLanguage(document, 'markdown');
  await vscode.window.showTextDocument(document, { preview: true });
}
