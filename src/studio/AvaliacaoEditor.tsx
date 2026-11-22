import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Avaliacao, Questao } from '../core/types';
import { db } from '../data/db';
import { aviso, ir, Vazio } from '../ui/base';
import { gerarVersoes, itensDaVersao, validarParaPublicar, valorTotal } from '../core/gabarito';
import { fmtNum, NOMES_VERSAO } from '../core/util';
import { CartaoQuestao, Filtros, filtrarQuestoes, ROTULO_TIPO } from './Banco';
import { QuestaoEditor, questaoNova } from './QuestaoEditor';
import { duplicarComoRascunho } from './Avaliacoes';

export function AvaliacaoEditor({ id }: { id: string }) {
  const av = useLiveQuery(() => db.avaliacoes.get(id), [id]);
  if (av === undefined) return <Vazio icone="🔎" titulo="Avaliação não encontrada"><p><a href="#/">Voltar às avaliações</a></p></Vazio>;
  return av.status === 'publicada' ? <Publicada av={av} /> : <Rascunho inicial={av} />;
}

function Rascunho({ inicial }: { inicial: Avaliacao }) {
  const [av, setAv] = useState(inicial);
  const questoes = useLiveQuery(() => db.questoes.orderBy('atualizadaEm').reverse().toArray(), []);
  const mapa = useMemo(() => new Map((questoes ?? []).map(q => [q.id, q])), [questoes]);
  const [f, setF] = useState({ busca: '', disciplina: inicial.disciplina, tipo: '', nivel: '' });
  const [erros, setErros] = useState<string[]>([]);
  const [nova, setNova] = useState<Questao | null>(null);
  const primeira = useRef(true);

  // salva automaticamente
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    const t = setTimeout(() => db.avaliacoes.put({ ...av, atualizadaEm: Date.now() }), 300);
    return () => clearTimeout(t);
  }, [av]);

  const set = (p: Partial<Avaliacao>) => setAv(x => ({ ...x, ...p }));
  const naProva = new Set(av.itens.map(i => i.questaoId));
  const disciplinas = useMemo(() => [...new Set((questoes ?? []).map(q => q.disciplina))].sort(), [questoes]);
  const disponiveis = filtrarQuestoes((questoes ?? []).filter(q => !naProva.has(q.id)), f);
  const pesoPadrao = av.itens.length ? av.itens[av.itens.length - 1].peso : 1;

  function mover(i: number, d: -1 | 1) {
    const itens = [...av.itens];
    const j = i + d;
    if (j < 0 || j >= itens.length) return;
    [itens[i], itens[j]] = [itens[j], itens[i]];
    set({ itens });
  }

  async function publicar() {
    const e = validarParaPublicar(av, mapa);
    if ((await db.avaliacoes.where('codigo').equals(av.codigo.trim()).filter(x => x.id !== av.id && x.status === 'publicada').count()) > 0)
      e.push(`Já existe uma avaliação publicada com o código ${av.codigo}. Use um código diferente.`);
    setErros(e);
    if (e.length) { aviso('Corrija os itens indicados antes de publicar.', 'erro'); return; }
    if (!confirm('Publicar? As versões serão geradas e a avaliação ficará congelada (para alterar depois, você poderá duplicá-la como novo rascunho).')) return;
    const snapshot = av.itens.map(i => structuredClone(mapa.get(i.questaoId)!));
    const pub: Avaliacao = {
      ...av, titulo: av.titulo.trim(), codigo: av.codigo.trim(), status: 'publicada', snapshot,
      pesos: av.itens.map(i => i.peso), versoes: gerarVersoes(snapshot, av), publicadaEm: Date.now(), atualizadaEm: Date.now(),
    };
    await db.avaliacoes.put(pub);
    aviso('Avaliação publicada! Agora é só imprimir.');
  }

  return (
    <div className="editor-av">
      <section className="painel">
        <h2 className="titulo-painel">Dados da avaliação</h2>
        <label className="rotulo">Título<input className="campo" value={av.titulo} onChange={e => set({ titulo: e.target.value })} placeholder="Ex.: 1ª Avaliação — Sensoriamento Remoto" autoFocus={!av.titulo} /></label>
        <div className="grade-2">
          <label className="rotulo">Código<input className="campo" value={av.codigo} onChange={e => set({ codigo: e.target.value.toUpperCase() })} placeholder="SR-2026-1" /></label>
          <label className="rotulo">Disciplina
            <input className="campo" list="disc-av" value={av.disciplina} onChange={e => set({ disciplina: e.target.value })} />
            <datalist id="disc-av">{disciplinas.map(d => <option key={d} value={d} />)}</datalist>
          </label>
          <label className="rotulo">Turma<input className="campo" value={av.turma} onChange={e => set({ turma: e.target.value })} placeholder="Agronomia 2026.1" /></label>
          <label className="rotulo">Data<input className="campo" type="date" value={av.data} onChange={e => set({ data: e.target.value })} /></label>
        </div>
        <label className="rotulo">Instruções aos alunos
          <textarea className="campo" rows={2} value={av.instrucoes} onChange={e => set({ instrucoes: e.target.value })} placeholder="Ex.: Use caneta azul ou preta. Não é permitido o uso de calculadora." />
        </label>
        <div className="grade-3">
          <label className="rotulo">Versões
            <select className="campo" value={av.nVersoes} onChange={e => set({ nVersoes: Number(e.target.value) })}>
              {NOMES_VERSAO.map((_, i) => <option key={i} value={i + 1}>{i + 1} ({NOMES_VERSAO.slice(0, i + 1).join(', ')})</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={av.embaralharQuestoes} onChange={e => set({ embaralharQuestoes: e.target.checked })} /> Embaralhar questões</label>
          <label className="check"><input type="checkbox" checked={av.embaralharAlternativas} onChange={e => set({ embaralharAlternativas: e.target.checked })} /> Embaralhar alternativas</label>
        </div>

        <h2 className="titulo-painel">Questões da prova <span className="contador">{av.itens.length} questões · {fmtNum(valorTotal(av), 2)} pontos</span></h2>
        {av.itens.length === 0 ? <p className="dica">Adicione questões do banco ao lado →</p> : (
          <ol className="itens-prova">
            {av.itens.map((it, i) => {
              const q = mapa.get(it.questaoId);
              return (
                <li key={it.questaoId}>
                  <span className="num">{i + 1}</span>
                  {q ? <span className={`tag tag-${q.tipo}`}>{ROTULO_TIPO[q.tipo]}</span> : <span className="tag">?</span>}
                  <span className="txt" title={q?.enunciado}>{q ? q.enunciado : 'Questão removida do banco'}</span>
                  <label className="peso">pts<input className="campo campo-sm" type="number" min={0.1} step={0.1} value={it.peso}
                    onChange={e => set({ itens: av.itens.map((x, j) => j === i ? { ...x, peso: Number(e.target.value) } : x) })} /></label>
                  <button className="btn-icone" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
                  <button className="btn-icone" aria-label="Descer" disabled={i === av.itens.length - 1} onClick={() => mover(i, 1)}>↓</button>
                  <button className="btn-icone" aria-label="Remover" onClick={() => set({ itens: av.itens.filter((_, j) => j !== i) })}>✕</button>
                </li>
              );
            })}
          </ol>
        )}
        {av.itens.length > 1 && (
          <button className="btn btn-sm" onClick={() => {
            const v = prompt('Valor de cada questão:', String(pesoPadrao));
            if (v && Number(v) > 0) set({ itens: av.itens.map(i => ({ ...i, peso: Number(v.replace(',', '.')) })) });
          }}>Mesmo valor para todas</button>
        )}

        {erros.length > 0 && <ul className="erros">{erros.map(e => <li key={e}>{e}</li>)}</ul>}
        <div className="barra-final">
          <span className="dica">Salvo automaticamente</span>
          <button className="btn btn-primario btn-lg" onClick={publicar} disabled={av.itens.length === 0}>Publicar e gerar versões</button>
        </div>
      </section>

      <section className="painel painel-banco">
        <h2 className="titulo-painel">Banco de questões <button className="btn btn-sm" onClick={() => setNova(questaoNova(av.disciplina))}>+ Criar questão</button></h2>
        <Filtros f={f} setF={setF} disciplinas={disciplinas} />
        <div className="lista-questoes rolavel">
          {disponiveis.length === 0 && <p className="dica">{questoes?.length ? 'Nenhuma questão com esses filtros.' : 'O banco está vazio.'}</p>}
          {disponiveis.map(q => (
            <CartaoQuestao key={q.id} q={q} compacto acoes={
              <button className="btn btn-sm btn-primario" onClick={() => set({ itens: [...av.itens, { questaoId: q.id, peso: pesoPadrao }] })}>+ Adicionar</button>
            } />
          ))}
        </div>
      </section>
      {nova && <QuestaoEditor inicial={nova} disciplinas={disciplinas} aoFechar={s => { setNova(null); if (s) set({ itens: [...av.itens, { questaoId: s.id, peso: pesoPadrao }] }); }} />}
    </div>
  );
}

function Publicada({ av }: { av: Avaliacao }) {
  const n = useLiveQuery(() => db.correcoes.where('avaliacaoId').equals(av.id).count(), [av.id]) ?? 0;
  const [copias, setCopias] = useState(20);
  const nDisc = av.snapshot!.filter(q => q.tipo === 'disc').length;

  async function despublicar() {
    if (n > 0) { aviso('Já existem correções para esta avaliação. Duplique-a como novo rascunho para alterar.', 'erro'); return; }
    if (!confirm('Voltar a avaliação para rascunho? Folhas já impressas deixarão de ser válidas.')) return;
    await db.avaliacoes.put({ ...av, status: 'rascunho', snapshot: undefined, pesos: undefined, versoes: undefined, publicadaEm: undefined, atualizadaEm: Date.now() });
  }

  const abrir = (q: string) => window.open(`#/imprimir/${av.id}?${q}`, '_blank');

  return (
    <div className="publicada">
      <section className="painel faixa-av">
        <div>
          <span className="status publicada">Publicada</span>
          <h2>{av.titulo}</h2>
          <p className="meta"><code>{av.codigo}</code> · {av.snapshot!.length} questões{nDisc ? ` (${nDisc} discursiva${nDisc > 1 ? 's' : ''})` : ''} · {fmtNum(valorTotal(av), 2)} pontos · {av.nVersoes} versão(ões){av.turma ? ` · ${av.turma}` : ''}</p>
        </div>
        <div className="acoes">
          <a className="btn btn-primario" href={`#/avaliacoes/${av.id}/resultados`}>Resultados ({n})</a>
          <button className="btn" onClick={async () => ir(`avaliacoes/${await duplicarComoRascunho(av)}`)}>Duplicar como rascunho</button>
          <button className="btn btn-perigo" onClick={despublicar}>Voltar para rascunho</button>
        </div>
      </section>

      <section className="painel">
        <h2 className="titulo-painel">Imprimir para a turma</h2>
        <p className="dica">Gera, em um só documento, a prova e a folha de respostas de cada aluno, alternando as versões (A, B, C, A, B…) para entregar na ordem da fila.</p>
        <div className="linha-imprimir">
          <label className="rotulo">Alunos<input className="campo campo-sm" type="number" min={1} max={200} value={copias} onChange={e => setCopias(Math.max(1, Number(e.target.value)))} /></label>
          <button className="btn btn-primario" onClick={() => abrir(`tipo=lote&copias=${copias}`)}>🖨 Prova + folha para {copias} alunos</button>
          <button className="btn" onClick={() => abrir('tipo=gabarito')}>🗝 Gabarito do professor</button>
        </div>
      </section>

      <section className="grade-cartoes">
        {av.versoes!.map(v => {
          const itens = itensDaVersao(av, v.nome);
          return (
            <article key={v.nome} className="cartao-versao">
              <div className="versao-selo">{v.nome}</div>
              <div className="gab-mini" aria-label={`Gabarito da versão ${v.nome}`}>
                {itens.map((it, i) => <span key={i} title={`Questão ${i + 1}`}><small>{i + 1}</small>{it.tipo === 'disc' ? '✎' : it.correta}</span>)}
              </div>
              <div className="acoes">
                <button className="btn btn-sm" onClick={() => abrir(`tipo=prova&versao=${v.nome}`)}>Prova</button>
                <button className="btn btn-sm" onClick={() => abrir(`tipo=folha&versao=${v.nome}`)}>Folha de respostas</button>
                <button className="btn btn-sm" onClick={() => abrir(`tipo=completo&versao=${v.nome}`)}>Prova + folha</button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
