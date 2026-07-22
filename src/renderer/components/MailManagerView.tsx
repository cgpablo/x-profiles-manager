/**
 * MailManagerView - Mail Manager main view
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Pen, Trash } from 'reicon-react';
import { BrowserProfile, ProfileFolder } from '../../types';
import { useElectronAPI } from '../hooks/useElectronAPI';
import Sidebar from './Sidebar';
import CreateMailModal from './CreateMailModal';
import ProfileAvatar from './ProfileAvatar';
import ProfileModal from './ProfileModal';
import CreateFolderModal from './CreateFolderModal';
import EditFolderModal from './EditFolderModal';
import './MailManagerView.css';
import './ProfilesPanel.css';

interface MailEntry {
  id: string;
  email: string;
  profileIds: string[];
  createdAt: number;
  updatedAt?: number;
}

interface MailManagerViewProps {
  folders: ProfileFolder[];
  profiles: BrowserProfile[];
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

export default function MailManagerView({
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
  showPasswordManager = false,
  showMailManager = true,
  showCharacterHub = false,
  showFreedcamp = false,
  showDashboard = true,
  onToggleAllFolders,
  onFoldersChange,
}: MailManagerViewProps) {
  const [entries, setEntries] = useState<MailEntry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MailEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const electronAPI = useElectronAPI();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalFolderId, setCreateModalFolderId] = useState<string | undefined>(undefined);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [profileForEdit, setProfileForEdit] = useState<BrowserProfile | null>(null);
  const [editingFolder, setEditingFolder] = useState<ProfileFolder | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyEmail = (entry: MailEntry) => {
    navigator.clipboard.writeText(entry.email);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 500);
  };

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
      const data = await window.electronAPI.mails.getAll();
      setEntries(data);
    } catch (err) {
      console.error('Error loading mails:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.mails.delete(id);
      loadEntries();
    } catch (err) {
      console.error('Error deleting mail entry:', err);
    }
  };

  const getLinkedProfiles = (profileIds: string[]) =>
    profiles.filter((p) => profileIds.includes(p.id));

  return (
    <div className="mm-container">
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

      <div className="mm-content">
        <div className="panel-header">
          <div className="panel-header-content">
            <h2 className="mm-title">Mail Manager</h2>
            <button
              className="panel-header-btn btn-pm-new"
              onClick={() => {
                setEditingEntry(null);
                setShowModal(true);
              }}
              title="New Mail"
            >
              +
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mm-empty">
            <p>Loading...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="mm-empty">
            <p>No emails saved yet. Click "+" to add one.</p>
          </div>
        ) : (
          <div className="mm-list">
            {entries.map((entry) => {
              const linked = getLinkedProfiles(entry.profileIds);
              return (
                <div key={entry.id} className="mm-entry-card">
                  <div className="mm-entry-body">
                    <div className="mm-entry-name">
                      <span
                        className={`mm-entry-name-text mm-entry-email-copyable${copiedId === entry.id ? ' mm-entry-email-copied' : ''}`}
                        onClick={() => handleCopyEmail(entry)}
                        title="Click to copy"
                      >
                        {copiedId === entry.id ? 'Copied!' : entry.email}
                      </span>
                      <span className="mm-entry-count">{linked.length}</span>
                    </div>
                    <div className="mm-entry-profiles">
                      {linked.length === 0 ? (
                        <span className="mm-entry-no-profiles">No profiles linked</span>
                      ) : (
                        linked.map((p) => (
                          <ProfileAvatar
                            key={p.id}
                            profile={p}
                            className="mm-entry-profile-chip"
                            title={p.name}
                          />
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mm-entry-actions">
                    <button
                      className="btn-mm-action btn-mm-edit"
                      title="Edit"
                      onClick={() => {
                        setEditingEntry(entry);
                        setShowModal(true);
                      }}
                    >
                      <Pen size={14} weight="Outline" />
                    </button>
                    <button
                      className="btn-mm-action btn-mm-delete"
                      title="Delete"
                      onClick={() => handleDelete(entry.id)}
                    >
                      <Trash size={14} weight="Outline" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <CreateMailModal
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
        <ProfileModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            setCreateModalFolderId(undefined);
          }}
          selectedFolderId={createModalFolderId || selectedFolderId}
          folders={folders}
        />
      )}

      {profileForEdit && (
        <ProfileModal
          profile={profileForEdit}
          onClose={() => setProfileForEdit(null)}
          onSuccess={() => setProfileForEdit(null)}
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
