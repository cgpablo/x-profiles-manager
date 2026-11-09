/**
 * EmptyProfileCard Component - Card to add new profile
 */

import React from 'react';
import './EmptyProfileCard.css';

interface EmptyProfileCardProps {
  onCreateProfile: () => void;
}

export default function EmptyProfileCard({ onCreateProfile }: EmptyProfileCardProps) {
  return (
    <button
      className="empty-profile-card"
      onClick={onCreateProfile}
      aria-label="Create new profile"
    >
      <div className="empty-card-content">
        <div className="empty-card-icon">+</div>
        <p className="empty-card-text">Add Profile</p>
      </div>
    </button>
  );
}
