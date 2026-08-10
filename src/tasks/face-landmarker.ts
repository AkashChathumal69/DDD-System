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

import { FaceLandmarkerResult, DrawingUtils, FaceLandmarker } from '@mediapipe/tasks-vision';
import { BaseVisionTask } from '../components/base-vision-task';

// @ts-ignore
import template from '../templates/face-landmarker.html?raw';
// @ts-ignore

class FaceLandmarkerTask extends BaseVisionTask {
  private drawingUtils: DrawingUtils | undefined;

  private numFaces = 1;
  private minFaceDetectionConfidence = 0.5;
  private minFacePresenceConfidence = 0.5;
  private minTrackingConfidence = 0.5;
  private earThreshold = 0.22;
  private marThreshold = 0.2;
  private blinkRateThreshold = 24;
  private latestEar = 0;
  private latestMar = 0;
  private latestBlinkRate = 0;
  private blinkCount = 0;
  private blinkState: 'open' | 'closed' = 'open';
  private sessionStartedAt = performance.now();

  protected override onInitializeUI() {
    const setupSlider = (id: string, onChange: (val: number) => void) => {
      const input = document.getElementById(id) as HTMLInputElement;
      const valueDisplay = document.getElementById(`${id}-value`)!;
      if (input && valueDisplay) {
        input.addEventListener('input', () => {
          const val = parseFloat(input.value);
          valueDisplay.innerText = val.toString();
          onChange(val);
        });
      }
    };

    setupSlider('min-face-detection-confidence', (val) => {
      this.minFaceDetectionConfidence = val;
      this.worker?.postMessage({ type: 'SET_OPTIONS', minFaceDetectionConfidence: this.minFaceDetectionConfidence });
      this.triggerRedetection();
    });

    setupSlider('min-face-presence-confidence', (val) => {
      this.minFacePresenceConfidence = val;
      this.worker?.postMessage({ type: 'SET_OPTIONS', minFacePresenceConfidence: this.minFacePresenceConfidence });
      this.triggerRedetection();
    });

    setupSlider('min-tracking-confidence', (val) => {
      this.minTrackingConfidence = val;
      this.worker?.postMessage({ type: 'SET_OPTIONS', minTrackingConfidence: this.minTrackingConfidence });
      this.triggerRedetection();
    });

    setupSlider('num-faces', (val) => {
      this.numFaces = val;
      this.worker?.postMessage({ type: 'SET_OPTIONS', numFaces: this.numFaces });
      this.triggerRedetection();
    });

    setupSlider('ear-threshold', (val) => {
      this.earThreshold = val;
      this.renderStatusSummary();
    });

    setupSlider('mar-threshold', (val) => {
      this.marThreshold = val;
      this.renderStatusSummary();
    });

    setupSlider('blink-rate-threshold', (val) => {
      this.blinkRateThreshold = val;
      this.renderStatusSummary();
    });

    this.models = {
      face_landmarker:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    };

    if (this.modelSelector) {
      this.modelSelector.updateOptions([{ label: 'Face Landmarker', value: 'face_landmarker', isDefault: true }]);
    }

    this.renderStatusSummary();
  }

  private triggerRedetection() {
    if (this.runningMode === 'IMAGE') {
      const testImage = document.getElementById('test-image') as HTMLImageElement;
      if (testImage && testImage.src) {
        this.detectImage(testImage);
      }
    }
  }

  protected override getWorkerInitParams(): Record<string, any> {
    return {
      numFaces: this.numFaces,
      minFaceDetectionConfidence: this.minFaceDetectionConfidence,
      minFacePresenceConfidence: this.minFacePresenceConfidence,
      minTrackingConfidence: this.minTrackingConfidence,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    };
  }

  protected override displayImageResult(result: FaceLandmarkerResult) {
    const imageCanvas = document.getElementById('image-canvas') as HTMLCanvasElement;
    const testImage = document.getElementById('test-image') as HTMLImageElement;
    const ctx = imageCanvas.getContext('2d')!;

    imageCanvas.width = testImage.naturalWidth;
    imageCanvas.height = testImage.naturalHeight;

    ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    ctx.beginPath();
    ctx.rect(0, 0, imageCanvas.width, imageCanvas.height);
    ctx.clip();

    if (result.faceLandmarks) {
      if (!this.drawingUtils) this.drawingUtils = new DrawingUtils(ctx);
      else this.drawingUtils = new DrawingUtils(ctx);

      for (const landmarks of result.faceLandmarks) {
        this.updateDrowsinessMetrics(landmarks);
        this.drawLandmarks(this.drawingUtils, landmarks);
      }
    } else {
      this.updateDrowsinessMetrics(undefined);
    }
  }

  protected override displayVideoResult(result: FaceLandmarkerResult) {
    this.canvasElement.width = this.video.videoWidth;
    this.canvasElement.height = this.video.videoHeight;
    this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

    this.canvasCtx.beginPath();
    this.canvasCtx.rect(0, 0, this.canvasElement.width, this.canvasElement.height);
    this.canvasCtx.clip();

    if (result.faceLandmarks) {
      if (!this.drawingUtils) this.drawingUtils = new DrawingUtils(this.canvasCtx);
      else this.drawingUtils = new DrawingUtils(this.canvasCtx);

      for (const landmarks of result.faceLandmarks) {
        this.updateDrowsinessMetrics(landmarks);
        this.drawLandmarks(this.drawingUtils, landmarks);
      }
    } else {
      this.updateDrowsinessMetrics(undefined);
    }
  }

