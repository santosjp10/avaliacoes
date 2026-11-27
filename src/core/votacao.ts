import type { Resposta } from './types';

export interface Leitura { respostas: Resposta[]; duvidas: boolean[] }

/**
 * Combina leituras de vários quadros da câmera da mesma folha.
 * Por questão: vale a resposta da maioria; se as leituras não forem unânimes
 * (ou a maioria tiver dúvida), a questão fica destacada para conferência.
 */
export function combinarLeituras(ls: Leitura[]): Leitura & { concordancia: number } {
  const n = ls[0]?.respostas.length ?? 0;
  const respostas: Resposta[] = [], duvidas: boolean[] = [];
  let unanimes = 0;
  for (let i = 0; i < n; i++) {
    const cont = new Map<string, number>();
    for (const l of ls) { const k = String(l.respostas[i]); cont.set(k, (cont.get(k) ?? 0) + 1); }
    const [k, votos] = [...cont].sort((a, b) => b[1] - a[1])[0];
    const resp = k === 'null' ? null : k;
    const unanime = votos === ls.length;
    if (unanime) unanimes++;
    const duvidaMaioria = ls.filter(l => String(l.respostas[i]) === k && l.duvidas[i]).length > votos / 2;
    respostas.push(resp);
    duvidas.push(!unanime || duvidaMaioria);
  }
  return { respostas, duvidas, concordancia: n ? unanimes / n : 1 };
}
