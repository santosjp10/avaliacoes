// Criptografia com a Web Crypto API nativa do navegador (AES-GCM 128/256).
// Usada para: (1) gabarito cifrado no QR da folha; (2) pacotes de resultados celular → PC;
// (3) backup protegido por senha (PBKDF2).

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64url(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function aleatorio(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

/** Nova chave do professor (128 bits), codificada em base64url. */
export function gerarChave(): string {
  return b64url(aleatorio(16));
}

/** Identificador curto e público da chave (não revela a chave). */
export async function idDaChave(chave: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', deB64url(chave) as BufferSource));
  return b64url(h.slice(0, 4));
}

async function importar(chave: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', deB64url(chave) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function cifrarCom(key: CryptoKey, texto: string): Promise<string> {
  const iv = aleatorio(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(texto)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return b64url(out);
}

async function decifrarCom(key: CryptoKey, dados: string): Promise<string> {
  const raw = deB64url(dados);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) as BufferSource }, key, raw.slice(12) as BufferSource);
  return dec.decode(pt);
}

export async function cifrar(chave: string, texto: string): Promise<string> {
  return cifrarCom(await importar(chave), texto);
}

export async function decifrar(chave: string, dados: string): Promise<string> {
  return decifrarCom(await importar(chave), dados);
}

async function chaveDeSenha(senha: string, sal: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal as BufferSource, iterations: 210_000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function cifrarComSenha(senha: string, texto: string): Promise<{ sal: string; dados: string }> {
  const sal = aleatorio(16);
  return { sal: b64url(sal), dados: await cifrarCom(await chaveDeSenha(senha, sal), texto) };
}

export async function decifrarComSenha(senha: string, sal: string, dados: string): Promise<string> {
  return decifrarCom(await chaveDeSenha(senha, deB64url(sal)), dados);
}
