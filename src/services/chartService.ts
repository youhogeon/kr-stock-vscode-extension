import * as vscode from 'vscode';
import { HistoryData } from '../types';

let panel: vscode.WebviewPanel | undefined;

export function showChart(historyData: HistoryData): void {
  if (panel) {
    panel.reveal();
  } else {
    panel = vscode.window.createWebviewPanel(
      'krStockChart',
      'Stock Chart',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    panel.onDidDispose(() => { panel = undefined; });
  }

  panel.webview.html = buildHtml(historyData);
}

function buildHtml(data: HistoryData): string {
  const labels = Object.keys(data.series);
  if (labels.length === 0) {
    return `<!DOCTYPE html>
<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888;">
<p>No data collected yet. Data is recorded every refresh interval.</p>
</body></html>`;
  }

  const colors = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#34495e', '#e91e63', '#00bcd4',
  ];

  const allTimes = new Set<string>();
  for (const label of labels) {
    for (const p of data.series[label]) {
      allTimes.add(p.time);
    }
  }
  const sortedTimes = Array.from(allTimes).sort();

  const datasetsForChart = labels.map((label, i) => {
    const pointMap = new Map(data.series[label].map(p => [p.time, p.value]));
    const values = sortedTimes.map(t => pointMap.get(t) ?? null);
    const color = colors[i % colors.length];
    return {
      label,
      data: values,
      borderColor: color,
      backgroundColor: color + '20',
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 8,
      pointHitRadius: 15,
      tension: 0.3,
      fill: false,
      spanGaps: true,
    };
  });

  // changeRate lookup: rateMap[label][time] = changeRate
  const rateMap: Record<string, Record<string, string>> = {};
  for (const label of labels) {
    rateMap[label] = {};
    for (const p of data.series[label]) {
      rateMap[label][p.time] = p.changeRate || '';
    }
  }

  const chartData = JSON.stringify({
    labels: sortedTimes,
    datasets: datasetsForChart,
  });

  const rateMapJson = JSON.stringify(rateMap);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 0;
      padding: 16px;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #ccc);
      font-family: var(--vscode-font-family, sans-serif);
    }
    h2 { margin: 0 0 12px 0; font-size: 15px; font-weight: 500; }
    .chart-container {
      position: relative;
      width: 100%;
      height: 300px;
      margin-bottom: 24px;
    }
  </style>
</head>
<body>
  <h2>Stock Price Trend — ${data.date}</h2>
  ${labels.map((label, i) => `
  <div>
    <h3 style="font-size:13px;margin:16px 0 4px 0;color:${colors[i % colors.length]}">${label}</h3>
    <div class="chart-container">
      <canvas id="chart-${i}"></canvas>
    </div>
  </div>`).join('')}

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <script>
    const allData = ${chartData};
    const rateMap = ${rateMapJson};
    const gridColor = 'rgba(128,128,128,0.2)';
    const tickColor = 'rgba(200,200,200,0.7)';

    allData.datasets.forEach((ds, i) => {
      const ctx = document.getElementById('chart-' + i).getContext('2d');
      const dsLabel = ds.label;
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: allData.labels,
          datasets: [{
            ...ds,
            fill: true,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  if (ctx.parsed.y == null) return '';
                  const time = allData.labels[ctx.dataIndex];
                  const rate = rateMap[dsLabel] && rateMap[dsLabel][time] || '';
                  const price = ctx.parsed.y.toLocaleString();
                  return rate ? price + '  (' + rate + ')' : price;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: { color: tickColor, maxTicksLimit: 20, font: { size: 10 } }
            },
            y: {
              grid: { color: gridColor },
              ticks: {
                color: tickColor,
                font: { size: 10 },
                callback: function(v) { return v.toLocaleString(); }
              }
            }
          }
        }
      });
    });
  </script>
</body>
</html>`;
}
