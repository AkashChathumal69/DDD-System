import './app_clean.css';
import { setupFaceLandmarker, cleanupFaceLandmarker } from './tasks/face-landmarker';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="app-container">
    <main class="main-content"></main>
  </div>
`;

const mainContent = app.querySelector('.main-content') as HTMLElement;

const routes = {
  '/driver/drowsiness': {
    setup: setupFaceLandmarker,
    cleanup: cleanupFaceLandmarker,
    label: 'Drowsiness Monitor',
  },
};

let currentCleanup: (() => void) | undefined;

async function router() {
  let hash = window.location.hash.slice(1);

  if (!hash || !routes[hash as keyof typeof routes]) {
    hash = '/driver/drowsiness';
    window.location.hash = hash;
  }

  const route = routes[hash as keyof typeof routes];

  if (currentCleanup) {
    currentCleanup();
    currentCleanup = undefined;
  }

  mainContent.innerHTML = '';

  if (route) {
    await route.setup(mainContent);
    currentCleanup = route.cleanup;
    document.title = `${route.label} - Driver Drowsiness Detection`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);
router();

(window as any).cleanupActiveTask = () => {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = undefined;
  }
};
