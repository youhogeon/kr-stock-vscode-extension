import * as vscode from 'vscode';
import { MarketIndex } from '../types';

export class StatusBarService {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
    this.statusBarItem.command = 'krStock.showChart';
  }

  show(): void {
    this.statusBarItem.show();
  }

  hide(): void {
    this.statusBarItem.hide();
  }

  update(current: MarketIndex, allMarkets: MarketIndex[]): void {
    this.statusBarItem.text = `${current.label} ${current.value} (${current.changeRate})`;
    this.statusBarItem.tooltip = this.buildTooltip(allMarkets);
    this.statusBarItem.show();
  }

  setLoading(): void {
    this.statusBarItem.text = 'Stock: Loading...';
    this.statusBarItem.tooltip = 'Loading market data...';
    this.statusBarItem.show();
  }

  setError(): void {
    this.statusBarItem.text = 'Stock: Error';
    this.statusBarItem.tooltip = 'Failed to fetch market data';
    this.statusBarItem.show();
  }

  private buildTooltip(allMarkets: MarketIndex[]): vscode.MarkdownString {
    const rows: string[] = [];
    rows.push('| | | |');
    rows.push('|:---|---:|---:|');

    for (const m of allMarkets) {
      const rateNum = parseFloat(m.changeRate);
      const icon = isNaN(rateNum) ? '⬜' : rateNum > 0 ? '🔴' : rateNum < 0 ? '🔵' : '⬜';
      rows.push(`| ${icon} **${m.label}** | ${m.value} | ${m.changeRate} |`);
    }

    const md = new vscode.MarkdownString(rows.join('\n'), true);
    md.isTrusted = true;
    return md;
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
