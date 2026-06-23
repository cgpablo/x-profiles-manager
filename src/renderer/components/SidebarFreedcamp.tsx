/**
 * SidebarFreedcamp Component - Freedcamp section in sidebar
 */

import React from 'react';
import './SidebarDashboard.css';

interface SidebarFreedcampProps {
  onNavigate?: () => void;
}

export default function SidebarFreedcamp({ onNavigate }: SidebarFreedcampProps) {
  const handleClick = () => {
    window.open('https://freedcamp.com/dashboard', '_blank');
    onNavigate?.();
  };

  return (
    <div className="sidebar-freedcamp">
      <button className="sidebar-section-header-btn" onClick={handleClick}>
        <h3>⛺ FREEDCAMP</h3>
      </button>
    </div>
  );
}
