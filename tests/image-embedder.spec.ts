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

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Image Embedder Task', () => {
  let imagePath: string;

  test.beforeAll(() => {
    imagePath = path.resolve(__dirname, '..', 'public', 'dog.jpg');
  });

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`[Browser Console]: ${msg.text()}`));
    page.on('pageerror', error => console.error(`[Browser Error]: ${error}`));

    await page.goto('/#/vision/image_embedder');
    await expect(page.locator('#status-message')).toHaveText(/(Ready)|(Model loaded)/, { timeout: 60000 });
  });

  test('should compute similarity between two images', async ({ page }) => {
    // Step 1: Ensure we are explicitly on CPU since GPU embedding might hang in headless CI
    await page.selectOption('#delegate-select', 'CPU');
    await expect(page.locator('#status-message')).toHaveText(/(Done)|(Ready)|(Model loaded)/, { timeout: 30000 });

    // Step 2: Upload first image directly using input
    await page.setInputFiles('#image-upload-1', imagePath);
    await expect(page.locator('#display-area-1')).toHaveClass(/has-image/, { timeout: 15000 });
    
    // Step 3: Upload second image
    await page.setInputFiles('#image-upload-2', imagePath);
    await expect(page.locator('#display-area-2')).toHaveClass(/has-image/, { timeout: 15000 });

    // Step 4: Verify computation lifecycle
    const statusVal = page.locator('#status-message');
    await expect(statusVal).toHaveText(/(Computing\.\.\.)|(Done)/, { timeout: 30000 });
    await expect(statusVal).toHaveText('Done', { timeout: 30000 });

    // Step 5: Validate similarity result
    const valueEl = page.locator('#similarity-value');
    await expect(valueEl).toBeVisible({ timeout: 15000 });
    await expect(valueEl).not.toHaveText('--', { timeout: 30000 });
    
    const valueText = await valueEl.innerText();
    const value = parseFloat(valueText);
    expect(value).toBeGreaterThan(0.9);
  });
});
