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

export function renderMobileNav(container: HTMLElement) {
  container.innerHTML = `
    <div style="display: flex; align-items: center; margin-right: 10px;">
      <span class="material-icons" style="color: #007f8b; font-size: 24px;">visibility</span>
    </div>
    <select id="mobile-task-select" class="mobile-task-select">
      <option value="#/driver/drowsiness">Driver Drowsiness Monitor</option>
    </select>
  `;

  const select = document.getElementById('mobile-task-select') as HTMLSelectElement;

  const updateSelect = () => {
    select.value = window.location.hash || '#/driver/drowsiness';
  };

  updateSelect();
  window.addEventListener('hashchange', updateSelect);

  select.addEventListener('change', (e) => {
    const target = (e.target as HTMLSelectElement).value;
    window.location.hash = target;
  });
}
