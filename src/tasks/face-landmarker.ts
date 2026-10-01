import {
  FaceLandmarkerResult,
  DrawingUtils,
  FaceLandmarker,
} from '@mediapipe/tasks-vision';
import { BaseVisionTask } from '../components/base-vision-task';
import template from '../frontend/face-landmarker.html?raw';



type DriverState = 'ALERT' | 'DROWSY' | 'SLEEPING';
type PerclosSample = {

  time: number;

  closed: boolean;

};



class FaceLandmarkerTask extends BaseVisionTask {

  private drawingUtils: DrawingUtils | undefined;


  private numFaces = 1;
  private minFaceDetectionConfidence = 0.5;
  private minFacePresenceConfidence = 0.5;
  private minTrackingConfidence = 0.5;




  private earThreshold = 0.20;
  private marThreshold = 0.30;

  private readonly drowsyClosureSeconds = 1.5;
  private readonly sleepingClosureSeconds = 3.0;
  private readonly mlAssistMinClosureSeconds = 0.6;
  private readonly mlDrowsyProbabilityThreshold = 0.65;



  // PERCLOS

  private readonly perclosWindowMs = 30_000;
  private readonly perclosMinimumObservationMs = 10_000;
  private readonly perclosDrowsyThreshold = 40;
  private readonly perclosSupportThreshold = 30;



  // Blink behavior

  private readonly minBlinkDurationSeconds = 0.08;

  private readonly maxBlinkDurationSeconds = 0.80;

  private readonly blinkWindowMs = 60_000;

  private readonly highBlinkRateThreshold = 24;



  // MAR/yawn support

  private readonly yawnMinDurationSeconds = 1.5;

  private mouthOpenStartedAt: number | null = null;

  private mouthOpenDuration = 0;

  private yawnLatched = false;

  private yawnTimestamps: number[] = [];



  // Exact EAR landmarks used during model training.

  private readonly LEFT_EYE = [362, 385, 387, 263, 373, 380];

  private readonly RIGHT_EYE = [33, 160, 158, 133, 153, 144];



  // Mouth landmarks for a simple MAR-like mouth opening ratio:

  // vertical distance (13,14) / horizontal distance (61,291)

  private readonly MOUTH_UPPER = 13;

  private readonly MOUTH_LOWER = 14;

  private readonly MOUTH_LEFT = 61;

  private readonly MOUTH_RIGHT = 291;



  // Current measurements

  private latestEar = 0;

  private closureDuration = 0;

  private eyeClosedStartTime: number | null = null;



  // Blink history

  private blinkStartedAt: number | null = null;

  private blinkTimestamps: number[] = [];

  private latestBlinkRate = 0;

  private lastBlinkDuration = 0;



  // PERCLOS history

  private perclosSamples: PerclosSample[] = [];

  private latestPerclos = 0;

  private perclosSessionStartedAt: number | null = null;



  // ML API state

  private latestMlPrediction = 'Unknown';

  private latestDrowsyProbability = 0;

  private lastPredictionTime = 0;

  private readonly predictionInterval = 500;

  private predictionInFlight = false;

  private apiAvailable = true;



  private hasFace = false;



  // UI-only visualization state. These values do not affect the decision model.

  private earTrendValues: number[] = [];

  private lastTrendUpdateTime = 0;

  private readonly trendUpdateInterval = 250;

  private readonly maxTrendPoints = 50;

  // Time-controlled audio alarm.
  // The alarm uses the FINAL ALERT / DROWSY / SLEEPING state only.
  // DROWSY: first warning after 2 s, then max once every 10 s.
  // SLEEPING: first urgent warning after 1 s, then max once every 5 s.
  private alarmAudioContext: AudioContext | null = null;
  private alarmEnabled = false;
  private alarmTrackedState: DriverState = 'ALERT';
  private alarmStateStartedAt = performance.now();
  private lastAlarmAt = 0;
  private readonly drowsyAlarmInitialDelayMs = 2_000;
  private readonly drowsyAlarmCooldownMs = 10_000;
  private readonly sleepingAlarmInitialDelayMs = 1_000;
  private readonly sleepingAlarmCooldownMs = 5_000;



