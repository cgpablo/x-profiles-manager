/**
 * Utilidades de rutas sin depender de `path` de Node.
 */

export function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1];
}

/** Extensión con el punto ('.png'), o '' si no tiene. Equivale a `path.extname`. */
export function extName(p: string): string {
  const base = baseName(p);
  const idx = base.lastIndexOf('.');
  return idx <= 0 ? '' : base.slice(idx);
}

/** Nombre de fichero sin extensión. Equivale a `path.parse(p).name`. */
export function nameWithoutExt(p: string): string {
  const base = baseName(p);
  const idx = base.lastIndexOf('.');
  return idx <= 0 ? base : base.slice(0, idx);
}
