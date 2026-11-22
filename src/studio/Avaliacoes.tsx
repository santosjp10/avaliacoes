import { useLiveQuery } from 'dexie-react-hooks';
import type { Avaliacao } from '../core/types';
import { db } from '../data/db';
import { Vazio, aviso, ir } from '../ui/base';
import { novoId, fmtNum } from '../core/util';
import { valorTotal } from '../core/gabarito';

export function avaliacaoNova(): Avaliacao {
  const agora = Date.now();
  return {
    id: novoId(), titulo: '', codigo: '', disciplina: '', turma: '', data: '', instrucoes: '',
    itens: [], nVersoes: 2, embaralharQuestoes: true, embaralharAlternativas: true,
    status: 'rascunho', criadaEm: agora, atualizadaEm: agora,
  };
}

export async function duplicarComoRascunho(av: Avaliacao): Promise<string> {
  const agora = Date.now();
  const nova: Avaliacao = {
    ...avaliacaoNova(), titulo: av.titulo + ' (cópia)', codigo: av.codigo ? av.codigo + '-2' : '', disciplina: av.disciplina, turma: av.turma,
    instrucoes: av.instrucoes, itens: av.itens.map(i => ({ ...i })), nVersoes: av.nVersoes,
    embaralharQuestoes: av.embaralharQuestoes, embaralharAlternativas: av.embaralharAlternativas, criadaEm: agora, atualizadaEm: agora,
  };
  await db.avaliacoes.put(nova);
  return nova.id;
}

export function Avaliacoes() {
  const dados = useLiveQuery(async () => {
    const avs = await db.avaliacoes.orderBy('atualizadaEm').reverse().toArray();
    const cont = new Map<string, number>();
    await db.correcoes.each(c => cont.set(c.avaliacaoId, (cont.get(c.avaliacaoId) ?? 0) + 1));
    return { avs, cont, nQuestoes: await db.questoes.count() };
  }, []);

  async function nova() {
    const av = avaliacaoNova();
    await db.avaliacoes.put(av);
    ir(`avaliacoes/${av.id}`);
  }

  async function excluir(av: Avaliacao, n: number) {
    const msg = n > 0 ? `Excluir "${av.titulo || 'sem título'}" e as ${n} correção(ões) registradas? Esta ação não pode ser desfeita.` : `Excluir "${av.titulo || 'sem título'}"?`;
    if (!confirm(msg)) return;
    await db.transaction('rw', db.avaliacoes, db.correcoes, async () => {
      await db.correcoes.where('avaliacaoId').equals(av.id).delete();
      await db.avaliacoes.delete(av.id);
    });
    aviso('Avaliação excluída.');
  }

  if (!dados) return null;
  const { avs, cont, nQuestoes } = dados;
  return (
    <>
      <div className="barra-acoes">
        <button className="btn btn-primario" onClick={nova}>+ Nova avaliação</button>
      </div>
      {avs.length === 0 ? (
        <Vazio icone="📝" titulo="Nenhuma avaliação ainda">
          {nQuestoes === 0
            ? <p>Comece cadastrando questões no <a href="#/questoes">Banco de questões</a> (ou importe as do ProvaSystem) e depois monte sua primeira avaliação.</p>
            : <p>Você tem {nQuestoes} questões no banco. Clique em <b>Nova avaliação</b> para montar a primeira prova.</p>}
        </Vazio>
      ) : (
        <div className="grade-cartoes">
          {avs.map(av => {
            const n = cont.get(av.id) ?? 0;
            return (
              <article key={av.id} className="cartao-av">
                <div className="cartao-av-topo">
                  <span className={`status ${av.status}`}>{av.status === 'publicada' ? 'Publicada' : 'Rascunho'}</span>
                  <code>{av.codigo || '—'}</code>
                </div>
                <h3><a href={`#/avaliacoes/${av.id}`}>{av.titulo || 'Sem título'}</a></h3>
                <p className="meta">{[av.disciplina, av.turma, av.data && new Date(av.data + 'T12:00').toLocaleDateString('pt-BR')].filter(Boolean).join(' · ') || '—'}</p>
                <dl className="numeros">
                  <div><dt>Questões</dt><dd>{av.itens.length}</dd></div>
                  <div><dt>Versões</dt><dd>{av.nVersoes}</dd></div>
                  <div><dt>Valor</dt><dd>{fmtNum(valorTotal(av), 2)}</dd></div>
                  <div><dt>Corrigidas</dt><dd>{n}</dd></div>
                </dl>
                <div className="acoes">
                  <a className="btn btn-sm" href={`#/avaliacoes/${av.id}`}>{av.status === 'publicada' ? 'Abrir' : 'Editar'}</a>
                  {av.status === 'publicada' && <a className="btn btn-sm btn-primario" href={`#/avaliacoes/${av.id}/resultados`}>Resultados</a>}
                  <button className="btn btn-sm btn-perigo" onClick={() => excluir(av, n)}>Excluir</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
