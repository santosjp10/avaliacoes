// Formatos trocados entre Estúdio (PC) e Corretor (celular).
//
// QR de pareamento (exibido no PC, lido uma vez pelo celular):
//   AVP1|<idChave>|<chave>|<professor>
// QR da folha (impresso em cada prova):
//   AV2|<idChave>|<código>|<versão>|<dados cifrados>
//   dados = JSON { g: gabarito compacto (1 caractere por questão), p: peso(s) }
//   O gabarito só é legível por quem tem a chave do professor.
// Pacote de resultados (arquivo enviado do celular para o PC):
//   { formato: 'AVR1', idChave, dispositivo, geradoEm, dados: cifrado(JSON Correcao[]) }

import type { Correcao, ItemGabarito } from './types';
import { cifrar, decifrar } from './cripto';

export interface Pareamento { idChave: string; chave: string; professor: string }

export function qrPareamento(p: Pareamento): string {
  return ['AVP1', p.idChave, p.chave, p.professor.replace(/\|/g, ' ').slice(0, 60)].join('|');
}

export function lerQrPareamento(txt: string): Pareamento | null {
  const partes = txt.split('|');
  if (partes[0] !== 'AVP1' || partes.length < 3) return null;
  return { idChave: partes[1], chave: partes[2], professor: partes[3] ?? '' };
}

export interface DadosFolha {
  avaliacaoId: string;
  titulo: string;
  codigo: string;
  versao: string;
  itens: ItemGabarito[];
  /** Folha personalizada: aluno impresso na folha. */
  aluno?: { nome: string; matricula: string };
}

// Gabarito compacto, 1 caractere por questão (mantém o QR pequeno e fácil de ler pela câmera):
//   múltipla escolha → 'A'..'T' = 65 + (nAlt − 2)·5 + índice da correta;  V/F → 'v'/'f';  discursiva → 'd'
function compactar(it: ItemGabarito): string {
  if (it.tipo === 'vf') return it.correta === 'F' ? 'f' : 'v';
  if (it.tipo === 'disc') return 'd';
  const idx = Math.max(0, 'ABCDE'.indexOf(it.correta ?? 'A'));
  return String.fromCharCode(65 + (it.nAlt - 2) * 5 + idx);
}

function expandir(ch: string, peso: number): ItemGabarito {
  if (ch === 'd') return { tipo: 'disc', nAlt: 0, correta: null, peso };
  if (ch === 'v' || ch === 'f') return { tipo: 'vf', nAlt: 2, correta: ch.toUpperCase(), peso };
  const k = ch.charCodeAt(0) - 65;
  return { tipo: 'me', nAlt: Math.floor(k / 5) + 2, correta: 'ABCDE'[k % 5], peso };
}

// formato antigo (AV1), mantido para ler folhas já impressas
function expandirV1(s: string, peso: number): ItemGabarito {
  if (s === 'D') return { tipo: 'disc', nAlt: 0, correta: null, peso };
  if (s === 'V' || s === 'F') return { tipo: 'vf', nAlt: 2, correta: s, peso };
  return { tipo: 'me', nAlt: Number(s.slice(1)), correta: s[0] === '?' ? null : s[0], peso };
}

/** No QR v2 a avaliação é identificada pelo código; o Estúdio resolve o id ao importar. */
export const prefixoCodigo = (codigo: string) => `cod:${codigo}`;

export async function qrFolha(chave: string, idChave: string, d: DadosFolha): Promise<string> {
  const pesos = d.itens.map(i => i.peso);
  const uniforme = pesos.every(p => p === pesos[0]);
  const dados: Record<string, unknown> = { g: d.itens.map(compactar).join(''), p: uniforme ? pesos[0] : pesos };
  if (d.aluno) dados.a = [d.aluno.nome.slice(0, 48), d.aluno.matricula.slice(0, 20)];
  const corpo = JSON.stringify(dados);
  return ['AV2', idChave, d.codigo.replace(/\|/g, '-'), d.versao, await cifrar(chave, corpo)].join('|');
}

export type LeituraFolha =
  | { ok: true; dados: DadosFolha }
  | { ok: false; motivo: 'formato' | 'chave' | 'corrompido'; idChave?: string };

export function idChaveDaFolha(txt: string): string | null {
  const p = txt.split('|');
  return p[0] === 'AV1' || p[0] === 'AV2' ? p[1] : null;
}

export async function lerQrFolha(txt: string, chave: string, idChave: string): Promise<LeituraFolha> {
  const p = txt.split('|');
  if ((p[0] !== 'AV1' && p[0] !== 'AV2') || p.length !== 5) return { ok: false, motivo: 'formato' };
  if (p[1] !== idChave) return { ok: false, motivo: 'chave', idChave: p[1] };
  try {
    const c = JSON.parse(await decifrar(chave, p[4]));
    const peso = (i: number) => Array.isArray(c.p) ? Number(c.p[i]) : Number(c.p);
    if (p[0] === 'AV1') {
      const itens = String(c.g).split(',').map((s, i) => expandirV1(s, peso(i)));
      return { ok: true, dados: { avaliacaoId: c.i, titulo: c.t, codigo: p[2], versao: p[3], itens } };
    }
    const itens = [...String(c.g)].map((ch, i) => expandir(ch, peso(i)));
    const aluno = Array.isArray(c.a) ? { nome: String(c.a[0] ?? ''), matricula: String(c.a[1] ?? '') } : undefined;
    return { ok: true, dados: { avaliacaoId: prefixoCodigo(p[2]), titulo: p[2], codigo: p[2], versao: p[3], itens, aluno } };
  } catch {
    return { ok: false, motivo: 'corrompido' };
  }
}

export interface PacoteResultados {
  formato: 'AVR1';
  idChave: string;
  dispositivo: string;
  geradoEm: number;
  quantidade: number;
  dados: string;
}

export async function montarPacote(chave: string, idChave: string, dispositivo: string, correcoes: Correcao[]): Promise<PacoteResultados> {
  return {
    formato: 'AVR1', idChave, dispositivo, geradoEm: Date.now(), quantidade: correcoes.length,
    dados: await cifrar(chave, JSON.stringify(correcoes)),
  };
}

export async function abrirPacote(pacote: unknown, chave: string, idChave: string): Promise<Correcao[]> {
  const p = pacote as PacoteResultados;
  if (!p || p.formato !== 'AVR1') throw new Error('Arquivo não é um pacote de resultados do Corretor.');
  if (p.idChave !== idChave) throw new Error('Pacote gerado com outra chave de professor.');
  const lista = JSON.parse(await decifrar(chave, p.dados));
  if (!Array.isArray(lista)) throw new Error('Pacote corrompido.');
  return lista as Correcao[];
}
