/**
 * EditProfileModal Component
 */

import React, { useState, useEffect } from 'react';
import { ChromeProfile } from '../../types';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useModalClose } from '../hooks/useModalClose';
import ColorPicker from './ColorPicker';
import './CreateProfileModal.css';

interface EditProfileModalProps {
  profile: ChromeProfile;
  onClose: () => void;
  onUpdated: () => void;
  folders?: Array<{ id: string; name: string; icon: string }>;
}

export default function EditProfileModal({ 
  profile, 
  onClose, 
  onUpdated,
  folders = []
}: EditProfileModalProps) {
  const electronAPI = useElectronAPI();
  const modalRef = useModalClose({ onClose });
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.color);
  const [imagePath, setImagePath] = useState(profile.imagePath || '');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');

  // Load initial preview via IPC (avoids file:// CSP issues)
  useEffect(() => {
    if (profile.imagePath) {
      window.electronAPI.dialog.fileToDataUrl(profile.imagePath)
        .then(setImagePreviewUrl)
        .catch(() => setImagePreviewUrl(`file://${profile.imagePath}`));
    }
  }, []);
  const [xAccount, setXAccount] = useState(profile.xAccount || '');
  const [folderId, setFolderId] = useState<string | undefined>(profile.folderId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!name.trim()) {
      setError('Profile name is required');
      setLoading(false);
      return;
    }

    try {
      await electronAPI.profiles.update(profile.id, {
        name,
        color,
        xAccount: xAccount || undefined,
        folderId,
        imagePath: imagePath || undefined,
      });
      onUpdated();
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" ref={modalRef}>
        <div className="modal-header">
          <h2>Edit Profile</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
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
            <label>X Account (optional)</label>
            <input
              type="text"
              value={xAccount}
              onChange={(e) => setXAccount(e.target.value)}
              placeholder="e.g., @yourhandle"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Color</label>
            <ColorPicker 
              value={color}
              onChange={setColor}
              disabled={loading}
            />
          </div>

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
                <select
                  value={folderId || ''}
                  onChange={(e) => setFolderId(e.target.value || undefined)}
                  disabled={loading}
                >
                  <option value="">OTHERS</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.icon} {folder.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
              {loading ? 'Updating...' : 'Update Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
