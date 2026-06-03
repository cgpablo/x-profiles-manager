/**
 * useModalClose Hook
 * 
 * Provides reusable functionality for closing modals with:
 * - Click outside the modal content
 * - Escape key press
 */

import { useEffect, useRef } from 'react';

interface UseModalCloseOptions {
  onClose: () => void;
  isOpen?: boolean;
}

export function useModalClose({ onClose, isOpen = true }: UseModalCloseOptions) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Handle Escape key
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Handle click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, isOpen]);

  return modalRef;
}
