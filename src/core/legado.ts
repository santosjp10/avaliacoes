// Importação do banco de questões exportado pelo ProvaSystem antigo (banco_questoes.json).
import type { Imagem, Nivel, Questao } from './types';
import { LETRAS, novoId } from './util';

interface QuestaoLegado {
  id?: string;
  tipo?: 'multipla' | 'vf' | 'discursiva';
  disciplina?: string;
  assunto?: string;
  nivel?: string;
  enunciado?: string;
  alternativas?: Record<string, string>;
  correta?: string | null;
  obs?: string;
  imagem?: string | null;
  imagemPos?: string | null;
  desenho?: string | null;
  linhas?: number | null;
  criada?: number;
}

const NIVEIS: Nivel[] = ['Fácil', 'Médio', 'Difícil'];

export interface ResultadoImportacao { questoes: Questao[]; ignoradas: number; avisos: string[] }

export function importarLegado(dados: unknown, agora = Date.now()): ResultadoImportacao {
  if (!Array.isArray(dados)) throw new Error('O arquivo não contém uma lista de questões.');
  const questoes: Questao[] = [];
  const avisos: string[] = [];
  let ignoradas = 0;
  dados.forEach((raw: QuestaoLegado, i) => {
    const enunciado = String(raw?.enunciado ?? '').trim();
    if (!enunciado) { ignoradas++; return; }
    const tipoLeg = raw.tipo ?? 'multipla';
    const imagens: Imagem[] = [];
    if (raw.imagem) imagens.push({ src: raw.imagem, pos: (['acima', 'abaixo', 'direita'].includes(raw.imagemPos ?? '') ? raw.imagemPos : 'acima') as Imagem['pos'] });
    if (raw.desenho) imagens.push({ src: raw.desenho, pos: 'abaixo' });
    const base = {
      id: novoId(),
      enunciado,
      disciplina: String(raw.disciplina ?? 'Geral').trim() || 'Geral',
      assunto: String(raw.assunto ?? '').trim(),
      nivel: (NIVEIS.includes(raw.nivel as Nivel) ? raw.nivel : 'Médio') as Nivel,
      imagens,
      linhas: 8,
      criterio: String(raw.obs ?? '').trim(),
      criadaEm: raw.criada ?? agora,
      atualizadaEm: agora,
    };
    if (tipoLeg === 'discursiva') {
      questoes.push({ ...base, tipo: 'disc', alternativas: [], correta: null, linhas: raw.linhas || 8 });
    } else if (tipoLeg === 'vf') {
      const c = raw.correta === 'F' ? 'F' : 'V';
      if (raw.correta !== 'V' && raw.correta !== 'F') avisos.push(`Questão ${i + 1}: V/F sem resposta definida — marcada como V; confira.`);
      questoes.push({ ...base, tipo: 'vf', alternativas: [], correta: c });
    } else {
      const alts = LETRAS.filter(l => String(raw.alternativas?.[l] ?? '').trim())
        .map(l => ({ id: novoId(), letra: l, texto: String(raw.alternativas![l]).trim() }));
      const correta = alts.find(a => a.letra === raw.correta)?.id ?? null;
      if (!correta) avisos.push(`Questão ${i + 1}: alternativa correta não encontrada; defina antes de usar.`);
      questoes.push({ ...base, tipo: 'me', alternativas: alts.map(({ id, texto }) => ({ id, texto })), correta });
    }
  });
  return { questoes, ignoradas, avisos };
}
