/**
 * Settings Component
 */

import React, { useEffect, useRef, useState } from 'react';
import { getPlatformAPI } from '../platform';
import { Floppy, Archive, FolderOpen, X } from 'reicon-react';
import type { AppSettings, BackupInspection, BrowserProfile, ProfileFolder } from '@xpm/core';
import { usePlatformAPI } from '../hooks/usePlatformAPI';
import Sidebar from './Sidebar';
import ProfileModal from './ProfileModal';
import CreateFolderModal from './CreateFolderModal';
import DeleteConfirmModal from './DeleteProfileConfirmModal';
import BackupSelectionModal, { ExportSelectionOptions } from './BackupSelectionModal';
import './Settings.css';

interface SettingsProps {
  folders: ProfileFolder[];
  profiles: BrowserProfile[];
  selectedFolderId: string | null | 'ungrouped';
  onSelectFolder: (folderId: string | null | 'ungrouped') => void;
  onSettingsChange: () => void;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  expandedOthers: boolean;
  onToggleOthers: () => void;
  onGoToDashboard?: () => void;
  onGoToFolders?: () => void;
  onGoToCharacterHub?: () => void;
  onGoToFreedcamp?: () => void;
  onGoToPasswordManager?: () => void;
  onGoToMailManager?: () => void;
  activeStatuses?: Map<string, boolean>;
  onSettingsSaved?: () => void;
  onBackupStart?: (operation: 'export' | 'import') => void;
  onBackupSuccess?: (message: string) => void;
  onBackupError?: (error: string) => void;
}

