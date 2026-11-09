/**
 * SidebarFolders Component - Folders section in sidebar
 */

import React, { useState, useEffect, useRef } from 'react';
import { getPlatformAPI } from '../platform';
import { createPortal } from 'react-dom';
import { Pin, Folder, FolderBookmark, FolderConnect, Globe, X, Star, Bookmarks, Pen, Trash, Plus, ChatRound } from 'reicon-react';
import type { ProfileFolder, BrowserProfile } from '@xpm/core';
import Tooltip from './Tooltip';
import ProfileAvatarIcon from './ProfileAvatarIcon';
import DeleteConfirmModal from './DeleteProfileConfirmModal';
import CharacterInfoModal from './CharacterInfoModal';
import './SidebarFolders.css';

interface SidebarFoldersProps {
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
  onGoToFolders?: () => void;
  orderedProfiles?: Map<string | 'ungrouped', BrowserProfile[]>;
  onToggleAllFolders?: (expand: boolean) => void;
  onEditProfile?: (profile: BrowserProfile) => void;
  onDeleteProfile?: (profileId: string) => void;
  onToggleStar?: (profileId: string) => void;
}

import { useCapabilities } from '../hooks/usePlatformAPI';

export default function SidebarFolders({
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
  onGoToFolders,
  orderedProfiles,
  onToggleAllFolders,
  onEditProfile,
  onDeleteProfile,
  onToggleStar,
}: SidebarFoldersProps) {
  const caps = useCapabilities();
  const [showContextMenu, setShowContextMenu] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [profileContextMenu, setProfileContextMenu] = useState<string | null>(null);
  const [profileContextMenuPos, setProfileContextMenuPos] = useState({ x: 0, y: 0 });
  const contextMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const profileContextMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [draggedProfile, setDraggedProfile] = useState<BrowserProfile | null>(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [headerMenuPos, setHeaderMenuPos] = useState({ x: 0, y: 0 });
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const [moveSectionExpanded, setMoveSectionExpanded] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<BrowserProfile | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<ProfileFolder | null>(null);
  const [characterInfoProfile, setCharacterInfoProfile] = useState<BrowserProfile | null>(null);

  // Close context menus on Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowContextMenu(null);
        setProfileContextMenu(null);
        setShowHeaderMenu(false);
      }
    };

    if (showContextMenu || profileContextMenu || showHeaderMenu) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showContextMenu, profileContextMenu, showHeaderMenu]);

  // Close header context menu on click outside
  useEffect(() => {
    if (!showHeaderMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showHeaderMenu]);

  // Reset "Move to" section to collapsed whenever a profile context menu opens/closes
  useEffect(() => {
    setMoveSectionExpanded(false);
  }, [profileContextMenu]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const contextMenu = contextMenuRefs.current.get(showContextMenu || '');
      if (
        contextMenu &&
        !contextMenu.contains(e.target as Node) &&
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target as Node)
      ) {
        setShowContextMenu(null);
      } else if (
        showContextMenu &&
        contextMenuRefs.current.get(showContextMenu) &&
        !contextMenuRefs.current.get(showContextMenu)!.contains(e.target as Node)
      ) {
        // Check if clicked somewhere else in sidebar
        if (sidebarRef.current && sidebarRef.current.contains(e.target as Node)) {
          setShowContextMenu(null);
        }
      }

      // Close profile context menu on click outside
      const profileMenu = profileContextMenuRefs.current.get(profileContextMenu || '');
      if (
        profileMenu &&
        !profileMenu.contains(e.target as Node) &&
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target as Node)
      ) {
        setProfileContextMenu(null);
      } else if (
        profileContextMenu &&
        profileContextMenuRefs.current.get(profileContextMenu) &&
        !profileContextMenuRefs.current.get(profileContextMenu)!.contains(e.target as Node)
      ) {
        if (sidebarRef.current && sidebarRef.current.contains(e.target as Node)) {
          setProfileContextMenu(null);
        }
      }
    };

    if (showContextMenu || profileContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu, profileContextMenu]);

  const handleDeleteFolder = (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      setFolderToDelete(folder);
      setShowContextMenu(null);
    }
  };

  const ungroupedForHeader = profiles.filter(p => !p.folderId).length;
  const anyExpanded =
    folders.some(f => expandedFolders.has(f.id)) ||
    (ungroupedForHeader > 0 && expandedOthers);

  const handleToggleAllFolders = () => {
    onToggleAllFolders?.(!anyExpanded);
  };

  const handleHeaderMenuClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setHeaderMenuPos({ x: rect.left, y: rect.bottom + 4 });
    setShowHeaderMenu(prev => !prev);
    setShowContextMenu(null);
    setProfileContextMenu(null);
  };

  const openFolderContextMenu = (e: React.MouseEvent<HTMLButtonElement>, menuId: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    let x = rect.left;
    let y = rect.bottom + 4;
    const menuWidth = 160;
    const menuHeight = 160;
    const padding = 10;
    if (x + menuWidth + padding > window.innerWidth) x = rect.right - menuWidth;
    if (y + menuHeight + padding > window.innerHeight) y = rect.top - menuHeight - 4;
    setContextMenuPos({ x, y });
    setShowContextMenu(showContextMenu === menuId ? null : menuId);
    setProfileContextMenu(null);
    setShowHeaderMenu(false);
  };

   return (
     <div className="sidebar-folders" ref={sidebarRef}>
       {/* Header outside scroll container — always visible as fixed flex item */}
       <div className="sidebar-section-header">
         <button
           className="sidebar-section-header-title"
           onClick={() => { onSelectFolder(null); onGoToFolders?.(); }}
           title="Show all profiles"
         >
             <h3><span><Folder size={14} weight="Outline" /></span><span>FOLDERS</span></h3>
         </button>
         <div className="sidebar-header-actions">
           <button
             className="btn-add-folder"
             onClick={handleToggleAllFolders}
             title={anyExpanded ? 'Collapse all folders' : 'Expand all folders'}
             aria-label={anyExpanded ? 'Collapse all' : 'Expand all'}
           >
             {anyExpanded ? '−' : '+'}
           </button>
           <button
             className="btn-folder-menu"
             onClick={handleHeaderMenuClick}
             aria-label="Folder options"
           >
             ⋮
           </button>
         </div>
       </div>
       <nav className="sidebar-section-content folder-list">
         {/* OTHERS - Mostrar solo si hay profiles sin folder */}
           {(() => {
             const ungroupedCount = profiles.filter((p) => !p.folderId).length;
             const othersColor = '#6b7280'; // Gray color for OTHERS
             const isContextMenuOpen = showContextMenu === 'ungrouped';
             return ungroupedCount > 0 ? (
              <>
               <div className="folder-item-wrapper">
                <div
                   className={`folder-item ${selectedFolderId === 'ungrouped' ? 'active' : ''}`}
                   onClick={() => {
                     onSelectFolder('ungrouped');
                     setShowContextMenu(null);
                     onGoToFolders?.();
                   }}
                   style={{
                     backgroundColor:
                       selectedFolderId === 'ungrouped'
                         ? `${othersColor}20`
                         : 'transparent',
                     borderLeftColor:
                       selectedFolderId === 'ungrouped' ? othersColor : 'transparent',
                   }}
                  >
                   <button
                     className={`folder-toggle ${expandedOthers ? 'expanded' : ''}`}
                     onClick={(e) => {
                       e.stopPropagation();
                       onToggleOthers?.();
                     }}
                     title={expandedOthers ? 'Collapse' : 'Expand'}
                     style={{ visibility: ungroupedCount === 0 ? 'hidden' : 'visible' }}
                   >
                     ▶
                   </button>
                     <span className="folder-icon"><FolderBookmark size={14} weight="Outline" /></span>
                   <button
                     className="folder-name-btn"
                     onClick={(e) => {
                       e.stopPropagation();
                       onSelectFolder('ungrouped');
                       setShowContextMenu(null);
                       onGoToFolders?.();
                     }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        let x = e.clientX + 10;
                        let y = e.clientY - 50;
                        
                        const menuWidth = 160;
                        // Calculate menu height dynamically based on visible items
                        // Each item is approximately 32px (0.5rem padding top + bottom + 0.875rem font size)
                        let menuHeight = 10; // base padding
                        if (onOpenAllInBrowser) menuHeight += 32;
                        if (onCloseAll) menuHeight += 32;
                        const padding = 10;
                        
                        if (x + menuWidth + padding > window.innerWidth) {
                          x = e.clientX - menuWidth - 10;
                        }
                        
                        if (y < padding) {
                          y = e.clientY + 10;
                        }
                        
                        if (y + menuHeight + padding > window.innerHeight) {
                          y = e.clientY - menuHeight - 10;
                        }
                        
                         setContextMenuPos({ x, y });
                         setShowContextMenu(isContextMenuOpen ? null : 'ungrouped');
                         setProfileContextMenu(null);
                         setShowHeaderMenu(false);
                       }}
                     style={{
                       flex: 1,
                       textAlign: 'left',
                       padding: '0',
                       border: 'none',
                       background: 'transparent',
                       color: 'inherit',
                       cursor: 'pointer',
                     }}
                   >
                     <span className="folder-label">OTHERS</span>
                   </button>
                     <div className="folder-item-right">
                       <span className="profile-count">{ungroupedCount}</span>
                       <button
                         className="btn-folder-menu"
                         onClick={(e) => openFolderContextMenu(e, 'ungrouped')}
                         aria-label="Folder options"
                        >
                          ⋮
                        </button>
                      </div>
                   </div>

               {/* Expanded OTHERS profiles list */}
               {expandedOthers && ungroupedCount > 0 && (
                 <div className="folder-profiles-list">
                   {(orderedProfiles?.get('ungrouped') || profiles.filter((p) => !p.folderId))
                      .map((profile) => {
                         const isProfileContextOpen = profileContextMenu === profile.id;
                         const isBrowserActive = activeStatuses?.get(profile.id) || false;
                         const isActive = isBrowserActive;

                          return (
                            <div
                              key={profile.id}
                              className={`profile-item ${selectedFolderId === 'ungrouped' ? '' : 'nested'} ${draggedProfile?.id === profile.id ? 'dragging' : ''} ${isActive ? 'active' : ''}`}
                             onClick={() => {
                               if (isActive) {
                                 // If profile is active, focus the window
                                 getPlatformAPI().launcher.focusWindow(profile.id).catch(console.error);
                               } else {
                                 // If inactive, select the folder
                                 onSelectFolder('ungrouped');
                                 onGoToFolders?.();
                               }
                             }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            let x = e.clientX + 10;
                            let y = e.clientY - 50;
                            
                            const menuWidth = 160;
                             const menuHeight = 204;
                            const padding = 10;
                            
                            if (x + menuWidth + padding > window.innerWidth) {
                              x = e.clientX - menuWidth - 10;
                            }
                            
                            if (y < padding) {
                              y = e.clientY + 10;
                            }
                            
                            if (y + menuHeight + padding > window.innerHeight) {
                              y = e.clientY - menuHeight - 10;
                            }
                            
                              setProfileContextMenuPos({ x, y });
                              setProfileContextMenu(isProfileContextOpen ? null : profile.id);
                              setShowContextMenu(null);
                              setShowHeaderMenu(false);
                            }}
                          draggable
                          onDragStart={() => {
                            setDraggedProfile(profile);
                          }}
                          onDragEnd={() => {
                            setDraggedProfile(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedProfile && draggedProfile.id !== profile.id) {
                              onMoveProfileToFolder?.(draggedProfile.id, undefined);
                            }
                          }}
                        >
                           <ProfileAvatarIcon profile={profile} />
                            <span className="profile-label">{profile.name}</span>

                           {/* Profile Context Menu - Rendered via Portal */}
                           {isProfileContextOpen && createPortal(
                             <div
                               className="profile-context-menu"
                               style={{
                                 left: `${profileContextMenuPos.x}px`,
                                 top: `${profileContextMenuPos.y}px`,
                               }}
                               ref={(el) => {
                                 if (el) {
                                   profileContextMenuRefs.current.set(profile.id, el);
                                  } else {
                                     profileContextMenuRefs.current.delete(profile.id);
                                   }
                                  }}
                                   onClick={(e) => e.stopPropagation()}
                                   >
                                    <div className="context-menu-label">Profile</div>
                                   {!isBrowserActive ? (
                                       <button
                                         onClick={() => {
                                          onLaunchProfile?.(profile.id);
                                          setProfileContextMenu(null);
                                        }}
                                        className="context-menu-item"
                                       >
                                         <><Globe size={12} /> Open</>
                                       </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                           onCloseProfile?.(profile.id);
                                           setProfileContextMenu(null);
                                        }}
                                        className="context-menu-item"
                                      >
                                        <><X size={12} /> Close</>
                                     </button>
                                    )}
                                    <button
                                      className="context-menu-item"
                                      onClick={() => {
                                        getPlatformAPI().launcher.openChat(profile.id).catch(console.error);
                                        setProfileContextMenu(null);
                                      }}
                                    >
                                      <><ChatRound size={12} /> Chat</>
                                    </button>
                                   {onToggleStar && profile.locked === false && (
                                     <button
                                       className="context-menu-item"
                                       onClick={() => { onToggleStar(profile.id); setProfileContextMenu(null); }}
                                     >
                                        {profile.starred ? <><Star size={12} weight="Filled" /> Remove favorite</> : <><Star size={12} weight="Outline" /> Add favorite</>}
                                      </button>
                                    )}
                                     {profile.directoryPath && caps.openDirectory && (
                                       <button
                                         className="context-menu-item"
                                         onClick={() => {
                                           getPlatformAPI().shell.openPath(profile.directoryPath!).catch(console.error);
                                           setProfileContextMenu(null);
                                         }}
                                       >
                                         <><FolderConnect size={12} weight="Outline" /> Open directory</>
                                       </button>
                                     )}
                                     {((profile.fcInfo?.ig?.length ?? 0) > 0 || (profile.fcInfo?.x?.length ?? 0) > 0 || (profile.fcInfo?.sc?.length ?? 0) > 0) && (
                                       <button
                                         className="context-menu-item"
                                         onClick={() => { setCharacterInfoProfile(profile); setProfileContextMenu(null); }}
                                       >
                                          <><Bookmarks size={12} weight="Outline" /> Character info</>
                                      </button>
                                    )}
                                    {onEditProfile && profile.locked === false && (
                                      <button
                                        className="context-menu-item"
                                        onClick={() => { onEditProfile(profile); setProfileContextMenu(null); }}
                                      >
                                        <><Pen size={12} /> Edit</>
                                      </button>
                                    )}
                                    {onDeleteProfile && profile.locked === false && (
                                      <button
                                        className="context-menu-item context-menu-delete"
                                        onClick={() => { setProfileToDelete(profile); setProfileContextMenu(null); }}
                                      >
                                        <><Trash size={12} /> Delete</>
                                      </button>
                                    )}
                                    {onMoveProfileToFolder && folders.length > 0 && (
                                      <>
                                        <div className="context-menu-divider" />
                                        <button
                                          className="context-menu-section"
                                          onClick={(e) => { e.stopPropagation(); setMoveSectionExpanded(p => !p); }}
                                       >
                                         <span className={`context-menu-section-arrow${moveSectionExpanded ? ' expanded' : ''}`}>▶</span>
                                         Move to
                                       </button>
                                       {moveSectionExpanded && (
                                         <div className="context-menu-move-items">
                                           {folders.map((f) => (
                                            <button
                                              key={f.id}
                                              className="context-menu-item"
                                              onClick={() => {
                                                onMoveProfileToFolder(profile.id, f.id);
                                                setProfileContextMenu(null);
                                              }}
                                            >
                                              {f.icon} {f.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              , document.body
                             )}
                           </div>
                         );
                        })}
                     </div>
                   )}
                </div>
                 </>
               ) : null;
             })()}

         {/* Folders - mostrar todas, pero solo expandir si tienen profiles activos */}
         {folders.map((folder) => {
            const allProfileCount = profileCountByFolder.get(folder.id) || 0;
            const activeProfileCount = profiles.filter(
              (p) => p.folderId === folder.id && (activeStatuses?.get(p.id) || false)
            ).length;
            
            const isExpanded = expandedFolders.has(folder.id);
            const isContextMenuOpen = showContextMenu === folder.id;

            return (
              <div key={folder.id} className="folder-item-wrapper">
                <div
                  className={`folder-item ${selectedFolderId === folder.id ? 'active' : ''}`}
                  style={{
                    backgroundColor:
                      selectedFolderId === folder.id
                        ? `${folder.color}20`
                        : 'transparent',
                    borderLeftColor:
                      selectedFolderId === folder.id ? folder.color : 'transparent',
                  }}
                >
                  <button
                    className={`folder-toggle ${isExpanded ? 'expanded' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFolder(folder.id);
                    }}
                    title={isExpanded ? 'Collapse' : 'Expand'}
                    disabled={allProfileCount === 0}
                    style={{ visibility: allProfileCount === 0 ? 'hidden' : 'visible' }}
                  >
                    ▶
                  </button>

                  <button
                    className="folder-name-btn"
                     onClick={(e) => {
                       e.stopPropagation();
                       onSelectFolder(folder.id);
                       setShowContextMenu(null);
                       onGoToFolders?.();
                     }}
                     onContextMenu={(e) => {
                       e.preventDefault();
                       e.stopPropagation();
                       
                       let x = e.clientX + 10;
                       let y = e.clientY - 50;
                       
                       const menuWidth = 160;
                       // Calculate menu height dynamically based on visible items
                       // Each item is approximately 32px
                       let menuHeight = 10; // base padding
                       if (onOpenAllInBrowser) menuHeight += 32;
                       if (onCloseAll) menuHeight += 32;
                       // Edit and Delete buttons are always shown for regular folders
                       menuHeight += 64; // for Edit and Delete
                       const padding = 10;
                       
                       if (x + menuWidth + padding > window.innerWidth) {
                         x = e.clientX - menuWidth - 10;
                       }
                       
                       if (y < padding) {
                         y = e.clientY + 10;
                       }
                       
                       if (y + menuHeight + padding > window.innerHeight) {
                         y = e.clientY - menuHeight - 10;
                       }
                       
                        setContextMenuPos({ x, y });
                        setShowContextMenu(isContextMenuOpen ? null : folder.id);
                        setProfileContextMenu(null);
                        setShowHeaderMenu(false);
                      }}
                   >
                      <span className="folder-icon"><Folder size={14} weight="Outline" /></span>
                     <span className="folder-label">{folder.name}</span>
                    {/* Badge moved to profile level - active indicator now shows per profile, not per folder */}
                  </button>

                   <div className="folder-item-right">
                     <span className="profile-count">{allProfileCount}</span>

                     <button
                       className="btn-folder-menu"
                       onClick={(e) => openFolderContextMenu(e, folder.id)}
                       aria-label="Folder options"
                     >
                       ⋮
                     </button>
                   </div>

                 </div>

               {/* Expanded indicator line */}
               {isExpanded && allProfileCount > 0 && (
                 <div className="folder-expanded-indicator" />
               )}

                {/* Expanded profiles list - mostrar todos los profiles */}
                {isExpanded && (
                  <div className="folder-profiles-list">
                    {(orderedProfiles?.get(folder.id) || profiles.filter((p) => p.folderId === folder.id))
                       .map((profile) => {
                        const isProfileContextOpen = profileContextMenu === profile.id;
                        const isBrowserActive = activeStatuses?.get(profile.id) || false;
                        const isActive = isBrowserActive;

                       return (
                          <div
                            key={profile.id}
                            className={`profile-item ${selectedFolderId === folder.id ? '' : 'nested'} ${draggedProfile?.id === profile.id ? 'dragging' : ''} ${isActive ? 'active' : ''}`}
                             onClick={() => {
                               if (isActive) {
                                 // If profile is active, focus the window
                                 getPlatformAPI().launcher.focusWindow(profile.id).catch(console.error);
                               } else {
                                 // If inactive, select the folder
                                 onSelectFolder(folder.id);
                                 onGoToFolders?.();
                               }
                             }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              
                              // Calculate position for fixed menu
                              let x = e.clientX + 10;
                              let y = e.clientY - 50; // Default: open slightly upwards
                              
                              const menuWidth = 160;
                               const menuHeight = 204;
                              const padding = 10;
                              
                              // Adjust x if menu would go off-screen to the right
                              if (x + menuWidth + padding > window.innerWidth) {
                                x = e.clientX - menuWidth - 10;
                              }
                              
                              // If menu would go off-screen to the top, open downwards
                              if (y < padding) {
                                y = e.clientY + 10;
                              }
                              
                              // If menu would go off-screen to the bottom, open upwards
                              if (y + menuHeight + padding > window.innerHeight) {
                                y = e.clientY - menuHeight - 10;
                              }
                              
                              setProfileContextMenuPos({ x, y });
                              setProfileContextMenu(isProfileContextOpen ? null : profile.id);
                              setShowContextMenu(null);
                              setShowHeaderMenu(false);
                            }}
                           draggable
                           onDragStart={() => {
                             setDraggedProfile(profile);
                           }}
                           onDragEnd={() => {
                             setDraggedProfile(null);
                           }}
                           onDragOver={(e) => {
                             e.preventDefault();
                             e.dataTransfer.dropEffect = 'move';
                           }}
                           onDrop={(e) => {
                             e.preventDefault();
                             if (draggedProfile && draggedProfile.id !== profile.id) {
                               onMoveProfileToFolder?.(draggedProfile.id, folder.id);
                             }
                           }}
                         >
                             <ProfileAvatarIcon profile={profile} />
                              <span className="profile-label">{profile.name}</span>

                               {/* Profile Context Menu - Rendered via Portal */}
                               {isProfileContextOpen && createPortal(
                                <div
                                  className="profile-context-menu"
                                  style={{
                                    left: `${profileContextMenuPos.x}px`,
                                    top: `${profileContextMenuPos.y}px`,
                                  }}
                                  ref={(el) => {
                                    if (el) {
                                      profileContextMenuRefs.current.set(profile.id, el);
                                    } else {
                                      profileContextMenuRefs.current.delete(profile.id);
                                     }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="context-menu-label">Profile</div>
                                      {!isBrowserActive ? (
                                       <button
                                        onClick={() => {
                                         onLaunchProfile?.(profile.id);
                                         setProfileContextMenu(null);
                                       }}
                                       className="context-menu-item"
                                      >
                                        <><Globe size={12} /> Open</>
                                       </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                           onCloseProfile?.(profile.id);
                                           setProfileContextMenu(null);
                                         }}
                                         className="context-menu-item"
                                       >
                                         <><X size={12} /> Close</>
                                      </button>
                                    )}
                                    {onToggleStar && profile.locked === false && (
                                      <button
                                        className="context-menu-item"
                                        onClick={() => { onToggleStar(profile.id); setProfileContextMenu(null); }}
                                      >
                                        {profile.starred ? <><Star size={12} weight="Filled" /> Remove favorite</> : <><Star size={12} weight="Outline" /> Add favorite</>}
                                      </button>
                                    )}
                                     {profile.directoryPath && caps.openDirectory && (
                                       <button
                                         className="context-menu-item"
                                         onClick={() => {
                                           getPlatformAPI().shell.openPath(profile.directoryPath!).catch(console.error);
                                           setProfileContextMenu(null);
                                         }}
                                       >
                                         <><FolderConnect size={12} weight="Outline" /> Open directory</>
                                       </button>
                                     )}
                                     {((profile.fcInfo?.ig?.length ?? 0) > 0 || (profile.fcInfo?.x?.length ?? 0) > 0 || (profile.fcInfo?.sc?.length ?? 0) > 0) && (
                                       <button
                                         className="context-menu-item"
                                         onClick={() => { setCharacterInfoProfile(profile); setProfileContextMenu(null); }}
                                       >
                                         <><Bookmarks size={12} weight="Outline" /> Character info</>
                                      </button>
                                    )}
                                    {onEditProfile && profile.locked === false && (
                                     <button
                                       className="context-menu-item"
                                       onClick={() => { onEditProfile(profile); setProfileContextMenu(null); }}
                                     >
                                       <><Pen size={12} /> Edit</>
                                     </button>
                                   )}
                                    {onDeleteProfile && profile.locked === false && (
                                      <button
                                        className="context-menu-item context-menu-delete"
                                        onClick={() => { setProfileToDelete(profile); setProfileContextMenu(null); }}
                                      >
                                        <><Trash size={12} /> Delete</>
                                     </button>
                                   )}
                                  {onMoveProfileToFolder && folders.length > 0 && (
                                  <>
                                    <div className="context-menu-divider" />
                                    <button
                                      className="context-menu-section"
                                      onClick={(e) => { e.stopPropagation(); setMoveSectionExpanded(p => !p); }}
                                    >
                                      <span className={`context-menu-section-arrow${moveSectionExpanded ? ' expanded' : ''}`}>▶</span>
                                      Move to
                                    </button>
                                    {moveSectionExpanded && (
                                      <>
                                        <button
                                          className="context-menu-item context-menu-others-sticky"
                                          onClick={() => {
                                            onMoveProfileToFolder(profile.id, undefined);
                                            setProfileContextMenu(null);
                                          }}
                                        >
                                             <Pin size={14} weight="Filled" /> OTHERS
                                         </button>
                                         <div className="context-menu-move-items">
                                           {folders.filter((f) => f.id !== folder.id).map((f) => (
                                              <button
                                                key={f.id}
                                                className="context-menu-item"
                                                onClick={() => {
                                                  onMoveProfileToFolder(profile.id, f.id);
                                                  setProfileContextMenu(null);
                                                }}
                                              >
                                                {f.icon} {f.name}
                                              </button>
                                            ))}
                                         </div>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            , document.body
                            )}
                         </div>
                       );
                     })}
                 </div>
               )}
            </div>
          );
        })}
      </nav>

       {/* Folder Context Menu - Rendered via Portal to avoid overflow clipping */}
       {showContextMenu && createPortal(
        <div
          className="context-menu"
          style={{
            left: `${contextMenuPos.x}px`,
            top: `${contextMenuPos.y}px`,
          }}
          ref={(el) => {
            if (el) {
              contextMenuRefs.current.set(showContextMenu, el);
            } else {
              contextMenuRefs.current.delete(showContextMenu || '');
            }
          }}
          >
            {onCreateProfile && (
              <>
                <div className="context-menu-label">Profiles</div>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    const folderId = showContextMenu === 'ungrouped' ? undefined : (showContextMenu ?? undefined);
                    onCreateProfile(folderId);
                    setShowContextMenu(null);
                  }}
                >
                   <><Plus size={14} /> New Profile</>
                </button>
              </>
            )}
            {onOpenAllInBrowser && (() => {
              const folderId = showContextMenu;
              const folderProfiles = folderId === 'ungrouped' 
                ? profiles.filter(p => !p.folderId)
                : profiles.filter(p => p.folderId === folderId);
              // Only show if folder has profiles AND not all are active
              const hasProfiles = folderProfiles.length > 0;
              const allActive = hasProfiles && folderProfiles.every(p =>
                activeStatuses?.get(p.id)
              );
               return hasProfiles && !allActive ? (
                 <button
                   className="context-menu-item"
                   onClick={() => {
                     if (showContextMenu) {
                       onOpenAllInBrowser(showContextMenu);
                       setShowContextMenu(null);
                     }
                   }}
                 >
                      <><Globe size={14} /> Open All</>
                 </button>
               ) : null;
            })()}
               {onCloseAll && (() => {
                 const folderId = showContextMenu;
                 const folderProfiles = folderId === 'ungrouped'
                   ? profiles.filter(p => !p.folderId)
                   : profiles.filter(p => p.folderId === folderId);
                 // Only show if folder has profiles AND all are active
                 const hasProfiles = folderProfiles.length > 0;
                 const allActive = hasProfiles && folderProfiles.every(p =>
                   activeStatuses?.get(p.id)
                 );
                return hasProfiles && allActive ? (
                  <button
                    className="context-menu-item"
                    onClick={() => {
                      console.log('=== CLOSE ALL CLICKED ===');
                      console.log('showContextMenu:', showContextMenu);
                      console.log('folderId:', folderId);
                      console.log('folderId type:', typeof folderId);
                      console.log('Local folderProfiles count:', folderProfiles.length);
                      console.log('Local folderProfiles names:', folderProfiles.map(p => p.name));
                      if (folderId) {
                        console.log('Calling onCloseAll with:', folderId);
                        onCloseAll(folderId);
                        setShowContextMenu(null);
                      }
                    }}
                  >
                     <><X size={12} /> Close All</>
                  </button>
                 ) : null;
                })()}
            {showContextMenu !== 'ungrouped' && (
              <>
                <div className="context-menu-label">Folder</div>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    const folder = folders.find((f) => f.id === showContextMenu);
                    if (folder) {
                      onEditFolder(folder);
                      setShowContextMenu(null);
                    }
                  }}
                >
                   <><Pen size={12} /> Edit</>
                </button>
                <button
                  className="context-menu-item context-menu-delete"
                  onClick={() => {
                    if (showContextMenu) {
                      handleDeleteFolder(showContextMenu);
                    }
                  }}
                >
                   <><Trash size={12} /> Delete</>
                </button>
              </>
             )}
         </div>
       , document.body)}

        {folders.length === 0 && (
         <div className="sidebar-empty">
           <p>No folders yet</p>
           <button className="btn-primary-small" onClick={onCreateFolder}>
             Create Folder
           </button>
         </div>
       )}

        {/* Header context menu — 3-dot button */}
        {showHeaderMenu && createPortal(
          <div
            className="context-menu"
            style={{ left: `${headerMenuPos.x}px`, top: `${headerMenuPos.y}px` }}
            ref={(el) => { headerMenuRef.current = el; }}
          >
            <div className="context-menu-label">FOLDERS</div>
            <button
              className="context-menu-item"
              onClick={() => { setShowHeaderMenu(false); onCreateFolder(); }}
            >
              + Add folder
            </button>
          </div>,
          document.body
        )}

        {/* Delete Profile Confirmation Modal */}
        {folderToDelete && (
          <DeleteConfirmModal
            title="Delete Folder"
            itemName={folderToDelete.name}
            onConfirm={() => { onDeleteFolder(folderToDelete.id); setFolderToDelete(null); }}
            onCancel={() => setFolderToDelete(null)}
          />
        )}
        {profileToDelete && (
          <DeleteConfirmModal
            title="Delete Profile"
            itemName={profileToDelete.name}
            onConfirm={() => { onDeleteProfile?.(profileToDelete.id); setProfileToDelete(null); }}
            onCancel={() => setProfileToDelete(null)}
          />
        )}
        {characterInfoProfile && (
          <CharacterInfoModal
            profile={characterInfoProfile}
            onClose={() => setCharacterInfoProfile(null)}
          />
        )}
      </div>
    );
}
