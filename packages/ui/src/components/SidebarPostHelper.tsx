/**
 * SidebarPostHelper Component - Post Helper section in sidebar
 */

import React from 'react';
import { Pen2 } from 'reicon-react';
import './SidebarDashboard.css';

interface SidebarPostHelperProps {
  onNavigate?: () => void;
}

export default function SidebarPostHelper({ onNavigate }: SidebarPostHelperProps) {
  return (
    <div className="sidebar-post-helper">
      <button className="sidebar-section-header-btn" onClick={onNavigate}>
        <h3><Pen2 size={16} weight="Outline" /><span>POST HELPER</span></h3>
      </button>
    </div>
  );
}
