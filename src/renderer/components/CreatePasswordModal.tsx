/**
 * CreatePasswordModal - Create or edit a password entry
 */

import React, { useState } from 'react';
import { BrowserProfile } from '../../types';
import { useModalClose } from '../hooks/useModalClose';
import './CreatePasswordModal.css';

interface PasswordEntryBasic {
  id: string;
  name: string;
  profileIds: string[];
}

interface CreatePasswordModalProps {
  profiles: BrowserProfile[];
  editingEntry: PasswordEntryBasic | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function CreatePasswordModal({
  profiles,
  editingEntry,
  onClose,
  onSaved,
}: CreatePasswordModalProps) {
  const modalRef = useModalClose({ onClose });
  const isEditing = !!editingEntry;

  const [name, setName] = useState(editingEntry?.name ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const canSave =
    name.trim().length > 0 && (isEditing || password.trim().length > 0);

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true);
    try {
      if (isEditing) {
        await window.electronAPI.passwords.update(editingEntry!.id, {
          name: name.trim(),
          ...(password.trim() ? { value: password.trim() } : {}),
          profileIds: selectedProfileIds,
        });
      } else {
        await window.electronAPI.passwords.create(
          name.trim(),
          password.trim(),
          selectedProfileIds
        );
      }
      onSaved();
    } catch (err) {
      console.error('Error saving password:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content pm-modal" ref={modalRef}>
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Password' : 'New Password'}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-form pm-modal-form">
          {/* Name + Password in the same row */}
          <div className="pm-field-row">
            <div className="pm-field-group">
              <label className="pm-field-label">Name</label>
              <input
                type="text"
                className="pm-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main Twitter Account"
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="pm-field-group">
              <label className="pm-field-label">
                Password{' '}
                {isEditing && (
                  <span className="pm-optional">(leave blank to keep current)</span>
                )}
              </label>
              <div className="pm-password-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="pm-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEditing ? 'New password (optional)' : 'Enter password...'}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="btn-pm-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
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
                      ✕
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
