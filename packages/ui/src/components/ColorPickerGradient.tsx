/**
 * ColorPickerGradient Component - 2D Gradient Picker + Hue Bar (like the image)
 * Top-left: White (full saturation)
 * Top-right: Pure hue
 * Bottom-left: White (low saturation)
 * Bottom-right: Pure hue dark
 * Bottom: Brightness
 */

import React, { useRef, useEffect, useState } from 'react';
import './ColorPickerGradient.css';

interface ColorPickerGradientProps {
  value: string;
  onConfirm: (color: string) => void;
  onCancel: () => void;
}

export default function ColorPickerGradient({
  value,
  onConfirm,
  onCancel,
}: ColorPickerGradientProps) {
  const gradientCanvasRef = useRef<HTMLCanvasElement>(null);
  const hueSliderRef = useRef<HTMLInputElement>(null);
  const [selectedColor, setSelectedColor] = useState(value);
  const [hexInput, setHexInput] = useState(value);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [brightness, setBrightness] = useState(100);

  // Convert hex to HSB
  useEffect(() => {
    const hex = value.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = max;

    let h = 0;
    let s = 0;

    if (max !== min) {
      const d = max - min;
      s = max === 0 ? 0 : d / max;

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

    setHue(h * 360);
    setSaturation(s * 100);
    setBrightness(l * 100);
  }, [value]);

  // Draw gradient canvas
  useEffect(() => {
    const canvas = gradientCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Create hue color (full saturation, full brightness)
    const hueRgb = hsbToRgb(hue, 100, 100);
    const hueColor = `rgb(${hueRgb.r}, ${hueRgb.g}, ${hueRgb.b})`;

    // Create gradient: horizontal = saturation (white to hue), vertical = brightness (bright to dark)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sat = (x / width) * 100;
        const bri = 100 - (y / height) * 100;
        const rgb = hsbToRgb(hue, sat, bri);
        ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Draw selection circle
    const selX = (saturation / 100) * width;
    const selY = (1 - brightness / 100) * height;

    ctx.strokeStyle = brightness > 50 ? '#000000' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(selX, selY, 6, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.strokeStyle = brightness > 50 ? '#ffffff' : '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(selX, selY, 7, 0, 2 * Math.PI);
    ctx.stroke();
  }, [hue, saturation, brightness]);

  const hsbToRgb = (
    h: number,
    s: number,
    b: number
  ): { r: number; g: number; b: number } => {
    s = s / 100;
    b = b / 100;

    const c = b * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = b - c;

    let r = 0,
      g = 0,
      bl = 0;

    if (h >= 0 && h < 60) {
      r = c;
      g = x;
    } else if (h >= 60 && h < 120) {
      r = x;
      g = c;
    } else if (h >= 120 && h < 180) {
      g = c;
      bl = x;
    } else if (h >= 180 && h < 240) {
      g = x;
      bl = c;
    } else if (h >= 240 && h < 300) {
      r = x;
      bl = c;
    } else {
      r = c;
      bl = x;
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((bl + m) * 255),
    };
  };

  const rgbToHex = (r: number, g: number, b: number): string => {
    return (
      '#' +
      [r, g, b]
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        })
        .join('')
        .toUpperCase()
    );
  };

  const updateColor = (h: number, s: number, b: number) => {
    setHue(h);
    setSaturation(s);
    setBrightness(b);

    const rgb = hsbToRgb(h, s, b);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    setSelectedColor(hex);
    setHexInput(hex);
  };

  const handleGradientPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = gradientCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // El canvas puede mostrarse más pequeño que su tamaño interno: se usa el tamaño en pantalla
    const newSat = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newBri = Math.max(0, Math.min(100, 100 - (y / rect.height) * 100));

    updateColor(hue, newSat, newBri);
  };

  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHue = parseInt(e.target.value);
    updateColor(newHue, saturation, brightness);
  };

  const handleHexInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let hex = e.target.value.toUpperCase();
    if (!hex.startsWith('#')) {
      hex = '#' + hex;
    }
    setHexInput(hex);

    if (/^#[0-9A-F]{6}$/.test(hex)) {
      const r = parseInt(hex.substring(1, 3), 16) / 255;
      const g = parseInt(hex.substring(3, 5), 16) / 255;
      const b = parseInt(hex.substring(5, 7), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = max;

      let h = 0;
      let s = 0;

      if (max !== min) {
        const d = max - min;
        s = max === 0 ? 0 : d / max;

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

      updateColor(h * 360, s * 100, l * 100);
    }
  };

  const handleConfirm = () => {
    if (/^#[0-9A-F]{6}$/.test(hexInput)) {
      onConfirm(selectedColor);
    }
  };

  return (
    <div className="color-picker-gradient-container">
      {/* Gradient Picker */}
      <div className="gradient-picker-wrapper">
        <canvas
          ref={gradientCanvasRef}
          width={300}
          height={200}
          className="gradient-canvas"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            handleGradientPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) handleGradientPointer(e);
          }}
        />
      </div>

      {/* Hue Slider */}
      <div className="hue-slider-wrapper">
        <input
          ref={hueSliderRef}
          type="range"
          min="0"
          max="360"
          value={hue}
          onChange={handleHueChange}
          className="hue-slider"
        />
      </div>

      {/* Hex Input and Preview */}
      <div className="color-input-section">
        <div
          className="color-preview"
          style={{ backgroundColor: selectedColor }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={handleHexInput}
          maxLength={7}
          placeholder="#000000"
          className="hex-input"
        />
      </div>

      {/* Actions */}
      <div className="gradient-actions">
        <button className="btn-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn-confirm"
          onClick={handleConfirm}
          disabled={!/^#[0-9A-F]{6}$/.test(hexInput)}
        >
          Ok
        </button>
      </div>
    </div>
  );
}
