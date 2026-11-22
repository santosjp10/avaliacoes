import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Avaliacao, ItemGabarito, Questao, Versao } from '../core/types';
import { db, chaveDoEstudio } from '../data/db';
import { alternativasNaVersao, itensDaVersao, opcoesItem, valorTotal } from '../core/gabarito';
import { qrFolha } from '../core/payload';
import { LETRAS, fmtNum } from '../core/util';
import { useRota } from '../ui/base';

type Tipo = 'prova' | 'folha' | 'completo' | 'lote' | 'gabarito';

export function Imprimir({ id }: { id: string }) {
  const { params } = useRota();
  const tipo = (params.get('tipo') ?? 'completo') as Tipo;
  const versaoParam = params.get('versao');
  const copias = Math.min(200, Math.max(1, Number(params.get('copias') ?? 1)));
  const [colunas, setColunas] = useState<1 | 2>(1);
  const [av, setAv] = useState<Avaliacao | null | undefined>();
  const [qrs, setQrs] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const a = await db.avaliacoes.get(id);
      if (!a || a.status !== 'publicada') { setAv(null); return; }
      const k = await chaveDoEstudio();
      const out: Record<string, string> = {};
      for (const v of a.versoes!) {
        const txt = await qrFolha(k.chave, k.idChave, { avaliacaoId: a.id, titulo: a.titulo, codigo: a.codigo, versao: v.nome, itens: itensDaVersao(a, v.nome) });
        out[v.nome] = await QRCode.toDataURL(txt, { errorCorrectionLevel: 'M', margin: 0, scale: 6 });
      }
      setQrs(out); setAv(a);
      document.title = `${a.codigo} — ${a.titulo}`;
    })();
  }, [id]);

  if (av === undefined) return <p style={{ padding: 24 }}>Preparando impressão…</p>;
  if (av === null) return <p style={{ padding: 24 }}>Avaliação não encontrada ou ainda não publicada.</p>;

  const versoes = av.versoes!;
  const paginas: React.ReactNode[] = [];
  const umaVersao = versoes.find(v => v.nome === versaoParam) ?? versoes[0];

  if (tipo === 'gabarito') paginas.push(<GabaritoProfessor key="g" av={av} />);
  else if (tipo === 'lote') {
    for (let i = 0; i < copias; i++) {
      const v = versoes[i % versoes.length];
      paginas.push(<Prova key={`p${i}`} av={av} v={v} qr={qrs[v.nome]} colunas={colunas} />);
      paginas.push(<Folha key={`f${i}`} av={av} v={v} qr={qrs[v.nome]} />);
    }
  } else {
    if (tipo === 'prova' || tipo === 'completo') paginas.push(<Prova key="p" av={av} v={umaVersao} qr={qrs[umaVersao.nome]} colunas={colunas} />);
    if (tipo === 'folha' || tipo === 'completo') paginas.push(<Folha key="f" av={av} v={umaVersao} qr={qrs[umaVersao.nome]} />);
  }

  const descricao = tipo === 'lote' ? `Prova + folha para ${copias} aluno(s), versões alternadas` : tipo === 'gabarito' ? 'Gabarito do professor — não distribuir' : `Versão ${umaVersao.nome}`;
  return (
    <div className="impressao">
      <div className="barra-impressao nao-imprimir">
        <div><strong>{av.titulo}</strong> · {descricao}</div>
        <div className="acoes">
          {tipo !== 'folha' && tipo !== 'gabarito' && (
            <div className="segmentos pequeno">
              <button className={colunas === 1 ? 'ativo' : ''} onClick={() => setColunas(1)}>1 coluna</button>
              <button className={colunas === 2 ? 'ativo' : ''} onClick={() => setColunas(2)}>2 colunas</button>
            </div>
          )}
          <button className="btn btn-primario" onClick={() => window.print()}>🖨 Imprimir / salvar PDF</button>
          <button className="btn" onClick={() => window.close()}>Fechar</button>
        </div>
      </div>
      {paginas}
    </div>
  );
}

function Campos({ comTurma = true }: { comTurma?: boolean }) {
  return (
    <div className="campos-aluno">
      <div className="campo-linha grande"><span>Nome</span></div>
      <div className="campo-linha"><span>Matrícula</span></div>
      {comTurma && <div className="campo-linha"><span>Turma</span></div>}
      <div className="campo-linha"><span>Data</span></div>
    </div>
  );
}

function Cabecalho({ av, v, qr, subtitulo }: { av: Avaliacao; v: Versao; qr?: string; subtitulo: string }) {
  return (
    <header className="cab-impressao">
      {qr && <img className="qr" src={qr} alt="" />}
      <div className="cab-texto">
        <div className="cab-linha1">
          <h1>{av.titulo}</h1>
          <span className="versao-grande">{v.nome}</span>
        </div>
        <p className="cab-meta">{av.codigo} · {subtitulo}{av.disciplina ? ` · ${av.disciplina}` : ''}</p>
        <Campos />
      </div>
    </header>
  );
}

function ImagensQuestao({ q, pos }: { q: Questao; pos: 'acima' | 'abaixo' }) {
  const imgs = q.imagens.filter(i => i.pos === pos);
  return <>{imgs.map((i, k) => <img key={k} className="img-questao" src={i.src} alt="" />)}</>;
}

