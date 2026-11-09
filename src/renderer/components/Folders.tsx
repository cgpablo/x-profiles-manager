/**
 * Folders Component - Vista principal con sidebar y panel de perfiles (copia de Dashboard)
 */

import React, { useState } from 'react';
import { X } from 'reicon-react';
import { BrowserProfile, ProfileFolder } from '../../types';
import { usePlatformAPI } from '../hooks/usePlatformAPI';
import Sidebar from './Sidebar';
import ProfilesPanel from './ProfilesPanel';
import BrowserPreview from './BrowserPreview';
import Tooltip from './Tooltip';
import ProfileModal from './ProfileModal';
import CreateFolderModal from './CreateFolderModal';
import EditFolderModal from './EditFolderModal';
import DeleteConfirmModal from './DeleteProfileConfirmModal';
import './FoldersView.css';

interface FoldersProps {
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
  activeStatuses?: Map<string, boolean>;
  searchQuery?: string;
  showAddCard?: boolean;
  onToggleAllFolders?: (expand: boolean) => void;
  showPasswordManager?: boolean;
  showMailManager?: boolean;
  showCharacterHub?: boolean;
  showFreedcamp?: boolean;
  showDashboard?: boolean;
  showDirectory?: boolean;
  onGoToCharacterHub?: () => void;
  onGoToFreedcamp?: () => void;
  onGoToPasswordManager?: () => void;
  onGoToMailManager?: () => void;
}

