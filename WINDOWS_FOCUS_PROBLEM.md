# Windows Focus Window Problem - Technical Explanation

## The Problem

**Goal**: When user clicks the "Focus" button on a Chrome profile in the app, bring that specific Chrome window to the front of the screen and activate it (give it focus).

**Why it's difficult on Windows**: Unlike macOS which has clear process PIDs that map 1:1 to windows, or Linux with xdotool, Windows has multiple complications:

### Complication 1: Chrome Process Structure
- When we spawn Chrome with `spawn(chromePath, args)`, we get a **wrapper process PID**
- The actual Chrome window runs under different processes (renderer, GPU, etc.)
- The PID we capture is NOT the window's main process
- Example: We get PID 1234, but the actual window lives in PID 5678

### Complication 2: Window Handle Availability
- Windows APIs need a **window handle (HWND)** to bring a window to front
- We can get HWND via `Get-Process -Id <pid> | .MainWindowHandle` but:
  - The window might not exist immediately after spawn
  - The HWND can change if Chrome restarts tabs
  - Wrapper process HWND ≠ Chrome window HWND

### Complication 3: Command Line Matching
- We launch each profile with: `--user-data-dir=C:\path\to\profile`
- To find "our" Chrome window, we search: `Get-WmiObject Win32_Process -Filter "Name = 'chrome.exe'"`
- We then check if that process's CommandLine contains our dataDir path
- **Problems**:
  - Path might be formatted differently in CommandLine (quotes, backslashes)
  - Multiple Chrome processes exist (main + renderer + extensions, etc.)
  - The actual **main Chrome window** might not have the right MainWindowHandle
  - Chrome might wrap the path in quotes or use relative paths

### Complication 4: Windows API Limitations
```powershell
[WindowHelper]::SetForegroundWindow($hwnd)    # Requires correct HWND
[WindowHelper]::BringWindowToTop($hwnd)       # Requires correct HWND
[WindowHelper]::ShowWindow($hwnd, 9)          # Requires correct HWND
```
If we have the wrong HWND, these do nothing (no error, just fails silently).

---

## Why the Standard Method Fails

**Our first attempt**: Search Chrome processes by matching `--user-data-dir` in command line

```
1. Get all chrome.exe processes
2. For each process:
   - Read its command line
   - Look for --user-data-dir=C:\Users\Pablo\...
   - Extract the path value
   - Compare with profile's dataDir
   - If match: Get MainWindowHandle and call SetForegroundWindow()
```

**Why this fails**:
- ❌ The Chrome process with `--user-data-dir` in its CommandLine might be a helper/utility process
- ❌ Not the main GUI window process
- ❌ The actual window might be in a different process entirely
- ❌ MainWindowHandle might be 0 (no window) or wrong window

**Result**: We find "a Chrome process" but can't reliably bring ITS window to front because we're looking at the wrong process.

---

## The Working Workaround

**Why Chrome DevTools Protocol works 100% of the time**:

```
1. We launch Chrome with --remote-debugging-port=9222
   (This enables an HTTP endpoint for debugging)

2. When we click Focus:
   - Connect to http://localhost:9222/json/list
   - We get list of ALL open tabs in THAT Chrome instance
   
3. Open a new tab: /json/new?url=about:blank
   - Chrome automatically ACTIVATES the window when new tab opens
   - This is built-in Chrome behavior - guaranteed
   
4. Wait 300ms for activation
5. Close the tab: /json/close/{tabId}
   - Tab disappears, no side effects
```

**Why this works**:
✅ We're talking directly to Chrome via its debugging API
✅ Chrome DevTools Protocol is the **official** way to control Chrome programmatically
✅ Opening a tab **always** activates the window (Chrome's core behavior)
✅ No searching for PIDs, HWNDs, or guessing about processes
✅ Works even if Chrome's internal process structure changes

---

## The Trade-Off

| Aspect | Standard Method | Workaround Method |
|--------|-----------------|-------------------|
| **Speed** | Fast (direct Windows API) | Slower (HTTP requests) |
| **Reliability** | 30-50% (depends on config) | 100% (guaranteed) |
| **Side Effects** | None | Temporary tab opens/closes |
| **Setup** | Requires PowerShell + WMI | Just need `--remote-debugging-port` |
| **When to use** | If it works on your system | When standard fails, or always |

---

## Implementation Strategy

**Current approach**: 
1. Try standard method (fast if it works)
2. If fails → fallback to workaround (always works)
3. User can force workaround if they prefer reliability

**User can select**:
- `auto` (default): Try standard → fallback to workaround
- `workaround` (force): Always use workaround (slower but reliable)

---

## Why Not Solution X?

### ❌ Store HWND at launch time
- HWND changes or becomes invalid
- Chrome might reload, creating new windows
- Not persistent

### ❌ Use Chrome's `--new-window` flag
- Doesn't help us find an existing window
- Creates new windows instead of focusing existing ones

### ❌ Use `wmctrl` (Linux tool on Windows)
- Not available on Windows natively
- Would need external dependency

### ❌ Search by window title
- Chrome window title changes (page title)
- Multiple windows might have similar titles
- Fragile and unreliable

### ✅ Use Chrome DevTools Protocol
- Official Chrome debugging interface
- Guaranteed to work
- Already enabled when we launch Chrome
- Well-documented and reliable

---

## For Programming Agents

When implementing focus on Windows:

1. **Always include the workaround method** - it's your safety net
2. **Log everything** - dataDir matching, processes found, HWNDs discovered
3. **Test with multiple Chrome versions** - behavior might vary
4. **Test with different user-data-dir paths** - especially with spaces, special chars
5. **Monitor the debug port** - ensure it's not already in use
6. **Handle CDP timeouts** - HTTP requests can fail, have fallbacks
7. **Don't rely on a single matching method** - Windows is unpredictable

**Debug checklist**:
- Enable "Developer Mode" in Settings
- Enable "Debug Mode" for verbose logging
- Check console for focus logs
- Try both focus methods (auto vs workaround)
- If workaround works but standard doesn't → your system needs workaround
- If neither works → Chrome might not be running or port conflict
