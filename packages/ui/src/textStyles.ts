/**
 * Estilos de texto con caracteres Unicode (como yaytext.com): se pegan en cualquier post de X.
 * Negrita, cursiva y monoespacio sustituyen letras y cifras (negrita + cursiva se combinan);
 * tachado y subrayado añaden un carácter combinado detrás de cada carácter.
 */

export type StyleFlag = 'bold' | 'italic' | 'monospace' | 'strike' | 'underline';
export type StyleSet = ReadonlySet<StyleFlag>;

const COMBINING: Partial<Record<StyleFlag, string>> = { strike: '\u0336', underline: '\u0332' };
const COMBINING_RANGE = /[\u0300-\u036f]/;

interface LetterFlags {
  bold: boolean;
  italic: boolean;
  mono: boolean;
}

interface Alphabet {
  upper: number; // code point de "A"
  lower: number; // code point de "a"
  digit?: number; // code point de "0"
  flags: LetterFlags;
}

const ALPHABETS: Record<'bold' | 'italic' | 'boldItalic' | 'monospace', Alphabet> = {
  bold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec, flags: { bold: true, italic: false, mono: false } },
  italic: { upper: 0x1d608, lower: 0x1d622, flags: { bold: false, italic: true, mono: false } },
  boldItalic: { upper: 0x1d63c, lower: 0x1d656, flags: { bold: true, italic: true, mono: false } },
  monospace: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6, flags: { bold: false, italic: false, mono: true } },
};

// Carácter estilizado -> letra/cifra ASCII y sus estilos
const REVERSE = new Map<string, { base: string; flags: LetterFlags }>();
for (const alphabet of Object.values(ALPHABETS)) {
  for (let i = 0; i < 26; i++) {
    REVERSE.set(String.fromCodePoint(alphabet.upper + i), { base: String.fromCharCode(65 + i), flags: alphabet.flags });
    REVERSE.set(String.fromCodePoint(alphabet.lower + i), { base: String.fromCharCode(97 + i), flags: alphabet.flags });
  }
  if (alphabet.digit !== undefined) {
    for (let i = 0; i < 10; i++) {
      REVERSE.set(String.fromCodePoint(alphabet.digit + i), { base: String.fromCharCode(48 + i), flags: alphabet.flags });
    }
  }
}

const isAsciiLetter = (code: number) => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
const isAsciiDigit = (code: number) => code >= 48 && code <= 57;

/** Lee un carácter como (letra base + estilos). null si no es letra ni cifra ASCII ni su versión estilizada. */
function readChar(ch: string): { base: string; flags: LetterFlags } | null {
  const styled = REVERSE.get(ch);
  if (styled) return styled;
  const code = ch.codePointAt(0)!;
  if (isAsciiLetter(code) || isAsciiDigit(code)) return { base: ch, flags: { bold: false, italic: false, mono: false } };
  return null;
}

function writeChar(base: string, flags: LetterFlags): string {
  const code = base.codePointAt(0)!;
  const alphabet = flags.mono ? ALPHABETS.monospace : flags.bold && flags.italic ? ALPHABETS.boldItalic : flags.bold ? ALPHABETS.bold : flags.italic ? ALPHABETS.italic : null;
  if (!alphabet) return base;
  if (code >= 65 && code <= 90) return String.fromCodePoint(alphabet.upper + code - 65);
  if (code >= 97 && code <= 122) return String.fromCodePoint(alphabet.lower + code - 97);
  // Cifras: la cursiva no tiene, así que se quedan en negrita si la hay
  const digitAlphabet = flags.mono ? ALPHABETS.monospace : flags.bold ? ALPHABETS.bold : null;
  if (digitAlphabet?.digit !== undefined) return String.fromCodePoint(digitAlphabet.digit + code - 48);
  return base;
}

const flagsFromSet = (styles: StyleSet): LetterFlags => {
  const mono = styles.has('monospace');
  return { mono, bold: !mono && styles.has('bold'), italic: !mono && styles.has('italic') };
};

/** Aplica los estilos a texto recién escrito (modo "escribir con el estilo activo"). */
export function styleTyped(text: string, styles: StyleSet): string {
  if (styles.size === 0) return text;
  const flags = flagsFromSet(styles);
  let out = '';
  for (const ch of text) {
    const letter = readChar(ch);
    out += letter ? writeChar(letter.base, flags) : ch;
    if (!/\s/.test(ch) && !COMBINING_RANGE.test(ch)) {
      for (const flag of ['strike', 'underline'] as const) if (styles.has(flag)) out += COMBINING[flag];
    }
  }
  return out;
}

function toggleCombining(text: string, mark: string): string {
  const chars = Array.from(text);
  const clean = chars.filter((ch) => ch !== mark);
  const visible = clean.filter((ch) => !/\s/.test(ch) && !COMBINING_RANGE.test(ch)).length;
  const marked = chars.length - clean.length;
  // Si ya lo tiene todo el texto visible, se quita (alternar)
  if (visible > 0 && marked >= visible) return clean.join('');

  let out = '';
  for (let i = 0; i < clean.length; i++) {
    out += clean[i];
    if (!/\s/.test(clean[i]) && !COMBINING_RANGE.test(clean[i]) && !COMBINING_RANGE.test(clean[i + 1] ?? '')) out += mark;
  }
  return out;
}

/** Alterna un estilo sobre texto existente (selección). Negrita y cursiva se acumulan; el monoespacio las sustituye. */
export function toggleStyle(text: string, flag: StyleFlag): string {
  const mark = COMBINING[flag];
  if (mark) return toggleCombining(text, mark);

  const letters = Array.from(text).map(readChar).filter((c): c is NonNullable<typeof c> => c !== null);
  const key: keyof LetterFlags = flag === 'monospace' ? 'mono' : (flag as 'bold' | 'italic');
  const remove = letters.length > 0 && letters.every((c) => c.flags[key]);

  let out = '';
  for (const ch of text) {
    const letter = readChar(ch);
    if (!letter) {
      out += ch;
      continue;
    }
    const flags = { ...letter.flags };
    if (remove) flags[key] = false;
    else if (flag === 'monospace') Object.assign(flags, { mono: true, bold: false, italic: false });
    else Object.assign(flags, { [key]: true, mono: false });
    out += writeChar(letter.base, flags);
  }
  return out;
}

/** Quita todos los estilos: letras y cifras vuelven a ASCII y desaparecen tachado y subrayado. */
export function clearStyles(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch === COMBINING.strike || ch === COMBINING.underline) continue;
    out += REVERSE.get(ch)?.base ?? ch;
  }
  return out;
}
