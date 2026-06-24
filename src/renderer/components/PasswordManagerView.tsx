/**
 * PasswordManagerView - Password Manager main view
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ChromeProfile, ProfileFolder } from '../../types';
import { useElectronAPI } from '../hooks/useElectronAPI';
import Sidebar from './Sidebar';
import CreatePasswordModal from './CreatePasswordModal';
import ProfileAvatar from './ProfileAvatar';
import CreateProfileModal from './CreateProfileModal';
import EditProfileModal from './EditProfileModal';
import CreateFolderModal from './CreateFolderModal';
import EditFolderModal from './EditFolderModal';
import './PasswordManagerView.css';
import './ProfilesPanel.css';

interface PasswordEntry {
  id: string;
  name: string;
  profileIds: string[];
  createdAt: number;
  updatedAt?: number;
}

interface PasswordManagerViewProps {
  folders: ProfileFolder[];
  profiles: ChromeProfile[];
  selectedFolderId: string | null | 'ungrouped';
  onSelectFolder: (folderId: string | null | 'ungrouped') => void;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  expandedOthers: boolean;
  onToggleOthers: () => void;
  onGoToDashboard?: () => void;
  onGoToSettings?: () => void;
  onGoToFolders?: () => void;
  onGoToCharacterHub?: () => void;
  onGoToPasswordManager?: () => void;
  onGoToMailManager?: () => void;
  activeStatuses?: Map<string, boolean>;
  showPasswordManager?: boolean;
  showMailManager?: boolean;
  showCharacterHub?: boolean;
  showFreedcamp?: boolean;
  showDashboard?: boolean;
  onToggleAllFolders?: (expand: boolean) => void;
  onFoldersChange?: () => void;
}

export default function PasswordManagerView({
  folders,
  profiles,
  selectedFolderId,
  onSelectFolder,
  expandedFolders,
  onToggleFolder,
  expandedOthers,
  onToggleOthers,
  onGoToDashboard,
  onGoToSettings,
  onGoToFolders,
  onGoToCharacterHub,
  onGoToPasswordManager,
  onGoToMailManager,
  activeStatuses = new Map(),
  showPasswordManager = true,
  showMailManager = false,
  showCharacterHub = false,
  showFreedcamp = false,
  showDashboard = true,
  onToggleAllFolders,
  onFoldersChange,
}: PasswordManagerViewProps) {
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PasswordEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const electronAPI = useElectronAPI();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalFolderId, setCreateModalFolderId] = useState<string | undefined>(undefined);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [profileForEdit, setProfileForEdit] = useState<ChromeProfile | null>(null);
  const [editingFolder, setEditingFolder] = useState<ProfileFolder | null>(null);

  const handleLaunchProfile = async (profileId: string) => {
    try {
      await electronAPI.launcher.launch(profileId, 'https://x.com');
    } catch (error) {
      console.error('Error launching profile:', error);
    }
  };

  const handleCloseProfile = async (profileId: string) => {
    try {
      await electronAPI.launcher.close(profileId);
    } catch (error) {
      console.error('Error closing profile:', error);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    try {
      await electronAPI.profiles.delete(profileId);
    } catch (error) {
      console.error('Error deleting profile:', error);
    }
  };

  const handleCreateProfile = (folderId?: string) => {
    setCreateModalFolderId(folderId);
    setShowCreateModal(true);
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await electronAPI.folders.delete(folderId);
      onFoldersChange?.();
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  };

  const handleMoveProfileToFolder = async (profileId: string, folderId: string | undefined) => {
    try {
      await electronAPI.profiles.update(profileId, { folderId });
    } catch (error) {
      console.error('Error moving profile to folder:', error);
    }
  };

  const handleToggleStar = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    try {
      await electronAPI.profiles.update(profileId, { starred: !profile.starred });
    } catch (error) {
      console.error('Error toggling star:', error);
    }
  };

  const handleOpenAllInBrowser = async (folderId: string) => {
    const folderProfiles = profiles.filter(p => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
    for (const profile of folderProfiles) {
      try {
        await electronAPI.launcher.launch(profile.id, 'https://x.com');
      } catch (error) {
        console.error('Error launching profile:', profile.id, error);
      }
    }
  };

  const handleCloseAllInFolder = async (folderId: string | null) => {
    if (!folderId || typeof folderId !== 'string') return;
    const folderProfiles = profiles.filter(p => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
    for (const profile of folderProfiles) {
      if (activeStatuses.get(profile.id)) {
        try {
          await electronAPI.launcher.close(profile.id);
        } catch (error) {
          console.error('Error closing profile:', profile.id, error);
        }
      }
    }
  };

  const profileCountByFolder = useMemo(() => {
    const map = new Map<string | undefined, number>();
    for (const p of profiles) {
      map.set(p.folderId, (map.get(p.folderId) || 0) + 1);
    }
    return map;
  }, [profiles]);

  const loadEntries = async () => {
    try {
      const data = await window.electronAPI.passwords.getAll();
      setEntries(data);
    } catch (err) {
      console.error('Error loading passwords:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.passwords.delete(id);
      loadEntries();
    } catch (err) {
      console.error('Error deleting password:', err);
    }
  };

  const getLinkedProfiles = (profileIds: string[]) =>
    profiles.filter((p) => profileIds.includes(p.id));

  return (
    <div className="pw-manager-container">
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
        onEditFolder={setEditingFolder}
        onDeleteFolder={handleDeleteFolder}
        onCreateProfile={handleCreateProfile}
        onEditProfile={setProfileForEdit}
        onDeleteProfile={handleDeleteProfile}
        onToggleStar={handleToggleStar}
        onLaunchProfile={handleLaunchProfile}
        onCloseProfile={handleCloseProfile}
        onOpenAllInBrowser={handleOpenAllInBrowser}
        onCloseAll={handleCloseAllInFolder}
        onMoveProfileToFolder={handleMoveProfileToFolder}
        profileCountByFolder={profileCountByFolder}
        activeStatuses={activeStatuses}
        onGoToDashboard={onGoToDashboard}
        onGoToFolders={onGoToFolders}
        onOpenSettings={onGoToSettings}
        onGoToCharacterHub={onGoToCharacterHub}
        onGoToPasswordManager={onGoToPasswordManager}
        onGoToMailManager={onGoToMailManager}
        showPasswordManager={showPasswordManager}
        showMailManager={showMailManager}
        showCharacterHub={showCharacterHub}
        showFreedcamp={showFreedcamp}
        showDashboard={showDashboard}
        onToggleAllFolders={onToggleAllFolders}
      />

      <div className="pw-manager-content">
        <div className="panel-header">
          <div className="panel-header-content">
            <h2 className="pw-manager-title">Password Manager</h2>
            <button
              className="panel-header-btn btn-pm-new"
              onClick={() => {
                setEditingEntry(null);
                setShowModal(true);
              }}
              title="New Password"
            >
              +
            </button>
          </div>
        </div>

        {loading ? (
          <div className="pw-manager-empty">
            <p>Loading...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="pw-manager-empty">
            <p>No passwords saved yet. Click "+ New Password" to add one.</p>
          </div>
        ) : (
          <div className="pw-manager-list">
            {entries.map((entry) => {
              const linked = getLinkedProfiles(entry.profileIds);
              return (
                <div key={entry.id} className="pw-entry-card">
                  <div className="pw-entry-body">
                    <div className="pw-entry-name">
                      <span className="pw-entry-name-text">{entry.name}</span>
                      <span className="pw-entry-count">{linked.length}</span>
                    </div>
                    <div className="pw-entry-profiles">
                      {linked.length === 0 ? (
                        <span className="pw-entry-no-profiles">No profiles linked</span>
                      ) : (
                        linked.map((p) => (
                          <ProfileAvatar
                            key={p.id}
                            profile={p}
                            className="pw-entry-profile-chip"
                            title={p.name}
                          />
                        ))
                      )}
                    </div>
                  </div>

                  <div className="pw-entry-actions">
                    <button
                      className="btn-pw-action btn-pw-edit"
                      title="Edit"
                      onClick={() => {
                        setEditingEntry(entry);
                        setShowModal(true);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="btn-pw-action btn-pw-delete"
                      title="Delete"
                      onClick={() => handleDelete(entry.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <CreatePasswordModal
          profiles={profiles}
          editingEntry={editingEntry}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            loadEntries();
          }}
        />
      )}

      {showCreateModal && (
        <CreateProfileModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            setCreateModalFolderId(undefined);
          }}
          selectedFolderId={createModalFolderId || selectedFolderId}
          folders={folders}
        />
      )}

      {profileForEdit && (
        <EditProfileModal
          profile={profileForEdit}
          onClose={() => setProfileForEdit(null)}
          onUpdated={() => {
            setProfileForEdit(null);
          }}
          folders={folders}
        />
      )}

      {showCreateFolderModal && (
        <CreateFolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onCreated={() => {
            setShowCreateFolderModal(false);
            onFoldersChange?.();
          }}
        />
      )}

      {editingFolder && (
        <EditFolderModal
          folder={editingFolder}
          onClose={() => setEditingFolder(null)}
          onUpdated={() => {
            setEditingFolder(null);
            onFoldersChange?.();
          }}
        />
      )}
    </div>
  );
}
