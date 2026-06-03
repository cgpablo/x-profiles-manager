/**
 * CreateFolderModal Component - Modal para crear nuevas carpetas
 */

import React, { useState } from 'react';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useModalClose } from '../hooks/useModalClose';
import ColorPicker from './ColorPicker';
import './CreateFolderModal.css';

const DEFAULT_FOLDER_COLOR = '#3b82f6';

interface CreateFolderModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateFolderModal({ onClose, onCreated }: CreateFolderModalProps) {
  const electronAPI = useElectronAPI();
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEFAULT_FOLDER_COLOR);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const modalRef = useModalClose({ onClose });

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Folder name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await electronAPI.folders.create(name, selectedColor, '📁');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => onClose()}>
      <div className="modal-content create-folder-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create New Folder</h3>
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
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
          >
            {loading ? 'Creating...' : 'Create Folder'}
          </button>
        </div>
      </div>
    </div>
  );
}
