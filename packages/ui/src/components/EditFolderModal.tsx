/**
 * EditFolderModal Component - Modal para editar carpetas existentes
 */

import React, { useState } from 'react';
import type { ProfileFolder } from '@xpm/core';
import { usePlatformAPI } from '../hooks/usePlatformAPI';
import { useModalClose } from '../hooks/useModalClose';
import ColorPicker from './ColorPicker';
import './CreateFolderModal.css';

interface EditFolderModalProps {
  folder: ProfileFolder;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditFolderModal({ folder, onClose, onUpdated }: EditFolderModalProps) {
  const platformAPI = usePlatformAPI();
  const [name, setName] = useState(folder.name);
  const [selectedColor, setSelectedColor] = useState(folder.color);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const modalRef = useModalClose({ onClose });

  const handleUpdate = async () => {
    if (!name.trim()) {
      setError('Folder name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await platformAPI.folders.update(folder.id, {
        name,
        color: selectedColor,
        icon: '📁',
      });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update folder');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete the "${folder.name}" folder? Any profiles in it will remain.`)) {
      setLoading(true);
      setError('');

      try {
        await platformAPI.folders.delete(folder.id);
        onUpdated();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete folder');
        setLoading(false);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={() => onClose()}>
      <div className="modal-content create-folder-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Folder</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="folder-name">Folder Name</label>
            <input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Work, Personal, Projects"
              className="form-input"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Color</label>
            <ColorPicker value={selectedColor} onChange={setSelectedColor} disabled={loading} />
          </div>
        </div>

        <div className="modal-footer">
          <div style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleUpdate}
            disabled={loading || !name.trim()}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
