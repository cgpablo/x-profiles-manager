/**
 * ProfileModal - Unified create/edit profile modal.
 * Create mode: profile prop is undefined.
 * Edit mode:   profile prop is a BrowserProfile object.
 */

import React, { useState, useEffect } from 'react';
import { X, Folder } from 'reicon-react';
import { BrowserProfile } from '../../types';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useModalClose } from '../hooks/useModalClose';
import ColorPicker from './ColorPicker';
import './CreateProfileModal.css';
import './CreatePasswordModal.css';

interface PasswordEntry {
  id: string;
  name: string;
  profileIds: string[];
}

interface MailEntry {
  id: string;
  email: string;
  profileIds: string[];
}

interface ProfileModalProps {
  /** Pass a profile to enter edit mode; omit (or pass undefined) for create mode. */
  profile?: BrowserProfile;
  onClose: () => void;
  onSuccess: () => void;
  /** Pre-selected folder (create mode only). */
  selectedFolderId?: string | null | 'ungrouped';
  folders?: Array<{ id: string; name: string; icon: string }>;
}

export default function ProfileModal({
  profile,
  onClose,
  onSuccess,
  selectedFolderId,
  folders = [],
}: ProfileModalProps) {
  const isEdit = profile !== undefined;
  const electronAPI = useElectronAPI();
  const modalRef = useModalClose({ onClose });

  // Profile fields
  const [name, setName] = useState(isEdit ? profile.name : '');
  const [color, setColor] = useState(isEdit ? profile.color : '#FF6B6B');
  const [imagePath, setImagePath] = useState(isEdit ? (profile.imagePath || '') : '');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [xAccount, setXAccount] = useState(isEdit ? (profile.xAccount || '') : '');
  const [folderId, setFolderId] = useState<string | undefined>(
    isEdit
      ? profile.folderId
      : (selectedFolderId && selectedFolderId !== 'ungrouped' ? selectedFolderId : undefined)
  );
  const [directoryPath, setDirectoryPath] = useState(isEdit ? (profile.directoryPath || '') : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Password selector state
  const [passwords, setPasswords] = useState<PasswordEntry[]>([]);
  const [selectedPasswordId, setSelectedPasswordId] = useState<string | null>(null);
  const [initialPasswordId, setInitialPasswordId] = useState<string | null>(null);
  const [passwordSearch, setPasswordSearch] = useState('');
  const [passwordDropdownOpen, setPasswordDropdownOpen] = useState(false);

  // Mail selector state
  const [mails, setMails] = useState<MailEntry[]>([]);
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);
  const [initialMailId, setInitialMailId] = useState<string | null>(null);
  const [mailSearch, setMailSearch] = useState('');
  const [mailDropdownOpen, setMailDropdownOpen] = useState(false);

  // Folder dropdown state
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);

  // Load existing image preview in edit mode
  useEffect(() => {
    if (isEdit && profile.imagePath) {
      window.electronAPI.dialog.fileToDataUrl(profile.imagePath)
        .then(setImagePreviewUrl)
        .catch(() => setImagePreviewUrl(`file://${profile.imagePath}`));
    }
  }, []);

  // Load passwords and mails; in edit mode detect currently linked ones
  useEffect(() => {
    const loadData = async () => {
      try {
        const [allPasswords, allMails] = await Promise.all([
          window.electronAPI.passwords.getAll(),
          window.electronAPI.mails.getAll(),
        ]);
        setPasswords(allPasswords);
        setMails(allMails);

        if (isEdit) {
          const linkedPw = allPasswords.find(pw => pw.profileIds.includes(profile.id));
          if (linkedPw) {
            setSelectedPasswordId(linkedPw.id);
            setInitialPasswordId(linkedPw.id);
          }
          const linkedMail = allMails.find(m => m.profileIds.includes(profile.id));
          if (linkedMail) {
            setSelectedMailId(linkedMail.id);
            setInitialMailId(linkedMail.id);
          }
        }
      } catch (err) {
        console.error('Error loading passwords/mails:', err);
      }
    };
    loadData();
  }, []);

  const handleSelectImage = async () => {
    try {
      const files = await window.electronAPI.dialog.openFile({
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }],
      });
      if (files && files.length > 0) {
        let finalPath = files[0];
        try {
          const settings = await window.electronAPI.settings.get();
          if (settings?.backupIcons) {
            finalPath = await window.electronAPI.icons.backup(files[0]);
          }
        } catch {
          // if settings/backup fails, continue with original path
        }
        setImagePath(finalPath);
        try {
          const dataUrl = await window.electronAPI.dialog.fileToDataUrl(finalPath);
          setImagePreviewUrl(dataUrl);
        } catch {
          setImagePreviewUrl(`file://${finalPath}`);
        }
      }
    } catch (err) {
      console.error('Error selecting image:', err);
    }
  };

  const handleRemoveImage = () => {
    setImagePath('');
    setImagePreviewUrl('');
  };

  /** Link/unlink password and mail after the profile is saved. */
  const linkPasswordMail = async (profileId: string) => {
    // Password
    if (selectedPasswordId !== initialPasswordId) {
      if (initialPasswordId) {
        const oldPw = passwords.find(pw => pw.id === initialPasswordId);
        if (oldPw) {
          await window.electronAPI.passwords.update(initialPasswordId, {
            profileIds: oldPw.profileIds.filter(id => id !== profileId),
          });
        }
      }
      if (selectedPasswordId) {
        const newPw = passwords.find(pw => pw.id === selectedPasswordId);
        if (newPw && !newPw.profileIds.includes(profileId)) {
          await window.electronAPI.passwords.update(selectedPasswordId, {
            profileIds: [...newPw.profileIds, profileId],
          });
        }
      }
    }

    // Mail
    if (selectedMailId !== initialMailId) {
      if (initialMailId) {
        const oldMail = mails.find(m => m.id === initialMailId);
        if (oldMail) {
          await window.electronAPI.mails.update(initialMailId, {
            profileIds: oldMail.profileIds.filter(id => id !== profileId),
          });
        }
      }
      if (selectedMailId) {
        const newMail = mails.find(m => m.id === selectedMailId);
        if (newMail && !newMail.profileIds.includes(profileId)) {
          await window.electronAPI.mails.update(selectedMailId, {
            profileIds: [...newMail.profileIds, profileId],
          });
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!name.trim()) {
      setError('Profile name is required');
      setLoading(false);
      return;
    }

    if (!xAccount.trim()) {
      setError('X Account is required');
      setLoading(false);
      return;
    }

    try {
      if (isEdit) {
        await electronAPI.profiles.update(profile.id, {
          name,
          color,
          xAccount: xAccount || undefined,
          folderId,
          imagePath: imagePath || undefined,
          directoryPath: directoryPath || undefined,
        });
        await linkPasswordMail(profile.id);
      } else {
        const newProfile = await electronAPI.profiles.create(
          name, color, imagePath || '', xAccount || undefined, folderId, directoryPath || undefined
        );
        if (newProfile?.id) {
          await linkPasswordMail(newProfile.id);
        }
      }
      onSuccess();
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  // Filtered dropdown options (exclude already selected)
  const filteredPasswords = passwords.filter(pw => {
    if (selectedPasswordId === pw.id) return false;
    if (!passwordSearch.trim()) return true;
    return pw.name.toLowerCase().includes(passwordSearch.toLowerCase());
  });

  const filteredMails = mails.filter(m => {
    if (selectedMailId === m.id) return false;
    if (!mailSearch.trim()) return true;
    return m.email.toLowerCase().includes(mailSearch.toLowerCase());
  });

  const selectedPassword = passwords.find(pw => pw.id === selectedPasswordId);
  const selectedMail = mails.find(m => m.id === selectedMailId);

  return (
    <div className="modal-overlay">
      <div className="modal-content" ref={modalRef}>
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Profile' : 'Create New Profile'}</h2>
          <button className="modal-close" onClick={onClose}><X size={14} weight="Outline" /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Name + X Account in the same row */}
          <div className="form-row">
            <div className="form-group">
              <label>Profile Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Personal, Work, Brand A"
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>X Account *</label>
              <input
                type="text"
                value={xAccount}
                onChange={(e) => setXAccount(e.target.value)}
                placeholder="e.g., @yourhandle"
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Color</label>
            <ColorPicker
              value={color}
              onChange={setColor}
              disabled={loading}
            />
          </div>

          {/* Image + Folder row */}
          <div className="form-row">
            <div className="form-group">
              <label>Profile Image</label>
              <div className="image-selector">
                {imagePreviewUrl && (
                  <div className="image-preview">
                    <img src={imagePreviewUrl} alt="Profile" />
                  </div>
                )}
                <button
                  type="button"
                  className="btn-select-image"
                  onClick={handleSelectImage}
                  disabled={loading}
                >
                  {imagePath ? 'Change Image' : 'Select Image'}
                </button>
                {imagePath && (
                  <button
                    type="button"
                    className="btn-remove-image"
                    onClick={handleRemoveImage}
                    disabled={loading}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {folders.length > 0 && (
              <div className="form-group">
                <label>Folder (optional)</label>
                <div className="folder-dropdown-wrapper">
                  <button
                    type="button"
                    className="folder-dropdown-trigger"
                    onClick={() => !loading && setFolderDropdownOpen((o) => !o)}
                    onBlur={() => setTimeout(() => setFolderDropdownOpen(false), 150)}
                    disabled={loading}
                  >
                    <span className="folder-dropdown-icon"><Folder size={14} /></span>
                    <span className="folder-dropdown-label">
                      {folderId
                        ? folders.find((f) => f.id === folderId)?.name ?? 'OTHERS'
                        : 'OTHERS'}
                    </span>
                    <span className="folder-dropdown-chevron">▾</span>
                  </button>
                  {folderDropdownOpen && (
                    <div className="folder-dropdown-menu">
                      <button
                        type="button"
                        className={`folder-dropdown-option${!folderId ? ' folder-dropdown-option--selected' : ''}`}
                        onMouseDown={() => {
                          setFolderId(undefined);
                          setFolderDropdownOpen(false);
                        }}
                      >
                        <span className="folder-dropdown-icon"><Folder size={14} /></span>
                        OTHERS
                      </button>
                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          className={`folder-dropdown-option${folderId === folder.id ? ' folder-dropdown-option--selected' : ''}`}
                          onMouseDown={() => {
                            setFolderId(folder.id);
                            setFolderDropdownOpen(false);
                          }}
                        >
                          <span className="folder-dropdown-icon"><Folder size={14} /></span>
                          {folder.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Directory path */}
          <div className="form-group">
            <label>Directory (optional)</label>
            <div className="directory-input-row">
              <input
                type="text"
                value={directoryPath}
                onChange={(e) => setDirectoryPath(e.target.value)}
                placeholder="/users/example/my-folder"
                disabled={loading}
              />
              <button
                type="button"
                className="btn-browse-dir"
                disabled={loading}
                onClick={async () => {
                  try {
                    const selected = await window.electronAPI.system.selectDirectory();
                    if (selected) setDirectoryPath(selected);
                  } catch {
                    // cancelled or error — ignore
                  }
                }}
              >
                Browse
              </button>
            </div>
          </div>

          {/* Password + Mail selectors */}
          <div className="pm-field-row">
            {/* Password selector */}
            <div className="pm-field-group">
              <label className="pm-field-label">Password (optional)</label>
              {selectedPassword ? (
                <div className="pm-profile-chips">
                  <span className="pm-profile-chip">
                    {selectedPassword.name}
                    <button
                      type="button"
                      className="btn-pm-chip-remove"
                      onClick={() => setSelectedPasswordId(null)}
                      aria-label="Remove linked password"
                    >
                      <X size={14} weight="Outline" />
                    </button>
                  </span>
                </div>
              ) : (
                <div className="pm-profile-search-wrapper">
                  <input
                    type="text"
                    className="pm-input"
                    value={passwordSearch}
                    onChange={(e) => setPasswordSearch(e.target.value)}
                    onClick={() => setPasswordDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setPasswordDropdownOpen(false), 150)}
                    placeholder="Search password..."
                    disabled={loading}
                  />
                  {passwordDropdownOpen && filteredPasswords.length > 0 && (
                    <div className="pm-profile-dropdown">
                      {filteredPasswords.slice(0, 8).map((pw) => (
                        <button
                          key={pw.id}
                          type="button"
                          className="pm-profile-option"
                          onClick={() => {
                            setSelectedPasswordId(pw.id);
                            setPasswordSearch('');
                            setPasswordDropdownOpen(false);
                          }}
                        >
                          {pw.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {passwordDropdownOpen && passwordSearch.trim() && filteredPasswords.length === 0 && (
                    <div className="pm-profile-dropdown pm-profile-dropdown-empty">
                      <span>No matches</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mail selector */}
            <div className="pm-field-group">
              <label className="pm-field-label">Mail (optional)</label>
              {selectedMail ? (
                <div className="pm-profile-chips">
                  <span className="pm-profile-chip">
                    {selectedMail.email}
                    <button
                      type="button"
                      className="btn-pm-chip-remove"
                      onClick={() => setSelectedMailId(null)}
                      aria-label="Remove linked mail"
                    >
                      <X size={14} weight="Outline" />
                    </button>
                  </span>
                </div>
              ) : (
                <div className="pm-profile-search-wrapper">
                  <input
                    type="text"
                    className="pm-input"
                    value={mailSearch}
                    onChange={(e) => setMailSearch(e.target.value)}
                    onClick={() => setMailDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setMailDropdownOpen(false), 150)}
                    placeholder="Search mail..."
                    disabled={loading}
                  />
                  {mailDropdownOpen && filteredMails.length > 0 && (
                    <div className="pm-profile-dropdown">
                      {filteredMails.slice(0, 8).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="pm-profile-option"
                          onClick={() => {
                            setSelectedMailId(m.id);
                            setMailSearch('');
                            setMailDropdownOpen(false);
                          }}
                        >
                          {m.email}
                        </button>
                      ))}
                    </div>
                  )}
                  {mailDropdownOpen && mailSearch.trim() && filteredMails.length === 0 && (
                    <div className="pm-profile-dropdown pm-profile-dropdown-empty">
                      <span>No matches</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {isEdit
                ? (loading ? 'Updating...' : 'Update')
                : (loading ? 'Creating...' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
