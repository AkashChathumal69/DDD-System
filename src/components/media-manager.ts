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

import { ViewToggle } from './view-toggle';

export interface MediaManagerOptions {
  containerId?: string; // e.g. 'view-mode-toggle' parent or just the default one
  onModeChange?: (mode: 'VIDEO' | 'IMAGE') => void;
  onWebcamStart?: () => void;
  onWebcamStop?: () => void;
  onImageUpload?: (image: HTMLImageElement) => void;
  onWebcamFrame?: (video: HTMLVideoElement, timestampMs: number) => void;
}

export class MediaManager {
  private runningMode: 'IMAGE' | 'VIDEO' = 'IMAGE';
  private video: HTMLVideoElement;
  private enableWebcamButton: HTMLButtonElement;
  private viewWebcam: HTMLElement;
  private viewImage: HTMLElement;
  public isWorkerReady = false;

  private lastVideoTimeSeconds = -1;
  private lastTimestampMs = -1;
  private animationFrameId: number | null = null;

  private options: MediaManagerOptions;

  constructor(options: MediaManagerOptions) {
    this.options = options;

    this.video = document.getElementById('webcam') as HTMLVideoElement;
    this.enableWebcamButton = document.getElementById('webcamButton') as HTMLButtonElement;
    this.viewWebcam = document.getElementById('view-webcam')!;
    this.viewImage = document.getElementById('view-image')!;

    this.setupUI();
  }

