import { db } from './db';
import { cifrarComSenha, decifrarComSenha } from '../core/cripto';

interface Conteudo { versao: 1; geradoEm: number; questoes: unknown[]; avaliacoes: unknown[]; correcoes: unknown[]; config: unknown[] }
interface Arquivo { formato: 'AVB1'; protegido: boolean; geradoEm: number; sal?: string; dados: string | Conteudo }

export async function gerarBackup(senha?: string): Promise<Blob> {
  const conteudo: Conteudo = {
    versao: 1, geradoEm: Date.now(),
    questoes: await db.questoes.toArray(),
    avaliacoes: await db.avaliacoes.toArray(),
    correcoes: await db.correcoes.toArray(),
    config: await db.config.toArray(),
  };
  let arq: Arquivo;
  if (senha) {
    const { sal, dados } = await cifrarComSenha(senha, JSON.stringify(conteudo));
    arq = { formato: 'AVB1', protegido: true, geradoEm: conteudo.geradoEm, sal, dados };
  } else {
    arq = { formato: 'AVB1', protegido: false, geradoEm: conteudo.geradoEm, dados: conteudo };
  }
  return new Blob([JSON.stringify(arq)], { type: 'application/json' });
}

export function backupProtegido(arq: unknown): boolean {
  return (arq as Arquivo)?.protegido === true;
}

/** Restaura substituindo tudo o que existe neste aparelho. */
export async function restaurarBackup(arq: unknown, senha?: string): Promise<void> {
  const a = arq as Arquivo;
  if (a?.formato !== 'AVB1') throw new Error('Arquivo não é um backup deste aplicativo.');
  let c: Conteudo;
  if (a.protegido) {
    if (!senha) throw new Error('Este backup é protegido por senha.');
    try { c = JSON.parse(await decifrarComSenha(senha, a.sal!, a.dados as string)); }
    catch { throw new Error('Senha incorreta ou arquivo corrompido.'); }
  } else c = a.dados as Conteudo;
  await db.transaction('rw', [db.questoes, db.avaliacoes, db.correcoes, db.config], async () => {
    await Promise.all([db.questoes.clear(), db.avaliacoes.clear(), db.correcoes.clear(), db.config.clear()]);
    await db.questoes.bulkPut(c.questoes as never[]);
    await db.avaliacoes.bulkPut(c.avaliacoes as never[]);
    await db.correcoes.bulkPut(c.correcoes as never[]);
    await db.config.bulkPut(c.config as never[]);
  });
  await db.config.put({ chave: 'ultimoBackup', valor: Date.now() });
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function lerArquivoJSON(f: File): Promise<unknown> {
  return f.text().then(t => JSON.parse(t));
}
