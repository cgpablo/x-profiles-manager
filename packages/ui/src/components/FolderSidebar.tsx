/**
 * FolderSidebar Component - Sidebar vertical con carpetas/tabs
 */

import React, { useState, useEffect, useRef } from 'react';
import { Folder, Pin, Rocket, X } from 'reicon-react';
import type { ProfileFolder, BrowserProfile } from '@xpm/core';
import ProfileAvatarIcon from './ProfileAvatarIcon';
import './FolderSidebar.css';

interface FolderSidebarProps {
  folders: ProfileFolder[];
  profiles: BrowserProfile[];
  selectedFolderId: string | null | 'ungrouped';
  expandedFolders: Set<string>;
  onSelectFolder: (folderId: string | null | 'ungrouped') => void;
  onToggleFolder: (folderId: string) => void;
  onCreateFolder: () => void;
  onEditFolder: (folder: ProfileFolder) => void;
  onDeleteFolder: (folderId: string) => void;
  profileCountByFolder: Map<string | undefined, number>;
  onLaunchProfile?: (profileId: string) => void;
  onCloseProfile?: (profileId: string) => void;
  activeStatuses?: Map<string, boolean>;
  onMoveProfileToFolder?: (profileId: string, folderId: string | undefined) => void;
}


export default function FolderSidebar({
  folders,
  profiles,
  selectedFolderId,
  expandedFolders,
  onSelectFolder,
  onToggleFolder,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  profileCountByFolder,
  onLaunchProfile,
  onCloseProfile,
  activeStatuses = new Map(),
  onMoveProfileToFolder,
}: FolderSidebarProps) {
  const [showContextMenu, setShowContextMenu] = useState<string | null>(null);
  const [profileContextMenu, setProfileContextMenu] = useState<string | null>(null);
  const contextMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const profileContextMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [draggedProfile, setDraggedProfile] = useState<BrowserProfile | null>(null);

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
    <div className="folder-sidebar" ref={sidebarRef}>
      <div className="sidebar-header">
        <h3><Folder size={14} weight="Filled" /> Folders</h3>
        <button
          className="btn-add-folder"
          onClick={onCreateFolder}
          title="Create new folder"
        >
          +
        </button>
      </div>

      <nav className="folder-list">
        {/* Folders divider - siempre mostrar si hay carpetas */}
        {(() => {
          const ungroupedCount = profiles.filter((p) => !p.folderId).length;
          return (folders.length > 0 || ungroupedCount > 0) ? (
            <div className="folders-divider">
              <span>Folders</span>
            </div>
          ) : null;
        })()}

        {/* OTHERS - Mostrar solo si hay profiles sin folder */}
        {(() => {
          const ungroupedCount = profiles.filter((p) => !p.folderId).length;
          const othersColor = '#6b7280'; // Gray color for OTHERS
          return ungroupedCount > 0 ? (
            <div
              className={`folder-item ${selectedFolderId === 'ungrouped' ? 'active' : ''}`}
              onClick={() => {
                onSelectFolder('ungrouped');
                setShowContextMenu(null);
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
              <span className="folder-icon"><Pin size={14} weight="Filled" /></span>
              <span className="folder-label">OTHERS</span>
              <span className="profile-count">{ungroupedCount}</span>
            </div>
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
                  disabled={activeProfileCount === 0}
                  style={{ visibility: activeProfileCount === 0 ? 'hidden' : 'visible' }}
                >
                  ▶
                </button>

                <button
                  className="folder-name-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectFolder(folder.id);
                    setShowContextMenu(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowContextMenu(isContextMenuOpen ? null : folder.id);
                  }}
                >
                  <span className="folder-icon"><Folder size={14} weight="Filled" /></span>
                  <span className="folder-label">{folder.name}</span>
                </button>

                <span className="profile-count">{allProfileCount}</span>

                {/* Context Menu */}
                {isContextMenuOpen && (
                  <div
                    className="context-menu"
                    ref={(el) => {
                      if (el) {
                        contextMenuRefs.current.set(folder.id, el);
                      } else {
                        contextMenuRefs.current.delete(folder.id);
                      }
                    }}
                  >
                    <button
                      onClick={() => {
                        onEditFolder(folder);
                        setShowContextMenu(null);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="context-menu-delete"
                      onClick={() => handleDeleteFolder(folder.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Expanded indicator line */}
              {isExpanded && activeProfileCount > 0 && (
                <div className="folder-expanded-indicator" />
              )}

              {/* Expanded profiles list - solo profiles activos */}
              {isExpanded && (
                <div className="folder-profiles-list">
                  {profiles
                    .filter((p) => p.folderId === folder.id && (activeStatuses?.get(p.id) || false))
                    .map((profile) => {
                      const isProfileContextOpen = profileContextMenu === profile.id;
                      const isActive = activeStatuses?.get(profile.id) || false;

                      return (
                        <div
                          key={profile.id}
                          className={`profile-item ${selectedFolderId === folder.id ? '' : 'nested'} ${draggedProfile?.id === profile.id ? 'dragging' : ''}`}
                          onClick={() => {
                            onSelectFolder(folder.id);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setProfileContextMenu(isProfileContextOpen ? null : profile.id);
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

                          {/* Profile Context Menu */}
                          {isProfileContextOpen && (
                            <div
                              className="profile-context-menu"
                              ref={(el) => {
                                if (el) {
                                  profileContextMenuRefs.current.set(profile.id, el);
                                } else {
                                  profileContextMenuRefs.current.delete(profile.id);
                                }
                              }}
                            >
                              {!isActive ? (
                                <button
                                  onClick={() => {
                                    onLaunchProfile?.(profile.id);
                                    setProfileContextMenu(null);
                                  }}
                                  className="context-menu-item"
                                >
                                  <><Rocket size={14} weight="Outline" /> Launch</>
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    onCloseProfile?.(profile.id);
                                    setProfileContextMenu(null);
                                  }}
                                  className="context-menu-item"
                                >
                                  <><X size={14} weight="Outline" /> Close</>
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
                                     <><Pin size={14} weight="Filled" /> OTHERS</>
                                   </button>
                                </>
                              )}
                            </div>
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
