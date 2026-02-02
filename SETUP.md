# Quick Setup Guide

## Step 1: Create Icons

You need to create three icon files. Here are quick options:

### ⚡ EASIEST: Use the HTML Generator (Recommended)
1. **Double-click `create-icons-simple.html`** to open it in your browser
2. Icons will auto-generate
3. Click each download link (icon16.png, icon48.png, icon128.png)
4. **Save them in the `icons` folder** in your extension directory
5. Done! ✅

### Option B: Use PowerShell Script (Windows)
1. **Right-click `create-icons.bat`** → Run
2. Or open PowerShell and run: `.\create-icons.ps1`
3. Icons will be created automatically in the `icons` folder

### Option C: Use Online Generator
1. Go to https://www.favicon-generator.org/ or similar
2. Upload or create a simple icon
3. Download 16x16, 48x48, and 128x128 versions
4. Save as `icon16.png`, `icon48.png`, `icon128.png` in the `icons/` folder

### Option D: Create Manually
You can create simple colored squares using any image editor:
- Create a 16x16 pixel image with a solid color (e.g., purple #667eea)
- Save as `icon16.png`
- Repeat for 48x48 and 128x128 sizes

## Step 2: Load Extension in Chrome

1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the `Friender` folder (the one containing `manifest.json`)
6. The extension should appear in your extensions list

## Step 3: Test Basic Functionality

1. Navigate to https://www.facebook.com
2. Log in manually (extension doesn't store credentials)
3. Click the extension icon in Chrome toolbar
4. You should see the popup dashboard
5. Try changing some settings and clicking "Save Settings"
6. Check the "Logs" tab to see activity

## Step 4: Test Friend Request Automation

1. Navigate to a Facebook profile page (not your own)
2. Open the extension popup
3. Go to "Settings" tab
4. Enable "Friend Request Automation"
5. Set low limits for testing (e.g., 5 per day, 2 per session)
6. Set delays (3-5 seconds)
7. Click "Save Settings"
8. Click "Start" in the popup
9. Watch the logs to see if it detects the "Add Friend" button

## Troubleshooting

### Extension Not Loading
- Check that all files are in the correct folders
- Verify `manifest.json` is valid JSON
- Check Chrome's extension error page for details

### Icons Not Showing
- Verify icon files exist in `icons/` folder
- Check file names match exactly: `icon16.png`, `icon48.png`, `icon128.png`
- Ensure files are valid PNG images

### Automation Not Working
- Check browser console (F12) for errors
- Verify you're on a Facebook profile page
- Check if Facebook changed their DOM (see README.md for selector updates)
- Ensure settings are saved (check "Settings" tab)

### Selectors Need Updating
If "Add Friend" button is not detected:
1. Open Developer Tools (F12)
2. Inspect the "Add Friend" button
3. Note its attributes (aria-label, data-testid, class, etc.)
4. Update `content/facebook-handler.js` selectors array
5. Reload extension and test again

## Next Steps

- Read the full README.md for detailed documentation
- Start with conservative settings (low limits, longer delays)
- Monitor logs regularly
- Test thoroughly before scaling up

