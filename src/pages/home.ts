export function renderHome(container: HTMLElement): void {
  container.innerHTML = `
    <h1>⚡ Dashboard Service</h1>
    <p class="muted" style="margin:8px 0 20px;">Multi-page dashboard. Pick a page from the nav.</p>
    <div class="card">
      <h2 style="font-size:1.1rem;margin-bottom:8px;">Pages</h2>
      <ul style="list-style:none;display:flex;flex-direction:column;gap:6px;">
        <li><a href="#/antigravity">Antigravity Quota Dashboard →</a></li>
      </ul>
    </div>
  `;
}
