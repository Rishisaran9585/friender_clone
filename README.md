# Friender - Facebook Automation Chrome Extension

A production-ready Chrome Extension (Manifest V3) for automating Facebook friend requests and messaging with comprehensive safety controls, rate limiting, and scheduling features.

## ⚠️ Important Disclaimer

**This extension is for educational purposes. Automation may violate Facebook's Terms of Service. Use at your own risk. The developers are not responsible for any account restrictions or bans.**

## Features

### ✅ Friend Request Automation
- Automatically detect and send friend requests on profile pages
- Configurable daily and session limits
- Random delays between actions (human-like behavior)
- Queue-based execution (one action at a time)
- Auto-stop on failures or errors

### ✅ Message Automation
- Send messages after friend requests
- Send messages when friend requests are accepted
- Multiple message templates with random selection
- Simulated human typing (character-by-character)
- Daily and session message limits

### ✅ Dashboard & Controls
- Real-time status indicator (Running/Paused/Stopped)
- Start, Pause, Stop, and Emergency Stop buttons
- Live counters (friend requests, messages, errors)
- Activity logs with timestamps
- Settings management UI

### ✅ Scheduling
- Time-based automation (start/stop times)
- Day-of-week selection
- Background execution support
- Auto-pause when outside schedule

### ✅ Safety Features
- Hard rate limits (daily and session)
- Randomized delays
- Emergency stop button
- Auto-stop on repeated failures
- Minimal permissions (Facebook only)
- No credential storage

## Installation

1. **Clone or download this repository**

2. **Create extension icons**
   - Place icon files in the `icons/` directory:
     - `icon16.png` (16x16)
     - `icon48.png` (48x48)
     - `icon128.png` (128x128)
   - You can use any image editor or online icon generator

3. **Load the extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the extension directory

4. **Grant permissions**
   - Chrome will prompt for permissions
   - The extension only requests access to `facebook.com`

## Usage

### Initial Setup

1. **Navigate to Facebook**
   - Log into Facebook manually in your browser
   - The extension does NOT store passwords or cookies

2. **Open the extension popup**
   - Click the extension icon in Chrome toolbar
   - You'll see the dashboard

3. **Configure Settings**
   - Go to the "Settings" tab
   - Enable "Friend Request Automation" or "Message Automation"
   - Set your limits (recommended: start with low numbers)
   - Configure delays (3-8 seconds recommended)
   - Click "Save Settings"

4. **Set up Message Templates** (optional)
   - Go to "Templates" tab
   - Add custom message templates
   - Messages will be selected randomly

5. **Configure Schedule** (optional)
   - Go to "Schedule" tab
   - Enable scheduling
   - Set start/end times
   - Select days of week
   - Click "Save Schedule"

### Running Automation

1. **Navigate to a Facebook profile page**
   - The extension works on individual profile pages
   - Look for profiles you want to send friend requests to

2. **Start Automation**
   - Click "Start" in the popup
   - Status will change to "Running"
   - The extension will automatically detect "Add Friend" buttons

3. **Monitor Progress**
   - Watch the counters update in real-time
   - Check the "Logs" tab for activity
   - Use "Pause" to temporarily stop
   - Use "Stop" to end the session
   - Use "Emergency Stop" for immediate halt

4. **Automation Behavior**
   - Sends friend requests one at a time
   - Waits for random delays between actions
   - Stops automatically if limits are reached
   - Stops on repeated failures

## Testing & Selector Updates

### ⚠️ Critical: Facebook DOM Selectors

Facebook frequently updates their HTML structure. If the extension stops working, you may need to update selectors in `content/facebook-handler.js`.

### How to Update Selectors

