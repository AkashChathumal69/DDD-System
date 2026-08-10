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

/**
 * Shared component for toggling between views (e.g. Webcam vs Image).
 */
export interface ViewOption {
  label: string;
  value: string;
  icon?: string;
}

export type ViewToggleCallback = (value: string) => void;
export type ViewToggleStyle = 'pills' | 'tabs';

export class ViewToggle {
  private container: HTMLElement;
  private options: ViewOption[];
  private callback: ViewToggleCallback;
  private activeValue: string;
  private customStyle: ViewToggleStyle;

  constructor(
    containerId: string,
    options: ViewOption[],
    defaultValue: string,
    callback: ViewToggleCallback,
    customStyle: ViewToggleStyle = 'pills'
  ) {
    const element = document.getElementById(containerId);
    if (!element) {
      throw new Error(`Container element with id '${containerId}' not found.`);
    }
    this.container = element;
    this.options = options;
    this.callback = callback;
    this.activeValue = defaultValue;
    this.customStyle = customStyle;

    this.render();
  }

  private render() {
    const containerClass = this.customStyle === 'tabs' ? 'tabs-container' : 'view-tabs';
    const buttonClass = this.customStyle === 'tabs' ? 'tab-button' : 'view-tab';

    this.container.classList.add(containerClass);
    this.container.innerHTML = '';

    this.options.forEach((option) => {
      const button = document.createElement('button');
      button.classList.add(buttonClass);
      button.dataset.value = option.value;

      if (option.icon) {
        button.innerHTML = `<span class="material-icons">${option.icon}</span> ${option.label}`;
      } else {
        button.textContent = option.label;
      }

      if (option.value === this.activeValue) {
        button.classList.add('active');
      }

      button.addEventListener('click', () => {
        this.setActive(option.value);
      });

      this.container.appendChild(button);
    });
  }

  public setActive(value: string) {
    const isSame = this.activeValue === value;
    this.activeValue = value;

    const buttonClass = this.customStyle === 'tabs' ? '.tab-button' : '.view-tab';
    const buttons = this.container.querySelectorAll(buttonClass);
    buttons.forEach((btn) => {
      if ((btn as HTMLElement).dataset.value === value) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (!isSame) {
      this.callback(value);
    }
  }
}
