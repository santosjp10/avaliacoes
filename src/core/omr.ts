// Leitura óptica (OMR) da folha de respostas a partir de uma foto ou quadro da câmera.
//
// 1. Localiza os 4 quadrados pretos dos cantos (componentes escuros, sólidos e de tamanho parecido
//    que formam o maior quadrilátero da imagem).
// 2. Usa o QR para saber qual canto é o superior esquerdo (a folha pode estar girada).
// 3. Calcula a homografia milímetro → pixel, o que corrige perspectiva, rotação e escala.
// 4. Mede o preenchimento de cada bolha comparando o miolo com o papel ao redor.
//
// Tudo em TypeScript puro, sem dependências: roda no celular, em milissegundos.

import type { ItemGabarito, Resposta } from './types';
import { GRADE, MARCADOR, geometriaFolha, type VersaoLayout } from './folha';

export interface ImagemRGBA { data: Uint8ClampedArray | Uint8Array; width: number; height: number }
type Ponto = [number, number];

export interface AmostraBolha { pos: number; op: string; x: number; y: number; r: number; nivel: number }
export interface LeituraOMR {
  ok: true;
  respostas: Resposta[];
  /** true = a leitura dessa questão merece conferência (marcação fraca, dupla ou rasurada). */
  duvidas: boolean[];
  amostras: AmostraBolha[];
  marcadores: Ponto[];
}
export type ResultadoOMR = LeituraOMR | { ok: false; motivo: 'marcadores' };

// Limiares de preenchimento (0 = papel limpo, 1 = totalmente preto)
export const LIMIAR_MARCADA = 0.3;
export const LIMIAR_DUVIDA = 0.17;

// ───────── Imagem ─────────
function paraCinza(img: ImagemRGBA): Uint8Array {
  const { data, width, height } = img;
  const g = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  return g;
}

function reduzir(g: Uint8Array, w: number, h: number, maxLado: number) {
  const esc = Math.min(1, maxLado / Math.max(w, h));
  if (esc === 1) return { g, w, h, esc };
  const W = Math.round(w * esc), H = Math.round(h * esc);
  const out = new Uint8Array(W * H);
  const passo = 1 / esc;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * passo), y1 = Math.min(h, Math.floor((y + 1) * passo));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * passo), x1 = Math.min(w, Math.floor((x + 1) * passo));
      let s = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += g[yy * w + xx]; n++; }
      out[y * W + x] = n ? s / n : 0;
    }
  }
  return { g: out, w: W, h: H, esc };
}

/** Binarização adaptativa por média local (imagem integral): tolera sombras e iluminação desigual. */
function binarizar(g: Uint8Array, w: number, h: number): Uint8Array {
  const int = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) { s += g[y * w + x]; int[(y + 1) * (w + 1) + x + 1] = int[y * (w + 1) + x + 1] + s; }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 10));
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const soma = int[yb * (w + 1) + xb] - int[ya * (w + 1) + xb] - int[yb * (w + 1) + xa] + int[ya * (w + 1) + xa];
      const media = soma / ((yb - ya) * (xb - xa));
      m[y * w + x] = g[y * w + x] < media * 0.7 && g[y * w + x] < 170 ? 1 : 0;
    }
  }
  return m;
}

interface Componente {
  area: number; x0: number; x1: number; y0: number; y1: number; cx: number; cy: number; borda: boolean;
  /** área / área do fecho convexo: ~1 para formas cheias; baixo para anéis (ex.: padrões do QR). */
  solidez: number;
  /** área / (π·rmax²): quadrado ≈ 0,64; círculo ≈ 1 (bolha pintada). */
  circularidade: number;
}

function fechoConvexo(pts: Ponto[]): Ponto[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cruz = (o: Ponto, a: Ponto, b: Ponto) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inf: Ponto[] = [], sup: Ponto[] = [];
  for (const q of p) { while (inf.length >= 2 && cruz(inf[inf.length - 2], inf[inf.length - 1], q) <= 0) inf.pop(); inf.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (sup.length >= 2 && cruz(sup[sup.length - 2], sup[sup.length - 1], q) <= 0) sup.pop(); sup.push(q); }
  return inf.slice(0, -1).concat(sup.slice(0, -1));
}

