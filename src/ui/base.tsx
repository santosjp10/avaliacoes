import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';

// ───────── Rotas (hash, funciona em qualquer hospedagem estática) ─────────
export interface Rota { partes: string[]; params: URLSearchParams }

function lerRota(): Rota {
  const h = location.hash.replace(/^#\/?/, '');
  const [caminho, qs = ''] = h.split('?');
  return { partes: caminho.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(qs) };
}

export function useRota(): Rota {
  const [r, setR] = useState(lerRota);
  useEffect(() => {
    const f = () => setR(lerRota());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export function ir(caminho: string) {
  location.hash = '#/' + caminho.replace(/^\//, '');
}

// ───────── Avisos ─────────
type TipoAviso = 'ok' | 'erro' | 'info';
let ouvinte: ((m: string, t: TipoAviso) => void) | null = null;
export function aviso(msg: string, tipo: TipoAviso = 'ok') { ouvinte?.(msg, tipo); }

export function Avisos() {
  const [a, setA] = useState<{ m: string; t: TipoAviso; k: number } | null>(null);
  useEffect(() => {
    let timer: number;
    ouvinte = (m, t) => { setA({ m, t, k: Date.now() }); clearTimeout(timer); timer = window.setTimeout(() => setA(null), 3500); };
    return () => { ouvinte = null; };
  }, []);
  if (!a) return null;
  return <div key={a.k} className={`aviso aviso-${a.t}`} role="status">{a.m}</div>;
}

// ───────── Modal ─────────
export function Modal({ titulo, aoFechar, children, largo, rodape }: { titulo: string; aoFechar: () => void; children: ReactNode; largo?: boolean; rodape?: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aoFechar]);
  return (
    <div className="modal-fundo" onMouseDown={e => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className={`modal ${largo ? 'modal-largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="modal-topo">
          <h2>{titulo}</h2>
          <button className="btn-icone" onClick={aoFechar} aria-label="Fechar">✕</button>
        </header>
        <div className="modal-corpo">{children}</div>
        {rodape && <footer className="modal-rodape">{rodape}</footer>}
      </div>
    </div>
  );
}

// ───────── QR ─────────
export function useQr(texto: string | null, nivel: 'L' | 'M' | 'Q' = 'M'): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!texto) { setUrl(null); return; }
    QRCode.toDataURL(texto, { errorCorrectionLevel: nivel, margin: 1, scale: 8 }).then(u => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [texto, nivel]);
  return url;
}

export function Vazio({ icone, titulo, children }: { icone: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="vazio">
      <div className="vazio-icone" aria-hidden>{icone}</div>
      <h3>{titulo}</h3>
      {children}
    </div>
  );
}

export function escolherArquivo(accept: string): Promise<File | null> {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files?.[0] ?? null);
    i.click();
  });
}

/** Reduz imagens grandes antes de guardar (economiza espaço e acelera a impressão). */
export function prepararImagem(f: File, max = 1400): Promise<string> {
  return new Promise((res, rej) => {
    if (!f.type.startsWith('image/')) { rej(new Error('Selecione uma imagem.')); return; }
    const r = new FileReader();
    r.onerror = () => rej(new Error('Não foi possível ler a imagem.'));
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const esc = Math.min(1, max / Math.max(img.width, img.height));
        if (esc === 1 && f.size < 400_000) { res(r.result as string); return; }
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86));
      };
      img.onerror = () => rej(new Error('Imagem inválida.'));
      img.src = r.result as string;
    };
    r.readAsDataURL(f);
  });
}
