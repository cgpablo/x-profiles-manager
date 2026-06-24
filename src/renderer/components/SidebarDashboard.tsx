/**
 * SidebarDashboard Component - Dashboard section in sidebar
 */

import React from 'react';
import './SidebarDashboard.css';

interface SidebarDashboardProps {
  onGoToDashboard?: () => void;
}

export default function SidebarDashboard({ onGoToDashboard }: SidebarDashboardProps) {
  return (
    <div className="sidebar-dashboard">
      <button className="sidebar-section-header-btn" onClick={onGoToDashboard}>
        <h3><span>📊</span><span>DASHBOARD</span></h3>
      </button>
    </div>
  );
}