function componentes(m: Uint8Array, w: number, h: number, areaMin: number, areaMax: number): Componente[] {
  const visto = new Uint8Array(w * h);
  const pilha = new Int32Array(w * h);
  const pix = new Int32Array(w * h);
  const out: Componente[] = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || visto[i]) continue;
    let topo = 0; pilha[topo++] = i; visto[i] = 1;
    let area = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (topo) {
      const p = pilha[--topo];
      const x = p % w, y = (p - x) / w;
      pix[area] = p;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && m[p - 1] && !visto[p - 1]) { visto[p - 1] = 1; pilha[topo++] = p - 1; }
      if (x < w - 1 && m[p + 1] && !visto[p + 1]) { visto[p + 1] = 1; pilha[topo++] = p + 1; }
      if (y > 0 && m[p - w] && !visto[p - w]) { visto[p - w] = 1; pilha[topo++] = p - w; }
      if (y < h - 1 && m[p + w] && !visto[p + w]) { visto[p + w] = 1; pilha[topo++] = p + w; }
    }
    if (area < areaMin || area > areaMax) continue;
    // extremos de cada linha → fecho convexo e raio máximo
    const nl = y1 - y0 + 1;
    const mn = new Int32Array(nl).fill(w), mx = new Int32Array(nl).fill(-1);
    for (let k = 0; k < area; k++) { const q = pix[k], x = q % w, yy = (q - x) / w - y0; if (x < mn[yy]) mn[yy] = x; if (x > mx[yy]) mx[yy] = x; }
    const ext: Ponto[] = [];
    for (let k = 0; k < nl; k++) if (mx[k] >= 0) { ext.push([mn[k], k + y0], [mx[k] + 1, k + y0], [mn[k], k + y0 + 1], [mx[k] + 1, k + y0 + 1]); }
    const cx = sx / area + 0.5, cy = sy / area + 0.5;
    const hull = fechoConvexo(ext);
    const rmax = Math.max(...ext.map(([x, y]) => Math.hypot(x - cx, y - cy)));
    out.push({ area, x0, x1, y0, y1, cx: cx - 0.5, cy: cy - 0.5, borda: x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === h - 1,
      solidez: area / Math.max(1, areaPoligono(hull)), circularidade: area / (Math.PI * rmax * rmax) });
  }
  return out;
}

function areaPoligono(p: Ponto[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}

function convexo(p: Ponto[]): boolean {
  let sinal = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = p[i], [bx, by] = p[(i + 1) % 4], [cx, cy] = p[(i + 2) % 4];
    const z = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    const s = Math.sign(z);
    if (s === 0) return false;
    if (sinal && s !== sinal) return false;
    sinal = s;
  }
  return true;
}

/** Ordena 4 pontos no sentido horário (na imagem, y para baixo). */
function ordenarHorario(p: Ponto[]): Ponto[] {
  const cx = p.reduce((a, q) => a + q[0], 0) / 4, cy = p.reduce((a, q) => a + q[1], 0) / 4;
  return [...p].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
}

/**
 * Encontra os 4 marcadores. Devolve os centros em pixels da imagem original, ordenados SE, SD, ID, IE da folha.
 * `razaoEsperada` = largura/altura do retângulo formado pelos marcadores (conhecida pela geometria da folha).
 */