1. **Open Facebook in Chrome**
2. **Open Developer Tools** (F12)
3. **Inspect the "Add Friend" button**
   - Right-click the button → "Inspect"
   - Note the element's attributes:
     - `aria-label`
     - `data-testid`
     - `class` names
     - `href` (if it's a link)

4. **Update `content/facebook-handler.js`**
   - Find the `selectors` object in `FacebookHandler` class
   - Add new selectors to the arrays (they're tried in order)
   - Common selector patterns:
     ```javascript
     'div[aria-label="Add Friend"]',           // By aria-label
     'a[href*="/friends/add"]',                 // By href pattern
     '[data-testid="add-friend-button"]',      // By data-testid
     'div.xyz123[role="button"]'               // By class and role
     ```

5. **Test the selector**
   - Reload the extension
   - Navigate to a profile page
   - Check browser console for errors
   - Try starting automation

### Testing Checklist

- [ ] Extension loads without errors
- [ ] Popup opens and displays correctly
- [ ] Settings can be saved and loaded
- [ ] Status updates correctly (Start/Pause/Stop)
- [ ] Counters increment when actions occur
- [ ] Logs appear in the Logs tab
- [ ] Friend request button is detected on profile pages
- [ ] Friend requests are sent successfully
- [ ] Messages are sent successfully (if enabled)
- [ ] Limits are enforced (daily/session)
- [ ] Scheduling works (if enabled)
- [ ] Emergency stop works immediately
- [ ] State persists after browser restart

### Debugging

1. **Check Browser Console**
   - Open Developer Tools (F12)
   - Look for `[Friender]` or `[AutomationEngine]` logs
   - Errors will show what's failing

2. **Check Extension Console**
   - Go to `chrome://extensions/`
   - Find "Friender"
   - Click "service worker" link (for background script)
   - Check for errors

3. **Check Storage**
   - In Developer Tools → Application → Storage → Local Storage
   - Look for extension data
   - Verify settings are saved

4. **Common Issues**

   **Issue: "Add Friend button not found"**
   - Facebook changed their DOM
   - Update selectors in `facebook-handler.js`
   - See "How to Update Selectors" above

   **Issue: "Automation not starting"**
   - Check if you're on a Facebook page
   - Check if settings are saved
   - Check browser console for errors
   - Verify extension is enabled

   **Issue: "Messages not sending"**
   - Verify message templates are added
   - Check if messaging is enabled in settings
   - Verify you're in a message thread
   - Check selectors for message input

## File Structure

```
Friender/
├── manifest.json                 # Extension manifest (MV3)
├── background/
│   └── worker.js                 # Service worker (scheduling, state)
├── content/
│   ├── automation-engine.js      # Core automation queue system
│   ├── facebook-handler.js       # Facebook DOM interaction
│   └── content-main.js          # Content script entry point
├── popup/
│   ├── popup.html               # Popup UI
│   ├── popup.css                # Popup styles
│   └── popup.js                 # Popup logic
├── icons/
│   ├── icon16.png               # 16x16 icon
│   ├── icon48.png               # 48x48 icon
│   └── icon128.png              # 128x128 icon
└── README.md                    # This file
```

## Configuration

### Default Settings

- **Friend Requests**: 50/day, 20/session
- **Messages**: 30/day, 15/session
- **Delays**: 3-8 seconds between actions
- **Max Failures**: 5 before auto-stop
- **Typing Delay**: 50ms per character

### Recommended Settings for Safety

- Start with **low limits** (10-20 requests/day)
- Use **longer delays** (5-10 seconds)
- Enable **randomize delays**
- Set **reasonable schedules** (business hours)
- Monitor **logs regularly**

## Safety & Compliance

### Built-in Safety Features

1. **Rate Limiting**: Hard limits prevent excessive actions
2. **Random Delays**: Human-like timing between actions
3. **Failure Detection**: Auto-stop on repeated errors
4. **Emergency Stop**: Instant halt button
5. **No Credential Storage**: Extension doesn't store passwords
6. **Minimal Permissions**: Only Facebook.com access

### Best Practices

- **Start Slow**: Begin with low limits and increase gradually
- **Monitor Activity**: Check logs regularly
- **Respect Limits**: Don't set limits too high
- **Use Scheduling**: Run during reasonable hours
- **Test First**: Test on a few profiles before scaling
- **Be Human**: Use natural message templates

## Troubleshooting

### Extension Not Working

1. Reload the extension (`chrome://extensions/` → Reload)
2. Refresh the Facebook page
3. Check browser console for errors
4. Verify you're logged into Facebook
5. Check if selectors need updating

### Selectors Not Working

Facebook updates their UI frequently. If buttons aren't detected:

1. Inspect the element in Developer Tools
2. Find unique attributes (aria-label, data-testid, etc.)
3. Add new selectors to `facebook-handler.js`
4. Test and iterate

### State Not Persisting

1. Check Chrome storage permissions
2. Verify extension is not in incognito mode (if restricted)
3. Check browser console for storage errors
4. Try resetting settings

## Development

### Making Changes

1. **Update Selectors**: Edit `content/facebook-handler.js`
2. **Change Logic**: Edit `content/automation-engine.js`
3. **Update UI**: Edit files in `popup/`
4. **Modify Scheduling**: Edit `background/worker.js`

### Testing Changes

1. Reload extension (`chrome://extensions/` → Reload)
2. Refresh Facebook page
3. Test the changed feature
4. Check console for errors

## License

This project is provided as-is for educational purposes. Use at your own risk.

## Support

For issues or questions:
1. Check this README
2. Review browser console logs
3. Verify selectors are up-to-date
4. Test with minimal settings first

---

**Remember**: Automation may violate Facebook's Terms of Service. Use responsibly and at your own risk.

