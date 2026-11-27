/**
 * InterfaceSizeSetting - Tamaño de la interfaz en Android (`zoom` de la raíz). Se guarda en `uiScale`; el HTML de la app
 * móvil lo lee al arrancar y aquí se aplica al momento.
 */

import React, { useState } from 'react';

const SIZES = [
  { value: 0.7, label: 'Small' },
  { value: 0.8, label: 'Medium' },
  { value: 0.9, label: 'Large' },
  { value: 1, label: 'Normal' },
];

const defaultScale = () => (Math.min(window.screen.width, window.screen.height) < 600 ? 0.8 : 1);

const currentScale = (): number => {
  const saved = parseFloat(localStorage.getItem('uiScale') ?? '');
  return saved >= 0.5 && saved <= 1.5 ? saved : defaultScale();
};

export default function InterfaceSizeSetting() {
  const [scale, setScale] = useState(currentScale);

  const choose = (value: number) => {
    localStorage.setItem('uiScale', String(value));
    // `zoom` en la raíz escala toda la interfaz y se aplica al momento
    if (value === 1) document.documentElement.style.removeProperty('zoom');
    else document.documentElement.style.setProperty('zoom', String(value));
    setScale(value);
  };

  return (
    <div className="settings-section">
      <h3>Interface size</h3>
      <div className="setting-item">
        <label>Size</label>
        <p className="section-description">
          Makes everything smaller or larger. The change applies at once.
        </p>
        <div className="theme-options" role="radiogroup" aria-label="Interface size">
          {SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              role="radio"
              aria-checked={scale === size.value}
              className={`theme-option${scale === size.value ? ' active' : ''}`}
              onClick={() => choose(size.value)}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