export function encontrarMarcadores(img: ImagemRGBA, qrCentro?: Ponto, razaoEsperada = 189 / 276, ladoRelativo = 7 / 930): Ponto[] | null {
  const cinza = paraCinza(img);
  const red = reduzir(cinza, img.width, img.height, 1000);
  const mask = binarizar(red.g, red.w, red.h);
  const md = Math.max(red.w, red.h);
  const ladoMin = md * 0.009, ladoMax = md * 0.13;
  const cands = componentes(mask, red.w, red.h, ladoMin * ladoMin * 0.5, ladoMax * ladoMax)
    .filter(c => {
      if (c.borda) return false;
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      const asp = bw / bh;
      const preench = c.area / (bw * bh);
      // marcador = quadrado CHEIO: descarta anéis (padrões do QR) e círculos (bolhas pintadas)
      return asp > 0.45 && asp < 2.2 && preench > 0.45 && c.solidez > 0.85 && c.circularidade < 0.8;
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, 18);
  if (cands.length < 4) return null;

  let melhor: { pts: Ponto[]; area: number } | null = null;
  const n = cands.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    const g = [cands[a], cands[b], cands[c], cands[d]];
    const areas = g.map(x => x.area);
    if (Math.max(...areas) / Math.min(...areas) > 4) continue;
    const pts = ordenarHorario(g.map(x => [x.cx, x.cy] as Ponto));
    if (!convexo(pts)) continue;
    const area = areaPoligono(pts);
    if (area < red.w * red.h * 0.04) continue;
    // tamanho de cada marcador compatível com a distância entre eles
    const perim = pts.reduce((acc, p, i) => acc + Math.hypot(pts[(i + 1) % 4][0] - p[0], pts[(i + 1) % 4][1] - p[1]), 0);
    const ladoEsp = ladoRelativo * perim;
    if (g.some(x => x.area < ladoEsp * ladoEsp * 0.35 || x.area > ladoEsp * ladoEsp * 2.6)) continue;
    // lados opostos com comprimentos compatíveis (perspectiva moderada)
    const L = pts.map((p, i) => Math.hypot(pts[(i + 1) % 4][0] - p[0], pts[(i + 1) % 4][1] - p[1]));
    if (Math.max(L[0], L[2]) / Math.min(L[0], L[2]) > 1.8 || Math.max(L[1], L[3]) / Math.min(L[1], L[3]) > 1.8) continue;
    const razao = (L[0] + L[2]) / (L[1] + L[3]);
    const r = razao > 1 ? 1 / razao : razao;
    const re = razaoEsperada > 1 ? 1 / razaoEsperada : razaoEsperada;
    if (Math.abs(r - re) > Math.max(0.12, re * 0.3)) continue; // proporção compatível com a área de leitura
    if (!melhor || area > melhor.area) melhor = { pts, area };
  }
  if (!melhor) return null;

  const pts = melhor.pts.map(([x, y]) => [(x + 0.5) / red.esc - 0.5, (y + 0.5) / red.esc - 0.5] as Ponto);
  // Qual é o canto superior esquerdo da folha?
  let inicio = 0;
  if (qrCentro) {
    let dmin = Infinity;
    pts.forEach((p, i) => { const d = Math.hypot(p[0] - qrCentro[0], p[1] - qrCentro[1]); if (d < dmin) { dmin = d; inicio = i; } });
  } else {
    let smin = Infinity;
    pts.forEach((p, i) => { if (p[0] + p[1] < smin) { smin = p[0] + p[1]; inicio = i; } });
  }
  const ordenados = [0, 1, 2, 3].map(k => pts[(inicio + k) % 4]);
  return ordenados;
}

