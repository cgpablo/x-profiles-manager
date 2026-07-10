/**
 * ProfilesPanel Component - Panel principal mostrando perfiles
 */

import React from 'react';
import { BrowserProfile, ProfileFolder } from '../../types';
import ProfileTab from './ProfileTab';
import EmptyProfileCard from './EmptyProfileCard';
import './ProfilesPanel.css';

interface ProfilesPanelProps {
  profiles: BrowserProfile[];
  folders: ProfileFolder[];
  selectedFolderId: string | null | 'ungrouped' | '__online__' | '__search__';
  expandedFolders: Set<string>;
  expandedOthers?: boolean;
  activeProfileId: string | null;
  activeStatuses: Map<string, boolean>;
  onLaunchProfile: (profileId: string) => void;
  onCloseProfile: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onEditProfile: (profile: BrowserProfile) => void;
  onCreateProfile: (folderId?: string | undefined) => void;
  onMoveProfileToFolder?: (profileId: string, folderId: string | undefined) => void;
  onSelectProfile?: (profile: BrowserProfile) => void;
  onToggleStar?: (profileId: string) => void;
  onToggleLock?: (profileId: string) => void;
  headerActions?: React.ReactNode;
  searchQuery?: string;
  showAddCard?: boolean;
  showDirectory?: boolean;
}

