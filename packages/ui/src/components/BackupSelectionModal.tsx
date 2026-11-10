/**
 * BackupSelectionModal - Selection dialog for backup export and partial import
 */

import React, { useMemo, useState } from 'react';
import { X } from 'reicon-react';
import type { BackupInspection, BrowserProfile, ProfileFolder } from '@xpm/core';
import { useModalClose } from '../hooks/useModalClose';
import './CreateProfileModal.css';
import './BackupSelectionModal.css';

export interface ExportSelectionOptions {
  includePasswords: boolean;
  includeMails: boolean;
  includeCharacterHub: boolean;
}

type BackupSelectionModalProps = {
  folders: ProfileFolder[];
  busy?: boolean;
  onCancel: () => void;
} & (
  | {
      mode: 'export';
      profiles: BrowserProfile[];
      onAccept: (profileIds: string[], options: ExportSelectionOptions) => void;
    }
  | {
      mode: 'import';
      inspection: BackupInspection;
      onAccept: (targetFolderId: string | null | undefined) => void;
    }
);

const ORIGINAL = 'original';
const UNGROUPED = 'ungrouped';

export default function BackupSelectionModal(props: BackupSelectionModalProps) {
  const { folders, busy = false, onCancel } = props;
  const modalRef = useModalClose({ onClose: onCancel, isOpen: !busy });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<ExportSelectionOptions>({
    includePasswords: true,
    includeMails: true,
    includeCharacterHub: true,
  });
  const [destination, setDestination] = useState<string>(ORIGINAL);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [folders]
  );
  const folderIds = useMemo(() => new Set(folders.map(f => f.id)), [folders]);

  const profiles = props.mode === 'export' ? props.profiles : [];

  const groups = useMemo(() => {
    const result = sortedFolders.map(folder => ({
      key: folder.id,
      name: folder.name,
      color: folder.color,
      profiles: profiles.filter(p => p.folderId === folder.id),
    }));
    const ungrouped = profiles.filter(p => !p.folderId || !folderIds.has(p.folderId));
    if (ungrouped.length > 0) {
      result.push({ key: 'ungrouped', name: 'Ungrouped', color: '', profiles: ungrouped });
    }
    return result;
  }, [sortedFolders, profiles, folderIds]);

  const toggleProfile = (profileId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };

  const toggleGroup = (groupProfiles: BrowserProfile[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      const allSelected = groupProfiles.every(p => next.has(p.id));
      for (const p of groupProfiles) {
        if (allSelected) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev => (prev.size === profiles.length ? new Set() : new Set(profiles.map(p => p.id))));
  };

  const toggleOption = (key: keyof ExportSelectionOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAccept = () => {
    if (props.mode === 'export') {
      props.onAccept(profiles.filter(p => selected.has(p.id)).map(p => p.id), options);
    } else if (destination === ORIGINAL) {
      props.onAccept(undefined);
    } else if (destination === UNGROUPED) {
      props.onAccept(null);
    } else {
      props.onAccept(destination);
    }
  };

  const isExport = props.mode === 'export';

  return (
    <div className="modal-overlay">
      <div className="modal-content backup-select-modal" ref={modalRef}>
        <div className="modal-header">
          <h2>{isExport ? 'Export Selection' : 'Import Profiles'}</h2>
          <button className="modal-close" onClick={onCancel} disabled={busy}><X size={14} /></button>
        </div>

        <div className="modal-body">
          {isExport ? (
            <>
              <div className="backup-select-toolbar">
                <span>{selected.size} of {profiles.length} selected</span>
                <button className="backup-select-link" onClick={toggleAll} disabled={profiles.length === 0}>
                  {selected.size === profiles.length && profiles.length > 0 ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {groups.length === 0 && <p className="backup-select-empty">No profiles to export.</p>}

              <div className="backup-select-list">
                {groups.map(group => {
                  const groupSelected = group.profiles.filter(p => selected.has(p.id)).length;
                  const allChecked = group.profiles.length > 0 && groupSelected === group.profiles.length;
                  const partial = groupSelected > 0 && !allChecked;
                  return (
                    <div className="backup-select-group" key={group.key}>
                      <label className="backup-select-group-header">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={(el) => { if (el) el.indeterminate = partial; }}
                          onChange={() => toggleGroup(group.profiles)}
                          disabled={group.profiles.length === 0}
                        />
                        {group.color && <span className="backup-select-dot" style={{ background: group.color }} />}
                        <strong>{group.name}</strong>
                        <span className="backup-select-count">{groupSelected}/{group.profiles.length}</span>
                      </label>
                      <div className="backup-select-profiles">
                        {group.profiles.map(profile => (
                          <label className="backup-select-item" key={profile.id}>
                            <input
                              type="checkbox"
                              checked={selected.has(profile.id)}
                              onChange={() => toggleProfile(profile.id)}
                            />
                            <span>{profile.name}</span>
                          </label>
                        ))}
                        {group.profiles.length === 0 && <small className="backup-select-empty">No profiles</small>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="backup-select-options">
                <strong>Also export</strong>
                <label className="backup-select-item">
                  <input type="checkbox" checked={options.includePasswords} onChange={() => toggleOption('includePasswords')} />
                  <span>Passwords linked to the selected profiles</span>
                </label>
                <label className="backup-select-item">
                  <input type="checkbox" checked={options.includeMails} onChange={() => toggleOption('includeMails')} />
                  <span>Mails linked to the selected profiles</span>
                </label>
                <label className="backup-select-item">
                  <input type="checkbox" checked={options.includeCharacterHub} onChange={() => toggleOption('includeCharacterHub')} />
                  <span>Character Hub data</span>
                </label>
              </div>
            </>
          ) : (
            <>
              <p>
                This backup contains <strong>{props.inspection.profiles.length}</strong> profile(s)
                {props.inspection.passwordCount > 0 && <>, {props.inspection.passwordCount} password(s)</>}
                {props.inspection.mailCount > 0 && <>, {props.inspection.mailCount} mail(s)</>}.
                Profiles that already exist will be skipped.
              </p>
              <p>Where do you want to import them?</p>

              <div className="backup-select-list">
                <div className="backup-select-group">
                  <label className="backup-select-item">
                    <input type="radio" name="import-destination" checked={destination === ORIGINAL} onChange={() => setDestination(ORIGINAL)} />
                    <span>Original folder (keep each profile's folder)</span>
                  </label>
                </div>
                <div className="backup-select-group">
                  <label className="backup-select-item">
                    <input type="radio" name="import-destination" checked={destination === UNGROUPED} onChange={() => setDestination(UNGROUPED)} />
                    <span>Ungrouped</span>
                  </label>
                </div>
                {sortedFolders.map(folder => (
                  <div className="backup-select-group" key={folder.id}>
                    <label className="backup-select-item">
                      <input type="radio" name="import-destination" checked={destination === folder.id} onChange={() => setDestination(folder.id)} />
                      <span className="backup-select-dot" style={{ background: folder.color }} />
                      <span>{folder.name}</span>
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleAccept}
            disabled={busy || (isExport && selected.size === 0)}
          >
            {busy ? (isExport ? 'Exporting...' : 'Importing...') : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
