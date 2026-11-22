import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { Vazio, aviso } from '../ui/base';
import { paraLocal, urlRelatarErro, type IndiceBanco, type QuestaoCompartilhada } from '../core/compartilhado';
import { LETRAS } from '../core/util';
import { REPO_BANCO } from '../config';
import { Filtros, ROTULO_TIPO } from './Banco';

function blobParaDataURL(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(b); });
}

async function baixarImagens(q: QuestaoCompartilhada) {
  const out = [];
  for (const img of q.imagens) {
    const r = await fetch(`./banco/${img.src}`);
    if (!r.ok) throw new Error(`Imagem da questão ${q.id} indisponível.`);
    out.push({ src: await blobParaDataURL(await r.blob()), pos: img.pos });
  }
  return out;
}

export function Compartilhado() {
  const [indice, setIndice] = useState<IndiceBanco | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState({ busca: '', disciplina: '', tipo: '', nivel: '' });
  const [autor, setAutor] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [importando, setImportando] = useState(false);
  const jaImportadas = useLiveQuery(async () => new Set((await db.questoes.toArray()).map(q => q.origem?.id).filter(Boolean) as string[]), []) ?? new Set<string>();

  useEffect(() => {
    fetch('./banco/indice.json', { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setIndice)
      .catch(() => setErro(navigator.onLine ? 'Não foi possível carregar o banco compartilhado.' : 'Sem internet: o banco compartilhado precisa de conexão (o resto do app funciona offline).'));
  }, []);

  const qs = indice?.questoes ?? [];
  const disciplinas = useMemo(() => [...new Set(qs.map(q => q.disciplina))].sort(), [qs]);
  const autores = useMemo(() => [...new Set(qs.map(q => q.autor))].sort(), [qs]);
  const lista = useMemo(() => {
    const b = f.busca.trim().toLowerCase();
    return qs.filter(q => (!f.disciplina || q.disciplina === f.disciplina) && (!f.tipo || q.tipo === f.tipo) && (!f.nivel || q.nivel === f.nivel) && (!autor || q.autor === autor) &&
      (!b || q.enunciado.toLowerCase().includes(b) || q.assunto.toLowerCase().includes(b) || q.fonte.toLowerCase().includes(b)));
  }, [qs, f, autor]);

  async function importar(ids: string[]) {
    const escolhidas = qs.filter(q => ids.includes(q.id) && !jaImportadas.has(q.id));
    if (!escolhidas.length) { aviso('Essas questões já estão no seu banco.', 'info'); return; }
    setImportando(true);
    try {
      const novas = [];
      for (const q of escolhidas) novas.push(paraLocal(q, await baixarImagens(q)));
      await db.questoes.bulkPut(novas);
      setSel(new Set());
      aviso(`${novas.length} questão(ões) copiada(s) para o seu banco. Já podem ser usadas nas avaliações.`);
    } catch (e) { aviso((e as Error).message, 'erro'); }
    setImportando(false);
  }

  if (erro) return <Vazio icone="🌐" titulo="Banco compartilhado indisponível"><p>{erro}</p></Vazio>;
  if (!indice) return <p className="dica">Carregando o banco compartilhado…</p>;

  const selecionaveis = lista.filter(q => !jaImportadas.has(q.id));
  return (
    <>
      <section className="painel faixa-av">
        <div>
          <h2>🌐 Banco Aberto de Questões</h2>
          <p className="meta">{indice.total} questões de {autores.length} autor(es) · licença CC BY 4.0 · atualizado em {new Date(indice.atualizadoEm).toLocaleDateString('pt-BR')}</p>
        </div>
        <div className="acoes">
          <a className="btn" href={`https://github.com/${REPO_BANCO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">Como contribuir</a>
        </div>
      </section>
      <p className="dica">Questões revisadas e compartilhadas por professores. Ao importar, a questão é <b>copiada</b> para o seu banco — você pode editá-la à vontade; o crédito ao autor vai no rodapé da prova impressa. <b>Banco aberto:</b> estudantes também podem ver estas questões e seus gabaritos.</p>
      <Filtros f={f} setF={setF} disciplinas={disciplinas} />
      <div className="barra-acoes">
        <select className="campo campo-sm" value={autor} onChange={e => setAutor(e.target.value)} aria-label="Autor">
          <option value="">Todos os autores</option>{autores.map(a => <option key={a}>{a}</option>)}
        </select>
        <span className="contador">{lista.length} questão(ões)</span>
        {selecionaveis.length > 0 && <button className="btn btn-sm" onClick={() => setSel(sel.size === selecionaveis.length ? new Set() : new Set(selecionaveis.map(q => q.id)))}>{sel.size === selecionaveis.length ? 'Desmarcar todas' : 'Marcar todas'}</button>}
        <button className="btn btn-primario" disabled={!sel.size || importando} onClick={() => importar([...sel])}>⬇ Copiar {sel.size || ''} para o meu banco</button>
      </div>
      <div className="lista-questoes">
        {lista.map(q => {
          const ja = jaImportadas.has(q.id);
          return (
            <article key={q.id} className={`cartao-q compartilhada ${sel.has(q.id) ? 'selecionada' : ''}`}>
              <div className="etiquetas">
                {!ja && <input type="checkbox" aria-label={`Selecionar questão ${q.id}`} checked={sel.has(q.id)} onChange={() => { const n = new Set(sel); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); setSel(n); }} />}
                <span className={`tag tag-${q.tipo}`}>{ROTULO_TIPO[q.tipo]}</span>
                <span className={`tag nivel-${q.nivel === 'Fácil' ? 'f' : q.nivel === 'Médio' ? 'm' : 'd'}`}>{q.nivel}</span>
                <span className="tag">{q.disciplina}</span>
                {q.assunto && <span className="tag-texto">{q.assunto}</span>}
                {q.imagens.length > 0 && <span className="tag-texto">🖼 {q.imagens.length}</span>}
                <code className="id-q">{q.id}</code>
              </div>
              {q.imagens.filter(i => i.pos === 'acima').map(i => <img key={i.src} className="img-compartilhada" src={`./banco/${i.src}`} alt="" />)}
              <p className="enunciado">{q.enunciado}</p>
              {q.imagens.filter(i => i.pos !== 'acima').map(i => <img key={i.src} className="img-compartilhada" src={`./banco/${i.src}`} alt="" />)}
              {q.tipo === 'me' && <ol className="alts-resumo">{q.alternativas.map((a, i) => <li key={a.id} className={a.id === q.correta ? 'correta' : ''}><b>{LETRAS[i]}</b> {a.texto}</li>)}</ol>}
              {q.tipo === 'vf' && <p className="resp-vf">Resposta: <b>{q.correta === 'V' ? 'Verdadeira' : 'Falsa'}</b></p>}
              <p className="credito">✍️ <b>{q.autor}</b>{q.instituicao && ` · ${q.instituicao}`}{q.fonte && <> · <span title="Fonte">{q.fonte}</span></>} · {q.licenca}</p>
              <div className="acoes">
                {ja ? <span className="tag ja-importada">✓ No seu banco</span> : <button className="btn btn-sm btn-primario" disabled={importando} onClick={() => importar([q.id])}>⬇ Copiar para o meu banco</button>}
                <a className="btn btn-sm" href={urlRelatarErro(REPO_BANCO, q)} target="_blank" rel="noreferrer">Relatar erro</a>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
