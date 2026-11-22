import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

let aplicar: ((recarregar?: boolean) => Promise<void>) | null = null;
let avisar: (() => void) | null = null;
let pendente = false;

/** Registra o service worker e procura versões novas ao abrir e ao voltar para o app. */
export function iniciarAtualizacoes() {
  if (!('serviceWorker' in navigator)) return;
  aplicar = registerSW({
    immediate: true,
    onNeedRefresh() { pendente = true; avisar?.(); },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const verificar = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verificar(); });
      setInterval(verificar, 20 * 60 * 1000);
    },
  });
}

/** Faixa no topo quando há versão nova. O professor decide a hora (não recarrega no meio de uma correção). */
export function AvisoAtualizacao() {
  const [ha, setHa] = useState(pendente);
  useEffect(() => { avisar = () => setHa(true); return () => { avisar = null; }; }, []);
  if (!ha) return null;
  return (
    <div className="faixa-atualizacao" role="alert">
      <span>Há uma versão nova do app.</span>
      <button className="btn btn-sm" onClick={() => aplicar?.(true)}>Atualizar agora</button>
    </div>
  );
}

export const VERSAO = __VERSAO__;
