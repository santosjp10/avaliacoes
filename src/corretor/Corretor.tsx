import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Correcao, Resposta } from '../core/types';
import { db, chaveDoCorretor, gravarConfig, lerConfig, nomeDispositivo } from '../data/db';
import { idChaveDaFolha, lerQrFolha, lerQrPareamento, montarPacote, type DadosFolha } from '../core/payload';
import { corrigir } from '../core/correcao';
import { fmtData, fmtNum, novoId } from '../core/util';
import { aviso } from '../ui/base';
import { FolhaRespostas } from '../ui/FolhaRespostas';
import { LeitorQr, type Quadro } from './LeitorQr';
import { VERSAO } from '../ui/Atualizacao';
import { lerFolhaOMR } from '../core/omr';
import { desenharLeitura } from './previa';
import { baixar } from '../data/backup';

type Tela =
  | { t: 'inicio' }
  | { t: 'parear' }
  | { t: 'ler' }
  | { t: 'corrigir'; folha: DadosFolha; c: Correcao; leitura?: Leitura }
  | { t: 'resultado'; folha: DadosFolha; c: Correcao }
  | { t: 'lista' };

interface Leitura { duvidas: boolean[]; previa: string; lidas: number }

const chaveFolha = (avaliacaoId: string, versao: string) => `folha:${avaliacaoId}:${versao}`;

function correcaoVazia(f: DadosFolha, dispositivo: string): Correcao {
  const agora = Date.now();
  return {
    id: novoId(), avaliacaoId: f.avaliacaoId, codigo: f.codigo, versao: f.versao, aluno: '', matricula: '',
    respostas: f.itens.map(() => null), notasDisc: f.itens.map(() => null),
    origem: 'corretor', dispositivo, criadaEm: agora, atualizadaEm: agora,
  };
}

