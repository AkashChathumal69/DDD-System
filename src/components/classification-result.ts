/**
 * Copyright 2026 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface ClassificationItem {
  label: string;
  score: number; // 0.0 to 1.0
}

export class ClassificationResult {
  private container: HTMLElement;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`ClassificationResult: container ${containerId} not found`);
    this.container = el;
    this.injectStyles();
  }

  private injectStyles() {
    if (!document.getElementById('classification-result-styles')) {
      const style = document.createElement('style');
      style.id = 'classification-result-styles';
      style.textContent = `
        .classification-item {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
          padding: 16px;
          background: var(--surface, #fff);
          border-radius: 12px;
          border: 1px solid var(--border-color, #eee);
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .class-name {
          width: 160px;
          flex-shrink: 0;
          font-weight: 600;
          font-size: 14px;
          color: var(--text-main, #333);
          text-transform: capitalize;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .class-bar-container {
          flex-grow: 1;
          background: #f0f2f5;
          height: 10px;
          border-radius: 5px;
          overflow: hidden;
          margin: 0 15px;
        }
        .class-bar {
          height: 100%;
          background: var(--primary, #007f8b);
          border-radius: 5px;
          transition: width 0.5s cubic-bezier(0.4, 0.0, 0.2, 1);
        }
        .class-score {
          width: 45px;
          text-align: right;
          font-family: 'Roboto Mono', monospace;
          font-size: 14px;
          font-weight: 500;
          color: var(--primary, #007f8b);
        }
      `;
      document.head.appendChild(style);
    }
  }

  public updateResults(results: ClassificationItem[]) {
    this.container.innerHTML = '';

    if (results.length === 0) {
      results = [{ label: 'No results', score: 0 }];
    }

    results.forEach((result) => {
      const scorePercent = Math.round(result.score * 100);
      const row = document.createElement('div');
      row.className = 'classification-item';
      row.innerHTML = `
        <span class="class-name">${result.label || 'Unknown'}</span>
        <div class="class-bar-container">
          <div class="class-bar" style="width: ${scorePercent}%"></div>
        </div>
        <span class="class-score">${scorePercent}%</span>
      `;
      this.container.appendChild(row);
    });
  }

  public clear() {
    this.container.innerHTML = '';
  }
}
