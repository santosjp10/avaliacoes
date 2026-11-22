import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AjusteGabarito, Avaliacao, Correcao, PoliticaAnulacao, Resposta } from '../core/types';
import { ordenarAlunos } from '../core/alunos';
import { db, chaveDoEstudio, mesclarCorrecoes } from '../data/db';
import { Modal, Vazio, aviso, escolherArquivo } from '../ui/base';
import { FolhaRespostas } from '../ui/FolhaRespostas';
import { itensDaVersao, valorTotal } from '../core/gabarito';
import { corrigir } from '../core/correcao';
import { analiseItens, avaliarTodas, descritivas, rotuloDiscriminacao, rotuloFacilidade } from '../core/estatistica';
import { abrirPacote } from '../core/payload';
import { paraCSV } from '../core/csv';
import { LETRAS, fmtData, fmtNum, novoId } from '../core/util';
import { baixar } from '../data/backup';
import { ROTULO_TIPO } from './Banco';

export function Resultados({ id }: { id: string }) {
  const av = useLiveQuery(() => db.avaliacoes.get(id), [id]);
  const correcoes = useLiveQuery(() => db.correcoes.where('avaliacaoId').equals(id).toArray(), [id]);
  if (av === undefined || !correcoes) return null;
  if (!av || av.status !== 'publicada') return <Vazio icone="🔎" titulo="Avaliação não publicada"><p><a href="#/">Voltar</a></p></Vazio>;
  return <Painel av={av} correcoes={correcoes} />;
}

