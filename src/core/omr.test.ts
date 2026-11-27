import { describe, expect, it } from 'vitest';
import { homografia, aplicar, lerFolhaOMR, decidir } from './omr';
import { GRADE, MARCADOR, geometriaFolha, type VersaoLayout } from './folha';
import type { ItemGabarito } from './types';
import { rngSemente } from './util';

type P = [number, number];
const itens: ItemGabarito[] = Array.from({ length: 34 }, (_, i) =>
  i % 9 === 4 ? { tipo: 'vf', nAlt: 2, correta: 'V', peso: 1 } : i === 20 ? { tipo: 'disc', nAlt: 0, correta: null, peso: 2 } : { tipo: 'me', nAlt: 5, correta: 'A', peso: 1 });

/** Desenha a folha (em mm) e a fotografa com a homografia dada: rotação, perspectiva, sombra e ruído. */
function fotografar(marcas: Record<number, string[]>, cantosPx: P[], W: number, H: number, semente = 1, versao: VersaoLayout = 1) {
  const geo = geometriaFolha(itens, versao);
  const Hinv = homografia(cantosPx, geo.marcadores); // pixel → mm
  const rnd = rngSemente(semente);
  const linhas = geo.linhas;
  const CENTRO_QR = [geo.qr.x + geo.qr.lado / 2, geo.qr.y + geo.qr.lado / 2];
  const bolhas = linhas.flatMap(l => l.opcoes.map(o => ({ ...o, cheia: (marcas[l.pos] ?? []).includes(o.op) })));
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [mx, my] = aplicar(Hinv, x, y);
    let v = 70; // mesa escura fora da folha
    if (mx >= 0 && mx <= 210 && my >= 0 && my <= 297) {
      v = 235;
      for (const [cx, cy] of geo.marcadores) if (Math.abs(mx - cx) <= MARCADOR.lado / 2 && Math.abs(my - cy) <= MARCADOR.lado / 2) v = 15;
      if (Math.abs(mx - CENTRO_QR[0]) < geo.qr.lado / 2 && Math.abs(my - CENTRO_QR[1]) < geo.qr.lado / 2) v = ((Math.floor(mx) + Math.floor(my * 1.3)) % 2) ? 20 : 235;
      for (const b of bolhas) {
        const d = Math.hypot(mx - b.x, my - b.y);
        if (b.cheia && d < GRADE.bolha / 2 - 0.2) v = 40 + 30 * rnd();
        else if (Math.abs(d - GRADE.bolha / 2) < 0.18) v = 60;
        else if (d < 1.2 && !b.cheia && (Math.floor(mx * 4) + Math.floor(my * 4)) % 3 === 0) v = 195; // letra cinza
      }
      v *= 0.72 + 0.28 * (x / W); // sombra lateral
    }
    v = Math.max(0, Math.min(255, v + (rnd() - 0.5) * 30));
    const i = (y * W + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const qr = aplicar(homografia(geo.marcadores, cantosPx), CENTRO_QR[0], CENTRO_QR[1]);
  return { img: { data, width: W, height: H }, qr };
}

const marcas: Record<number, string[]> = { 0: ['A'], 1: ['B'], 2: ['C'], 3: ['D'], 4: ['F'], 5: ['E'], 7: ['A', 'C'], 13: ['V'], 25: ['B'], 33: ['E'] };

function conferir(r: ReturnType<typeof lerFolhaOMR>) {
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.respostas.slice(0, 8)).toEqual(['A', 'B', 'C', 'D', 'F', 'E', null, '*']);
  expect(r.respostas[13]).toBe('V');
  expect(r.respostas[20]).toBeNull();
  expect(r.respostas[25]).toBe('B');
  expect(r.respostas[33]).toBe('E');
  expect(r.respostas.filter(x => x !== null)).toHaveLength(10);
  expect(r.duvidas[7]).toBe(true);
}

