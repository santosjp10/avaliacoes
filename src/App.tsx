import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Avisos, useRota } from './ui/base';
import { db, lerConfig } from './data/db';
import { Banco } from './studio/Banco';
import { Avaliacoes } from './studio/Avaliacoes';
import { AvaliacaoEditor } from './studio/AvaliacaoEditor';
import { Resultados } from './studio/Resultados';
import { Imprimir } from './studio/Imprimir';
import { Ajustes } from './studio/Ajustes';
import { Corretor } from './corretor/Corretor';
import { Compartilhado } from './studio/Compartilhado';
import { AvisoAtualizacao, VERSAO } from './ui/Atualizacao';

export function App() {
  const { partes } = useRota();
  const [p0, p1, p2] = partes;

  if (p0 === 'imprimir' && p1) return <><Imprimir id={p1} /><Avisos /></>;
  if (p0 === 'corretor') return <><AvisoAtualizacao /><Corretor /><Avisos /></>;

  let pagina: ReactNode;
  let titulo = 'Avaliações';
  if (p0 === 'questoes') { pagina = <Banco />; titulo = 'Banco de questões'; }
  else if (p0 === 'compartilhado') { pagina = <Compartilhado />; titulo = 'Banco compartilhado'; }
  else if (p0 === 'avaliacoes' && p1 && p2 === 'resultados') { pagina = <Resultados id={p1} />; titulo = 'Resultados'; }
  else if (p0 === 'avaliacoes' && p1) { pagina = <AvaliacaoEditor id={p1} />; titulo = 'Avaliação'; }
  else if (p0 === 'ajustes') { pagina = <Ajustes />; titulo = 'Ajustes e backup'; }
  else pagina = <Avaliacoes />;

  const secao = p0 === 'questoes' ? 'questoes' : p0 === 'compartilhado' ? 'compartilhado' : p0 === 'ajustes' ? 'ajustes' : 'avaliacoes';
  return (
    <div className="estudio">
      <aside className="lateral">
        <a className="marca" href="#/">
          <span className="marca-icone" aria-hidden>✓</span>
          <span><strong>Avaliações</strong><small>Estúdio</small></span>
        </a>
        <nav className="menu">
          <a className={secao === 'avaliacoes' ? 'ativo' : ''} href="#/"><span aria-hidden>📝</span> Avaliações</a>
          <a className={secao === 'questoes' ? 'ativo' : ''} href="#/questoes"><span aria-hidden>📚</span> Banco de questões</a>
          <a className={secao === 'compartilhado' ? 'ativo' : ''} href="#/compartilhado"><span aria-hidden>🌐</span> Banco compartilhado</a>
          <a className={secao === 'ajustes' ? 'ativo' : ''} href="#/ajustes"><span aria-hidden>⚙️</span> Ajustes e backup</a>
          <div className="menu-sep" />
          <a href="#/corretor"><span aria-hidden>📷</span> Abrir Corretor</a>
        </nav>
        <LembreteBackup />
        <small className="versao-app">versão {VERSAO}</small>
      </aside>
      <main className="principal">
        <AvisoAtualizacao />
        <header className="topo"><h1>{titulo}</h1></header>
        <div className="conteudo">{pagina}</div>
      </main>
      <Avisos />
    </div>
  );
}

function LembreteBackup() {
  const info = useLiveQuery(async () => {
    const n = (await db.correcoes.count()) + (await db.questoes.count());
    const ultimo = await lerConfig<number>('ultimoBackup');
    return { n, ultimo };
  });
  if (!info || info.n === 0) return null;
  const dias = info.ultimo ? Math.floor((Date.now() - info.ultimo) / 86_400_000) : null;
  if (dias !== null && dias < 7) return <div className="lembrete ok">Backup em dia</div>;
  return (
    <a className="lembrete" href="#/ajustes">
      {dias === null ? 'Nenhum backup feito ainda.' : `Último backup há ${dias} dias.`} <u>Fazer agora</u>
    </a>
  );
}
