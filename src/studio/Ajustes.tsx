import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, chaveDoEstudio, gravarConfig, lerConfig } from '../data/db';
import type { Pareamento } from '../core/payload';
import { qrPareamento } from '../core/payload';
import { aviso, escolherArquivo, useQr } from '../ui/base';
import { backupProtegido, baixar, gerarBackup, restaurarBackup } from '../data/backup';
import { fmtData } from '../core/util';

export function Ajustes() {
  const [chave, setChave] = useState<Pareamento | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const [senha, setSenha] = useState('');
  const [uso, setUso] = useState<string>('');
  const ultimo = useLiveQuery(() => lerConfig<number>('ultimoBackup'), []);
  const contagem = useLiveQuery(async () => ({ q: await db.questoes.count(), a: await db.avaliacoes.count(), c: await db.correcoes.count() }), []);

  useEffect(() => { chaveDoEstudio().then(setChave); }, []);
  useEffect(() => {
    navigator.storage?.estimate?.().then(e => {
      if (e.usage != null) setUso(`${(e.usage / 1048576).toFixed(1)} MB usados${e.quota ? ` de ${(e.quota / 1073741824).toFixed(1)} GB disponíveis` : ''}`);
    });
  }, [contagem]);

  const qr = useQr(mostrar && chave ? qrPareamento(chave) : null, 'M');

  async function salvarNome(professor: string) {
    if (!chave) return;
    const n = { ...chave, professor };
    setChave(n);
    await gravarConfig('chaveEstudio', n);
  }

  async function fazerBackup() {
    const blob = await gerarBackup(senha || undefined);
    const d = new Date().toLocaleDateString('sv-SE');
    baixar(blob, `avaliacoes_backup_${d}.json`);
    await gravarConfig('ultimoBackup', Date.now());
    aviso(senha ? 'Backup protegido por senha gerado.' : 'Backup gerado.');
  }

  async function restaurar() {
    const f = await escolherArquivo('.json,application/json');
    if (!f) return;
    try {
      const arq = JSON.parse(await f.text());
      let s: string | undefined;
      if (backupProtegido(arq)) { s = prompt('Senha do backup:') ?? undefined; if (!s) return; }
      if (!confirm('Restaurar substitui TODOS os dados deste aparelho pelos do backup. Continuar?')) return;
      await restaurarBackup(arq, s);
      aviso('Backup restaurado.');
      setTimeout(() => location.reload(), 600);
    } catch (e) { aviso((e as Error).message, 'erro'); }
  }

  return (
    <div className="ajustes">
      <section className="painel">
        <h2 className="titulo-painel">Parear o celular</h2>
        <p>O Corretor no celular precisa da sua <b>chave de professor</b> para ler o gabarito cifrado nas folhas. Faça isso <b>uma vez</b>: abra o app no celular, toque em <i>Parear com o Estúdio</i> e aponte para o QR abaixo.</p>
        <label className="rotulo">Seu nome (aparece no celular)
          <input className="campo" value={chave?.professor ?? ''} onChange={e => salvarNome(e.target.value)} placeholder="Prof. …" />
        </label>
        {!mostrar ? (
          <button className="btn btn-primario" onClick={() => setMostrar(true)}>Mostrar QR de pareamento</button>
        ) : (
          <div className="qr-pareamento">
            {qr && <img src={qr} alt="QR de pareamento" />}
            <div>
              <p className="alerta-texto">⚠ Este QR é a sua chave secreta: com ela é possível ler os gabaritos. Não o exiba para alunos nem o compartilhe.</p>
              <p className="dica">Identificador da chave: <code>{chave?.idChave}</code></p>
              <button className="btn" onClick={() => setMostrar(false)}>Ocultar</button>
            </div>
          </div>
        )}
      </section>

      <section className="painel">
        <h2 className="titulo-painel">Backup</h2>
        <p>Seus dados ficam <b>somente neste navegador</b>. Limpar os dados do navegador, trocar de computador ou um defeito no disco apagam tudo. Faça backup com frequência e guarde o arquivo em local seguro (pendrive, nuvem institucional).</p>
        <p className="dica">{contagem && `${contagem.q} questões · ${contagem.a} avaliações · ${contagem.c} correções.`} {uso && `· ${uso}.`} Último backup: {ultimo ? fmtData(ultimo) : 'nunca'}.</p>
        <div className="linha-imprimir">
          <label className="rotulo">Senha (opcional, recomendada)
            <input className="campo" type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" placeholder="protege nomes e notas dos alunos" />
          </label>
          <button className="btn btn-primario" onClick={fazerBackup}>⬇ Baixar backup completo</button>
          <button className="btn" onClick={restaurar}>⬆ Restaurar backup</button>
        </div>
        <p className="dica">O backup inclui a chave de professor; sem ela, folhas já impressas não podem ser lidas por um novo aparelho. Por isso, prefira proteger o arquivo com senha — e não esqueça a senha.</p>
      </section>

      <section className="painel">
        <h2 className="titulo-painel">Dados do sistema antigo</h2>
        <p>Para trazer as questões do ProvaSystem: no sistema antigo, vá em <i>Exportar → Exportar JSON</i>; depois, aqui, em <a href="#/questoes">Banco de questões → Importar do ProvaSystem</a>. Questões V/F e discursivas são convertidas com a resposta correta preservada.</p>
      </section>

      <section className="painel">
        <h2 className="titulo-painel">Privacidade</h2>
        <p className="dica">Nenhum dado é enviado a servidores: questões, notas e nomes de alunos ficam no aparelho. A troca entre celular e PC é feita por arquivo cifrado com a sua chave. Apague correções antigas quando não forem mais necessárias e trate os arquivos exportados (CSV, backup) como documentos com dados pessoais.</p>
      </section>
    </div>
  );
}
