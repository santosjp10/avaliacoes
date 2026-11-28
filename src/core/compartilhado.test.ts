import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paraLocal, urlContribuicao, atribuicao, type QuestaoCompartilhada } from './compartilhado';
// @ts-expect-error módulo JS dos scripts do GitHub
import { questaoDaIssue, gerarIndice, lerFormulario } from '../../scripts/banco-lib.mjs';
import { questaoNovaTeste } from './testeUtil';

const REPO = 'fulano/avaliacoes';

/** Simula o corpo de issue que o GitHub cria a partir do formulário preenchido pelo app. */
function corpoIssue(url: string, marcarLicenca = true) {
  const p = new URL(url).searchParams;
  return [
    `### Autor(a) da questão\n\n${p.get('autor')}`,
    `### Instituição\n\n${p.get('instituicao') || '_No response_'}`,
    `### Questão (para leitura)\n\n${p.get('leitura') ?? '_No response_'}`,
    `### Dados da questão (não edite)\n\n${p.get('dados')}`,
    `### Imagens (opcional)\n\n${p.get('imagens') ?? '_No response_'}`,
    `### Licença e autoria\n\n- [${marcarLicenca ? 'X' : ' '}] Declaro que sou autor(a) ou que a questão foi adaptada com a fonte citada, e concordo em publicá-la sob a licença CC BY 4.0.`,
  ].join('\n\n');
}

describe('banco aberto', () => {
  it('contribuição do app → issue → questão publicada → importação local', () => {
    const local = questaoNovaTeste();
    const { url } = urlContribuicao(REPO, local, { autor: 'Profa. Maria', instituicao: 'UFX', fonte: '' });
    expect(url.length).toBeLessThan(7500);
    const pub = questaoDaIssue({ corpo: corpoIssue(url), numero: 12, usuario: 'maria', url: 'https://github.com/x/1', data: '2026-11-22T10:00:00Z' });
    expect(pub).toMatchObject({ id: 'q0012', autor: 'Profa. Maria', instituicao: 'UFX', licenca: 'CC BY 4.0', tipo: 'me', correta: 'c' });
    expect(pub.alternativas.map((a: { texto: string }) => a.texto)).toEqual(local.alternativas.map(a => a.texto));
    const volta = paraLocal(pub as QuestaoCompartilhada);
    expect(volta.alternativas.find(a => a.id === volta.correta)?.texto).toBe('Vermelho e infravermelho próximo');
    expect(volta.origem?.autor).toBe('Profa. Maria');
    expect(atribuicao([volta])).toContain('Profa. Maria (UFX)');
  });

  it('recusa sem declaração de licença', () => {
    const { url } = urlContribuicao(REPO, questaoNovaTeste(), { autor: 'A', instituicao: '', fonte: '' });
    expect(() => questaoDaIssue({ corpo: corpoIssue(url, false), numero: 1 })).toThrow(/licença/);
  });

  it('recusa dados adulterados', () => {
    const { url } = urlContribuicao(REPO, questaoNovaTeste(), { autor: 'A', instituicao: '', fonte: '' });
    const corpo = corpoIssue(url).replace(/"correta":2/, '"correta":9');
    expect(() => questaoDaIssue({ corpo, numero: 1 })).toThrow(/correta/);
  });

  it('lê o formulário mesmo com campos vazios', () => {
    expect(lerFormulario('### A\n\n_No response_\n\n### B\n\nx')).toEqual({ A: '', B: 'x' });
  });

  it('as questões semente formam um índice válido', () => {
    const dir = mkdtempSync(join(tmpdir(), 'banco-'));
    mkdirSync(join(dir, 'questoes'));
    const orig = JSON.parse(readFileSync(new URL('../../public/banco/indice.json', import.meta.url), 'utf8'));
    for (const q of orig.questoes) writeFileSync(join(dir, 'questoes', q.id + '.json'), JSON.stringify(q));
    const ind = gerarIndice(dir);
    expect(ind.total).toBe(orig.questoes.length);
    expect(ind.total).toBeGreaterThanOrEqual(30);
    for (const q of ind.questoes) if (q.tipo === 'me') expect(q.alternativas.some((a: { id: string }) => a.id === q.correta)).toBe(true);
  });
});
