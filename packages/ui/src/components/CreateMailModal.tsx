/**
 * CreateMailModal - Create or edit a mail entry
 */

import React, { useState } from 'react';
import { getPlatformAPI } from '../platform';
import { X } from 'reicon-react';
import type { BrowserProfile } from '@xpm/core';
import { useModalClose } from '../hooks/useModalClose';
import './CreatePasswordModal.css';

interface MailEntryBasic {
  id: string;
  email: string;
  profileIds: string[];
}

interface CreateMailModalProps {
  profiles: BrowserProfile[];
  editingEntry: MailEntryBasic | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function CreateMailModal({
  profiles,
  editingEntry,
  onClose,
  onSaved,
}: CreateMailModalProps) {
  const modalRef = useModalClose({ onClose });
  const isEditing = !!editingEntry;

  const [email, setEmail] = useState(editingEntry?.email ?? '');
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>(
    editingEntry?.profileIds ?? []
  );
  const [profileSearch, setProfileSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const filteredProfiles = profiles.filter((p) => {
    if (selectedProfileIds.includes(p.id)) return false;
    if (!profileSearch.trim()) return true;
    const q = profileSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.xAccount != null && p.xAccount.toLowerCase().includes(q))
    );
  });

  const addProfile = (profileId: string) => {
    setSelectedProfileIds([...selectedProfileIds, profileId]);
    setProfileSearch('');
    setDropdownOpen(false);
  };

  const removeProfile = (profileId: string) => {
    setSelectedProfileIds(selectedProfileIds.filter((id) => id !== profileId));
  };

  const selectedProfiles = profiles.filter((p) => selectedProfileIds.includes(p.id));

  const canSave = email.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true);
    try {
      if (isEditing) {
        await getPlatformAPI().mails.update(editingEntry!.id, {
          email: email.trim(),
          profileIds: selectedProfileIds,
        });
      } else {
        await getPlatformAPI().mails.create(
          email.trim(),
          selectedProfileIds
        );
      }
      onSaved();
    } catch (err) {
      console.error('Error saving mail entry:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content pm-modal" ref={modalRef}>
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Mail' : 'New Mail'}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={14} weight="Outline" />
          </button>
        </div>

        <div className="modal-form pm-modal-form">
          {/* Email */}
          <div className="pm-field-group">
            <label className="pm-field-label">Email</label>
            <input
              type="email"
              className="pm-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@gmail.com"
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Linked profiles */}
          <div className="pm-field-group">
            <label className="pm-field-label">Linked Profiles</label>

            {selectedProfiles.length > 0 && (
              <div className="pm-profile-chips">
                {selectedProfiles.map((p) => (
                  <span key={p.id} className="pm-profile-chip">
                    <span
                      className="pm-profile-chip-avatar"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    {p.name}
                    <button
                      type="button"
                      className="btn-pm-chip-remove"
                      onClick={() => removeProfile(p.id)}
                      aria-label={`Remove ${p.name}`}
                    >
                      <X size={14} weight="Outline" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="pm-profile-search-wrapper">
              <input
                type="text"
                className="pm-input"
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                onClick={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                placeholder="Click to search and link profiles..."
                disabled={loading}
              />
              {dropdownOpen && filteredProfiles.length > 0 && (
                <div className="pm-profile-dropdown">
                  {filteredProfiles.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="pm-profile-option"
                      onClick={() => addProfile(p.id)}
                    >
                      <span
                        className="pm-profile-option-avatar"
                        style={{ backgroundColor: p.color }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {dropdownOpen && profileSearch.trim() && filteredProfiles.length === 0 && (
                <div className="pm-profile-dropdown pm-profile-dropdown-empty">
                  <span>No matches</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={loading || !canSave}
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
