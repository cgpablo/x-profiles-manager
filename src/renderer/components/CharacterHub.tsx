/**
 * CharacterHub Component - FC character info management view
 */

import React, { useState, useMemo } from 'react';
import { BrowserProfile, ProfileFolder } from '../../types';
import { useElectronAPI } from '../hooks/useElectronAPI';
import Sidebar from './Sidebar';
import EditFCCharacterModal from './EditFCCharacterModal';
import ProfileAvatar from './ProfileAvatar';
import ProfileModal from './ProfileModal';
import CreateFolderModal from './CreateFolderModal';
import EditFolderModal from './EditFolderModal';
import './CharacterHub.css';
import './ProfilesPanel.css';

interface CharacterHubProps {
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
  onProfilesChange: () => void;
  onFoldersChange: () => void;
  showPasswordManager?: boolean;
  showMailManager?: boolean;
  showCharacterHub?: boolean;
  showFreedcamp?: boolean;
  showDashboard?: boolean;
  onToggleAllFolders?: (expand: boolean) => void;
}

export default function CharacterHub({
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
  onProfilesChange,
  onFoldersChange,
  showPasswordManager = false,
  showMailManager = false,
  showCharacterHub = true,
  showFreedcamp = false,
  showDashboard = true,
  onToggleAllFolders,
}: CharacterHubProps) {
  const [editingProfile, setEditingProfile] = useState<BrowserProfile | null>(null);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const electronAPI = useElectronAPI();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalFolderId, setCreateModalFolderId] = useState<string | undefined>(undefined);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [profileForEdit, setProfileForEdit] = useState<BrowserProfile | null>(null);
  const [editingFolder, setEditingFolder] = useState<ProfileFolder | null>(null);

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

  const handleDeleteProfile = async (profileId: string) => {
    try {
      await electronAPI.profiles.delete(profileId);
      onProfilesChange();
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
      onFoldersChange();
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

  const handleOpenAllInBrowser = async (folderId: string) => {
    const folderProfiles = profiles.filter(p => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
    for (const profile of folderProfiles) {
      try {
        await electronAPI.launcher.launch(profile.id, 'https://x.com');
      } catch (error) {
        console.error('Error launching profile:', profile.id, error);
      }
    }
    onProfilesChange();
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
    onProfilesChange();
  };

  const profileCountByFolder = useMemo(() => {
    const map = new Map<string | undefined, number>();
    for (const p of profiles) {
      map.set(p.folderId, (map.get(p.folderId) || 0) + 1);
    }
    return map;
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = profiles;
    if (q) {
      result = profiles.filter((p) => {
        if (p.name.toLowerCase().includes(q)) return true;
        if (p.fcInfo?.ig?.some(tag => tag.toLowerCase().includes(q))) return true;
        if (p.fcInfo?.x?.some(tag => tag.toLowerCase().includes(q))) return true;
        if (p.fcInfo?.sc?.some(link =>
          link.text.toLowerCase().includes(q) || link.url.toLowerCase().includes(q)
        )) return true;
        return false;
      });
    }
    if (sortOrder) {
      result = [...result].sort((a, b) =>
        sortOrder === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name)
      );
    }
    return result;
  }, [profiles, search, sortOrder]);
  const openExternal = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="character-hub-container">
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
        showPasswordManager={showPasswordManager}
        showMailManager={showMailManager}
        showCharacterHub={showCharacterHub}
        showFreedcamp={showFreedcamp}
        showDashboard={showDashboard}
        onToggleAllFolders={onToggleAllFolders}
        onGoToPasswordManager={onGoToPasswordManager}
        onGoToMailManager={onGoToMailManager}
      />

      <div className="character-hub-content">
        <div className="panel-header">
          <div className="panel-header-content">
            <h2 className="character-hub-title">Character Hub</h2>
            <div className="ch-search-wrapper">
              <span className="ch-search-icon">⌕</span>
              <input
                className="ch-search-input"
                type="text"
                placeholder="Search by name, ig, x, links..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="ch-search-clear"
                  onClick={() => setSearch('')}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <span className="character-hub-count">{filteredProfiles.length}</span>
            <button
              className="panel-header-btn active"
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? 'A→Z (click for Z→A)' : 'Z→A (click for A→Z)'}
            >
              {sortOrder === 'desc' ? 'Z↓' : 'A↓'}
            </button>
          </div>
        </div>

        <div className="character-hub-list">
          {filteredProfiles.map((profile) => {
            const hasIg = (profile.fcInfo?.ig?.length ?? 0) > 0;
            const hasX  = (profile.fcInfo?.x?.length ?? 0) > 0;
            const hasSc = (profile.fcInfo?.sc?.length ?? 0) > 0;
            return (
              <div key={profile.id} className="ch-card">
                <ProfileAvatar profile={profile} className="ch-card-avatar" />

                <div className="ch-card-body">
                  <div className="ch-card-name">{profile.name}</div>

                  <div className="ch-fc-info">
                    {hasIg && (
                      <div className="ch-fc-row">
                        <span className="ch-fc-label">ig</span>
                        <div className="ch-fc-tags">
                          {profile.fcInfo!.ig!.map((tag, i) => (
                            <button
                              key={i}
                              className="ch-fc-tag ch-fc-tag-link"
                              onClick={() => openExternal(`https://www.instagram.com/${tag}/`)}
                              title={`Open @${tag} on Instagram`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {hasX && (
                      <div className="ch-fc-row">
                        <span className="ch-fc-label">x</span>
                        <div className="ch-fc-tags">
                          {profile.fcInfo!.x!.map((tag, i) => (
                            <button
                              key={i}
                              className="ch-fc-tag ch-fc-tag-link"
                              onClick={() => openExternal(`https://x.com/${tag}`)}
                              title={`Open @${tag} on X`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {hasSc && (
                      <div className="ch-fc-row">
                        <span className="ch-fc-label">others</span>
                        <div className="ch-fc-links">
                          {profile.fcInfo!.sc!.map((item, i) => (
                            <button
                              key={i}
                              className="ch-fc-tag ch-fc-tag-link"
                              onClick={() => openExternal(item.url)}
                              title={item.url}
                            >
                              {item.text}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {!hasIg && !hasX && !hasSc && (
                      <span className="ch-fc-empty">No faceclaim info</span>
                    )}
                  </div>
                </div>

                <div className="ch-card-actions">
                  <button
                    className="btn-ch-edit"
                    onClick={() => setEditingProfile(profile)}
                    title="Edit faceclaim info"
                  >
                    ✎
                  </button>
                </div>
              </div>
            );
          })}

          {filteredProfiles.length === 0 && (
            <div className="character-hub-empty">
              <p>{profiles.length === 0 ? 'No profiles yet' : 'No results for your search'}</p>
            </div>
          )}
        </div>
      </div>

      {editingProfile && (
        <EditFCCharacterModal
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
          onSaved={() => {
            setEditingProfile(null);
            onProfilesChange();
          }}
        />
      )}

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

      {profileForEdit && (
        <ProfileModal
          profile={profileForEdit}
          onClose={() => setProfileForEdit(null)}
          onSuccess={() => {
            setProfileForEdit(null);
            onProfilesChange();
          }}
          folders={folders}
        />
      )}

      {showCreateFolderModal && (
        <CreateFolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onCreated={() => {
            setShowCreateFolderModal(false);
            onFoldersChange();
          }}
        />
      )}

      {editingFolder && (
        <EditFolderModal
          folder={editingFolder}
          onClose={() => setEditingFolder(null)}
          onUpdated={() => {
            setEditingFolder(null);
            onFoldersChange();
          }}
        />
      )}
    </div>
  );
}
