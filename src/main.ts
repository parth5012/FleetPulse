import './style.css';
import { renderShell } from './shell';
import { router } from './router';

const root = document.getElementById('app')!;
renderShell(root);
router.start();
