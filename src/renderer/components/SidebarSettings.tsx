/**
 * SidebarSettings Component - Settings section in sidebar
 */

import React from 'react';
import { Gear } from 'reicon-react';
import './SidebarSettings.css';

interface SidebarSettingsProps {
  onOpenSettings?: () => void;
}

export default function SidebarSettings({ onOpenSettings }: SidebarSettingsProps) {
  return (
    <div className="sidebar-settings">
      <button className="sidebar-section-header-btn" onClick={onOpenSettings}>
        <h3><Gear size={16} weight="Outline" /><span>SETTINGS</span></h3>
      </button>
    </div>
  );
}
