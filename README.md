# X Profiles Manager

**Manage multiple isolated Chrome profiles for simultaneous X (Twitter) accounts.**

Run multiple X accounts at the same time without logging out or mixing sessions. Each profile is completely isolated with its own Chrome instance, cookies, and cache.

---

## 🎯 What It Does

**Problem:** You have multiple X accounts and want to use them simultaneously.

**Solution:** X Profiles Manager creates isolated Chrome profiles, allowing you to:
- Open 5+ Chrome windows simultaneously
- Each with a different X account logged in
- No logout, no session mixing
- Centralized control panel to manage them all

**How:** Uses native Chrome `--user-data-dir` flag for true isolation (not extensions).

---

## ⚡ Quick Start

### Installation & Development

```bash
# Clone repository
git clone <repo-url>
cd x-profiles-manager

# Install dependencies
npm install

# Start development environment
npm run dev
```

The app will open in development mode. You can now:
1. Create profiles with custom names and colors
2. Assign profiles to folders for organization
3. Launch Chrome with isolated sessions
4. Manage all profiles from the dashboard

### Packaged Releases

Download pre-built versions:
- **Windows:** `X Profiles Manager 0.1.0.exe` - Portable executable (no installation needed)
- **macOS:** `X Profiles Manager-0.1.0-arm64-mac.zip` - Universal App for M1/M2/M3

---

## 📋 System Requirements

### All Platforms
- **Node.js 16+** (LTS version recommended)
- **npm 8+** (included with Node.js)
- **Chrome or Chromium** - https://www.google.com/chrome/
- **Git** (for cloning) - https://git-scm.com

### Platform-Specific

#### macOS
- **10.15+** (Catalina or newer)
- **Intel or Apple Silicon** (both supported)
- Chrome at: `/Applications/Google Chrome.app`

#### Windows
- **Windows 10 or newer** (including Windows 11)
- Chrome at: `C:\Program Files\Google\Chrome\Application\chrome.exe` or `Program Files (x86)`

#### Linux
- **Ubuntu 18.04+**, **Fedora**, or equivalent
- Chrome at: `/usr/bin/google-chrome`

---

## 🚀 Features

### Dashboard
- **Visual Profile Grid:** See all profiles at a glance with custom colors and avatars
- **Drag & Drop Reordering:** Organize profiles by dragging them into preferred order
- **Folder Organization:** Group related profiles into customizable folders
- **Undo & Save:** Undo accidental reordering or save changes permanently
- **One-Click Launch:** Launch any profile with a single click

### Profile Management
- **Create & Edit:** Add new profiles with custom names and colors
- **Profile Pictures:** Assign custom images to profiles for quick identification
- **Move to Folder:** Organize profiles with right-click context menu
- **Bulk Operations:** Close all profiles at once with a single button

### Sidebar Navigation
- **Folder View:** Browse all folders and profiles in hierarchical tree
- **Profile Status:** See which profiles are currently active/running
- **Quick Actions:** Create new profiles or folders from the sidebar
- **Expandable Folders:** Collapse/expand folders to manage space

### Settings
- **Profile Configuration:** Edit profile names, colors, and properties
- **Folder Management:** Rename or delete folders
- **Visual Customization:** Dark theme interface optimized for productivity

---

## 🛠️ Development

### Available Scripts

Run them from the repository root (it is an npm workspaces monorepo):

```bash
npm install             # Install everything and link the workspaces
npm run dev             # Build core + Electron main, then start Vite and Electron with hot reload
npm run build           # Build everything: core, UI and Electron main process
npm run build:core      # Build @xpm/core only
npm run build:ui        # Build the React UI only (outputs to apps/desktop/dist/renderer)
npm run build:desktop   # Build the Electron main process only
npm run type-check      # Type-check core, UI and desktop
npm run dist            # Build and package for distribution (output in apps/desktop/release)
npm run dist -- --mac   # Package for macOS only (extra args go to electron-builder)
npm run dist -- --win   # Package for Windows only
npm run bump            # Bump the app version
npm run build:mobile    # Build core + the Android web app (apps/mobile/www)
npm run mobile:sync     # Build and sync it into the Android project
```

