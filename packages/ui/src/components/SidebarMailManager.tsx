/**
 * SidebarMailManager Component - Mail Manager section in sidebar
 */

import React from 'react';
import { Envelope } from 'reicon-react';
import './SidebarDashboard.css';

interface SidebarMailManagerProps {
  onNavigate?: () => void;
}

export default function SidebarMailManager({ onNavigate }: SidebarMailManagerProps) {
  return (
    <div className="sidebar-mail-manager">
      <button className="sidebar-section-header-btn" onClick={onNavigate}>
        <h3><Envelope size={16} weight="Outline" /><span>MAIL MANAGER</span></h3>
      </button>
    </div>
  );
}
