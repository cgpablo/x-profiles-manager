/**
 * ProfileAvatar - Shows profile image or letter-initial fallback with profile color.
 * Used in card/chip contexts (CharacterHub, PasswordManager).
 * Apply sizing/shape via the className prop (e.g. "ch-card-avatar").
 */

import React, { useState, useEffect } from 'react';
import { BrowserProfile } from '../../types';
import './ProfileAvatar.css';

interface ProfileAvatarProps {
  profile: Pick<BrowserProfile, 'id' | 'name' | 'color' | 'imagePath'>;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}

export default function ProfileAvatar({ profile, className, title, style }: ProfileAvatarProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.imagePath) {
      setImgSrc(null);
      return;
    }
    window.electronAPI.dialog
      .fileToDataUrl(profile.imagePath)
      .then((url) => setImgSrc(url))
      .catch(() => setImgSrc(null));
  }, [profile.imagePath, profile.id]);

  return (
    <div
      className={`profile-avatar-wrap${className ? ` ${className}` : ''}`}
      title={title}
      style={style}
    >
      {imgSrc ? (
        <img className="profile-avatar-img" src={imgSrc} alt={profile.name} />
      ) : (
        <span
          className="profile-avatar-letter"
          style={{ backgroundColor: profile.color }}
        >
          {profile.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