  private updateDrowsinessMetrics(landmarks: any[] | undefined) {
    const ear = this.computeEyeAspectRatio(landmarks);
    const mar = this.computeMouthAspectRatio(landmarks);
    const now = performance.now();

    if (ear <= this.earThreshold && this.blinkState === 'open') {
      this.blinkState = 'closed';
    } else if (ear > this.earThreshold && this.blinkState === 'closed') {
      this.blinkCount += 1;
      this.blinkState = 'open';
    }

    const elapsedSeconds = (now - this.sessionStartedAt) / 1000;
    const blinkRate = elapsedSeconds > 0 ? (this.blinkCount / elapsedSeconds) * 60 : 0;

    this.latestEar = ear;
    this.latestMar = mar;
    this.latestBlinkRate = blinkRate;

    this.updateMetricValue('ear-value', ear.toFixed(2));
    this.updateMetricValue('mar-value', mar.toFixed(2));
    this.updateMetricValue('blink-rate-value', blinkRate.toFixed(1));

    this.renderStatusSummary();
  }

  private computeEyeAspectRatio(landmarks: any[] | undefined) {
    if (!landmarks) return 0;

    const leftIndices = this.extractIndices(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE).slice(0, 6);
    const rightIndices = this.extractIndices(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE).slice(0, 6);

    const leftEar = this.computeAspectRatioForEye(landmarks, leftIndices);
    const rightEar = this.computeAspectRatioForEye(landmarks, rightIndices);

    return (leftEar + rightEar) / 2;
  }

  private extractIndices(connections: Array<{ start: number; end: number }> | any): number[] {
    if (Array.isArray(connections)) {
      return connections.map((item) => (typeof item === 'number' ? item : item.start)).filter((value) => typeof value === 'number');
    }
    return [];
  }

  private computeAspectRatioForEye(landmarks: any[], indices: number[]) {
    const points = indices.map((idx) => landmarks[idx]).filter(Boolean);
    if (points.length < 6) return 0;

    const p1 = points[0];
    const p2 = points[1];
    const p3 = points[2];
    const p4 = points[3];
    const p5 = points[4];
    const p6 = points[5];

    const vertical1 = this.distance(p2, p6);
    const vertical2 = this.distance(p3, p5);
    const horizontal = this.distance(p1, p4);

    if (!horizontal) return 0;
    return (vertical1 + vertical2) / (2 * horizontal);
  }

  private computeMouthAspectRatio(landmarks: any[] | undefined) {
    if (!landmarks) return 0;

    const lipIndices = this.extractIndices(FaceLandmarker.FACE_LANDMARKS_LIPS);
    if (lipIndices.length < 4) return 0;

    const top = landmarks[lipIndices[0]];
    const bottom = landmarks[lipIndices[Math.floor(lipIndices.length / 2)]];
    const left = landmarks[lipIndices[1]];
    const right = landmarks[lipIndices[lipIndices.length - 1]];

    if (!top || !bottom || !left || !right) return 0;

    const vertical = this.distance(top, bottom);
    const horizontal = this.distance(left, right);

    if (!horizontal) return 0;
    return vertical / horizontal;
  }

  private distance(a: any, b: any) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private updateMetricValue(id: string, text: string) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  private renderStatusSummary() {
    const statusEl = document.getElementById('drowsiness-status');
    const messageEl = document.getElementById('alert-message');

    const isDrowsy = this.latestEar < this.earThreshold || this.latestMar > this.marThreshold || this.latestBlinkRate > this.blinkRateThreshold;
    const statusText = isDrowsy ? 'Warning' : 'Focused';
    const messageText = isDrowsy
      ? 'Eye closure and mouth activity suggest fatigue. Consider a short break or alert.'
      : 'The driver appears alert. Continue monitoring.';

    if (statusEl) {
      statusEl.innerText = statusText;
      statusEl.className = `status-pill ${isDrowsy ? 'warning' : 'safe'}`;
    }

    if (messageEl) messageEl.innerText = messageText;
  }

  private drawLandmarks(drawingUtils: DrawingUtils, landmarks: any[]) {
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
      color: '#C0C0C070',
      lineWidth: 1,
    });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: '#FF3030' });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, { color: '#FF3030' });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: '#30FF30' });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, { color: '#30FF30' });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: '#E0E0E0' });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: '#E0E0E0' });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, { color: '#FF3030' });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, { color: '#30FF30' });
  }
}

// Singleton instance to support modular cleanup
let activeTask: FaceLandmarkerTask | null = null;

export async function setupFaceLandmarker(container: HTMLElement) {
  activeTask = new FaceLandmarkerTask({
    container,
    template,
    defaultModelName: 'face_landmarker',
    defaultModelUrl:
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    workerFactory: () =>
      new Worker(new URL('../workers/face-landmarker.worker.ts', import.meta.url), { type: 'module' }),
  });

  await activeTask.initialize();
}

export function cleanupFaceLandmarker() {
  if (activeTask) {
    activeTask.cleanup();
    activeTask = null;
  }
}
