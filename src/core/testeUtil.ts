import type { Questao } from './types';
export function questaoNovaTeste(): Questao {
  const alternativas = ['Azul e verde', 'Verde e vermelho', 'Vermelho e infravermelho próximo', 'SWIR e termal'].map((t, i) => ({ id: 'x' + i, texto: t }));
  return { id: 'loc1', tipo: 'me', enunciado: 'O NDVI é calculado a partir de quais bandas espectrais?', alternativas, correta: 'x2', disciplina: 'Sensoriamento Remoto', assunto: 'Índices', nivel: 'Fácil', imagens: [], linhas: 0, criterio: 'NDVI usa vermelho e NIR.', criadaEm: 0, atualizadaEm: 0 };
}
