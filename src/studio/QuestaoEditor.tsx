import { useState } from 'react';
import type { Nivel, Questao, TipoQuestao } from '../core/types';
import { LETRAS, novoId } from '../core/util';
import { Modal, aviso, escolherArquivo, prepararImagem } from '../ui/base';
import { db } from '../data/db';

export function questaoNova(disciplina = ''): Questao {
  const agora = Date.now();
  const alternativas = [0, 1, 2, 3].map(() => ({ id: novoId(), texto: '' }));
  return {
    id: novoId(), tipo: 'me', enunciado: '', alternativas, correta: alternativas[0].id,
    disciplina, assunto: '', nivel: 'Médio', imagens: [], linhas: 8, criterio: '', criadaEm: agora, atualizadaEm: agora,
  };
}

const TIPOS: { v: TipoQuestao; r: string }[] = [
  { v: 'me', r: 'Múltipla escolha' }, { v: 'vf', r: 'Verdadeiro / Falso' }, { v: 'disc', r: 'Discursiva' },
];

export function QuestaoEditor({ inicial, disciplinas, aoFechar }: { inicial: Questao; disciplinas: string[]; aoFechar: (salva?: Questao) => void }) {
  const [q, setQ] = useState<Questao>(inicial);
  const set = (p: Partial<Questao>) => setQ(x => ({ ...x, ...p }));

  function mudarTipo(tipo: TipoQuestao) {
    if (tipo === q.tipo) return;
    if (tipo === 'me') {
      const alternativas = q.alternativas.length >= 2 ? q.alternativas : [0, 1, 2, 3].map(() => ({ id: novoId(), texto: '' }));
      set({ tipo, alternativas, correta: alternativas[0].id });
    } else set({ tipo, correta: tipo === 'vf' ? 'V' : null });
  }

  async function addImagem() {
    const f = await escolherArquivo('image/*');
    if (!f) return;
    try { set({ imagens: [...q.imagens, { src: await prepararImagem(f), pos: 'abaixo' }] }); }
    catch (e) { aviso((e as Error).message, 'erro'); }
  }

  async function salvar() {
    const erros: string[] = [];
    if (!q.enunciado.trim()) erros.push('Escreva o enunciado.');
    if (!q.disciplina.trim()) erros.push('Informe a disciplina.');
    let final = { ...q, enunciado: q.enunciado.trim(), disciplina: q.disciplina.trim(), assunto: q.assunto.trim(), atualizadaEm: Date.now() };
    if (q.tipo === 'me') {
      const alts = q.alternativas.filter(a => a.texto.trim());
      if (alts.length < 2) erros.push('Preencha ao menos 2 alternativas.');
      if (!alts.some(a => a.id === q.correta)) erros.push('Marque qual alternativa é a correta (e preencha seu texto).');
      final = { ...final, alternativas: alts.map(a => ({ ...a, texto: a.texto.trim() })) };
    } else final = { ...final, alternativas: [] };
    if (erros.length) { aviso(erros[0], 'erro'); return; }
    await db.questoes.put(final);
    aviso('Questão salva.');
    aoFechar(final);
  }

  return (
    <Modal titulo={inicial.enunciado ? 'Editar questão' : 'Nova questão'} aoFechar={() => aoFechar()} largo
      rodape={<><button className="btn" onClick={() => aoFechar()}>Cancelar</button><button className="btn btn-primario" onClick={salvar}>Salvar questão</button></>}>
      <div className="segmentos" role="tablist">
        {TIPOS.map(t => <button key={t.v} role="tab" aria-selected={q.tipo === t.v} className={q.tipo === t.v ? 'ativo' : ''} onClick={() => mudarTipo(t.v)}>{t.r}</button>)}
      </div>

      <div className="grade-3">
        <label className="rotulo">Disciplina
          <input className="campo" list="lista-disc" value={q.disciplina} onChange={e => set({ disciplina: e.target.value })} placeholder="Ex.: Sensoriamento Remoto" />
          <datalist id="lista-disc">{disciplinas.map(d => <option key={d} value={d} />)}</datalist>
        </label>
        <label className="rotulo">Assunto
          <input className="campo" value={q.assunto} onChange={e => set({ assunto: e.target.value })} placeholder="Ex.: Índices de vegetação" />
        </label>
        <label className="rotulo">Nível
          <select className="campo" value={q.nivel} onChange={e => set({ nivel: e.target.value as Nivel })}>
            <option>Fácil</option><option>Médio</option><option>Difícil</option>
          </select>
        </label>
      </div>

      <label className="rotulo">{q.tipo === 'vf' ? 'Afirmação' : 'Enunciado'}
        <textarea className="campo" rows={4} value={q.enunciado} onChange={e => set({ enunciado: e.target.value })} autoFocus />
      </label>

      <div className="imagens-editor">
        {q.imagens.map((img, i) => (
          <figure key={i} className="img-item">
            <img src={img.src} alt={`Imagem ${i + 1}`} />
            <figcaption>
              <select className="campo campo-sm" value={img.pos} aria-label="Posição da imagem"
                onChange={e => set({ imagens: q.imagens.map((x, j) => j === i ? { ...x, pos: e.target.value as typeof x.pos } : x) })}>
                <option value="acima">Acima do texto</option><option value="abaixo">Abaixo do texto</option><option value="direita">À direita</option>
              </select>
              <button className="btn btn-sm btn-perigo" onClick={() => set({ imagens: q.imagens.filter((_, j) => j !== i) })}>Remover</button>
            </figcaption>
          </figure>
        ))}
        <button className="btn btn-sm" onClick={addImagem}>🖼 Adicionar imagem</button>
      </div>

      {q.tipo === 'me' && (
        <fieldset className="bloco">
          <legend>Alternativas <small>— clique na letra para marcar a correta</small></legend>
          {q.alternativas.map((a, i) => (
            <div key={a.id} className="alt-editor">
              <button type="button" className={`bolha ${q.correta === a.id ? 'marcada certa-bolha' : ''}`} aria-label={`Marcar ${LETRAS[i]} como correta`} aria-pressed={q.correta === a.id} onClick={() => set({ correta: a.id })}>{LETRAS[i]}</button>
              <input className="campo" value={a.texto} placeholder={`Alternativa ${LETRAS[i]}`}
                onChange={e => set({ alternativas: q.alternativas.map(x => x.id === a.id ? { ...x, texto: e.target.value } : x) })} />
              {q.alternativas.length > 2 && (
                <button className="btn-icone" aria-label="Remover alternativa" onClick={() => {
                  const alternativas = q.alternativas.filter(x => x.id !== a.id);
                  set({ alternativas, correta: q.correta === a.id ? alternativas[0].id : q.correta });
                }}>✕</button>
              )}
            </div>
          ))}
          {q.alternativas.length < LETRAS.length && (
            <button className="btn btn-sm" onClick={() => set({ alternativas: [...q.alternativas, { id: novoId(), texto: '' }] })}>+ Alternativa</button>
          )}
        </fieldset>
      )}

      {q.tipo === 'vf' && (
        <fieldset className="bloco">
          <legend>Resposta correta</legend>
          <div className="segmentos">
            <button className={q.correta === 'V' ? 'ativo' : ''} onClick={() => set({ correta: 'V' })}>✓ Verdadeira</button>
            <button className={q.correta === 'F' ? 'ativo' : ''} onClick={() => set({ correta: 'F' })}>✗ Falsa</button>
          </div>
        </fieldset>
      )}

      {q.tipo === 'disc' && (
        <label className="rotulo">Linhas para resposta: <strong>{q.linhas}</strong>
          <input type="range" min={0} max={30} value={q.linhas} onChange={e => set({ linhas: Number(e.target.value) })} />
        </label>
      )}

      <label className="rotulo">{q.tipo === 'disc' ? 'Critérios de correção / resposta esperada' : 'Comentário ou fonte (opcional)'}
        <textarea className="campo" rows={2} value={q.criterio} onChange={e => set({ criterio: e.target.value })} />
      </label>
    </Modal>
  );
}
