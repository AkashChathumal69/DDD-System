import { ViewToggle } from './view-toggle';
import { BaseTask } from './base-task';

export abstract class BaseVisionTask extends BaseTask {
  protected runningMode: 'IMAGE' | 'VIDEO' = 'IMAGE';
  protected video!: HTMLVideoElement;
  protected canvasElement!: HTMLCanvasElement;
  protected canvasCtx!: CanvasRenderingContext2D;
  protected enableWebcamButton!: HTMLButtonElement;

  protected lastVideoTimeSeconds = -1;
  protected lastTimestampMs = -1;
  protected animationFrameId: number | undefined;
  private webcamStartPromise: Promise<void> | null = null;

  public override async initialize() {
    this.container.innerHTML = this.options.template;

    this.video = document.getElementById('webcam') as HTMLVideoElement;
    this.canvasElement = document.getElementById('output_canvas') as HTMLCanvasElement;
    if (this.canvasElement) {
      this.canvasCtx = this.canvasElement.getContext('2d')!;
    }
    this.enableWebcamButton = document.getElementById('webcamButton') as HTMLButtonElement;

    this.initWorker();
    this.setupViewToggle();
    this.enableCam();

    // Child class hook
    this.onInitializeUI();
    this.setupDelegateSelect();

    await this.initializeTask();
  }

  protected override handleWorkerMessage(event: MessageEvent) {
    const { type } = event.data;

    switch (type) {
      case 'DETECT_RESULT':
        const { mode, result, inferenceTime } = event.data;
        this.updateStatus(`Done in ${Math.round(inferenceTime)}ms`);
        this.updateInferenceTime(inferenceTime);

        if (mode === 'IMAGE') {
          this.displayImageResult(result);
        } else if (mode === 'VIDEO') {
          this.displayVideoResult(result);
          if (this.video.srcObject && !this.video.paused) {
            this.animationFrameId = window.requestAnimationFrame(this.predictWebcam.bind(this));
          }
        }
        break;
      default:
        super.handleWorkerMessage(event);
        break;
    }
  }

  protected override handleInitDone() {
    super.handleInitDone();

    if (this.video && this.video.srcObject && this.enableWebcamButton) {
      this.enableWebcamButton.innerText = 'Disable Webcam';
      this.enableWebcamButton.disabled = false;
    } else if (this.enableWebcamButton && this.enableWebcamButton.innerText !== 'Starting...') {
      this.enableWebcamButton.innerText = 'Enable Webcam';
      this.enableWebcamButton.disabled = false;
    }

    if (this.runningMode === 'VIDEO' && !this.video.srcObject) {
      this.enableCam();
    } else if (this.runningMode === 'IMAGE') {
      const testImage = document.getElementById('test-image') as HTMLImageElement;
      if (testImage && testImage.style.display !== 'none' && testImage.src) {
        this.triggerImageDetection(testImage);
      }
    }
  }

