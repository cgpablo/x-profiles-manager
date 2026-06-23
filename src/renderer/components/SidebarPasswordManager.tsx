/**
 * SidebarPasswordManager Component - Password Manager section in sidebar
 */

import React from 'react';
import './SidebarDashboard.css';

interface SidebarPasswordManagerProps {
  onNavigate?: () => void;
}

export default function SidebarPasswordManager({ onNavigate }: SidebarPasswordManagerProps) {
  return (
    <div className="sidebar-password-manager">
      <button className="sidebar-section-header-btn" onClick={onNavigate}>
        <h3>🔐 PASSWORD MANAGER</h3>
      </button>
    </div>
  );
}
