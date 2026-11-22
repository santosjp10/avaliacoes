import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Aluno, Avaliacao, Questao, Versao } from '../core/types';
import { db, chaveDoEstudio } from '../data/db';
import { alternativasNaVersao, itensDaVersao, valorTotal } from '../core/gabarito';
import { ordenarAlunos } from '../core/alunos';
import { atribuicao } from '../core/compartilhado';
import { qrFolha } from '../core/payload';
import { CENTROS_MARCADORES, GRADE, MARCADOR, layoutFolha } from '../core/folha';
import { LETRAS, fmtNum } from '../core/util';
import { useRota } from '../ui/base';

type Tipo = 'prova' | 'folha' | 'completo' | 'lote' | 'gabarito';

export function Imprimir({ id }: { id: string }) {
  const { params } = useRota();
  const tipo = (params.get('tipo') ?? 'completo') as Tipo;
  const versaoParam = params.get('versao');
  const copias = Math.min(200, Math.max(1, Number(params.get('copias') ?? 1)));
  const personalizado = params.get('personalizado') === '1';
  const [colunas, setColunas] = useState<1 | 2>(1);
  const [av, setAv] = useState<Avaliacao | null | undefined>();
  const [qrs, setQrs] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const a = await db.avaliacoes.get(id);
      if (!a || a.status !== 'publicada') { setAv(null); return; }
      const k = await chaveDoEstudio();
      const out: Record<string, string> = {};
      const gerar = async (v: Versao, aluno?: Aluno) => {
        // o QR leva o gabarito vigente (com trocas de gabarito); anulações são tratadas no Estúdio
        const txt = await qrFolha(k.chave, k.idChave, { avaliacaoId: a.id, titulo: a.titulo, codigo: a.codigo, versao: v.nome, itens: itensDaVersao(a, v.nome, { semAnulacao: true }), aluno });
        // SVG = vetorial: o QR sai nítido em qualquer impressora e é lido de mais longe pela câmera
        const svg = await QRCode.toString(txt, { type: 'svg', errorCorrectionLevel: 'L', margin: 0 });
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      };
      for (const v of a.versoes!) out[v.nome] = await gerar(v);
      if (personalizado) {
        const lista = ordenarAlunos(a.alunos ?? []);
        for (let i = 0; i < lista.length; i++) out[`aluno${i}`] = await gerar(a.versoes![i % a.versoes!.length], lista[i]);
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

  const turma = ordenarAlunos(av.alunos ?? []);
  if (tipo === 'gabarito') paginas.push(<GabaritoProfessor key="g" av={av} />);
  else if (tipo === 'lote' && personalizado) {
    turma.forEach((aluno, i) => {
      const v = versoes[i % versoes.length];
      paginas.push(<Prova key={`p${i}`} av={av} v={v} qr={qrs[`aluno${i}`]} colunas={colunas} aluno={aluno} />);
      paginas.push(<Folha key={`f${i}`} av={av} v={v} qr={qrs[`aluno${i}`]} aluno={aluno} />);
    });
  } else if (tipo === 'lote') {
    for (let i = 0; i < copias; i++) {
      const v = versoes[i % versoes.length];
      paginas.push(<Prova key={`p${i}`} av={av} v={v} qr={qrs[v.nome]} colunas={colunas} />);
      paginas.push(<Folha key={`f${i}`} av={av} v={v} qr={qrs[v.nome]} />);
    }
  } else {
    if (tipo === 'prova' || tipo === 'completo') paginas.push(<Prova key="p" av={av} v={umaVersao} qr={qrs[umaVersao.nome]} colunas={colunas} />);
    if (tipo === 'folha' || tipo === 'completo') paginas.push(<Folha key="f" av={av} v={umaVersao} qr={qrs[umaVersao.nome]} />);
  }

  const descricao = tipo === 'lote' && personalizado ? `Prova + folha personalizadas para ${turma.length} aluno(s), em ordem alfabética`
    : tipo === 'lote' ? `Prova + folha para ${copias} aluno(s), versões alternadas` : tipo === 'gabarito' ? 'Gabarito do professor — não distribuir' : `Versão ${umaVersao.nome}`;
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

function Campos({ aluno, turma }: { aluno?: Aluno; turma?: string }) {
  return (
    <div className="campos-aluno">
      <div className="campo-linha grande"><span>Nome</span>{aluno && <b>{aluno.nome}</b>}</div>
      <div className="campo-linha"><span>Matrícula</span>{aluno && <b>{aluno.matricula}</b>}</div>
      <div className="campo-linha"><span>Turma</span>{aluno && turma && <b>{turma}</b>}</div>
      <div className="campo-linha"><span>Data</span></div>
    </div>
  );
}

function Cabecalho({ av, v, qr, subtitulo, aluno }: { av: Avaliacao; v: Versao; qr?: string; subtitulo: string; aluno?: Aluno }) {
  return (
    <header className="cab-impressao">
      {qr && <img className="qr" src={qr} alt="" />}
      <div className="cab-texto">
        <div className="cab-linha1">
          <h1>{av.titulo}</h1>
          <span className="versao-grande">{v.nome}</span>
        </div>
        <p className="cab-meta">{av.codigo} · {subtitulo}{av.disciplina ? ` · ${av.disciplina}` : ''}</p>
        <Campos aluno={aluno} turma={av.turma} />
      </div>
    </header>
  );
}

function ImagensQuestao({ q, pos }: { q: Questao; pos: 'acima' | 'abaixo' }) {
  const imgs = q.imagens.filter(i => i.pos === pos);
  return <>{imgs.map((i, k) => <img key={k} className="img-questao" src={i.src} alt="" />)}</>;
}

function Prova({ av, v, qr, colunas, aluno }: { av: Avaliacao; v: Versao; qr?: string; colunas: 1 | 2; aluno?: Aluno }) {
  const pesos = av.pesos!;
  const uniforme = pesos.every(p => p === pesos[0]);
  return (
    <section className="pagina prova">
      <Cabecalho av={av} v={v} qr={qr} aluno={aluno} subtitulo={`${v.ordem.length} questões · Valor: ${fmtNum(valorTotal(av), 2)} pontos${uniforme ? ` (${fmtNum(pesos[0], 2)} cada)` : ''}`} />
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
      {atribuicao(av.snapshot!) && <p className="atribuicao">{atribuicao(av.snapshot!)}</p>}
      <footer className="rodape-imp">{av.codigo} · Versão {v.nome}</footer>
    </section>
  );
}

function Folha({ av, v, qr, aluno }: { av: Avaliacao; v: Versao; qr?: string; aluno?: Aluno }) {
  const itens = itensDaVersao(av, v.nome, { semAnulacao: true });
  const linhas = layoutFolha(itens);
  const mm = (n: number) => `${n}mm`;
  return (
    <section className="pagina folha">
      {CENTROS_MARCADORES.map(([x, y], i) => (
        // desenhado em SVG (e não como cor de fundo): sai impresso mesmo com "Gráficos de fundo" desligado
        <svg key={i} className="marcador" viewBox="0 0 10 10" aria-hidden style={{ left: mm(x - MARCADOR.lado / 2), top: mm(y - MARCADOR.lado / 2), width: mm(MARCADOR.lado), height: mm(MARCADOR.lado) }}>
          <rect width="10" height="10" fill="#000" />
        </svg>
      ))}
      <Cabecalho av={av} v={v} qr={qr} subtitulo={aluno ? 'FOLHA DE RESPOSTAS · personalizada — use somente a sua' : 'FOLHA DE RESPOSTAS'} aluno={aluno} />
      <p className="instrucoes">Preencha <b>completamente</b> uma bolha por questão, com caneta azul ou preta. Não rasure, não dobre e não escreva perto dos quadrados pretos dos cantos.
        <span className="exemplo">Correto: <svg className="b-ex-svg" viewBox="0 0 10 10" aria-hidden><circle cx="5" cy="5" r="4.6" fill="#000" /></svg> Errado: <i className="b-ex">✓</i> <i className="b-ex">✗</i></span></p>
      {linhas.map(l => (
        <div key={l.pos} className={`lin-abs ${(l.pos + 1) % 5 === 0 ? 'sep' : ''}`} style={{ left: mm(l.x), top: mm(l.y), width: mm(l.largura - 2), height: mm(GRADE.linha) }}>
          <span className="n" style={{ width: mm(GRADE.numero - 1.5) }}>{l.pos + 1}</span>
          {l.tipo === 'disc' && <span className="disc-campo">Disc. — nota <i className="nota-box" /> /{fmtNum(itens[l.pos].peso, 2)}</span>}
        </div>
      ))}
      {linhas.flatMap(l => l.opcoes.map(o => (
        <i key={`${l.pos}${o.op}`} className="b" style={{ left: mm(o.x - GRADE.bolha / 2), top: mm(o.y - GRADE.bolha / 2), width: mm(GRADE.bolha), height: mm(GRADE.bolha) }}>{o.op}</i>
      )))}
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
                <div key={i} className={it.anulada ? 'anulada' : ''}><small>{i + 1}</small><b>{it.anulada ? 'ANUL.' : it.tipo === 'disc' ? '✎' : it.correta}</b></div>
              ))}
            </div>
          </div>
        );
      })}
      {((av.anuladas?.length ?? 0) > 0 || Object.keys(av.gabaritoAlterado ?? {}).length > 0) && (
        <p className="pos-versoes">Gabarito com ajustes após a aplicação: {av.anuladas?.length ?? 0} questão(ões) anulada(s){av.anuladas?.length ? ` (${(av.politicaAnulacao ?? 'todos') === 'todos' ? 'ponto para todos' : 'retiradas da nota'})` : ''} e {Object.keys(av.gabaritoAlterado ?? {}).length} com gabarito alterado.</p>
      )}
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

