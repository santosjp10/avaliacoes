import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// No celular, abre direto no Corretor na primeira visita sem rota.
if (!location.hash || location.hash === '#' || location.hash === '#/') {
  const celular = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700;
  if (celular) location.hash = '#/corretor';
}

// Pede ao navegador para não apagar os dados locais por falta de espaço.
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
