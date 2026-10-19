import './style.css';
import { renderShell } from './shell';
import { router } from './router';

const root = document.getElementById('app')!;
renderShell(root);
router.start();

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isDashboardPrefix = window.location.pathname.startsWith('/dashboard');
    const swUrl = isDashboardPrefix ? '/dashboard/sw.js' : './sw.js';
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// PWA Install Prompt Handler
let deferredPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
    installBtn.onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          installBtn.style.display = 'none';
        }
        deferredPrompt = null;
      }
    };
  }
});

window.addEventListener('appinstalled', () => {
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) installBtn.style.display = 'none';
  console.log('Dashboard PWA installed successfully');
});