describe('leitura óptica', { timeout: 60_000 }, () => {
  it('folha reta', () => {
    const W = 720, H = 1000;
    const k = 3.2, ox = 25, oy = 20;
    const cantos = geometriaFolha(itens, 1).marcadores.map(([x, y]) => [ox + x * k, oy + y * k] as P);
    const f = fotografar(marcas, cantos, W, H);
    conferir(lerFolhaOMR(f.img, itens, f.qr, 1));
  });

  it('folha inclinada e em perspectiva, foto deitada (90°)', () => {
    const W = 1280, H = 960;
    // canto SE da folha aparece à direita-topo da foto: folha girada ~90° e com trapézio
    const cantos: P[] = [[1170, 95], [1150, 880], [210, 905], [160, 60]];
    const f = fotografar(marcas, cantos, W, H, 7);
    const t0 = performance.now();
    const r = lerFolhaOMR(f.img, itens, f.qr, 1);
    console.log(`OMR 1280x960: ${Math.round(performance.now() - t0)} ms`);
    conferir(r);
  });

  it('folha de cabeça para baixo', () => {
    const W = 800, H = 1100;
    const cantos: P[] = [[740, 1040], [80, 1020], [60, 70], [720, 40]];
    const f = fotografar(marcas, cantos, W, H, 3);
    conferir(lerFolhaOMR(f.img, itens, f.qr, 1));
  });

  it('folha nova (área compacta): foto bem de perto, área ocupando quase toda a imagem', () => {
    const W = 1080, H = 1440;
    // 34 questões → 2 colunas; a área de leitura (com marcadores) quase encosta nas bordas da foto
    const cantos: P[] = [[60, 70], [1010, 95], [1000, 1360], [75, 1340]];
    const f = fotografar(marcas, cantos, W, H, 5, 2);
    conferir(lerFolhaOMR(f.img, itens, f.qr, 2));
  });

  it('folha nova: de longe, inclinada', () => {
    const W = 1280, H = 1700;
    const cantos: P[] = [[330, 520], [960, 470], [1010, 1190], [360, 1250]];
    const f = fotografar(marcas, cantos, W, H, 9, 2);
    conferir(lerFolhaOMR(f.img, itens, f.qr, 2));
  });

  it('folha nova: de cabeça para baixo', () => {
    const W = 1000, H = 1300;
    const cantos: P[] = [[920, 1220], [90, 1200], [70, 90], [930, 70]];
    const f = fotografar(marcas, cantos, W, H, 4, 2);
    conferir(lerFolhaOMR(f.img, itens, f.qr, 2));
  });

  it('geometria nova: área compacta e marcadores dentro da página', () => {
    for (const n of [5, 10, 20, 34, 60, 61, 80]) {
      const g = geometriaFolha(Array.from({ length: n }, () => ({ tipo: 'me' as const, nAlt: 5 })), 2);
      for (const [x, y] of g.marcadores) { expect(x - 3.5).toBeGreaterThanOrEqual(5); expect(x + 3.5).toBeLessThanOrEqual(205); expect(y + 3.5).toBeLessThan(g.fim); }
      expect(g.fim).toBeLessThan(285);
      const larg = g.marcadores[1][0] - g.marcadores[0][0], alt = g.marcadores[3][1] - g.marcadores[0][1];
      if (n === 10) { expect(larg).toBeLessThan(100); expect(alt).toBeLessThan(100); }
    }
  });

  it('sem marcadores visíveis: recusa em vez de chutar', () => {
    const W = 400, H = 400;
    const data = new Uint8ClampedArray(W * H * 4).fill(230);
    expect(lerFolhaOMR({ data, width: W, height: H }, itens).ok).toBe(false);
  });

  it('regras de decisão', () => {
    expect(decidir([{ op: 'A', nivel: 0.05 }, { op: 'B', nivel: 0.7 }])).toEqual({ resposta: 'B', duvida: false });
    expect(decidir([{ op: 'A', nivel: 0.6 }, { op: 'B', nivel: 0.55 }])).toEqual({ resposta: '*', duvida: true });
    expect(decidir([{ op: 'A', nivel: 0.2 }, { op: 'B', nivel: 0.03 }])).toEqual({ resposta: 'A', duvida: true });
    expect(decidir([{ op: 'A', nivel: 0.05 }, { op: 'B', nivel: 0.08 }])).toEqual({ resposta: null, duvida: false });
  });
});

describe('votação entre quadros', async () => {
  const { combinarLeituras } = await import('./votacao');
  it('maioria vence e divergência vira dúvida', () => {
    const r = combinarLeituras([
      { respostas: ['A', 'B', null, 'C'], duvidas: [false, false, false, false] },
      { respostas: ['A', 'B', null, 'D'], duvidas: [false, false, false, false] },
      { respostas: ['A', 'C', null, 'C'], duvidas: [false, false, false, true] },
    ]);
    expect(r.respostas).toEqual(['A', 'B', null, 'C']);
    expect(r.duvidas).toEqual([false, true, false, true]);
    expect(r.concordancia).toBe(0.5);
  });
});