export function Corretor() {
  const [tela, setTela] = useState<Tela>({ t: 'inicio' });
  const chave = useLiveQuery(async () => (await chaveDoCorretor()) ?? 'nenhuma', []);
  const [dispositivo, setDispositivo] = useState('');
  const tentativas = useRef(0);
  const [ultimaFolha, setUltimaFolha] = useState<DadosFolha | null>(null);
  const lerFolha = () => { tentativas.current = 0; setUltimaFolha(null); setTela({ t: 'ler' }); };
  useEffect(() => { nomeDispositivo().then(setDispositivo); }, []);

  if (chave === undefined) return null;
  const k = chave === 'nenhuma' ? null : chave;

  async function aoLerPareamento(txt: string) {
    const p = lerQrPareamento(txt);
    if (!p) { aviso('Este não é o QR de pareamento. No PC, abra Ajustes → Mostrar QR de pareamento.', 'erro'); return false; }
    await gravarConfig('pareamento', p);
    aviso(`Pareado${p.professor ? ` com ${p.professor}` : ''}!`);
    setTela({ t: 'inicio' });
    return true;
  }

  async function aoLerFolha(txt: string, quadro: Quadro) {
    if (!k) return false;
    if (txt.startsWith('AVP1|')) { aviso('Esse é o QR de pareamento. Aponte para o QR da folha de respostas.', 'info'); return false; }
    const r = await lerQrFolha(txt, k.chave, k.idChave);
    if (!r.ok) {
      const msg = r.motivo === 'chave'
        ? `Esta folha foi gerada com outra chave de professor (${idChaveDaFolha(txt)}). Pareie este celular com o Estúdio que imprimiu a prova.`
        : r.motivo === 'formato'
          ? (/^AV\d+\|/.test(txt)
            ? 'Esta folha foi gerada por uma versão mais nova do app. Atualize o Corretor: feche esta aba e abra o app de novo.'
            : 'QR não reconhecido. Aponte para o QR no canto da folha de respostas.')
          : 'Não foi possível ler o gabarito desta folha.';
      aviso(msg, 'erro');
      return false;
    }
    const folha = r.dados;
    await gravarConfig(chaveFolha(folha.avaliacaoId, folha.versao), folha);
    const omr = lerFolhaOMR(quadro.img, folha.itens, quadro.qr);
    if (omr.ok) {
      const c = correcaoVazia(folha, dispositivo);
      c.respostas = omr.respostas;
      const lidas = omr.respostas.filter((x, i) => x !== null && folha.itens[i].tipo !== 'disc').length;
      setTela({ t: 'corrigir', folha, c, leitura: { duvidas: omr.duvidas, previa: desenharLeitura(quadro.img, omr), lidas } });
      return true;
    }
    // QR lido, mas os 4 quadrados dos cantos não foram encontrados
    setUltimaFolha(folha);
    if (quadro.fonte === 'foto') {
      aviso('Não encontrei os 4 quadrados pretos dos cantos. Fotografe a folha inteira, de cima, ou marque as respostas manualmente.', 'erro');
      return false;
    }
    tentativas.current++;
    if (tentativas.current % 6 === 1) aviso('Afaste o celular: a folha inteira, com os 4 quadrados pretos, precisa aparecer na tela.', 'info');
    return false;
  }

  return (
    <div className="corretor">
      <header className="corretor-topo">
        {tela.t !== 'inicio'
          ? <button className="btn-icone claro" aria-label="Voltar" onClick={() => setTela({ t: 'inicio' })}>←</button>
          : <span className="marca-icone" aria-hidden>✓</span>}
        <div className="corretor-titulo">
          <strong>Corretor</strong>
          <small>{k ? (k.local ? 'neste computador' : k.professor || 'pareado') : 'não pareado'}</small>
        </div>
        <a className="btn-icone claro" href="#/" aria-label="Abrir Estúdio" title="Abrir Estúdio">💻</a>
      </header>
      <main className="corretor-corpo">
        {tela.t === 'inicio' && <Inicio pareado={!!k} local={!!k?.local} ir={t => t.t === 'ler' ? lerFolha() : setTela(t)} />}
        {tela.t === 'inicio' && <small className="versao-app escura">versão {VERSAO}</small>}
        {tela.t === 'parear' && <LeitorQr aoLer={aoLerPareamento} dica="No computador, abra o Estúdio → Ajustes → Mostrar QR de pareamento, e aponte a câmera para ele." />}
        {tela.t === 'ler' && <LeitorQr aoLer={aoLerFolha}
          dica="Enquadre a folha de respostas inteira, de cima, com os 4 quadrados pretos dos cantos visíveis. A leitura é automática."
          extra={ultimaFolha && <div className="manual-leitor"><button className="btn" onClick={() => setTela({ t: 'corrigir', folha: ultimaFolha, c: correcaoVazia(ultimaFolha, dispositivo) })}>✏️ Marcar respostas manualmente</button></div>} />}
        {tela.t === 'corrigir' && <Corrigir key={tela.c.id} folha={tela.folha} inicial={tela.c} leitura={tela.leitura} aoSalvar={c => setTela({ t: 'resultado', folha: tela.folha, c })} />}
        {tela.t === 'resultado' && <TelaResultado folha={tela.folha} c={tela.c}
          proximo={lerFolha}
          manual={() => setTela({ t: 'corrigir', folha: tela.folha, c: correcaoVazia(tela.folha, dispositivo) })}
          editar={() => setTela({ t: 'corrigir', folha: tela.folha, c: tela.c })} />}
        {tela.t === 'lista' && k && <Lista local={k.local} abrir={async c => {
          const f = await lerConfig<DadosFolha>(chaveFolha(c.avaliacaoId, c.versao));
          if (f) setTela({ t: 'corrigir', folha: f, c }); else aviso('Gabarito desta folha não está neste aparelho; escaneie a folha novamente.', 'erro');
        }} />}
      </main>
    </div>
  );
}

