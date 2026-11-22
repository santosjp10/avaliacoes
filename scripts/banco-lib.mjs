// Regras do Banco Aberto de Questões — usadas pela automação do GitHub e pelos testes.
// Uma questão publicada é um arquivo public/banco/questoes/<id>.json; o índice reúne todas.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const LICENCA = 'CC BY 4.0';
const LETRAS = ['a', 'b', 'c', 'd', 'e'];
const NIVEIS = ['Fácil', 'Médio', 'Difícil'];

/** Lê o corpo de uma issue criada por formulário: "### Rótulo\n\nvalor". */
export function lerFormulario(corpo) {
  const campos = {};
  const partes = String(corpo ?? '').split(/^### /m).slice(1);
  for (const p of partes) {
    const i = p.indexOf('\n');
    const rotulo = p.slice(0, i).trim();
    let valor = p.slice(i + 1).trim();
    if (valor === '_No response_') valor = '';
    campos[rotulo] = valor;
  }
  return campos;
}

function texto(v, max) {
  return String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
}

/** Valida e normaliza a questão enviada pelo app. Lança erro com mensagem legível. */
export function validarContribuicao(d) {
  if (!d || typeof d !== 'object') throw new Error('Dados da questão ausentes ou inválidos.');
  const tipo = d.tipo;
  if (!['me', 'vf', 'disc'].includes(tipo)) throw new Error('Tipo de questão inválido.');
  const enunciado = texto(d.enunciado, 4000);
  if (enunciado.length < 10) throw new Error('Enunciado vazio ou curto demais.');
  const disciplina = texto(d.disciplina, 80) || 'Geral';
  const q = {
    tipo, enunciado, disciplina,
    assunto: texto(d.assunto, 120),
    nivel: NIVEIS.includes(d.nivel) ? d.nivel : 'Médio',
    linhas: tipo === 'disc' ? Math.max(0, Math.min(30, Number(d.linhas) || 8)) : 0,
    criterio: texto(d.criterio, 3000),
    fonte: texto(d.fonte, 400),
    alternativas: [],
    correta: null,
  };
  if (tipo === 'me') {
    const alts = (Array.isArray(d.alternativas) ? d.alternativas : []).map(a => texto(a, 1000)).filter(Boolean);
    if (alts.length < 2 || alts.length > 5) throw new Error('Múltipla escolha precisa de 2 a 5 alternativas.');
    const c = Number(d.correta);
    if (!Number.isInteger(c) || c < 0 || c >= alts.length) throw new Error('Alternativa correta inválida.');
    q.alternativas = alts.map((t, i) => ({ id: LETRAS[i], texto: t }));
    q.correta = LETRAS[c];
  } else if (tipo === 'vf') {
    if (d.correta !== 'V' && d.correta !== 'F') throw new Error('V/F sem resposta definida.');
    q.correta = d.correta;
  }
  return q;
}

/** Extrai o JSON de um campo de formulário (com ou sem bloco ```json). */
export function extrairJSON(valor) {
  const m = String(valor ?? '').match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((m ? m[1] : valor).trim());
}

/** Links de imagens anexadas no campo de imagens da issue. */
export function extrairImagens(valor) {
  const urls = [];
  const re = /!\[[^\]]*\]\((https:\/\/[^)\s]+)\)|<img[^>]+src="(https:\/\/[^"]+)"/g;
  let m;
  while ((m = re.exec(String(valor ?? '')))) urls.push(m[1] || m[2]);
  return urls.slice(0, 4);
}

export function idDaIssue(numero) {
  return `q${String(numero).padStart(4, '0')}`;
}

/** Monta a questão publicada a partir da issue aprovada. */
export function questaoDaIssue({ corpo, numero, usuario, url, data }) {
  const f = lerFormulario(corpo);
  const autor = texto(f['Autor(a) da questão'], 120);
  if (!autor) throw new Error('Informe o nome do(a) autor(a).');
  const licenca = f['Licença e autoria'] ?? '';
  if (!/\[x\]/i.test(licenca)) throw new Error('A declaração de autoria e licença não foi marcada.');
  const q = validarContribuicao(extrairJSON(f['Dados da questão (não edite)']));
  return {
    id: idDaIssue(numero), ...q,
    imagens: [],
    autor,
    instituicao: texto(f['Instituição'], 160),
    licenca: LICENCA,
    contribuidor: usuario ?? '',
    issue: url ?? '',
    publicadaEm: (data ?? new Date().toISOString()).slice(0, 10),
    _imagensAnexas: extrairImagens(f['Imagens (opcional)']),
  };
}

/** Lê todas as questões e grava o índice único consumido pelo app. */
export function gerarIndice(dirBanco) {
  const dir = join(dirBanco, 'questoes');
  const arquivos = existsSync(dir) ? readdirSync(dir).filter(a => a.endsWith('.json')).sort() : [];
  const questoes = arquivos.map(a => {
    const q = JSON.parse(readFileSync(join(dir, a), 'utf8'));
    validarContribuicao({ ...q, alternativas: q.alternativas?.map(x => x.texto), correta: q.tipo === 'me' ? LETRAS.indexOf(q.correta) : q.correta });
    if (!q.id || !q.autor || !q.licenca) throw new Error(`${a}: faltam id, autor ou licença.`);
    return q;
  });
  const indice = { versao: 1, atualizadoEm: new Date().toISOString(), total: questoes.length, questoes };
  writeFileSync(join(dirBanco, 'indice.json'), JSON.stringify(indice));
  return indice;
}
