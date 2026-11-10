/**
 * EditFCCharacterModal - Edit faceclaim info for a profile
 */

import React, { useState } from 'react';
import { X } from 'reicon-react';
import type { BrowserProfile, FCCharacterInfo } from '@xpm/core';
import { usePlatformAPI } from '../hooks/usePlatformAPI';
import { useModalClose } from '../hooks/useModalClose';
import './EditFCCharacterModal.css';

interface EditFCCharacterModalProps {
  profile: BrowserProfile;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditFCCharacterModal({ profile, onClose, onSaved }: EditFCCharacterModalProps) {
  const platformAPI = usePlatformAPI();
  const modalRef = useModalClose({ onClose });

  const [igTags, setIgTags] = useState<string[]>(profile.fcInfo?.ig ?? []);
  const [igInput, setIgInput] = useState('');

  const [xTags, setXTags] = useState<string[]>(profile.fcInfo?.x ?? []);
  const [xInput, setXInput] = useState('');

  const [scLinks, setScLinks] = useState<Array<{ text: string; url: string }>>(
    profile.fcInfo?.sc ?? []
  );
  const [scText, setScText] = useState('');
  const [scUrl, setScUrl] = useState('');

  const [loading, setLoading] = useState(false);

  /* --- ig handlers --- */
  const handleAddIgTag = () => {
    const t = igInput.trim();
    if (t && !igTags.includes(t)) {
      setIgTags([...igTags, t]);
      setIgInput('');
    }
  };
  const handleRemoveIgTag = (tag: string) => setIgTags(igTags.filter((t) => t !== tag));

  /* --- x handlers --- */
  const handleAddXTag = () => {
    const t = xInput.trim();
    if (t && !xTags.includes(t)) {
      setXTags([...xTags, t]);
      setXInput('');
    }
  };
  const handleRemoveXTag = (tag: string) => setXTags(xTags.filter((t) => t !== tag));

  /* --- others (sc) handlers --- */
  const handleAddLink = () => {
    const text = scText.trim();
    const url = scUrl.trim();
    if (text && url) {
      setScLinks([...scLinks, { text, url }]);
      setScText('');
      setScUrl('');
    }
  };
  const handleRemoveLink = (i: number) => setScLinks(scLinks.filter((_, idx) => idx !== i));

  /* --- save --- */
  const handleSave = async () => {
    setLoading(true);
    try {
      const fcInfo: FCCharacterInfo = {
        ig: igTags.length > 0 ? igTags : undefined,
        x: xTags.length > 0 ? xTags : undefined,
        sc: scLinks.length > 0 ? scLinks : undefined,
      };
      await platformAPI.profiles.update(profile.id, { fcInfo } as any);
      onSaved();
    } catch (err) {
      console.error('Error saving FC info:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content fc-modal" ref={modalRef}>
        {/* Header */}
        <div className="modal-header">
          <h2>Add Faceclaim Info to <span style={{ color: 'var(--primary)' }}>{profile.name}</span></h2>
          <button className="modal-close" onClick={onClose}><X size={14} weight="Outline" /></button>
        </div>

        <div className="modal-form fc-modal-form">
          {/* ig section */}
          <div className="fc-field-group">
            <label className="fc-field-label">ig</label>
            <div className="fc-input-row">
              <input
                type="text"
                className="fc-input"
                value={igInput}
                onChange={(e) => setIgInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddIgTag(); } }}
                placeholder="Add Instagram handle..."
                disabled={loading}
              />
              <button
                type="button"
                className="btn-fc-add"
                onClick={handleAddIgTag}
                disabled={!igInput.trim() || loading}
              >
                Add
              </button>
            </div>
            <div className="fc-tags-list">
              {igTags.length === 0 && <span className="fc-hint">No tags yet</span>}
              {igTags.map((tag) => (
                <span key={tag} className="fc-tag-chip">
                  {tag}
                  <button
                    type="button"
                    className="btn-fc-remove"
                    onClick={() => handleRemoveIgTag(tag)}
                    aria-label={`Remove ${tag}`}
                  >
                    <X size={14} weight="Outline" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* x section */}
          <div className="fc-field-group">
            <label className="fc-field-label">x</label>
            <div className="fc-input-row">
              <input
                type="text"
                className="fc-input"
                value={xInput}
                onChange={(e) => setXInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddXTag(); } }}
                placeholder="Add X/Twitter handle..."
                disabled={loading}
              />
              <button
                type="button"
                className="btn-fc-add"
                onClick={handleAddXTag}
                disabled={!xInput.trim() || loading}
              >
                Add
              </button>
            </div>
            <div className="fc-tags-list">
              {xTags.length === 0 && <span className="fc-hint">No tags yet</span>}
              {xTags.map((tag) => (
                <span key={tag} className="fc-tag-chip">
                  {tag}
                  <button
                    type="button"
                    className="btn-fc-remove"
                    onClick={() => handleRemoveXTag(tag)}
                    aria-label={`Remove ${tag}`}
                  >
                    <X size={14} weight="Outline" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* others (formerly sc) section */}
          <div className="fc-field-group">
            <label className="fc-field-label">others</label>
            <div className="fc-input-row fc-input-row-sc">
              <input
                type="text"
                className="fc-input"
                value={scText}
                onChange={(e) => setScText(e.target.value)}
                placeholder="Label..."
                disabled={loading}
              />
              <input
                type="text"
                className="fc-input"
                value={scUrl}
                onChange={(e) => setScUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); } }}
                placeholder="Link (URL)..."
                disabled={loading}
              />
              <button
                type="button"
                className="btn-fc-add"
                onClick={handleAddLink}
                disabled={!scText.trim() || !scUrl.trim() || loading}
              >
                Add
              </button>
            </div>
            <div className="fc-links-list">
              {scLinks.length === 0 && <span className="fc-hint">No links yet</span>}
              {scLinks.map((item, i) => (
                <div key={i} className="fc-link-row">
                  <span className="fc-link-text">{item.text}</span>
                  <span className="fc-link-sep">→</span>
                  <button
                    type="button"
                    className="fc-link-url btn-link"
                    onClick={() => window.open(item.url, '_blank')}
                  >
                    {item.url}
                  </button>
                  <button
                    type="button"
                    className="btn-fc-remove"
                    onClick={() => handleRemoveLink(i)}
                    aria-label="Remove link"
                  >
                    <X size={14} weight="Outline" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
