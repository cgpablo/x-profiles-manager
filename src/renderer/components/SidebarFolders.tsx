/**
 * SidebarFolders Component - Folders section in sidebar
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ProfileFolder, ChromeProfile } from '../../types';
import Tooltip from './Tooltip';
import './SidebarFolders.css';

interface SidebarFoldersProps {
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
  onGoToFolders?: () => void;
  orderedProfiles?: Map<string | 'ungrouped', ChromeProfile[]>;
}

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
}: SidebarFoldersProps) {
  const [showContextMenu, setShowContextMenu] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [profileContextMenu, setProfileContextMenu] = useState<string | null>(null);
  const [profileContextMenuPos, setProfileContextMenuPos] = useState({ x: 0, y: 0 });
  const contextMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const profileContextMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [draggedProfile, setDraggedProfile] = useState<ChromeProfile | null>(null);

  // Close context menu on Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowContextMenu(null);
        setProfileContextMenu(null);
      }
    };

    if (showContextMenu || profileContextMenu) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showContextMenu, profileContextMenu]);

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
    if (window.confirm('Are you sure you want to delete this folder? Any profiles in it will remain.')) {
      onDeleteFolder(folderId);
      setShowContextMenu(null);
    }
  };

   return (
     <div className="sidebar-folders" ref={sidebarRef}>
       <div className="sidebar-section-header">
         <h3>📁 FOLDERS</h3>
         <Tooltip text="New Folder" position="right">
           <button
             className="btn-add-folder"
             onClick={onCreateFolder}
             aria-label="New Folder"
           >
             +
           </button>
         </Tooltip>
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
                   <span className="folder-icon">📌</span>
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
                   <span className="profile-count">{ungroupedCount}</span>
                   <Tooltip text="New Profile" position="right">
                     <button
                       className="btn-add-folder"
                       onClick={(e) => {
                         e.stopPropagation();
                         onCreateProfile?.(undefined);
                       }}
                       aria-label="New Profile"
                     >
                       +
                     </button>
                   </Tooltip>
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
                                 window.electronAPI.launcher.focusWindow(profile.id).catch(console.error);
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
                            const menuHeight = 140;
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
                            setShowContextMenu(null);
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
                          <span className="profile-icon">{profile.name.charAt(0).toUpperCase()}</span>
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
                                >
                                 {!isBrowserActive ? (
                                     <button
                                       onClick={() => {
                                         onLaunchProfile?.(profile.id);
                                         setProfileContextMenu(null);
                                       }}
                                       className="context-menu-item"
                                     >
                                       🌐 Open in browser
                                     </button>
                                   ) : (
                                     <button
                                       onClick={() => {
                                         onCloseProfile?.(profile.id);
                                         setProfileContextMenu(null);
                                      }}
                                      className="context-menu-item"
                                    >
                                      ✕ Close browser
                                    </button>
                                  )}
                                {onMoveProfileToFolder && folders.length > 0 && (
                                  <>
                                    <div className="context-menu-divider" />
                                    <div className="context-menu-section">Move to</div>
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
                    }}
                  >
                    <span className="folder-icon">📁</span>
                    <span className="folder-label">{folder.name}</span>
                    {/* Badge moved to profile level - active indicator now shows per profile, not per folder */}
                  </button>

                  <span className="profile-count">{allProfileCount}</span>

                <Tooltip text="New Profile" position="right">
                  <button
                    className="btn-add-folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateProfile?.(folder.id);
                    }}
                    aria-label="New Profile"
                  >
                    +
                  </button>
                </Tooltip>

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
                                 window.electronAPI.launcher.focusWindow(profile.id).catch(console.error);
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
                              const menuHeight = 140;
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
                            <span className="profile-icon">{profile.name.charAt(0).toUpperCase()}</span>
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
                                 >
                                   {!isBrowserActive ? (
                                     <button
                                      onClick={() => {
                                        onLaunchProfile?.(profile.id);
                                        setProfileContextMenu(null);
                                      }}
                                      className="context-menu-item"
                                    >
                                      🌐 Open in browser
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        onCloseProfile?.(profile.id);
                                        setProfileContextMenu(null);
                                      }}
                                      className="context-menu-item"
                                    >
                                      ✕ Close browser
                                    </button>
                                  )}
                                {onMoveProfileToFolder && folders.length > 0 && (
                                  <>
                                    <div className="context-menu-divider" />
                                    <div className="context-menu-section">Move to</div>
                                    {folders
                                      .filter((f) => f.id !== folder.id)
                                      .map((f) => (
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
                                     <button
                                       className="context-menu-item"
                                       onClick={() => {
                                         onMoveProfileToFolder(profile.id, undefined);
                                         setProfileContextMenu(null);
                                       }}
                                     >
                                       📌 OTHERS
                                     </button>
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
                   🌐 Open All in Browser
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
                    ✕ Close All
                  </button>
                 ) : null;
                })()}
            {showContextMenu !== 'ungrouped' && (
              <>
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
                  ✎ Edit
                </button>
                <button
                  className="context-menu-item context-menu-delete"
                  onClick={() => {
                    if (showContextMenu) {
                      handleDeleteFolder(showContextMenu);
                    }
                  }}
                >
                  🗑️ Delete
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
    </div>
  );
}
