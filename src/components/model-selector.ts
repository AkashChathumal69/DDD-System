import { ViewToggle } from './view-toggle';

export interface ModelOption {
  label: string;
  value: string;
  isDefault?: boolean;
}

export type ModelSelection = { type: 'standard'; value: string } | { type: 'custom'; file: File };

export class ModelSelector {
  private container: HTMLElement;
  private options: ModelOption[];
  private onModelChanged: (selection: ModelSelection) => void;
  private currentMode: 'standard' | 'upload' = 'standard';

  private viewList!: HTMLElement;
  private viewUpload!: HTMLElement;
  private modelSelect!: HTMLSelectElement;
  private modelUpload!: HTMLInputElement;
  private uploadStatus!: HTMLElement;
  private progressContainer!: HTMLElement;
  private progressBar!: HTMLElement;
  private progressText!: HTMLElement;

  constructor(containerId: string, options: ModelOption[], onModelChanged: (selection: ModelSelection) => void) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`ModelSelector: container ${containerId} not found`);
    this.container = el;
    this.options = options;
    this.onModelChanged = onModelChanged;

    this.render();
  }

  public updateOptions(newOptions: ModelOption[]) {
    this.options = newOptions;

    if (this.modelSelect) {
      this.modelSelect.innerHTML = '';
      this.options.forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.isDefault) o.selected = true;
        this.modelSelect.appendChild(o);
      });
    }
  }

  private render() {
    // 1. Structural CSS / HTML
    this.container.innerHTML = `
      <div id="${this.container.id}-toggle" class="tab-container" style="margin-bottom: 12px;"></div>

      <div id="${this.container.id}-view-list" class="tab-content active">
        <div class="select-wrapper">
          <select class="model-select">
            ${this.options.map((opt) => `<option value="${opt.value}" ${opt.isDefault ? 'selected' : ''}>${opt.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="${this.container.id}-view-upload" class="tab-content" style="display: none;">
        <label class="file-upload-btn">
            Choose .png or .jpg File
            <input type="file" class="model-upload" accept=".jpg,.png">
        </label>
        <div class="status-text upload-status">No file chosen</div>
        <div class="progress-container model-loading-progress" style="display: none;">
            <div class="progress-bar"></div>
            <div class="progress-text">Loading Model... 0%</div>
        </div>
      </div>
    `;

    // 2. DOM lookups
    this.viewList = this.container.querySelector(`#${this.container.id}-view-list`)!;
    this.viewUpload = this.container.querySelector(`#${this.container.id}-view-upload`)!;
    this.modelSelect = this.container.querySelector('.model-select')!;
    this.modelUpload = this.container.querySelector('.model-upload')!;
    this.uploadStatus = this.container.querySelector('.upload-status')!;
    this.progressContainer = this.container.querySelector('.model-loading-progress')!;
    this.progressBar = this.container.querySelector('.progress-bar')!;
    this.progressText = this.container.querySelector('.progress-text')!;

    // 3. View Toggle Initialization
    new ViewToggle(
      `${this.container.id}-toggle`,
      [
        { label: 'Standard', value: 'standard', icon: 'grid_view' },
        { label: 'Upload', value: 'upload', icon: 'upload' },
      ],
      'standard',
      (mode) => {
        this.currentMode = mode as 'standard' | 'upload';
        if (this.currentMode === 'standard') {
          this.viewList.style.display = 'block';
          this.viewUpload.style.display = 'none';
          this.viewList.classList.add('active');
          this.viewUpload.classList.remove('active');
        } else {
          this.viewUpload.style.display = 'block';
          this.viewList.style.display = 'none';
          this.viewUpload.classList.add('active');
          this.viewList.classList.remove('active');
        }
      },
      'tabs'
    );

    // 4. Event Listeners
    this.modelSelect.addEventListener('change', () => {
      this.modelUpload.value = ''; // clear any uploaded file
      this.uploadStatus.innerText = 'No file chosen';
      this.onModelChanged({ type: 'standard', value: this.modelSelect.value });
    });

    this.modelUpload.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.uploadStatus.innerText = file.name;
        this.onModelChanged({ type: 'custom', file });
      }
    });
  }

  public showProgress(loaded: number, total: number) {
    if (this.currentMode === 'upload') return;
    const percent = Math.round((loaded / total) * 100);
    this.progressContainer.style.display = 'block';
    this.progressBar.style.width = `${percent}%`;
    this.progressText.innerText = `Loading Model... ${percent}%`;
  }

  public hideProgress() {
    this.progressContainer.style.display = 'none';
  }
}
