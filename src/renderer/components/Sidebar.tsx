/**
 * Sidebar Component - Container principal con 3 sub-componentes
 */

import React from 'react';
import { ChromeProfile, ProfileFolder } from '../../types';
import SidebarDashboard from './SidebarDashboard';
import SidebarFolders from './SidebarFolders';
import SidebarSettings from './SidebarSettings';
import './Sidebar.css';

interface SidebarProps {
  folders: ProfileFolder[];
  profiles: ChromeProfile[];
  selectedFolderId: string | null | 'ungrouped';
  expandedFolders: Set<string>;
  expandedOthers?: boolean;
  onSelectFolder: (folderId: string | null | 'ungrouped') => void;
  onToggleFolder: (folderId: string) => void;
  onToggleOthers?: () => void;
  onCreateFolder: () => void;
  onCreateProfile?: (folderId?: string) => void;
  onEditFolder: (folder: ProfileFolder) => void;
  onDeleteFolder: (folderId: string) => void;
  profileCountByFolder: Map<string | undefined, number>;
   onLaunchProfile?: (profileId: string) => void;
   onCloseProfile?: (profileId: string) => void;
   onOpenAllInBrowser?: (folderId: string) => void;
  onCloseAll?: (folderId: string) => void;
  activeStatuses?: Map<string, boolean>;
  onMoveProfileToFolder?: (profileId: string, folderId: string | undefined) => void;
  onGoToDashboard?: () => void;
  onGoToFolders?: () => void;
  onOpenSettings?: () => void;
  orderedProfiles?: Map<string | 'ungrouped', ChromeProfile[]>;
}

export default function Sidebar({
  folders,
  profiles,
  selectedFolderId,
  expandedFolders,
  expandedOthers = true,
  onSelectFolder,
  onToggleFolder,
  onToggleOthers,
  onCreateFolder,
  onCreateProfile,
  onEditFolder,
  onDeleteFolder,
  profileCountByFolder,
  onLaunchProfile,
   onCloseProfile,
   onOpenAllInBrowser,
   onCloseAll,
  activeStatuses = new Map(),
  onMoveProfileToFolder,
  onGoToDashboard,
  onGoToFolders,
  onOpenSettings,
  orderedProfiles,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      {/* Dashboard Section */}
      <SidebarDashboard onGoToDashboard={onGoToDashboard} />

      {/* Folders Section */}
       <SidebarFolders
           folders={folders}
           profiles={profiles}
           selectedFolderId={selectedFolderId}
           expandedFolders={expandedFolders}
           expandedOthers={expandedOthers}
           onSelectFolder={onSelectFolder}
           onToggleFolder={onToggleFolder}
           onToggleOthers={onToggleOthers}
           onCreateFolder={onCreateFolder}
           onCreateProfile={onCreateProfile}
           onEditFolder={onEditFolder}
           onDeleteFolder={onDeleteFolder}
           profileCountByFolder={profileCountByFolder}
            onLaunchProfile={onLaunchProfile}
            onCloseProfile={onCloseProfile}
             onOpenAllInBrowser={onOpenAllInBrowser}
             onCloseAll={onCloseAll}
            activeStatuses={activeStatuses}
             onMoveProfileToFolder={onMoveProfileToFolder}
             onGoToFolders={onGoToFolders}
             orderedProfiles={orderedProfiles}
           />

       {/* Settings Section */}
       <SidebarSettings onOpenSettings={onOpenSettings} />
     </aside>
   );
 }
