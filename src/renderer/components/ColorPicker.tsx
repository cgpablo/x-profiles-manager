/**
 * ColorPicker Component - Preset swatches + gradient picker modal
 */

import React, { useRef, useState, useEffect } from 'react';
import ColorPickerGradient from './ColorPickerGradient';
import './ColorPicker.css';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

const PRESET_COLORS = [
  '#FF6B6B', // Red
  '#FF8C42', // Orange
  '#FFD93D', // Yellow
  '#6BCB77', // Green
  '#4D96FF', // Blue
  '#9D4EDD', // Purple
  '#FF006E', // Pink
  '#FB5607', // Deep Orange
];

export default function ColorPicker({ value, onChange, disabled = false }: ColorPickerProps) {
   const [pending, setPending] = useState(value);
   const [showGradientPicker, setShowGradientPicker] = useState(false);

   // Sync pending when parent resets value
   useEffect(() => {
     setPending(value);
   }, [value]);

   const handlePresetClick = (color: string) => {
     setPending(color);
     onChange(color);
   };

   const handleOpenGradientPicker = () => {
     setShowGradientPicker(true);
   };

   const handleConfirmGradientColor = (color: string) => {
     setPending(color);
     onChange(color);
     setShowGradientPicker(false);
   };

   const handleCancelGradientPicker = () => {
     setShowGradientPicker(false);
   };

   return (
     <div className="color-picker-container">
       <div className="preset-colors">
         {PRESET_COLORS.map((color) => (
           <button
             key={color}
             type="button"
             className={`color-swatch ${pending === color ? 'selected' : ''}`}
             style={{ backgroundColor: color }}
             onClick={() => handlePresetClick(color)}
             disabled={disabled}
             title={color}
           />
         ))}
         {/* Custom color picker button */}
         <button
           type="button"
           className="color-picker-trigger"
           style={
             !PRESET_COLORS.includes(pending)
               ? { backgroundColor: pending, borderColor: pending }
               : {}
           }
           onClick={handleOpenGradientPicker}
           disabled={disabled}
           title="Custom color"
         >
           ⚙️
         </button>
       </div>

       {/* Gradient Picker Modal */}
       {showGradientPicker && (
         <div className="color-modal-overlay" onClick={handleCancelGradientPicker}>
           <div className="color-modal-content" onClick={(e) => e.stopPropagation()}>
             <div className="color-modal-header">
               <h3>Select Color</h3>
               <button className="color-modal-close" onClick={handleCancelGradientPicker}>
                 ✕
               </button>
             </div>
             <div className="color-modal-body">
               <ColorPickerGradient
                 value={pending}
                 onConfirm={handleConfirmGradientColor}
                 onCancel={handleCancelGradientPicker}
               />
             </div>
           </div>
         </div>
       )}
     </div>
   );
}
