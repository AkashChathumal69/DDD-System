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

test.describe('Language Detector Task', () => {
  test.beforeEach(async ({ page }) => {
    // Route model to local asset
    await page.route('**/language_detector.tflite', route => {
      const assetPath = path.join(__dirname, 'assets', 'language_detector.tflite');
      route.fulfill({ path: assetPath });
    });

    await page.goto('#/text/language_detector');
    await expect(page.locator('#status-message')).toHaveText(/(Ready)|(Model loaded)/, { timeout: 30000 });
  });

  test('should detect language of text', async ({ page }) => {
    const detectBtn = page.locator('#detect-btn');
    await expect(detectBtn).toBeEnabled();

    // Input text
    await page.fill('#text-input', 'El mundo es un pañuelo.');
    await detectBtn.click();

    // Wait for results
    const resultsContainer = page.locator('#detection-results');
    await expect(resultsContainer).not.toBeEmpty();

    // Check for Spanish (es)
    await expect(resultsContainer).toContainText('es');

    // Verify inference time
    const inferenceTime = page.locator('#inference-time');
    await expect(inferenceTime).toContainText('Inference Time:');
    await expect(inferenceTime).not.toContainText('- ms');
  });

  test('should handle sample buttons', async ({ page }) => {
    // Click French sample
    await page.click('button:has-text("French")');
    // Selector: button with text "French"
    const frenchBtn = page.locator('button:has-text("French")');
    await frenchBtn.click();

    const resultsContainer = page.locator('#detection-results');
    await expect(resultsContainer).toContainText('fr', { timeout: 5000 });
  });
});
