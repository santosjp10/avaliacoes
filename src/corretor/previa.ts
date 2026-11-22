import type { LeituraOMR } from '../core/omr';

/** Imagem reduzida da folha com a leitura desenhada por cima, para o professor conferir. */
export function desenharLeitura(img: ImageData, r: LeituraOMR, max = 1000): string {
  const esc = Math.min(1, max / Math.max(img.width, img.height));
  const base = document.createElement('canvas');
  base.width = img.width; base.height = img.height;
  base.getContext('2d')!.putImageData(img, 0, 0);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(base, 0, 0, c.width, c.height);
  ctx.lineWidth = Math.max(2, 3 * esc);
  for (const a of r.amostras) {
    const resp = r.respostas[a.pos];
    const escolhida = resp === a.op || (resp === '*' && a.nivel >= 0.3);
    if (!escolhida && !r.duvidas[a.pos]) continue;
    ctx.strokeStyle = resp === '*' ? '#d0342c' : r.duvidas[a.pos] ? '#e0a100' : '#14a05a';
    ctx.beginPath();
    ctx.arc(a.x * esc, a.y * esc, Math.max(4, a.r * esc * 1.35), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#1f6feb';
  for (const [x, y] of r.marcadores) { ctx.beginPath(); ctx.arc(x * esc, y * esc, 6, 0, Math.PI * 2); ctx.fill(); }
  return c.toDataURL('image/jpeg', 0.72);
}
