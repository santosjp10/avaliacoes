import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/** Tenta ler o QR em escalas diferentes: QRs inclinados ou borrados costumam sair em alguma delas. */
function lerQrMultiescala(fonte: CanvasImageSource, w: number, h: number, escalas: number[], inversao: 'dontInvert' | 'attemptBoth') {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  for (const e of escalas) {
    c.width = Math.round(w * e); c.height = Math.round(h * e);
    ctx.drawImage(fonte, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const r = jsQR(d.data, d.width, d.height, { inversionAttempts: inversao });
    if (r?.data) {
      const L = r.location;
      const centro: [number, number] = [
        (L.topLeftCorner.x + L.topRightCorner.x + L.bottomLeftCorner.x + L.bottomRightCorner.x) / 4 / e,
        (L.topLeftCorner.y + L.topRightCorner.y + L.bottomLeftCorner.y + L.bottomRightCorner.y) / 4 / e,
      ];
      return { texto: r.data, centro };
    }
  }
  return null;
}

export interface Quadro { img: ImageData; qr: [number, number]; fonte: 'camera' | 'foto' }

/**
 * Lê um QR pela câmera traseira. Chama aoLer com o texto e o quadro completo (para a leitura óptica);
 * se aoLer retornar false, continua lendo.
 */
export function LeitorQr({ aoLer, dica, extra }: { aoLer: (texto: string, quadro: Quadro) => Promise<boolean> | boolean; dica: string; extra?: React.ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lanterna, setLanterna] = useState<{ ok: boolean; on: boolean }>({ ok: false, on: false });
  const trilha = useRef<MediaStreamTrack | null>(null);
  const ocupado = useRef(false);
  const cb = useRef(aoLer);
  cb.current = aoLer;

  useEffect(() => {
    let ativo = true;
    let stream: MediaStream | null = null;
    let timer = 0;
    let quadros = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const cheio = document.createElement('canvas');
    const ctxCheio = cheio.getContext('2d', { willReadFrequently: true })!;

    async function iniciar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro(location.protocol === 'https:' || location.hostname === 'localhost'
          ? 'Este navegador não permite usar a câmera.'
          : 'A câmera só funciona com o app aberto em endereço https://.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (!ativo) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        trilha.current = stream.getVideoTracks()[0];
        const cap = trilha.current.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean } | undefined;
        if (cap?.torch) setLanterna({ ok: true, on: false });
        loop();
      } catch (e) {
        const nome = (e as DOMException).name;
        setErro(nome === 'NotAllowedError' ? 'Permissão da câmera negada. Libere o acesso nas configurações do navegador.' : 'Não foi possível abrir a câmera.');
      }
    }

    function loop() {
      if (!ativo) return;
      const v = video.current;
      if (v && v.readyState >= 2 && !ocupado.current) {
        const esc = Math.min(1, 960 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * esc);
        canvas.height = Math.round(v.videoHeight * esc);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const r0 = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        let achado: { texto: string; centro: [number, number] } | null = r0?.data ? {
          texto: r0.data,
          centro: [
            (r0.location.topLeftCorner.x + r0.location.topRightCorner.x + r0.location.bottomLeftCorner.x + r0.location.bottomRightCorner.x) / 4 / esc,
            (r0.location.topLeftCorner.y + r0.location.topRightCorner.y + r0.location.bottomLeftCorner.y + r0.location.bottomRightCorner.y) / 4 / esc,
          ],
        } : null;
        // QR pequeno, inclinado ou borrado: a cada 3 quadros tenta em outras escalas da imagem cheia
        if (!achado && ++quadros % 3 === 0) {
          const escalas = quadros % 6 === 0 ? [1] : [0.7, 0.55];
          achado = lerQrMultiescala(v, v.videoWidth, v.videoHeight, escalas, 'dontInvert');
        }
        if (achado) {
          ocupado.current = true;
          // quadro em resolução cheia para a leitura das bolhas
          cheio.width = v.videoWidth; cheio.height = v.videoHeight;
          ctxCheio.drawImage(v, 0, 0);
          const quadro: Quadro = { img: ctxCheio.getImageData(0, 0, cheio.width, cheio.height), qr: achado.centro, fonte: 'camera' };
          Promise.resolve(cb.current(achado.texto, quadro)).then(fim => {
            if (fim) navigator.vibrate?.(60);
            else setTimeout(() => { ocupado.current = false; }, 1200);
          });
        }
      }
      timer = window.setTimeout(() => requestAnimationFrame(loop), 120);
    }

    iniciar();
    return () => { ativo = false; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  async function alternarLanterna() {
    const t = trilha.current;
    if (!t) return;
    const on = !lanterna.on;
    try { await t.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }); setLanterna({ ok: true, on }); } catch { /* sem suporte */ }
  }

  async function porFoto(f: File | undefined) {
    if (!f) return;
    const img = new Image();
    img.src = URL.createObjectURL(f);
    await img.decode();
    const c = document.createElement('canvas');
    const esc = Math.min(1, 2000 / Math.max(img.width, img.height));
    c.width = img.width * esc; c.height = img.height * esc;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const r = lerQrMultiescala(c, c.width, c.height, [1, 0.75, 0.6, 0.5], 'attemptBoth');
    URL.revokeObjectURL(img.src);
    if (r) await cb.current(r.texto, { img: d, qr: r.centro, fonte: 'foto' });
    else setErro('Não encontrei um QR Code nessa foto. Tente com mais luz e o QR inteiro visível.');
  }

  return (
    <div className="leitor">
      <div className="leitor-video">
        <video ref={video} playsInline muted />
        <div className="mira" aria-hidden><span /><span /><span /><span /><i /></div>
        {erro && <div className="leitor-erro">{erro}</div>}
      </div>
      <p className="leitor-dica">{dica}</p>
      {extra}
      <div className="leitor-acoes">
        {lanterna.ok && <button className="btn" onClick={alternarLanterna}>{lanterna.on ? '🔦 Desligar luz' : '🔦 Lanterna'}</button>}
        <label className="btn">
          📷 Usar foto
          <input type="file" accept="image/*" capture="environment" hidden onChange={e => { porFoto(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
    </div>
  );
}
