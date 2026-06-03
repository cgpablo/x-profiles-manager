/**
 * SidebarSettings Component - Settings section in sidebar
 */

import React from 'react';
import './SidebarSettings.css';

interface SidebarSettingsProps {
  onOpenSettings?: () => void;
}

export default function SidebarSettings({ onOpenSettings }: SidebarSettingsProps) {
  return (
    <div className="sidebar-settings">
      <button className="sidebar-section-header-btn" onClick={onOpenSettings}>
        <h3>⚙️ SETTINGS</h3>
      </button>
    </div>
  );
}
