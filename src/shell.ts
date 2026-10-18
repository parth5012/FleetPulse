export function renderShell(root: HTMLElement): void {
  root.innerHTML = `
    <div class="container">
      <nav class="shell-nav" id="shellNav">
        <a href="#/" data-route="/">Home</a>
        <a href="#/antigravity" data-route="/antigravity">Antigravity</a>
      </nav>
      <main id="page"></main>
    </div>
  `;
}
