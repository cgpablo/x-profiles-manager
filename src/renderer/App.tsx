/**
 * Main App Component
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Star, SearchNormal, X, Undo, Floppy, Check } from 'reicon-react';
import { BrowserProfile, ProfileFolder } from '../types';
import { useElectronAPI } from './hooks/useElectronAPI';
import Dashboard from './components/Dashboard';
import Folders from './components/Folders';
import Settings from './components/Settings';
import CharacterHub from './components/CharacterHub';
import PasswordManagerView from './components/PasswordManagerView';
import MailManagerView from './components/MailManagerView';
import Tooltip from './components/Tooltip';
import './App.css';

type View = 'dashboard' | 'folders' | 'settings' | 'character-hub' | 'password-manager' | 'mail-manager';

function App() {
  const electronAPI = useElectronAPI();
  const [view, setView] = useState<View>('dashboard');
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedOthers, setExpandedOthers] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | 'ungrouped' | '__online__' | '__search__' | '__starred__'>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [symbolCopied, setSymbolCopied] = useState(false);
  const [symbolCount, setSymbolCount] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);


  // Order state — no initialization guard: every drag immediately shows the 💾 button
  const pendingOrderRef = useRef<{
    profiles: Map<string | 'ungrouped', BrowserProfile[]>;
    folders: ProfileFolder[];
  } | null>(null);
  // Save the original order state for undo functionality
  const originalOrderRef = useRef<{
    profiles: BrowserProfile[];
    folders: ProfileFolder[];
  } | null>(null);
  const [hasPendingOrder, setHasPendingOrder] = useState(false);
  const [orderSavedMessage, setOrderSavedMessage] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupOperation, setBackupOperation] = useState<'export' | 'import' | null>(null);
  const [dashboardKey, setDashboardKey] = useState(0); // Force Dashboard remount on undo
  const [showPasswordManager, setShowPasswordManager] = useState(false);
  const [showMailManager, setShowMailManager] = useState(false);
  const [showCharacterHub, setShowCharacterHub] = useState(false);
  const [showFreedcamp, setShowFreedcamp] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showDirectory, setShowDirectory] = useState(false);
  // Track which folders have been auto-expanded to avoid repeatedly expanding after manual collapse
  const autoExpandedFoldersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadProfiles();
    loadFolders();
    loadSidebarSettings(true);
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

    // Clear search input when user navigates away from search mode
    useEffect(() => {
      if (selectedFolderId !== '__search__') {
        setSearchQuery('');
      }
    }, [selectedFolderId]);

    // Global keyboard shortcut: any printable key focuses search input
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key.length !== 1) return; // only single printable characters
        const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        searchInputRef.current?.focus();
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

   // Central activeStatuses derived from profiles.isActive — no per-view polling needed
  const activeStatuses = useMemo(() => {
    const m = new Map<string, boolean>();
    profiles.forEach(p => m.set(p.id, !!p.isActive));
    return m;
  }, [profiles]);

  const loadSidebarSettings = async (isInitialLoad = false) => {
    try {
      const result = await electronAPI.settings.get();
      setShowPasswordManager(result.platformPreferences?.showPasswordManager ?? false);
      setShowMailManager(result.platformPreferences?.showMailManager ?? false);
      setShowCharacterHub(result.platformPreferences?.showCharacterHub ?? false);
      setShowFreedcamp(result.platformPreferences?.showFreedcamp ?? false);
      const dashboardVisible = result.platformPreferences?.showDashboard ?? true;
      setShowDashboard(dashboardVisible);
      setShowDirectory(result.platformPreferences?.developerMode && result.platformPreferences?.showDirectory ? true : false);
      // On initial load, redirect to 'folders' if dashboard is hidden
      if (isInitialLoad && !dashboardVisible) {
        setView('folders');
      }
    } catch (error) {
      console.error('Error loading sidebar settings:', error);
    }
  };

  const loadProfiles = async () => {
    try {
      setError(null);
      const [result, passwords, mails] = await Promise.all([
        electronAPI.profiles.getAll(),
        electronAPI.passwords.getAll().catch(() => [] as { profileIds: string[] }[]),
        window.electronAPI.mails.getAll().catch(() => [] as { profileIds: string[]; email: string }[]),
      ]);
      const passwordProfileIds = new Set(passwords.flatMap(pw => pw.profileIds));
      // Build profileId → email map (last entry wins if a profile has multiple mails)
      const mailByProfileId = new Map<string, string>();
      mails.forEach((m: { profileIds: string[]; email: string }) =>
        m.profileIds.forEach(pid => mailByProfileId.set(pid, m.email))
      );
      const sorted = result
        .map(p => ({
          ...p,
          hasPassword: passwordProfileIds.has(p.id),
          hasMail: mailByProfileId.has(p.id),
          mailEmail: mailByProfileId.get(p.id),
        }))
        .sort((a, b) => {
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

  const handleToggleAllFolders = (expand: boolean) => {
    if (expand) {
      const newExpanded = new Set(folders.map(f => f.id));
      folders.forEach(f => autoExpandedFoldersRef.current.add(f.id));
      setExpandedFolders(newExpanded);
      setExpandedOthers(true);
    } else {
      autoExpandedFoldersRef.current.clear();
      setExpandedFolders(new Set());
      setExpandedOthers(false);
    }
  };

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
    orderedProfiles: Map<string | 'ungrouped', BrowserProfile[]>,
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
  const starredProfilesCount = profiles.filter(p => p.starred).length;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim()) {
      setView('folders');
      setSelectedFolderId('__search__');
    } else if (selectedFolderId === '__search__') {
      setSelectedFolderId(null);
    }
  };

  const handleCopySymbol = () => {
    navigator.clipboard.writeText('—'.repeat(symbolCount));
    setSymbolCopied(true);
    setTimeout(() => setSymbolCopied(false), 1200);
  };

  const handleDecrementSymbolCount = () => {
    setSymbolCount((count) => Math.max(1, count - 1));
  };

  const handleIncrementSymbolCount = () => {
    setSymbolCount((count) => Math.min(6, count + 1));
  };

  return (
     <div className="app">
       <nav className="app-nav">
         <div className="nav-title">
           <h1>My X Profiles Manager</h1>
         </div>
         <div className="nav-center">
              {activeProfilesCount > 0 && (
                <button
                  className={`btn-show-active${activeProfilesCount > 0 ? ' has-active' : ''}`}
                  onClick={() => { setView('folders'); setSelectedFolderId('__online__'); setSearchActive(false); }}
                  title={`Show ${activeProfilesCount} active profile(s)`}
                >
                  <span className="btn-show-active-dot" />
                  Show actives
                  <span className="btn-show-active-count">{activeProfilesCount}</span>
                </button>
              )}
              <button
                className="btn-show-starred"
                onClick={() => { setView('folders'); setSelectedFolderId('__starred__'); setSearchActive(false); }}
                title={starredProfilesCount > 0 ? `Show ${starredProfilesCount} favorite profile(s)` : 'No favorites yet'}
              >
                 <span className="btn-show-starred-icon"><Star size={14} weight="Filled" /></span>
                Show favorites
                {starredProfilesCount > 0 && (
                  <span className="btn-show-starred-count">{starredProfilesCount}</span>
                )}
              </button>
            <div className="nav-search">
              <span className="nav-search-icon"><SearchNormal size={16} /></span>
              <input
                ref={searchInputRef}
                className="nav-search-input"
                type="text"
                placeholder="Search profiles..."
                value={searchQuery}
                onChange={handleSearchChange}
                 onFocus={() => {
                   setSearchActive(true);
                   if (!searchQuery.trim()) {
                     setView('folders');
                     setSelectedFolderId(null);
                   }
                 }}
                 onBlur={() => {
                   // Intentionally empty — search mode only exits via ESC or navigation
                 }}
                 onKeyDown={(e) => {
                   if (e.key === 'Escape') {
                     setSearchQuery('');
                     setSelectedFolderId(null);
                     searchInputRef.current?.blur();
                   }
                 }}
              />
              {searchQuery && (
                <button
                  className="nav-search-clear"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSearchQuery('');
                    setSelectedFolderId(null);
                  }}
                   title="Clear search"
                 >
                   <X size={12} />
                </button>
              )}
            </div>
            <div className="symbol-copy-group">
              <div className="symbol-counter">
                <button
                  className="symbol-counter-btn"
                  onClick={handleDecrementSymbolCount}
                  disabled={symbolCount <= 1}
                  title="Menos"
                >
                  −
                </button>
                <span className="symbol-counter-value">{symbolCount}</span>
                <button
                  className="symbol-counter-btn"
                  onClick={handleIncrementSymbolCount}
                  disabled={symbolCount >= 6}
                  title="Más"
                >
                  +
                </button>
              </div>
              <span className="symbol-group-divider" />
              <button
                className={`btn-copy-symbol${symbolCopied ? ' copied' : ''}`}
                onClick={handleCopySymbol}
                title={`Copiar "${'—'.repeat(symbolCount)}" al portapapeles`}
              >
                {symbolCopied ? <Check size={14} /> : '—'}
              </button>
            </div>
         </div>
         {orderSavedMessage && (
           <div className="nav-saved-banner">Order saved!</div>
         )}
          {isBackingUp && (
            <div className="nav-backing-up-banner">
              {backupOperation === 'export' ? '⏳ Exporting backup, this may take a while...' : '⏳ Importing backup, this may take a while...'}
            </div>
          )}
         <div className="nav-actions">
            {activeProfilesCount > 0 && (
               <button
                 className="btn-close-all"
                 onClick={handleCloseAll}
                 title={`Close all ${activeProfilesCount} active profile(s)`}
               >
                  <><X size={14} /> Close actives</>
               </button>
             )}
            {hasPendingOrder && (
              <Tooltip text="Undo changes" position="bottom">
                <button
                  className="btn-undo-order"
                  onClick={handleUndoOrder}
                  title="Undo changes"
                >
                   <Undo size={14} />
                </button>
              </Tooltip>
            )}
            {hasPendingOrder && (
              <button
                className="btn-save-order"
                onClick={handleSaveOrder}
                title="Save current order"
              >
                 <Floppy size={16} />
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
                   onGoToDashboard={() => { setView('dashboard'); setSearchActive(false); setSelectedFolderId(null); }}
                    onGoToSettings={() => setView('settings')}
                    onGoToFolders={() => { setView('folders'); setSearchActive(false); }}
                   onOrderChange={handleOrderChange}
                   activeStatuses={activeStatuses}
                   onToggleAllFolders={handleToggleAllFolders}
                      showPasswordManager={showPasswordManager}
                      showMailManager={showMailManager}
                      showCharacterHub={showCharacterHub}
                      showFreedcamp={showFreedcamp}
                      showDashboard={showDashboard}
                      showDirectory={showDirectory}
                   onGoToCharacterHub={() => setView('character-hub')}
                   onGoToFreedcamp={() => {}}
                    onGoToPasswordManager={() => setView('password-manager')}
                    onGoToMailManager={() => setView('mail-manager')}
                   />
            </div>

            {/* Folders - kept mounted to avoid sidebar flicker */}
            <div style={{ display: view === 'folders' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
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
                   onGoToDashboard={() => { setView('dashboard'); setSearchActive(false); setSelectedFolderId(null); }}
                    onGoToSettings={() => setView('settings')}
                    onGoToFolders={() => { setView('folders'); setSearchActive(false); }}
                 activeStatuses={activeStatuses}
                 searchQuery={searchQuery}
                 showAddCard={!searchActive}
                 onToggleAllFolders={handleToggleAllFolders}
                    showPasswordManager={showPasswordManager}
                    showMailManager={showMailManager}
                    showCharacterHub={showCharacterHub}
                     showFreedcamp={showFreedcamp}
                     showDashboard={showDashboard}
                     showDirectory={showDirectory}
                     onGoToCharacterHub={() => setView('character-hub')}
                     onGoToFreedcamp={() => {}}
                     onGoToPasswordManager={() => setView('password-manager')}
                     onGoToMailManager={() => setView('mail-manager')}
                   />
            </div>

            {/* Settings - kept mounted to avoid sidebar flicker */}
            <div style={{ display: view === 'settings' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
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
                  onGoToCharacterHub={() => setView('character-hub')}
                  onGoToFreedcamp={() => {}}
                   onGoToPasswordManager={() => setView('password-manager')}
                   onGoToMailManager={() => setView('mail-manager')}
                   activeStatuses={activeStatuses}
                    onSettingsSaved={() => { loadSidebarSettings(); }}
                  onBackupSuccess={() => {
                    setIsBackingUp(false);
                    setBackupOperation(null);
                  }}
                  onBackupError={() => {
                    setIsBackingUp(false);
                    setBackupOperation(null);
                  }}
                  onBackupStart={(operation) => {
                    setIsBackingUp(true);
                    setBackupOperation(operation);
                  }}
                />
            </div>

            {/* Character Hub - kept mounted to avoid sidebar flicker */}
            <div style={{ display: view === 'character-hub' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
                <CharacterHub
                  folders={folders}
                  profiles={profiles}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={setSelectedFolderId}
                  expandedFolders={expandedFolders}
                  onToggleFolder={handleToggleFolder}
                  expandedOthers={expandedOthers}
                  onToggleOthers={handleToggleOthers}
                  onGoToDashboard={() => setView('dashboard')}
                   onGoToSettings={() => setView('settings')}
                   onGoToFolders={() => setView('folders')}
                   onGoToCharacterHub={() => setView('character-hub')}
                   activeStatuses={activeStatuses}
                   onProfilesChange={handleProfilesChange}
                   onFoldersChange={handleFoldersChange}
                     showPasswordManager={showPasswordManager}
                     showMailManager={showMailManager}
                     showCharacterHub={showCharacterHub}
                      showFreedcamp={showFreedcamp}
                      showDashboard={showDashboard}
                      showDirectory={showDirectory}
                      onToggleAllFolders={handleToggleAllFolders}
                      onGoToPasswordManager={() => setView('password-manager')}
                      onGoToMailManager={() => setView('mail-manager')}
                  />
            </div>

            {/* Password Manager - kept mounted to avoid sidebar flicker */}
            <div style={{ display: view === 'password-manager' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
                 <PasswordManagerView
                   isActive={view === 'password-manager'}
                   folders={folders}
                   profiles={profiles}
                   selectedFolderId={selectedFolderId}
                   onSelectFolder={setSelectedFolderId}
                   expandedFolders={expandedFolders}
                   onToggleFolder={handleToggleFolder}
                   expandedOthers={expandedOthers}
                   onToggleOthers={handleToggleOthers}
                   onGoToDashboard={() => setView('dashboard')}
                   onGoToSettings={() => setView('settings')}
                    onGoToFolders={() => setView('folders')}
                    onGoToCharacterHub={() => setView('character-hub')}
                     onGoToPasswordManager={() => setView('password-manager')}
                     onGoToMailManager={() => setView('mail-manager')}
                     activeStatuses={activeStatuses}
                     onFoldersChange={handleFoldersChange}
                     showPasswordManager={showPasswordManager}
                     showMailManager={showMailManager}
                     showCharacterHub={showCharacterHub}
                     showFreedcamp={showFreedcamp}
                     showDashboard={showDashboard}
                     showDirectory={showDirectory}
                     onToggleAllFolders={handleToggleAllFolders}
                   />
             </div>

             {/* Mail Manager - kept mounted to avoid sidebar flicker */}
             <div style={{ display: view === 'mail-manager' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
                  <MailManagerView
                    isActive={view === 'mail-manager'}
                    folders={folders}
                    profiles={profiles}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={setSelectedFolderId}
                    expandedFolders={expandedFolders}
                    onToggleFolder={handleToggleFolder}
                    expandedOthers={expandedOthers}
                    onToggleOthers={handleToggleOthers}
                    onGoToDashboard={() => setView('dashboard')}
                    onGoToSettings={() => setView('settings')}
                     onGoToFolders={() => setView('folders')}
                     onGoToCharacterHub={() => setView('character-hub')}
                     onGoToPasswordManager={() => setView('password-manager')}
                     onGoToMailManager={() => setView('mail-manager')}
                     activeStatuses={activeStatuses}
                     onFoldersChange={handleFoldersChange}
                     showPasswordManager={showPasswordManager}
                     showMailManager={showMailManager}
                     showCharacterHub={showCharacterHub}
                     showFreedcamp={showFreedcamp}
                     showDashboard={showDashboard}
                     showDirectory={showDirectory}
                     onToggleAllFolders={handleToggleAllFolders}
                   />
             </div>
           </>
         )}
       </main>
     </div>
   );
 }

export default App;