function Inicio({ pareado, local, ir }: { pareado: boolean; local: boolean; ir: (t: Tela) => void }) {
  const stats = useLiveQuery(async () => {
    const todas = await db.correcoes.filter(c => c.origem === 'corretor').toArray();
    return { total: todas.length, pendentes: todas.filter(c => !c.enviadaEm).length, hoje: todas.filter(c => c.criadaEm > Date.now() - 86_400_000).length };
  }, []);

  if (!pareado) return (
    <div className="corretor-inicio">
      <div className="boas-vindas">
        <h1>Corrija provas pelo celular</h1>
        <p>Primeiro, pareie este aparelho com o Estúdio no seu computador. É feito uma única vez e permite ler o gabarito cifrado nas folhas.</p>
      </div>
      <button className="btn btn-primario btn-gigante" onClick={() => ir({ t: 'parear' })}>📷 Parear com o Estúdio</button>
      <ol className="passos">
        <li>No computador, abra o app e vá em <b>Ajustes</b>.</li>
        <li>Clique em <b>Mostrar QR de pareamento</b>.</li>
        <li>Toque no botão acima e aponte a câmera para o QR.</li>
      </ol>
    </div>
  );

  return (
    <div className="corretor-inicio">
      <button className="btn btn-primario btn-gigante" onClick={() => ir({ t: 'ler' })}>📷 Escanear folha</button>
      <div className="cartoes-resumo">
        <button onClick={() => ir({ t: 'lista' })}><b>{stats?.hoje ?? 0}</b><span>corrigidas nas últimas 24 h</span></button>
        <button onClick={() => ir({ t: 'lista' })} className={stats?.pendentes && !local ? 'destaque' : ''}><b>{local ? stats?.total ?? 0 : stats?.pendentes ?? 0}</b><span>{local ? 'no total' : 'a enviar ao PC'}</span></button>
      </div>
      <button className="btn btn-grande" onClick={() => ir({ t: 'lista' })}>{local ? 'Ver correções' : '📤 Enviar resultados ao PC'}</button>
      {!local && <button className="link discreto" onClick={() => { if (confirm('Parear com outro Estúdio? Folhas da chave atual deixarão de ser lidas.')) ir({ t: 'parear' }); }}>Parear novamente</button>}
    </div>
  );
}