  protected override onInitializeUI() {

    const setupSlider = (

      id: string,

      onChange: (value: number) => void

    ) => {

      const input = document.getElementById(id) as HTMLInputElement | null;

      const valueDisplay = document.getElementById(`${id}-value`);



      if (!input || !valueDisplay) return;



      if (id === 'ear-threshold') {

        input.value = this.earThreshold.toString();

        valueDisplay.innerText = this.earThreshold.toFixed(2);

      }



      if (id === 'mar-threshold') {

        input.value = this.marThreshold.toString();

        valueDisplay.innerText = this.marThreshold.toFixed(2);

      }



      input.addEventListener('input', () => {

        const value = Number.parseFloat(input.value);

        if (Number.isNaN(value)) return;



        valueDisplay.innerText = value.toFixed(2);

        onChange(value);

      });

    };



    setupSlider('min-face-detection-confidence', (value) => {

      this.minFaceDetectionConfidence = value;

      this.worker?.postMessage({

        type: 'SET_OPTIONS',

        minFaceDetectionConfidence: value,

      });

      this.triggerRedetection();

    });



    setupSlider('min-face-presence-confidence', (value) => {

      this.minFacePresenceConfidence = value;

      this.worker?.postMessage({

        type: 'SET_OPTIONS',

        minFacePresenceConfidence: value,

      });

      this.triggerRedetection();

    });



    setupSlider('min-tracking-confidence', (value) => {

      this.minTrackingConfidence = value;

      this.worker?.postMessage({

        type: 'SET_OPTIONS',

        minTrackingConfidence: value,

      });

      this.triggerRedetection();

    });



    setupSlider('num-faces', (value) => {

      this.numFaces = value;

      this.worker?.postMessage({

        type: 'SET_OPTIONS',

        numFaces: value,

      });

      this.triggerRedetection();

    });



    setupSlider('ear-threshold', (value) => {

      this.earThreshold = value;

      this.resetCurrentClosure();

      this.renderStatusSummary();

    });



    setupSlider('mar-threshold', (value) => {

      this.marThreshold = value;

      this.resetMouthState();

      this.renderStatusSummary();

    });



    // Browsers block sound until the page receives a user interaction.
    // The first click/tap/key press safely arms the alarm.
    this.initializeAlarmAudioUnlock();



    this.models = {

      face_landmarker: 'models/face_landmarker.task',

    };



    this.updateMetricValue('closure-duration-value', '0.0');

    this.updateMetricValue('perclos-value', '0.0');

    this.updateMetricValue('mar-value', '0.000');

    this.updateMetricValue('blink-rate-value', '0.0');



    this.renderStatusSummary();

  }



  private initializeAlarmAudioUnlock() {
    const unlock = () => {
      void this.unlockAlarmAudio();
    };

    document.addEventListener(
      'pointerdown',
      unlock,
      { once: true }
    );

    document.addEventListener(
      'keydown',
      unlock,
      { once: true }
    );
  }



  private async unlockAlarmAudio() {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as any).webkitAudioContext;

      if (!AudioContextClass) {
        console.warn(
          'Web Audio API is not supported in this browser.'
        );
        return;
      }

      if (!this.alarmAudioContext) {
        this.alarmAudioContext =
          new AudioContextClass();
      }

      if (
        this.alarmAudioContext.state ===
        'suspended'
      ) {
        await this.alarmAudioContext.resume();
      }

      this.alarmEnabled = true;

      console.log(
        'Drowsiness audio alarm armed.'
      );

