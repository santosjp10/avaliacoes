import type { Aluno } from './types';

/**
 * Lê uma lista colada de planilha ou texto: uma pessoa por linha.
 * Aceita "Nome;Matrícula", "Matrícula;Nome", separados por tab, ponto e vírgula ou vírgula, ou só o nome.
 */
export function lerListaAlunos(texto: string): Aluno[] {
  const vistos = new Set<string>();
  const out: Aluno[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    const partes = linha.split(/\t|;|,(?=\s*\d)|\s{2,}/).map(p => p.trim()).filter(Boolean);
    let nome = '', matricula = '';
    if (partes.length === 1) {
      const m = linha.match(/^(\d[\d.\-/]*)\s+(.+)$/) ?? linha.match(/^(.+?)\s+(\d[\d.\-/]*)$/);
      if (m) { const numPrimeiro = /^\d/.test(m[1]); nome = numPrimeiro ? m[2] : m[1]; matricula = numPrimeiro ? m[1] : m[2]; }
      else nome = linha;
    } else {
      const iNum = partes.findIndex(p => /^\d[\d.\-/]*$/.test(p));
      matricula = iNum >= 0 ? partes[iNum] : '';
      nome = partes.filter((_, i) => i !== iNum).join(' ');
    }
    nome = nome.replace(/\s+/g, ' ').trim();
    if (!nome || (/^(nome|aluno|estudante)\b/i.test(nome) && !matricula)) continue; // cabeçalho
    const chave = (matricula || nome).toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ nome, matricula });
  }
  return out;
}

export function ordenarAlunos(lista: Aluno[]): Aluno[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
