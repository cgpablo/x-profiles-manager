/**
 * Pide al teclado de Android que no ofrezca predicciones ni autocorrección en los campos de texto del gestor
 * (con teclado físico, la fila de sugerencias flotante tapaba el cuadro de escritura).
 */
export function disableKeyboardSuggestions(): void {
  const apply = (el: Element) => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
  };
  document.addEventListener('focusin', (event) => apply(event.target as Element), true);
}
