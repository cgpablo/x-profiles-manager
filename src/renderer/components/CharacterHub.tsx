/**
 * CharacterHub Component - FC character info management view
 */

import React, { useState, useMemo } from 'react';
import { ChromeProfile, ProfileFolder } from '../../types';
import Sidebar from './Sidebar';
import EditFCCharacterModal from './EditFCCharacterModal';
import ProfileAvatar from './ProfileAvatar';
import './CharacterHub.css';
import './ProfilesPanel.css';

interface CharacterHubProps {
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
  activeStatuses?: Map<string, boolean>;
  onProfilesChange: () => void;
  showPasswordManager?: boolean;
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
  activeStatuses = new Map(),
  onProfilesChange,
  showPasswordManager = false,
  showCharacterHub = true,
  showFreedcamp = false,
  showDashboard = true,
  onToggleAllFolders,
}: CharacterHubProps) {
  const [editingProfile, setEditingProfile] = useState<ChromeProfile | null>(null);
  const [search, setSearch] = useState('');

  const profileCountByFolder = useMemo(() => {
    const map = new Map<string | undefined, number>();
    for (const p of profiles) {
      map.set(p.folderId, (map.get(p.folderId) || 0) + 1);
    }
    return map;
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.fcInfo?.ig?.some(tag => tag.toLowerCase().includes(q))) return true;
      if (p.fcInfo?.x?.some(tag => tag.toLowerCase().includes(q))) return true;
      if (p.fcInfo?.sc?.some(link =>
        link.text.toLowerCase().includes(q) || link.url.toLowerCase().includes(q)
      )) return true;
      return false;
    });
  }, [profiles, search]);

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
        onCreateFolder={() => {}}
        onEditFolder={() => {}}
        onDeleteFolder={() => {}}
        profileCountByFolder={profileCountByFolder}
        activeStatuses={activeStatuses}
        onGoToDashboard={onGoToDashboard}
        onGoToFolders={onGoToFolders}
        onOpenSettings={onGoToSettings}
        onGoToCharacterHub={onGoToCharacterHub}
        showPasswordManager={showPasswordManager}
        showCharacterHub={showCharacterHub}
        showFreedcamp={showFreedcamp}
        showDashboard={showDashboard}
        onToggleAllFolders={onToggleAllFolders}
        onGoToPasswordManager={onGoToPasswordManager}
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
            <span className="character-hub-count">{filteredProfiles.length} profiles</span>
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
                              className="ch-fc-link btn-link"
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
    </div>
  );
}
