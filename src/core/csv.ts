/** CSV no padrão do Excel em português: separador ';', aspas em todos os campos e BOM UTF-8. */
export function paraCSV(linhas: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '""';
    const s = typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false }) : v;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return '﻿' + linhas.map(l => l.map(esc).join(';')).join('\r\n');
}
