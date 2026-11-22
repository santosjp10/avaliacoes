import type { ItemGabarito, Resposta } from './types';
import { arred } from './util';

export interface ResultadoItem {
  pos: number;
  tipo: ItemGabarito['tipo'];
  correta: string | null;
  marcada: Resposta;
  /** null = discursiva (sem acerto/erro binário). */
  acertou: boolean | null;
  /** null = discursiva ainda não avaliada. */
  pontos: number | null;
  max: number;
  anulada?: ItemGabarito['anulada'];
}

export interface Resultado {
  itens: ResultadoItem[];
  acertos: number;
  nObjetivas: number;
  objetiva: number;
  maxObjetiva: number;
  discursiva: number;
  maxDiscursiva: number;
  discPendentes: number;
  total: number;
  max: number;
  percentual: number;
}

/**
 * Corrige uma folha. Objetivas: acerto vale o peso; erro, branco ou dupla marcação valem 0.
 * Discursivas: nota lançada pelo professor (limitada a [0, peso]); pendentes contam 0 e são sinalizadas.
 */
export function corrigir(itens: ItemGabarito[], respostas: Resposta[], notasDisc: (number | null)[] = []): Resultado {
  const r: ResultadoItem[] = itens.map((it, pos) => {
    if (it.anulada) {
      // anulada: ponto para todos, ou sai da nota (valor máximo diminui)
      const vale = it.anulada === 'todos';
      return { pos, tipo: it.tipo, correta: it.correta, marcada: respostas[pos] ?? null, acertou: vale ? true : null, pontos: vale ? it.peso : 0, max: vale ? it.peso : 0, anulada: it.anulada };
    }
    if (it.tipo === 'disc') {
      const n = notasDisc[pos];
      const pontos = n == null || Number.isNaN(n) ? null : Math.min(it.peso, Math.max(0, n));
      return { pos, tipo: it.tipo, correta: null, marcada: null, acertou: null, pontos, max: it.peso };
    }
    const marcada = respostas[pos] ?? null;
    const acertou = marcada !== null && it.correta !== null && marcada === it.correta;
    return { pos, tipo: it.tipo, correta: it.correta, marcada, acertou, pontos: acertou ? it.peso : 0, max: it.peso };
  });
  const obj = r.filter(i => i.tipo !== 'disc' && i.anulada !== 'excluir');
  const disc = r.filter(i => i.tipo === 'disc' && i.anulada !== 'excluir');
  const objetiva = arred(obj.reduce((a, i) => a + (i.pontos ?? 0), 0));
  const maxObjetiva = arred(obj.reduce((a, i) => a + i.max, 0));
  const discursiva = arred(disc.reduce((a, i) => a + (i.pontos ?? 0), 0));
  const maxDiscursiva = arred(disc.reduce((a, i) => a + i.max, 0));
  const max = arred(maxObjetiva + maxDiscursiva);
  const total = arred(objetiva + discursiva);
  return {
    itens: r,
    acertos: obj.filter(i => i.acertou).length,
    nObjetivas: obj.length,
    objetiva, maxObjetiva, discursiva, maxDiscursiva,
    discPendentes: disc.filter(i => i.pontos === null && !i.anulada).length,
    total, max,
    percentual: max > 0 ? arred((total / max) * 100, 1) : 0,
  };
}
