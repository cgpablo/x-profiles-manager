/**
 * ProfileAvatarIcon - Shows profile avatar image (via IPC) or letter fallback
 */

import React, { useState, useEffect } from 'react';
import { BrowserProfile } from '../../types';

interface ProfileAvatarIconProps {
  profile: Pick<BrowserProfile, 'id' | 'name' | 'imagePath'>;
}

export default function ProfileAvatarIcon({ profile }: ProfileAvatarIconProps) {
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

  if (imgSrc) {
    return (
      <img
        className="profile-icon-img"
        src={imgSrc}
        alt={profile.name}
      />
    );
  }
  return (
    <span className="profile-icon">
      {profile.name.charAt(0).toUpperCase()}
    </span>
  );
}
