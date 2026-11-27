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
import { abrirEmail, abrirWhatsApp, compartilharArquivo, compartilharTexto, csvResumo, textoAluno, textoResumo, type LinhaResumo } from './envio';
import { paraCSV } from '../core/csv';

type Tela =
  | { t: 'inicio' }
  | { t: 'parear' }
  | { t: 'ler' }
  | { t: 'corrigir'; folha: DadosFolha; c: Correcao; leitura?: Leitura }
  | { t: 'resultado'; folha: DadosFolha; c: Correcao; auto?: boolean }
  | { t: 'lista' };

interface Leitura { duvidas: boolean[]; previa: string; lidas: number }

const chaveFolha = (avaliacaoId: string, versao: string) => `folha:${avaliacaoId}:${versao}`;

const mesmoAluno = (a: Correcao, b: { aluno: string; matricula: string }) =>
  a.matricula && b.matricula ? a.matricula.trim() === b.matricula.trim() : a.aluno.trim().toLowerCase() === b.aluno.trim().toLowerCase();

async function correcaoExistente(avaliacaoId: string, c: { id: string; aluno: string; matricula: string }) {
  return (await db.correcoes.where('avaliacaoId').equals(avaliacaoId).toArray()).find(x => x.id !== c.id && mesmoAluno(x, c));
}

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
  const ultimoQrSalvo = useRef('');
  const salvarDireto = useLiveQuery(() => lerConfig<boolean>('salvarDireto'), []) ?? false;
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
    // mesma folha que acabou de ser salva ainda diante da câmera: espera a próxima
    if (txt === ultimoQrSalvo.current && quadro.fonte === 'camera') return false;
    const folha = r.dados;
    const { aluno: _a, ...folhaSemAluno } = folha;
    await gravarConfig(chaveFolha(folha.avaliacaoId, folha.versao), folhaSemAluno);
    const omr = lerFolhaOMR(quadro.img, folha.itens, quadro.qr, folha.layout ?? 1);
    if (omr.ok) {
      const c = correcaoVazia(folha, dispositivo);
      c.respostas = omr.respostas;
      if (folha.aluno) { c.aluno = folha.aluno.nome; c.matricula = folha.aluno.matricula; }
      const lidas = omr.respostas.filter((x, i) => x !== null && folha.itens[i].tipo !== 'disc').length;
      const semDuvida = !omr.duvidas.some(Boolean);
      // folha personalizada, leitura limpa e aluno ainda não corrigido: salva direto (se o professor ativou)
      if (salvarDireto && folha.aluno && semDuvida && !(await correcaoExistente(folha.avaliacaoId, c))) {
        await db.correcoes.put(c);
        ultimoQrSalvo.current = txt;
        navigator.vibrate?.([40, 40, 40]);
        setTela({ t: 'resultado', folha, c, auto: true });
        return true;
      }
      setTela({ t: 'corrigir', folha, c, leitura: { duvidas: omr.duvidas, previa: desenharLeitura(quadro.img, omr), lidas } });
      return true;
    }
    // QR lido, mas os 4 quadrados dos cantos não foram encontrados
    setUltimaFolha(folha);
    if (quadro.fonte === 'foto') {
      aviso('Não encontrei os 4 quadrados pretos em volta das bolhas. Fotografe de cima, com os 4 visíveis, ou marque as respostas manualmente.', 'erro');
      return false;
    }
    tentativas.current++;
    if (tentativas.current % 6 === 1) aviso('Os 4 quadrados pretos em volta das bolhas precisam aparecer na tela. Ajuste a distância.', 'info');
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
        {tela.t === 'inicio' && <Inicio pareado={!!k} local={!!k?.local} salvarDireto={salvarDireto} ir={t => t.t === 'ler' ? lerFolha() : setTela(t)} />}
        {tela.t === 'inicio' && <small className="versao-app escura">versão {VERSAO}</small>}
        {tela.t === 'parear' && <LeitorQr aoLer={aoLerPareamento} dica="No computador, abra o Estúdio → Ajustes → Mostrar QR de pareamento, e aponte a câmera para ele." />}
        {tela.t === 'ler' && <LeitorQr aoLer={aoLerFolha}
          dica="Enquadre a área de leitura — o QR e as bolhas, com os 4 quadrados pretos visíveis. Pode aproximar o celular. A leitura é automática."
          extra={ultimaFolha && <div className="manual-leitor"><button className="btn" onClick={() => setTela({ t: 'corrigir', folha: ultimaFolha, c: correcaoVazia(ultimaFolha, dispositivo) })}>✏️ Marcar respostas manualmente</button></div>} />}
        {tela.t === 'corrigir' && <Corrigir key={tela.c.id} folha={tela.folha} inicial={tela.c} leitura={tela.leitura} aoSalvar={c => setTela({ t: 'resultado', folha: tela.folha, c })} />}
        {tela.t === 'resultado' && <TelaResultado folha={tela.folha} c={tela.c} auto={tela.auto}
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

function Inicio({ pareado, local, ir, salvarDireto }: { pareado: boolean; local: boolean; ir: (t: Tela) => void; salvarDireto: boolean }) {
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
      <button className="btn btn-grande" onClick={() => ir({ t: 'lista' })}>{local ? '📋 Correções e envio' : '📤 Enviar resultados'}</button>
      <label className="check opcao-m">
        <input type="checkbox" checked={salvarDireto} onChange={e => gravarConfig('salvarDireto', e.target.checked)} />
        <span>Modo rápido: em folhas <b>personalizadas</b>, salvar direto quando a leitura não tiver dúvidas</span>
      </label>
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
    const dup = (nomes ?? []).find(x => x.id !== c.id && mesmoAluno(x, c));
    if (dup) {
      const escolha = confirm(`Já existe uma correção de ${dup.aluno} nesta prova.\n\nOK = substituir a anterior por esta\nCancelar = voltar sem salvar`);
      if (!escolha) return;
      await db.correcoes.delete(dup.id);
    }
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
      {folha.aluno && <p className="aluno-identificado">👤 Aluno identificado pela folha personalizada</p>}
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

function TelaResultado({ folha, c, proximo, manual, editar, auto }: { folha: DadosFolha; c: Correcao; proximo: () => void; manual: () => void; editar: () => void; auto?: boolean }) {
  const r = corrigir(folha.itens, c.respostas, c.notasDisc);
  const nivel = r.percentual >= 70 ? 'alto' : r.percentual >= 50 ? 'medio' : 'baixo';
  return (
    <div className="tela-resultado">
      {auto && <p className="aluno-identificado">⚡ Salvo automaticamente (folha personalizada, leitura sem dúvidas)</p>}
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
      <button className="btn btn-grande" onClick={() => compartilharTexto(textoAluno(folha, c, r), `Resultado — ${c.aluno}`)}>📲 Enviar resultado ao aluno</button>
      <button className="link discreto" onClick={editar}>Corrigir algo nesta folha</button>
    </div>
  );
}

function Lista({ local, abrir }: { local: boolean; abrir: (c: Correcao) => void }) {
  const dados = useLiveQuery(async () => {
    const lista = await db.correcoes.orderBy('criadaEm').reverse().filter(c => c.origem === 'corretor').toArray();
    // calcula as notas com o gabarito guardado da folha (lido do QR)
    const folhas = new Map<string, DadosFolha | undefined>();
    const linhas: (LinhaResumo & { folha?: DadosFolha })[] = [];
    for (const c of lista) {
      const k = chaveFolha(c.avaliacaoId, c.versao);
      if (!folhas.has(k)) folhas.set(k, await lerConfig<DadosFolha>(k));
      const f = folhas.get(k);
      linhas.push({ c, folha: f, r: f ? corrigir(f.itens, c.respostas, c.notasDisc) : corrigir([], [], []) });
    }
    return { lista, linhas };
  }, []);
  const [enviando, setEnviando] = useState(false);
  if (!dados) return null;
  const { lista, linhas } = dados;
  const pendentes = lista.filter(c => !c.enviadaEm);

  async function enviarPacote(todas: boolean) {
    const sel = todas ? lista : pendentes;
    if (!sel.length) { aviso('Nada para enviar.', 'info'); return; }
    setEnviando(true);
    try {
      const k = (await chaveDoCorretor())!;
      const disp = await nomeDispositivo();
      const pac = await montarPacote(k.chave, k.idChave, disp, sel);
      // .txt/text/plain: o Android permite anexar no WhatsApp e no e-mail (JSON não)
      const nome = `resultados_${disp}_${new Date().toLocaleString('sv-SE').slice(0, 16).replace(/[: ]/g, '-')}.txt`;
      const d = await compartilharArquivo(JSON.stringify(pac), nome, 'text/plain', 'Resultados do Corretor', `Pacote cifrado com ${sel.length} correção(ões). No PC: Resultados → Importar do celular.`);
      if (d === 'cancelado') { setEnviando(false); return; }
      const agora = Date.now();
      await db.correcoes.bulkPut(sel.map(c => ({ ...c, enviadaEm: agora })));
      aviso(d === 'baixado' ? `Pacote salvo nos downloads (${sel.length} correções). Envie o arquivo ao PC e importe em Resultados.` : `Pacote com ${sel.length} correção(ões) enviado.`);
    } catch (e) { aviso((e as Error).message, 'erro'); }
    setEnviando(false);
  }

  const grupos = new Map<string, typeof linhas>();
  for (const l of linhas) grupos.set(l.c.codigo, [...(grupos.get(l.c.codigo) ?? []), l]);

  return (
    <div className="lista-m">
      {local ? (
        <p className="info-m">Este aparelho é o próprio Estúdio: as correções já aparecem em <a href="#/">Avaliações → Resultados</a>.</p>
      ) : (
        <div className="envio">
          <h3>Enviar ao Estúdio (PC)</h3>
          <p>Gera um arquivo cifrado com sua chave. Toque no botão e escolha <b>WhatsApp</b> (mande para você mesmo), <b>e-mail</b> ou Drive. No PC, abra o arquivo em <b>Resultados → Importar do celular</b>.</p>
          <button className="btn btn-primario btn-grande" disabled={enviando || !pendentes.length} onClick={() => enviarPacote(false)}>📤 Enviar {pendentes.length} pendente(s) ao PC</button>
          {lista.length > pendentes.length && <button className="link discreto" onClick={() => enviarPacote(true)}>Reenviar todas ({lista.length})</button>}
        </div>
      )}
      {lista.length === 0 && <p className="info-m">Nenhuma correção feita neste aparelho ainda.</p>}
      {[...grupos].map(([cod, ls]) => {
        const validas = ls.filter(l => l.folha);
        return (
          <section key={cod} className="grupo-m">
            <h3>{cod} <small>{ls.length} folha(s)</small></h3>
            {validas.length > 0 && (
              <div className="envio-resumo">
                <span>Lista de notas:</span>
                <button className="btn btn-sm" onClick={() => abrirWhatsApp(textoResumo(cod, validas))}>💬 WhatsApp</button>
                <button className="btn btn-sm" onClick={() => abrirEmail(`Resultados — ${cod}`, textoResumo(cod, validas))}>✉️ E-mail</button>
                <button className="btn btn-sm" onClick={() => compartilharArquivo(paraCSV(csvResumo(validas)), `notas_${cod}.csv`, 'text/csv', `Notas — ${cod}`, `Notas da avaliação ${cod}`)}>📄 Planilha</button>
              </div>
            )}
            {ls.map(({ c, r, folha }) => (
              <div key={c.id} className="item-m">
                <button className="item-m-corpo" onClick={() => abrir(c)}>
                  <b>{c.aluno}</b><small>Versão {c.versao} · {folha ? `${fmtNum(r.total, 2)}/${fmtNum(r.max, 2)}` : ''} · {fmtData(c.atualizadaEm)}</small>
                </button>
                {folha && <button className="btn-icone" aria-label={`Enviar resultado a ${c.aluno}`} title="Enviar resultado ao aluno" onClick={() => compartilharTexto(textoAluno(folha, c, r), `Resultado — ${c.aluno}`)}>📲</button>}
                <span className={`selo-envio ${c.enviadaEm || local ? 'ok' : ''}`}>{local ? '' : c.enviadaEm ? 'enviada' : 'a enviar'}</span>
              </div>
            ))}
          </section>
        );
      })}
      <p className="dica-m">Resumos e mensagens contêm nomes e notas de alunos (dados pessoais): envie apenas a quem deve recebê-los.</p>
    </div>
  );
}
