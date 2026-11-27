/**
 * Sidebar Component - Container principal con 3 sub-componentes
 */

import React, { useContext } from 'react';
import type { BrowserProfile, ProfileFolder } from '@xpm/core';
import SidebarDashboard from './SidebarDashboard';
import SidebarFolders from './SidebarFolders';
import SidebarPasswordManager from './SidebarPasswordManager';
import SidebarMailManager from './SidebarMailManager';
import SidebarCharacterHub from './SidebarCharacterHub';
import SidebarFreedcamp from './SidebarFreedcamp';
import SidebarSettings from './SidebarSettings';
import SidebarPostHelper from './SidebarPostHelper';
import { NavigationContext, SidebarLayoutContext } from '../navigation';
import { ProfileLabelFilterContext, isProfileVisible } from '../profileLabels';
import type { SidebarItemId } from '../sidebarLayout';
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
  const { goToPostHelper } = useContext(NavigationContext);
  const { order, showPostHelper } = useContext(SidebarLayoutContext);
  const { visibleLabels } = useContext(ProfileLabelFilterContext);

  // Los perfiles con una etiqueta oculta no aparecen en la barra lateral; los contadores se recalculan sin ellos
  const visibleProfiles = profiles.filter((p) => isProfileVisible(p, visibleLabels));
  const visibleCountByFolder = new Map<string | undefined, number>();
  for (const p of visibleProfiles) visibleCountByFolder.set(p.folderId, (visibleCountByFolder.get(p.folderId) || 0) + 1);
  const visibleOrdered = orderedProfiles
    ? new Map(Array.from(orderedProfiles, ([key, list]) => [key, list.filter((p) => isProfileVisible(p, visibleLabels))] as const))
    : undefined;
  const renderItem = (id: SidebarItemId): React.ReactNode => {
    switch (id) {
      case 'dashboard':
        return showDashboard !== false ? <SidebarDashboard key={id} onGoToDashboard={onGoToDashboard} /> : null;
      case 'post-helper':
        return showPostHelper ? <SidebarPostHelper key={id} onNavigate={goToPostHelper} /> : null;
      case 'password-manager':
        return showPasswordManager ? <SidebarPasswordManager key={id} onNavigate={onGoToPasswordManager} /> : null;
      case 'mail-manager':
        return showMailManager ? <SidebarMailManager key={id} onNavigate={onGoToMailManager} /> : null;
      case 'character-hub':
        return showCharacterHub ? <SidebarCharacterHub key={id} onNavigate={onGoToCharacterHub} /> : null;
      case 'freedcamp':
        return showFreedcamp ? <SidebarFreedcamp key={id} onNavigate={onGoToFreedcamp} /> : null;
      case 'settings':
        return <SidebarSettings key={id} onOpenSettings={onOpenSettings} />;
      default:
        return null;
    }
  };

  // Lo que va antes de 'folders' queda encima del árbol de carpetas; lo que va después, abajo
  const foldersIndex = order.indexOf('folders');
  const topItems = order.slice(0, foldersIndex);
  const bottomItems = order.slice(foldersIndex + 1);

  return (
    <aside className="sidebar">
      <div className="sidebar-top-group">{topItems.map(renderItem)}</div>

      {/* Folders Section */}
       <SidebarFolders
           folders={folders}
           profiles={visibleProfiles}
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
           profileCountByFolder={visibleCountByFolder}
            onLaunchProfile={onLaunchProfile}
            onCloseProfile={onCloseProfile}
             onOpenAllInBrowser={onOpenAllInBrowser}
             onCloseAll={onCloseAll}
            activeStatuses={activeStatuses}
             onMoveProfileToFolder={onMoveProfileToFolder}
             onGoToFolders={onGoToFolders}
             orderedProfiles={visibleOrdered}
             onToggleAllFolders={onToggleAllFolders}
             onEditProfile={onEditProfile}
             onDeleteProfile={onDeleteProfile}
             onToggleStar={onToggleStar}
           />

       <div className="sidebar-bottom-group">{bottomItems.map(renderItem)}</div>
     </aside>
   );
 }
