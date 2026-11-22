/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base relativa: o app funciona em qualquer subpasta (ex.: GitHub Pages /avaliacoes/)
// identificação da versão exibida no app (data da compilação + commit, quando disponível)
const agora = new Date();
const VERSAO = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(/-/g, '.') + '-' +
  agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).replace(':', 'h') +
  (process.env.GITHUB_SHA ? '·' + process.env.GITHUB_SHA.slice(0, 7) : '');

export default defineConfig({
  base: './',
  define: { __VERSAO__: JSON.stringify(VERSAO) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Avaliações — Estúdio e Corretor',
        short_name: 'Avaliações',
        description: 'Elaboração e correção de avaliações, no PC e no celular.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f5f1ea',
        theme_color: '#0d0d0d',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
    }),
  ],
  test: { environment: 'node' },
});
