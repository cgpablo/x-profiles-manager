/**
 * PasswordManagerView - Password Manager main view
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ChromeProfile, ProfileFolder } from '../../types';
import Sidebar from './Sidebar';
import CreatePasswordModal from './CreatePasswordModal';
import ProfileAvatar from './ProfileAvatar';
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
  activeStatuses?: Map<string, boolean>;
  showPasswordManager?: boolean;
  showCharacterHub?: boolean;
  showFreedcamp?: boolean;
  showDashboard?: boolean;
  onToggleAllFolders?: (expand: boolean) => void;
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
  activeStatuses = new Map(),
  showPasswordManager = true,
  showCharacterHub = false,
  showFreedcamp = false,
  showDashboard = true,
  onToggleAllFolders,
}: PasswordManagerViewProps) {
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PasswordEntry | null>(null);
  const [loading, setLoading] = useState(true);

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
        onCreateFolder={() => {}}
        onEditFolder={() => {}}
        onDeleteFolder={() => {}}
        profileCountByFolder={profileCountByFolder}
        activeStatuses={activeStatuses}
        onGoToDashboard={onGoToDashboard}
        onGoToFolders={onGoToFolders}
        onOpenSettings={onGoToSettings}
        onGoToCharacterHub={onGoToCharacterHub}
        onGoToPasswordManager={onGoToPasswordManager}
        showPasswordManager={showPasswordManager}
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
                    <div className="pw-entry-name">{entry.name}</div>
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
    </div>
  );
}
