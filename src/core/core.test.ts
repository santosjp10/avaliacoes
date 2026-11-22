import { describe, expect, it } from 'vitest';
import type { Avaliacao, Questao } from './types';
import { gerarVersoes, itensDaVersao, validarParaPublicar, alternativasNaVersao } from './gabarito';
import { corrigir } from './correcao';
import { gerarChave, idDaChave, cifrarComSenha, decifrarComSenha } from './cripto';
import { qrFolha, lerQrFolha, montarPacote, abrirPacote, qrPareamento, lerQrPareamento } from './payload';
import { analiseItens, avaliarTodas, descritivas } from './estatistica';
import { importarLegado } from './legado';
import { paraCSV } from './csv';
import { rngSemente } from './util';

const t = 0;
function me(id: string, correta: number, n = 4): Questao {
  const alternativas = Array.from({ length: n }, (_, i) => ({ id: `${id}-a${i}`, texto: `Alt ${i}` }));
  return { id, tipo: 'me', enunciado: id, alternativas, correta: alternativas[correta].id, disciplina: 'X', assunto: '', nivel: 'Médio', imagens: [], linhas: 0, criterio: '', criadaEm: t, atualizadaEm: t };
}
function vf(id: string, c: 'V' | 'F'): Questao { return { ...me(id, 0), tipo: 'vf', alternativas: [], correta: c }; }
function disc(id: string): Questao { return { ...me(id, 0), tipo: 'disc', alternativas: [], correta: null, linhas: 8 }; }

// A prova que quebrava o sistema antigo: ME, V/F, discursiva, ME
const snapshot = [me('q1', 0), vf('q2', 'V'), disc('q3'), me('q4', 1)];

function avaliacao(nVersoes = 3): Avaliacao {
  const versoes = gerarVersoes(snapshot, { nVersoes, embaralharQuestoes: true, embaralharAlternativas: true }, rngSemente(42));
  return {
    id: 'av1', titulo: 'Prova', codigo: 'AGR-01', disciplina: 'X', turma: '', data: '', instrucoes: '',
    itens: snapshot.map(q => ({ questaoId: q.id, peso: 2 })), nVersoes, embaralharQuestoes: true, embaralharAlternativas: true,
    status: 'publicada', snapshot, pesos: [2, 2, 2, 2], versoes, criadaEm: t, atualizadaEm: t,
  };
}

describe('gabarito', () => {
  it('nunca perde a resposta de V/F nem desalinha com discursivas', () => {
    const av = avaliacao(6);
    for (const v of av.versoes!) {
      const itens = itensDaVersao(av, v.nome);
      expect(itens).toHaveLength(4);
      v.ordem.forEach((idx, pos) => {
        const q = snapshot[idx];
        const it = itens[pos];
        expect(it.tipo).toBe(q.tipo);
        if (q.tipo === 'vf') expect(it.correta).toBe('V');
        if (q.tipo === 'disc') expect(it.correta).toBeNull();
        if (q.tipo === 'me') {
          const letra = it.correta!;
          const alt = alternativasNaVersao(q, v)['ABCDE'.indexOf(letra)];
          expect(alt.id).toBe(q.correta); // a letra da versão aponta para a alternativa certa
        }
      });
    }
  });

  it('versão A mantém a ordem original', () => {
    expect(avaliacao().versoes![0].ordem).toEqual([0, 1, 2, 3]);
  });

  it('valida questões incompletas antes de publicar', () => {
    const sem = { ...me('x', 0), correta: null };
    const av = { ...avaliacao(), itens: [{ questaoId: 'x', peso: 1 }] };
    expect(validarParaPublicar(av, new Map([['x', sem]]))).toContain('Questão 1: alternativa correta não definida.');
  });
});

describe('correção', () => {
  it('soma objetiva e discursiva; discursiva pendente não conta como erro objetivo', () => {
    const av = avaliacao();
    const itens = itensDaVersao(av, 'A');
    const respostas = itens.map(i => i.correta);
    const pend = corrigir(itens, respostas, []);
    expect(pend.objetiva).toBe(6);
    expect(pend.acertos).toBe(3);
    expect(pend.nObjetivas).toBe(3);
    expect(pend.discPendentes).toBe(1);
    const ok = corrigir(itens, respostas, [null, null, 1.5, null]);
    expect(ok.total).toBe(7.5);
    expect(ok.max).toBe(8);
    expect(ok.percentual).toBe(93.8);
  });

  it('branco e dupla marcação valem zero; nota discursiva é limitada ao peso', () => {
    const itens = itensDaVersao(avaliacao(), 'A');
    const r = corrigir(itens, [null, '*', null, 'B'], [null, null, 99, null]);
    expect(r.objetiva).toBe(2);
    expect(r.discursiva).toBe(2);
  });
});

