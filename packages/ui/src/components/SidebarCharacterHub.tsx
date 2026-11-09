/**
 * SidebarCharacterHub Component - Character Hub section in sidebar
 */

import React from 'react';
import { Bookmarks } from 'reicon-react';
import './SidebarDashboard.css';

interface SidebarCharacterHubProps {
  onNavigate?: () => void;
}

export default function SidebarCharacterHub({ onNavigate }: SidebarCharacterHubProps) {
  return (
    <div className="sidebar-character-hub">
      <button className="sidebar-section-header-btn" onClick={onNavigate}>
        <h3><Bookmarks size={16} weight="Outline" /><span>CHARACTER HUB</span></h3>
      </button>
    </div>
  );
}
