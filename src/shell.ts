export function renderShell(root: HTMLElement): void {
  root.innerHTML = `
    <div class="app-layout">
      <!-- Desktop / Tablet Top Header -->
      <header class="app-top-header">
        <div class="brand">
          <a href="#/" class="brand-link">
            <span class="brand-logo">⚡</span>
            <div class="brand-text">
              <span class="brand-title">FleetPulse</span>
              <span class="brand-sub">Host Observability & Task Engine</span>
            </div>
          </a>
        </div>

        <nav class="shell-nav desktop-nav" id="shellNav">
          <a href="#/" data-route="/">🏠 Home</a>
          <a href="#/tasks" data-route="/tasks">⚡ Tasks</a>
          <a href="#/services" data-route="/services">⚙️ Services</a>
          <a href="#/system" data-route="/system">🖥️ System</a>
          <a href="#/network" data-route="/network">🌐 Network</a>
          <a href="#/journal" data-route="/journal">📜 Journal</a>
          <a href="#/maintenance" data-route="/maintenance">🛠️ Maintenance</a>
          <a href="#/containers" data-route="/containers">🐳 Containers</a>
          <a href="#/antigravity" data-route="/antigravity">🔮 Quotas</a>
        </nav>

        <div class="header-right">
          <button id="pwaInstallBtn" class="btn btn-pwa-install" style="display: none;" title="Install Dashboard as App">
            📱 Install App
          </button>
          <div class="live-status-pill" title="Telemetry live streaming">
            <span class="live-dot"></span>
            <span class="live-text">LIVE</span>
          </div>
        </div>
      </header>

      <!-- Main Page Viewport -->
      <main id="page" class="page-content container"></main>

      <!-- Mobile Touch Bottom Navigation Bar -->
      <nav class="mobile-bottom-nav" id="mobileNav">
        <a href="#/" data-route="/" class="nav-item">
          <span class="nav-icon">🏠</span>
          <span class="nav-label">Home</span>
        </a>
        <a href="#/tasks" data-route="/tasks" class="nav-item">
          <span class="nav-icon">⚡</span>
          <span class="nav-label">Tasks</span>
        </a>
        <a href="#/services" data-route="/services" class="nav-item">
          <span class="nav-icon">⚙️</span>
          <span class="nav-label">Svcs</span>
        </a>
        <a href="#/system" data-route="/system" class="nav-item">
          <span class="nav-icon">🖥️</span>
          <span class="nav-label">System</span>
        </a>
        <a href="#/network" data-route="/network" class="nav-item">
          <span class="nav-icon">🌐</span>
          <span class="nav-label">Net</span>
        </a>
        <a href="#/journal" data-route="/journal" class="nav-item">
          <span class="nav-icon">📜</span>
          <span class="nav-label">Logs</span>
        </a>
        <a href="#/maintenance" data-route="/maintenance" class="nav-item">
          <span class="nav-icon">🛠️</span>
          <span class="nav-label">Maint</span>
        </a>
        <a href="#/containers" data-route="/containers" class="nav-item">
          <span class="nav-icon">🐳</span>
          <span class="nav-label">Fleet</span>
        </a>
        <a href="#/antigravity" data-route="/antigravity" class="nav-item">
          <span class="nav-icon">🔮</span>
          <span class="nav-label">Quota</span>
        </a>
      </nav>
    </div>
  `;
}
