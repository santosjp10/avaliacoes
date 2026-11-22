import { useEffect, useState } from 'react';
import type { Questao } from '../core/types';
import { leitura, urlContribuicao } from '../core/compartilhado';
import { REPO_BANCO } from '../config';
import { Modal, aviso } from '../ui/base';
import { chaveDoEstudio, gravarConfig, lerConfig } from '../data/db';

interface Autoria { autor: string; instituicao: string }

/** Envia uma questão do banco local para o Banco Aberto (formulário do GitHub já preenchido). */
export function Contribuir({ q, aoFechar }: { q: Questao; aoFechar: () => void }) {
  const [a, setA] = useState<Autoria>({ autor: '', instituicao: '' });
  const [fonte, setFonte] = useState('');
  useEffect(() => {
    (async () => {
      const salvo = await lerConfig<Autoria>('autoriaBanco');
      setA(salvo ?? { autor: (await chaveDoEstudio()).professor, instituicao: '' });
    })();
  }, []);

  async function enviar() {
    if (!a.autor.trim()) { aviso('Informe o nome do(a) autor(a).', 'erro'); return; }
    await gravarConfig('autoriaBanco', a);
    const { url, resumido } = urlContribuicao(REPO_BANCO, q, { autor: a.autor.trim(), instituicao: a.instituicao.trim(), fonte: fonte.trim() });
    window.open(url, '_blank', 'noopener');
    if (resumido) aviso('Questão longa: a versão para leitura foi omitida do formulário, mas os dados completos foram enviados.', 'info');
    aoFechar();
  }

  return (
    <Modal titulo="Contribuir com o Banco Aberto" aoFechar={aoFechar} largo
      rodape={<><button className="btn" onClick={aoFechar}>Cancelar</button><button className="btn btn-primario" onClick={enviar}>Abrir formulário no GitHub ↗</button></>}>
      <p>Sua questão será revisada pela curadoria e, se aprovada, ficará disponível para professores de outras turmas e instituições, com crédito a você, sob a licença <b>CC BY 4.0</b>. Para enviar é preciso uma conta gratuita no GitHub.</p>
      <div className="grade-2">
        <label className="rotulo">Autor(a)<input className="campo" value={a.autor} onChange={e => setA({ ...a, autor: e.target.value })} placeholder="Nome para o crédito" /></label>
        <label className="rotulo">Instituição (opcional)<input className="campo" value={a.instituicao} onChange={e => setA({ ...a, instituicao: e.target.value })} placeholder="Universidade, curso" /></label>
      </div>
      <label className="rotulo">Fonte, se a questão foi adaptada (prova, concurso, livro)
        <input className="campo" value={fonte} onChange={e => setFonte(e.target.value)} placeholder="Ex.: adaptada de Cebraspe – Embrapa 2024, item 97" />
      </label>
      <details className="previa-contrib">
        <summary>Como a questão será enviada</summary>
        <pre>{leitura(q)}</pre>
      </details>
      {q.imagens.length > 0 && <p className="alerta-texto">Esta questão tem {q.imagens.length} imagem(ns): no formulário do GitHub, arraste o(s) arquivo(s) para o campo “Imagens”.</p>}
      <p className="dica">Envie apenas questões de sua autoria ou adaptadas com a fonte citada — nunca cópia literal de material de terceiros. Lembre-se: no banco aberto, o gabarito fica visível para todos.</p>
    </Modal>
  );
}
