/**
 * ProfileTab Component - Individual profile card
 */

import React, { useState, useRef, useEffect } from 'react';
import { getPlatformAPI } from '../platform';
import type { BrowserProfile } from '@xpm/core';
import { usePlatformAPI } from '../hooks/usePlatformAPI';
import Tooltip from './Tooltip';
import CharacterInfoModal from './CharacterInfoModal';
import { Star, Lock, LockOpen, Check, Key, Envelope, Globe, Eye, X, Pen, Trash, Gear, Pin, FolderConnect, Bookmarks, Login, ChatRound } from 'reicon-react';
import './ProfileTab.css';

interface ProfileTabProps {
  profile: BrowserProfile;
  isActive: boolean;
  isSelected: boolean;
  onLaunch: () => void;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggleStar?: () => void;
  onToggleLock?: () => void;
  onMoveToFolder?: (folderId: string | undefined) => void;
  folders?: Array<{ id: string; name: string; icon: string }>;
  onSelect?: () => void;
  onCloseContextMenus?: () => void;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  disableContextMenu?: boolean;
  showDirectory?: boolean;
}

export default function ProfileTab({
  profile,
  isActive,
  isSelected,
  onLaunch,
  onClose,
  onDelete,
  onEdit,
  onToggleStar,
  onToggleLock,
  onMoveToFolder,
  folders = [],
  onSelect,
  onCloseContextMenus,
  isDragging = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  disableContextMenu = false,
  showDirectory = false,
}: ProfileTabProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [copiedXAccount, setCopiedXAccount] = useState(false);
  // Auto-login button: once clicked, stay hidden for 20 days regardless of anything else.
  // Once the 20 days elapse (or if it was never clicked to begin with), the window's current
  // URL is checked — /home, /notifications, /i/history, /i/chat — before the button is
  // allowed to reappear: if it's on any of those it stays hidden; otherwise it shows.
  // The button must NEVER show before that check has actually run once the browser opens.
  const AUTO_LOGIN_COOLDOWN_MS = 20 * 24 * 60 * 60 * 1000;
  const cooldownActive = !!profile.autoLoginClickedAt && (Date.now() - profile.autoLoginClickedAt) < AUTO_LOGIN_COOLDOWN_MS;
  const [onHomePage, setOnHomePage] = useState(false);
  const [homeCheckDone, setHomeCheckDone] = useState(false);
  // Optimistic instant-hide right after clicking, before the persisted cooldown timestamp
  // has round-tripped back into the `profile` prop.
  const [justClickedLogin, setJustClickedLogin] = useState(false);

  // One-shot check once the profile's browser becomes active (after it's had time to
  // settle). Skipped entirely while the 20-day auto-login cooldown is active — the button
  // stays hidden regardless, so there's no need to check. Otherwise (never clicked before,
  // or the cooldown just lapsed), the check always runs before the button may show.
  useEffect(() => {
    if (!isActive) {
      // Browser closed: reset so a fresh check is required the next time it opens.
      setOnHomePage(false);
      setHomeCheckDone(false);
      return;
    }
    if (!profile.xAccount || cooldownActive) {
      return;
    }
    setHomeCheckDone(false);
    const timer = setTimeout(async () => {
      try {
        const result = await getPlatformAPI().launcher.isOnHomeUrl(profile.id);
        setOnHomePage(result);
      } catch {
        setOnHomePage(false);
      } finally {
        setHomeCheckDone(true);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [isActive, profile.id, profile.xAccount, cooldownActive]);

  // Once the persisted cooldown has actually kicked in, the optimistic flag is no longer needed.
  useEffect(() => {
    if (cooldownActive) setJustClickedLogin(false);
  }, [cooldownActive]);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedMail, setCopiedMail] = useState(false);
  const [pinFilling, setPinFilling] = useState(false);
  const [pinFilled, setPinFilled] = useState(false);
  const [pinFillFailed, setPinFillFailed] = useState(false);
  const [showCharInfoModal, setShowCharInfoModal] = useState(false);
  // locked: true when profile.locked is undefined (default) or true; false only when explicitly set to false
  const isLocked = profile.locked !== false;
  const [imageUrl, setImageUrl] = useState<string>('');
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const platformAPI = usePlatformAPI();

  // Derived: whether this profile has character hub info
  const hasFcInfo =
    (profile.fcInfo?.ig?.length ?? 0) > 0 ||
    (profile.fcInfo?.x?.length ?? 0) > 0 ||
    (profile.fcInfo?.sc?.length ?? 0) > 0;

  // Convert file path to data URL on mount or when imagePath changes
  useEffect(() => {
    if (profile.imagePath) {
      (async () => {
        try {
          const dataUrl = await getPlatformAPI().dialog.fileToDataUrl(profile.imagePath!);
          setImageUrl(dataUrl);
        } catch (error) {
          console.error('Error converting image to data URL:', error);
          // Fallback to file:// if conversion fails
          setImageUrl(`file://${profile.imagePath}`);
        }
      })();
    } else {
      setImageUrl('');
    }
  }, [profile.imagePath, profile.id]);

  // Close context menu on Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showContextMenu]);

  // Close context menu if mouse leaves the menu area
  useEffect(() => {
    const handleMouseLeave = () => {
      if (showContextMenu && contextMenuRef.current) {
        contextMenuRef.current.addEventListener('mouseleave', () => {
          setShowContextMenu(false);
        });
      }
    };

    if (showContextMenu) {
      handleMouseLeave();
    }
  }, [showContextMenu]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && cardRef.current) {
        const clickedOutsideMenu = !contextMenuRef.current.contains(e.target as Node);
        const clickedOutsideCard = !cardRef.current.contains(e.target as Node);
        
        // Close if clicked outside both the card and menu
        if (clickedOutsideMenu && clickedOutsideCard) {
          setShowContextMenu(false);
        }
      }
    };

    if (showContextMenu) {
      // Use capturing phase to ensure it fires
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  }, [showContextMenu]);

  const handleCopyXAccount = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile.xAccount) return;
    navigator.clipboard.writeText(profile.xAccount).then(() => {
      setCopiedXAccount(true);
      setTimeout(() => setCopiedXAccount(false), 500);
    }).catch(console.error);
  };

  const handleCopyPassword = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const pw = await getPlatformAPI().passwords.getDecryptedForProfile(profile.id);
      if (!pw) return;
      await navigator.clipboard.writeText(pw);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 500);
    } catch (err) {
      console.error('Error copying password:', err);
    }
  };

  const handleCopyMail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile.mailEmail) return;
    navigator.clipboard.writeText(profile.mailEmail).then(() => {
      setCopiedMail(true);
      setTimeout(() => setCopiedMail(false), 500);
    }).catch(console.error);
  };

  const handleFillPin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pinFilling) return;
    setPinFilling(true);
    try {
      const filled = await getPlatformAPI().launcher.fillPinRecovery(profile.id);
      if (filled) {
        setPinFilled(true);
        setTimeout(() => setPinFilled(false), 800);
      } else {
        // Clicked, but the browser wasn't on /i/chat/pin/recovery (or no PIN linked) —
        // give visible feedback instead of silently doing nothing.
        setPinFillFailed(true);
        setTimeout(() => setPinFillFailed(false), 800);
      }
    } catch (err) {
      console.error('Error filling PIN:', err);
      setPinFillFailed(true);
      setTimeout(() => setPinFillFailed(false), 800);
    } finally {
      setPinFilling(false);
    }
  };

   return (
      <div
        className={`profile-tab ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
        style={
          {
            '--profile-color': profile.color,
            cursor: isActive ? 'pointer' : 'default',
          } as React.CSSProperties
        }
        ref={cardRef}
        draggable={!!onDragStart}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onClick={() => {
          // No automatic action on card click; use buttons instead
        }}
       onContextMenu={(e) => {
          if (disableContextMenu) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          
          // Calculate position with viewport boundaries
          let x = e.clientX;
          let y = e.clientY;
          
          // Reserve space for menu (approximate width: 180px, height: 220px)
          const menuWidth = 180;
          const menuHeight = 220;
          const padding = 10;
          
          // Adjust x if menu would go off-screen to the right
          if (x + menuWidth + padding > window.innerWidth) {
            x = window.innerWidth - menuWidth - padding;
          }
          
          // Open menu UPWARDS from the click point (bottom of menu at click point)
          y = e.clientY - menuHeight;
          
          // If menu would go off-screen to the top, open downwards instead
          if (y < padding) {
            y = e.clientY;
          }
          
          setContextMenuPos({ x, y });
          setShowContextMenu(true);
        }}
     >
       {/* Left section: Profile icon and info + buttons */}
       <div className="profile-content">
            <div className="profile-icon-badge">
              {imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt={profile.name} 
                  className="profile-image"
                />
              ) : (
                <div className="profile-icon-placeholder">{profile.name.charAt(0).toUpperCase()}</div>
              )}
              {isActive && <div className="active-indicator" />}
            </div>

            <div className="profile-header">
              <div className="profile-info">
                <div className="profile-name-row">
                  <h3>{profile.name}</h3>
                  <button
                    className={`btn-star${profile.starred ? ' starred' : ''}${isLocked ? ' locked-star' : ''}`}
                    onClick={(e) => { e.stopPropagation(); if (!isLocked) onToggleStar?.(); }}
                    disabled={isLocked}
                    title={isLocked ? 'Unlock profile to manage favorites' : (profile.starred ? 'Remove from starred' : 'Add to starred')}
                    aria-label={isLocked ? 'Unlock profile to manage favorites' : (profile.starred ? 'Unstar profile' : 'Star profile')}
                  >
                    {profile.starred ? <Star size={14} weight="Filled" /> : <Star size={14} weight="Outline" />}
                  </button>
                  <button
                    className={`btn-lock${isLocked ? ' locked' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggleLock?.(); }}
                    title={isLocked ? 'Unlock profile (allow edit/delete)' : 'Lock profile (hide edit/delete)'}
                    aria-label={isLocked ? 'Unlock profile' : 'Lock profile'}
                  >
                    {isLocked ? <Lock size={14} weight="Filled" /> : <LockOpen size={14} />}
                  </button>
                </div>
                <div className="profile-account-row">
                  {profile.xAccount ? (
                    <p
                      className="profile-account"
                      onClick={handleCopyXAccount}
                      title="Click to copy @handle"
                    >
                      <span className={`profile-account-handle${copiedXAccount ? ' handle-copied' : ''}`}>
                        {copiedXAccount ? <><Check size={10} /> Copied!</> : `@${profile.xAccount}`}
                      </span>
                    </p>
                  ) : (
                    <p className="profile-account profile-account-empty">
                      —
                    </p>
                  )}
                  {profile.hasPassword && (
                    <button
                      className={`btn-profile-key${copiedPassword ? ' key-copied' : ''}`}
                      onClick={handleCopyPassword}
                      title="Copy password"
                      aria-label="Copy password"
                    >
                      {copiedPassword ? <Check size={10} /> : <Key size={12} />}
                    </button>
                  )}
                  {isActive && (
                    <button
                      className={`btn-profile-pin${pinFilled ? ' pin-filled' : ''}${pinFillFailed ? ' pin-fill-failed' : ''}`}
                      onClick={handleFillPin}
                      disabled={pinFilling}
                      title={
                        pinFillFailed
                          ? 'Could not open chat'
                          : profile.pinPasswordId
                            ? 'Open chat and fill PIN if asked'
                            : 'Open chat (/i/chat)'
                      }
                      aria-label="Open chat"
                    >
                      {pinFilled ? <Check size={10} /> : pinFillFailed ? <X size={10} /> : <ChatRound size={11} />}
                    </button>
                  )}
                  {profile.hasMail && (
                    <button
                      className={`btn-profile-mail${copiedMail ? ' mail-copied' : ''}`}
                      onClick={handleCopyMail}
                      title={profile.mailEmail ? `Copy email: ${profile.mailEmail}` : 'Copy email'}
                      aria-label="Copy email"
                    >
                      {copiedMail ? <Check size={10} /> : <Envelope size={11} />}
                    </button>
                  )}
                </div>
                <span className={`status-badge ${isActive ? 'online' : 'offline'}`}>
                  {isActive ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* Action buttons */}
              <div className="profile-actions">
                {/* Row 1: Auto-login/Open/Focus/Close buttons */}
                <div className="action-row">
                  {isActive && profile.xAccount && profile.hasPassword && homeCheckDone && !justClickedLogin && !cooldownActive && !onHomePage && (
                    <Tooltip text="Auto-login X" position="top">
                      <button
                        className="action-btn login-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Optimistic instant-hide; the persisted 20-day cooldown (written
                          // right below) is what actually keeps it hidden going forward.
                          setJustClickedLogin(true);
                          getPlatformAPI().launcher.autoLogin(profile.id);
                          getPlatformAPI().profiles.update(profile.id, { autoLoginClickedAt: Date.now() }).catch(() => {});
                        }}
                      >
                        <Login size={14} weight="Outline" />
                      </button>
                    </Tooltip>
                  )}
                  {!isActive ? (
                    <Tooltip text="Open in browser" position="top">
                      <button className="action-btn launch-btn" onClick={() => {
                        onCloseContextMenus?.();
                        onLaunch();
                      }}>
                         <Globe size={14} />
                      </button>
                    </Tooltip>
                  ) : (
                    <Tooltip text="Focus window" position="top">
                      <button 
                        className="action-btn focus-btn" 
                        onClick={async () => {
                          onCloseContextMenus?.();
                          try {
                            await getPlatformAPI().launcher.focusWindow(profile.id);
                          } catch (error) {
                            console.error('Error focusing window:', error);
                          }
                        }}
                      >
                         <Eye size={14} />
                      </button>
                    </Tooltip>
                  )}

                  {isActive && (
                    <Tooltip text="Close browser" position="top">
                      <button className="action-btn close-btn" onClick={() => {
                        onCloseContextMenus?.();
                        onClose();
                      }}>
                         <X size={14} />
                       </button>
                     </Tooltip>
                   )}
                 </div>

                 {/* Row 2: Edit, Delete and Directory buttons (hidden when locked) */}
                {!isLocked && (
                <div className="action-row">
                  <Tooltip text="Edit profile" position="top">
                    <button
                      className="action-btn edit-btn"
                      onClick={() => {
                        onCloseContextMenus?.();
                        onEdit();
                      }}
                    >
                       <Pen size={14} />
                     </button>
                   </Tooltip>
                   <Tooltip text="Delete profile" position="top">
                    <button
                      className="action-btn delete-btn"
                      onClick={() => {
                        onCloseContextMenus?.();
                        onDelete();
                      }}
                    >
                       <Trash size={14} />
                     </button>
                   </Tooltip>
                   {showDirectory && (
                    <Tooltip text="Open profile folder" position="top">
                      <button
                        className="action-btn dir-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          getPlatformAPI().shell.openPath(profile.dataDir).catch(console.error);
                        }}
                      >
                         <Gear size={14} />
                       </button>
                    </Tooltip>
                  )}
                </div>
                )}

                {/* Row 3: Directory + Character Hub buttons */}
                {(hasFcInfo || profile.directoryPath) && (
                  <div className="action-row">
                    {profile.directoryPath && (
                      <Tooltip text="Open directory" position="top">
                        <button
                          className="action-btn dir-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            getPlatformAPI().shell.openPath(profile.directoryPath!);
                          }}
                        >
                          <FolderConnect size={14} weight="Outline" />
                        </button>
                      </Tooltip>
                    )}
                    {hasFcInfo && (
                      <Tooltip text="Character info" position="top">
                        <button
                          className="action-btn char-hub-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCharInfoModal(true);
                          }}
                        >
                          <Bookmarks size={14} weight="Outline" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
            </div>
       </div>

      {/* Context Menu */}
      {!disableContextMenu && showContextMenu && (
        <div
          className="profile-context-menu"
          ref={contextMenuRef}
          style={{
            left: `${contextMenuPos.x}px`,
            top: `${contextMenuPos.y}px`,
          }}
        >
          {onMoveToFolder && folders.length > 0 && (
            <>
              <div className="context-menu-section">Move to Folder</div>
              <button
                className="context-menu-item"
                onClick={() => {
                  onMoveToFolder(undefined);
                  setShowContextMenu(false);
                }}
               >
               <Pin size={12} /> OTHERS
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  className="context-menu-item"
                  onClick={() => {
                    onMoveToFolder(folder.id);
                    setShowContextMenu(false);
                  }}
                >
                  <span>{folder.icon}</span> {folder.name}
                </button>
              ))}
              <div className="context-menu-divider" />
            </>
          )}
           <button
             className="context-menu-item"
             onClick={() => {
               if (isActive) {
                 onClose();
               } else {
                 onLaunch();
               }
              setShowContextMenu(false);
              }}
            >
               {isActive ? <><X size={12} /> Close browser</> : <><Globe size={12} /> Open in browser</>}
            </button>
            <button
              className="context-menu-item"
              onClick={() => {
                getPlatformAPI().launcher.openChat(profile.id).catch((err) => console.error('Error opening chat:', err));
                onCloseContextMenus?.();
                setShowContextMenu(false);
              }}
            >
              <><ChatRound size={12} /> Chat</>
            </button>
            {profile.directoryPath && (
              <button
                className="context-menu-item"
                onClick={() => {
                  getPlatformAPI().shell.openPath(profile.directoryPath!);
                  setShowContextMenu(false);
                }}
              >
                <><FolderConnect size={12} weight="Outline" /> Open directory</>
              </button>
            )}
            {hasFcInfo && (
              <button
                className="context-menu-item"
                onClick={() => {
                  setShowCharInfoModal(true);
                  setShowContextMenu(false);
                }}
              >
                 <><Bookmarks size={12} weight="Outline" /> Character info</>
              </button>
            )}
            {!isLocked && (
            <button
              className="context-menu-item"
              onClick={() => {
                onEdit();
                setShowContextMenu(false);
              }}
            >
              <><Pen size={12} /> Edit</>
            </button>
            )}
           {!isLocked && (
           <button
             className="context-menu-item context-menu-delete"
             onClick={() => {
               onDelete();
               setShowContextMenu(false);
             }}
           >
             <><Trash size={12} /> Delete</>
           </button>
           )}
        </div>
      )}

      {/* Character Info Modal */}
      {showCharInfoModal && (
        <CharacterInfoModal
          profile={profile}
          onClose={() => setShowCharInfoModal(false)}
        />
      )}
    </div>
  );
}
