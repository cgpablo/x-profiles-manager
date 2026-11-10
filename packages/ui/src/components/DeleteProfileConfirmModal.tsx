/**
 * DeleteConfirmModal - In-app confirmation modal for deleting profiles or folders
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface DeleteConfirmModalProps {
  title: string;
  itemName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmModal({
  title,
  itemName,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onConfirm]);

  return createPortal(
    <div className="delete-confirm-overlay" onClick={onCancel}>
      <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>Are you sure you want to delete <strong>{itemName}</strong>?</p>
        <p className="delete-confirm-warning">This action cannot be undone.</p>
        <div className="delete-confirm-actions">
          <button className="delete-confirm-btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="delete-confirm-btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
