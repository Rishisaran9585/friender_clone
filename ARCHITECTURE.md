# Architecture & Technical Design Documentation

## Overview

This document describes the technical architecture, design decisions, and implementation details of the Friender Chrome Extension.

## Phase 3: Architecture & Technical Design

### ✅ 1. Manifest V3 Setup (1 hour) - COMPLETE

**Location**: `manifest.json`

**Implementation**:
- ✅ Manifest V3 compliant
- ✅ Minimal permissions (storage, activeTab, scripting)
- ✅ Host permissions limited to Facebook domains only
- ✅ Background service worker (not persistent background page)
- ✅ Content scripts with proper injection timing
- ✅ Web accessible resources configured

**Key Decisions**:
- Used `activeTab` instead of broad host permissions for better privacy
- Service worker handles scheduling and state management
- Content scripts run at `document_idle` for stability

### ✅ 2. Automation Engine Design (2 hours) - COMPLETE

**Location**: `content/automation-engine.js`

**Queue-Based Action System**:
```javascript
class AutomationEngine {
  queue: []              // Action queue (FIFO)
  isRunning: boolean     // Execution state
  isPaused: boolean      // Pause state
  currentAction: null    // Currently executing action
  failureCount: number   // Consecutive failures
}
```

**Features**:
- ✅ **Queue-based execution**: One action at a time (prevents parallel issues)
- ✅ **State management**: Tracks running/paused/stopped states
- ✅ **Failure handling**: Auto-stop after max failures
- ✅ **Limit checking**: Daily and session limits enforced
- ✅ **Delay system**: Random delays between actions (human-like)
- ✅ **Resume capability**: Can pause and resume safely

**Action Types**:
- `FRIEND_REQUEST`: Send friend request to profile
- `MESSAGE`: Send message to user

**Safety Features**:
- Queue prevents parallel execution
- Failure counting and auto-stop
- Limit enforcement before each action
- Emergency stop support

### ✅ 3. Message Trigger Design (2 hours) - COMPLETE

**Location**: `content/message-trigger-system.js`

**Event-Based Messaging Logic**:

**Trigger Types**:
1. **after_request**: After friend request is sent
2. **after_accept**: After friend request is accepted
3. **incoming_request**: On incoming friend request

**Architecture**:
```javascript
class MessageTriggerSystem {
  triggers: Map<name, config>
  
  registerTrigger(name, {
    condition: async (data) => boolean,
    action: async (data) => actionConfig
  })
  
  processEvent(eventData) => triggeredActions[]
}
```

**Flow**:
1. Automation engine executes action (e.g., friend request)
2. Event data passed to trigger system
3. Each trigger checks condition
4. If condition met, action is evaluated
5. Triggered messages added to queue with delay

**Benefits**:
- Decoupled from main automation logic
- Easy to add new triggers
- Configurable per trigger
- Supports delays and conditions

### ✅ 4. Safety & Throttling Strategy (2 hours) - COMPLETE

**Anti-Ban Logic Implementation**:

**Rate Limiting**:
- ✅ **Daily limits**: Hard caps on friend requests and messages per day
- ✅ **Session limits**: Separate limits for current session
- ✅ **Progressive delays**: Random delays between actions (3-8 seconds default)
- ✅ **Failure detection**: Auto-stop after consecutive failures

**Human-Like Behavior**:
- ✅ **Random delays**: Configurable min/max delay ranges
- ✅ **Typing simulation**: Character-by-character message typing
- ✅ **Natural pauses**: Random pauses during typing
- ✅ **Action spacing**: Minimum time between actions

**Safety Mechanisms**:
```javascript
Safety Features:
- maxFailures: 5 (auto-stop threshold)
- randomizeDelays: true (human-like timing)
- emergencyStop: boolean (instant halt)
- limitEnforcement: before each action
- failureCounting: consecutive failures tracked
```

**Throttling Strategy**:
1. **Pre-action checks**: Limits checked before queueing
2. **Post-action delays**: Random delay after each action
3. **Failure backoff**: Stop on repeated failures
4. **Session tracking**: Separate session counters
5. **Daily reset**: Automatic daily counter reset

**Location**: 
- `content/automation-engine.js` (limit checking, delays)
- `background/worker.js` (daily reset, scheduling)
- `content/facebook-handler.js` (typing simulation)

### ✅ 5. Storage Architecture (1 hour) - COMPLETE

**Local + Sync Strategy**:

**Storage Structure**:
```javascript
chrome.storage.local {
  // Settings (user configuration)
  friendRequest: {
    enabled, maxPerDay, maxPerSession, delays, ...
  },
  messaging: {
    enabled, templates, triggers, limits, ...
  },
  scheduling: {
    enabled, startTime, endTime, daysOfWeek
  },
  safety: {
    maxFailures, randomizeDelays, emergencyStop
  },
  
  // State (runtime data)
  state: {
    status, friendRequestsSent, messagesSent,
    sessionFriendRequests, sessionMessages,
    errors, lastResetDate, sessionStartTime
  },
  
  // Logs
  activityLog: [{
    timestamp, type, message, data
  }]
}
```

