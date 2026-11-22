import type { Avaliacao, ItemGabarito, Questao, Versao } from './types';
import { LETRAS, NOMES_VERSAO, embaralhar } from './util';

/** Problemas que impedem publicar uma avaliação. Lista vazia = pode publicar. */
export function validarParaPublicar(av: Avaliacao, questoes: Map<string, Questao>): string[] {
  const erros: string[] = [];
  if (!av.titulo.trim()) erros.push('Informe o título.');
  if (!av.codigo.trim()) erros.push('Informe o código da avaliação.');
  if (av.itens.length === 0) erros.push('Adicione ao menos uma questão.');
  if (av.itens.length > 80) erros.push('A folha de respostas comporta no máximo 80 questões.');
  if (av.nVersoes < 1 || av.nVersoes > NOMES_VERSAO.length) erros.push(`Número de versões deve estar entre 1 e ${NOMES_VERSAO.length}.`);
  av.itens.forEach((it, i) => {
    const q = questoes.get(it.questaoId);
    const n = i + 1;
    if (!q) { erros.push(`Questão ${n}: não encontrada no banco.`); return; }
    if (!(it.peso > 0)) erros.push(`Questão ${n}: peso deve ser maior que zero.`);
    if (q.tipo === 'me') {
      if (q.alternativas.length < 2) erros.push(`Questão ${n}: precisa de ao menos 2 alternativas.`);
      if (q.alternativas.length > LETRAS.length) erros.push(`Questão ${n}: no máximo ${LETRAS.length} alternativas.`);
      if (!q.alternativas.some(a => a.id === q.correta)) erros.push(`Questão ${n}: alternativa correta não definida.`);
    }
    if (q.tipo === 'vf' && q.correta !== 'V' && q.correta !== 'F') erros.push(`Questão ${n}: defina se é Verdadeira ou Falsa.`);
  });
  return erros;
}

/**
 * Gera as versões. A versão A mantém a ordem original (facilita a leitura do professor);
 * as demais embaralham conforme a configuração. Só alternativas de múltipla escolha são
 * embaralhadas — V/F e discursivas nunca perdem a resposta (defeito do sistema antigo).
 */
export function gerarVersoes(
  snapshot: Questao[],
  cfg: { nVersoes: number; embaralharQuestoes: boolean; embaralharAlternativas: boolean },
  rnd: () => number = Math.random,
): Versao[] {
  const base = snapshot.map((_, i) => i);
  const versoes: Versao[] = [];
  for (let k = 0; k < cfg.nVersoes; k++) {
    let ordem = base;
    const alternativas: Record<string, string[]> = {};
    for (const q of snapshot) if (q.tipo === 'me') alternativas[q.id] = q.alternativas.map(a => a.id);
    if (k > 0) {
      // tenta algumas vezes obter uma ordem diferente das versões anteriores
      for (let t = 0; t < 12; t++) {
        ordem = cfg.embaralharQuestoes ? embaralhar(base, rnd) : base;
        if (!cfg.embaralharQuestoes || snapshot.length < 3 || !versoes.some(v => v.ordem.join() === ordem.join())) break;
      }
      if (cfg.embaralharAlternativas) {
        for (const q of snapshot) if (q.tipo === 'me') alternativas[q.id] = embaralhar(q.alternativas.map(a => a.id), rnd);
      }
    }
    versoes.push({ nome: NOMES_VERSAO[k], ordem: [...ordem], alternativas });
  }
  return versoes;
}

export function obterVersao(av: Avaliacao, nome: string): Versao | undefined {
  return av.versoes?.find(v => v.nome === nome);
}

/** Questão do snapshot com eventual troca de gabarito aplicada. */
export function questaoVigente(av: Avaliacao, idx: number): Questao {
  const q = av.snapshot![idx];
  const nova = av.gabaritoAlterado?.[idx];
  return nova ? { ...q, correta: nova } : q;
}

/**
 * Itens de gabarito, por posição, de uma versão publicada — já com trocas de gabarito e anulações.
 * `semAnulacao`: ignora as anulações (usado na análise das questões).
 */
export function itensDaVersao(av: Avaliacao, nomeVersao: string, opcoes: { semAnulacao?: boolean } = {}): ItemGabarito[] {
  const v = obterVersao(av, nomeVersao);
  if (!v || !av.snapshot || !av.pesos) throw new Error(`Versão ${nomeVersao} não encontrada ou avaliação não publicada.`);
  const anuladas = new Set(opcoes.semAnulacao ? [] : av.anuladas ?? []);
  return v.ordem.map(idx => {
    const it = itemGabarito(questaoVigente(av, idx), av.pesos![idx], v);
    return anuladas.has(idx) ? { ...it, anulada: av.politicaAnulacao ?? 'todos' } : it;
  });
}

/** Gabarito como foi impresso (sem trocas nem anulações): usado no QR das folhas. */
export function itensOriginais(av: Avaliacao, nomeVersao: string): ItemGabarito[] {
  const v = obterVersao(av, nomeVersao)!;
  return v.ordem.map(idx => itemGabarito(av.snapshot![idx], av.pesos![idx], v));
}

export function itemGabarito(q: Questao, peso: number, v: Versao): ItemGabarito {
  if (q.tipo === 'me') {
    const ordemAlt = v.alternativas[q.id] ?? q.alternativas.map(a => a.id);
    const i = ordemAlt.indexOf(q.correta ?? '');
    return { tipo: 'me', nAlt: ordemAlt.length, correta: i >= 0 ? LETRAS[i] : null, peso };
  }
  if (q.tipo === 'vf') return { tipo: 'vf', nAlt: 2, correta: q.correta, peso };
  return { tipo: 'disc', nAlt: 0, correta: null, peso };
}

/** Alternativas de uma questão na ordem em que aparecem numa versão. */
export function alternativasNaVersao(q: Questao, v: Versao) {
  const ordem = v.alternativas[q.id] ?? q.alternativas.map(a => a.id);
  return ordem.map(id => q.alternativas.find(a => a.id === id)!).filter(Boolean);
}

/** Opções marcáveis de um item ('A','B',... ou 'V','F'). */
export function opcoesItem(it: Pick<ItemGabarito, 'tipo' | 'nAlt'>): string[] {
  if (it.tipo === 'vf') return ['V', 'F'];
  if (it.tipo === 'me') return LETRAS.slice(0, it.nAlt);
  return [];
}

export function valorTotal(av: Avaliacao): number {
  if (av.pesos) return av.pesos.reduce((a, b) => a + b, 0);
  return av.itens.reduce((a, b) => a + b.peso, 0);
}