function Corrigir({ folha, inicial, leitura, aoSalvar }: { folha: DadosFolha; inicial: Correcao; leitura?: Leitura; aoSalvar: (c: Correcao) => void }) {
  const [c, setC] = useState(inicial);
  const [verFoto, setVerFoto] = useState(false);
  const nDuvidas = leitura?.duvidas.filter(Boolean).length ?? 0;
  const r = corrigir(folha.itens, c.respostas, c.notasDisc);
  const objetivas = folha.itens.filter(i => i.tipo !== 'disc').length;
  const marcadas = c.respostas.filter((x, i) => x !== null && folha.itens[i].tipo !== 'disc').length;
  const nomes = useLiveQuery(() => db.correcoes.where('avaliacaoId').equals(folha.avaliacaoId).toArray(), [folha.avaliacaoId]);
  const sugestoes = useMemo(() => [...new Set((nomes ?? []).map(x => x.aluno))], [nomes]);

  async function salvar() {
    if (!c.aluno.trim()) { aviso('Informe o nome do aluno.', 'erro'); return; }
    const dup = (nomes ?? []).find(x => x.id !== c.id && x.aluno.trim().toLowerCase() === c.aluno.trim().toLowerCase());
    if (dup && !confirm(`Já existe uma correção de ${dup.aluno} nesta prova. Salvar mesmo assim (ficarão duas)?`)) return;
    if (marcadas < objetivas && !confirm(`${objetivas - marcadas} questão(ões) objetiva(s) sem resposta marcada contarão como erradas. Salvar?`)) return;
    const final = { ...c, aluno: c.aluno.trim(), matricula: c.matricula.trim(), atualizadaEm: Date.now(), enviadaEm: undefined };
    await db.correcoes.put(final);
    navigator.vibrate?.([40, 40, 40]);
    aoSalvar(final);
  }

  return (
    <div className="corrigir">
      <div className="faixa-prova">
        <span className="versao-selo pequeno">{folha.versao}</span>
        <div><strong>{folha.titulo}</strong><small>{folha.codigo} · {folha.itens.length} questões · {fmtNum(r.max, 2)} pts</small></div>
      </div>
      <div className="campos-aluno-m">
        <input className="campo" placeholder="Nome do aluno" value={c.aluno} list="sug-alunos" autoComplete="off" onChange={e => setC({ ...c, aluno: e.target.value })} />
        <datalist id="sug-alunos">{sugestoes.map(n => <option key={n} value={n} />)}</datalist>
        <input className="campo" placeholder="Matrícula (opcional)" inputMode="numeric" value={c.matricula} onChange={e => setC({ ...c, matricula: e.target.value })} />
      </div>
      {leitura && (
        <div className={`leitura-auto ${nDuvidas ? 'com-duvida' : ''}`}>
          <span>📷 Leitura automática: <b>{leitura.lidas}</b> de {objetivas} objetivas reconhecidas.{' '}
            {nDuvidas ? <b>Confira as {nDuvidas} destacadas em amarelo.</b> : 'Confira rapidamente antes de salvar.'}</span>
          <button className="link" onClick={() => setVerFoto(v => !v)}>{verFoto ? 'Ocultar foto' : 'Ver foto com a leitura'}</button>
          {verFoto && <img src={leitura.previa} alt="Folha fotografada com as marcações reconhecidas" />}
        </div>
      )}
      <div className="progresso"><span style={{ width: `${objetivas ? (marcadas / objetivas) * 100 : 100}%` }} /></div>
      <p className="progresso-txt">{marcadas} de {objetivas} objetivas marcadas{r.discPendentes ? ` · ${r.discPendentes} discursiva(s) sem nota (pode lançar depois)` : ''}</p>
      <FolhaRespostas itens={folha.itens} respostas={c.respostas} notasDisc={c.notasDisc} destacar={leitura?.duvidas}
        aoMarcar={(pos, x: Resposta) => setC({ ...c, respostas: c.respostas.map((y, i) => i === pos ? x : y) })}
        aoNotaDisc={(pos, n) => setC({ ...c, notasDisc: c.notasDisc.map((y, i) => i === pos ? n : y) })} />
      <div className="barra-fixa">
        <span>Nota parcial <b>{fmtNum(r.total, 2)}</b></span>
        <button className="btn btn-primario btn-grande" onClick={salvar}>Corrigir e salvar</button>
      </div>
    </div>
  );
}

function TelaResultado({ folha, c, proximo, manual, editar }: { folha: DadosFolha; c: Correcao; proximo: () => void; manual: () => void; editar: () => void }) {
  const r = corrigir(folha.itens, c.respostas, c.notasDisc);
  const nivel = r.percentual >= 70 ? 'alto' : r.percentual >= 50 ? 'medio' : 'baixo';
  return (
    <div className="tela-resultado">
      <div className={`placar ${nivel}`}>
        <span className="placar-nota">{fmtNum(r.total, 2)}</span>
        <span className="placar-de">de {fmtNum(r.max, 2)} · {fmtNum(r.percentual)}%</span>
        <strong>{c.aluno}</strong>
        <small>{r.acertos} de {r.nObjetivas} objetivas{r.maxDiscursiva ? ` · discursiva ${fmtNum(r.discursiva, 2)}/${fmtNum(r.maxDiscursiva, 2)}` : ''}{r.discPendentes ? ' (pendente)' : ''}</small>
      </div>
      <div className="mini-conferencia">
        {r.itens.map(i => (
          <span key={i.pos} className={i.tipo === 'disc' ? (i.pontos === null ? 'pend' : 'disc') : i.acertou ? 'ok' : 'erro'} title={`Q${i.pos + 1}`}>
            <small>{i.pos + 1}</small>{i.tipo === 'disc' ? (i.pontos === null ? '…' : fmtNum(i.pontos, 1)) : i.marcada ?? '–'}
            {i.tipo !== 'disc' && !i.acertou && <em>{i.correta}</em>}
          </span>
        ))}
      </div>
      <button className="btn btn-primario btn-gigante" onClick={proximo}>📷 Próxima folha</button>
      <button className="btn btn-grande" onClick={manual}>✏️ Próximo aluno manualmente · versão {folha.versao}</button>
      <button className="link discreto" onClick={editar}>Corrigir algo nesta folha</button>
    </div>
  );
}

