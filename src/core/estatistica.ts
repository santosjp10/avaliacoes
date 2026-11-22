import type { Avaliacao, Correcao, Questao } from './types';
import { corrigir, type Resultado } from './correcao';
import { itensDaVersao, obterVersao } from './gabarito';
import { LETRAS, arred } from './util';

export interface Descritivas { n: number; media: number; mediana: number; desvio: number; min: number; max: number }

export function descritivas(valores: number[]): Descritivas {
  const n = valores.length;
  if (n === 0) return { n: 0, media: 0, mediana: 0, desvio: 0, min: 0, max: 0 };
  const s = [...valores].sort((a, b) => a - b);
  const media = s.reduce((a, b) => a + b, 0) / n;
  const desvio = Math.sqrt(s.reduce((a, v) => a + (v - media) ** 2, 0) / n);
  const mediana = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return { n, media: arred(media, 2), mediana: arred(mediana, 2), desvio: arred(desvio, 2), min: s[0], max: s[n - 1] };
}

export interface AnaliseItem {
  /** Índice da questão no snapshot (a questão "verdadeira", independente da versão). */
  idx: number;
  questao: Questao;
  n: number;
  /** Índice de dificuldade: proporção de acerto (0–1). Discursivas: nota média / peso. */
  facilidade: number;
  /** Correlação ponto-bisserial corrigida (item × total sem o item). null se indefinida. */
  discriminacao: number | null;
  /** Múltipla escolha: quantas vezes cada alternativa ORIGINAL foi marcada (id → contagem), + brancos. */
  escolhas: Record<string, number>;
  brancos: number;
}

function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export interface CorrecaoAvaliada { c: Correcao; r: Resultado }

export function avaliarTodas(av: Avaliacao, correcoes: Correcao[]): CorrecaoAvaliada[] {
  return correcoes.flatMap(c => {
    try { return [{ c, r: corrigir(itensDaVersao(av, c.versao), c.respostas, c.notasDisc) }]; }
    catch { return []; }
  });
}

/**
 * Análise de itens agregada pela questão original — não pela posição, que muda entre versões
 * (erro metodológico do sistema antigo).
 */
export function analiseItens(av: Avaliacao, avaliadas: CorrecaoAvaliada[]): AnaliseItem[] {
  const snap = av.snapshot ?? [];
  return snap.map((q, idx) => {
    const notaItem: number[] = [];
    const resto: number[] = [];
    const escolhas: Record<string, number> = {};
    let brancos = 0;
    for (const { c, r } of avaliadas) {
      const v = obterVersao(av, c.versao);
      if (!v) continue;
      const pos = v.ordem.indexOf(idx);
      const it = r.itens[pos];
      if (!it) continue;
      if (it.tipo === 'disc' && it.pontos === null) continue;
      const frac = it.max > 0 ? (it.pontos ?? 0) / it.max : 0;
      notaItem.push(frac);
      resto.push(r.total - (it.pontos ?? 0));
      if (q.tipo === 'me') {
        const m = c.respostas[pos];
        const li = m ? LETRAS.indexOf(m as (typeof LETRAS)[number]) : -1;
        const ordemAlt = v.alternativas[q.id] ?? q.alternativas.map(a => a.id);
        if (li >= 0 && ordemAlt[li]) escolhas[ordemAlt[li]] = (escolhas[ordemAlt[li]] ?? 0) + 1;
        else brancos++;
      } else if (q.tipo === 'vf') {
        const m = c.respostas[pos];
        if (m === 'V' || m === 'F') escolhas[m] = (escolhas[m] ?? 0) + 1; else brancos++;
      }
    }
    const n = notaItem.length;
    const p = pearson(notaItem, resto);
    return {
      idx, questao: q, n,
      facilidade: n ? arred(notaItem.reduce((a, b) => a + b, 0) / n, 3) : 0,
      discriminacao: p === null ? null : arred(p, 2),
      escolhas, brancos,
    };
  });
}

export function rotuloFacilidade(f: number): string {
  if (f >= 0.85) return 'Muito fácil';
  if (f >= 0.6) return 'Fácil';
  if (f >= 0.4) return 'Média';
  if (f >= 0.2) return 'Difícil';
  return 'Muito difícil';
}

export function rotuloDiscriminacao(d: number | null): string {
  if (d === null) return '—';
  if (d >= 0.4) return 'Ótima';
  if (d >= 0.3) return 'Boa';
  if (d >= 0.2) return 'Regular';
  if (d >= 0) return 'Fraca — revisar';
  return 'Negativa — verificar gabarito';
}
