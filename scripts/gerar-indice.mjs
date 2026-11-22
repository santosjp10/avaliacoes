// Uso: node scripts/gerar-indice.mjs  → gera public/banco/indice.json
import { gerarIndice } from './banco-lib.mjs';
const i = gerarIndice(new URL('../public/banco', import.meta.url).pathname);
console.log(`Índice do banco aberto: ${i.total} questão(ões).`);
