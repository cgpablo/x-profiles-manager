# Getting Started - X Profiles Manager

Complete guide to install, run, and test X Profiles Manager on **macOS** and **Windows**.

---

## 📋 Quick Navigation

- [System Requirements](#-system-requirements)
- [Installation](#-installation)
- [Running in Development](#-running-in-development)
- [Basic Testing](#-basic-testing)
- [Building for Production](#-building-for-production)
- [Platform-Specific Guides](#-platform-specific-guides)
- [Troubleshooting](#-troubleshooting)

---

## ✅ System Requirements

### All Platforms

```bash
# Node.js 16+ and npm 8+
node --version    # Should be v16.0.0 or higher
npm --version     # Should be v8.0.0 or higher

# Git (for cloning the repo)
git --version
```

### Chrome/Chromium Browser

The app requires Chrome or Chromium to launch profiles. Verify installation:

#### macOS
```bash
# Check if Chrome is installed
test -d "/Applications/Google Chrome.app" && echo "Chrome found" || echo "Chrome NOT found"

# Alternative: use Chromium
test -d "/Applications/Chromium.app" && echo "Chromium found" || echo "Not found"
```

#### Windows
```powershell
# Open PowerShell and run:
Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe"
# Returns True if Chrome is installed

# Alternative locations:
Test-Path "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
```

#### Installation Links
- **Chrome**: https://www.google.com/chrome/
- **Chromium**: https://www.chromium.org/getting-involved/download-chromium/

---

## 📦 Installation

### Step 1: Clone or Navigate to Project

```bash
# If cloning:
git clone <repo-url>
cd x-profiles-manager

# If already in the project:
cd /Users/pablo.cruz/IOP/x-profiles-manager  # macOS example
```

### Step 2: Install Dependencies

```bash
npm install
```

**What this does:**
- Downloads Electron (cross-platform desktop framework)
- Installs React and TypeScript
- Installs Vite (build tool)
- Installs Squirrel (Windows installer support)
- Sets up all dependencies

**Estimated time:** 3-5 minutes (varies by internet speed)

**Expected output:**
```
added 411 packages in 2m
```

### Step 3: Verify Installation

```bash
# Check that build works
npm run type-check

# Should show: "No errors found"
```

---

## 🚀 Running in Development

### macOS

```bash
# Start development environment
npm run dev
```

**What happens:**
1. Vite dev server starts on `http://localhost:3000`
2. Waits for server to be ready
3. Electron app opens automatically
4. DevTools opens in the window (press `Cmd + Option + I` to focus)

**Expected result:**
- Electron window opens with "X Profiles Manager" title
- Dashboard tab shows empty grid (0 profiles)
- Settings tab is accessible
- "Chrome Path" field shows auto-detected path

### Windows

```powershell
# Start development environment
npm run dev
```

**What happens:**
1. Vite dev server starts on `http://localhost:3000`
2. Waits for server to be ready
3. Electron app opens automatically
4. DevTools opens in the window (press `Ctrl + Shift + I` to focus)

**Expected result:**
- Same as macOS

### Stopping Development Mode

```bash
# Press Ctrl+C in the terminal to stop
Ctrl+C
```

---

## 🧪 Basic Testing

### Test 1: Create Your First Profile

1. In the app window, click **"+ New Profile"**
2. Fill in the form:
   - **Name:** `Test Profile`
   - **X Account (optional):** Leave blank for now
   - **Color:** Click to select (e.g., blue)
   - **Icon:** Click to select (e.g., 🔗)
3. Click **"Create Profile"**

**Expected result:**
- Modal closes
- New card appears in the dashboard grid
- Card shows "Test Profile" with your chosen color and icon
- Status badge shows **"○ Offline"** (gray)

### Test 2: Launch Chrome with Profile

1. Click **"🚀 Launch"** button on the "Test Profile" card
2. Wait 3-5 seconds for Chrome to open
3. Chrome window should appear with `https://x.com` in the address bar

**Expected result:**
- Chrome opens in a separate window
- Status badge changes to **"● Online"** (green with pulsing animation)
- Button changes to **"✕ Close"**
- You're in a completely isolated Chrome profile

### Test 3: Profile Isolation

1. In the Chrome window opened from Test 2:
   - Log in to X (Twitter) with an account
   - Cookies and session data are stored in this profile only
   
2. Close the Chrome window manually (or click **"✕ Close"** in the app)

3. Create a second profile: **"Test Profile 2"**

4. Launch the second profile and verify:
   - You're logged out (no session from first profile)
   - This proves profiles are completely isolated

**Expected result:**
- Each profile has its own isolated Chrome session
- Logging into different X accounts in different profiles works independently

### Test 4: Multiple Simultaneous Profiles

1. Create a third profile: **"Test Profile 3"**
2. Launch all three profiles at the same time
   - Click Launch on each card quickly
   - Wait for Chrome windows to appear

**Expected result:**
- 3 Chrome windows open simultaneously
- Each with its own isolated profile
- All show **"● Online"** status
- You can use multiple X accounts at the same time

### Test 5: Settings Configuration

1. Click the **"Settings"** tab at the top
2. You should see:
   - **Chrome Path:** Auto-detected location (macOS: `/Applications/Google Chrome.app/...`, Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`)
   - **Profiles Directory:** Where profiles store their data
   - Other configuration options

3. Verify the Chrome Path is correct for your OS

**Expected result:**
- Chrome Path is auto-detected and shows a valid path
- If empty, manually enter the path to Chrome
- Settings persist after closing and reopening the app

---

## 📁 Data Storage Locations

### macOS
```
~/Library/Application Support/x-profiles-manager/
├── profiles.json              # List of all profiles
├── settings.json              # App settings
└── ../profiles/               # Chrome profile data
    ├── Test_Profile/          # Profile 1 data
    ├── Test_Profile_2/        # Profile 2 data
    └── Test_Profile_3/        # Profile 3 data
```

To view in Finder:
```bash
open ~/Library/Application\ Support/x-profiles-manager/
```

### Windows
```
%APPDATA%\x-profiles-manager\
├── profiles.json
├── settings.json
└── ..\profiles\
    ├── Test_Profile\
    ├── Test_Profile_2\
    └── Test_Profile_3\
```

To access in File Explorer:
```
Press: Win + R
Type: %APPDATA%\x-profiles-manager
Press: Enter
```

Or via PowerShell:
```powershell
explorer $env:APPDATA\x-profiles-manager
```

---

## 🏗️ Building for Production

### Create Installers

```bash
# Build production version and create installers
npm run dist
```

**Output:**
- **macOS:** Creates `.dmg` and `.zip` files in `dist/`
- **Windows:** Creates `.exe` and `.nsis` installer in `dist/`
- **Both:** Ready to distribute and install on other machines

**Time:** 2-3 minutes depending on your system

### macOS Distribution

After `npm run dist`, you'll find:
- `dist/X Profiles Manager-<version>.dmg` - Drag & drop installer
- `dist/X Profiles Manager-<version>-mac.zip` - Compressed app

**To distribute:**
1. Upload `.dmg` to your server
2. Users download and double-click to install
3. Drag app to Applications folder

### Windows Distribution

After `npm run dist`, you'll find:
- `dist/X Profiles Manager Setup <version>.exe` - Full installer
- `dist/X Profiles Manager <version>.exe` - Portable version

**To distribute:**
1. Upload `.exe` files to your server
2. Users download and run the installer
3. App installs to Program Files and creates Start Menu shortcuts

---

## 🔧 Platform-Specific Guides

### macOS-Specific

#### Auto-Detect Chrome Path

If Chrome is installed in the default location, the app auto-detects it:
```bash
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

#### Manual Chrome Path Configuration

If Chrome is installed elsewhere:
1. Go to Settings tab
2. Click "Browse" next to Chrome Path
3. Navigate to your Chrome installation
4. Select the Chrome executable
5. Click Save

#### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open DevTools | `Cmd + Option + I` |
| Reload | `Cmd + R` |
| Full Screen | `Cmd + Ctrl + F` |

#### Apple Silicon (M1/M2/M3) Support

The app has full native support for Apple Silicon Macs. Build targets ARM64 architecture automatically.

#### Troubleshooting macOS-Specific Issues

**"Chrome not found" error:**
```bash
# Verify Chrome is installed
test -d "/Applications/Google Chrome.app" && echo "Found" || echo "Not found"

# Try reinstalling Chrome
# Download from https://www.google.com/chrome/
```

**App won't start:**
```bash
# Check system logs
log stream --predicate 'process == "X Profiles Manager"' | head -50

# Or try rebuilding
npm run build
```

### Windows-Specific

#### Auto-Detect Chrome Path

The app checks both 32-bit and 64-bit Program Files:
```powershell
C:\Program Files\Google\Chrome\Application\chrome.exe
# or
C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
```

#### Manual Chrome Path Configuration

If Chrome is installed elsewhere:
1. Go to Settings tab
2. Click "Browse" next to Chrome Path
3. Navigate to `chrome.exe`
4. Click Save

#### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open DevTools | `Ctrl + Shift + I` |
| Reload | `Ctrl + R` |
| Full Screen | `F11` |

#### Admin Rights

The app does NOT require admin rights to run.

However, if you get permission errors:
1. Right-click the installer (during first install)
2. Select "Run as Administrator"
3. Complete installation
4. App will work normally after that

#### Uninstalling

To uninstall:
1. Open Control Panel → Programs and Features
2. Find "X Profiles Manager"
3. Click "Uninstall"
4. Follow the uninstaller wizard

Or remove data manually:
```powershell
# Remove installed app
Remove-Item "$env:ProgramFiles\X Profiles Manager" -Recurse

# Remove saved data (optional)
Remove-Item "$env:APPDATA\x-profiles-manager" -Recurse
```

#### Troubleshooting Windows-Specific Issues

**"Chrome not found" error:**
```powershell
# Check if Chrome is installed
Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe"
Test-Path "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

# If both return False, reinstall Chrome from:
# https://www.google.com/chrome/
```

**Port 3000 already in use (during development):**
```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with the number from above)
taskkill /PID <PID> /F

# Then try npm run dev again
```

**Squirrel Installer Errors:**
```powershell
# Clear installer cache and try again
Remove-Item "$env:TEMP\*squirrel*" -Recurse -Force -ErrorAction SilentlyContinue
```

---

## 📚 Development Scripts Reference

```bash
# Development
npm run dev                 # Start dev environment (both React + Electron)
npm run react-dev          # Start only Vite dev server (port 3000)
npm run electron-dev       # Start only Electron (waits for React dev server)

# Building
npm run build              # Build both React and Electron for production
npm run build:react        # Build only React bundle
npm run build:electron     # Build only Electron main process
npm run dist               # Build + create platform installers

# Quality checks
npm run type-check         # Check TypeScript for errors
```

---

## 🐛 Troubleshooting

### General Issues

#### "npm install" fails

**Solution:**
```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Or use npm ci for reproducible install
npm ci
```

#### "Cannot find module" errors

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install

# Rebuild native modules
npm rebuild
```

#### DevTools shows errors

**Solution:**
1. Open DevTools: `Cmd/Ctrl + Shift + I`
2. Go to Console tab
3. Note the exact error message
4. Check [LIMITATIONS.md](LIMITATIONS.md)

### Chrome-Related Issues

#### Chrome Won't Launch

**Verify Chrome is installed:**

**macOS:**
```bash
# Check default location
test -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" && echo "✓ Found" || echo "✗ Not found"

# Or use Spotlight
open -a "Google Chrome"
```

**Windows:**
```powershell
# Check default location
Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe"

# Open Chrome manually
& "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

**Solution:**
1. Ensure Chrome is installed (download from https://www.google.com/chrome/)
2. Go to Settings tab in the app
3. Verify Chrome Path is correct
4. If empty, click Browse and select chrome.exe (Windows) or Chrome executable (macOS)

#### "Chrome path not configured" Error

**Solution:**
1. Click Settings tab
2. Under "Chrome Path", verify a path is shown
3. If empty:
   - **macOS:** Should auto-detect to `/Applications/Google Chrome.app/...`
   - **Windows:** Should auto-detect to `C:\Program Files\Google\Chrome\...`
4. If still empty, manually select Chrome:
   - Click "Browse" or the path field
   - Navigate to Chrome executable
   - Click Save

#### Chrome Profile Data Not Persisting

**This is actually expected** - verify profiles are being created:

```bash
# macOS
ls -la ~/Library/Application\ Support/x-profiles-manager/

# Windows PowerShell
Get-ChildItem "$env:APPDATA\x-profiles-manager"
```

You should see `profiles.json` and a `profiles/` folder.

### Port and Network Issues

#### Port 3000 Already in Use

This happens if another app uses port 3000 (usually Node.js or another dev server).

**Solution:**

**macOS/Linux:**
```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port (modify vite.config.ts)
```

**Windows (PowerShell):**
```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID)
taskkill /PID <PID> /F

# Or use a different port (modify vite.config.ts)
```

### Data and Cleanup

#### Reset App to Fresh State

**WARNING:** This deletes all profiles and settings!

```bash
# macOS
rm -rf ~/Library/Application\ Support/x-profiles-manager/

# Windows PowerShell
Remove-Item -Path "$env:APPDATA\x-profiles-manager" -Recurse -Force

# Then restart the app
npm run dev
```

#### Delete a Specific Profile

Use the app's UI: On the profile card, click the "Delete" button (or use Settings → Delete Profile).

This removes:
- Profile from the list
- Chrome data directory
- Settings associated with that profile

---

## 🎓 Project Structure

```
x-profiles-manager/
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.ts           # App window creation & lifecycle
│   │   ├── storage.ts         # Save/load profiles (JSON)
│   │   ├── launcher.ts        # Launch Chrome with profiles
│   │   ├── ipc.ts             # IPC communication handlers
│   │   └── preload.ts         # Security bridge
│   │
│   ├── renderer/               # React frontend
│   │   ├── main.tsx           # React entry point
│   │   ├── App.tsx            # Main app component
│   │   ├── index.css          # Global styles
│   │   └── components/
│   │       ├── Dashboard.tsx   # Profile grid view
│   │       ├── ProfileTab.tsx  # Profile card component
│   │       ├── CreateProfileModal.tsx
│   │       └── Settings.tsx    # Configuration page
│   │
│   └── types/
│       └── index.ts           # TypeScript interfaces
│
├── dist/                       # Build outputs (generated)
│   ├── main/                  # Compiled Electron
│   └── renderer/              # Compiled React
│
├── package.json               # Dependencies & build config
├── tsconfig.json              # TypeScript config
├── vite.config.ts             # Vite build config
└── index.html                 # HTML entry point
```

---

## 🔍 Debugging Tips

### Enable Verbose Logging

During development, all console logs are visible in DevTools:

```bash
# Open DevTools
macOS: Cmd + Option + I
Windows: Ctrl + Shift + I

# Go to Console tab
# All app logs, errors, and IPC messages appear here
```

### View Chrome Profile Data

See what's actually being saved in each profile:

**macOS:**
```bash
open ~/Library/Application\ Support/x-profiles-manager/profiles/Test_Profile/
```

**Windows:**
```powershell
explorer "$env:APPDATA\x-profiles-manager\profiles\Test_Profile"
```

This shows Chrome's actual data (cookies, cache, etc.).

### Test IPC Communication

In DevTools Console:
```javascript
// Test if IPC is working
window.electronAPI.getAllProfiles().then(profiles => {
  console.log('Profiles:', profiles);
});
```

---

## ✅ Setup Verification Checklist

Complete this checklist after setup:

- [ ] Node.js version is 16+: `node --version`
- [ ] Chrome is installed and locatable
- [ ] `npm install` completed without errors
- [ ] `npm run dev` opens the Electron window
- [ ] Dashboard tab loads without errors
- [ ] Settings tab shows Chrome Path
- [ ] Can create a new profile
- [ ] Can launch Chrome from a profile
- [ ] Chrome opens at https://x.com
- [ ] Profile card shows "● Online" status
- [ ] Can close a profile
- [ ] Can create multiple profiles
- [ ] Can launch multiple profiles simultaneously
- [ ] Each profile has isolated Chrome session

If all items are checked ✅, you're ready to use X Profiles Manager!

---

## 🚀 Next Steps

### For Users
- Read **[README.md](README.md)** - Complete user guide with all features
- Read **[LIMITATIONS.md](LIMITATIONS.md)** - Known limitations

### For Developers
- Check source code in `src/` directory

### To Build and Distribute
```bash
# Create production installers
npm run dist

# Installers are in ./dist/
# - macOS: .dmg and .zip files
# - Windows: .exe installers
```

---

## 📞 Getting Help

If you encounter issues:

1. **Check DevTools** (`Cmd/Ctrl + Shift + I`)
   - Console tab for error messages
   - Look for red error text

2. **Review this guide** - Most issues are covered in [Troubleshooting](#-troubleshooting)

3. **Check other docs:**
   - [LIMITATIONS.md](LIMITATIONS.md) - Known limitations
   - [README.md](README.md) - Feature documentation

4. **Clean and reinstall:**
   ```bash
   rm -rf node_modules package-lock.json dist
   npm install
   npm run dev
   ```

5. **Report issues** - Visit https://github.com/anomalyco/opencode

---

## 🎉 You're All Set!

Welcome to **X Profiles Manager**! You now have:
- ✅ Complete installation
- ✅ Development environment ready
- ✅ Ability to create and manage multiple Chrome profiles
- ✅ Production build capability

**Happy profiling!** 🚀

---

**Last Updated:** June 2, 2026  
**Tested On:** macOS 14.5 (arm64) and Windows 11/10  
**Node.js Requirement:** 16+  
**Chrome/Chromium:** Any recent version