**Storage Strategy**:
- ✅ **Local storage**: All data stored in `chrome.storage.local`
- ✅ **State persistence**: Survives browser restart
- ✅ **Settings persistence**: User preferences saved
- ✅ **Log persistence**: Activity logs maintained (last 100 entries)
- ✅ **Daily reset**: Automatic counter reset at midnight

**Data Flow**:
1. **Popup** → Reads/writes settings and state
2. **Background Worker** → Manages state, scheduling, resets
3. **Content Scripts** → Read settings, update state
4. **All components** → Sync via message passing

**State Management**:
- Centralized in background worker
- Updated via `UPDATE_STATE` messages
- Synced across all components
- Atomic updates prevent race conditions

**Location**:
- `background/worker.js` (storage operations)
- `popup/popup.js` (settings read/write)
- `content/automation-engine.js` (state updates)

## UI Development (8 hours) - COMPLETE

### ✅ Main Dashboard (2 hours)

**Location**: `popup/popup.html`, `popup/popup.js`

**Features**:
- ✅ Real-time status indicator (Running/Paused/Stopped)
- ✅ Control buttons (Start/Pause/Stop/Emergency Stop)
- ✅ Live counters (Friend Requests, Messages, Session, Errors)
- ✅ Progress bars (Daily limits with visual indicators)
- ✅ Auto-refresh (updates every 2 seconds)

### ✅ Friend Request Settings Screen (2 hours)

**Location**: `popup/popup.html` (Settings tab)

**Features**:
- ✅ Enable/disable toggle
- ✅ Daily limit configuration
- ✅ Session limit configuration
- ✅ Delay range configuration (min/max seconds)
- ✅ Auto-message after request toggle
- ✅ Save settings button

### ✅ Message Template Screen (2 hours)

**Location**: `popup/popup.html` (Templates tab)

**Features**:
- ✅ Template list display
- ✅ Add new templates
- ✅ **Edit existing templates** (inline editing)
- ✅ Remove templates
- ✅ Enable/disable templates toggle
- ✅ Random selection indicator

### ✅ Activity Logs and Counters Screen (2 hours)

**Location**: `popup/popup.html` (Logs tab)

**Features**:
- ✅ Real-time activity log display
- ✅ **Log filtering** (All/Success/Error/Warning/Info)
- ✅ Timestamp display
- ✅ Color-coded log entries
- ✅ Clear logs button
- ✅ Refresh button
- ✅ Auto-scroll to latest

## Technical Highlights

### Queue System
- FIFO queue ensures sequential execution
- Prevents race conditions
- Supports pause/resume
- Handles failures gracefully

### Event-Driven Architecture
- Message trigger system decouples logic
- Event-based messaging responds to actions
- Easy to extend with new triggers

### Safety First
- Multiple layers of rate limiting
- Human-like behavior simulation
- Failure detection and auto-stop
- Emergency stop capability

### State Persistence
- All state survives browser restart
- Settings persist across sessions
- Activity logs maintained
- Daily counters auto-reset

## File Structure

```
content/
  ├── automation-engine.js      # Queue-based automation system
  ├── message-trigger-system.js # Event-based messaging
  ├── facebook-handler.js      # DOM interaction
  └── content-main.js         # Entry point

background/
  └── worker.js                # Service worker (scheduling, state)

popup/
  ├── popup.html              # UI markup
  ├── popup.css               # Styling
  └── popup.js                # UI logic
```

## Performance Considerations

- **Efficient selectors**: Multiple fallback selectors for reliability
- **Lazy loading**: Settings loaded on demand
- **Debounced updates**: UI updates throttled
- **Minimal DOM queries**: Cached element references
- **Async operations**: Non-blocking I/O

## Security & Privacy

- **No credential storage**: User logs in manually
- **Minimal permissions**: Only Facebook.com access
- **Local storage only**: No external data transmission
- **No tracking**: No analytics or telemetry
- **User control**: All automation user-initiated

## Extensibility

The architecture supports easy extension:

1. **New triggers**: Add to `message-trigger-system.js`
2. **New actions**: Extend `automation-engine.js` queue
3. **New UI screens**: Add tabs to `popup.html`
4. **New selectors**: Update `facebook-handler.js`

## Testing Strategy

1. **Unit testing**: Test individual components
2. **Integration testing**: Test component interactions
3. **Selector testing**: Verify Facebook DOM detection
4. **Limit testing**: Verify rate limiting works
5. **State testing**: Verify persistence

---

**Status**: All Phase 3 architecture tasks complete ✅
**Status**: All UI development tasks complete ✅

