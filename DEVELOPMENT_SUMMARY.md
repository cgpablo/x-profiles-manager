# X Profiles Manager - Development Summary

## Latest Updates (v0.1.0)

### UI/UX Improvements

#### 1. Dashboard Enhancements
- **Drag & Drop Reordering:** Profiles and folders can be dragged to reorder within the dashboard
- **Undo Functionality:** Reordering changes can be undone with a dedicated button (↶)
- **Save Changes:** Changes are persisted to the database with a save button (💾)
- **Auto-Undo on View Change:** If you reorder and switch views without saving, changes are automatically discarded
- **Close All Button:** Close all active profiles at once from the header (✕)
- **Folder Organization:** Profiles can be organized into customizable folders
- **Auto-Expand Folders:** Folders with profiles auto-expand; manual collapse state is preserved

#### 2. Sidebar Improvements
- **Hierarchical View:** Folders and profiles organized in expandable tree structure
- **Context Menus:** Right-click menus for quick actions (move, edit, delete)
- **Bulk Operations:** "Open All in Browser" and "Close All" options for folder contents
- **Conditional Menu Items:** Menu items only show when applicable (e.g., "Close All" only when profiles are active)
- **Folder Management:** Create, edit, and delete folders from the sidebar
- **Profile Creation:** Quick profile creation directly from sidebar with folder pre-selection

#### 3. Settings Interface
- **Profile Configuration:** Edit profile names, colors, and properties
- **Folder Management:** Manage folder organization from Settings
- **Dark Theme:** Consistent dark UI optimized for productivity

### Architecture & Features

#### Profile Management
- **Isolated Chrome Profiles:** Each profile uses Chrome's `--user-data-dir` for complete session isolation
- **Custom Names & Colors:** Profiles can be customized with names and colors for quick identification
- **Profile Images:** Support for custom profile pictures (converted to data URLs)
- **Folder Assignment:** Profiles can be organized into custom folders
- **Ordering:** Drag & drop to reorder profiles and folders; changes persist in database

#### Database Layer
- **SQLite Backend:** All data persisted locally
- **Tables:**
  - `profiles` - Profile data (id, name, color, imagePath, folderId, orderIndex, isActive)
  - `folders` - Folder data (id, name, color, icon, order)
- **No Network:** All data stays on device; completely offline-compatible

#### Chrome Launching
- **Process Detection:** Accurate detection on Windows, macOS, and Linux
- **User Data Dir:** Each profile gets isolated Chrome session
- **Focus Management:** When launching profiles, focus can be controlled
- **Close Operations:** Individual profiles or all profiles can be closed

### UI Components

#### Main Components
- **Dashboard.tsx:** Main dashboard with two-column layout (folders + profiles)
- **Sidebar.tsx:** Main sidebar wrapper with navigation
- **SidebarFolders.tsx:** Folder tree view with context menus
- **Settings.tsx:** Settings and profile configuration
- **Folders.tsx:** Detailed folder view with profile management

#### Shared Components
- **ProfileTab.tsx:** Individual profile card with drag support
- **Tooltip.tsx:** Hover tooltips with fixed positioning
- **CreateProfileModal.tsx:** Modal for creating new profiles
- **EditProfileModal.tsx:** Modal for editing profile properties
- **CreateFolderModal.tsx:** Modal for creating folders
- **EditFolderModal.tsx:** Modal for editing folders

### Recent Bug Fixes

1. **Profile Images Not Showing:** Implemented data URL conversion from file paths
2. **Dashboard Not Refreshing:** Added detection of folder assignment changes
3. **Profile Images Not Updating:** Changed key from `profile.id` to `${profile.id}-${profile.imagePath}`
4. **Close All Button Issues:** Added defensive validation for folderId
5. **Context Menu Visibility:** Moved context menus to use Portal for proper z-index layering
6. **Multiple Context Menus:** Added logic to close folder menus when opening profile menus
7. **Tooltip Cutoff:** Changed from position absolute to fixed with high z-index
8. **Sidebar Horizontal Scroll:** Added overflow-x hidden
9. **Chrome Focus Management:** On macOS, added focus return to Electron app after Chrome launch
10. **Profile Card Auto-Focus:** Removed auto-focus on click; added separate eye icon button for focus
11. **Folder Auto-Collapse:** Added ref tracking to prevent auto-expanding after manual collapse

### Technical Stack

- **Frontend:** React 18, TypeScript, Vite
- **Desktop:** Electron 27
- **Database:** SQLite3
- **Styling:** CSS with CSS variables for theming
- **State Management:** React hooks (useState, useRef, useMemo, useEffect)
- **IPC:** Electron IPC for main/renderer communication
- **Chrome Automation:** Process spawning and management

### Key Files

- **src/main/index.ts** - Electron main process entry
- **src/main/launcher.ts** - Chrome launching and process management
- **src/main/db.ts** - SQLite database initialization and queries
- **src/renderer/App.tsx** - Main React app component with state management
- **src/renderer/components/Dashboard.tsx** - Dashboard view with drag & drop
- **src/renderer/components/SidebarFolders.tsx** - Folder tree with context menus
- **src/renderer/hooks/useElectronAPI.ts** - Electron API wrapper

### Distribution

- **Windows:** Portable EXE (769.1 MB) - No installation required
- **macOS:** ZIP with app bundle (342.2 MB) - Universal for M1/M2/M3

### Known Limitations

- **Chrome-only:** Requires Chrome or Chromium browser
- **Profile Size:** Each profile uses 100-500 MB of disk space
- **Performance:** Tested with 10+ profiles; performance may degrade with 20+
- **macOS Code Signing:** Unsigned builds may show security warnings on first launch
- **Windows:** Portable exe for simplicity; NSIS installer not currently built

---

## Development Workflow

### Building for Development
```bash
npm run dev              # Start with hot reload
npm run build           # Production build
npm run dist -- --mac   # Package for macOS
npm run dist -- --win   # Package for Windows
```

### Project Structure
```
src/
├── main/                # Electron main process
│   ├── index.ts        # App initialization
│   ├── launcher.ts     # Chrome process management
│   ├── db.ts           # Database layer
│   ├── ipc.ts          # IPC handlers
│   └── preload.ts      # Preload script
└── renderer/           # React UI
    ├── App.tsx         # Main component
    ├── components/     # UI components
    └── hooks/          # Custom hooks
```

### Code Standards

- **TypeScript:** All code is typed
- **React Hooks:** Modern functional components
- **CSS Variables:** For consistent theming
- **Component Props:** Fully typed interfaces
- **Error Handling:** Try-catch in async operations
- **Comments:** Complex logic is commented

---

## Future Enhancements

- Cloud sync option
- Browser automation for auto-login
- Profile templates
- Advanced profile search/filtering
- Keyboard shortcuts
- Theme customization
- Multi-monitor support
- Profile backups and export

---

**Last Updated:** June 2026  
**Version:** 0.1.0
