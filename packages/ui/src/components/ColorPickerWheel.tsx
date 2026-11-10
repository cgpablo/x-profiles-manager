/**
 * ColorPickerWheel Component - Interactive color wheel picker with hex input
 */

import React, { useRef, useEffect, useState } from 'react';
import './ColorPickerWheel.css';

interface ColorPickerWheelProps {
  value: string;
  onConfirm: (color: string) => void;
  onCancel: () => void;
}

export default function ColorPickerWheel({ value, onConfirm, onCancel }: ColorPickerWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedColor, setSelectedColor] = useState(value);
  const [hexInput, setHexInput] = useState(value);
  const [isDragging, setIsDragging] = useState(false);

  // Draw color wheel on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 10;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw color wheel
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const dx = i - centerX;
        const dy = j - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= radius) {
          const angle = Math.atan2(dy, dx);
          const hue = ((angle + Math.PI) / (2 * Math.PI)) * 360;
          const saturation = (distance / radius) * 100;

          // Convert HSL to RGB
          const rgb = hslToRgb(hue, saturation, 50);

          const pixelIndex = (j * width + i) * 4;
          data[pixelIndex] = rgb.r;
          data[pixelIndex + 1] = rgb.g;
          data[pixelIndex + 2] = rgb.b;
          data[pixelIndex + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw selection circle on current color
    const hex = selectedColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Calculate position on wheel from color
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    let h = 0;
    let s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 127.5 ? d / (510 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    const hue = h * 360;
    const saturation = s * 100;

    // Draw selection indicator
    const angle = (hue * Math.PI) / 180 - Math.PI / 2;
    const distance = (saturation / 100) * radius;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;

    ctx.strokeStyle = l > 127.5 ? '#000000' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.stroke();
  }, [selectedColor]);

  const hslToRgb = (h: number, s: number, l: number) => {
    h = h / 360;
    s = s / 100;
    l = l / 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;

    let r = 0;
    let g = 0;
    let b = 0;

    if (h >= 0 && h < 1 / 6) {
      r = c;
      g = x;
    } else if (h >= 1 / 6 && h < 1 / 3) {
      r = x;
      g = c;
    } else if (h >= 1 / 3 && h < 1 / 2) {
      g = c;
      b = x;
    } else if (h >= 1 / 2 && h < 2 / 3) {
      g = x;
      b = c;
    } else if (h >= 2 / 3 && h < 5 / 6) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 10;

    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= radius) {
      const angle = Math.atan2(dy, dx);
      const hue = ((angle + Math.PI) / (2 * Math.PI)) * 360;
      const saturation = (distance / radius) * 100;

      const hex = hslToHex(hue, saturation, 50);
      setSelectedColor(hex);
      setHexInput(hex);
    }
  };

  const hslToHex = (h: number, s: number, l: number): string => {
    const hDecimal = h / 360;
    const sDecimal = s / 100;
    const lDecimal = l / 100;

    const c = (1 - Math.abs(2 * lDecimal - 1)) * sDecimal;
    const x = c * (1 - Math.abs((hDecimal * 6) % 2 - 1));
    const m = lDecimal - c / 2;

    let r = 0;
    let g = 0;
    let b = 0;

    if (hDecimal >= 0 && hDecimal < 1 / 6) {
      r = c;
      g = x;
    } else if (hDecimal >= 1 / 6 && hDecimal < 1 / 3) {
      r = x;
      g = c;
    } else if (hDecimal >= 1 / 3 && hDecimal < 1 / 2) {
      g = c;
      b = x;
    } else if (hDecimal >= 1 / 2 && hDecimal < 2 / 3) {
      g = x;
      b = c;
    } else if (hDecimal >= 2 / 3 && hDecimal < 5 / 6) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    const rHex = Math.round((r + m) * 255)
      .toString(16)
      .padStart(2, '0');
    const gHex = Math.round((g + m) * 255)
      .toString(16)
      .padStart(2, '0');
    const bHex = Math.round((b + m) * 255)
      .toString(16)
      .padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`.toUpperCase();
  };

  const handleHexInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let hex = e.target.value.toUpperCase();
    if (!hex.startsWith('#')) {
      hex = '#' + hex;
    }
    setHexInput(hex);

    if (/^#[0-9A-F]{6}$/.test(hex)) {
      setSelectedColor(hex);
    }
  };

  const handleConfirm = () => {
    if (/^#[0-9A-F]{6}$/.test(hexInput)) {
      onConfirm(selectedColor);
    }
  };

  return (
    <div className="color-picker-wheel-container">
      <div className="wheel-wrapper">
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          className="color-wheel"
          onClick={handleCanvasClick}
        />
      </div>

      <div className="hex-input-section">
        <input
          type="text"
          value={hexInput}
          onChange={handleHexInput}
          maxLength={7}
          placeholder="#000000"
          className="wheel-hex-input"
        />
      </div>

      <div className="color-preview-section">
        <div
          className="wheel-preview-box"
          style={{ backgroundColor: selectedColor }}
        />
      </div>

      <div className="wheel-actions">
        <button className="wheel-btn-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="wheel-btn-confirm"
          onClick={handleConfirm}
          disabled={!/^#[0-9A-F]{6}$/.test(hexInput)}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