function Painel({ av, correcoes }: { av: Avaliacao; correcoes: Correcao[] }) {
  const [editando, setEditando] = useState<Correcao | null>(null);
  const [aba, setAba] = useState<'alunos' | 'itens'>('alunos');
  const [soPendentes, setSoPendentes] = useState(false);
  const avaliadas = useMemo(() => avaliarTodas(av, correcoes).sort((a, b) => a.c.aluno.localeCompare(b.c.aluno, 'pt-BR')), [av, correcoes]);
  const est = descritivas(avaliadas.map(a => a.r.total));
  const pendentes = avaliadas.filter(a => a.r.discPendentes > 0).length;
  const max = valorTotal(av);
  const lista = soPendentes ? avaliadas.filter(a => a.r.discPendentes > 0) : avaliadas;

  async function importarPacote() {
    const f = await escolherArquivo('.json,.txt,application/json,text/plain');
    if (!f) return;
    try {
      const k = await chaveDoEstudio();
      const lista = await abrirPacote(JSON.parse(await f.text()), k.chave, k.idChave);
      const r = await mesclarCorrecoes(lista);
      const desta = lista.filter(c => c.avaliacaoId === av.id || c.codigo === av.codigo).length;
      aviso(`Pacote importado: ${r.novas} nova(s), ${r.atualizadas} atualizada(s)${r.ignoradas ? `, ${r.ignoradas} já existiam` : ''}. ${desta} desta avaliação.${r.semAvaliacao ? ` ${r.semAvaliacao} de provas que não existem neste computador.` : ''}`, r.semAvaliacao ? 'info' : 'ok');
    } catch (e) { aviso((e as Error).message, 'erro'); }
  }

  function exportarCSV() {
    const snap = av.snapshot!;
    const cab = ['Aluno', 'Matrícula', 'Versão', 'Objetiva', 'Discursiva', 'Total', 'Máximo', '%', 'Discursivas pendentes', ...snap.map((_, i) => `Q${i + 1} (orig.)`)];
    const linhas = avaliadas.map(({ c, r }) => {
      const v = av.versoes!.find(x => x.nome === c.versao)!;
      const porQuestao = snap.map((_, idx) => r.itens[v.ordem.indexOf(idx)]?.pontos ?? null);
      return [c.aluno, c.matricula, c.versao, r.objetiva, r.discursiva, r.total, r.max, r.percentual, r.discPendentes, ...porQuestao];
    });
    baixar(new Blob([paraCSV([cab, ...linhas])], { type: 'text/csv;charset=utf-8' }), `${av.codigo}_resultados.csv`);
  }

  async function excluir(c: Correcao) {
    if (!confirm(`Excluir a correção de ${c.aluno || 'aluno sem nome'}?`)) return;
    await db.correcoes.delete(c.id);
  }

  function nova() {
    const v = av.versoes![0];
    setEditando({ id: novoId(), avaliacaoId: av.id, codigo: av.codigo, versao: v.nome, aluno: '', matricula: '', respostas: v.ordem.map(() => null), notasDisc: v.ordem.map(() => null), origem: 'estudio', criadaEm: Date.now(), atualizadaEm: Date.now() });
  }

  return (
    <>
      <section className="painel faixa-av">
        <div>
          <h2>{av.titulo}</h2>
          <p className="meta"><code>{av.codigo}</code> · {fmtNum(max, 2)} pontos · <a href={`#/avaliacoes/${av.id}`}>ver avaliação</a></p>
        </div>
        <div className="acoes">
          <button className="btn btn-primario" onClick={importarPacote}>📥 Importar do celular</button>
          <button className="btn" onClick={nova}>+ Lançar correção</button>
          <button className="btn" onClick={exportarCSV} disabled={!avaliadas.length}>Exportar CSV</button>
        </div>
      </section>

      {avaliadas.length === 0 ? (
        <Vazio icone="📊" titulo="Nenhuma correção ainda">
          <p>Corrija as folhas pelo <b>Corretor</b> no celular e depois use <b>Importar do celular</b> com o arquivo enviado por ele. Você também pode lançar correções aqui mesmo.</p>
        </Vazio>
      ) : (
        <>
          <div className="estatisticas">
            <div><b>{est.n}</b><span>corrigidas</span></div>
            <div><b>{fmtNum(est.media, 2)}</b><span>média ({fmtNum(max ? est.media / max * 100 : 0)}%)</span></div>
            <div><b>{fmtNum(est.mediana, 2)}</b><span>mediana</span></div>
            <div><b>{fmtNum(est.desvio, 2)}</b><span>desvio-padrão</span></div>
            <div><b>{fmtNum(est.min, 2)} – {fmtNum(est.max, 2)}</b><span>menor – maior</span></div>
            <div className={pendentes ? 'alerta' : ''}><b>{pendentes}</b><span>com discursiva pendente</span></div>
          </div>
          <Distribuicao valores={avaliadas.map(a => a.r.percentual)} />
          <AjustesResumo av={av} />
          <Faltam av={av} correcoes={correcoes} />

          <div className="segmentos abas">
            <button className={aba === 'alunos' ? 'ativo' : ''} onClick={() => setAba('alunos')}>Alunos</button>
            <button className={aba === 'itens' ? 'ativo' : ''} onClick={() => setAba('itens')}>Análise das questões</button>
          </div>

          {aba === 'alunos' ? (
            <div className="painel">
              {pendentes > 0 && <label className="check"><input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} /> Mostrar só quem tem discursiva pendente</label>}
              <div className="tabela-rolavel">
                <table className="tabela">
                  <thead><tr><th>Aluno</th><th>Matrícula</th><th>Versão</th><th className="n">Objetiva</th><th className="n">Discursiva</th><th className="n">Total</th><th className="n">%</th><th>Origem</th><th /></tr></thead>
                  <tbody>
                    {lista.map(({ c, r }) => (
                      <tr key={c.id}>
                        <td><button className="link" onClick={() => setEditando(c)}>{c.aluno || <i>sem nome</i>}</button></td>
                        <td>{c.matricula || '—'}</td>
                        <td><span className="tag">{c.versao}</span></td>
                        <td className="n">{fmtNum(r.objetiva, 2)} <small>({r.acertos}/{r.nObjetivas})</small></td>
                        <td className="n">{r.maxDiscursiva ? <>{fmtNum(r.discursiva, 2)}{r.discPendentes > 0 && <span className="pend" title="Discursiva sem nota"> ⏳{r.discPendentes}</span>}</> : '—'}</td>
                        <td className="n"><b>{fmtNum(r.total, 2)}</b></td>
                        <td className="n"><span className={`pct ${r.percentual >= 70 ? 'alto' : r.percentual >= 50 ? 'medio' : 'baixo'}`}>{fmtNum(r.percentual)}%</span></td>
                        <td><small>{c.origem === 'corretor' ? '📱' : '💻'} {fmtData(c.atualizadaEm)}</small></td>
                        <td className="acoes-linha"><button className="btn btn-sm" onClick={() => setEditando(c)}>Editar</button><button className="btn-icone" aria-label="Excluir" onClick={() => excluir(c)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <AnaliseQuestoes av={av} correcoes={correcoes} />}
        </>
      )}
      {editando && <EditarCorrecao av={av} inicial={editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

function Distribuicao({ valores }: { valores: number[] }) {
  const faixas = Array.from({ length: 10 }, (_, i) => valores.filter(v => i === 9 ? v >= 90 : v >= i * 10 && v < (i + 1) * 10).length);
  const m = Math.max(1, ...faixas);
  return (
    <figure className="painel distribuicao">
      <figcaption>Distribuição das notas (% do valor total)</figcaption>
      <div className="barras">
        {faixas.map((n, i) => (
          <div key={i} className="barra-col" title={`${i * 10}–${i === 9 ? 100 : i * 10 + 9}%: ${n} aluno(s)`}>
            <span className="qtd">{n || ''}</span>
            <div className={`barra ${i >= 7 ? 'alto' : i >= 5 ? 'medio' : 'baixo'}`} style={{ height: `${(n / m) * 100}%` }} />
            <span className="faixa">{i * 10}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

async function ajustar(av: Avaliacao, idx: number, acao: AjusteGabarito['acao'], para?: string | null) {
  const anuladas = new Set(av.anuladas ?? []);
  const alterado = { ...(av.gabaritoAlterado ?? {}) };
  const original = av.snapshot![idx].correta;
  const de = alterado[idx] ?? original;
  if (acao === 'anular') anuladas.add(idx);
  if (acao === 'reativar') anuladas.delete(idx);
  if (acao === 'alterar') { if (para === original) delete alterado[idx]; else if (para) alterado[idx] = para; }
  const historico = [...(av.historicoGabarito ?? []), { em: Date.now(), idx, acao, de, para: para ?? null }];
  await db.avaliacoes.update(av.id, { anuladas: [...anuladas].sort((a, b) => a - b), gabaritoAlterado: alterado, historicoGabarito: historico, atualizadaEm: Date.now() });
}

function rotuloOpcao(av: Avaliacao, idx: number, id: string | null | undefined): string {
  const q = av.snapshot![idx];
  if (!id) return '—';
  if (q.tipo === 'vf') return id === 'V' ? 'Verdadeira' : 'Falsa';
  const i = q.alternativas.findIndex(a => a.id === id);
  return i >= 0 ? `${LETRAS[i]}) ${q.alternativas[i].texto.slice(0, 40)}` : '—';
}

function AjustesResumo({ av }: { av: Avaliacao }) {
  const nAnul = av.anuladas?.length ?? 0;
  const nAlt = Object.keys(av.gabaritoAlterado ?? {}).length;
  if (!nAnul && !nAlt) return null;
  return (
    <div className="ajustes-resumo">
      ⚖️ Notas recalculadas com {nAnul ? `${nAnul} questão(ões) anulada(s) — ${(av.politicaAnulacao ?? 'todos') === 'todos' ? 'ponto para todos' : 'retiradas da nota'}` : ''}{nAnul && nAlt ? ' e ' : ''}{nAlt ? `${nAlt} com gabarito alterado` : ''}. Detalhes em <b>Análise das questões</b>.
    </div>
  );
}

function Faltam({ av, correcoes }: { av: Avaliacao; correcoes: Correcao[] }) {
  const turma = ordenarAlunos(av.alunos ?? []);
  if (!turma.length) return null;
  const feito = (a: { nome: string; matricula: string }) => correcoes.some(c => a.matricula && c.matricula ? c.matricula === a.matricula : c.aluno.trim().toLowerCase() === a.nome.trim().toLowerCase());
  const faltam = turma.filter(a => !feito(a));
  return (
    <details className="painel faltam">
      <summary>{faltam.length ? <>Faltam corrigir <b>{faltam.length}</b> de {turma.length} alunos da lista</> : <>✅ Todos os {turma.length} alunos da lista foram corrigidos</>}</summary>
      {faltam.length > 0 && <p>{faltam.map(a => a.nome).join(' · ')}</p>}
    </details>
  );
}

function AnaliseQuestoes({ av, correcoes }: { av: Avaliacao; correcoes: Correcao[] }) {
  // a análise mede as questões como foram respondidas: ignora anulações, mas usa o gabarito vigente
  const itens = analiseItens(av, avaliarTodas(av, correcoes, { semAnulacao: true }));
  const anuladas = new Set(av.anuladas ?? []);
  const politica: PoliticaAnulacao = av.politicaAnulacao ?? 'todos';
  const [trocando, setTrocando] = useState<number | null>(null);

  return (
    <div className="painel">
      <p className="dica">Cada linha é uma questão da prova, reunindo todas as versões (a posição muda entre versões; aqui segue a ordem da versão A). <b>Facilidade</b> = proporção de acerto. <b>Discriminação</b> = quanto a questão separa quem foi bem de quem foi mal na prova (abaixo de 0,2 merece revisão; negativa costuma indicar gabarito ou enunciado com problema).</p>
      <div className="politica">
        <span>Questão anulada:</span>
        <div className="segmentos pequeno">
          <button className={politica === 'todos' ? 'ativo' : ''} onClick={() => db.avaliacoes.update(av.id, { politicaAnulacao: 'todos' })}>vale ponto para todos</button>
          <button className={politica === 'excluir' ? 'ativo' : ''} onClick={() => db.avaliacoes.update(av.id, { politicaAnulacao: 'excluir' })}>sai da nota</button>
        </div>
        <span className="dica">As notas de todos os alunos são recalculadas na hora.</span>
      </div>
      <div className="tabela-rolavel">
        <table className="tabela">
          <thead><tr><th>Q</th><th>Questão</th><th className="n">Facilidade</th><th className="n">Discriminação</th><th>Respostas marcadas</th><th>Ajustes</th></tr></thead>
          <tbody>
            {itens.map(it => {
              const q = it.questao;
              const anulada = anuladas.has(it.idx);
              const alterada = av.gabaritoAlterado?.[it.idx] !== undefined;
              const opcoes = q.tipo === 'me' ? q.alternativas.map((a, i) => ({ id: a.id, rot: LETRAS[i], certa: a.id === q.correta }))
                : q.tipo === 'vf' ? [{ id: 'V', rot: 'V', certa: q.correta === 'V' }, { id: 'F', rot: 'F', certa: q.correta === 'F' }] : [];
              const total = opcoes.reduce((a, o) => a + (it.escolhas[o.id] ?? 0), 0) + it.brancos;
              return (
                <tr key={it.idx} className={anulada ? 'linha-anulada' : ''}>
                  <td>{it.idx + 1}</td>
                  <td className="col-enunciado">
                    <span className={`tag tag-${q.tipo}`}>{ROTULO_TIPO[q.tipo]}</span>{anulada && <span className="tag tag-anulada">ANULADA</span>}{alterada && <span className="tag tag-alterada">GABARITO ALTERADO</span>} {q.enunciado.slice(0, 110)}{q.enunciado.length > 110 ? '…' : ''}
                  </td>
                  <td className="n">{it.n ? `${fmtNum(it.facilidade * 100, 0)}%` : '—'}<br /><small>{it.n ? rotuloFacilidade(it.facilidade) : ''}</small></td>
                  <td className="n">{it.discriminacao === null ? '—' : fmtNum(it.discriminacao, 2)}<br /><small className={it.discriminacao !== null && it.discriminacao < 0.2 ? 'ruim' : ''}>{rotuloDiscriminacao(it.discriminacao)}</small></td>
                  <td>
                    {q.tipo === 'disc' ? <small>nota média {fmtNum(it.facilidade * 100, 0)}% do valor</small> : (
                      <div className="distratores">
                        {opcoes.map(o => {
                          const n = it.escolhas[o.id] ?? 0;
                          return <span key={o.id} className={o.certa ? 'certa' : ''} title={`${n} aluno(s)`}><b>{o.rot}</b><i style={{ width: `${total ? (n / total) * 60 : 0}px` }} />{n}</span>;
                        })}
                        {it.brancos > 0 && <span title="Em branco ou dupla marcação"><b>∅</b>{it.brancos}</span>}
                      </div>
                    )}
                  </td>
                  <td className="col-ajustes">
                    {anulada
                      ? <button className="btn btn-sm" onClick={() => ajustar(av, it.idx, 'reativar')}>Desfazer anulação</button>
                      : <button className="btn btn-sm btn-perigo" onClick={() => { if (confirm(`Anular a questão ${it.idx + 1}? As notas de todos serão recalculadas (${politica === 'todos' ? 'ponto para todos' : 'a questão sai da nota'}).`)) ajustar(av, it.idx, 'anular'); }}>Anular</button>}
                    {q.tipo !== 'disc' && !anulada && (trocando === it.idx ? (
                      <select className="campo campo-sm" autoFocus defaultValue={q.correta ?? ''} aria-label="Nova resposta correta"
                        onBlur={() => setTrocando(null)}
                        onChange={async e => {
                          const para = e.target.value;
                          if (para && para !== q.correta && confirm(`Trocar o gabarito da questão ${it.idx + 1} de "${rotuloOpcao(av, it.idx, q.correta)}" para "${rotuloOpcao(av, it.idx, para)}"? Vale para todas as versões e recalcula as notas.`)) await ajustar(av, it.idx, 'alterar', para);
                          setTrocando(null);
                        }}>
                        {opcoes.map(o => <option key={o.id} value={o.id}>{o.rot}{o.certa ? ' (atual)' : ''}</option>)}
                      </select>
                    ) : <button className="btn btn-sm" onClick={() => setTrocando(it.idx)}>Trocar gabarito</button>)}
                    {alterada && !anulada && <button className="link" onClick={() => ajustar(av, it.idx, 'alterar', av.snapshot![it.idx].correta)}>voltar ao original</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dica">Na coluna de respostas, letras referem-se à ordem original da questão (versão A); a correta vigente aparece destacada. A facilidade e a discriminação são calculadas como se não houvesse anulação, para você avaliar a questão em si.</p>
      {(av.historicoGabarito?.length ?? 0) > 0 && (
        <details className="historico">
          <summary>Histórico de ajustes ({av.historicoGabarito!.length})</summary>
          <ul>{[...av.historicoGabarito!].reverse().map((h, i) => (
            <li key={i}>{fmtData(h.em)} — Questão {h.idx + 1}: {h.acao === 'anular' ? 'anulada' : h.acao === 'reativar' ? 'anulação desfeita' : `gabarito de "${rotuloOpcao(av, h.idx, h.de)}" para "${rotuloOpcao(av, h.idx, h.para)}"`}</li>
          ))}</ul>
        </details>
      )}
    </div>
  );
}

export function EditarCorrecao({ av, inicial, aoFechar }: { av: Avaliacao; inicial: Correcao; aoFechar: () => void }) {
  const [c, setC] = useState(inicial);
  const itens = itensDaVersao(av, c.versao);
  const r = corrigir(itens, c.respostas, c.notasDisc);
  const nova = !inicial.aluno && inicial.respostas.every(x => x === null);

  function trocarVersao(nome: string) {
    const n = av.versoes!.find(v => v.nome === nome)!.ordem.length;
    setC({ ...c, versao: nome, respostas: Array(n).fill(null), notasDisc: Array(n).fill(null) });
  }

  async function salvar() {
    if (!c.aluno.trim()) { aviso('Informe o nome do aluno.', 'erro'); return; }
    await db.correcoes.put({ ...c, aluno: c.aluno.trim(), matricula: c.matricula.trim(), atualizadaEm: Date.now() });
    aviso('Correção salva.');
    aoFechar();
  }

  return (
    <Modal titulo={nova ? 'Lançar correção' : `Correção — ${inicial.aluno}`} aoFechar={aoFechar} largo
      rodape={<><span className="total-modal">Nota: <b>{fmtNum(r.total, 2)}</b> / {fmtNum(r.max, 2)}{r.discPendentes ? ` · ${r.discPendentes} discursiva(s) sem nota` : ''}</span>
        <button className="btn" onClick={aoFechar}>Cancelar</button><button className="btn btn-primario" onClick={salvar}>Salvar</button></>}>
      <div className="grade-3">
        <label className="rotulo">Aluno<input className="campo" value={c.aluno} onChange={e => setC({ ...c, aluno: e.target.value })} autoFocus={nova} /></label>
        <label className="rotulo">Matrícula<input className="campo" value={c.matricula} onChange={e => setC({ ...c, matricula: e.target.value })} /></label>
        <label className="rotulo">Versão
          <select className="campo" value={c.versao} onChange={e => trocarVersao(e.target.value)} disabled={!nova}>
            {av.versoes!.map(v => <option key={v.nome}>{v.nome}</option>)}
          </select>
        </label>
      </div>
      <FolhaRespostas itens={itens} respostas={c.respostas} notasDisc={c.notasDisc} conferir={!nova}
        aoMarcar={(pos, x: Resposta) => setC({ ...c, respostas: c.respostas.map((y, i) => i === pos ? x : y) })}
        aoNotaDisc={(pos, n) => setC({ ...c, notasDisc: c.notasDisc.map((y, i) => i === pos ? n : y) })} />
    </Modal>
  );
}
