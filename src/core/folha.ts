// Geometria da folha de respostas, em milímetros, com origem no canto superior esquerdo da página A4.
// A MESMA função é usada para imprimir a folha e para lê-la pela câmera: mudar aqui muda os dois.
import type { ItemGabarito } from './types';
import { opcoesItem } from './gabarito';

export const PAGINA = { largura: 210, altura: 297 };
export const MARCADOR = { lado: 7, margem: 7 };
/** Centros dos 4 marcadores, na ordem: superior esquerdo, superior direito, inferior direito, inferior esquerdo. */
export const CENTROS_MARCADORES: [number, number][] = [
  [MARCADOR.margem + MARCADOR.lado / 2, MARCADOR.margem + MARCADOR.lado / 2],
  [PAGINA.largura - MARCADOR.margem - MARCADOR.lado / 2, MARCADOR.margem + MARCADOR.lado / 2],
  [PAGINA.largura - MARCADOR.margem - MARCADOR.lado / 2, PAGINA.altura - MARCADOR.margem - MARCADOR.lado / 2],
  [MARCADOR.margem + MARCADOR.lado / 2, PAGINA.altura - MARCADOR.margem - MARCADOR.lado / 2],
];
/** Centro aproximado do QR no cabeçalho (usado só para saber qual canto é o superior esquerdo). */
export const CENTRO_QR: [number, number] = [40, 39];

export const GRADE = {
  topo: 82,          // y da primeira linha
  esquerda: 17,
  largura: 176,
  linha: 8,          // altura de cada linha
  porColuna: 20,
  bolha: 5.4,        // diâmetro
  passo: 7.2,        // distância entre centros de bolhas
  numero: 9,         // espaço do número da questão
  maxColunas: 4,
};
export const MAX_QUESTOES_FOLHA = GRADE.porColuna * GRADE.maxColunas;

export interface OpcaoFolha { op: string; x: number; y: number }
export interface LinhaFolha { pos: number; tipo: ItemGabarito['tipo']; x: number; y: number; largura: number; opcoes: OpcaoFolha[] }

export function layoutFolha(itens: Pick<ItemGabarito, 'tipo' | 'nAlt'>[]): LinhaFolha[] {
  const n = itens.length;
  const colunas = Math.min(GRADE.maxColunas, Math.max(1, Math.ceil(n / GRADE.porColuna)));
  const larguraCol = Math.min(60, GRADE.largura / colunas);
  const x0 = GRADE.esquerda + (GRADE.largura - colunas * larguraCol) / 2;
  return itens.map((it, pos) => {
    const c = Math.floor(pos / GRADE.porColuna);
    const r = pos % GRADE.porColuna;
    const x = x0 + c * larguraCol;
    const y = GRADE.topo + r * GRADE.linha;
    const cy = y + GRADE.linha / 2;
    const opcoes = opcoesItem(it).map((op, i) => ({ op, x: x + GRADE.numero + GRADE.bolha / 2 + i * GRADE.passo, y: cy }));
    return { pos, tipo: it.tipo, x, y, largura: larguraCol, opcoes };
  });
}