describe('criptografia e QR', () => {
  it('QR da folha: ida e volta, e recusa chave errada', async () => {
    const chave = gerarChave();
    const id = await idDaChave(chave);
    const av = avaliacao();
    const itens = itensDaVersao(av, 'B');
    const qr = await qrFolha(chave, id, { avaliacaoId: av.id, titulo: av.titulo, codigo: av.codigo, versao: 'B', itens });
    expect(qr).not.toContain('"g"'); // gabarito não aparece em claro
    const lido = await lerQrFolha(qr, chave, id);
    expect(lido.ok && lido.dados.itens).toEqual(itens);
    const outra = gerarChave();
    expect((await lerQrFolha(qr, outra, await idDaChave(outra))).ok).toBe(false);
  });

  it('QR de 60 questões cabe folgado num QR Code', async () => {
    const chave = gerarChave();
    const itens = Array.from({ length: 60 }, (_, i) => ({ tipo: 'me' as const, nAlt: 5, correta: 'ABCDE'[i % 5], peso: 0.5 }));
    const qr = await qrFolha(chave, await idDaChave(chave), { avaliacaoId: crypto.randomUUID(), titulo: 'x'.repeat(80), codigo: 'COD-2026-01', versao: 'A', itens });
    expect(qr.length).toBeLessThan(900);
  });

  it('pareamento e pacote de resultados', async () => {
    const chave = gerarChave();
    const id = await idDaChave(chave);
    expect(lerQrPareamento(qrPareamento({ idChave: id, chave, professor: 'Prof. João' }))).toEqual({ idChave: id, chave, professor: 'Prof. João' });
    const c = { id: 'c1', avaliacaoId: 'av1', codigo: 'AGR-01', versao: 'A', aluno: 'Ana', matricula: '1', respostas: ['A'], notasDisc: [], origem: 'corretor' as const, criadaEm: 1, atualizadaEm: 1 };
    const pac = await montarPacote(chave, id, 'celular', [c]);
    expect(JSON.stringify(pac)).not.toContain('Ana');
    expect(await abrirPacote(pac, chave, id)).toEqual([c]);
  });

  it('backup com senha', async () => {
    const b = await cifrarComSenha('segredo', 'dados');
    expect(await decifrarComSenha('segredo', b.sal, b.dados)).toBe('dados');
    await expect(decifrarComSenha('errada', b.sal, b.dados)).rejects.toBeTruthy();
  });
});

describe('estatística', () => {
  it('agrega por questão original, não por posição', () => {
    const av = avaliacao(2);
    // 4 alunos de cada versão: acertam só a q1 (snapshot idx 0)
    const correcoes = av.versoes!.flatMap(v => [0, 1, 2, 3].map(k => {
      const itens = itensDaVersao(av, v.nome);
      const respostas = v.ordem.map((idx, pos) => (idx === 0 || (k > 1 && idx === 3)) ? itens[pos].correta : null);
      return { id: `${v.nome}${k}`, avaliacaoId: av.id, codigo: av.codigo, versao: v.nome, aluno: '', matricula: '', respostas, notasDisc: [], origem: 'estudio' as const, criadaEm: 0, atualizadaEm: 0 };
    }));
    const a = analiseItens(av, avaliarTodas(av, correcoes));
    expect(a[0].facilidade).toBe(1);
    expect(a[1].facilidade).toBe(0);
    expect(a[3].facilidade).toBe(0.5);
    expect(a[0].escolhas[snapshot[0].correta!]).toBe(8);
  });

  it('descritivas', () => {
    expect(descritivas([2, 4, 4, 4, 5, 5, 7, 9])).toMatchObject({ media: 5, mediana: 4.5, desvio: 2 });
  });
});

describe('importação do sistema antigo', () => {
  it('converte ME, V/F e discursiva', () => {
    const r = importarLegado([
      { tipo: 'multipla', disciplina: 'SR', enunciado: 'NDVI?', alternativas: { A: 'x', B: 'y', C: '', D: 'z', E: '' }, correta: 'D', nivel: 'Fácil' },
      { tipo: 'vf', enunciado: 'Landsat 9 tem banda termal', correta: 'V', alternativas: { V: 'Verdadeiro', F: 'Falso' } },
      { tipo: 'discursiva', enunciado: 'Explique', linhas: 5, obs: 'critério' },
      { enunciado: '' },
    ]);
    expect(r.ignoradas).toBe(1);
    const [a, b, c] = r.questoes;
    expect(a.alternativas.map(x => x.texto)).toEqual(['x', 'y', 'z']);
    expect(a.alternativas.find(x => x.id === a.correta)?.texto).toBe('z');
    expect(b).toMatchObject({ tipo: 'vf', correta: 'V' });
    expect(c).toMatchObject({ tipo: 'disc', linhas: 5, criterio: 'critério' });
  });
});

it('CSV com ; aspas e BOM', () => {
  expect(paraCSV([['Nome', 'Nota'], ['Silva, "Zé"', 7.5]])).toBe('﻿"Nome";"Nota"\r\n"Silva, ""Zé""";"7,5"');
});
