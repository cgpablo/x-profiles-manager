/**
 * PostPreviewModal - Muestra el texto entero del editor, de solo lectura, para revisarlo cómodamente
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'reicon-react';
import { useModalClose } from '../hooks/useModalClose';
import './PostPreviewModal.css';

interface PostPreviewModalProps {
  text: string;
  /** Imágenes adjuntas al primer post (vista previa en data URL) */
  images?: Array<{ id: string; name: string; dataUrl: string }>;
  fontSize: number;
  onClose: () => void;
}

export default function PostPreviewModal({ text, images = [], fontSize, onClose }: PostPreviewModalProps) {
  const modalRef = useModalClose({ onClose });

  return createPortal(
    <div className="ppm-overlay">
      <div className="ppm-modal" ref={modalRef} role="dialog" aria-modal="true" aria-label="Text preview">
        <div className="ppm-header">
          <h3>Preview</h3>
          <button type="button" className="ppm-close" onClick={onClose} aria-label="Close preview" title="Close">
            <X size={14} />
          </button>
        </div>
        <div className="ppm-body">
          {images.length > 0 && (
            <div className={`ppm-images ppm-images-${Math.min(images.length, 4)}`}>
              {images.map((image) => (
                <img key={image.id} src={image.dataUrl} alt={image.name} title={image.name} />
              ))}
            </div>
          )}
          <div className="ppm-text" style={{ fontSize: `${fontSize}px` }}>
            {text.trim() ? text : <span className="ppm-empty">There is no text to preview yet.</span>}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
