import type { ItemGabarito, Resposta } from '../core/types';
import { opcoesItem } from '../core/gabarito';
import { fmtNum } from '../core/util';

interface Props {
  itens: ItemGabarito[];
  respostas: Resposta[];
  notasDisc: (number | null)[];
  aoMarcar: (pos: number, r: Resposta) => void;
  aoNotaDisc: (pos: number, n: number | null) => void;
  /** Depois de corrigir: pinta acertos e erros e mostra a resposta certa. */
  conferir?: boolean;
}

/** Grade de bolhas para lançar respostas. Usada no Corretor (celular) e no Estúdio. */
export function FolhaRespostas({ itens, respostas, notasDisc, aoMarcar, aoNotaDisc, conferir }: Props) {
  return (
    <div className="grade-respostas">
      {itens.map((it, pos) => {
        if (it.tipo === 'disc') {
          const n = notasDisc[pos];
          return (
            <div key={pos} className={`linha-resp disc ${n == null ? 'pendente' : ''}`}>
              <span className="num">{pos + 1}</span>
              <div className="disc-nota">
                <span className="rotulo-mini">Discursiva · até {fmtNum(it.peso, 2)}</span>
                <div className="disc-atalhos">
                  {[0, it.peso / 2, it.peso].map(v => (
                    <button key={v} type="button" className={`chip ${n === v ? 'ativo' : ''}`} onClick={() => aoNotaDisc(pos, v)}>{fmtNum(v, 2)}</button>
                  ))}
                  <input
                    className="campo campo-nota" type="number" inputMode="decimal" min={0} max={it.peso} step={0.1}
                    aria-label={`Nota da questão ${pos + 1}`} placeholder="nota"
                    value={n ?? ''}
                    onChange={e => aoNotaDisc(pos, e.target.value === '' ? null : Math.min(it.peso, Math.max(0, Number(e.target.value))))}
                  />
                </div>
              </div>
            </div>
          );
        }
        const marcada = respostas[pos] ?? null;
        const ok = conferir && marcada !== null && marcada === it.correta;
        const erro = conferir && !ok;
        return (
          <div key={pos} className={`linha-resp ${ok ? 'certa' : ''} ${erro ? 'errada' : ''}`}>
            <span className="num">{pos + 1}</span>
            <div className="bolhas" role="radiogroup" aria-label={`Questão ${pos + 1}`}>
              {opcoesItem(it).map(op => {
                const ativa = marcada === op;
                const gab = conferir && op === it.correta;
                return (
                  <button
                    key={op} type="button" role="radio" aria-checked={ativa}
                    className={`bolha ${it.tipo === 'vf' ? 'vf' : ''} ${ativa ? 'marcada' : ''} ${gab ? 'gabarito' : ''}`}
                    onClick={() => aoMarcar(pos, ativa ? null : op)}
                  >{op}</button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
