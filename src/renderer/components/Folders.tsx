/**
 * Folders Component - Vista principal con sidebar y panel de perfiles (copia de Dashboard)
 */

import React, { useState } from 'react';
import { ChromeProfile, ProfileFolder } from '../../types';
import { useElectronAPI } from '../hooks/useElectronAPI';
import Sidebar from './Sidebar';
import ProfilesPanel from './ProfilesPanel';
import BrowserPreview from './BrowserPreview';
import Tooltip from './Tooltip';
import CreateProfileModal from './CreateProfileModal';
import EditProfileModal from './EditProfileModal';
import CreateFolderModal from './CreateFolderModal';
import EditFolderModal from './EditFolderModal';
import './FoldersView.css';

interface FoldersProps {
  folders: ProfileFolder[];
  profiles: ChromeProfile[];
  selectedFolderId: string | null | 'ungrouped' | '__online__' | '__search__';
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
}

export default function Folders({ folders, profiles, selectedFolderId, onSelectFolder, onProfilesChange, onFoldersChange, expandedFolders, onToggleFolder, expandedOthers, onToggleOthers, onGoToDashboard, onGoToSettings, onGoToFolders, activeStatuses = new Map(), searchQuery = '', showAddCard = true, onToggleAllFolders }: FoldersProps) {
  const electronAPI = useElectronAPI();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalFolderId, setCreateModalFolderId] = useState<string | undefined>(undefined);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ChromeProfile | null>(null);
  const [editingFolder, setEditingFolder] = useState<ProfileFolder | null>(null);
  const [browserPreviewProfile, setBrowserPreviewProfile] = useState<ChromeProfile | null>(null);

  const handleLaunchProfile = async (profileId: string) => {
    try {
      await electronAPI.launcher.launch(profileId, 'https://x.com');
      setActiveProfileId(profileId);
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

  const handleDeleteProfile = async (profileId: string) => {
    if (window.confirm('Are you sure you want to delete this profile?')) {
      try {
        // Close if active
        if (activeStatuses?.get(profileId)) {
          await handleCloseProfile(profileId);
        }
        // Delete profile
        await electronAPI.profiles.delete(profileId);
        onProfilesChange();
      } catch (error) {
        console.error('Error deleting profile:', error);
      }
    }
  };

  const handleEditProfile = (profile: ChromeProfile) => {
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
      await electronAPI.folders.delete(folderId);
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
      await electronAPI.profiles.update(profileId, { folderId });
      onProfilesChange();
    } catch (error) {
      console.error('Error moving profile to folder:', error);
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
    : selectedFolderId === 'ungrouped'
    ? 'FOLDERS / OTHERS'
    : `FOLDERS / ${folders.find(f => f.id === selectedFolderId)?.name?.toUpperCase() || 'FOLDER'}`;

  const handleOpenAllInBrowser = async (folderId: string) => {
    const folderProfiles = profiles.filter(p => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
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
    const folderProfiles = profiles.filter(p => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
    console.log(`Closing ${folderProfiles.length} profiles from folder ${folderId}`);
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
             />

        {/* Main Panel with Browser Preview */}
          <div className="folders-view-main">
           <ProfilesPanel
             profiles={profiles}
             folders={folders}
             selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              expandedOthers={expandedOthers}
              activeProfileId={activeProfileId}
              activeStatuses={activeStatuses}
              onLaunchProfile={handleLaunchProfile}
              onCloseProfile={handleCloseProfile}
              onDeleteProfile={handleDeleteProfile}
              onEditProfile={handleEditProfile}
              onCreateProfile={handleCreateProfile}
               onMoveProfileToFolder={handleMoveProfileToFolder}
                 onSelectProfile={setBrowserPreviewProfile}
                 searchQuery={searchQuery}
                 showAddCard={showAddCard}
                     headerActions={
                       <div className="panel-header-content">
                         <h3 className="panel-header-folder-name">{selectedFolderName}</h3>
                         <div className="panel-header-actions">
                           {selectedFolderHasBrowserActive && selectedFolderId && (
                             <Tooltip text="Close all" position="left">
                               <button
                                 className="panel-header-btn"
                                 onClick={() => handleCloseAllInFolder(selectedFolderId as string)}
                               >
                                 ✕
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
        <CreateProfileModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            setCreateModalFolderId(undefined);
            onProfilesChange();
          }}
          selectedFolderId={createModalFolderId || selectedFolderId}
          folders={folders}
        />
      )}

      {editingProfile && (
        <EditProfileModal
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
          onUpdated={() => {
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
    </div>
  );
}
