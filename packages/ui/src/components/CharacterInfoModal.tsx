/**
 * CharacterInfoModal - Read-only view of a profile's Character Hub data
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BrowserProfile } from '@xpm/core';
import './CharacterInfoModal.css';
import './CharacterHub.css';

interface CharacterInfoModalProps {
  profile: BrowserProfile;
  onClose: () => void;
}

export default function CharacterInfoModal({ profile, onClose }: CharacterInfoModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const fcInfo = profile.fcInfo;
  const hasIg = (fcInfo?.ig?.length ?? 0) > 0;
  const hasX  = (fcInfo?.x?.length ?? 0) > 0;
  const hasSc = (fcInfo?.sc?.length ?? 0) > 0;
  const hasAny = hasIg || hasX || hasSc;

  const openExternal = (url: string) => window.open(url, '_blank');

  return createPortal(
    <div className="char-info-overlay" onClick={onClose}>
      <div className="char-info-modal" onClick={(e) => e.stopPropagation()}>

        <div className="char-info-header">
          <h3 className="char-info-title">{profile.name.toUpperCase()} INFO</h3>
          <button className="char-info-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="char-info-body">
          {!hasAny && (
            <p className="ch-fc-empty char-info-empty-msg">No character info registered for this profile.</p>
          )}

          {hasAny && (
            <div className="ch-fc-info">
              {hasIg && (
                <div className="ch-fc-row">
                  <span className="ch-fc-label">ig</span>
                  <div className="ch-fc-tags">
                    {fcInfo!.ig!.map((tag, i) => (
                      <button
                        key={i}
                        className="ch-fc-tag ch-fc-tag-link"
                        onClick={() => openExternal(`https://www.instagram.com/${tag}/`)}
                        title={`Open @${tag} on Instagram`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {hasX && (
                <div className="ch-fc-row">
                  <span className="ch-fc-label">x</span>
                  <div className="ch-fc-tags">
                    {fcInfo!.x!.map((tag, i) => (
                      <button
                        key={i}
                        className="ch-fc-tag ch-fc-tag-link"
                        onClick={() => openExternal(`https://x.com/${tag}`)}
                        title={`Open @${tag} on X`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {hasSc && (
                <div className="ch-fc-row">
                  <span className="ch-fc-label">others</span>
                  <div className="ch-fc-links">
                    {fcInfo!.sc!.map((item, i) => (
                      <button
                        key={i}
                        className="ch-fc-tag ch-fc-tag-link"
                        onClick={() => openExternal(item.url)}
                        title={item.url}
                      >
                        {item.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