function Prova({ av, v, qr, colunas }: { av: Avaliacao; v: Versao; qr?: string; colunas: 1 | 2 }) {
  const pesos = av.pesos!;
  const uniforme = pesos.every(p => p === pesos[0]);
  return (
    <section className="pagina prova">
      <Cabecalho av={av} v={v} qr={qr} subtitulo={`${v.ordem.length} questões · Valor: ${fmtNum(valorTotal(av), 2)} pontos${uniforme ? ` (${fmtNum(pesos[0], 2)} cada)` : ''}`} />
      {av.instrucoes && <p className="instrucoes">{av.instrucoes}</p>}
      <p className="instrucoes">Marque suas respostas na <b>folha de respostas</b>. Questões discursivas devem ser respondidas no espaço indicado.</p>
      <div className={`questoes cols-${colunas}`}>
        {v.ordem.map((idx, pos) => {
          const q = av.snapshot![idx];
          const direita = q.imagens.filter(i => i.pos === 'direita');
          return (
            <div key={pos} className="questao">
              <ImagensQuestao q={q} pos="acima" />
              <div className={direita.length ? 'com-lateral' : ''}>
                <p className="enunciado-imp"><b>{pos + 1}.</b> {!uniforme && <span className="valor-q">({fmtNum(pesos[idx], 2)} pt)</span>} {q.tipo === 'vf' && <span className="valor-q">(V ou F)</span>} {q.enunciado}</p>
                {direita.map((i, k) => <img key={k} className="img-questao lateral" src={i.src} alt="" />)}
              </div>
              <ImagensQuestao q={q} pos="abaixo" />
              {q.tipo === 'me' && (
                <ol className="alts-imp">
                  {alternativasNaVersao(q, v).map((a, i) => <li key={a.id}><span className="letra">{LETRAS[i]}</span>{a.texto}</li>)}
                </ol>
              )}
              {q.tipo === 'disc' && Array.from({ length: q.linhas }, (_, i) => <div key={i} className="linha-escrita" />)}
            </div>
          );
        })}
      </div>
      <footer className="rodape-imp">{av.codigo} · Versão {v.nome}</footer>
    </section>
  );
}

const POR_COLUNA = 15;

function Folha({ av, v, qr }: { av: Avaliacao; v: Versao; qr?: string }) {
  const itens = itensDaVersao(av, v.nome);
  const colunas: { it: ItemGabarito; pos: number }[][] = [];
  itens.forEach((it, pos) => {
    const c = Math.floor(pos / POR_COLUNA);
    (colunas[c] ??= []).push({ it, pos });
  });
  return (
    <section className="pagina folha">
      <span className="marcador tl" /><span className="marcador tr" /><span className="marcador bl" /><span className="marcador br" />
      <Cabecalho av={av} v={v} qr={qr} subtitulo="FOLHA DE RESPOSTAS" />
      <p className="instrucoes">Preencha <b>completamente</b> uma bolha por questão, com caneta azul ou preta. Não rasure. Não dobre nem amasse esta folha.
        <span className="exemplo">Correto: <i className="b cheia" /> Errado: <i className="b">✓</i> <i className="b">✗</i></span></p>
      <div className="grade-folha">
        {colunas.map((col, c) => (
          <div key={c} className="col-folha">
            {col.map(({ it, pos }) => (
              <div key={pos} className={`lin-folha ${it.tipo === 'disc' ? 'disc' : ''}`}>
                <span className="n">{pos + 1}</span>
                {it.tipo === 'disc'
                  ? <span className="disc-campo">Discursiva — nota: <i className="nota-box" /> / {fmtNum(it.peso, 2)}</span>
                  : opcoesItem(it).map(op => <i key={op} className="b">{op}</i>)}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="area-professor">
        <span>Uso do professor —</span>
        <span>Objetiva: <i className="nota-box" /></span>
        <span>Discursiva: <i className="nota-box" /></span>
        <span>Total: <i className="nota-box" /> / {fmtNum(valorTotal(av), 2)}</span>
      </div>
      <footer className="rodape-imp">{av.codigo} · Versão {v.nome} · Folha de respostas</footer>
    </section>
  );
}

function GabaritoProfessor({ av }: { av: Avaliacao }) {
  const discs = av.snapshot!.map((q, idx) => ({ q, idx })).filter(x => x.q.tipo === 'disc');
  return (
    <section className="pagina gabarito-prof">
      <header className="cab-gab">
        <h1>Gabarito — {av.titulo}</h1>
        <p>{av.codigo} · {av.snapshot!.length} questões · {fmtNum(valorTotal(av), 2)} pontos · <b>Uso exclusivo do professor</b></p>
      </header>
      {av.versoes!.map(v => {
        const itens = itensDaVersao(av, v.nome);
        return (
          <div key={v.nome} className="gab-versao">
            <h2>Versão {v.nome}</h2>
            <div className="gab-grade">
              {itens.map((it, i) => (
                <div key={i}><small>{i + 1}</small><b>{it.tipo === 'disc' ? '✎' : it.correta}</b></div>
              ))}
            </div>
          </div>
        );
      })}
      {discs.length > 0 && (
        <div className="gab-disc">
          <h2>Critérios das discursivas</h2>
          {discs.map(({ q, idx }) => (
            <div key={q.id} className="crit">
              <p><b>{q.enunciado.slice(0, 140)}{q.enunciado.length > 140 ? '…' : ''}</b> <span className="valor-q">({fmtNum(av.pesos![idx], 2)} pt)</span></p>
              <p className="pos-versoes">Posição: {av.versoes!.map(v => `${v.nome} → ${v.ordem.indexOf(idx) + 1}`).join(' · ')}</p>
              <p>{q.criterio || <i>Sem critério cadastrado.</i>}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

