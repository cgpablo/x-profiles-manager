/**
 * Settings Component
 */

import React, { useEffect, useState } from 'react';
import { AppSettings, ChromeProfile, ProfileFolder } from '../../types';
import { useElectronAPI } from '../hooks/useElectronAPI';
import Sidebar from './Sidebar';
import CreateProfileModal from './CreateProfileModal';
import CreateFolderModal from './CreateFolderModal';
import './Settings.css';

interface SettingsProps {
  folders: ProfileFolder[];
  profiles: ChromeProfile[];
  selectedFolderId: string | null | 'ungrouped';
  onSelectFolder: (folderId: string | null | 'ungrouped') => void;
  onSettingsChange: () => void;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  expandedOthers: boolean;
  onToggleOthers: () => void;
  onGoToDashboard?: () => void;
  onGoToFolders?: () => void;
  activeStatuses?: Map<string, boolean>;
  onSettingsSaved?: () => void;
  onBackupStart?: (operation: 'export' | 'import') => void;
  onBackupSuccess?: (message: string) => void;
  onBackupError?: (error: string) => void;
  saveRef?: React.MutableRefObject<() => void>;
  onDirtyChange?: (isDirty: boolean) => void;
}

export default function Settings({ folders, profiles, selectedFolderId, onSelectFolder, onSettingsChange, expandedFolders, onToggleFolder, expandedOthers, onToggleOthers, onGoToDashboard, onGoToFolders, activeStatuses = new Map(), onSettingsSaved, onBackupStart, onBackupSuccess, onBackupError, saveRef, onDirtyChange }: SettingsProps) {
  const electronAPI = useElectronAPI();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [creatingFolderId, setCreatingFolderId] = useState<string | undefined>(undefined);

  const isDirty = settings && originalSettings
    ? JSON.stringify(settings) !== JSON.stringify(originalSettings)
    : false;

  useEffect(() => {
    loadSettings();
  }, [electronAPI]);

  const loadSettings = async () => {
    try {
      const result = await electronAPI.settings.get();
      setSettings(result);
      setOriginalSettings(result);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      await electronAPI.settings.update(settings);
      setOriginalSettings(settings);
      onSettingsSaved?.();
      setMessage('');
    } catch (error) {
      setMessage('Error saving settings');
      console.error(error);
    }
  };

  // Register save function (no deps — always keeps fresh handleSave reference)
  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
  });

  // Notify parent of dirty state only when isDirty actually changes
  useEffect(() => {
    onDirtyChange?.(!!isDirty);
  }, [isDirty]);

  const handleClearAllData = async () => {
    setIsClearing(true);
    try {
      const success = await electronAPI.system.clearAllData();
      if (success) {
        onBackupSuccess?.('All data has been cleared. The app will now restart.');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        onBackupError?.('Failed to clear data');
      }
    } catch (error) {
      onBackupError?.(error instanceof Error ? error.message : 'Error clearing data');
      console.error(error);
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  const handleExport = async () => {
    onBackupStart?.('export');
    setIsExporting(true);
    try {
      const success = await electronAPI.backup.export();
      if (success) {
        onBackupSuccess?.('Backup exported successfully!');
      } else {
        onBackupError?.('Backup export was cancelled');
      }
    } catch (error) {
      onBackupError?.(error instanceof Error ? error.message : 'Error exporting backup');
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    onBackupStart?.('import');
    setIsImporting(true);
    try {
      const success = await electronAPI.backup.import();
      if (success) {
        onBackupSuccess?.('Backup imported successfully! The app will now restart.');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        onBackupError?.('Backup import was cancelled');
      }
    } catch (error) {
      onBackupError?.(error instanceof Error ? error.message : 'Error importing backup');
      console.error(error);
    } finally {
      setIsImporting(false);
    }
  };

   // Calculate profile count by folder
    const profileCountByFolder = new Map<string | undefined, number>();
    for (const profile of profiles) {
      const folderId = profile.folderId;
      profileCountByFolder.set(folderId, (profileCountByFolder.get(folderId) || 0) + 1);
    }

    const handleMoveProfileToFolder = async (profileId: string, folderId: string | undefined) => {
      try {
        await electronAPI.profiles.update(profileId, { folderId });
        onSettingsChange();
      } catch (error) {
        console.error('Error moving profile to folder:', error);
      }
    };

    // Handlers for sidebar
    const handleLaunchProfile = () => {};
    const handleCloseProfile = () => {};
    const handleOpenAllInBrowser = async (folderId: string) => {
      const folderProfiles = profiles.filter(p => p.folderId === folderId);
      for (const profile of folderProfiles) {
        try {
          await electronAPI.launcher.launch(profile.id, 'https://x.com');
        } catch (error) {
          console.error('Error launching profile in browser:', profile.id, error);
        }
      }
      onSettingsChange();
    };

    const handleCloseAll = async (folderId: string | null) => {
      if (!folderId || typeof folderId !== 'string') {
        console.error('Invalid folderId for handleCloseAll:', folderId);
        return;
      }
      const folderProfiles = profiles.filter(p => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
      for (const profile of folderProfiles) {
        if (activeStatuses?.get(profile.id)) {
          try {
            await electronAPI.launcher.close(profile.id);
          } catch (error) {
            console.error('Error closing profile:', profile.id, error);
          }
        }
      }
      onSettingsChange();
    };

    const handleCreateFolder = () => {
      setShowCreateFolderModal(true);
    };

    const handleCreateProfile = (folderId?: string) => {
      setCreatingFolderId(folderId);
      setShowCreateModal(true);
    };

    const handleEditFolder = (folder: ProfileFolder) => {
      // No edit functionality in Settings view, but function needed for Sidebar interface
    };

    const handleDeleteFolder = (folderId: string) => {
      // No delete functionality in Settings view, but function needed for Sidebar interface
    };

  if (loading || !settings) {
    return <div className="loading">Loading settings...</div>;
  }

  return (
    <div className="settings-container">
       <Sidebar
            folders={folders}
            profiles={profiles}
            selectedFolderId={selectedFolderId}
             expandedFolders={expandedFolders}
             expandedOthers={expandedOthers}
             onSelectFolder={onSelectFolder}
             onToggleFolder={onToggleFolder}
             onToggleOthers={onToggleOthers}
             onCreateFolder={handleCreateFolder}
             onCreateProfile={handleCreateProfile}
             onEditFolder={handleEditFolder}
             onDeleteFolder={handleDeleteFolder}
             profileCountByFolder={profileCountByFolder}
             onLaunchProfile={handleLaunchProfile}
             onCloseProfile={handleCloseProfile}
             onOpenAllInBrowser={handleOpenAllInBrowser}
             onCloseAll={handleCloseAll}
             activeStatuses={activeStatuses}
             onMoveProfileToFolder={handleMoveProfileToFolder}
             onGoToDashboard={onGoToDashboard}
            onGoToFolders={onGoToFolders}
            onOpenSettings={() => {}}
         />

      <div className="settings">
        <div className="settings-header" style={{ display: 'none' }}></div>

        <div className="settings-grid">
          <div className="settings-section">
            <h3>Chrome Configuration</h3>

            <div className="setting-item">
              <label>Chrome Path</label>
              <input
                type="text"
                value={settings.chromePath}
                onChange={(e) =>
                  setSettings({ ...settings, chromePath: e.target.value })
                }
                placeholder="/path/to/chrome"
                className="input-field"
              />
              <small>Path to Chrome executable</small>
            </div>

            {settings.edgePath && (
              <div className="setting-item">
                <label>Edge Path (optional)</label>
                <input
                  type="text"
                  value={settings.edgePath}
                  onChange={(e) =>
                    setSettings({ ...settings, edgePath: e.target.value })
                  }
                  placeholder="/path/to/msedge"
                  className="input-field"
                />
                <small>Path to Microsoft Edge executable</small>
              </div>
            )}

            <div className="setting-item">
              <label>Profiles Directory</label>
              <input
                type="text"
                value={settings.profilesDir}
                onChange={(e) =>
                  setSettings({ ...settings, profilesDir: e.target.value })
                }
                placeholder="/path/to/profiles"
                className="input-field"
              />
              <small>Where profile data is stored</small>
            </div>
          </div>

          <div className="settings-section">
            <h3>Preferences</h3>

            <div className="setting-item">
              <label>Window Layout</label>
              <select
                value={settings.windowLayout}
                onChange={(e) => {
                  const newSettings = {
                    ...settings,
                    windowLayout: e.target.value as 'floating' | 'tiled',
                  };
                  setSettings(newSettings);
                  // Auto-save layout change
                  electronAPI.settings.update(newSettings).then(() => {
                    setOriginalSettings(newSettings);
                    onSettingsSaved?.();
                  }).catch(error => {
                    console.error('Error saving settings:', error);
                  });
                }}
                className="input-field"
              >
                <option value="floating">Floating</option>
                <option value="tiled">Tiled</option>
              </select>
              <small>How Chrome windows are arranged</small>
            </div>
          </div>

          <div className="settings-section info">
            <h3>About</h3>
            <div className="info-item">
              <strong>App Version</strong>
              <span>0.1.0</span>
            </div>
            <div className="info-item">
              <strong>Storage Location</strong>
              <span className="mono">{settings.profilesDir}</span>
            </div>
          </div>

          <div className="settings-section">
            <h3>Backup & Restore</h3>
            <p className="section-description">
              Export all your profiles, extensions, and settings to a backup file. Import a previously exported backup to restore everything.
            </p>
            <div className="backup-buttons">
              <button
                className="btn-primary"
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? 'Exporting...' : '📦 Export Backup'}
              </button>
              <button
                className="btn-secondary"
                onClick={handleImport}
                disabled={isImporting}
              >
                {isImporting ? 'Importing...' : '📂 Import Backup'}
              </button>
            </div>
          </div>

          <div className="settings-section danger-zone">
            <h3>Danger Zone</h3>
            <p className="danger-description">
              Clear all application data including profiles, folders, and settings. This action cannot be undone.
            </p>
            <button
              className="btn-danger"
              onClick={() => setShowClearConfirm(true)}
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : 'Clear All Data'}
            </button>
          </div>
         </div>

        <div className="settings-actions" style={{ display: 'none' }}>
          <button className="btn-save-settings" onClick={handleSave} title="Save settings">
            💾
          </button>
        </div>

        {showClearConfirm && (
          <div className="modal-overlay" onClick={() => !isClearing && setShowClearConfirm(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h2>Clear All Data?</h2>
                <button className="modal-close" onClick={() => !isClearing && setShowClearConfirm(false)} disabled={isClearing}>✕</button>
              </div>
              <div className="modal-body">
                <p>This will permanently delete:</p>
                <ul>
                  <li>All profiles</li>
                  <li>All folders</li>
                  <li>All app settings</li>
                </ul>
                <p className="warning">
                  <strong>This action cannot be undone.</strong>
                </p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn-secondary"
                  onClick={() => setShowClearConfirm(false)}
                  disabled={isClearing}
                >
                  Cancel
                </button>
                <button
                  className="btn-danger"
                  onClick={handleClearAllData}
                  disabled={isClearing}
                >
                  {isClearing ? 'Clearing...' : 'Yes, Clear All Data'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateProfileModal
          onClose={() => {
            setShowCreateModal(false);
            setCreatingFolderId(undefined);
          }}
          onSettingsChange={onSettingsChange}
          folderId={creatingFolderId}
        />
      )}

      {showCreateFolderModal && (
        <CreateFolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onSettingsChange={onSettingsChange}
        />
      )}
    </div>
  );
}
