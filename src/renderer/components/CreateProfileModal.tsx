/**
 * CreateProfileModal Component
 */

import React, { useState } from 'react';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useModalClose } from '../hooks/useModalClose';
import ColorPicker from './ColorPicker';
import './CreateProfileModal.css';

interface CreateProfileModalProps {
  onClose: () => void;
  onCreated: () => void;
  selectedFolderId?: string | null | 'ungrouped';
  folders?: Array<{ id: string; name: string; icon: string }>;
}

export default function CreateProfileModal({ 
  onClose, 
  onCreated,
  selectedFolderId,
  folders = []
}: CreateProfileModalProps) {
  const electronAPI = useElectronAPI();
  const modalRef = useModalClose({ onClose });
  const [name, setName] = useState('');
  const [color, setColor] = useState('#FF6B6B');
  const [imagePath, setImagePath] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [xAccount, setXAccount] = useState('');
  const [folderId, setFolderId] = useState<string | undefined>(
    selectedFolderId && selectedFolderId !== 'ungrouped' ? selectedFolderId : undefined
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelectImage = async () => {
    try {
      const files = await window.electronAPI.dialog.openFile({
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }],
      });
      if (files && files.length > 0) {
        const path = files[0];
        setImagePath(path);
        try {
          const dataUrl = await window.electronAPI.dialog.fileToDataUrl(path);
          setImagePreviewUrl(dataUrl);
        } catch {
          setImagePreviewUrl(`file://${path}`);
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
      await electronAPI.profiles.create(name, color, imagePath || '', xAccount || undefined, folderId);
      onCreated();
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" ref={modalRef}>
        <div className="modal-header">
          <h2>Create New Profile</h2>
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

          <div className="form-group">
            <label>Color</label>
            <ColorPicker 
              value={color}
              onChange={setColor}
              disabled={loading}
            />
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
              {loading ? 'Creating...' : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
