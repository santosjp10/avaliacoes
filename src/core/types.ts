// Modelo de dados do sistema. Tudo o que é persistido passa por estes tipos.

export type TipoQuestao = 'me' | 'vf' | 'disc';
export type Nivel = 'Fácil' | 'Médio' | 'Difícil';
export type PosImagem = 'acima' | 'abaixo' | 'direita';

export interface Alternativa {
  /** Identificador estável: não muda quando as alternativas são embaralhadas. */
  id: string;
  texto: string;
}

export interface Imagem {
  src: string; // data URL
  pos: PosImagem;
}

export interface Questao {
  id: string;
  tipo: TipoQuestao;
  enunciado: string;
  /** Só para múltipla escolha. */
  alternativas: Alternativa[];
  /** me: id da alternativa correta · vf: 'V' ou 'F' · disc: null */
  correta: string | null;
  disciplina: string;
  assunto: string;
  nivel: Nivel;
  imagens: Imagem[];
  /** Linhas de resposta (discursiva). */
  linhas: number;
  /** Critério / rubrica / observação de correção. */
  criterio: string;
  criadaEm: number;
  atualizadaEm: number;
}

export interface ItemAvaliacao {
  questaoId: string;
  peso: number;
}

export interface Versao {
  nome: string; // 'A', 'B', ...
  /** Ordem das questões: índices em Avaliacao.snapshot. */
  ordem: number[];
  /** Para cada questão de múltipla escolha (id), a ordem dos ids das alternativas. */
  alternativas: Record<string, string[]>;
}

export interface Aluno { nome: string; matricula: string }

export type PoliticaAnulacao = 'todos' | 'excluir';

export interface AjusteGabarito {
  em: number;
  /** Índice da questão em snapshot. */
  idx: number;
  acao: 'anular' | 'reativar' | 'alterar';
  /** Para 'alterar': id da alternativa (me) ou 'V'/'F'. */
  de?: string | null;
  para?: string | null;
}

export interface Avaliacao {
  id: string;
  titulo: string;
  codigo: string;
  disciplina: string;
  turma: string;
  data: string;
  instrucoes: string;
  itens: ItemAvaliacao[];
  nVersoes: number;
  embaralharQuestoes: boolean;
  embaralharAlternativas: boolean;
  status: 'rascunho' | 'publicada';
  /** Cópia congelada das questões no momento da publicação, na ordem de `itens`. */
  snapshot?: Questao[];
  /** Pesos alinhados com snapshot. */
  pesos?: number[];
  versoes?: Versao[];
  publicadaEm?: number;
  /** Lista da turma, para folhas personalizadas (pode ser editada depois de publicar). */
  alunos?: Aluno[];
  /** Questões anuladas depois da aplicação (índices em snapshot). */
  anuladas?: number[];
  /** 'todos': a questão anulada vale ponto para todos · 'excluir': sai da nota. */
  politicaAnulacao?: PoliticaAnulacao;
  /** Gabarito alterado depois da aplicação: índice em snapshot → id da alternativa (me) ou 'V'/'F'. */
  gabaritoAlterado?: Record<number, string>;
  historicoGabarito?: AjusteGabarito[];
  criadaEm: number;
  atualizadaEm: number;
}

/** Resposta marcada: 'A'..'E' (múltipla escolha), 'V'/'F', ou null (em branco). '*' = dupla marcação/anulada. */
export type Resposta = string | null;

export interface Correcao {
  id: string;
  avaliacaoId: string;
  codigo: string;
  versao: string;
  aluno: string;
  matricula: string;
  /** Por posição na versão. */
  respostas: Resposta[];
  /** Por posição; só usado em discursivas. null = ainda não avaliada. */
  notasDisc: (number | null)[];
  origem: 'estudio' | 'corretor';
  dispositivo?: string;
  /** No celular: quando foi incluída num pacote enviado ao Estúdio. */
  enviadaEm?: number;
  criadaEm: number;
  atualizadaEm: number;
}

/** O que é preciso saber de cada posição de uma versão para corrigi-la. */
export interface ItemGabarito {
  tipo: TipoQuestao;
  /** Número de opções marcáveis (me: nº de alternativas; vf: 2; disc: 0). */
  nAlt: number;
  /** Letra correta na versão ('A'..'E'), 'V'/'F', ou null (discursiva). */
  correta: string | null;
  peso: number;
  /** Questão anulada depois da aplicação. */
  anulada?: PoliticaAnulacao;
}
