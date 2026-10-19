export function renderShell(root: HTMLElement): void {
  root.innerHTML = `
    <div class="container">
      <header class="app-top-header">
        <div class="brand">
          <span class="brand-logo">⚡</span>
          <div class="brand-text">
            <span class="brand-title">Dashboard Hub</span>
            <span class="brand-sub">Beszel & Dozzel Telemetry Engine</span>
          </div>
        </div>
        <nav class="shell-nav" id="shellNav">
          <a href="#/" data-route="/">🏠 Home</a>
          <a href="#/system" data-route="/system">🖥️ System Monitor</a>
          <a href="#/containers" data-route="/containers">🐳 Containers & Logs</a>
          <a href="#/antigravity" data-route="/antigravity">⚡ Antigravity</a>
        </nav>
      </header>
      <main id="page"></main>
    </div>
  `;
}
