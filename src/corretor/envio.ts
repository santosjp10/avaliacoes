// Envio pelo celular: pacote para o Estúdio, resumo das notas e resultado individual do aluno.
// Arquivos vão pela folha de compartilhamento do sistema (WhatsApp, Gmail, Drive…);
// textos podem ir direto por link do WhatsApp (wa.me) ou do e-mail (mailto).
import type { Correcao } from '../core/types';
import type { Resultado } from '../core/correcao';
import type { DadosFolha } from '../core/payload';
import { fmtNum } from '../core/util';
import { baixar } from '../data/backup';

export type Desfecho = 'compartilhado' | 'baixado' | 'cancelado';

/** Compartilha um arquivo pela folha do sistema; sem suporte, baixa o arquivo. */
export async function compartilharArquivo(conteudo: string, nome: string, tipo: string, titulo: string, texto: string): Promise<Desfecho> {
  const arq = new File([conteudo], nome, { type: tipo });
  if (navigator.canShare?.({ files: [arq] })) {
    try { await navigator.share({ files: [arq], title: titulo, text: texto }); return 'compartilhado'; }
    catch (e) { if ((e as DOMException).name === 'AbortError') return 'cancelado'; }
  }
  baixar(arq, nome);
  return 'baixado';
}

/** Compartilha só texto (folha do sistema ou, sem suporte, WhatsApp). */
export async function compartilharTexto(texto: string, titulo: string): Promise<Desfecho> {
  if (navigator.share) {
    try { await navigator.share({ title: titulo, text: texto }); return 'compartilhado'; }
    catch (e) { if ((e as DOMException).name === 'AbortError') return 'cancelado'; }
  }
  abrirWhatsApp(texto);
  return 'compartilhado';
}

export function abrirWhatsApp(texto: string, telefone = '') {
  const num = telefone.replace(/\D/g, '');
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(texto)}`, '_blank');
}

export function abrirEmail(assunto: string, corpo: string, para = '') {
  location.href = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

export interface LinhaResumo { c: Correcao; r: Resultado }

export function textoResumo(codigo: string, linhas: LinhaResumo[]): string {
  const ordenadas = [...linhas].sort((a, b) => a.c.aluno.localeCompare(b.c.aluno, 'pt-BR'));
  const max = linhas[0]?.r.max ?? 0;
  const media = linhas.length ? linhas.reduce((s, l) => s + l.r.total, 0) / linhas.length : 0;
  const pend = linhas.filter(l => l.r.discPendentes > 0).length;
  return [
    `📋 Resultados — ${codigo}`,
    `${linhas.length} folha(s) corrigida(s) · média ${fmtNum(media, 2)} de ${fmtNum(max, 2)}`,
    pend ? `⏳ ${pend} com questão discursiva ainda sem nota` : '',
    '',
    ...ordenadas.map((l, i) => `${i + 1}. ${l.c.aluno}${l.c.matricula ? ` (${l.c.matricula})` : ''} — ${fmtNum(l.r.total, 2)}/${fmtNum(l.r.max, 2)} · ${fmtNum(l.r.percentual)}%${l.r.discPendentes ? ' ⏳' : ''}`),
    '',
    'Notas calculadas no celular, antes de eventuais ajustes de gabarito feitos no Estúdio.',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}

export function csvResumo(linhas: LinhaResumo[]): (string | number | null)[][] {
  return [
    ['Aluno', 'Matrícula', 'Prova', 'Versão', 'Objetiva', 'Discursiva', 'Total', 'Máximo', '%'],
    ...[...linhas].sort((a, b) => a.c.aluno.localeCompare(b.c.aluno, 'pt-BR'))
      .map(({ c, r }) => [c.aluno, c.matricula, c.codigo, c.versao, r.objetiva, r.discPendentes ? null : r.discursiva, r.total, r.max, r.percentual]),
  ];
}

/** Mensagem para o próprio aluno: nota e questões erradas com a resposta certa. */
export function textoAluno(folha: DadosFolha, c: Correcao, r: Resultado): string {
  const erradas = r.itens.filter(i => i.tipo !== 'disc' && !i.acertou && !i.anulada);
  return [
    `Olá, ${c.aluno.split(' ')[0]}!`,
    `Resultado da avaliação ${folha.codigo} (versão ${folha.versao}):`,
    `*Nota: ${fmtNum(r.total, 2)} de ${fmtNum(r.max, 2)}* (${fmtNum(r.percentual)}%)`,
    `Objetivas: ${r.acertos} de ${r.nObjetivas} acertos${r.maxDiscursiva ? ` · Discursivas: ${r.discPendentes ? 'em correção' : `${fmtNum(r.discursiva, 2)} de ${fmtNum(r.maxDiscursiva, 2)}`}` : ''}`,
    erradas.length ? `Questões a revisar: ${erradas.map(i => `${i.pos + 1} (marcou ${i.marcada === '*' ? 'duas' : i.marcada ?? 'em branco'}; correta ${i.correta})`).join(', ')}` : 'Você acertou todas as objetivas. Parabéns!',
  ].join('\n');
}