export default function ProfilesPanel({
  profiles,
  folders,
  selectedFolderId,
  expandedFolders,
  expandedOthers = true,
  activeProfileId,
  activeStatuses,
  onLaunchProfile,
  onCloseProfile,
  onDeleteProfile,
  onEditProfile,
  onCreateProfile,
  onMoveProfileToFolder,
  onSelectProfile,
  onToggleStar,
  onToggleLock,
  headerActions,
  searchQuery = '',
  showAddCard = true,
  showDirectory = false,
}: ProfilesPanelProps) {
  // Group profiles by folder
  const profilesByFolder = new Map<string | undefined, BrowserProfile[]>();
  for (const profile of profiles) {
    const folderId = profile.folderId;
    if (!profilesByFolder.has(folderId)) {
      profilesByFolder.set(folderId, []);
    }
    profilesByFolder.get(folderId)!.push(profile);
  }

  const unfolderredProfiles = profilesByFolder.get(undefined) || [];
  const folderObjects = new Map(folders.map(f => [f.id, f]));

  // Get profiles to display based on selection
  const getProfilesToDisplay = () => {
    if (selectedFolderId === '__online__') {
      return profiles.filter(p => activeStatuses.get(p.id) === true);
    }
    if (selectedFolderId === '__starred__') {
      return profiles.filter(p => p.starred === true);
    }
    if (selectedFolderId === '__search__') {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return [];
      return profiles.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.xAccount && p.xAccount.toLowerCase().includes(q))
      );
    }
    if (selectedFolderId === 'ungrouped') {
      return unfolderredProfiles;
    }
    if (selectedFolderId && selectedFolderId !== 'ungrouped') {
      return profilesByFolder.get(selectedFolderId) || [];
    }
    // Show all expanded folders + ungrouped (if expandedOthers is true)
    const allProfiles: BrowserProfile[] = [];
    if (expandedOthers) {
      allProfiles.push(...unfolderredProfiles);
    }
    for (const folder of folders) {
      if (expandedFolders.has(folder.id)) {
        allProfiles.push(...(profilesByFolder.get(folder.id) || []));
      }
    }
    return allProfiles;
  };

  const profilesToDisplay = getProfilesToDisplay();
  const title = selectedFolderId === '__online__'
    ? 'Active Profiles'
    : selectedFolderId === '__search__'
    ? 'Search'
    : selectedFolderId === 'ungrouped'
    ? 'OTHERS'
    : selectedFolderId && folderObjects.has(selectedFolderId)
    ? folderObjects.get(selectedFolderId)!.name
    : 'All Profiles';

  return (
    <div className="profiles-panel">
      {headerActions && (
        <div className="panel-header">
          {headerActions}
        </div>
      )}
      {/* Scrollable Content */}
      <div className="panels-content">
        {/* When viewing a specific folder, OTHERS, or __online__ */}
        {selectedFolderId && (
          <>
            {/* Profiles Grid for specific folder */}
            {profilesToDisplay.length === 0 ? (
              <div className="empty-state">
                <h3>No profiles</h3>
                <p>
                  {selectedFolderId === '__online__'
                    ? 'No active profiles at the moment'
                    : selectedFolderId === '__starred__'
                    ? 'No favorite profiles yet'
                    : selectedFolderId === '__search__'
                    ? 'No profiles match your search'
                    : selectedFolderId === 'ungrouped'
                    ? 'Create a profile to get started'
                    : 'This folder has no profiles yet'}
                </p>
                 {showAddCard && selectedFolderId !== '__online__' && selectedFolderId !== '__search__' && selectedFolderId !== '__starred__' && (
                   <EmptyProfileCard 
                     onCreateProfile={() => {
                       const folderIdToCreate = selectedFolderId && selectedFolderId !== 'ungrouped' ? selectedFolderId : undefined;
                       onCreateProfile(folderIdToCreate);
                     }}
                   />
                 )}
              </div>
            ) : (
              <div className="profiles-grid">
                {profilesToDisplay.map((profile) => (
                  <ProfileTab
                    key={profile.id}
                     profile={profile}
                     isActive={activeStatuses.get(profile.id) || false}
                     onLaunch={() => onLaunchProfile(profile.id)}
                     onClose={() => onCloseProfile(profile.id)}
                     onDelete={() => onDeleteProfile(profile.id)}
                     onEdit={() => onEditProfile(profile)}
                      onToggleStar={onToggleStar ? () => onToggleStar(profile.id) : undefined}
                      onToggleLock={onToggleLock ? () => onToggleLock(profile.id) : undefined}
                     isSelected={activeProfileId === profile.id}
                     folders={folders}
                       onMoveToFolder={onMoveProfileToFolder ? (folderId) => onMoveProfileToFolder(profile.id, folderId) : undefined}
                         onSelect={onSelectProfile ? () => onSelectProfile(profile) : undefined}
                         showDirectory={showDirectory}
                       />
                 ))}
                 {showAddCard && selectedFolderId !== '__online__' && selectedFolderId !== '__search__' && selectedFolderId !== '__starred__' && (
                  <EmptyProfileCard 
                    onCreateProfile={() => {
                      const folderIdToCreate = selectedFolderId && selectedFolderId !== 'ungrouped' ? selectedFolderId : undefined;
                      onCreateProfile(folderIdToCreate);
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* When viewing "All" - show folder sections + OTHERS section */}
        {!selectedFolderId && (
          <>
            {/* OTHERS section */}
            {expandedOthers && unfolderredProfiles.length > 0 && (
              <div className="folder-section">
                <div className="folder-section-header">
                  <span className="folder-icon">📌</span>
                  <span className="folder-name">OTHERS</span>
                   <span className="profile-count">{unfolderredProfiles.length}</span>
                  <div className="folder-section-color-strip" style={{ backgroundColor: '#6b7280' }} />
                </div>
                <div className="profiles-grid">
                   {unfolderredProfiles.map((profile) => (
                     <ProfileTab
                       key={profile.id}
                       profile={profile}
                       isActive={activeStatuses.get(profile.id) || false}
                       onLaunch={() => onLaunchProfile(profile.id)}
                       onClose={() => onCloseProfile(profile.id)}
                       onDelete={() => onDeleteProfile(profile.id)}
                       onEdit={() => onEditProfile(profile)}
                        onToggleStar={onToggleStar ? () => onToggleStar(profile.id) : undefined}
                        onToggleLock={onToggleLock ? () => onToggleLock(profile.id) : undefined}
                       isSelected={activeProfileId === profile.id}
                       folders={folders}
                       onMoveToFolder={onMoveProfileToFolder ? (folderId) => onMoveProfileToFolder(profile.id, folderId) : undefined}
                       onSelect={onSelectProfile ? () => onSelectProfile(profile) : undefined}
                       showDirectory={showDirectory}
                      />
                   ))}
                   {showAddCard && (
                     <EmptyProfileCard 
                       onCreateProfile={() => {
                         onCreateProfile(undefined);
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Folder sections */}
            {folders.map((folder) => {
              const folderProfiles = profilesByFolder.get(folder.id) || [];
              if (!expandedFolders.has(folder.id)) {
                return null;
              }

              return (
                <div key={folder.id} className="folder-section">
                  <div className="folder-section-header">
                    <span className="folder-icon">{folder.icon}</span>
                    <span className="folder-name">{folder.name}</span>
                     <span className="profile-count">{folderProfiles.length}</span>
                    <div className="folder-section-color-strip" style={{ backgroundColor: folder.color }} />
                  </div>
                  <div className="profiles-grid">
                     {folderProfiles.map((profile) => (
                       <ProfileTab
                         key={profile.id}
                         profile={profile}
                         isActive={activeStatuses.get(profile.id) || false}
                         onLaunch={() => onLaunchProfile(profile.id)}
                         onClose={() => onCloseProfile(profile.id)}
                         onDelete={() => onDeleteProfile(profile.id)}
                         onEdit={() => onEditProfile(profile)}
                          onToggleStar={onToggleStar ? () => onToggleStar(profile.id) : undefined}
                          onToggleLock={onToggleLock ? () => onToggleLock(profile.id) : undefined}
                         isSelected={activeProfileId === profile.id}
                         folders={folders}
                         onMoveToFolder={onMoveProfileToFolder ? (folderId) => onMoveProfileToFolder(profile.id, folderId) : undefined}
                         onSelect={onSelectProfile ? () => onSelectProfile(profile) : undefined}
                         showDirectory={showDirectory}
                       />
                     ))}
                     {showAddCard && (
                       <EmptyProfileCard 
                         onCreateProfile={() => {
                           onCreateProfile(folder.id);
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty state when no folders are expanded */}
            {!expandedOthers && !Array.from(expandedFolders).some(id => profilesByFolder.get(id)?.length ?? 0 > 0) && (
              <div className="empty-state">
                <h3>No profiles</h3>
                <p>Expand folders or create a profile to get started</p>
                {showAddCard && (
                  <EmptyProfileCard 
                    onCreateProfile={() => {
                      onCreateProfile(undefined);
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