Android (work in progress, see `docs/android-migration.md`): after `npm run mobile:sync`, build with
`cd apps/mobile/android && ./gradlew assembleDebug` and install with `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

### Project Structure

```
x-profiles-manager/
├── packages/
│   ├── core/                # @xpm/core: platform-independent logic (no Node, no Electron)
│   │   └── src/
│   │       ├── types/       # Shared types and the PlatformAPI contract
│   │       ├── ports.ts     # Interfaces each platform implements
│   │       ├── backend.ts   # Orchestration (login, PIN, backups...)
│   │       └── *Service.ts  # Profiles, folders, settings, passwords, mails, backup
│   └── ui/                  # @xpm/ui: React UI (same for every platform)
│       ├── index.html
│       ├── vite.config.ts
│       └── src/             # App.tsx, components/, hooks/
├── apps/
│   ├── mobile/              # Capacitor app for Android (adapters in src/platform, native project in android/)
│   └── desktop/             # Electron app (macOS + Windows)
│       ├── src/main/        # Main process: ipc, launcher, preload, adapters/
│       ├── assets/          # App icons
│       ├── dist/            # Build output (generated)
│       └── release/         # Installers (generated)
├── docs/                    # Design docs (see android-migration.md)
├── package.json             # Workspaces root
└── tsconfig.base.json
```

### Key Technologies

- **Electron 27:** Desktop app framework
- **React 18:** UI framework
- **TypeScript:** Type-safe development
- **Vite:** Fast build tool
- **SQLite:** Local data persistence
- **electron-builder:** Packaging tool

---

## 📝 Usage

### Creating a Profile

1. Click **"New Profile"** in Dashboard or Sidebar
2. Enter profile name (required)
3. Choose a color for quick identification (optional)
4. Select a folder to organize it (optional)
5. Click **"Create"** to save

### Organizing Profiles

- **Drag & Drop:** In Dashboard, drag profiles to reorder or move between folders
- **Folders:** Create folders from Settings to group related profiles
- **Right-Click:** Access context menu for move/edit/delete options

### Launching Chrome

1. Click profile card or **"Launch"** button
2. Chrome opens with the isolated profile
3. Log in to your X account as usual
4. Each profile maintains separate sessions

### Bulk Operations

- **Close All:** Click ✕ button in header to close all active profiles
- **Undo Changes:** Click ↶ button to undo reordering (auto-discards on view change)
- **Save Order:** Click 💾 button to save profile organization

---

## 🐛 Known Limitations

- **Chrome-only:** Works with Chrome/Chromium, not Firefox or Edge
- **Mac Silicon:** Some features require M1/M2/M3 compatibility
- **Profile Limit:** Tested with 10+ profiles; performance may degrade with 20+
- **Data Directory:** Each profile uses ~100-500MB of disk space

---

## 📚 Additional Documentation

- **[DEVELOPMENT_SUMMARY.md](DEVELOPMENT_SUMMARY.md)** - Detailed development notes
- **[LIMITATIONS.md](LIMITATIONS.md)** - Technical limitations and analysis
- **[GETTING_STARTED.md](GETTING_STARTED.md)** - In-depth setup guide

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

---

## 🎨 UI/UX Features

### Dashboard Layout
- Two-column layout: Folders on left, Profiles on right
- Profile cards with custom colors and avatars
- Smooth drag & drop interactions
- Real-time status indicators

### Sidebar Navigation
- Auto-expanding folders when profiles are added
- Manual collapse/expand control
- Visual indicators for active profiles
- Context menus for quick actions

### Settings Interface
- Clean form-based profile editing
- Dark theme optimized for extended use
- Responsive design for various screen sizes
- Keyboard navigation support

---

**For questions or issues, please check LIMITATIONS.md or create an issue in the repository.**
