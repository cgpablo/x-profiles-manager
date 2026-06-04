/**
 * Main App Component
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ChromeProfile, ProfileFolder } from '../types';
import { useElectronAPI } from './hooks/useElectronAPI';
import Dashboard from './components/Dashboard';
import Folders from './components/Folders';
// import Settings from './components/Settings'; // DISABLED
import Tooltip from './components/Tooltip';
import './App.css';

type View = 'dashboard' | 'folders' | 'settings';

function App() {
  const electronAPI = useElectronAPI();
  const [view, setView] = useState<View>('dashboard');
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedOthers, setExpandedOthers] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | 'ungrouped'>(null);


  // Order state — no initialization guard: every drag immediately shows the 💾 button
  const pendingOrderRef = useRef<{
    profiles: Map<string | 'ungrouped', ChromeProfile[]>;
    folders: ProfileFolder[];
  } | null>(null);
  // Save the original order state for undo functionality
  const originalOrderRef = useRef<{
    profiles: ChromeProfile[];
    folders: ProfileFolder[];
  } | null>(null);
  const [hasPendingOrder, setHasPendingOrder] = useState(false);
  const [orderSavedMessage, setOrderSavedMessage] = useState(false);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupOperation, setBackupOperation] = useState<'export' | 'import' | null>(null);
  const [dashboardKey, setDashboardKey] = useState(0); // Force Dashboard remount on undo
  const settingsSaveRef = useRef<() => void>(() => {});
  const [settingsIsDirty, setSettingsIsDirty] = useState(false);
  // Track which folders have been auto-expanded to avoid repeatedly expanding after manual collapse
  const autoExpandedFoldersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadProfiles();
    loadFolders();
   }, []);

   // Poll for active profile status (enriches profiles[].isActive every 2s)
   useEffect(() => {
     const interval = setInterval(() => {
       loadProfiles();
     }, 2000);
     return () => clearInterval(interval);
   }, []);

    // Auto-expand folders that have profiles on first load, but don't interfere with manual collapse
    useEffect(() => {
      const newExpanded = new Set(expandedFolders);
      let changed = false;

      // Only auto-expand folders that have profiles AND haven't been manually collapsed yet
      folders.forEach(folder => {
        const hasProfiles = profiles.some(p => p.folderId === folder.id);
        // Auto-expand only if: (1) it has profiles, (2) it hasn't been auto-expanded before, (3) it's not already expanded
        if (hasProfiles && !autoExpandedFoldersRef.current.has(folder.id) && !newExpanded.has(folder.id)) {
          newExpanded.add(folder.id);
          autoExpandedFoldersRef.current.add(folder.id);
          changed = true;
        }
      });

      if (changed) {
        setExpandedFolders(newExpanded);
      }
    }, [folders]);

    // Auto-undo pending order changes when switching views away from dashboard
    useEffect(() => {
      if (hasPendingOrder && view !== 'dashboard') {
        // Automatically undo changes (reload data and remount Dashboard)
        pendingOrderRef.current = null;
        originalOrderRef.current = null;
        setHasPendingOrder(false);
        loadProfiles();
        loadFolders();
        setDashboardKey(prev => prev + 1);
      }
    }, [view, hasPendingOrder]);

   // Central activeStatuses derived from profiles.isActive — no per-view polling needed
  const activeStatuses = useMemo(() => {
    const m = new Map<string, boolean>();
    profiles.forEach(p => m.set(p.id, !!p.isActive));
    return m;
  }, [profiles]);

  const loadProfiles = async () => {
    try {
      setError(null);
      const result = await electronAPI.profiles.getAll();
      const sorted = result.sort((a, b) => {
        const aIndex = (a as any).orderIndex ?? 0;
        const bIndex = (b as any).orderIndex ?? 0;
        return aIndex - bIndex;
      });
      setProfiles(sorted);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Error loading profiles:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async () => {
    try {
      const result = await electronAPI.folders.getAll();
      const sorted = result.sort((a, b) => {
        const aOrder = a.order ?? 0;
        const bOrder = b.order ?? 0;
        return aOrder - bOrder;
      });
      setFolders(sorted);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Error loading folders:', errorMsg);
    }
  };

  const handleProfilesChange = () => loadProfiles();
  const handleFoldersChange = () => loadFolders();

  const handleToggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      // User is manually collapsing this folder, so don't auto-expand it again
      newExpanded.delete(folderId);
      autoExpandedFoldersRef.current.delete(folderId);
    } else {
      // User is manually expanding this folder
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleToggleOthers = () => setExpandedOthers(!expandedOthers);

  const handleCloseAll = async () => {
    try {
      const count = await electronAPI.launcher.closeAll();
      console.log(`Closed ${count} profiles`);
      loadProfiles();
    } catch (error) {
      console.error('Error closing all profiles:', error);
    }
  };

  const handleUndoOrder = () => {
    // Clear pending order changes - the Dashboard component will automatically
    // revert to using the original profiles/folders props via its useEffect
    pendingOrderRef.current = null;
    originalOrderRef.current = null;
    setHasPendingOrder(false);
    // Force a reload to ensure Dashboard gets fresh data with original order
    loadProfiles();
    loadFolders();
    // Remount Dashboard to reset its internal state
    setDashboardKey(prev => prev + 1);
  };

  const handleSaveOrder = async () => {
    if (!pendingOrderRef.current) return;
    try {
      const { profiles: orderedProfiles, folders: orderedFolders } = pendingOrderRef.current;
      await electronAPI.folders.saveOrder(orderedFolders.map(f => f.id));
      const allProfileIds: string[] = [];
      for (const folder of orderedFolders) {
        const fps = orderedProfiles.get(folder.id) || [];
        allProfileIds.push(...fps.map(p => p.id));
      }
      const ungrouped = orderedProfiles.get('ungrouped') || [];
      allProfileIds.push(...ungrouped.map(p => p.id));
      await electronAPI.profiles.saveOrder(allProfileIds);
      setHasPendingOrder(false);
      setOrderSavedMessage(true);
      setTimeout(() => setOrderSavedMessage(false), 3000);
      await loadFolders(); // Refresh so sidebar reflects the saved folder order
    } catch (error) {
      console.error('Error saving order:', error);
    }
  };

  // Called on every drag-drop in Dashboard — always show the save button
  const handleOrderChange = (
    orderedProfiles: Map<string | 'ungrouped', ChromeProfile[]>,
    orderedFolders: ProfileFolder[]
  ) => {
    // Save original order only on first change
    if (!hasPendingOrder) {
      originalOrderRef.current = {
        profiles: [...profiles],
        folders: [...folders],
      };
    }
    pendingOrderRef.current = { profiles: orderedProfiles, folders: orderedFolders };
    setHasPendingOrder(true);
  };

   // Shared profileCountByFolder
  const profileCountByFolder = useMemo(() => {
    const map = new Map<string | undefined, number>();
    for (const p of profiles) {
      map.set(p.folderId, (map.get(p.folderId) || 0) + 1);
    }
    return map;
  }, [profiles]);

  const activeProfilesCount = profiles.filter(p => p.isActive).length;

  return (
     <div className="app">
       <nav className="app-nav">
         <div className="nav-title">
           <h1>My X Profiles Manager</h1>
         </div>
         {orderSavedMessage && (
           <div className="nav-saved-banner">Order saved!</div>
         )}
           {settingsSavedMessage && (
            <div className="nav-saved-banner">Settings saved!</div>
          )}
          {isBackingUp && (
            <div className="nav-backing-up-banner">
              {backupOperation === 'export' ? '⏳ Exporting backup, this may take a while...' : '⏳ Importing backup, this may take a while...'}
            </div>
          )}
          {backupMessage && (
            <div className={`nav-saved-banner nav-${backupMessage.type}-banner`}>
              {backupMessage.text}
            </div>
          )}
         <div className="nav-actions">
            {activeProfilesCount > 0 && (
              <Tooltip text="Close all profiles" position="bottom">
                <button
                  className="btn-close-all"
                  onClick={handleCloseAll}
                  title={`Close all ${activeProfilesCount} active profile(s)`}
                >
                  ✕
                </button>
              </Tooltip>
            )}
            {hasPendingOrder && (
              <Tooltip text="Undo changes" position="bottom">
                <button
                  className="btn-undo-order"
                  onClick={handleUndoOrder}
                  title="Undo changes"
                >
                  ↶
                </button>
              </Tooltip>
            )}
            {hasPendingOrder && (
              <button
                className="btn-save-order"
                onClick={handleSaveOrder}
                title="Save current order"
              >
                💾
              </button>
            )}
            {view === 'settings' && settingsIsDirty && (
              <button
                className="btn-save-order"
                onClick={() => settingsSaveRef.current()}
                title="Save settings"
              >
                💾
              </button>
            )}
         </div>
      </nav>

      <main className="app-main">
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            {/* Dashboard stays mounted to preserve drag order — hidden when not active */}
             <div style={{ display: view === 'dashboard' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
               <Dashboard
                 key={dashboardKey}
                 folders={folders}
                 profiles={profiles}
                 selectedFolderId={selectedFolderId}
                 onSelectFolder={setSelectedFolderId}
                 onProfilesChange={handleProfilesChange}
                 onFoldersChange={handleFoldersChange}
                 expandedFolders={expandedFolders}
                 onToggleFolder={handleToggleFolder}
                 expandedOthers={expandedOthers}
                 onToggleOthers={handleToggleOthers}
                  onGoToDashboard={() => setView('dashboard')}
                  onGoToSettings={() => setView('settings')}
                  onGoToFolders={() => setView('folders')}
                  onOrderChange={handleOrderChange}
                  activeStatuses={activeStatuses}
               />
            </div>

            {view === 'folders' && (
              <Folders
                folders={folders}
                profiles={profiles}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                onProfilesChange={handleProfilesChange}
                onFoldersChange={handleFoldersChange}
                expandedFolders={expandedFolders}
                onToggleFolder={handleToggleFolder}
                expandedOthers={expandedOthers}
                onToggleOthers={handleToggleOthers}
                onGoToDashboard={() => setView('dashboard')}
                onGoToSettings={() => setView('settings')}
                onGoToFolders={() => setView('folders')}
                activeStatuses={activeStatuses}
              />
            )}

            {/* Settings view - DISABLED
            {view === 'settings' && (
              <Settings
                folders={folders}
                profiles={profiles}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                onSettingsChange={handleProfilesChange}
                expandedFolders={expandedFolders}
                onToggleFolder={handleToggleFolder}
                expandedOthers={expandedOthers}
                onToggleOthers={handleToggleOthers}
                onGoToDashboard={() => setView('dashboard')}
                onGoToFolders={() => setView('folders')}
                activeStatuses={activeStatuses}
                onSettingsSaved={() => {
                  setSettingsSavedMessage(true);
                  setSettingsIsDirty(false);
                  setTimeout(() => setSettingsSavedMessage(false), 3000);
                }}
                onBackupSuccess={(message) => {
                  setIsBackingUp(false);
                  setBackupOperation(null);
                  setBackupMessage({ type: 'success', text: message });
                  setTimeout(() => setBackupMessage(null), 3000);
                }}
                onBackupError={(error) => {
                  setIsBackingUp(false);
                  setBackupOperation(null);
                  setBackupMessage({ type: 'error', text: error });
                  setTimeout(() => setBackupMessage(null), 3000);
                }}
                onBackupStart={(operation) => {
                  setIsBackingUp(true);
                  setBackupOperation(operation);
                }}
                saveRef={settingsSaveRef}
                onDirtyChange={setSettingsIsDirty}
              />
            )}
            */}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
