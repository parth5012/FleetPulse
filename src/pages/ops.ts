/**
 * Operations & Administration Dashboard.
 * Consolidates Maintenance (Docker GC, journal vacuum, daemon restarts),
 * System Journal & Kernel PSI Watcher, and OmniRoute AI Quotas.
 */

import { renderMaintenance } from './maintenance';
import { renderJournal, cleanupJournal } from './journal';
import { renderAntigravity } from './antigravity';

export function cleanupOps(): void {
  cleanupJournal();
}

export async function renderOps(container: HTMLElement): Promise<void> {
  cleanupOps();

  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const tabParam = urlParams.get('tab');
  let activeTab: 'maintenance' | 'journal' | 'quotas' =
    tabParam === 'journal' || tabParam === 'quotas' || tabParam === 'antigravity'
      ? tabParam === 'antigravity' ? 'quotas' : tabParam
      : 'maintenance';

  container.innerHTML = `
    <div class="gb-page-head">
      <div>
        <h1 class="gb-page-title">Operations & Administration</h1>
        <p class="gb-page-sub">Remote maintenance controls, systemd journal logs, kernel PSI telemetry, and LLM quota pools.</p>
      </div>
    </div>

    <!-- Operations Sub-Navigation Tabs -->
    <div class="beszel-subnav" id="opsSubnav" style="margin-bottom:20px;">
      <button class="beszel-tab ${activeTab === 'maintenance' ? 'active' : ''}" data-tab="maintenance">Maintenance</button>
      <button class="beszel-tab ${activeTab === 'journal' ? 'active' : ''}" data-tab="journal">System Journal & Kernel</button>
      <button class="beszel-tab ${activeTab === 'quotas' ? 'active' : ''}" data-tab="quotas">AI Quota Headroom</button>
    </div>

    <!-- Active Tab Container -->
    <div id="opsTabContent"></div>
  `;

  async function renderActiveTab(): Promise<void> {
    const content = container.querySelector('#opsTabContent') as HTMLElement;
    if (!content) return;
    content.innerHTML = '';

    if (activeTab === 'maintenance') {
      await renderMaintenance(content, true);
    } else if (activeTab === 'journal') {
      await renderJournal(content, true);
    } else if (activeTab === 'quotas') {
      await renderAntigravity(content, true);
    }
  }

  const tabBtns = container.querySelectorAll('#opsSubnav .beszel-tab') as NodeListOf<HTMLButtonElement>;
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nextTab = (btn.getAttribute('data-tab') as 'maintenance' | 'journal' | 'quotas') || 'maintenance';
      if (nextTab === activeTab) return;

      if (activeTab === 'journal') {
        cleanupJournal();
      }

      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = nextTab;
      window.location.hash = `#/ops?tab=${activeTab}`;
      await renderActiveTab();
    });
  });

  await renderActiveTab();
}
