/**
 * ProfileLabelFilterButton - Botón de la cabecera que permite elegir qué etiquetas de perfil se muestran
 */

import React, { useContext, useEffect, useRef, useState } from 'react';
import { Tag } from 'reicon-react';
import type { BrowserProfile, ProfileLabel } from '@xpm/core';
import { LABEL_FACE, PROFILE_LABELS, ProfileLabelFilterContext, labelOf } from '../profileLabels';
import './ProfileLabel.css';

interface ProfileLabelFilterButtonProps {
  /** Para mostrar cuántos perfiles hay con cada etiqueta */
  profiles: BrowserProfile[];
}

export default function ProfileLabelFilterButton({ profiles }: ProfileLabelFilterButtonProps) {
  const { visibleLabels, setVisibleLabels } = useContext(ProfileLabelFilterContext);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (label: ProfileLabel) => {
    const next = new Set(visibleLabels);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setVisibleLabels(next);
  };

  // Resaltado cuando el filtro se sale de lo habitual (solo activos)
  const customized = !(visibleLabels.size === 1 && visibleLabels.has('active'));

  return (
    <div className="plf-root" ref={rootRef}>
      <button
        type="button"
        className={`panel-header-btn${customized || open ? ' active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title="Choose which labels are shown"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Tag size={14} weight="Outline" />
      </button>
      {open && (
        <div className="plf-menu" role="menu">
          <div className="plf-title">Show profiles</div>
          {PROFILE_LABELS.map(({ id, name }) => (
            <label key={id} className="plf-option">
              <input type="checkbox" checked={visibleLabels.has(id)} onChange={() => toggle(id)} />
              <span className="plf-option-face">{LABEL_FACE[id]}</span>
              <span className="plf-option-name">{name}</span>
              <span className={`plf-option-count${visibleLabels.has(id) ? ' plf-option-count-on' : ''}`}>
                {profiles.filter((p) => labelOf(p) === id).length}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