export default function Settings({ folders, profiles, selectedFolderId, onSelectFolder, onSettingsChange, expandedFolders, onToggleFolder, expandedOthers, onToggleOthers, onGoToDashboard, onGoToFolders, onGoToCharacterHub, onGoToFreedcamp, onGoToPasswordManager, onGoToMailManager, activeStatuses = new Map(), onSettingsSaved, onBackupStart, onBackupSuccess, onBackupError }: SettingsProps) {
  const platformAPI = usePlatformAPI();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ filePath: string; inspection: BackupInspection } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeletingIcons, setIsDeletingIcons] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [creatingFolderId, setCreatingFolderId] = useState<string | undefined>(undefined);
  const [editingProfile, setEditingProfile] = useState<BrowserProfile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<BrowserProfile | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMsg({ text, type });
    statusTimerRef.current = setTimeout(() => setStatusMsg(null), 3000);
  };

  useEffect(() => () => { if (statusTimerRef.current) clearTimeout(statusTimerRef.current); }, []);

  const isDirty = settings && originalSettings
    ? JSON.stringify(settings) !== JSON.stringify(originalSettings)
    : false;

  useEffect(() => {
    loadSettings();
  }, [platformAPI]);

  const loadSettings = async () => {
    try {
      const result = await platformAPI.settings.get();
      setSettings(result);
      setOriginalSettings(result);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Notify parent when settings are saved
  const handleSave = async () => {
    if (!settings) return;
    try {
      await platformAPI.settings.update(settings);
      setOriginalSettings(settings);
      showStatus('Settings saved!');
      onSettingsSaved?.();
    } catch (error) {
      showStatus('Error saving settings', 'error');
      console.error(error);
    }
  };

  const handleClearAllData = async () => {
    setIsClearing(true);
    try {
      const success = await platformAPI.system.clearAllData();
      if (success) {
        showStatus('Clearing data... App will restart.');
        onBackupSuccess?.('All data has been cleared. The app will now restart.');
        setTimeout(() => { window.location.reload(); }, 2000);
      } else {
        showStatus('Failed to clear data', 'error');
        onBackupError?.('Failed to clear data');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error clearing data';
      showStatus(msg, 'error');
      onBackupError?.(msg);
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
      const success = await platformAPI.backup.export();
      if (success) {
        showStatus('Backup exported!');
        onBackupSuccess?.('Backup exported successfully!');
      } else {
        showStatus('Export cancelled', 'error');
        onBackupError?.('Backup export was cancelled');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error exporting backup';
      showStatus(msg, 'error');
      onBackupError?.(msg);
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSelected = async (profileIds: string[], exportOptions: ExportSelectionOptions) => {
    onBackupStart?.('export');
    setIsExporting(true);
    try {
      const success = await platformAPI.backup.exportSelected(profileIds, exportOptions);
      if (success) {
        setShowExportModal(false);
        showStatus('Selected profiles exported!');
        onBackupSuccess?.('Selected profiles exported successfully!');
      } else {
        showStatus('Export cancelled', 'error');
        onBackupError?.('Backup export was cancelled');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error exporting backup';
      showStatus(msg, 'error');
      onBackupError?.(msg);
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  const runRestore = async (filePath: string, targetFolderId?: string | null) => {
    const result = await platformAPI.backup.restore(filePath, { targetFolderId });
    const summary = `${result.profilesAdded} profiles added (${result.profilesSkipped} skipped), ` +
      `${result.passwordsAdded} passwords, ${result.mailsAdded} mails added`;
    showStatus('Backup imported! Restarting...');
    onBackupSuccess?.(`Backup imported successfully: ${summary}. The app will now restart.`);
    setTimeout(() => { window.location.reload(); }, 2000);
  };

  const handleImport = async () => {
    onBackupStart?.('import');
    setIsImporting(true);
    try {
      const picked = await platformAPI.backup.import();
      if (picked.inspection.type === 'partial') {
        setPendingImport(picked);
        return;
      }
      await runRestore(picked.filePath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error importing backup';
      showStatus(msg, 'error');
      onBackupError?.(msg);
      console.error(error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmPartialImport = async (targetFolderId: string | null | undefined) => {
    if (!pendingImport) return;
    setIsImporting(true);
    try {
      await runRestore(pendingImport.filePath, targetFolderId);
      setPendingImport(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error importing backup';
      showStatus(msg, 'error');
      onBackupError?.(msg);
      console.error(error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteBackedUpIcons = async () => {
    setIsDeletingIcons(true);
    try {
      await getPlatformAPI().icons.deleteAll();
      showStatus('Icons deleted');
      onBackupSuccess?.('Backed up icons deleted successfully');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error deleting backed up icons';
      showStatus(msg, 'error');
      onBackupError?.(msg);
    } finally {
      setIsDeletingIcons(false);
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
        await platformAPI.profiles.update(profileId, { folderId });
        onSettingsChange();
      } catch (error) {
        console.error('Error moving profile to folder:', error);
      }
    };

    // Handlers for sidebar
    const handleLaunchProfile = async (profileId: string) => {
      try {
        await platformAPI.launcher.launch(profileId, 'https://x.com');
        onSettingsChange();
      } catch (error) {
        console.error('Error launching profile:', error);
      }
    };
    const handleCloseProfile = async (profileId: string) => {
      try {
        await platformAPI.launcher.close(profileId);
        onSettingsChange();
      } catch (error) {
        console.error('Error closing profile:', error);
      }
    };
    const handleOpenAllInBrowser = async (folderId: string) => {
      const folderProfiles = profiles.filter(p => p.folderId === folderId || (folderId === 'ungrouped' && !p.folderId));
      for (const profile of folderProfiles) {
        try {
          await platformAPI.launcher.launch(profile.id, 'https://x.com');
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
            await platformAPI.launcher.close(profile.id);
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

    const handleEditProfile = (profile: BrowserProfile) => {
      setEditingProfile(profile);
    };

    const handleDeleteProfile = (profileId: string) => {
      const profile = profiles.find(p => p.id === profileId);
      if (profile) setProfileToDelete(profile);
    };

    const handleDeleteProfileConfirm = async (profileId: string) => {
      try {
        if (activeStatuses?.get(profileId)) {
          await handleCloseProfile(profileId);
        }
        await platformAPI.profiles.delete(profileId);
        onSettingsChange();
      } catch (error) {
        console.error('Error deleting profile:', error);
      }
    };

    const handleToggleStar = async (profileId: string) => {
      const profile = profiles.find(p => p.id === profileId);
      if (!profile) return;
      try {
        await platformAPI.profiles.update(profileId, { starred: !profile.starred });
        onSettingsChange();
      } catch (error) {
        console.error('Error toggling star:', error);
      }
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
       <Sidebar            folders={folders}
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
             showPasswordManager={settings.platformPreferences?.showPasswordManager ?? false}
             showMailManager={settings.platformPreferences?.showMailManager ?? false}
             showCharacterHub={settings.platformPreferences?.showCharacterHub ?? false}
             showFreedcamp={settings.platformPreferences?.showFreedcamp ?? false}
             showDashboard={settings.platformPreferences?.showDashboard ?? true}
             onGoToCharacterHub={onGoToCharacterHub}
             onGoToFreedcamp={onGoToFreedcamp}
             onGoToPasswordManager={onGoToPasswordManager}
             onGoToMailManager={onGoToMailManager}
             onEditProfile={handleEditProfile}
             onDeleteProfile={handleDeleteProfile}
             onToggleStar={handleToggleStar}
           />

      <div className="settings-main">
        <div className="panel-header settings-panel-header">
          <div className="panel-header-content">
            <h3 className="panel-header-folder-name">SETTINGS</h3>
            <button
              className="panel-header-btn"
              onClick={handleSave}
              title="Save settings"
              style={{ visibility: isDirty ? 'visible' : 'hidden' }}
            >
              <Floppy size={16} />
            </button>
            {statusMsg && (
              <span className={`settings-status-msg settings-status-${statusMsg.type}`}>
                {statusMsg.text}
              </span>
            )}
          </div>
        </div>{/* panel-header */}

        <div className="settings">

        <div className="settings-grid">
          <div className="settings-section info">
            <h3>About</h3>
            <div className="info-item">
              <strong>App Version</strong>
              <span>1.3.0</span>
            </div>
            <div className="info-item">
              <strong>Storage Location</strong>
              <span className="mono">{settings.profilesDir}</span>
            </div>
          </div>

          <div className="settings-section">
            <h3>Browser Configuration</h3>

            <div className="setting-item">
              <label>Browser Engine</label>
              <select
                value={settings.browserEngine || 'chromium'}
                onChange={(e) =>
                  setSettings({ ...settings, browserEngine: e.target.value as 'chromium' | 'gecko' })
                }
                className="input-field"
              >
                <option value="chromium">Chromium (Chrome, Edge, Brave...)</option>
                <option value="gecko">Gecko (Firefox, Zen, LibreWolf...)</option>
              </select>
              <small>Select which browser engine to use for profiles</small>
            </div>

            {(settings.browserEngine || 'chromium') === 'chromium' ? (
              <div className="setting-item">
                <label>Chrome Path</label>
                <div className="input-with-button">
                  <input
                    type="text"
                    value={settings.chromePath}
                    onChange={(e) =>
                      setSettings({ ...settings, chromePath: e.target.value })
                    }
                    placeholder="/path/to/chrome"
                    className="input-field"
                  />
                  <button
                    className="explore-button"
                    onClick={async () => {
                      try {
                        const path = await getPlatformAPI().system.selectFile();
                        setSettings({ ...settings, chromePath: path });
                      } catch (error) {
                        console.error('Error selecting Chrome path:', error);
                      }
                    }}
                    title="Browse for Chrome executable"
                  >
                    Browse
                  </button>
                </div>
                <small>Path to Chrome executable</small>
              </div>
            ) : (
              <div className="setting-item">
                <label>Firefox / Zen Path</label>
                <div className="input-with-button">
                  <input
                    type="text"
                    value={settings.geckoPath || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, geckoPath: e.target.value })
                    }
                    placeholder="/path/to/firefox"
                    className="input-field"
                  />
                  <button
                    className="explore-button"
                    onClick={async () => {
                      try {
                        const path = await getPlatformAPI().system.selectFile();
                        setSettings({ ...settings, geckoPath: path });
                      } catch (error) {
                        console.error('Error selecting browser path:', error);
                      }
                    }}
                    title="Browse for Firefox/Zen executable"
                  >
                    Browse
                  </button>
                </div>
                <small>Path to Firefox, Zen Browser, or compatible Gecko browser</small>
              </div>
            )}

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
              <div className="input-with-button">
                <input
                  type="text"
                  value={settings.profilesDir}
                  onChange={(e) =>
                    setSettings({ ...settings, profilesDir: e.target.value })
                  }
                  placeholder="/path/to/profiles"
                  className="input-field"
                />
                <button
                  className="explore-button"
                  onClick={async () => {
                    try {
                      const path = await getPlatformAPI().system.selectDirectory();
                      setSettings({ ...settings, profilesDir: path });
                    } catch (error) {
                      console.error('Error selecting profiles directory:', error);
                    }
                  }}
                  title="Browse for profiles directory"
                >
                  Browse
                </button>
              </div>
              <small>Where profile data is stored</small>
            </div>
          </div>

          <div className="settings-section">
            <h3>Platform Preferences</h3>
            
            <div className="setting-item">
              <label>Enable Focus Windows</label>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="enableFocus"
                  checked={settings.platformPreferences?.enableFocusWindows !== false}
                  onChange={(e) => {
                    const prefs = settings.platformPreferences || {};
                    const newSettings = {
                      ...settings,
                      platformPreferences: {
                        ...prefs,
                        enableFocusWindows: e.target.checked,
                      },
                    };
                    setSettings(newSettings);
                  }}
                />
                <label htmlFor="enableFocus" style={{ marginLeft: '8px' }}>
                  Allow clicking "Focus" to bring browser window to front
                </label>
              </div>
              <small>When disabled, focus button will be hidden</small>
            </div>

            <div className="setting-item">
              <label>Developer Mode</label>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="developerMode"
                  checked={settings.platformPreferences?.developerMode || false}
                  onChange={(e) => {
                    const prefs = settings.platformPreferences || {};
                    const newSettings = {
                      ...settings,
                      platformPreferences: {
                        ...prefs,
                        developerMode: e.target.checked,
                      },
                    };
                    setSettings(newSettings);
                  }}
                />
                <label htmlFor="developerMode" style={{ marginLeft: '8px' }}>
                  Show developer options
                </label>
              </div>
              <small>Shows advanced settings and debug options</small>
            </div>

            {settings.platformPreferences?.developerMode && getPlatformAPI().platform === 'win32' && (
              <>
                <div className="setting-item">
                  <label>Windows Focus Method</label>
                  <select
                    value={settings.platformPreferences?.focusMethodWindows || 'auto'}
                    onChange={(e) => {
                      const prefs = settings.platformPreferences || {};
                      const newSettings = {
                        ...settings,
                        platformPreferences: {
                          ...prefs,
                          focusMethodWindows: e.target.value as 'auto' | 'winapi' | 'cdp',
                        },
                      };
                      setSettings(newSettings);
                    }}
                    className="input-field"
                  >
                    <option value="auto">Auto (Windows API first, fallback to CDP)</option>
                    <option value="winapi">Windows API (SetForegroundWindow only)</option>
                    <option value="cdp">CDP (open/close tab - 100% reliable)</option>
                  </select>
                  <small>How to focus the browser window on Windows (CDP only available with Chromium engine)</small>
                </div>
              </>
            )}

            {settings.platformPreferences?.developerMode && (
              <div className="setting-item">
                <label>Debug Mode</label>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    id="debugMode"
                    checked={settings.platformPreferences?.debugMode || false}
                    onChange={(e) => {
                      const prefs = settings.platformPreferences || {};
                      const newSettings = {
                        ...settings,
                        platformPreferences: {
                          ...prefs,
                          debugMode: e.target.checked,
                        },
                      };
                      setSettings(newSettings);
                    }}
                  />
                  <label htmlFor="debugMode" style={{ marginLeft: '8px' }}>
                    Enable verbose logging in console
                  </label>
                </div>
                <small>Useful for troubleshooting focus and process issues</small>
              </div>
             )}

            {settings.platformPreferences?.developerMode && (
              <div className="setting-item">
                <label>Show Directory Button</label>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    id="showDirectory"
                    checked={settings.platformPreferences?.showDirectory || false}
                    onChange={(e) => {
                      const prefs = settings.platformPreferences || {};
                      setSettings({
                        ...settings,
                        platformPreferences: {
                          ...prefs,
                          showDirectory: e.target.checked,
                        },
                      });
                    }}
                  />
                  <label htmlFor="showDirectory" style={{ marginLeft: '8px' }}>
                    Show profile directory button on cards
                  </label>
                </div>
                <small>Adds a button to open the profile folder in Finder / Explorer</small>
              </div>
             )}

            {settings.platformPreferences?.developerMode && (
              <div className="setting-item">
                <label>Extensions Manager</label>
                <small style={{ display: 'block', marginBottom: '8px' }}>
                  Auto-open extension store pages on first profile launch when not installed
                </small>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div className="checkbox-group">
                    <input
                      type="checkbox"
                      id="extUblock"
                      checked={settings.platformPreferences?.extensionsConfig?.ublockOriginLite || false}
                      onChange={(e) => {
                        const prefs = settings.platformPreferences || {};
                        const extConfig = prefs.extensionsConfig || {};
                        setSettings({
                          ...settings,
                          platformPreferences: {
                            ...prefs,
                            extensionsConfig: {
                              ...extConfig,
                              ublockOriginLite: e.target.checked,
                            },
                          },
                        });
                      }}
                    />
                    <label htmlFor="extUblock">
                      uBlock Origin Lite
                    </label>
                  </div>
                  <div className="checkbox-group">
                    <input
                      type="checkbox"
                      id="extTwitterControl"
                      checked={settings.platformPreferences?.extensionsConfig?.twitterControl || false}
                      onChange={(e) => {
                        const prefs = settings.platformPreferences || {};
                        const extConfig = prefs.extensionsConfig || {};
                        setSettings({
                          ...settings,
                          platformPreferences: {
                            ...prefs,
                            extensionsConfig: {
                              ...extConfig,
                              twitterControl: e.target.checked,
                            },
                          },
                        });
                      }}
                    />
                    <label htmlFor="extTwitterControl">
                      Control Panel for Twitter
                    </label>
                  </div>
                </div>
                <small>
                  {(settings.browserEngine || 'chromium') === 'chromium'
                    ? 'Opens Chrome Web Store pages for missing extensions'
                    : 'Opens Firefox Add-ons pages for missing extensions'}
                </small>
              </div>
            )}

           </div>

           <div className="settings-section">
             <h3>Sidebar Configuration</h3>

             <div className="setting-item">
               <label>Show Dashboard</label>
               <div className="checkbox-group">
                 <input
                   type="checkbox"
                   id="showDashboard"
                   checked={settings.platformPreferences?.showDashboard ?? true}
                   onChange={(e) => {
                     const prefs = settings.platformPreferences || {};
                     setSettings({
                       ...settings,
                       platformPreferences: {
                         ...prefs,
                         showDashboard: e.target.checked,
                       },
                     });
                   }}
                 />
                 <label htmlFor="showDashboard" style={{ marginLeft: '8px' }}>
                   Show Dashboard button in sidebar
                 </label>
               </div>
               <small>When disabled, the Dashboard button is hidden from the sidebar</small>
             </div>

             <div className="setting-item">
               <label>Show Password Manager</label>
               <div className="checkbox-group">
                 <input
                   type="checkbox"
                   id="showPasswordManager"
                   checked={settings.platformPreferences?.showPasswordManager ?? false}
                   onChange={(e) => {
                     const prefs = settings.platformPreferences || {};
                     setSettings({
                       ...settings,
                       platformPreferences: {
                         ...prefs,
                         showPasswordManager: e.target.checked,
                       },
                     });
                   }}
                 />
                 <label htmlFor="showPasswordManager" style={{ marginLeft: '8px' }}>
                   Show Password Manager section in sidebar
                 </label>
               </div>
               <small>When enabled, a Password Manager shortcut appears above Settings</small>
             </div>

             <div className="setting-item">
               <label>Show Mail Manager</label>
               <div className="checkbox-group">
                 <input
                   type="checkbox"
                   id="showMailManager"
                   checked={settings.platformPreferences?.showMailManager ?? false}
                   onChange={(e) => {
                     const prefs = settings.platformPreferences || {};
                     setSettings({
                       ...settings,
                       platformPreferences: {
                         ...prefs,
                         showMailManager: e.target.checked,
                       },
                     });
                   }}
                 />
                 <label htmlFor="showMailManager" style={{ marginLeft: '8px' }}>
                   Show Mail Manager section in sidebar
                 </label>
               </div>
               <small>When enabled, a Mail Manager shortcut appears above Settings</small>
             </div>

             <div className="setting-item">
               <label>Show Character Hub</label>
               <div className="checkbox-group">
                 <input
                   type="checkbox"
                   id="showCharacterHub"
                   checked={settings.platformPreferences?.showCharacterHub ?? false}
                   onChange={(e) => {
                     const prefs = settings.platformPreferences || {};
                     setSettings({
                       ...settings,
                       platformPreferences: {
                         ...prefs,
                         showCharacterHub: e.target.checked,
                       },
                     });
                   }}
                 />
                 <label htmlFor="showCharacterHub" style={{ marginLeft: '8px' }}>
                   Show Character Hub section in sidebar
                 </label>
               </div>
               <small>When enabled, a Character Hub shortcut appears above Settings</small>
             </div>

             <div className="setting-item">
               <label>Show Freedcamp</label>
               <div className="checkbox-group">
                 <input
                   type="checkbox"
                   id="showFreedcamp"
                   checked={settings.platformPreferences?.showFreedcamp ?? false}
                   onChange={(e) => {
                     const prefs = settings.platformPreferences || {};
                     setSettings({
                       ...settings,
                       platformPreferences: {
                         ...prefs,
                         showFreedcamp: e.target.checked,
                       },
                     });
                   }}
                 />
                 <label htmlFor="showFreedcamp" style={{ marginLeft: '8px' }}>
                   Show Freedcamp section in sidebar
                 </label>
               </div>
               <small>When enabled, a Freedcamp shortcut appears above Settings</small>
             </div>
           </div>

           {/* Extensions Section - DISABLED */}
           {/*
           <div className="settings-section">
             <h3>Extensions</h3>
             <p className="section-description">
               Select which extensions to automatically install on all profiles.
             </p>
             <div className="extensions-container">
               <div className="extension-item">
                 <div className="checkbox-group">
                   <input
                     type="checkbox"
                     id="ublockOriginLite"
                     checked={settings.platformPreferences?.extensionsConfig?.ublockOriginLite !== false}
                     onChange={(e) => {
                       const prefs = settings.platformPreferences || {};
                       const extConfig = prefs.extensionsConfig || {};
                       const newSettings = {
                         ...settings,
                         platformPreferences: {
                           ...prefs,
                           extensionsConfig: {
                             ...extConfig,
                             ublockOriginLite: e.target.checked,
                           },
                         },
                       };
                       setSettings(newSettings);
                     }}
                   />
                   <label htmlFor="ublockOriginLite" style={{ marginLeft: '8px' }}>
                     <strong>uBlock Origin Lite</strong>
                   </label>
                 </div>
                 <small>Lightweight ad blocker and privacy tool</small>
               </div>

               <div className="extension-item">
                 <div className="checkbox-group">
                   <input
                     type="checkbox"
                     id="twitterControl"
                     checked={settings.platformPreferences?.extensionsConfig?.twitterControl !== false}
                     onChange={(e) => {
                       const prefs = settings.platformPreferences || {};
                       const extConfig = prefs.extensionsConfig || {};
                       const newSettings = {
                         ...settings,
                         platformPreferences: {
                           ...prefs,
                           extensionsConfig: {
                             ...extConfig,
                             twitterControl: e.target.checked,
                           },
                         },
                       };
                       setSettings(newSettings);
                     }}
                   />
                   <label htmlFor="twitterControl" style={{ marginLeft: '8px' }}>
                     <strong>Control Panel for Twitter</strong>
                   </label>
                 </div>
                 <small>Enhance and control your Twitter experience</small>
               </div>
             </div>
           </div>
           */}

           <div className="settings-section">
             <h3>Backup & Restore</h3>

             <div className="setting-item">
               <label>Backup Profiles</label>
               <p className="section-description">
                 Export all your profiles, extensions, and settings to a backup file. Export selected profiles only, or import a previously exported backup to restore everything.
               </p>
               <div className="backup-buttons">
                 <button
                   className="btn-primary"
                   onClick={handleExport}
                   disabled={isExporting}
                 >
                    {isExporting ? 'Exporting...' : <><Archive size={14} /> Export All</>}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setShowExportModal(true)}
                    disabled={isExporting}
                  >
                    <Archive size={14} /> Export
                 </button>
                 <button
                   className="btn-secondary"
                   onClick={handleImport}
                   disabled={isImporting}
                 >
                    {isImporting ? 'Importing...' : <><FolderOpen size={14} /> Import</>}
                 </button>
               </div>
             </div>

             <div className="setting-item">
               <label>Backup Icons</label>
               <div className="checkbox-group">
                 <input
                   type="checkbox"
                   id="backupIcons"
                   checked={settings.backupIcons || false}
                   onChange={(e) => setSettings({ ...settings, backupIcons: e.target.checked })}
                 />
                 <label htmlFor="backupIcons" style={{ marginLeft: '8px' }}>
                   Copy images to app data when a profile image is selected
                 </label>
               </div>
               <small>Ensures images remain available even if the original files are moved or deleted</small>
               <button
                 className="btn-secondary"
                 onClick={handleDeleteBackedUpIcons}
                 disabled={isDeletingIcons}
                 style={{ marginTop: '0.5rem' }}
               >
                 {isDeletingIcons ? 'Deleting...' : 'Delete icons'}
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
            <Floppy size={16} />
          </button>
        </div>

        {showClearConfirm && (
          <div className="modal-overlay" onClick={() => !isClearing && setShowClearConfirm(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h2>Clear All Data?</h2>
                 <button className="modal-close" onClick={() => !isClearing && setShowClearConfirm(false)} disabled={isClearing}><X size={14} /></button>
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

      {showExportModal && (
        <BackupSelectionModal
          mode="export"
          folders={folders}
          profiles={profiles}
          busy={isExporting}
          onAccept={handleExportSelected}
          onCancel={() => setShowExportModal(false)}
        />
      )}

      {pendingImport && (
        <BackupSelectionModal
          mode="import"
          folders={folders}
          inspection={pendingImport.inspection}
          busy={isImporting}
          onAccept={handleConfirmPartialImport}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {showCreateModal && (
        <ProfileModal
          onClose={() => {
            setShowCreateModal(false);
            setCreatingFolderId(undefined);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setCreatingFolderId(undefined);
            onSettingsChange();
          }}
          selectedFolderId={creatingFolderId}
          folders={folders}
        />
      )}

      {showCreateFolderModal && (
        <CreateFolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onCreated={() => {
            setShowCreateFolderModal(false);
            onSettingsChange();
          }}
        />
      )}

      {editingProfile && (
        <ProfileModal
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
          onSuccess={() => {
            setEditingProfile(null);
            onSettingsChange();
          }}
          folders={folders}
        />
      )}

      {profileToDelete && (
        <DeleteConfirmModal
          title="Delete Profile"
          itemName={profileToDelete.name}
          onConfirm={() => { handleDeleteProfileConfirm(profileToDelete.id); setProfileToDelete(null); }}
          onCancel={() => setProfileToDelete(null)}
        />
      )}
      </div>{/* settings-main */}
    </div>
  );
}
