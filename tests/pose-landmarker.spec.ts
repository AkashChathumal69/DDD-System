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

test.describe('Pose Landmarker Task', () => {
  let imagePath: string;

  test.beforeAll(() => {
    imagePath = path.resolve(__dirname, '..', 'public', 'pose_model.png');
  });

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      // Filter out overly noisy WebGL verbose logs from Chromium if desired
      if (msg.type() === 'error') console.log(`[BROWSER ERROR] ${msg.text()}`);
    });

    // Clear local storage
    await page.addInitScript(() => window.localStorage.clear());
    
    // Navigate to Pose Landmarker
    await page.goto('#/vision/pose_landmarker');
    await page.waitForSelector('h2:has-text("Pose Landmarker")');
    
    // Wait for model to load
    await expect(page.locator('#status-message')).toHaveText(/(Model loaded\. Ready\.)|(Ready)|(Done)/, { timeout: 60000 });
  });

  test('should load model and handle image upload', async ({ page }) => {
    // Check defaults
    await expect(page.locator('.model-select')).toHaveValue('pose_landmarker_lite');
    
    // Check default delegate (likely GPU, but might vary)
    // We won't assert exact value as it might vary by env, but button should be enabled.
    await expect(page.locator('#webcamButton')).toBeEnabled();

    // Verify default image detection triggered automatically or manually
    // The template has a default image, logic attempts to detect it on load
    await expect(page.locator('#status-message')).toHaveText(/(Done)|(Ready)|(Model loaded)/, { timeout: 30000 });
    
    // Verify inference time is displayed (if detection ran)
    // If not, we trigger upload
    const inferenceTime = page.locator('#inference-time');
    
    // Switch to Image tab explicitly to be safe
    await page.click('#view-mode-toggle button[data-value="image"]');
    
    // Upload Image
    await page.setInputFiles('#image-upload', imagePath);

    // Wait for processing
    await expect(page.locator('#status-message')).toHaveText(/(Done)|(Ready)|(Model loaded)/, { timeout: 30000 });

    // Verify inference time is displayed
    await expect(inferenceTime).toContainText('ms');
    await expect(inferenceTime).not.toContainText('- ms');
  });

  test('should support webcam toggling', async ({ page }) => {
    await page.click('#view-mode-toggle button[data-value="video"]');
    await page.waitForSelector('#webcamButton:not([disabled])');

    // Wait for App to mount constraints via getUserMedia()
    await expect(page.locator('#webcamButton')).not.toHaveText('Initializing...', { timeout: 15000 });

    // Enable Webcam    
    if (await page.locator('#webcamButton').innerText() === 'Enable Webcam') {
        await page.click('#webcamButton');
    }

    await expect(page.locator('#status-message')).toHaveText(/(Webcam running\.\.\.)|(Done)|(Ready)/, { timeout: 15000 });
    
    // Disable
    await page.click('#webcamButton');
    await expect(page.locator('#webcamButton')).toHaveText('Enable Webcam', { timeout: 10000 });
  });

  test('should handle delegate switching', async ({ page }) => {
    // Switch to CPU
    await page.selectOption('#delegate-select', 'CPU');
    // Wait for reload
    await expect(page.locator('#status-message')).toHaveText(/(Model loaded\. Ready\.)|(Ready)|(Done)/, { timeout: 60000 });
  });
});
