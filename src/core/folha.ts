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

// ─────────────────────────────────────────────────────────────────────────────
// Layout 2 (folhas novas): ÁREA DE LEITURA COMPACTA.
// O QR fica ao lado das bolhas e os 4 marcadores ficam colados nesse conjunto,
// de modo que o celular pode fotografar bem de perto. O tamanho da área depende
// do número de questões e é recalculado igualmente na impressão e na leitura.
// Layout 1 = folhas antigas (marcadores nos cantos da página, QR no cabeçalho).
// ─────────────────────────────────────────────────────────────────────────────

export type VersaoLayout = 1 | 2;

export interface GeometriaFolha {
  versao: VersaoLayout;
  linhas: LinhaFolha[];
  /** Centros dos marcadores: SE, SD, ID, IE. */
  marcadores: [number, number][];
  /** QR: canto superior esquerdo e lado (mm). */
  qr: { x: number; y: number; lado: number };
  /** Retângulo do conteúdo da área de leitura (sem os marcadores). */
  zona: { x0: number; y0: number; x1: number; y1: number };
  /** y a partir do qual pode vir o restante da página (área do professor). */
  fim: number;
  /** Altura de cada linha de questão (mm). */
  linha: number;
}

export const LEITURA = {
  topo: 82,          // y do conteúdo da área de leitura
  qr: 30,            // lado do QR
  vao: 5,            // espaço entre o QR e a primeira coluna (layout lateral)
  afastamento: 6,    // distância do centro do marcador até o conteúdo
  maxLateral: 60,    // até 60 questões: QR ao lado; acima disso: QR em cima
};

function larguraColuna(itens: Pick<ItemGabarito, 'tipo' | 'nAlt'>[]): number {
  const maxAlt = Math.max(0, ...itens.map(i => (i.tipo === 'vf' ? 2 : i.tipo === 'me' ? i.nAlt : 0)));
  const bolhas = maxAlt ? GRADE.numero + GRADE.bolha + (maxAlt - 1) * GRADE.passo + 2.5 : 0;
  const disc = itens.some(i => i.tipo === 'disc') ? 41 : 0;
  return Math.max(bolhas, disc, 24);
}

export function geometriaFolha(itens: Pick<ItemGabarito, 'tipo' | 'nAlt'>[], versao: VersaoLayout = 2): GeometriaFolha {
  if (versao === 1) {
    return {
      versao, linhas: layoutFolha(itens), marcadores: CENTROS_MARCADORES,
      qr: { x: CENTRO_QR[0] - 19, y: CENTRO_QR[1] - 19, lado: 38 },
      zona: { x0: 17, y0: GRADE.topo, x1: 193, y1: GRADE.topo + GRADE.porColuna * GRADE.linha }, fim: 262, linha: GRADE.linha,
    };
  }
  const n = itens.length;
  const lateral = n <= LEITURA.maxLateral;
  const nCol = Math.max(1, Math.ceil(n / GRADE.porColuna));
  // colunas equilibradas (ex.: 30 questões = 2 × 15, não 20 + 10): a área fica mais baixa e compacta
  const porCol = Math.ceil(n / nCol);
  const colunas = Array.from({ length: nCol }, (_, c) => itens.slice(c * porCol, (c + 1) * porCol));
  // colunas com folga, mas sem estourar a largura útil (marcadores a ≥ 5 mm da borda do papel)
  const disponivel = 174 - (lateral ? LEITURA.qr + LEITURA.vao : 0);
  let larguras = colunas.map(larguraColuna);
  const total0 = larguras.reduce((a, b) => a + b, 0);
  if (total0 > disponivel) larguras = larguras.map(l => l * disponivel / total0);
  const somaCol = larguras.reduce((a, b) => a + b, 0);
  const linhasGrade = Math.min(n, porCol);
  const linha = lateral ? GRADE.linha : 7; // provas muito longas: linhas um pouco mais justas para caber na página
  const altGrade = linhasGrade * linha;
  const largura = lateral ? LEITURA.qr + LEITURA.vao + somaCol : Math.max(LEITURA.qr, somaCol);
  const altura = lateral ? Math.max(LEITURA.qr, altGrade) : LEITURA.qr + 4 + altGrade;
  const x0 = (PAGINA.largura - largura) / 2;
  const y0 = LEITURA.topo;
  const gx = lateral ? x0 + LEITURA.qr + LEITURA.vao : x0;
  const gy = lateral ? y0 : y0 + LEITURA.qr + 4;
  const inicioCol = larguras.map((_, c) => gx + larguras.slice(0, c).reduce((a, b) => a + b, 0));
  const linhas = itens.map((it, pos) => {
    const c = Math.floor(pos / porCol), r = pos % porCol;
    const x = inicioCol[c], y = gy + r * linha, cy = y + linha / 2;
    const opcoes = opcoesItem(it).map((op, i) => ({ op, x: x + GRADE.numero + GRADE.bolha / 2 + i * GRADE.passo, y: cy }));
    return { pos, tipo: it.tipo, x, y, largura: larguras[c], opcoes };
  });
  const zona = { x0, y0, x1: x0 + largura, y1: y0 + altura };
  const a = LEITURA.afastamento;
  const marcadores: [number, number][] = [[zona.x0 - a, zona.y0 - a], [zona.x1 + a, zona.y0 - a], [zona.x1 + a, zona.y1 + a], [zona.x0 - a, zona.y1 + a]];
  return { versao, linhas, marcadores, qr: { x: x0, y: y0, lado: LEITURA.qr }, zona, fim: Math.max(250, zona.y1 + a + MARCADOR.lado / 2 + 5), linha };
}
