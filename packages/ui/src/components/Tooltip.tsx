/**
 * Tooltip Component - Custom tooltip with positioning
 */

import React, { useState, useRef } from 'react';
import './Tooltip.css';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export default function Tooltip({ text, children, position = 'top' }: TooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.PointerEvent) => {
    // Con el dedo no hay "pasar por encima": el tooltip se quedaría pegado tras tocar
    if (e.pointerType !== 'mouse') return;
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      // Use fixed positioning relative to viewport
      let top = 0;
      let left = 0;

      if (position === 'right') {
        top = rect.top + rect.height / 2;
        left = rect.right + 8;
      } else if (position === 'left') {
        top = rect.top + rect.height / 2;
        left = rect.left - 8;
      } else if (position === 'top') {
        top = rect.top - 8;
        left = rect.left + rect.width / 2;
      } else if (position === 'bottom') {
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2;
      }

      setTooltipPos({ top, left });
    }
    setShowTooltip(true);
  };

  return (
    <div
      ref={wrapperRef}
      className={`tooltip-wrapper tooltip-${position}`}
      onPointerEnter={handleMouseEnter}
      onPointerLeave={() => setShowTooltip(false)}
    >
      {children}
      {showTooltip && (
        <div
          className="tooltip-content"
          style={{
            top: `${tooltipPos.top}px`,
            left: `${tooltipPos.left}px`,
            transform:
              position === 'right'
                ? 'translateY(-50%)'
                : position === 'left'
                ? 'translateY(-50%)'
                : position === 'top'
                ? 'translateX(-50%)'
                : 'translateX(-50%)',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