function Lista({ local, abrir }: { local: boolean; abrir: (c: Correcao) => void }) {
  const lista = useLiveQuery(() => db.correcoes.orderBy('criadaEm').reverse().filter(c => c.origem === 'corretor').toArray(), []);
  const [enviando, setEnviando] = useState(false);
  if (!lista) return null;
  const pendentes = lista.filter(c => !c.enviadaEm);

  async function enviar(todas: boolean) {
    const sel = todas ? lista! : pendentes;
    if (!sel.length) { aviso('Nada para enviar.', 'info'); return; }
    setEnviando(true);
    try {
      const k = (await chaveDoCorretor())!;
      const disp = await nomeDispositivo();
      const pac = await montarPacote(k.chave, k.idChave, disp, sel);
      const nome = `resultados_${disp}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
      const arq = new File([JSON.stringify(pac)], nome, { type: 'application/json' });
      let ok = false;
      if (navigator.canShare?.({ files: [arq] })) {
        try { await navigator.share({ files: [arq], title: 'Resultados do Corretor', text: `${sel.length} correção(ões)` }); ok = true; }
        catch (e) { if ((e as DOMException).name === 'AbortError') { setEnviando(false); return; } }
      }
      if (!ok) baixar(arq, nome);
      const agora = Date.now();
      await db.correcoes.bulkPut(sel.map(c => ({ ...c, enviadaEm: agora })));
      aviso(`Pacote com ${sel.length} correção(ões) gerado. No PC: Resultados → Importar do celular.`);
    } catch (e) { aviso((e as Error).message, 'erro'); }
    setEnviando(false);
  }

  const grupos = new Map<string, Correcao[]>();
  for (const c of lista) grupos.set(c.codigo, [...(grupos.get(c.codigo) ?? []), c]);

  return (
    <div className="lista-m">
      {local ? (
        <p className="info-m">Este aparelho é o próprio Estúdio: as correções já aparecem em <a href="#/">Avaliações → Resultados</a>.</p>
      ) : (
        <div className="envio">
          <p>O pacote é cifrado com sua chave. Envie-o para o PC como preferir (e-mail, WhatsApp, Drive, cabo) e importe em <b>Resultados → Importar do celular</b>.</p>
          <button className="btn btn-primario btn-grande" disabled={enviando || !pendentes.length} onClick={() => enviar(false)}>📤 Enviar {pendentes.length} pendente(s)</button>
          {lista.length > pendentes.length && <button className="link discreto" onClick={() => enviar(true)}>Reenviar todas ({lista.length})</button>}
        </div>
      )}
      {lista.length === 0 && <p className="info-m">Nenhuma correção feita neste aparelho ainda.</p>}
      {[...grupos].map(([cod, cs]) => (
        <section key={cod} className="grupo-m">
          <h3>{cod} <small>{cs.length} folha(s)</small></h3>
          {cs.map(c => (
            <button key={c.id} className="item-m" onClick={() => abrir(c)}>
              <span><b>{c.aluno}</b><small>Versão {c.versao} · {fmtData(c.atualizadaEm)}</small></span>
              <span className={`selo-envio ${c.enviadaEm || local ? 'ok' : ''}`}>{local ? '' : c.enviadaEm ? 'enviada' : 'a enviar'}</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
