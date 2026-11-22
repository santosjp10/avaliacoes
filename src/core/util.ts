export const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
export const NOMES_VERSAO = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export function novoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function arred(n: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Fisher–Yates com gerador injetável (permite testes determinísticos). */
export function embaralhar<T>(arr: readonly T[], rnd: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rngSemente(semente: number): () => number {
  let t = semente >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtNum(n: number, casas = 1): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

export function fmtData(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
