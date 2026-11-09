import { ProfileFolder } from './types';
import { CoreDeps } from './ports';
import { ProfileService } from './profileService';

export class FolderService {
  constructor(private deps: CoreDeps, private profiles: ProfileService) {}

  getAll(): ProfileFolder[] {
    try {
      const folders = this.deps.documents.read<ProfileFolder[]>('folders');
      if (folders === undefined) return [];
      return folders.sort((a, b) => a.order - b.order);
    } catch (error) {
      console.error('Error reading folders:', error);
      return [];
    }
  }

  get(folderId: string): ProfileFolder | null {
    return this.getAll().find((f) => f.id === folderId) || null;
  }

  create(name: string, color: string, icon: string): ProfileFolder {
    const folders = this.getAll();
    const folder: ProfileFolder = {
      id: this.deps.newId(),
      name,
      color,
      icon,
      createdAt: this.deps.now(),
      order: folders.length,
    };
    folders.push(folder);
    this.saveAll(folders);
    return folder;
  }

  update(folderId: string, updates: Partial<ProfileFolder>): ProfileFolder {
    const folders = this.getAll();
    const index = folders.findIndex((f) => f.id === folderId);
    if (index === -1) {
      throw new Error(`Folder ${folderId} not found`);
    }

    folders[index] = { ...folders[index], ...updates };
    this.saveAll(folders);
    return folders[index];
  }

  delete(folderId: string): boolean {
    const folders = this.getAll();
    const filtered = folders.filter((f) => f.id !== folderId);

    if (filtered.length === folders.length) return false;

    // Also remove folderId from any profiles
    const updated = this.profiles.getAll().map((p) =>
      p.folderId === folderId ? { ...p, folderId: undefined } : p
    );
    this.profiles.saveAll(updated);

    // Reorder remaining folders
    filtered.forEach((f, index) => {
      f.order = index;
    });
    this.saveAll(filtered);
    return true;
  }

  saveAll(folders: ProfileFolder[]): void {
    this.deps.documents.write('folders', folders);
  }
}
