/**
 * Dashboard Component - Vista con 2 columnas: folders y profiles
 */

import React, { useState, useEffect, useRef } from 'react';
import { BrowserProfile, ProfileFolder } from '../../types';
import { useElectronAPI } from '../hooks/useElectronAPI';
import Sidebar from './Sidebar';
import ProfileTab from './ProfileTab';
import Tooltip from './Tooltip';
import ProfileModal from './ProfileModal';
import CreateFolderModal from './CreateFolderModal';
import EditFolderModal from './EditFolderModal';
import DeleteConfirmModal from './DeleteProfileConfirmModal';
import './Dashboard.css';

interface DashboardProps {
  folders: ProfileFolder[];
  profiles: BrowserProfile[];
  selectedFolderId: string | null | 'ungrouped' | '__online__' | '__search__' | '__starred__';
  onSelectFolder: (folderId: string | null | 'ungrouped' | '__online__' | '__search__') => void;
  onProfilesChange: () => void;
  onFoldersChange: () => void;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  expandedOthers: boolean;
  onToggleOthers: () => void;
  onGoToDashboard?: () => void;
  onGoToSettings?: () => void;
  onGoToFolders?: () => void;
  onOrderChange?: (orderedProfiles: Map<string | 'ungrouped', BrowserProfile[]>, orderedFolders: ProfileFolder[]) => void;
  activeStatuses?: Map<string, boolean>;
  onToggleAllFolders?: (expand: boolean) => void;
  showPasswordManager?: boolean;
  showMailManager?: boolean;
  showCharacterHub?: boolean;
  showFreedcamp?: boolean;
  showDashboard?: boolean;
  onGoToCharacterHub?: () => void;
  onGoToFreedcamp?: () => void;
  onGoToPasswordManager?: () => void;
  onGoToMailManager?: () => void;
}