  protected setupViewToggle() {
    const viewWebcam = document.getElementById('view-webcam');
    const viewImage = document.getElementById('view-image');

    if (!viewWebcam || !viewImage) return;

    const switchView = (mode: 'VIDEO' | 'IMAGE') => {
      localStorage.setItem('mediapipe-running-mode', mode);
      const webcamControls = document.getElementById('webcam-controls-container');
      const classificationResults = document.getElementById('classification-results');

      // Clear out old results so they don't linger across mode switches
      if (classificationResults) {
        classificationResults.innerHTML = '';
      }

      if (mode === 'VIDEO') {
        viewWebcam.classList.add('active');
        viewImage.classList.remove('active');
        if (webcamControls) webcamControls.style.display = 'flex';
        this.runningMode = 'VIDEO';
        this.worker?.postMessage({ type: 'SET_OPTIONS', runningMode: 'VIDEO' });
      } else {
        viewWebcam.classList.remove('active');
        viewImage.classList.add('active');
        if (webcamControls) webcamControls.style.display = 'none';
        this.runningMode = 'IMAGE';
        this.worker?.postMessage({ type: 'SET_OPTIONS', runningMode: 'IMAGE' });
        this.stopCam();

        if (this.isWorkerReady) {
          const testImage = document.getElementById('test-image') as HTMLImageElement;
          if (testImage && testImage.src) this.triggerImageDetection(testImage);
        }
      }
    };

    const initialMode = 'VIDEO';

    const viewToggle = new ViewToggle(
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

    viewToggle.setActive(initialMode.toLowerCase());

    switchView(initialMode);
    if (this.enableWebcamButton) {
      this.enableWebcamButton.addEventListener('click', this.toggleCam.bind(this));
    }
  }

  protected override async initializeTask() {
    if (this.enableWebcamButton) {
      this.enableWebcamButton.disabled = true;
      if (!this.video || !this.video.srcObject) {
        this.enableWebcamButton.innerText = 'Initializing...';
      }
    }
    await super.initializeTask();
  }

  protected override getWorkerInitParamsInner(): Record<string, any> {
    return {
      runningMode: this.runningMode,
      ...this.getWorkerInitParams(),
    };
  }

  protected triggerImageDetection(image: HTMLImageElement) {
    if (image.complete && image.naturalWidth > 0) {
      this.detectImage(image);
    } else {
      image.onload = () => {
        if (image.naturalWidth > 0) {
          this.detectImage(image);
        }
      };
    }
  }

  protected async detectImage(image: HTMLImageElement) {
    if (!this.worker || !this.isWorkerReady) return;
    if (this.runningMode !== 'IMAGE') this.runningMode = 'IMAGE';

    const bitmap = await createImageBitmap(image);
    this.updateStatus(`Processing image...`);
    this.worker.postMessage(
      {
        type: 'DETECT_IMAGE',
        bitmap: bitmap,
        timestampMs: performance.now(),
      },
      [bitmap]
    );
  }

  protected async enableCam() {
    if (!this.worker || !this.video) return;
    if (this.video.srcObject) return;
    if (this.webcamStartPromise) return this.webcamStartPromise;

    if (this.enableWebcamButton) {
      this.enableWebcamButton.innerText = 'Starting...';
      this.enableWebcamButton.disabled = true;
    }

    this.webcamStartPromise = (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is unavailable. Open the app on localhost or HTTPS.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });

      if (!this.worker || !this.video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.video.srcObject = stream;
      const placeholder = document.getElementById('webcam-placeholder');
      if (placeholder) placeholder.style.display = 'none';

      const playAndPredict = () => {
        if (!this.video) return;
        this.video.play().catch(console.error);
        this.predictWebcam();
      };

      if (this.video.readyState >= 2) {
        playAndPredict();
      } else {
        this.video.addEventListener('loadeddata', playAndPredict, { once: true });
      }

      this.runningMode = 'VIDEO';
      this.worker.postMessage({ type: 'SET_OPTIONS', runningMode: 'VIDEO' });
      this.updateStatus('Webcam running...');
      if (this.enableWebcamButton) {
        this.enableWebcamButton.innerText = 'Disable Webcam';
        this.enableWebcamButton.disabled = false;
      }
    })().catch((err) => {
      console.error(err);
      const message = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow camera access and try again.'
        : err instanceof DOMException && err.name === 'NotFoundError'
          ? 'No camera found.'
          : err instanceof DOMException && err.name === 'NotReadableError'
            ? 'Camera is already in use by another app or browser tab.'
          : 'Camera unavailable. Check browser permissions.';
      this.updateStatus(message);
      if (this.enableWebcamButton) {
        this.enableWebcamButton.innerText = 'Enable Webcam';
        this.enableWebcamButton.disabled = false;
      }
    }).finally(() => {
      this.webcamStartPromise = null;
    });

    return this.webcamStartPromise;
  }

  protected toggleCam() {
    if (this.video && this.video.srcObject) {
      this.stopCam();
    } else {
      this.enableCam();
    }
  }

  protected stopCam() {
    if (this.video && this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.stop());
      this.video.srcObject = null;
      const placeholder = document.getElementById('webcam-placeholder');
      if (placeholder) placeholder.style.display = 'flex';
      if (this.enableWebcamButton) this.enableWebcamButton.innerText = 'Enable Webcam';
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

      if (this.canvasCtx && this.canvasElement) {
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
      }

    }
  }

  protected async predictWebcam() {
    if (this.runningMode === 'IMAGE') {
      this.runningMode = 'VIDEO';
    }

    if (!this.isWorkerReady || !this.worker) {
      this.animationFrameId = window.requestAnimationFrame(this.predictWebcam.bind(this));
      return;
    }

    if (this.video.currentTime !== this.lastVideoTimeSeconds) {
      this.lastVideoTimeSeconds = this.video.currentTime;

      try {
        let bitmap: ImageBitmap;
        if (navigator.webdriver) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = this.video.videoWidth || 640;
          tempCanvas.height = this.video.videoHeight || 480;
          const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
          ctx?.drawImage(this.video, 0, 0, tempCanvas.width, tempCanvas.height);
          bitmap = await window.createImageBitmap(tempCanvas);
        } else {
          bitmap = await window.createImageBitmap(this.video);
        }

        const now = performance.now();
        const timestampMs = now > this.lastTimestampMs ? now : this.lastTimestampMs + 1;
        this.lastTimestampMs = timestampMs;

        this.worker?.postMessage(
          {
            type: 'DETECT_VIDEO',
            bitmap: bitmap,
            timestampMs: timestampMs,
          },
          [bitmap]
        );
      } catch (e) {
        console.error('Failed to create ImageBitmap from video', e);
        this.animationFrameId = window.requestAnimationFrame(this.predictWebcam.bind(this));
      }
    } else {
      this.animationFrameId = window.requestAnimationFrame(this.predictWebcam.bind(this));
    }
  }

  public override cleanup() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.stopCam();

    if (this.canvasCtx && this.canvasElement) {
      this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    }

    super.cleanup();
  }

  protected abstract displayImageResult(result: any): void;
  protected abstract displayVideoResult(result: any): void;
}