  private setupUI() {
    const switchView = (mode: 'VIDEO' | 'IMAGE') => {
      localStorage.setItem('mediapipe-running-mode', mode);
      const webcamControls = document.getElementById('webcam-controls-container');

      if (mode === 'VIDEO') {
        this.viewWebcam.classList.add('active');
        this.viewImage.classList.remove('active');
        if (webcamControls) webcamControls.style.display = 'flex';
        this.runningMode = 'VIDEO';

        if (this.options.onModeChange) this.options.onModeChange('VIDEO');

        // Only auto-start the webcam if it was active previously
        const isWebcamActive = localStorage.getItem('mediapipe-webcam-active') === 'true';
        if (isWebcamActive) {
          this.enableCam();
        }
      } else {
        this.viewWebcam.classList.remove('active');
        this.viewImage.classList.add('active');
        if (webcamControls) webcamControls.style.display = 'none';
        this.runningMode = 'IMAGE';

        if (this.options.onModeChange) this.options.onModeChange('IMAGE');
        this.stopCam();

        if (this.isWorkerReady) {
          const testImage = document.getElementById('test-image') as HTMLImageElement;
          if (testImage && testImage.src) {
            if (this.options.onImageUpload) this.options.onImageUpload(testImage);
          }
        }
      }
    };

    const storedMode = localStorage.getItem('mediapipe-running-mode') as 'VIDEO' | 'IMAGE';
    const initialMode = storedMode || 'IMAGE';

    new ViewToggle(
      'view-mode-toggle',
      [
        { label: 'Webcam', value: 'video' },
        { label: 'Image', value: 'image' },
      ],
      initialMode.toLowerCase(),
      (value) => {
        switchView(value === 'video' ? 'VIDEO' : 'IMAGE');
      }
    );

    switchView(initialMode);

    this.enableWebcamButton?.addEventListener('click', () => this.toggleCam());

    // Setup image upload
    const imageUpload = document.getElementById('image-upload') as HTMLInputElement;
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const testImage = document.getElementById('test-image') as HTMLImageElement;
    const dropzoneContent = document.querySelector('.dropzone-content') as HTMLElement;

    if (testImage?.src && dropzoneContent) {
      dropzoneContent.style.display = 'none';
    }

    if (dropzoneContent) dropzoneContent.addEventListener('click', () => imageUpload?.click());

    setTimeout(() => {
      const reUploadBtn = document.getElementById('re-upload-btn');
      if (reUploadBtn) {
        reUploadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          imageUpload?.click();
        });
      }
    }, 0);

    imageUpload?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (testImage) testImage.src = e.target?.result as string;
          if (imagePreviewContainer) imagePreviewContainer.style.display = '';
          const dc = document.querySelector('.dropzone-content') as HTMLElement;
          if (dc) dc.style.display = 'none';

          if (testImage && this.options.onImageUpload) {
            // Handle actual inference logic via callback
            const triggerOnLoad = () => {
              if (testImage.naturalWidth > 0 && this.options.onImageUpload) {
                this.options.onImageUpload(testImage);
              }
            };
            if (testImage.complete && testImage.naturalWidth > 0) {
              triggerOnLoad();
            } else {
              testImage.onload = triggerOnLoad;
            }
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  public getRunningMode() {
    return this.runningMode;
  }

  public setWorkerReady(ready: boolean) {
    this.isWorkerReady = ready;
    if (ready && this.enableWebcamButton) {
      if (this.video && this.video.srcObject) {
        this.enableWebcamButton.innerText = 'Disable Webcam';
        this.enableWebcamButton.disabled = false;
      } else if (this.enableWebcamButton.innerText !== 'Starting...') {
        this.enableWebcamButton.innerText = 'Enable Webcam';
        this.enableWebcamButton.disabled = false;
      }
    }
  }

  public async enableCam() {
    if (!this.video) return;
    if (this.video.srcObject) return;

    if (this.enableWebcamButton) {
      this.enableWebcamButton.innerText = 'Starting...';
      this.enableWebcamButton.disabled = true;
    }

    const constraints = { video: true };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = stream;
      document.getElementById('webcam-placeholder')?.classList.add('hidden');

      const playAndPredict = () => {
        this.video.play().catch(console.error);
        if (this.enableWebcamButton) {
          this.enableWebcamButton.innerText = 'Disable Webcam';
          this.enableWebcamButton.disabled = false;
        }
        this.predictWebcam();
      };

      if (this.video.readyState >= 2) {
        playAndPredict();
      } else {
        this.video.addEventListener('loadeddata', playAndPredict, { once: true });
      }

      this.runningMode = 'VIDEO';
      localStorage.setItem('mediapipe-webcam-active', 'true');
      if (this.options.onWebcamStart) this.options.onWebcamStart();
    } catch (err) {
      console.error(err);
      if (this.enableWebcamButton) {
        this.enableWebcamButton.innerText = 'Enable Webcam';
        this.enableWebcamButton.disabled = false;
      }
    }
  }

  public stopCam(persistState = true) {
    if (this.video && this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      this.video.srcObject = null;
      document.getElementById('webcam-placeholder')?.classList.remove('hidden');
      if (this.enableWebcamButton) this.enableWebcamButton.innerText = 'Enable Webcam';
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      if (persistState) {
        localStorage.setItem('mediapipe-webcam-active', 'false');
      }

      if (this.options.onWebcamStop) this.options.onWebcamStop();
    }
  }

  public toggleCam() {
    if (this.video?.srcObject) this.stopCam();
    else this.enableCam();
  }

  private predictWebcam = () => {
    if (this.runningMode === 'IMAGE') this.runningMode = 'VIDEO';

    if (!this.isWorkerReady || !this.options.onWebcamFrame) {
      this.animationFrameId = window.requestAnimationFrame(this.predictWebcam);
      return;
    }

    if (this.video.currentTime !== this.lastVideoTimeSeconds) {
      this.lastVideoTimeSeconds = this.video.currentTime;

      const now = performance.now();
      const timestampMs = now > this.lastTimestampMs ? now : this.lastTimestampMs + 1;
      this.lastTimestampMs = timestampMs;

      // Delegate the actual worker execution to the callback
      this.options.onWebcamFrame(this.video, timestampMs);

      // We don't call requestAnimationFrame again here, it's the responsibility of the calling code
      // to call mediaManager.requestNextFrame() when the result is processed, to avoid queuing up too many frames
      // Or we can just call it here. The previous code called it recursively. To match previous code:
    } else {
      this.animationFrameId = window.requestAnimationFrame(this.predictWebcam);
    }
  };

  public requestNextFrame() {
    this.animationFrameId = window.requestAnimationFrame(this.predictWebcam);
  }

  public triggerImageAction() {
    const testImage = document.getElementById('test-image') as HTMLImageElement;
    if (testImage && testImage.src && testImage.naturalWidth > 0 && this.options.onImageUpload) {
      this.options.onImageUpload(testImage);
    }
  }

  public cleanup() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.stopCam(false);
    this.isWorkerReady = false;
  }
}
