import Dexie, { type Table } from 'dexie';
import type { Avaliacao, Correcao, Questao } from '../core/types';
import { gerarChave, idDaChave } from '../core/cripto';
import type { Pareamento } from '../core/payload';

export interface Config { chave: string; valor: unknown }

class BancoLocal extends Dexie {
  questoes!: Table<Questao, string>;
  avaliacoes!: Table<Avaliacao, string>;
  correcoes!: Table<Correcao, string>;
  config!: Table<Config, string>;
  constructor() {
    super('avaliacoes');
    this.version(1).stores({
      questoes: 'id, disciplina, tipo, nivel, atualizadaEm',
      avaliacoes: 'id, codigo, status, atualizadaEm',
      correcoes: 'id, avaliacaoId, [avaliacaoId+versao], criadaEm, enviadaEm',
      config: 'chave',
    });
  }
}

export const db = new BancoLocal();

export async function lerConfig<T>(chave: string): Promise<T | undefined> {
  return (await db.config.get(chave))?.valor as T | undefined;
}

export async function gravarConfig(chave: string, valor: unknown): Promise<void> {
  await db.config.put({ chave, valor });
}

/** Chave do professor neste PC. Criada na primeira vez. */
export async function chaveDoEstudio(): Promise<Pareamento> {
  const atual = await lerConfig<Pareamento>('chaveEstudio');
  if (atual) return atual;
  const chave = gerarChave();
  const p: Pareamento = { chave, idChave: await idDaChave(chave), professor: '' };
  await gravarConfig('chaveEstudio', p);
  return p;
}

/** Chave usada pelo Corretor: a do pareamento ou, no mesmo aparelho do Estúdio, a do próprio Estúdio. */
export async function chaveDoCorretor(): Promise<(Pareamento & { local: boolean }) | null> {
  const par = await lerConfig<Pareamento>('pareamento');
  if (par) return { ...par, local: false };
  const est = await lerConfig<Pareamento>('chaveEstudio');
  return est ? { ...est, local: true } : null;
}

/** Nome curto deste aparelho, para identificar a origem das correções. */
export async function nomeDispositivo(): Promise<string> {
  let n = await lerConfig<string>('dispositivo');
  if (!n) {
    const ua = navigator.userAgent;
    const tipo = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : 'Navegador';
    n = `${tipo}-${Math.random().toString(36).slice(2, 6)}`;
    await gravarConfig('dispositivo', n);
  }
  return n;
}

/** Inclui ou atualiza correções vindas de outro aparelho. Importar duas vezes não duplica. */
export async function mesclarCorrecoes(lista: Correcao[]): Promise<{ novas: number; atualizadas: number; ignoradas: number }> {
  let novas = 0, atualizadas = 0, ignoradas = 0;
  await db.transaction('rw', db.correcoes, async () => {
    for (const c of lista) {
      const atual = await db.correcoes.get(c.id);
      if (!atual) { await db.correcoes.put({ ...c, enviadaEm: undefined }); novas++; }
      else if (c.atualizadaEm > atual.atualizadaEm) { await db.correcoes.put({ ...c, enviadaEm: undefined }); atualizadas++; }
      else ignoradas++;
    }
  });
  return { novas, atualizadas, ignoradas };
}
