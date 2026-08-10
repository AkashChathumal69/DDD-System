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
import { BaseTask, BaseTaskOptions } from './base-task';

export interface BaseAudioTaskOptions extends BaseTaskOptions {}

export abstract class BaseAudioTask extends BaseTask {
  protected runningMode: 'AUDIO_STREAM' | 'AUDIO_CLIPS' = 'AUDIO_STREAM';

  protected audioContext: AudioContext | undefined;
  protected scriptProcessor: ScriptProcessorNode | undefined;
  protected mediaStreamSource: MediaStreamAudioSourceNode | undefined;
  protected stream: MediaStream | undefined;
  protected isRecording = false;

  public override async initialize() {
    await super.initialize();

    this.setupAudioViewToggle();
    this.setupAudioUpload();
    this.setupRecordButton();
  }

  protected setupAudioViewToggle() {
    const viewMic = document.getElementById('view-microphone');
    const viewFile = document.getElementById('view-file');

    if (!viewMic || !viewFile) return;

    const switchView = (mode: 'MIC' | 'FILE') => {
      if (mode === 'MIC') {
        viewMic.classList.add('active');
        viewFile.classList.remove('active');
        this.runningMode = 'AUDIO_STREAM';
      } else {
        viewMic.classList.remove('active');
        viewFile.classList.add('active');
        this.runningMode = 'AUDIO_CLIPS';
        this.stopRecording();
      }
      this.clearResults();
      this.onViewSwitched(mode);
    };

    new ViewToggle(
      'view-mode-toggle',
      [
        { label: 'Microphone', value: 'mic' },
        { label: 'Audio File', value: 'file' },
      ],
      'mic',
      (value) => {
        switchView(value === 'mic' ? 'MIC' : 'FILE');
      }
    );
  }

  protected setupAudioUpload() {
    const audioUpload = document.getElementById('audio-upload') as HTMLInputElement;
    const dropzone = document.querySelector('.upload-dropzone') as HTMLElement;

    if (dropzone) {
      dropzone.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('audio') || (e.target as HTMLElement).closest('button')) return;
        audioUpload?.click();
      });

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = 'var(--primary)';
        dropzone.style.backgroundColor = '#e3f2fd';
      });

      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = '#ccc';
        dropzone.style.backgroundColor = '#f8f9fa';
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = '#ccc';
        dropzone.style.backgroundColor = '#f8f9fa';

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleFileSelect(files[0]);
        }
      });
    }

    if (audioUpload) {
      audioUpload.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) this.handleFileSelect(file);
      });
    }
  }

  protected setupRecordButton() {
    const recordButton = document.getElementById('recordButton') as HTMLButtonElement;
    if (recordButton) {
      recordButton.addEventListener('click', this.toggleRecording.bind(this));
    }
  }

  protected handleFileSelect(file: File) {
    const player = document.getElementById('audio-player') as HTMLAudioElement;
    const previewContainer = document.getElementById('audio-preview-container');
    const dropzoneContent = document.querySelector('.dropzone-content') as HTMLElement;

    if (player && previewContainer && dropzoneContent) {
      player.src = URL.createObjectURL(file);
      previewContainer.style.display = 'flex';
      previewContainer.style.flexDirection = 'column';
      previewContainer.style.alignItems = 'center';
      previewContainer.style.justifyContent = 'center';
      dropzoneContent.style.display = 'none';

      this.onAudioFileLoaded(file);
    }
  }

  protected async toggleRecording() {
    const recordButton = document.getElementById('recordButton') as HTMLButtonElement;
    if (this.isRecording) {
      this.stopRecording();
      if (recordButton) {
        recordButton.innerHTML = '<span class="material-icons">mic</span> Start Recording';
        recordButton.classList.remove('recording');
      }
    } else {
      await this.startRecording();
      if (this.isRecording && recordButton) {
        recordButton.innerHTML = '<span class="material-icons">stop</span> Stop Recording';
        recordButton.classList.add('recording');
      }
    }
  }

  protected async startRecording() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.stream);

      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.mediaStreamSource.connect(this.scriptProcessor);

      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 0;
      this.scriptProcessor.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      this.scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.processAudioData(inputData, this.audioContext!.sampleRate);
      };

      this.isRecording = true;
      this.updateStatus('Recording...');
    } catch (err) {
      console.error('Failed to start recording', err);
      this.updateStatus('Mic Error');
    }
  }

  protected stopRecording() {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor = undefined;
    }
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = undefined;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = undefined;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = undefined;
    }
    this.isRecording = false;
    this.updateStatus('Ready');
    this.clearResults();
  }

  public override cleanup() {
    this.stopRecording();
    super.cleanup();
  }

  protected override getWorkerInitParamsInner(): Record<string, any> {
    return {
      runningMode: this.runningMode,
      ...this.getWorkerInitParams(),
    };
  }

  protected onViewSwitched(_: 'MIC' | 'FILE'): void {}
  protected abstract clearResults(): void;
  protected abstract onAudioFileLoaded(file: File): void;
  protected abstract processAudioData(data: Float32Array, sampleRate: number): void;
}