      this.updateAlarmStatusUI('Armed');
    } catch (error) {
      console.error(
        'Could not initialize alarm audio:',
        error
      );

      this.updateAlarmStatusUI(
        'Audio unavailable'
      );
    }
  }



  private updateAlarmStatusUI(
    text: string
  ) {
    // Optional UI hook. If the HTML contains an element with this ID,
    // the alarm status will be shown. If not, nothing breaks.
    const element =
      document.getElementById(
        'alarm-status-value'
      );

    if (element) {
      element.innerText = text;
    }
  }



  private updateAlarmForState(
    state: DriverState
  ) {
    const now = performance.now();

    // A state transition starts a new alarm timing cycle.
    if (state !== this.alarmTrackedState) {
      this.alarmTrackedState = state;
      this.alarmStateStartedAt = now;
      this.lastAlarmAt = 0;
    }

    // ALERT never produces sound and resets warning behavior.
    if (state === 'ALERT') {
      if (this.alarmEnabled) {
        this.updateAlarmStatusUI(
          'Armed'
        );
      }

      return;
    }

    if (!this.alarmEnabled) {
      this.updateAlarmStatusUI(
        'Tap once to arm'
      );

      return;
    }

    const stateDuration =
      now - this.alarmStateStartedAt;

    const initialDelay =
      state === 'SLEEPING'
        ? this.sleepingAlarmInitialDelayMs
        : this.drowsyAlarmInitialDelayMs;

    const cooldown =
      state === 'SLEEPING'
        ? this.sleepingAlarmCooldownMs
        : this.drowsyAlarmCooldownMs;

    if (stateDuration < initialDelay) {
      return;
    }

    const canPlay =
      this.lastAlarmAt === 0 ||
      now - this.lastAlarmAt >= cooldown;

    if (!canPlay) {
      return;
    }

    // Save the time before playback so repeated render calls
    // cannot start overlapping alarms.
    this.lastAlarmAt = now;

    void this.playAlarmPattern(state);
  }



  private async playAlarmPattern(
    state: DriverState
  ) {
    if (!this.alarmEnabled) return;

    const context =
      this.alarmAudioContext;

    if (!context) return;

    try {
      if (context.state === 'suspended') {
        await context.resume();
      }

      const urgent =
        state === 'SLEEPING';

      // DROWSY = two softer beeps.
      // SLEEPING = three faster, higher-pitched beeps.
      const frequency =
        urgent ? 880 : 660;

      const offsets =
        urgent
          ? [0, 0.30, 0.60]
          : [0, 0.38];

      const beepDuration =
        urgent ? 0.18 : 0.16;

      const volume =
        urgent ? 0.22 : 0.14;

      const startTime =
        context.currentTime + 0.02;

      for (const offset of offsets) {
        const oscillator =
          context.createOscillator();

        const gain =
          context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value =
          frequency;

        gain.gain.setValueAtTime(
          0.0001,
          startTime + offset
        );

        gain.gain.exponentialRampToValueAtTime(
          volume,
          startTime + offset + 0.02
        );

        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          startTime +
            offset +
            beepDuration
        );

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start(
          startTime + offset
        );

        oscillator.stop(
          startTime +
            offset +
            beepDuration +
            0.03
        );
      }

      console.log(
        urgent
          ? 'SLEEPING alarm played.'
          : 'DROWSY alarm played.'
      );

      this.updateAlarmStatusUI(
        urgent
          ? 'Sleeping alarm active'
          : 'Drowsy alarm active'
      );
    } catch (error) {
      console.error(
        'Alarm playback failed:',
        error
      );
    }
  }



  private triggerRedetection() {

    if (this.runningMode !== 'IMAGE') return;



    const testImage = document.getElementById(

      'test-image'

    ) as HTMLImageElement | null;



    if (testImage?.src) {

      this.detectImage(testImage);

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



  protected override displayImageResult(

    result: FaceLandmarkerResult

  ) {

    const imageCanvas = document.getElementById(

      'image-canvas'

    ) as HTMLCanvasElement | null;



    const testImage = document.getElementById(

      'test-image'

    ) as HTMLImageElement | null;



    const context = imageCanvas?.getContext('2d');



    if (!imageCanvas || !testImage || !context) return;



    imageCanvas.width = testImage.naturalWidth;

    imageCanvas.height = testImage.naturalHeight;



    context.clearRect(0, 0, imageCanvas.width, imageCanvas.height);

    context.beginPath();

    context.rect(0, 0, imageCanvas.width, imageCanvas.height);

    context.clip();



    this.processLandmarkerResult(

      result,

      new DrawingUtils(context)

    );

  }



  protected override displayVideoResult(

    result: FaceLandmarkerResult

  ) {

    this.canvasElement.width = this.video.videoWidth;

    this.canvasElement.height = this.video.videoHeight;



    this.canvasCtx.clearRect(

      0,

      0,

      this.canvasElement.width,

      this.canvasElement.height

    );



    this.canvasCtx.beginPath();

    this.canvasCtx.rect(

      0,

      0,

      this.canvasElement.width,

      this.canvasElement.height

    );

    this.canvasCtx.clip();



    this.drawingUtils = new DrawingUtils(this.canvasCtx);



    this.processLandmarkerResult(

      result,

      this.drawingUtils

    );

  }



  private processLandmarkerResult(

    result: FaceLandmarkerResult,

    drawingUtils: DrawingUtils

  ) {

    const faces = result.faceLandmarks ?? [];



    if (faces.length === 0) {

      this.hasFace = false;

      this.latestEar = 0;

      this.latestMlPrediction = 'Unknown';

      this.latestDrowsyProbability = 0;



      this.resetCurrentClosure();

      this.resetMouthState();



      this.updateMetricValue('ear-value', '--');

      this.updateMetricValue('closure-duration-value', '--');

      this.updateMetricValue('mar-value', '--');

      this.updateMetricValue('blink-rate-value', '--');



      this.renderStatusSummary();

      return;

    }



    this.hasFace = true;



    // Single-driver monitoring.

    const landmarks = faces[0];



    this.updateDrowsinessMetrics(landmarks);

    this.drawLandmarks(drawingUtils, landmarks);

  }



  private updateDrowsinessMetrics(landmarks: any[]) {

    const leftEar = this.computeAspectRatioForEye(

      landmarks,

      this.LEFT_EYE

    );



    const rightEar = this.computeAspectRatioForEye(

      landmarks,

      this.RIGHT_EYE

    );



    const averageEar = (leftEar + rightEar) / 2;

    const mar = this.computeMar(landmarks);



    const now = performance.now();



    const eyesClosed =

      averageEar > 0 &&

      averageEar < this.earThreshold;



    this.latestEar = averageEar;



    this.updateClosureDuration(

      eyesClosed,

      now

    );



    this.updateBlinkBehavior(

      eyesClosed,

      now

    );



    this.updatePerclos(

      eyesClosed,

      now

    );



    this.updateMouthBehavior(

      mar,

      now

    );



    this.updateMetricValue(

      'ear-value',

      averageEar.toFixed(4)

    );



    this.updateMetricValue(

      'closure-duration-value',

      this.closureDuration.toFixed(1)

    );



    this.updateMetricValue(

      'perclos-value',

      this.latestPerclos.toFixed(1)

    );



    this.updateMetricValue(

      'mar-value',

      mar.toFixed(3)

    );



    this.updateMetricValue(

      'blink-rate-value',

      this.latestBlinkRate.toFixed(1)

    );



    this.updateMetricValue(

      'last-blink-value',

      this.lastBlinkDuration.toFixed(2)

    );



    this.updateMetricValue(

      'yawn-count-value',

      this.getRecentYawnCount().toString()

    );



    // Presentation-only EAR history for the dashboard sparkline.

    this.updateEarTrend(averageEar, now);



    console.log({

      leftEAR: Number(leftEar.toFixed(4)),

      rightEAR: Number(rightEar.toFixed(4)),

      averageEAR: Number(averageEar.toFixed(4)),

      MAR: Number(mar.toFixed(3)),

      blinkRate: Number(this.latestBlinkRate.toFixed(1)),

      lastBlinkSeconds: Number(this.lastBlinkDuration.toFixed(2)),

      recentYawns: this.getRecentYawnCount(),

      eyesClosed,

      closureSeconds: Number(this.closureDuration.toFixed(2)),

      perclos: Number(this.latestPerclos.toFixed(1)),

    });



    this.maybePredictWithModel(

      leftEar,

      rightEar,

      averageEar

    );



    this.renderStatusSummary();

  }



  private updateClosureDuration(

    eyesClosed: boolean,

    now: number

  ) {

    if (eyesClosed) {

      if (this.eyeClosedStartTime === null) {

        this.eyeClosedStartTime = now;

      }



      this.closureDuration =

        (now - this.eyeClosedStartTime) / 1000;

    } else {

      this.resetCurrentClosure();

    }

  }



  private resetCurrentClosure() {

    this.eyeClosedStartTime = null;

    this.closureDuration = 0;

  }



  private updateBlinkBehavior(

    eyesClosed: boolean,

    now: number

  ) {

    if (eyesClosed) {

      if (this.blinkStartedAt === null) {

        this.blinkStartedAt = now;

      }

    } else if (this.blinkStartedAt !== null) {

      const duration =

        (now - this.blinkStartedAt) / 1000;



      this.lastBlinkDuration = duration;



      if (

        duration >= this.minBlinkDurationSeconds &&

        duration <= this.maxBlinkDurationSeconds

      ) {

        this.blinkTimestamps.push(now);

      }



      this.blinkStartedAt = null;

    }



    const cutoff = now - this.blinkWindowMs;



    this.blinkTimestamps =

      this.blinkTimestamps.filter(

        (timestamp) => timestamp >= cutoff

      );



    // Events in the last 60 seconds = blinks/minute.

    this.latestBlinkRate =

      this.blinkTimestamps.length;

  }



  private updatePerclos(

    eyesClosed: boolean,

    now: number

  ) {

    if (this.perclosSessionStartedAt === null) {

      this.perclosSessionStartedAt = now;

    }



    this.perclosSamples.push({

      time: now,

      closed: eyesClosed,

    });



    const cutoff =

      now - this.perclosWindowMs;



    this.perclosSamples =

      this.perclosSamples.filter(

        (sample) => sample.time >= cutoff

      );



    if (this.perclosSamples.length === 0) {

      this.latestPerclos = 0;

      return;

    }



    const closedSamples =

      this.perclosSamples.reduce(

        (count, sample) =>

          count + (sample.closed ? 1 : 0),

        0

      );



    this.latestPerclos =

      (closedSamples /

        this.perclosSamples.length) *

      100;

  }



  private isPerclosReady() {

    if (this.perclosSessionStartedAt === null) {

      return false;

    }



    return (

      performance.now() -

        this.perclosSessionStartedAt >=

      this.perclosMinimumObservationMs

    );

  }



  private computeAspectRatioForEye(

    landmarks: any[],

    indices: number[]

  ) {

    const points = indices.map(

      (index) => landmarks[index]

    );



    if (

      points.length !== 6 ||

      points.some((point) => !point)

    ) {

      return 0;

    }



    const [p1, p2, p3, p4, p5, p6] =

      points;



    const vertical1 = this.distance(p2, p6);

    const vertical2 = this.distance(p3, p5);

    const horizontal = this.distance(p1, p4);



    if (horizontal === 0) return 0;



    return (

      (vertical1 + vertical2) /

      (2 * horizontal)

    );

  }



  private computeMar(

    landmarks: any[]

  ) {

    const upper =

      landmarks[this.MOUTH_UPPER];



    const lower =

      landmarks[this.MOUTH_LOWER];



    const left =

      landmarks[this.MOUTH_LEFT];



    const right =

      landmarks[this.MOUTH_RIGHT];



    if (!upper || !lower || !left || !right) {

      return 0;

    }



    const vertical =

      this.distance(upper, lower);



    const horizontal =

      this.distance(left, right);



    if (horizontal === 0) {

      return 0;

    }



    return vertical / horizontal;

  }



  private updateMouthBehavior(

    mar: number,

    now: number

  ) {

    const mouthOpen =

      mar >= this.marThreshold;



    if (mouthOpen) {

      if (this.mouthOpenStartedAt === null) {

        this.mouthOpenStartedAt = now;

      }



      this.mouthOpenDuration =

        (now - this.mouthOpenStartedAt) /

        1000;



      if (

        this.mouthOpenDuration >=

          this.yawnMinDurationSeconds &&

        !this.yawnLatched

      ) {

        this.yawnTimestamps.push(now);

        this.yawnLatched = true;

      }

    } else {

      this.resetMouthState();

    }



    const cutoff =

      now - 60_000;



    this.yawnTimestamps =

      this.yawnTimestamps.filter(

        (timestamp) => timestamp >= cutoff

      );

  }



  private resetMouthState() {

    this.mouthOpenStartedAt = null;

    this.mouthOpenDuration = 0;

    this.yawnLatched = false;

  }



  private getRecentYawnCount() {

    return this.yawnTimestamps.length;

  }



  private distance(

    a: { x: number; y: number },

    b: { x: number; y: number }

  ) {

    return Math.hypot(

      a.x - b.x,

      a.y - b.y

    );

  }



  private updateEarTrend(

    ear: number,

    now: number

  ) {

    if (

      now - this.lastTrendUpdateTime <

      this.trendUpdateInterval

    ) {

      return;

    }



    this.lastTrendUpdateTime = now;



    this.earTrendValues.push(ear);



    if (

      this.earTrendValues.length >

      this.maxTrendPoints

    ) {

      this.earTrendValues.shift();

    }



    const line = document.getElementById(

      'ear-trend-line'

    );



    const area = document.getElementById(

      'ear-trend-area'

    );



    if (

      !line ||

      this.earTrendValues.length < 2

    ) {

      return;

    }



    const width = 240;

    const height = 74;

    const minEar = 0.0;

    const maxEar = 0.60;



    const points =

      this.earTrendValues.map(

        (value, index) => {

          const x =

            (index /

              Math.max(

                this.earTrendValues.length - 1,

                1

              )) *

            width;



          const clamped = Math.min(

            maxEar,

            Math.max(minEar, value)

          );



          const y =

            height -

            ((clamped - minEar) /

              (maxEar - minEar)) *

              height;



          return `${x.toFixed(1)},${y.toFixed(1)}`;

        }

      );



    line.setAttribute(

      'points',

      points.join(' ')

    );



    if (area) {

      const areaPoints = [

        `0,${height}`,

        ...points,

        `${width},${height}`,

      ].join(' ');



      area.setAttribute(

        'points',

        areaPoints

      );

    }

  }



  private updatePresentationWidgets() {

    const confidenceValue =

      document.getElementById(

        'ml-confidence-value'

      );



    const confidenceRing =

      document.getElementById(

        'confidence-ring'

      ) as HTMLElement | null;



    const predictionValue =

      document.getElementById(

        'ml-prediction-value'

      );



    const modelStatus =

      document.getElementById(

        'model-status-value'

      );



    const cameraStatus =

      document.getElementById(

        'camera-status-value'

      );



    if (cameraStatus) {

      cameraStatus.innerText =

        this.hasFace ? 'Active' : 'Waiting';

    }



    if (modelStatus) {

      modelStatus.innerText =

        this.apiAvailable ? 'Running' : 'Offline';

    }



    if (

      this.latestMlPrediction ===

      'Unknown'

    ) {

      if (confidenceValue) {

        confidenceValue.innerText = '--';

      }



      if (confidenceRing) {

        confidenceRing.style.setProperty(

          '--confidence-angle',

          '0deg'

        );

      }



      if (predictionValue) {

        predictionValue.innerText =

          'Waiting';

      }



      return;

    }



    const predictedDrowsy =

      this.latestMlPrediction

        .toLowerCase() === 'drowsy';



    const confidence = predictedDrowsy

      ? this.latestDrowsyProbability

      : 1 -

        this.latestDrowsyProbability;



    const confidencePercent = Math.round(

      Math.min(

        1,

        Math.max(0, confidence)

      ) * 100

    );



    if (confidenceValue) {

      confidenceValue.innerText =

        `${confidencePercent}%`;

    }



    if (confidenceRing) {

      confidenceRing.style.setProperty(

        '--confidence-angle',

        `${confidencePercent * 3.6}deg`

      );

    }



    if (predictionValue) {

      predictionValue.innerText =

        `${this.latestMlPrediction} (${confidencePercent}%)`;

    }

  }



  private maybePredictWithModel(

    leftEar: number,

    rightEar: number,

    averageEar: number

  ) {

    const now = performance.now();



    if (

      now - this.lastPredictionTime <

        this.predictionInterval ||

      this.predictionInFlight

    ) {

      return;

    }



    this.lastPredictionTime = now;



    void this.predictWithModel(

      leftEar,

      rightEar,

      averageEar

    );

  }



  private async predictWithModel(

    leftEar: number,

    rightEar: number,

    averageEar: number

  ) {

    this.predictionInFlight = true;



    try {

      const response = await fetch(

        'http://127.0.0.1:5000/predict',

        {

          method: 'POST',

          headers: {

            'Content-Type':

              'application/json',

          },

          body: JSON.stringify({

            left_EAR: leftEar,

            right_EAR: rightEar,

            average_EAR: averageEar,

          }),

        }

      );



      if (!response.ok) {

        throw new Error(

          `Prediction API returned HTTP ${response.status}`

        );

      }



      const data = await response.json();



      if (data.error) {

        throw new Error(String(data.error));

      }



      this.latestMlPrediction = String(

        data.prediction ?? 'Unknown'

      );



      this.latestDrowsyProbability =

        Number(

          data.probabilities?.Drowsy ??

            data.drowsy_probability ??

            0

        );



      this.apiAvailable = true;

    } catch (error) {

      this.apiAvailable = false;



      console.error(

        'Drowsiness API error:',

        error

      );

    } finally {

      this.predictionInFlight = false;

      this.renderStatusSummary();

    }

  }



  private updateMetricValue(

    id: string,

    text: string

  ) {

    const element =

      document.getElementById(id);



    if (element) {

      element.innerText = text;

    }

  }


  private determineDriverState(): DriverState {

    if (!this.hasFace) {

      return 'ALERT';

    }



    // Strongest temporal evidence.

    if (

      this.closureDuration >=

      this.sleepingClosureSeconds

    ) {

      return 'SLEEPING';

    }



    if (

      this.closureDuration >=

      this.drowsyClosureSeconds

    ) {

      return 'DROWSY';

    }



    if (

      this.isPerclosReady() &&

      this.latestPerclos >=

        this.perclosDrowsyThreshold

    ) {

      return 'DROWSY';

    }



    const mlSupportsDrowsy =

      this.apiAvailable &&

      this.latestMlPrediction

        .toLowerCase() === 'drowsy' &&

      this.latestDrowsyProbability >=

        this.mlDrowsyProbabilityThreshold;



    const mouthSupportsDrowsy =

      this.mouthOpenDuration >=

        this.yawnMinDurationSeconds ||

      this.getRecentYawnCount() >= 1;



    const blinkSupportsDrowsy =

      this.latestBlinkRate >=

        this.highBlinkRateThreshold ||

      this.lastBlinkDuration >

        this.maxBlinkDurationSeconds;



    const behavioralSupport =

      mouthSupportsDrowsy ||

      blinkSupportsDrowsy;



    // ML supports a current eye-closure event.

    if (

      this.latestEar > 0 &&

      this.latestEar < this.earThreshold &&

      this.closureDuration >=

        this.mlAssistMinClosureSeconds &&

      mlSupportsDrowsy

    ) {

      return 'DROWSY';

    }



    // Enhanced supporting indicators can strengthen borderline eye evidence,

    // but cannot classify drowsiness alone.

    if (

      behavioralSupport &&

      (

        (

          this.latestEar > 0 &&

          this.latestEar <

            this.earThreshold &&

          this.closureDuration >= 0.5

        ) ||

        (

          this.isPerclosReady() &&

          this.latestPerclos >=

            this.perclosSupportThreshold

        )

      )

    ) {

      return 'DROWSY';

    }



    return 'ALERT';

  }



  private renderStatusSummary() {

    this.updatePresentationWidgets();



    const statusElement =

      document.getElementById(

        'drowsiness-status'

      );



    const messageElement =

      document.getElementById(

        'alert-message'

      );



    const behaviorElement =

      document.getElementById(

        'behavior-support'

      );



    if (!this.hasFace) {

      // No face = no alarm. This also resets any previous warning cycle.
      this.updateAlarmForState('ALERT');

      if (statusElement) {

        statusElement.innerText =

          'NO FACE';



        statusElement.className =

          'status-pill safe';

      }



      if (messageElement) {

        messageElement.innerText =

          'Position your face in the camera view.';

      }



      if (behaviorElement) {

        behaviorElement.innerText =

          'Waiting for face data';

      }



      return;

    }



    const state =

      this.determineDriverState();



    // Alarm follows the FINAL fused state only.
    // It does not trigger from a single raw ML/MAR/blink value.
    this.updateAlarmForState(state);



    const mouthSupport =

      this.mouthOpenDuration >=

        this.yawnMinDurationSeconds ||

      this.getRecentYawnCount() >= 1;



    const blinkSupport =

      this.latestBlinkRate >=

        this.highBlinkRateThreshold ||

      this.lastBlinkDuration >

        this.maxBlinkDurationSeconds;



    const supportLabels: string[] = [];



    if (mouthSupport) {

      supportLabels.push('MAR/yawn');

    }



    if (blinkSupport) {

      supportLabels.push('blink');

    }



    if (behaviorElement) {

      behaviorElement.innerText =

        supportLabels.length > 0

          ? `Supporting indicator: ${supportLabels.join(' + ')}`

          : 'No additional behavioral warning';

    }



    const mlText = this.apiAvailable

      ? ` ML: ${this.latestMlPrediction} (${(

          this.latestDrowsyProbability * 100

        ).toFixed(0)}% drowsy).`

      : ' ML API unavailable; mathematical monitoring is still active.';



    let message =

      'The driver appears alert. Continue monitoring.';



    if (state === 'DROWSY') {

      message =

        'Drowsiness indicators detected. Multiple temporal/behavioral signals are being monitored.';

    } else if (state === 'SLEEPING') {

      message =

        'Prolonged eye closure detected. Immediate wake-up warning required.';

    }



    if (statusElement) {

      statusElement.innerText = state;



      const stateClass =

        state === 'ALERT'

          ? 'safe'

          : state === 'DROWSY'

            ? 'warning'

            : 'danger';



      statusElement.className =

        `status-pill ${stateClass}`;

    }



    if (messageElement) {

      messageElement.innerText =

        `${message}${mlText}`;

    }

  }



  private drawLandmarks(

    drawingUtils: DrawingUtils,

    landmarks: any[]

  ) {

    drawingUtils.drawConnectors(

      landmarks,

      FaceLandmarker.FACE_LANDMARKS_TESSELATION,

      {

        color: '#C0C0C070',

        lineWidth: 1,

      }

    );



    drawingUtils.drawConnectors(

      landmarks,

      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,

      { color: '#FF3030' }

    );



    drawingUtils.drawConnectors(

      landmarks,

      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,

      { color: '#FF3030' }

    );



    drawingUtils.drawConnectors(

      landmarks,

      FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,

      { color: '#30FF30' }

    );



    drawingUtils.drawConnectors(

      landmarks,

      FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,

      { color: '#30FF30' }

    );



    drawingUtils.drawConnectors(

      landmarks,

      FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,

      { color: '#E0E0E0' }

    );



    drawingUtils.drawConnectors(

      landmarks,

      FaceLandmarker.FACE_LANDMARKS_LIPS,

      { color: '#E0E0E0' }

    );



    drawingUtils.drawConnectors(

      landmarks,

      FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,

      { color: '#FF3030' }

    );



    drawingUtils.drawConnectors(

      landmarks,

      FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,

      { color: '#30FF30' }

    );

  }

}



let activeTask: FaceLandmarkerTask | null = null;



export async function setupFaceLandmarker(

  container: HTMLElement

) {

  activeTask =

    new FaceLandmarkerTask({

      container,

      template,

      defaultModelName:

        'face_landmarker',

      defaultModelUrl:

        'models/face_landmarker.task',

      workerFactory: () =>

        new Worker(

          new URL(

            '../workers/face-landmarker.worker.ts',

            import.meta.url

          ),

          { type: 'module' }

        ),

    });



  await activeTask.initialize();

}



export function cleanupFaceLandmarker() {

  if (!activeTask) return;



  activeTask.cleanup();

  activeTask = null;

}
