// Banco Aberto de Questões: formato publicado, conversão para o banco local e formulário de contribuição.
import type { Nivel, Questao, TipoQuestao } from './types';
import { novoId } from './util';

export interface QuestaoCompartilhada {
  id: string;
  tipo: TipoQuestao;
  enunciado: string;
  alternativas: { id: string; texto: string }[];
  correta: string | null;
  disciplina: string;
  assunto: string;
  nivel: Nivel;
  linhas: number;
  criterio: string;
  fonte: string;
  imagens: { src: string; pos: 'acima' | 'abaixo' | 'direita' }[];
  autor: string;
  instituicao: string;
  licenca: string;
  contribuidor: string;
  issue: string;
  publicadaEm: string;
}

export interface IndiceBanco { versao: number; atualizadoEm: string; total: number; questoes: QuestaoCompartilhada[] }

/** Converte para uma questão do banco local (ids novos; imagens já resolvidas em data URL). */
export function paraLocal(q: QuestaoCompartilhada, imagens: { src: string; pos: QuestaoCompartilhada['imagens'][number]['pos'] }[] = [], agora = Date.now()): Questao {
  const ids = new Map(q.alternativas.map(a => [a.id, novoId()]));
  return {
    id: novoId(), tipo: q.tipo, enunciado: q.enunciado,
    alternativas: q.alternativas.map(a => ({ id: ids.get(a.id)!, texto: a.texto })),
    correta: q.tipo === 'me' ? ids.get(q.correta ?? '') ?? null : q.correta,
    disciplina: q.disciplina, assunto: q.assunto, nivel: q.nivel, imagens, linhas: q.linhas || 8,
    criterio: q.criterio, criadaEm: agora, atualizadaEm: agora,
    origem: { id: q.id, autor: q.autor, instituicao: q.instituicao, licenca: q.licenca, fonte: q.fonte, issue: q.issue },
  };
}

/** Dados enviados no formulário de contribuição (lidos pela automação do GitHub). */
export function paraContribuicao(q: Questao, fonte: string) {
  return {
    v: 1, tipo: q.tipo, enunciado: q.enunciado, disciplina: q.disciplina, assunto: q.assunto, nivel: q.nivel,
    alternativas: q.tipo === 'me' ? q.alternativas.map(a => a.texto) : [],
    correta: q.tipo === 'me' ? q.alternativas.findIndex(a => a.id === q.correta) : q.correta,
    linhas: q.tipo === 'disc' ? q.linhas : 0, criterio: q.criterio, fonte,
  };
}

/** Texto legível da questão, para o revisor ler no GitHub. */
export function leitura(q: Questao): string {
  const L = 'ABCDE';
  const linhas = [`**${q.disciplina}**${q.assunto ? ` · ${q.assunto}` : ''} · ${q.nivel} · ${q.tipo === 'me' ? 'Múltipla escolha' : q.tipo === 'vf' ? 'Verdadeiro/Falso' : 'Discursiva'}`, '', q.enunciado, ''];
  if (q.tipo === 'me') q.alternativas.forEach((a, i) => linhas.push(`${a.id === q.correta ? '✅' : '▫️'} ${L[i]}) ${a.texto}`));
  if (q.tipo === 'vf') linhas.push(`Resposta: ${q.correta === 'V' ? 'Verdadeira' : 'Falsa'}`);
  if (q.criterio) linhas.push('', `Comentário/critério: ${q.criterio}`);
  return linhas.join('\n');
}

export const LIMITE_URL = 7500;

/** Link do formulário de contribuição já preenchido (issue form do GitHub). */
export function urlContribuicao(repo: string, q: Questao, meta: { autor: string; instituicao: string; fonte: string }): { url: string; resumido: boolean } {
  const base = `https://github.com/${repo}/issues/new`;
  const titulo = `[Questão] ${q.disciplina} — ${q.enunciado.replace(/\s+/g, ' ').slice(0, 70)}`;
  const dados = '```json\n' + JSON.stringify(paraContribuicao(q, meta.fonte)) + '\n```';
  const mk = (comLeitura: boolean) => {
    const p = new URLSearchParams({ template: 'questao.yml', title: titulo, autor: meta.autor, instituicao: meta.instituicao, dados });
    if (comLeitura) p.set('leitura', leitura(q));
    if (q.imagens.length) p.set('imagens', `Esta questão tem ${q.imagens.length} imagem(ns): arraste o(s) arquivo(s) para cá.`);
    return `${base}?${p.toString()}`;
  };
  const completo = mk(true);
  return completo.length <= LIMITE_URL ? { url: completo, resumido: false } : { url: mk(false), resumido: true };
}

/** Link para relatar um erro numa questão publicada. */
export function urlRelatarErro(repo: string, q: QuestaoCompartilhada): string {
  const p = new URLSearchParams({ title: `[Erro] Questão ${q.id}`, body: `Questão **${q.id}** (${q.disciplina}${q.assunto ? ' · ' + q.assunto : ''}):\n\n> ${q.enunciado.slice(0, 300)}\n\n**Descreva o problema** (gabarito, enunciado, alternativa, fonte…):\n\n`, labels: 'erro' });
  return `https://github.com/${repo}/issues/new?${p.toString()}`;
}

/** Texto de atribuição para a prova impressa (exigência da licença CC BY). */
export function atribuicao(questoes: Questao[]): string | null {
  const orig = questoes.map(q => q.origem).filter((o): o is NonNullable<Questao['origem']> => !!o);
  if (!orig.length) return null;
  const autores = [...new Set(orig.map(o => o.autor + (o.instituicao ? ` (${o.instituicao})` : '')))];
  return `Contém ${orig.length} questão(ões) do Banco Aberto de Questões, licença ${orig[0].licenca}. Autoria: ${autores.join('; ')}.`;
}
