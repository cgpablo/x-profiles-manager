/**
 * ProfilesPanel Component - Panel principal mostrando perfiles
 */

import React from 'react';
import { ChromeProfile, ProfileFolder } from '../../types';
import ProfileTab from './ProfileTab';
import EmptyProfileCard from './EmptyProfileCard';
import './ProfilesPanel.css';

interface ProfilesPanelProps {
  profiles: ChromeProfile[];
  folders: ProfileFolder[];
  selectedFolderId: string | null | 'ungrouped';
  expandedFolders: Set<string>;
  expandedOthers?: boolean;
  activeProfileId: string | null;
  activeStatuses: Map<string, boolean>;
  onLaunchProfile: (profileId: string) => void;
  onCloseProfile: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onEditProfile: (profile: ChromeProfile) => void;
  onCreateProfile: (folderId?: string | undefined) => void;
  onMoveProfileToFolder?: (profileId: string, folderId: string | undefined) => void;
  onSelectProfile?: (profile: ChromeProfile) => void;
  headerActions?: React.ReactNode;
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
  headerActions,
}: ProfilesPanelProps) {
  // Group profiles by folder
  const profilesByFolder = new Map<string | undefined, ChromeProfile[]>();
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
    if (selectedFolderId === 'ungrouped') {
      return unfolderredProfiles;
    }
    if (selectedFolderId && selectedFolderId !== 'ungrouped') {
      return profilesByFolder.get(selectedFolderId) || [];
    }
    // Show all expanded folders + ungrouped (if expandedOthers is true)
    const allProfiles: ChromeProfile[] = [];
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
  const title = selectedFolderId === 'ungrouped'
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
        {/* When viewing a specific folder or OTHERS */}
        {selectedFolderId && (
          <>
            {/* Profiles Grid for specific folder */}
            {profilesToDisplay.length === 0 ? (
              <div className="empty-state">
                <h3>No profiles</h3>
                <p>
                  {selectedFolderId === 'ungrouped'
                    ? 'Create a profile to get started'
                    : 'This folder has no profiles yet'}
                </p>
                <EmptyProfileCard 
                  onCreateProfile={() => {
                    const folderIdToCreate = selectedFolderId && selectedFolderId !== 'ungrouped' ? selectedFolderId : undefined;
                    onCreateProfile(folderIdToCreate);
                  }}
                />
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
                     isSelected={activeProfileId === profile.id}
                     folders={folders}
                      onMoveToFolder={onMoveProfileToFolder ? (folderId) => onMoveProfileToFolder(profile.id, folderId) : undefined}
                        onSelect={onSelectProfile ? () => onSelectProfile(profile) : undefined}
                      />
                ))}
                <EmptyProfileCard 
                  onCreateProfile={() => {
                    const folderIdToCreate = selectedFolderId && selectedFolderId !== 'ungrouped' ? selectedFolderId : undefined;
                    onCreateProfile(folderIdToCreate);
                  }}
                />
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
                <div className="folder-section-header" style={{ backgroundColor: '#6b7280' }}>
                  <span className="folder-icon">📌</span>
                  <span className="folder-name">OTHERS</span>
                  <span className="profile-count">({unfolderredProfiles.length})</span>
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
                      isSelected={activeProfileId === profile.id}
                      folders={folders}
                      onMoveToFolder={onMoveProfileToFolder ? (folderId) => onMoveProfileToFolder(profile.id, folderId) : undefined}
                      onSelect={onSelectProfile ? () => onSelectProfile(profile) : undefined}
                    />
                  ))}
                  <EmptyProfileCard 
                    onCreateProfile={() => {
                      onCreateProfile(undefined);
                    }}
                  />
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
                  <div className="folder-section-header" style={{ backgroundColor: folder.color }}>
                    <span className="folder-icon">{folder.icon}</span>
                    <span className="folder-name">{folder.name}</span>
                    <span className="profile-count">({folderProfiles.length})</span>
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
                        isSelected={activeProfileId === profile.id}
                        folders={folders}
                        onMoveToFolder={onMoveProfileToFolder ? (folderId) => onMoveProfileToFolder(profile.id, folderId) : undefined}
                        onSelect={onSelectProfile ? () => onSelectProfile(profile) : undefined}
                      />
                    ))}
                    <EmptyProfileCard 
                      onCreateProfile={() => {
                        onCreateProfile(folder.id);
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Empty state when no folders are expanded */}
            {!expandedOthers && !Array.from(expandedFolders).some(id => profilesByFolder.get(id)?.length ?? 0 > 0) && (
              <div className="empty-state">
                <h3>No profiles</h3>
                <p>Expand folders or create a profile to get started</p>
                <EmptyProfileCard 
                  onCreateProfile={() => {
                    onCreateProfile(undefined);
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
