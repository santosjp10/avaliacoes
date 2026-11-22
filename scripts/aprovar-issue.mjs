// Executado pela automação do GitHub quando uma issue de contribuição recebe o rótulo "aprovada".
// Lê o formulário, valida, baixa as imagens anexadas, grava a questão e atualiza o índice.
// Variáveis: ISSUE_BODY, ISSUE_NUMBER, ISSUE_USER, ISSUE_URL. Saída: id da questão (ou erro).
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { questaoDaIssue, gerarIndice } from './banco-lib.mjs';

const dirBanco = new URL('../public/banco', import.meta.url).pathname;
const saida = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}<<FIM\n${v}\nFIM\n`);

try {
  const q = questaoDaIssue({ corpo: process.env.ISSUE_BODY, numero: process.env.ISSUE_NUMBER, usuario: process.env.ISSUE_USER, url: process.env.ISSUE_URL });
  const anexos = q._imagensAnexas; delete q._imagensAnexas;
  mkdirSync(join(dirBanco, 'img'), { recursive: true });
  for (let i = 0; i < anexos.length; i++) {
    const r = await fetch(anexos[i]);
    if (!r.ok) throw new Error(`Não consegui baixar a imagem ${i + 1}.`);
    const tipo = r.headers.get('content-type') ?? '';
    const ext = tipo.includes('png') ? 'png' : tipo.includes('webp') ? 'webp' : tipo.includes('gif') ? 'gif' : 'jpg';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 2_000_000) throw new Error(`Imagem ${i + 1} maior que 2 MB.`);
    const nome = `${q.id}-${i + 1}.${ext}`;
    writeFileSync(join(dirBanco, 'img', nome), buf);
    q.imagens.push({ src: `img/${nome}`, pos: 'abaixo' });
  }
  mkdirSync(join(dirBanco, 'questoes'), { recursive: true });
  writeFileSync(join(dirBanco, 'questoes', `${q.id}.json`), JSON.stringify(q, null, 2) + '\n');
  const ind = gerarIndice(dirBanco);
  console.log(`Questão ${q.id} publicada. Banco com ${ind.total} questões.`);
  saida('id', q.id); saida('erro', '');
} catch (e) {
  console.error(e.message);
  saida('id', ''); saida('erro', e.message);
  process.exitCode = 1;
}
