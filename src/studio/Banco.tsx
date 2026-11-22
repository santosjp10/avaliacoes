import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Questao } from '../core/types';
import { db } from '../data/db';
import { Vazio, aviso, escolherArquivo } from '../ui/base';
import { QuestaoEditor, questaoNova } from './QuestaoEditor';
import { Contribuir } from './Contribuir';
import { importarLegado } from '../core/legado';
import { LETRAS, novoId } from '../core/util';

export const ROTULO_TIPO = { me: 'ME', vf: 'V/F', disc: 'DISC' } as const;

export function filtrarQuestoes(qs: Questao[], f: { busca: string; disciplina: string; tipo: string; nivel: string }) {
  const b = f.busca.trim().toLowerCase();
  return qs.filter(q =>
    (!f.disciplina || q.disciplina === f.disciplina) && (!f.tipo || q.tipo === f.tipo) && (!f.nivel || q.nivel === f.nivel) &&
    (!b || q.enunciado.toLowerCase().includes(b) || q.assunto.toLowerCase().includes(b) || q.disciplina.toLowerCase().includes(b)));
}

export function Filtros({ f, setF, disciplinas }: { f: { busca: string; disciplina: string; tipo: string; nivel: string }; setF: (f: { busca: string; disciplina: string; tipo: string; nivel: string }) => void; disciplinas: string[] }) {
  return (
    <div className="filtros">
      <input className="campo" type="search" placeholder="Buscar no enunciado, assunto…" value={f.busca} onChange={e => setF({ ...f, busca: e.target.value })} />
      <select className="campo" value={f.disciplina} onChange={e => setF({ ...f, disciplina: e.target.value })} aria-label="Disciplina">
        <option value="">Todas as disciplinas</option>{disciplinas.map(d => <option key={d}>{d}</option>)}
      </select>
      <select className="campo" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} aria-label="Tipo">
        <option value="">Todos os tipos</option><option value="me">Múltipla escolha</option><option value="vf">V/F</option><option value="disc">Discursiva</option>
      </select>
      <select className="campo" value={f.nivel} onChange={e => setF({ ...f, nivel: e.target.value })} aria-label="Nível">
        <option value="">Todos os níveis</option><option>Fácil</option><option>Médio</option><option>Difícil</option>
      </select>
    </div>
  );
}

export function Banco() {
  const questoes = useLiveQuery(() => db.questoes.orderBy('atualizadaEm').reverse().toArray(), []);
  const [f, setF] = useState({ busca: '', disciplina: '', tipo: '', nivel: '' });
  const [editando, setEditando] = useState<Questao | null>(null);
  const [contribuindo, setContribuindo] = useState<Questao | null>(null);
  const disciplinas = useMemo(() => [...new Set((questoes ?? []).map(q => q.disciplina))].sort(), [questoes]);
  const lista = useMemo(() => filtrarQuestoes(questoes ?? [], f), [questoes, f]);

  async function importar() {
    const arq = await escolherArquivo('.json,application/json');
    if (!arq) return;
    try {
      const r = importarLegado(JSON.parse(await arq.text()));
      await db.questoes.bulkPut(r.questoes);
      aviso(`${r.questoes.length} questão(ões) importada(s)${r.avisos.length ? ` — ${r.avisos.length} precisam de revisão` : ''}.`, r.avisos.length ? 'info' : 'ok');
      if (r.avisos.length) console.warn(r.avisos);
    } catch (e) { aviso((e as Error).message, 'erro'); }
  }

  async function excluir(q: Questao) {
    if (!confirm('Excluir esta questão do banco? Avaliações já publicadas não são afetadas.')) return;
    await db.questoes.delete(q.id);
    aviso('Questão excluída.');
  }

  async function duplicar(q: Questao) {
    const ids = new Map(q.alternativas.map(a => [a.id, novoId()]));
    const c: Questao = { ...q, id: novoId(), alternativas: q.alternativas.map(a => ({ ...a, id: ids.get(a.id)! })), correta: q.tipo === 'me' ? ids.get(q.correta!) ?? null : q.correta, criadaEm: Date.now(), atualizadaEm: Date.now() };
    await db.questoes.put(c);
    setEditando(c);
  }

  if (!questoes) return null;
  return (
    <>
      <div className="barra-acoes">
        <button className="btn btn-primario" onClick={() => setEditando(questaoNova(f.disciplina))}>+ Nova questão</button>
        <button className="btn" onClick={importar} title="Arquivo banco_questoes.json exportado pelo ProvaSystem">Importar do ProvaSystem</button>
        <a className="btn" href="#/compartilhado">🌐 Banco compartilhado</a>
        <span className="contador">{lista.length} de {questoes.length} questões</span>
      </div>
      <Filtros f={f} setF={setF} disciplinas={disciplinas} />
      {questoes.length === 0 ? (
        <Vazio icone="📚" titulo="Seu banco de questões está vazio">
          <p>Crie a primeira questão ou importe o arquivo <code>banco_questoes.json</code> exportado pelo ProvaSystem antigo (menu Exportar → Exportar JSON).</p>
        </Vazio>
      ) : (
        <div className="lista-questoes">
          {lista.map(q => <CartaoQuestao key={q.id} q={q} acoes={<>
            <button className="btn btn-sm" onClick={() => setEditando(q)}>Editar</button>
            <button className="btn btn-sm" onClick={() => duplicar(q)}>Duplicar</button>
            {!q.origem && <button className="btn btn-sm" onClick={() => setContribuindo(q)} title="Enviar ao Banco Aberto de Questões">🌐 Contribuir</button>}
            <button className="btn btn-sm btn-perigo" onClick={() => excluir(q)}>Excluir</button>
          </>} />)}
        </div>
      )}
      {contribuindo && <Contribuir q={contribuindo} aoFechar={() => setContribuindo(null)} />}
      {editando && <QuestaoEditor inicial={editando} disciplinas={disciplinas} aoFechar={() => setEditando(null)} />}
    </>
  );
}

export function CartaoQuestao({ q, acoes, compacto }: { q: Questao; acoes?: React.ReactNode; compacto?: boolean }) {
  return (
    <article className={`cartao-q ${compacto ? 'compacto' : ''}`}>
      <div className="etiquetas">
        <span className={`tag tag-${q.tipo}`}>{ROTULO_TIPO[q.tipo]}</span>
        <span className={`tag nivel-${q.nivel === 'Fácil' ? 'f' : q.nivel === 'Médio' ? 'm' : 'd'}`}>{q.nivel}</span>
        <span className="tag">{q.disciplina}</span>
        {q.assunto && <span className="tag-texto">{q.assunto}</span>}
        {q.imagens.length > 0 && <span className="tag-texto">🖼 {q.imagens.length}</span>}
        {q.origem && <span className="tag tag-aberto" title={`Banco Aberto · ${q.origem.licenca}`}>🌐 {q.origem.autor}</span>}
      </div>
      <p className="enunciado">{compacto && q.enunciado.length > 160 ? q.enunciado.slice(0, 160) + '…' : q.enunciado}</p>
      {!compacto && q.tipo === 'me' && (
        <ol className="alts-resumo">
          {q.alternativas.map((a, i) => <li key={a.id} className={a.id === q.correta ? 'correta' : ''}><b>{LETRAS[i]}</b> {a.texto}</li>)}
        </ol>
      )}
      {!compacto && q.tipo === 'vf' && <p className="resp-vf">Resposta: <b>{q.correta === 'V' ? 'Verdadeira' : 'Falsa'}</b></p>}
      {acoes && <div className="acoes">{acoes}</div>}
    </article>
  );
}