// ───────── Homografia ─────────
export function homografia(origem: Ponto[], destino: Ponto[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = origem[i], [u, v] = destino[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // eliminação de Gauss com pivotamento parcial
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [...h, 1];
}

export function aplicar(H: number[], x: number, y: number): Ponto {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

function amostrar(g: Uint8Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) return 255;
  const fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return g[i] * (1 - fx) * (1 - fy) + g[i + 1] * fx * (1 - fy) + g[i + w] * (1 - fx) * fy + g[i + w + 1] * fx * fy;
}

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// pontos de amostragem (em mm, relativos ao centro da bolha), calculados uma vez
const MIOLO: Ponto[] = [];
for (let dy = -1.9; dy <= 1.9001; dy += 0.38) for (let dx = -1.9; dx <= 1.9001; dx += 0.38) if (dx * dx + dy * dy <= 1.9 * 1.9) MIOLO.push([dx, dy]);
const ANEL: Ponto[] = Array.from({ length: 12 }, (_, i) => [Math.cos((i * Math.PI) / 6) * 3.45, Math.sin((i * Math.PI) / 6) * 3.45]);

export interface Limiares { marcada: number; duvida: number }

export function decidir(niveis: { op: string; nivel: number }[], lim: Limiares = { marcada: LIMIAR_MARCADA, duvida: LIMIAR_DUVIDA }): { resposta: Resposta; duvida: boolean } {
  if (niveis.length === 0) return { resposta: null, duvida: false };
  const s = [...niveis].sort((a, b) => b.nivel - a.nivel);
  const [p, q] = [s[0], s[1] ?? { op: '', nivel: 0 }];
  if (p.nivel >= lim.marcada) {
    if (q.nivel >= lim.marcada && q.nivel > p.nivel * 0.6) return { resposta: '*', duvida: true }; // dupla marcação
    return { resposta: p.op, duvida: q.nivel >= lim.duvida || p.nivel - q.nivel < 0.15 };
  }
  if (p.nivel >= lim.duvida) return { resposta: p.op, duvida: true }; // marcação fraca
  return { resposta: null, duvida: false };
}

/**
 * Limiar de "pintada" calculado na própria folha (2 grupos: vazias × pintadas), dentro de limites seguros.
 * Adapta-se à luz, à caneta e à impressora.
 */
export function limiaresDaFolha(niveis: number[]): Limiares {
  if (niveis.length < 4) return { marcada: LIMIAR_MARCADA, duvida: LIMIAR_DUVIDA };
  let t = LIMIAR_MARCADA;
  for (let it = 0; it < 12; it++) {
    const baixo = niveis.filter(n => n < t), alto = niveis.filter(n => n >= t);
    if (!baixo.length || !alto.length) break;
    const m1 = baixo.reduce((a, b) => a + b, 0) / baixo.length, m2 = alto.reduce((a, b) => a + b, 0) / alto.length;
    t = (m1 + m2) / 2;
  }
  const marcada = Math.min(0.45, Math.max(0.22, t));
  return { marcada, duvida: Math.max(0.12, marcada * 0.55) };
}

// ───────── Modelo de câmera: homografia + distorção radial da lente (barril/almofada) ─────────
// A lente do celular curva a imagem, sobretudo de perto. Modelo de 1 parâmetro (k), centro no meio da imagem:
//   ponto ideal u = c + (o − c)·(1 + k·|o − c|²/R²), onde o é o ponto observado na foto.
interface Modelo { H: number[]; k: number; cx: number; cy: number; R2: number }

function desdistorcer(m: Pick<Modelo, 'k' | 'cx' | 'cy' | 'R2'>, [x, y]: Ponto): Ponto {
  const dx = x - m.cx, dy = y - m.cy, f = 1 + m.k * (dx * dx + dy * dy) / m.R2;
  return [m.cx + dx * f, m.cy + dy * f];
}
function distorcer(m: Pick<Modelo, 'k' | 'cx' | 'cy' | 'R2'>, [ux, uy]: Ponto): Ponto {
  let ox = ux, oy = uy; // ponto fixo: o = c + (u − c)/(1 + k r_o²)
  for (let i = 0; i < 5; i++) { const dx = ox - m.cx, dy = oy - m.cy, f = 1 + m.k * (dx * dx + dy * dy) / m.R2; ox = m.cx + (ux - m.cx) / f; oy = m.cy + (uy - m.cy) / f; }
  return [ox, oy];
}
function projetar(m: Modelo, x: number, y: number): Ponto { return m.k ? distorcer(m, aplicar(m.H, x, y)) : aplicar(m.H, x, y); }

function criarModelo(k: number, mm: Ponto[], obs: Ponto[], W: number, Hh: number): Modelo {
  const base = { k, cx: W / 2, cy: Hh / 2, R2: (W * W + Hh * Hh) / 4 };
  return { ...base, H: homografia(mm, obs.map(o => desdistorcer(base, o))) };
}

// ───────── Ajuste fino local ─────────
interface Local { x: number; y: number; ux: Ponto; uy: Ponto }
function local(m: Modelo, x: number, y: number): Local {
  const [px, py] = projetar(m, x, y), [ax, ay] = projetar(m, x + 1, y), [bx, by] = projetar(m, x, y + 1);
  return { x: px, y: py, ux: [ax - px, ay - py], uy: [bx - px, by - py] };
}
const em = (L: Local, dx: number, dy: number): Ponto => [L.x + L.ux[0] * dx + L.uy[0] * dy, L.y + L.ux[1] * dx + L.uy[1] * dy];
const ANG = Array.from({ length: 16 }, (_, i) => [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)]);
const R_BOLHA = GRADE.bolha / 2;

/** Quanto o contorno impresso da bolha coincide com (ox, oy): anel escuro e papel claro logo fora. */
function encaixe(g: Uint8Array, w: number, h: number, L: Local, ox: number, oy: number): number {
  let anel = 0, fora = 0;
  for (const [c, s] of ANG) {
    for (const r of [R_BOLHA - 0.25, R_BOLHA, R_BOLHA + 0.25]) { const [x, y] = em(L, ox + c * r, oy + s * r); anel += amostrar(g, w, h, x, y); }
    const [x, y] = em(L, ox + c * (R_BOLHA + 0.95), oy + s * (R_BOLHA + 0.95)); fora += amostrar(g, w, h, x, y);
  }
  return fora / ANG.length - anel / (ANG.length * 3); // positivo = contorno escuro sobre papel claro
}

function melhorDeslocamento(g: Uint8Array, w: number, h: number, Ls: Local[], cx: number, cy: number, raio: number, passo: number): { dx: number; dy: number; nota: number } {
  let m = { dx: cx, dy: cy, nota: -Infinity };
  for (let dy = cy - raio; dy <= cy + raio + 1e-9; dy += passo) for (let dx = cx - raio; dx <= cx + raio + 1e-9; dx += passo) {
    let nota = 0;
    for (const L of Ls) nota += encaixe(g, w, h, L, dx, dy);
    if (nota > m.nota) m = { dx, dy, nota };
  }
  return m;
}

function nivelLocal(g: Uint8Array, w: number, h: number, L: Local, ox: number, oy: number): number {
  const papel = Math.max(60, mediana(ANEL.map(([dx, dy]) => { const [x, y] = em(L, ox + dx, oy + dy); return amostrar(g, w, h, x, y); })));
  let soma = 0;
  for (const [dx, dy] of MIOLO) { const [x, y] = em(L, ox + dx, oy + dy); soma += amostrar(g, w, h, x, y); }
  return Math.max(0, Math.min(1, 1 - soma / MIOLO.length / papel));
}

/** Lê as respostas de uma folha. `qrCentro` em pixels da imagem (melhora a orientação). */
export function lerFolhaOMR(img: ImagemRGBA, itens: ItemGabarito[], qrCentro?: Ponto, versao: VersaoLayout = 2): ResultadoOMR {
  const geo = geometriaFolha(itens, versao);
  const [m0, m1, m2, m3] = geo.marcadores;
  const razao = (Math.hypot(m1[0] - m0[0], m1[1] - m0[1]) + Math.hypot(m2[0] - m3[0], m2[1] - m3[1])) / (Math.hypot(m3[0] - m0[0], m3[1] - m0[1]) + Math.hypot(m2[0] - m1[0], m2[1] - m1[1]));
  const perimetro = geo.marcadores.reduce((acc, p, i) => { const q = geo.marcadores[(i + 1) % 4]; return acc + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
  const marcadores = encontrarMarcadores(img, qrCentro, razao, MARCADOR.lado / perimetro);
  if (!marcadores) return { ok: false, motivo: 'marcadores' };
  const g = paraCinza(img);
  const W = img.width, Hh = img.height;
  const todas = geo.linhas.flatMap(l => l.opcoes);
  // 1) escolhe a curvatura da lente (k) que melhor encaixa TODAS as bolhas nos contornos impressos
  const notaModelo = (k: number) => {
    const m = criarModelo(k, geo.marcadores, marcadores, W, Hh);
    let n = 0;
    for (const o of todas) n += encaixe(g, W, Hh, local(m, o.x, o.y), 0, 0);
    return n;
  };
  let melhorK = 0, melhorNota = notaModelo(0);
  for (let k = -0.3; k <= 0.3001; k += 0.03) { const n = notaModelo(k); if (n > melhorNota) { melhorNota = n; melhorK = k; } }
  for (let k = melhorK - 0.03; k <= melhorK + 0.0301; k += 0.0075) { const n = notaModelo(k); if (n > melhorNota) { melhorNota = n; melhorK = k; } }
  const modelo = criarModelo(melhorK, geo.marcadores, marcadores, W, Hh);
  const centro = projetar(modelo, (geo.zona.x0 + geo.zona.x1) / 2, (geo.zona.y0 + geo.zona.y1) / 2);
  const lado = projetar(modelo, (geo.zona.x0 + geo.zona.x1) / 2 + 1, (geo.zona.y0 + geo.zona.y1) / 2);
  const escala = Math.hypot(lado[0] - centro[0], lado[1] - centro[1]); // pixels por milímetro
  // sanidade: o QR precisa estar onde a geometria prevê; senão os 4 pontos não são os marcadores
  if (qrCentro) {
    const [qx, qy] = projetar(modelo, geo.qr.x + geo.qr.lado / 2, geo.qr.y + geo.qr.lado / 2);
    if (Math.hypot(qx - qrCentro[0], qy - qrCentro[1]) > 15 * escala) return { ok: false, motivo: 'marcadores' };
  }
  // 2) por linha: ajuste residual (±2,5 mm — menos que meia distância entre bolhas: não pula de bolha).
  //    Compensa papel curvado e o que o modelo da lente não explicou.
  const porLinha = geo.linhas.map(l => {
    const Ls = l.opcoes.map(o => local(modelo, o.x, o.y));
    if (!Ls.length) return { Ls, dx: 0, dy: 0, nota: 0 };
    const grosso = melhorDeslocamento(g, W, Hh, Ls, 0, 0, 2.5, 0.3);
    const fino = melhorDeslocamento(g, W, Hh, Ls, grosso.dx, grosso.dy, 0.3, 0.1);
    return { Ls, dx: fino.dx, dy: fino.dy, nota: fino.nota / Ls.length };
  });
  // suaviza entre linhas vizinhas da mesma coluna; linha que destoa (ou com encaixe fraco) pede conferência
  const qualidadeRef = mediana(porLinha.filter(r => r.Ls.length).map(r => r.nota)) ?? 0;
  const suave = porLinha.map((r, i) => {
    const viz = porLinha.filter((q, j) => q.Ls.length && Math.abs(j - i) <= 2 && Math.abs(geo.linhas[j].x - geo.linhas[i].x) < 1);
    const dx = mediana(viz.map(v => v.dx)) ?? r.dx, dy = mediana(viz.map(v => v.dy)) ?? r.dy;
    return { dx, dy, destoa: Math.hypot(r.dx - dx, r.dy - dy) > 1.0 || (r.Ls.length > 0 && r.nota < qualidadeRef * 0.55) };
  });
  // qualidade: o contorno das bolhas foi encontrado? (foto borrada ou desalinhada → nota baixa)
  const notas = porLinha.filter(r => r.Ls.length).map(r => r.nota);
  const qualidade = notas.length ? mediana(notas) : 0;
  if (qualidade < 6) return { ok: false, motivo: 'marcadores' };
  // 3) por bolha: ajuste pequeno (±0,6 mm) e medida do preenchimento
  const brutos = geo.linhas.map((l, i) => l.opcoes.map((o, k) => {
    const L = porLinha[i].Ls[k];
    const b = melhorDeslocamento(g, W, Hh, [L], suave[i].dx, suave[i].dy, 0.6, 0.2);
    const ox = b.dx, oy = b.dy;
    const nivel = nivelLocal(g, W, Hh, L, ox, oy);
    const [x, y] = em(L, ox, oy);
    return { op: o.op, nivel, x, y };
  }));
  const lim = limiaresDaFolha(brutos.flat().map(b => b.nivel));
  const amostras: AmostraBolha[] = [];
  const respostas: Resposta[] = [];
  const duvidas: boolean[] = [];
  geo.linhas.forEach((l, i) => {
    for (const b of brutos[i]) amostras.push({ pos: l.pos, op: b.op, x: b.x, y: b.y, r: (GRADE.bolha / 2) * escala, nivel: b.nivel });
    const d = decidir(brutos[i], lim);
    respostas.push(l.tipo === 'disc' ? null : d.resposta);
    // linha incerta: pede conferência mesmo se parecer em branco (pode ser bolha pintada fora do lugar previsto)
    const maxNivel = Math.max(0, ...brutos[i].map(b => b.nivel));
    duvidas.push(l.tipo === 'disc' ? false : d.duvida || (suave[i].destoa && (d.resposta !== null || maxNivel > lim.duvida * 0.5)));
  });
  return { ok: true, respostas, duvidas, amostras, marcadores };
}

