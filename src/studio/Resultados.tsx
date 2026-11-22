import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Avaliacao, Correcao, Resposta } from '../core/types';
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
    const f = await escolherArquivo('.json,application/json');
    if (!f) return;
    try {
      const k = await chaveDoEstudio();
      const lista = await abrirPacote(JSON.parse(await f.text()), k.chave, k.idChave);
      const r = await mesclarCorrecoes(lista);
      const desta = lista.filter(c => c.avaliacaoId === av.id).length;
      aviso(`Pacote importado: ${r.novas} nova(s), ${r.atualizadas} atualizada(s)${r.ignoradas ? `, ${r.ignoradas} já existiam` : ''}. ${desta} desta avaliação.`);
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
          ) : <AnaliseQuestoes av={av} avaliadas={avaliadas} />}
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

function AnaliseQuestoes({ av, avaliadas }: { av: Avaliacao; avaliadas: ReturnType<typeof avaliarTodas> }) {
  const itens = analiseItens(av, avaliadas);
  return (
    <div className="painel">
      <p className="dica">Cada linha é uma questão da prova, reunindo todas as versões (a posição muda entre versões; aqui segue a ordem da versão A). <b>Facilidade</b> = proporção de acerto. <b>Discriminação</b> = quanto a questão separa quem foi bem de quem foi mal na prova (abaixo de 0,2 merece revisão; negativa costuma indicar gabarito ou enunciado com problema).</p>
      <div className="tabela-rolavel">
        <table className="tabela">
          <thead><tr><th>Q</th><th>Questão</th><th className="n">Facilidade</th><th className="n">Discriminação</th><th>Respostas marcadas</th></tr></thead>
          <tbody>
            {itens.map(it => {
              const q = it.questao;
              const opcoes = q.tipo === 'me' ? q.alternativas.map((a, i) => ({ id: a.id, rot: LETRAS[i], certa: a.id === q.correta }))
                : q.tipo === 'vf' ? [{ id: 'V', rot: 'V', certa: q.correta === 'V' }, { id: 'F', rot: 'F', certa: q.correta === 'F' }] : [];
              const total = opcoes.reduce((a, o) => a + (it.escolhas[o.id] ?? 0), 0) + it.brancos;
              return (
                <tr key={it.idx}>
                  <td>{it.idx + 1}</td>
                  <td className="col-enunciado"><span className={`tag tag-${q.tipo}`}>{ROTULO_TIPO[q.tipo]}</span> {q.enunciado.slice(0, 110)}{q.enunciado.length > 110 ? '…' : ''}</td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dica">Na coluna de respostas, letras referem-se à ordem original da questão (versão A); a correta aparece destacada.</p>
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
