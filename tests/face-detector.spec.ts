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

test.describe('Face Detector Task', () => {
  let imagePath: string;

  test.beforeAll(() => {
    imagePath = path.resolve(__dirname, '..', 'public', 'dog.jpg');
  });

  test.beforeEach(async ({ page }) => {
    // Clear local storage to ensure fresh start
    await page.addInitScript(() => window.localStorage.clear());

    page.on('console', msg => {
      if (msg.type() === 'error') console.error(`[BROWSER ERROR] ${msg.text()}`);
    });

    // Route model to local asset
    await page.route('**/blaze_face_short_range.tflite', route => {
      const assetPath = path.join(__dirname, 'assets', 'blaze_face_short_range.tflite');
      route.fulfill({ path: assetPath });
    });

    await page.goto('#/vision/face_detector');
    await expect(page.locator('#status-message')).toHaveText(/(Model loaded\. Ready\.)|(Ready)|(Done)/, { timeout: 30000 });
  });

  test('should load model, handle image upload and render bounding boxes', async ({ page }) => {
    // Check defaults
    await expect(page.locator('.model-select')).toHaveValue('blaze_face_short_range');

    // Upload Image
    await page.click('#view-mode-toggle button[data-value="image"]');
    await page.locator('#image-upload').setInputFiles(imagePath);

    // Wait for processing to complete specifically
    await expect(page.locator('#status-message')).toHaveText(/Done/, { timeout: 30000 });

    // Verify inference time is displayed
    const inferenceTime = page.locator('#inference-time');
    await expect(inferenceTime).toContainText('ms');

    // Verify canvas pixels (bounding boxes drawn)
    const hasOverlayPixels = await page.locator('#image-canvas').evaluate((canvas) => {
      const ctx = (canvas as HTMLCanvasElement).getContext('2d');
      if (!ctx) return false;

      const { width, height } = canvas as HTMLCanvasElement;
      const imageData = ctx.getImageData(0, 0, width, height).data;

      for (let i = 3; i < imageData.length; i += 4) {
        if (imageData[i] !== 0) {
          return true;
        }
      }

      return false;
    });

    expect(hasOverlayPixels).toBe(true);
  });


  test('should support webcam toggling', async ({ page }) => {
    await page.click('#view-mode-toggle button[data-value="video"]');
    await page.waitForSelector('#webcamButton:not([disabled])');
    await expect(page.locator('#webcamButton')).not.toHaveText('Initializing...', { timeout: 15000 });
  });
});
