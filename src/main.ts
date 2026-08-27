import './app_clean.css';
import { setupFaceLandmarker, cleanupFaceLandmarker } from './tasks/face-landmarker';
import { renderSidebar } from './ui/sidebar';
import { renderMobileNav } from './ui/mobile-nav';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="app-container">
    <aside class="sidebar"></aside>
    <div class="mobile-header">
      <button class="menu-toggle material-icons" style="margin-right: 12px; color: var(--text-secondary); background: none; border: none; font-size: 24px; cursor: pointer;">menu</button>
      <div id="mobile-nav-container" style="display: flex; align-items: center; flex-grow: 1;"></div>
    </div>
    <main class="main-content"></main>
  </div>
`;

const sidebar = app.querySelector('.sidebar') as HTMLElement;
renderSidebar(sidebar);

const mobileNavContainer = app.querySelector('#mobile-nav-container') as HTMLElement;
renderMobileNav(mobileNavContainer);

const menuToggles = app.querySelectorAll('.menu-toggle');
menuToggles.forEach((toggle) => {
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
});

sidebar.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('a')) {
    sidebar.classList.remove('open');
  }
});

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

    const links = sidebar.querySelectorAll('a');
    links.forEach((l) => {
      if (l.getAttribute('href') === `#${hash}`) l.classList.add('active');
      else l.classList.remove('active');
    });
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
