/**
 * Divide un texto en posts que caben en el límite de X.
 * La longitud se mide como X: los enlaces valen 23 y los caracteres fuera de los rangos latinos/puntuación valen 2.
 */

export const DEFAULT_POST_LIMIT = 280;
export const DEFAULT_SEPARATOR = '---';

const URL_WEIGHT = 23;
const URL_REGEX = /https?:\/\/[^\s]+/g;

function charWeight(codePoint: number): number {
  const light =
    codePoint <= 4351 ||
    (codePoint >= 8192 && codePoint <= 8205) ||
    (codePoint >= 8208 && codePoint <= 8223) ||
    (codePoint >= 8242 && codePoint <= 8247);
  return light ? 1 : 2;
}

function plainWeight(text: string): number {
  let total = 0;
  for (const ch of text) total += charWeight(ch.codePointAt(0)!);
  return total;
}

export function postLength(text: string): number {
  let total = 0;
  let last = 0;
  for (const match of text.matchAll(URL_REGEX)) {
    total += plainWeight(text.slice(last, match.index)) + URL_WEIGHT;
    last = match.index! + match[0].length;
  }
  return total + plainWeight(text.slice(last));
}

/** Mayor índice de corte tal que `text.slice(0, índice)` cabe en `limit`. */
function fittingPrefix(text: string, limit: number): number {
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (postLength(text.slice(0, mid)) <= limit) lo = mid;
    else hi = mid - 1;
  }
  const code = text.charCodeAt(lo - 1);
  // No partir un par sustituto (emoji)
  return code >= 0xd800 && code <= 0xdbff ? lo - 1 : lo;
}

/** Elige dónde cortar: párrafo > frase > palabra. Solo acepta cortes en la segunda mitad del trozo, salvo la palabra. */
function breakIndex(window: string): number {
  const minPos = Math.floor(window.length * 0.4);
  const lastMatch = (regex: RegExp): number => {
    let found = -1;
    for (const m of window.matchAll(regex)) found = m.index! + m[0].length;
    return found;
  };
  const paragraph = lastMatch(/\n\s*\n/g);
  if (paragraph >= minPos) return paragraph;
  const line = lastMatch(/\n/g);
  if (line >= minPos) return line;
  const sentence = lastMatch(/[.!?…]+["')\]]?\s+/g);
  if (sentence >= minPos) return sentence;
  const word = lastMatch(/\s+/g);
  if (word > 0) return word;
  return window.length;
}

function splitSegment(text: string, limit: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest && postLength(rest) > limit) {
    const fit = Math.max(1, fittingPrefix(rest, limit));
    const window = rest.slice(0, fit);
    // Si el corte ya cae justo antes de un espacio, el trozo entero es válido
    const atBoundary = /\s/.test(rest.charAt(fit));
    const cut = atBoundary ? fit : breakIndex(window);
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export const DEFAULT_MARKER = '…';
export const COUNTER_TOKEN = '1/N';

/** Símbolos de cierre y su pareja de apertura: un marcador `>` acaba el post con `>` y empieza el siguiente con `<`. */
const MIRRORS: Record<string, string> = {
  '>': '<',
  '>>': '<<',
  '»': '«',
  '›': '‹',
  '→': '←',
  '->': '<-',
  '=>': '<=',
  '⟩': '⟨',
  '》': '《',
  '❯': '❮',
};

/** Pareja completa (cierre -> apertura). Escribir cualquiera de los dos lados deja la misma pareja: `<` o `>` dan `> ... <`. */
const PAIR_OF = new Map<string, { end: string; start: string }>();
for (const [end, start] of Object.entries(MIRRORS)) {
  PAIR_OF.set(end, { end, start });
  PAIR_OF.set(start, { end, start });
}

/** Parejas que se completan solas, para listarlas en la ayuda: `end` cierra el post y `start` abre el siguiente. */
export const MARKER_PAIRS = Object.entries(MIRRORS).map(([end, start]) => ({ end, start }));

export interface ParsedMarker {
  /** Va al final del post que continúa (o de todos, con contador) */
  end: string;
  /** Va al inicio del post que continúa el anterior */
  start: string;
  /** El marcador lleva `1/N`: va al final de todos los posts con su número */
  counted: boolean;
}

/**
 * Interpreta el marcador:
 *  - `A ... B` (o `A...B`): acaba con A y empieza con B. Ej.: `> ... <`.
 *  - Un símbolo suelto de una pareja (`>`, `<`, `»`, `«`, `›`, `‹`, `->`...) se completa solo: equivale a `> ... <`.
 *  - Cualquier otro texto va igual al final y al inicio. Con `1/N` va solo al final de todos, con su número.
 */
export function parseMarker(marker: string): ParsedMarker {
  const raw = marker.trim();
  if (raw.includes(COUNTER_TOKEN)) return { end: raw, start: '', counted: true };
  const pair = raw.match(/^(.+?)\s*(?:\.{3}|…)\s*(.+)$/s);
  if (pair) return { end: pair[1].trim(), start: pair[2].trim(), counted: false };
  const known = PAIR_OF.get(raw);
  if (known) return { ...known, counted: false };
  return { end: raw, start: raw, counted: false };
}

/** Si el marcador es un símbolo de cierre suelto, lo escribe completo (`>` -> `> ... <`) para que se entienda. */
export function autoPairMarker(marker: string): string {
  const known = PAIR_OF.get(marker.trim());
  return known ? `${known.end} ... ${known.start}` : marker;
}

export interface SplitOptions {
  limit: number;
  separator: string;
  /**
   * Texto que añade la herramienta. Sin `1/N`: va al final del post que continúa y al inicio del siguiente.
   * Con `1/N`: va al final de todos los posts y `1/N` se sustituye por su número (1/3, 2/3, ...).
   * Vacío = nada.
   */
  marker: string;
}

export function splitIntoPosts(text: string, { limit, separator, marker }: SplitOptions): string[] {
  const sep = separator.trim();
  const segments = (sep ? text.split(sep) : [text]).map((s) => s.trim()).filter(Boolean);

  if (segments.length === 0) return [];
  if (segments.length === 1 && postLength(segments[0]) <= limit) return segments;

  const { end, start, counted } = parseMarker(marker);
  const mark = end;
  const render = (total: number, index: number) => end.split(COUNTER_TOKEN).join(`${index}/${total}`);

  // Espacio que ocupa el marcador en el peor caso, con el total de posts ya conocido
  const reserveFor = (total: number): number => {
    if (counted) return mark ? postLength(render(total, total)) + 1 : 0;
    return (end ? postLength(end) + 1 : 0) + (start ? postLength(start) + 1 : 0);
  };

  const build = (total: number): string[] =>
    segments.flatMap((s) => splitSegment(s, Math.max(1, limit - reserveFor(total))));

  let posts = build(1);
  if (counted) {
    // El total cambia el ancho del contador (9/9 -> 10/10): se recalcula hasta que se estabilice
    for (let i = 0; i < 4; i++) {
      const next = build(posts.length);
      const stable = next.length === posts.length;
      posts = next;
      if (stable) break;
    }
  } else {
    posts = build(posts.length);
  }

  const total = posts.length;
  if (total === 1 && !counted) return posts;

  return posts.map((post, i) => {
    if (counted) return mark ? `${post} ${render(total, i + 1)}` : post;
    let result = post;
    if (i > 0 && start) result = `${start} ${result}`;
    if (i < total - 1 && end) result = `${result} ${end}`;
    return result;
  });
}
