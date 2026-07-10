/**
 * Sidebar Component - Container principal con 3 sub-componentes
 */

import React from 'react';
import { BrowserProfile, ProfileFolder } from '../../types';
import SidebarDashboard from './SidebarDashboard';
import SidebarFolders from './SidebarFolders';
import SidebarPasswordManager from './SidebarPasswordManager';
import SidebarMailManager from './SidebarMailManager';
import SidebarCharacterHub from './SidebarCharacterHub';
import SidebarFreedcamp from './SidebarFreedcamp';
import SidebarSettings from './SidebarSettings';
import './Sidebar.css';

interface SidebarProps {
  folders: ProfileFolder[];
  profiles: BrowserProfile[];
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
  onGoToPasswordManager?: () => void;
  onGoToMailManager?: () => void;
  onGoToCharacterHub?: () => void;
  onGoToFreedcamp?: () => void;
  showPasswordManager?: boolean;
  showMailManager?: boolean;
  showCharacterHub?: boolean;
  showFreedcamp?: boolean;
  showDashboard?: boolean;
  orderedProfiles?: Map<string | 'ungrouped', BrowserProfile[]>;
  onToggleAllFolders?: (expand: boolean) => void;
  onEditProfile?: (profile: BrowserProfile) => void;
  onDeleteProfile?: (profileId: string) => void;
  onToggleStar?: (profileId: string) => void;
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
  onGoToPasswordManager,
  onGoToMailManager,
  onGoToCharacterHub,
  onGoToFreedcamp,
  showPasswordManager = false,
  showMailManager = false,
  showCharacterHub = false,
  showFreedcamp = false,
  showDashboard = true,
  orderedProfiles,
  onToggleAllFolders,
  onEditProfile,
  onDeleteProfile,
  onToggleStar,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      {/* Dashboard Section */}
      {showDashboard !== false && <SidebarDashboard onGoToDashboard={onGoToDashboard} />}

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
             onToggleAllFolders={onToggleAllFolders}
             onEditProfile={onEditProfile}
             onDeleteProfile={onDeleteProfile}
             onToggleStar={onToggleStar}
           />

       {/* Settings Section */}
       <div className="sidebar-bottom-group">
         {showPasswordManager && <SidebarPasswordManager onNavigate={onGoToPasswordManager} />}
         {showMailManager && <SidebarMailManager onNavigate={onGoToMailManager} />}
         {showCharacterHub && <SidebarCharacterHub onNavigate={onGoToCharacterHub} />}
         {showFreedcamp && <SidebarFreedcamp onNavigate={onGoToFreedcamp} />}
         <SidebarSettings onOpenSettings={onOpenSettings} />
       </div>
     </aside>
   );
 }
