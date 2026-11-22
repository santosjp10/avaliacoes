// Formatos trocados entre Estúdio (PC) e Corretor (celular).
//
// QR de pareamento (exibido no PC, lido uma vez pelo celular):
//   AVP1|<idChave>|<chave>|<professor>
// QR da folha (impresso em cada prova):
//   AV1|<idChave>|<código>|<versão>|<dados cifrados>
//   dados = JSON { i: avaliacaoId, t: título, g: itens compactos, p: pesos }
//   O gabarito só é legível por quem tem a chave do professor.
// Pacote de resultados (arquivo enviado do celular para o PC):
//   { formato: 'AVR1', idChave, dispositivo, geradoEm, dados: cifrado(JSON Correcao[]) }

import type { Correcao, ItemGabarito, TipoQuestao } from './types';
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
}

// item compacto: me → letra+nAlt ("B4"); vf → "V"/"F"; disc → "D"
function compactar(it: ItemGabarito): string {
  if (it.tipo === 'me') return `${it.correta ?? '?'}${it.nAlt}`;
  if (it.tipo === 'vf') return it.correta ?? '?';
  return 'D';
}

function expandir(s: string, peso: number): ItemGabarito {
  if (s === 'D') return { tipo: 'disc', nAlt: 0, correta: null, peso };
  if (s === 'V' || s === 'F') return { tipo: 'vf', nAlt: 2, correta: s, peso };
  const tipo: TipoQuestao = 'me';
  const correta = s[0] === '?' ? null : s[0];
  return { tipo, nAlt: Number(s.slice(1)), correta, peso };
}

export async function qrFolha(chave: string, idChave: string, d: DadosFolha): Promise<string> {
  const pesos = d.itens.map(i => i.peso);
  const uniforme = pesos.every(p => p === pesos[0]);
  const corpo = JSON.stringify({
    i: d.avaliacaoId,
    t: d.titulo.slice(0, 60),
    g: d.itens.map(compactar).join(','),
    p: uniforme ? pesos[0] : pesos,
  });
  return ['AV1', idChave, d.codigo.replace(/\|/g, '-'), d.versao, await cifrar(chave, corpo)].join('|');
}

export type LeituraFolha =
  | { ok: true; dados: DadosFolha }
  | { ok: false; motivo: 'formato' | 'chave' | 'corrompido'; idChave?: string };

export function idChaveDaFolha(txt: string): string | null {
  const p = txt.split('|');
  return p[0] === 'AV1' ? p[1] : null;
}

export async function lerQrFolha(txt: string, chave: string, idChave: string): Promise<LeituraFolha> {
  const p = txt.split('|');
  if (p[0] !== 'AV1' || p.length !== 5) return { ok: false, motivo: 'formato' };
  if (p[1] !== idChave) return { ok: false, motivo: 'chave', idChave: p[1] };
  try {
    const c = JSON.parse(await decifrar(chave, p[4]));
    const cods: string[] = String(c.g).split(',');
    const itens = cods.map((s, i) => expandir(s, Array.isArray(c.p) ? Number(c.p[i]) : Number(c.p)));
    return { ok: true, dados: { avaliacaoId: c.i, titulo: c.t, codigo: p[2], versao: p[3], itens } };
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