export default function Folders({ folders, profiles, selectedFolderId, onSelectFolder, onProfilesChange, onFoldersChange, expandedFolders, onToggleFolder, expandedOthers, onToggleOthers, onGoToDashboard, onGoToSettings, onGoToFolders, activeStatuses = new Map(), searchQuery = '', showAddCard = true, onToggleAllFolders, showPasswordManager = false, showMailManager = false, showCharacterHub = false, showFreedcamp = false, showDashboard = true, showDirectory = false, onGoToCharacterHub, onGoToFreedcamp, onGoToPasswordManager, onGoToMailManager }: FoldersProps) {  const platformAPI = usePlatformAPI();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalFolderId, setCreateModalFolderId] = useState<string | undefined>(undefined);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<BrowserProfile | null>(null);
  const [editingFolder, setEditingFolder] = useState<ProfileFolder | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<BrowserProfile | null>(null);
  const [browserPreviewProfile, setBrowserPreviewProfile] = useState<BrowserProfile | null>(null);
  const [sortOrderStarred, setSortOrderStarred] = useState<'asc' | 'desc'>('asc');
  const [sortOrderOnline, setSortOrderOnline] = useState<'asc' | 'desc'>('asc');
  const [sortOrderFolders, setSortOrderFolders] = useState<'asc' | 'desc' | null>(null);

  const handleLaunchProfile = async (profileId: string) => {
    try {
      await platformAPI.launcher.launch(profileId, 'https://x.com');
      setActiveProfileId(profileId);
      onProfilesChange();
    } catch (error) {
      console.error('Error launching profile:', error);
    }
  };

  const handleCloseProfile = async (profileId: string) => {
    try {
      await platformAPI.launcher.close(profileId);
      onProfilesChange();
    } catch (error) {
      console.error('Error closing profile:', error);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    try {
      // Close if active
      if (activeStatuses?.get(profileId)) {
        await handleCloseProfile(profileId);
      }
      // Delete profile
      await platformAPI.profiles.delete(profileId);
      onProfilesChange();
    } catch (error) {
      console.error('Error deleting profile:', error);
    }
  };

  const handleEditProfile = (profile: BrowserProfile) => {
    setEditingProfile(profile);
  };

  const handleCreateProfile = (folderId?: string) => {
    setCreateModalFolderId(folderId);
    setShowCreateModal(true);
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
      await platformAPI.folders.delete(folderId);
      onFoldersChange();
      // Reset selection if deleted folder was selected
      if (selectedFolderId === folderId) {
        onSelectFolder('ungrouped');
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  };

  const handleMoveProfileToFolder = async (profileId: string, folderId: string | undefined) => {
    try {
      await platformAPI.profiles.update(profileId, { folderId });
      onProfilesChange();
    } catch (error) {
      console.error('Error moving profile to folder:', error);
    }
  };

  const handleToggleStar = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    try {
      await platformAPI.profiles.update(profileId, { starred: !profile.starred });
      onProfilesChange();
    } catch (error) {
      console.error('Error toggling star:', error);
    }
  };

  const handleToggleLock = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    try {
      await platformAPI.profiles.update(profileId, { locked: profile.locked === false });
      onProfilesChange();
    } catch (error) {
      console.error('Error toggling lock:', error);
    }
  };

  // Calculate profile count by folder
  const profileCountByFolder = new Map<string | undefined, number>();
  for (const profile of profiles) {
    const folderId = profile.folderId;
    profileCountByFolder.set(folderId, (profileCountByFolder.get(folderId) || 0) + 1);
  }

  // Check if selected folder has embedded or browser-active profiles
  const folderProfiles = selectedFolderId != null
    ? profiles.filter(p => p.folderId === selectedFolderId || (selectedFolderId === 'ungrouped' && !p.folderId))
    : [];

  const selectedFolderHasBrowserActive = folderProfiles.some(p => activeStatuses.get(p.id));

  // Get the name of the selected folder
  const isSearchMode = !showAddCard;
  const selectedFolderName = (isSearchMode || selectedFolderId === '__search__')
    ? 'SEARCH'
    : selectedFolderId === null
    ? 'ALL FOLDERS'
    : selectedFolderId === '__online__'
    ? 'ACTIVES'
    : selectedFolderId === '__starred__'
    ? 'FAVORITES'
    : selectedFolderId === 'ungrouped'
    ? 'FOLDERS / OTHERS'
    : `FOLDERS / ${folders.find(f => f.id === selectedFolderId)?.name?.toUpperCase() || 'FOLDER'}`;

  const handleOpenAllInBrowser = async (folderId: string) => {
    const folderProfiles = profiles.filter(p => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
    for (const profile of folderProfiles) {
      try {
        await platformAPI.launcher.launch(profile.id, 'https://x.com');
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
    const folderProfiles = profiles.filter(p => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
    console.log(`Closing ${folderProfiles.length} profiles from folder ${folderId}`);
    for (const profile of folderProfiles) {
      if (activeStatuses.get(profile.id)) {
        try {
          await platformAPI.launcher.close(profile.id);
        } catch (error) {
          console.error('Error closing profile:', profile.id, error);
        }
      }
    }
    onProfilesChange();
  };

  const isVirtualView = selectedFolderId === '__starred__' || selectedFolderId === '__online__';
  const isFolderView = !isVirtualView && selectedFolderId !== '__search__';
  const currentSortOrder = selectedFolderId === '__starred__' ? sortOrderStarred : sortOrderOnline;
  const toggleSortOrder = selectedFolderId === '__starred__'
    ? () => setSortOrderStarred(o => o === 'asc' ? 'desc' : 'asc')
    : () => setSortOrderOnline(o => o === 'asc' ? 'desc' : 'asc');

  const cycleFolderSort = () => setSortOrderFolders(o => o === null ? 'asc' : o === 'asc' ? 'desc' : null);

  const profilesToDisplay = isVirtualView
    ? [...profiles].sort((a, b) =>
        currentSortOrder === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name)
      )
    : isFolderView && sortOrderFolders !== null
    ? [...profiles].sort((a, b) =>
        sortOrderFolders === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name)
      )
    : profiles;

  return (
    <div className="dashboard">
      <div className="dashboard-container">
        {/* Sidebar */}
          <Sidebar
              folders={folders}
               profiles={profiles}
               selectedFolderId={selectedFolderId}
               expandedFolders={expandedFolders}
               expandedOthers={expandedOthers}
               onSelectFolder={onSelectFolder}
               onToggleFolder={onToggleFolder}
               onToggleOthers={onToggleOthers}
              onCreateFolder={() => setShowCreateFolderModal(true)}
              onCreateProfile={handleCreateProfile}
               onEditFolder={setEditingFolder}
               onDeleteFolder={handleDeleteFolder}
               profileCountByFolder={profileCountByFolder}
                onLaunchProfile={handleLaunchProfile}
                onCloseProfile={handleCloseProfile}
                onOpenAllInBrowser={handleOpenAllInBrowser}
                onCloseAll={handleCloseAllInFolder}
                 activeStatuses={activeStatuses}
                 onMoveProfileToFolder={handleMoveProfileToFolder}
                  onGoToDashboard={onGoToDashboard}
                    onGoToFolders={onGoToFolders}
                    onOpenSettings={onGoToSettings}
                    onToggleAllFolders={onToggleAllFolders}
                    onEditProfile={(profile) => setEditingProfile(profile)}
                    onDeleteProfile={(profileId) => {
                  const profile = profiles.find(p => p.id === profileId);
                  if (profile) setProfileToDelete(profile);
                }}
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

        {/* Main Panel with Browser Preview */}
          <div className="folders-view-main">
           <ProfilesPanel
             profiles={profilesToDisplay}
             folders={folders}
             selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              expandedOthers={expandedOthers}
              activeProfileId={activeProfileId}
              activeStatuses={activeStatuses}
               onLaunchProfile={handleLaunchProfile}
               onCloseProfile={handleCloseProfile}
               onDeleteProfile={(profileId) => {
                 const profile = profiles.find(p => p.id === profileId);
                 if (profile) setProfileToDelete(profile);
               }}
               onEditProfile={handleEditProfile}
               onToggleStar={handleToggleStar}
               onToggleLock={handleToggleLock}
              onCreateProfile={handleCreateProfile}
               onMoveProfileToFolder={handleMoveProfileToFolder}
                 onSelectProfile={setBrowserPreviewProfile}
                 searchQuery={searchQuery}
                  showAddCard={showAddCard}
                      showDirectory={showDirectory}
                      headerActions={
                       <div className="panel-header-content">
                         <h3 className="panel-header-folder-name">{selectedFolderName}</h3>
                          <div className="panel-header-actions">
                             {isVirtualView && (
                               <button
                                 className="panel-header-btn active"
                                 onClick={toggleSortOrder}
                                 title={currentSortOrder === 'asc' ? 'A→Z (click for Z→A)' : 'Z→A (click for A→Z)'}
                               >
                                 {currentSortOrder === 'desc' ? 'Z↓' : 'A↓'}
                               </button>
                             )}
                             {isFolderView && (
                               <button
                                 className={`panel-header-btn${sortOrderFolders !== null ? ' active' : ''}`}
                                 onClick={cycleFolderSort}
                                 title={
                                   sortOrderFolders === null
                                     ? 'Sort A→Z'
                                     : sortOrderFolders === 'asc'
                                     ? 'Sorted A→Z (click for Z→A)'
                                     : 'Sorted Z→A (click to reset)'
                                 }
                               >
                                 {sortOrderFolders === null ? 'AZ' : sortOrderFolders === 'asc' ? 'A↓' : 'Z↓'}
                               </button>
                             )}
                           {selectedFolderHasBrowserActive && selectedFolderId && (
                             <Tooltip text="Close all" position="left">
                               <button
                                 className="panel-header-btn"
                                 onClick={() => handleCloseAllInFolder(selectedFolderId as string)}
                               >
                                  <X size={14} weight="Outline" />
                               </button>
                             </Tooltip>
                           )}
                         </div>
                       </div>
                     }
              />

          {browserPreviewProfile && (
            <BrowserPreview
              profile={browserPreviewProfile}
              onClose={() => setBrowserPreviewProfile(null)}
              isActive={activeStatuses.get(browserPreviewProfile.id) || false}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <ProfileModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            setCreateModalFolderId(undefined);
            onProfilesChange();
          }}
          selectedFolderId={createModalFolderId || selectedFolderId}
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
    </div>
  );
}
