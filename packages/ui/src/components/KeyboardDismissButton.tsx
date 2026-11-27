/**
 * KeyboardDismissButton - Botón flotante para ocultar el teclado del móvil mientras se escribe.
 * Aparece cuando hay un campo de texto enfocado y se coloca justo encima del teclado.
 */

import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'reicon-react';
import './KeyboardDismissButton.css';

const EDITABLE =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="file"]):not([type="range"]), textarea, [contenteditable="true"]';

export default function KeyboardDismissButton() {
  const [visible, setVisible] = useState(false);
  const [bottom, setBottom] = useState(12);

  useEffect(() => {
    const update = () => {
      const active = document.activeElement;
      setVisible(!!active && active.matches(EDITABLE));
      const vv = window.visualViewport;
      // Si el teclado no redimensiona la página, el hueco que deja se calcula con la altura visible
      if (vv) setBottom(Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 12);
    };
    const onFocusOut = () => window.setTimeout(update, 60);
    update();
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', onFocusOut);
    // Respaldo: el foco no burbujea, pero sí se puede escuchar en la fase de captura
    document.addEventListener('focus', update, true);
    document.addEventListener('blur', onFocusOut, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('focus', update, true);
      document.removeEventListener('blur', onFocusOut, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="kbd-dismiss"
      style={{ bottom }}
      // Sin esto el botón le quitaría el foco al campo antes del clic y se ocultaría solo
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
      onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
      aria-label="Hide keyboard"
      title="Hide keyboard"
    >
      <ChevronDown size={20} weight="Outline" />
    </button>
  );
}