export default function Dashboard({ folders, profiles, selectedFolderId, onSelectFolder, onProfilesChange, onFoldersChange, expandedFolders, onToggleFolder, expandedOthers, onToggleOthers, onGoToDashboard, onGoToSettings, onGoToFolders, onOrderChange, activeStatuses = new Map(), onToggleAllFolders, showPasswordManager = false, showMailManager = false, showCharacterHub = false, showFreedcamp = false, showDashboard = true, onGoToCharacterHub, onGoToFreedcamp, onGoToPasswordManager, onGoToMailManager }: DashboardProps) {
  const electronAPI = useElectronAPI();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedFolderForCreate, setSelectedFolderForCreate] = useState<string | undefined>(undefined);
  const [editingProfile, setEditingProfile] = useState<BrowserProfile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<BrowserProfile | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<ProfileFolder | null>(null);
  const [editingFolder, setEditingFolder] = useState<ProfileFolder | null>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [orderedFolders, setOrderedFolders] = useState<ProfileFolder[]>([]);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [draggedProfileId, setDraggedProfileId] = useState<string | null>(null);
  const [orderedProfiles, setOrderedProfiles] = useState<Map<string | 'ungrouped', BrowserProfile[]>>(new Map());
  const [activeTab, setActiveTab] = useState<'folders' | 'profiles'>('folders'); // Para tabs en pantallas estrechas
  const dragOverTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Track profile IDs to detect add/delete vs status-only changes
  const prevProfileIdsRef = useRef<string>('');
  // Track folder assignment to detect move-to-folder changes
  const prevFolderAssignmentRef = useRef<string>('');

  // Initialize orderedFolders from folders prop (when folder IDs or folder data changes)
  useEffect(() => {
    const newIds = folders.map(f => f.id).join(',');
    const prevIds = orderedFolders.map(f => f.id).join(',');
    
    // Also check if any folder data (name, color, icon) changed
    const folderDataChanged = orderedFolders.some(oldFolder => {
      const newFolder = folders.find(f => f.id === oldFolder.id);
      return !newFolder || 
             oldFolder.name !== newFolder.name || 
             oldFolder.color !== newFolder.color || 
             oldFolder.icon !== newFolder.icon;
    });
    
    if (newIds !== prevIds || folderDataChanged) {
      setOrderedFolders(folders);
    }
  }, [folders]);

  // Initialize orderedProfiles - preserve order on polling, only reset when IDs or folder list change
  useEffect(() => {
    const currentIds = profiles.map(p => p.id).sort().join(',');
    const idsChanged = currentIds !== prevProfileIdsRef.current;

    // Also detect when profiles move between folders
    const currentFolderAssignment = profiles.map(p => `${p.id}:${p.folderId || ''}`).sort().join('|');
    const folderAssignmentChanged = currentFolderAssignment !== prevFolderAssignmentRef.current;

    const activeFolders = orderedFolders.length > 0 ? orderedFolders : folders;
    const missingFolder = activeFolders.some(f => !orderedProfiles.has(f.id));

    if (idsChanged || folderAssignmentChanged || orderedProfiles.size === 0 || missingFolder) {
      // Profiles added/deleted or moved between folders: rebuild preserving existing order
      const profilesByFolder = new Map<string | 'ungrouped', BrowserProfile[]>();
      for (const folder of activeFolders) {
        const existing = orderedProfiles.get(folder.id) || [];
        const fresh = profiles.filter(p => p.folderId === folder.id);
        // Keep existing order, remove deleted, append new ones at end
        const reordered = [
          ...existing.filter(p => fresh.some(fp => fp.id === p.id)).map(p => fresh.find(fp => fp.id === p.id)!),
          ...fresh.filter(p => !existing.some(ep => ep.id === p.id)),
        ];
        profilesByFolder.set(folder.id, reordered);
      }
      const existingUngrouped = orderedProfiles.get('ungrouped') || [];
      const freshUngrouped = profiles.filter(p => !p.folderId);
      const reorderedUngrouped = [
        ...existingUngrouped.filter(p => freshUngrouped.some(fp => fp.id === p.id)).map(p => freshUngrouped.find(fp => fp.id === p.id)!),
        ...freshUngrouped.filter(p => !existingUngrouped.some(ep => ep.id === p.id)),
      ];
      profilesByFolder.set('ungrouped', reorderedUngrouped);
      setOrderedProfiles(profilesByFolder);
      prevProfileIdsRef.current = currentIds;
      prevFolderAssignmentRef.current = currentFolderAssignment;
    } else {
      // Only status/data changed: update profile objects in-place without changing order
      setOrderedProfiles(prev => {
        const updated = new Map(prev);
        for (const [key, folderProfiles] of updated.entries()) {
          updated.set(key, folderProfiles.map(p => profiles.find(fp => fp.id === p.id) || p));
        }
        return updated;
      });
    }
  }, [profiles, orderedFolders]);

  const handleDeleteProfile = async (profileId: string) => {
    try {
      await electronAPI.profiles.delete(profileId);
      onProfilesChange();
    } catch (error) {
      console.error('Error deleting profile:', error);
    }
  };

  const handleEditProfile = (profile: BrowserProfile) => {
    setEditingProfile(profile);
  };

  const handleToggleStar = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    try {
      await electronAPI.profiles.update(profileId, { starred: !profile.starred });
      onProfilesChange();
    } catch (error) {
      console.error('Error toggling star:', error);
    }
  };

  const handleToggleLock = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    try {
      // locked !== false means locked (undefined = locked by default). Toggle it.
      await electronAPI.profiles.update(profileId, { locked: profile.locked === false });
      onProfilesChange();
    } catch (error) {
      console.error('Error toggling lock:', error);
    }
  };

  const handleFolderCreated = () => {
    setShowCreateFolderModal(false);
    onFoldersChange();
  };

  const handleFolderUpdated = () => {
    setEditingFolder(null);
    onFoldersChange();
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await electronAPI.folders.delete(folderId);
      onFoldersChange();
      if (selectedFolderId === folderId) {
        onSelectFolder('ungrouped');
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  };

  const handleMoveProfileToFolder = async (profileId: string, folderId: string | undefined) => {
    try {
      await electronAPI.profiles.update(profileId, { folderId });
      onProfilesChange();
    } catch (error) {
      console.error('Error moving profile to folder:', error);
    }
  };

  const handleLaunchProfile = async (profileId: string) => {
    try {
      await electronAPI.launcher.launch(profileId, 'https://x.com');
      onProfilesChange();
    } catch (error) {
      console.error('Error launching profile:', error);
    }
  };

  const handleCloseProfile = async (profileId: string) => {
    try {
      await electronAPI.launcher.close(profileId);
      onProfilesChange();
    } catch (error) {
      console.error('Error closing profile:', error);
    }
  };

  const handleLaunchAll = async (folderId: string) => {
    const folderProfiles = orderedProfiles.get(folderId)?.length
      ? orderedProfiles.get(folderId)!
      : profiles.filter(p => p.folderId === folderId);
    for (const profile of folderProfiles) {
      try {
        await electronAPI.launcher.launch(profile.id, 'https://x.com');
      } catch (error) {
        console.error('Error launching profile in browser:', profile.id, error);
      }
    }
    onProfilesChange();
  };

   const handleCloseAllInFolder = async (folderId: string | null) => {
     if (!folderId || typeof folderId !== 'string') {
       console.error('Invalid folderId for handleCloseAllInFolder:', folderId);
       return;
     }
     const folderProfiles = orderedProfiles.get(folderId)?.length
       ? orderedProfiles.get(folderId)!
       : profiles.filter(p => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
     for (const profile of folderProfiles) {
       if (activeStatuses.get(profile.id)) {
         try {
           await electronAPI.launcher.close(profile.id);
         } catch (error) {
           console.error('Error closing profile:', profile.id, error);
         }
       }
     }
     onProfilesChange();
   };

  const handleOpenAllInBrowser = async (folderId: string) => {
    const folderProfiles = orderedProfiles.get(folderId)?.length
      ? orderedProfiles.get(folderId)!
      : profiles.filter(p => p.folderId === folderId);
    for (const profile of folderProfiles) {
      try {
        await electronAPI.launcher.launch(profile.id, 'https://x.com');
      } catch (error) {
        console.error('Error launching profile in browser:', profile.id, error);
      }
    }
    onProfilesChange();
  };

  // Drag and Drop Handlers for Folders
  const handleFolderDragStart = (e: React.DragEvent, folderId: string) => {
    setDraggedFolderId(folderId);
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', folderId);
  };

  const handleFolderDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
  };

  const handleFolderDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    // Get the source folder ID from dataTransfer instead of state
    const sourceFolderId = e.dataTransfer?.getData('text/plain');
    
    if (sourceFolderId && sourceFolderId !== targetFolderId) {
      const sourceIndex = orderedFolders.findIndex((f) => f.id === sourceFolderId);
      const targetIndex = orderedFolders.findIndex((f) => f.id === targetFolderId);
      if (sourceIndex !== -1 && targetIndex !== -1) {
        const newOrder = [...orderedFolders];
        [newOrder[sourceIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[sourceIndex]];
        setOrderedFolders(newOrder);
        onOrderChange?.(orderedProfiles, newOrder);
      }
    }
    setDraggedFolderId(null);
  };

  const handleFolderDragEnd = () => {
    setDraggedFolderId(null);
  };

  // Drag and Drop Handlers for Profiles
  const handleProfileDragStart = (e: React.DragEvent, profileId: string) => {
    setDraggedProfileId(profileId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', profileId);
  };

  const handleProfileDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleProfileDrop = (e: React.DragEvent, targetProfileId: string) => {
    e.preventDefault();
    const sourceProfileId = draggedProfileId;
    if (sourceProfileId && sourceProfileId !== targetProfileId && selectedFolderId) {
      const currentProfiles = orderedProfiles.get(selectedFolderId) || [];
      const sourceIndex = currentProfiles.findIndex((p) => p.id === sourceProfileId);
      const targetIndex = currentProfiles.findIndex((p) => p.id === targetProfileId);
      if (sourceIndex !== -1 && targetIndex !== -1) {
        const newProfiles = [...currentProfiles];
        [newProfiles[sourceIndex], newProfiles[targetIndex]] = [newProfiles[targetIndex], newProfiles[sourceIndex]];
        const newMap = new Map(orderedProfiles);
        newMap.set(selectedFolderId, newProfiles);
        setOrderedProfiles(newMap);
        onOrderChange?.(newMap, orderedFolders);
      }
    }
    setDraggedProfileId(null);
  };

  const handleProfileDragEnd = () => {
    setDraggedProfileId(null);
  };

  // Calculate profile count by folder
  const profileCountByFolder = new Map<string | undefined, number>();
  for (const profile of profiles) {
    const folderId = profile.folderId;
    profileCountByFolder.set(folderId, (profileCountByFolder.get(folderId) || 0) + 1);
  }

  // Get profiles for selected folder — fall back to direct filtering if orderedProfiles not yet populated
  const selectedFolderProfiles = (() => {
    if (!selectedFolderId) return [];
    if (selectedFolderId === 'ungrouped') {
      const fromOrdered = orderedProfiles.get('ungrouped');
      return fromOrdered?.length ? fromOrdered : profiles.filter(p => !p.folderId);
    }
    const fromOrdered = orderedProfiles.get(selectedFolderId);
    return fromOrdered?.length ? fromOrdered : profiles.filter(p => p.folderId === selectedFolderId);
  })();

  return (
    <div className="dashboard">
      <div className="dashboard-container">
        {/* Sidebar */}
         <Sidebar
             folders={orderedFolders}
              profiles={profiles}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              expandedOthers={expandedOthers}
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
              onToggleOthers={onToggleOthers}
             onCreateFolder={() => setShowCreateFolderModal(true)}
             onCreateProfile={(folderId) => {
               setSelectedFolderForCreate(folderId);
               setShowCreateModal(true);
             }}
             onEditFolder={setEditingFolder}
             onDeleteFolder={handleDeleteFolder}
             profileCountByFolder={profileCountByFolder}
              onLaunchProfile={handleLaunchProfile}
              onCloseProfile={handleCloseProfile}
              onOpenAllInBrowser={handleOpenAllInBrowser}
              activeStatuses={activeStatuses}
               onMoveProfileToFolder={handleMoveProfileToFolder}
                 onGoToDashboard={() => {}}
                    onGoToFolders={onGoToFolders}
                   onOpenSettings={onGoToSettings}
                   orderedProfiles={orderedProfiles}
                    onCloseAll={handleCloseAllInFolder}
                    onToggleAllFolders={onToggleAllFolders}
                    onEditProfile={(profile) => setEditingProfile(profile)}
                    onDeleteProfile={handleDeleteProfile}
                    onToggleStar={handleToggleStar}
                      showPasswordManager={showPasswordManager}
                      showMailManager={showMailManager}
                      showCharacterHub={showCharacterHub}
                      showFreedcamp={showFreedcamp}
                      showDashboard={showDashboard}
                      onGoToCharacterHub={onGoToCharacterHub}
                      onGoToFreedcamp={onGoToFreedcamp}
                      onGoToPasswordManager={onGoToPasswordManager}
                      onGoToMailManager={onGoToMailManager}
             />

          {/* Main Content - 2 Columns (or tabs on narrow screens) */}
          <div className="main-content">
            {/* Tab bar (visible only on narrow screens) */}
            <div className="tab-bar">
             <button
               className={`tab-button ${activeTab === 'folders' ? 'active' : ''}`}
               onClick={() => setActiveTab('folders')}
             >
               Folders
             </button>
             <button
               className={`tab-button ${activeTab === 'profiles' ? 'active' : ''}`}
               onClick={() => setActiveTab('profiles')}
             >
               Profiles
             </button>
           </div>

            {/* Left Column - Folders */}
            <div className={`folders-column ${activeTab === 'folders' ? 'active' : ''}`}>
              <div className="column-header">
                <p className="column-title">Folders <span className="profile-count">{folders.length}</span></p>
                <Tooltip text="Create new folder" position="left">
                 <button
                   className="btn-add-new"
                   onClick={() => setShowCreateFolderModal(true)}
                   aria-label="Create new folder"
                 >
                   +
                 </button>
               </Tooltip>
             </div>

             {folders.length === 0 ? (
               <div className="empty-state">
                 <p>No folders yet. Create one to organize your profiles.</p>
               </div>
             ) : (
               <div className="folders-list">
                   {/* OTHERS Card */}
                   {(profileCountByFolder.get(undefined) || 0) > 0 && (
                    <div
                      className={`folder-card others-card ${selectedFolderId === 'ungrouped' ? 'selected' : ''}`}
                      onClick={() => onSelectFolder('ungrouped')}
                    >
                       <div className="folder-card-header">
                         <div className="folder-info">
                           <span className="folder-icon">📌</span>
                           <h4>OTHERS</h4>
                           <span className="profile-count">{profileCountByFolder.get(undefined) || 0}</span>
                         </div>
                       </div>
                      <div className="folder-color" style={{ backgroundColor: '#6b7280' }}></div>
                    </div>
                  )}

                  {/* Regular Folders */}
                  {orderedFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className={`folder-card ${draggedFolderId === folder.id ? 'dragging' : ''} ${selectedFolderId === folder.id ? 'selected' : ''}`}
                      draggable
                      onDragStart={(e) => handleFolderDragStart(e, folder.id)}
                      onDragOver={handleFolderDragOver}
                      onDrop={(e) => handleFolderDrop(e, folder.id)}
                      onDragEnd={handleFolderDragEnd}
                      onClick={() => onSelectFolder(folder.id)}
                    >
                     <div className="folder-card-header">
                        <div className="folder-info">
                          <span className="folder-icon">📁</span>
                          <h4>{folder.name}</h4>
                          <span className="profile-count">{profileCountByFolder.get(folder.id) || 0}</span>
                        </div>
                          <div className="folder-actions">
                            <button
                              className="action-btn edit-btn"
                              onClick={() => setEditingFolder(folder)}
                              title="Edit"
                            >
                              ✎
                            </button>
                            <button
                              className="action-btn delete-btn"
                              onClick={() => setFolderToDelete(folder)}
                              title="Delete"
                            >
                             🗑️
                           </button>
                         </div>
                      </div>
                     <div className="folder-color" style={{ backgroundColor: folder.color }}></div>
                   </div>
                 ))}
               </div>
             )}
          </div>

            {/* Right Column - Profiles */}
            <div className={`profiles-column ${activeTab === 'profiles' ? 'active' : ''}`}>
              <div className="column-header">
                <p className="column-title">
                  {selectedFolderId ? (
                    <>Profiles <span className="profile-count">{selectedFolderProfiles.length}</span></>
                  ) : 'No folder selected'}
                </p>
               {selectedFolderId && (
                 <Tooltip text="Create new profile" position="left">
                   <button
                     className="btn-add-new"
                     onClick={() => setShowCreateModal(true)}
                     aria-label="Create new profile"
                   >
                     +
                   </button>
                 </Tooltip>
               )}
             </div>

             {!selectedFolderId ? (
               <div className="empty-state">
                 <p>No folder selected</p>
               </div>
             ) : selectedFolderProfiles.length === 0 ? (
               <div className="empty-state">
                 <p>
                   {selectedFolderId === 'ungrouped'
                     ? 'No ungrouped profiles yet.'
                     : `No profiles in this folder.`}
                 </p>
               </div>
              ) : (
                  <div className="profiles-list">
                       {selectedFolderProfiles.map((profile) => (
                         <ProfileTab
                           key={`${profile.id}-${profile.imagePath || 'no-image'}`}
                           profile={profile}
                           isActive={activeStatuses.get(profile.id) || false}
                           isSelected={false}
                           isDragging={draggedProfileId === profile.id}
                           onLaunch={() => handleLaunchProfile(profile.id)}
                           onClose={() => handleCloseProfile(profile.id)}
                             onDelete={() => setProfileToDelete(profile)}
                            onEdit={() => handleEditProfile(profile)}
                            onToggleStar={() => handleToggleStar(profile.id)}
                            onToggleLock={() => handleToggleLock(profile.id)}
                           onMoveToFolder={handleMoveProfileToFolder}
                           folders={folders}
                           onDragStart={(e) => handleProfileDragStart(e, profile.id)}
                           onDragOver={handleProfileDragOver}
                           onDrop={(e) => handleProfileDrop(e, profile.id)}
                           onDragEnd={handleProfileDragEnd}
                           disableContextMenu={true}
                         />
                       ))}
                 </div>
              )}
           </div>
        </div>
      </div>

       {/* Modals */}
       {showCreateModal && (
         <ProfileModal
           onClose={() => {
             setShowCreateModal(false);
             setSelectedFolderForCreate(undefined);
           }}
           onSuccess={() => {
             setShowCreateModal(false);
             setSelectedFolderForCreate(undefined);
             onProfilesChange();
           }}
           selectedFolderId={selectedFolderForCreate !== undefined ? selectedFolderForCreate : selectedFolderId}
           folders={folders}
         />
       )}

      {editingProfile && (
        <ProfileModal
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
          onSuccess={() => {
            setEditingProfile(null);
            onProfilesChange();
          }}
          folders={folders}
        />
      )}

      {showCreateFolderModal && (
        <CreateFolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onCreated={handleFolderCreated}
        />
      )}

      {editingFolder && (
        <EditFolderModal
          folder={editingFolder}
          onClose={() => setEditingFolder(null)}
          onUpdated={handleFolderUpdated}
        />
      )}

      {profileToDelete && (
        <DeleteConfirmModal
          title="Delete Profile"
          itemName={profileToDelete.name}
          onConfirm={() => { handleDeleteProfile(profileToDelete.id); setProfileToDelete(null); }}
          onCancel={() => setProfileToDelete(null)}
        />
      )}
      {folderToDelete && (
        <DeleteConfirmModal
          title="Delete Folder"
          itemName={folderToDelete.name}
          onConfirm={() => { handleDeleteFolder(folderToDelete.id); setFolderToDelete(null); }}
          onCancel={() => setFolderToDelete(null)}
        />
      )}
    </div>
  );
}
