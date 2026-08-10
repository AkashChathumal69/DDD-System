export function renderSidebar(container: HTMLElement) {
  container.innerHTML = `
    <div class="sidebar-header">
      <button class="menu-toggle material-icons" style="margin-right: 12px; color: var(--text-secondary); background: none; border: none; font-size: 24px; cursor: pointer;">menu_open</button>
      <div class="sidebar-logo-text">
        <span class="material-icons" style="color: var(--primary); font-size: 32px;">visibility</span>
        <span style="font-weight: 600; color: var(--text-main);">Drowsiness Monitor</span>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="category-header">Live Monitoring</div>
      <ul>
        <li><a href="#/driver/drowsiness" class="nav-button" data-task="drowsiness-monitor">Driver Drowsiness Detection</a></li>
      </ul>
    </nav>
  `;
}
