/**
 * BrowserPreview Component - Ventana embebida de Chrome
 */

import React, { useState, useEffect } from 'react';
import { ChromeProfile } from '../../types';
import './BrowserPreview.css';

interface BrowserPreviewProps {
  profile: ChromeProfile | null;
  onClose: () => void;
  isActive?: boolean;
}

export default function BrowserPreview({ profile, onClose, isActive }: BrowserPreviewProps) {
  const [showInstructions, setShowInstructions] = useState(true);

  useEffect(() => {
    // Hide instructions after 5 seconds if profile is active
    if (isActive) {
      const timer = setTimeout(() => setShowInstructions(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowInstructions(true);
    }
  }, [isActive]);

  if (!profile) {
    return (
      <div className="browser-preview empty">
        <div className="empty-state">
          <div className="empty-icon">🌐</div>
          <h3>No profile selected</h3>
          <p>Click on a profile card to view its details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="browser-preview">
      <div className="browser-header">
        <div className="browser-info">
          {profile.imagePath ? (
            <img 
              src={`file://${profile.imagePath}`} 
              alt={profile.name} 
              className="profile-thumb"
            />
          ) : (
            <div className="profile-thumb-placeholder">{profile.name.charAt(0).toUpperCase()}</div>
          )}
          <span className="profile-name">{profile.name}</span>
          {profile.xAccount && (
            <span className="profile-account">@{profile.xAccount}</span>
          )}
        </div>
        <button className="browser-close" onClick={onClose} title="Close preview">
          ✕
        </button>
      </div>
      <div className="browser-content">
        {isActive ? (
          <div className="active-status">
            {showInstructions && (
              <div className="instructions-box">
                <div className="status-icon">✓</div>
                <h2>Chrome is Running</h2>
                <p>Profile <strong>{profile.name}</strong> is now active and running in Chrome.</p>
                {profile.xAccount && (
                  <p className="account-info">X Account: <strong>@{profile.xAccount}</strong></p>
                )}
                <div className="action-buttons">
                  <button 
                    className="btn-focus-chrome"
                    onClick={() => {
                      (window as any).electronAPI?.launcher?.focusWindow?.(profile.id);
                    }}
                  >
                    Focus Chrome Window
                  </button>
                  <button 
                    className="btn-close-profile"
                    onClick={() => {
                      (window as any).electronAPI?.launcher?.close?.(profile.id);
                      onClose();
                    }}
                  >
                    Close Profile
                  </button>
                </div>
              </div>
            )}
            {!showInstructions && (
              <div className="minimal-status">
                <div className="status-dot active" />
                <span>{profile.name} is running</span>
                <button 
                  className="btn-instructions-toggle"
                  onClick={() => setShowInstructions(true)}
                  title="Show instructions"
                >
                  ℹ
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="inactive-info">
            <div className="status-icon">○</div>
            <h2>Profile Not Running</h2>
            <p>Click the Launch button on the profile card to start Chrome with this profile.</p>
            <div className="profile-details">
              <div className="detail-row">
                <span className="detail-label">Profile ID:</span>
                <span className="detail-value">{profile.id}</span>
              </div>
              {profile.xAccount && (
               <div className="detail-row">
                 <span className="detail-label">X Account:</span>
                 <span className="detail-value">@{profile.xAccount}</span>
               </div>
               )}
             </div>
           </div>
        )}
      </div>
    </div>
  );
}
