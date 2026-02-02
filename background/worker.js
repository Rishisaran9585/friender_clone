/**
 * Background Service Worker
 * Handles scheduling, state persistence, and coordination between popup and content scripts
 */

// Pending resolve for OPEN_PROFILE_AND_SEND_MESSAGE / OPEN_MESSENGER_AND_SEND_WAIT – resolved when tab sends PROFILE_PAGE_DONE or tab closes
let _pendingProfileMessageResolve = null;

// Single worker tab ID – reuse one tab for all profile/messaging so we don't open 16+ tabs
const WORKER_TAB_STORAGE_KEY = 'profileWorkerTabId';

// When the worker tab is removed, clear stored ID so next open creates a new one
chrome.tabs.onRemoved.addListener((closedTabId) => {
  chrome.storage.local.get([WORKER_TAB_STORAGE_KEY], (data) => {
    if (data[WORKER_TAB_STORAGE_KEY] === closedTabId) {
      chrome.storage.local.remove([WORKER_TAB_STORAGE_KEY]);
    }
  });
  if (!_pendingProfileMessageResolve || _pendingProfileMessageResolve.tabId !== closedTabId) return;
  const openMs = _pendingProfileMessageResolve.openTime ? (Date.now() - _pendingProfileMessageResolve.openTime) : 0;
  if (openMs < 15000) return; // Tab closed too soon – likely crashed; don't resolve so scanner keeps waiting
  try { _pendingProfileMessageResolve.sendResponse({ success: true }); } catch (_) {}
  _pendingProfileMessageResolve = null;
});

// Listen for messages from content scripts and popup
// This must be set up immediately, before any async operations
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle all message types
  if (message.type === 'GET_STATE') {
    let responded = false;
    const safeSend = (payload) => {
      if (responded) return;
      responded = true;
      try { sendResponse(payload); } catch (_) {}
    };
    getState()
      .then(safeSend)
      .catch(error => {
        console.error('[Worker] Error in GET_STATE:', error);
        safeSend({ error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === 'UPDATE_STATE') {
    updateState(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('[Worker] Error in UPDATE_STATE:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'RESET_COUNTERS') {
    resetCounters()
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('[Worker] Error in RESET_COUNTERS:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'LOG_ACTIVITY') {
    logActivity(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('[Worker] Error in LOG_ACTIVITY:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'GET_DTSG_TOKEN') {
    getDtsgToken()
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('[Worker] Error in GET_DTSG_TOKEN:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'GET_DTSG') {
    getDtsg()
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('[Worker] Error in GET_DTSG:', error);
        sendResponse({ status: false, message: error.message, data: null });
      });
    return true;
  }

  if (message.type === 'OPEN_TAB') {
    openTab(message.url, message.options || {})
      .then(tab => sendResponse({ success: true, tab }))
      .catch(error => {
        console.error('[Worker] Error in OPEN_TAB:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Open Messenger thread in same single worker tab; content script sends message (no wait for scanner)
  if (message.type === 'OPEN_MESSENGER_AND_SEND') {
    const { userId, profileName, trigger } = message.data || {};
    if (!userId) {
      sendResponse({ success: false, error: 'userId required' });
      return true;
    }
    const url = `https://www.facebook.com/messages/t/${userId}`;
    chrome.storage.local.set({
      pendingAutoMessage: {
        userId: String(userId),
        profileName: profileName || 'Friend',
        trigger: trigger || 'after_accept'
      }
    }).then(() => getOrCreateProfileWorkerTab(url, { pinned: true, active: false }))
      .then(tab => sendResponse({ success: true, tab }))
      .catch(error => {
        console.error('[Worker] Error in OPEN_MESSENGER_AND_SEND:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Open Messenger thread in same single worker tab; resolve when tab sends PROFILE_PAGE_DONE (reuse one tab)
  if (message.type === 'OPEN_MESSENGER_AND_SEND_WAIT') {
    const { userId, profileName, trigger, storedMessage } = message.data || {};
    const senderTabId = sender.tab?.id;
    if (!userId) {
      sendResponse({ success: false, error: 'userId required' });
      return true;
    }
    const url = `https://www.facebook.com/messages/t/${userId}`;
    chrome.storage.local.set({
      pendingAutoMessage: {
        userId: String(userId),
        profileName: profileName || 'Friend',
        trigger: trigger || 'after_request',
        storedMessage: storedMessage && String(storedMessage).trim() ? String(storedMessage).trim() : null
      }
    }).then(() => getOrCreateProfileWorkerTab(url, { pinned: true, active: false }))
      .then(tab => {
        if (!tab || !tab.id) {
          sendResponse({ success: false, error: 'Failed to get worker tab' });
          return;
        }
        const windowId = sender.tab?.windowId;
        if (windowId != null) chrome.windows.update(windowId, { focused: true }).catch(() => {});
        if (senderTabId != null) {
          chrome.tabs.update(senderTabId, { active: true }).catch(() => {});
          setTimeout(() => { chrome.tabs.update(senderTabId, { active: true }).catch(() => {}); }, 50);
          setTimeout(() => { chrome.tabs.update(senderTabId, { active: true }).catch(() => {}); }, 500);
        }
        _pendingProfileMessageResolve = { sendResponse, tabId: tab.id, openTime: Date.now() };
        setTimeout(() => {
          if (_pendingProfileMessageResolve && _pendingProfileMessageResolve.tabId === tab.id) {
            try { _pendingProfileMessageResolve.sendResponse({ success: true }); } catch (_) {}
            _pendingProfileMessageResolve = null;
          }
        }, 90000);
      })
      .catch(error => {
        console.error('[Worker] Error in OPEN_MESSENGER_AND_SEND_WAIT:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Open profile page in single worker tab (reuse one tab – no 16+ tabs); resolve when tab sends PROFILE_PAGE_DONE
  if (message.type === 'OPEN_PROFILE_AND_SEND_MESSAGE') {
    const { profileUrl, profileId, profileName, trigger, storedMessage } = message.data || {};
    const senderTabId = sender.tab?.id;
    if (!profileUrl) {
      sendResponse({ success: false, error: 'profileUrl required' });
      return true;
    }
    chrome.storage.local.set({
      pendingProfilePageMessage: {
        profileUrl: profileUrl,
        profileId: String(profileId || ''),
        profileName: profileName || 'Friend',
        trigger: trigger || 'after_request',
        storedMessage: storedMessage && String(storedMessage).trim() ? String(storedMessage).trim() : null
      }
    })
      .then(() => getOrCreateProfileWorkerTab(profileUrl, { pinned: true, active: false }))
      .catch(err => {
        console.warn('[Worker] getOrCreateProfileWorkerTab failed, retrying in 2s:', err?.message);
        return new Promise(r => setTimeout(r, 2000)).then(() => getOrCreateProfileWorkerTab(profileUrl, { pinned: true, active: false }));
      })
      .then(tab => {
        if (!tab || !tab.id) {
          sendResponse({ success: false, error: 'Failed to open profile tab' });
          return;
        }
        const windowId = sender.tab?.windowId;
        if (windowId != null) chrome.windows.update(windowId, { focused: true }).catch(() => {});
        // Keep user on group/suggestions page – never switch to profile tab
        if (senderTabId != null) {
          chrome.tabs.update(senderTabId, { active: true }).catch(() => {});
          const refocusSender = () => chrome.tabs.update(senderTabId, { active: true }).catch(() => {});
          setTimeout(refocusSender, 100);
          setTimeout(refocusSender, 500);
          setTimeout(refocusSender, 2000);
        }
        _pendingProfileMessageResolve = { sendResponse, tabId: tab.id, senderTabId, openTime: Date.now() };
        setTimeout(() => {
          if (_pendingProfileMessageResolve && _pendingProfileMessageResolve.tabId === tab.id) {
            try { _pendingProfileMessageResolve.sendResponse({ success: true }); } catch (_) {}
            _pendingProfileMessageResolve = null;
          }
        }, 90000);
      })
      .catch(error => {
        console.error('[Worker] Error in OPEN_PROFILE_AND_SEND_MESSAGE:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response when tab sends PROFILE_PAGE_DONE
  }

  // Content script in worker tab signals "done with this profile/messenger" – resolve so scanner advances; do NOT close tab (reuse)
  if (message.type === 'PROFILE_PAGE_DONE') {
    const tabId = sender.tab?.id;
    const pending = _pendingProfileMessageResolve;
    if (pending && tabId != null && pending.tabId === tabId) {
      const senderTabId = pending.senderTabId;
      try { pending.sendResponse({ success: true }); } catch (_) {}
      _pendingProfileMessageResolve = null;
      if (senderTabId != null) chrome.tabs.update(senderTabId, { active: true }).catch(() => {});
    }
    sendResponse({ success: true });
    return false; // synchronous response already sent
  }

  // Focus the sender tab (e.g. profile tab so chat popup can render when using profile Message button)
  if (message.type === 'FOCUS_TAB') {
    const tabId = message.tabId != null ? message.tabId : sender.tab?.id;
    if (tabId != null) {
      chrome.tabs.update(tabId, { active: true }).then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
    } else {
      sendResponse({ success: false, error: 'tabId required' });
    }
    return true;
  }

  // Remove one entry from pending message retry list when send succeeded (so we don't retry again)
  if (message.type === 'REMOVE_PENDING_RETRY') {
    const profileId = message.profileId != null ? String(message.profileId) : null;
    if (profileId) {
      chrome.storage.local.get(['pendingMessageRetry'], (data) => {
        const list = (data.pendingMessageRetry || []).filter(
          (e) => e.profileId !== profileId && String(e.profileId) !== profileId
        );
        chrome.storage.local.set({ pendingMessageRetry: list });
      });
    }
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'CLOSE_TAB') {
    const tabId = message.tabId != null ? message.tabId : sender.tab?.id;
    if (tabId != null) {
      // Refocus the Run tab (sender of OPEN_PROFILE_AND_SEND_MESSAGE) so user is back on their page
      if (_pendingProfileMessageResolve && _pendingProfileMessageResolve.tabId === tabId && _pendingProfileMessageResolve.senderTabId != null) {
        chrome.tabs.update(_pendingProfileMessageResolve.senderTabId, { active: true }).catch(() => {});
      }
      // Profile tab is closing – resolve OPEN_PROFILE_AND_SEND_MESSAGE so scanner can move to next
      if (_pendingProfileMessageResolve && _pendingProfileMessageResolve.tabId === tabId) {
        try { _pendingProfileMessageResolve.sendResponse({ success: true }); } catch (_) {}
        _pendingProfileMessageResolve = null;
      }
      chrome.tabs.remove(tabId).then(() => sendResponse({ success: true })).catch(e => {
        console.error('[Worker] Error closing tab:', e);
        sendResponse({ success: false, error: e.message });
      });
    } else {
      sendResponse({ success: false, error: 'tabId required' });
    }
    return true;
  }

  if (message.type === 'WAIT_FOR_TAB_LOAD') {
    waitForTabLoad(message.tabId)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('[Worker] Error in WAIT_FOR_TAB_LOAD:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'OPEN_PENDING_REQUEST_PAGE') {
    openPendingRequestPage()
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('[Worker] Error in OPEN_PENDING_REQUEST_PAGE:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'CHECK_PENDING_REQUESTS') {
    // Background worker will handle checking - no tabs opened
    checkPendingRequestsForAcceptance()
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('[Worker] Error in CHECK_PENDING_REQUESTS:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'PROFILE_VISITED') {
    // Content script detected user visited a profile - check if it's pending and accepted
    checkProfileForPendingRequest(message.profileUrl)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('[Worker] Error in PROFILE_VISITED:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Unknown message type
  return false;
});

// Initialize extension state on install and startup
chrome.runtime.onInstalled.addListener(() => {
  // Delay initialization to ensure service worker is ready
  setTimeout(() => {
    initializeDefaultSettings().catch(error => {
      console.error('[Worker] Error initializing on install:', error);
      // Don't throw - just log the error
    });
  }, 100);
});

// Also initialize on startup (service worker may restart)
chrome.runtime.onStartup.addListener(() => {
  // Delay initialization to ensure service worker is ready
  setTimeout(() => {
    initializeDefaultSettings().catch(error => {
      console.error('[Worker] Error initializing on startup:', error);
      // Don't throw - just log the error
    });
  }, 100);
});

// Initialize immediately when worker loads (with delay to ensure SW is ready)
setTimeout(() => {
  initializeDefaultSettings().catch(error => {
    // Only log if it's not a service worker error (which is normal during startup)
    if (!error.message || !error.message.includes('No SW')) {
      console.error('[Worker] Error initializing on load:', error);
    }
    // Don't throw - service worker errors during initialization are often transient
  });
}, 100);

// Initialize default settings
async function initializeDefaultSettings() {
  try {
    // Check if Chrome APIs are available
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      console.warn('[Worker] Chrome storage API not available yet, retrying...');
      // Retry after a short delay
      setTimeout(() => initializeDefaultSettings(), 500);
      return;
    }

    const result = await chrome.storage.local.get(['settingsInitialized']);

    if (!result.settingsInitialized) {
      const defaultSettings = {
        // Friend Request Settings (simplified to match Friend Connector)
        friendRequest: {
          enabled: false,
          lookupInterval: 'auto', // auto, 30, 45, 60 (seconds)
          requestsLimit: 'limited', // limited, infinite
          numberOfRequests: 2,
          useGenderFilter: false,
          gender: null, // male, female
          useCountryFilter: false,
          countryFilter: null, // tier, country
          mutualFriendsOperator: 'greater', // greater, equal, less
          mutualFriendsCount: 1,
          messageGroups: 'test12'
        },

        // Message Settings
        messaging: {
          enabled: false,
          sendAfterRequest: false,
          sendAfterAccept: true,
          sendOnIncomingRequest: false,
          sendOnDecline: false,
          // No daily limit - removed maxPerDay
          maxPerSession: 15,
          typingDelay: 50, // milliseconds per character
          templates: [
            "Hi! Thanks for accepting my friend request. Looking forward to connecting!",
            "Hello! Great to connect with you on Facebook.",
            "Hi there! Thanks for adding me as a friend."
          ]
        },

        // Scheduling
        scheduling: {
          enabled: false,
          startTime: "09:00",
          endTime: "21:00",
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7] // All days
        },

        // Safety
        safety: {
          maxFailures: 5,
          emergencyStop: false,
          randomizeDelays: true
        },

        // State
        state: {
          status: 'stopped', // stopped, running, paused
          friendRequestsSent: 0,
          messagesSent: 0,
          sessionFriendRequests: 0,
          sessionMessages: 0,
          errors: 0,
          lastResetDate: new Date().toDateString(),
          sessionStartTime: null
        },

        settingsInitialized: true
      };

      await chrome.storage.local.set(defaultSettings);
      console.log('[Worker] Default settings initialized');
    } else {
      console.log('[Worker] Settings already initialized');
    }
  } catch (error) {
    // Handle service worker errors gracefully
    if (error.message && error.message.includes('No SW')) {
      // Service worker not ready - this is normal during startup
      console.log('[Worker] Service worker not ready yet, will retry on next activation');
      return; // Don't throw - allow worker to continue
    }
    
    // For other errors, log but don't throw to prevent breaking the worker
    console.error('[Worker] Error in initializeDefaultSettings:', error);
    // Don't throw - allow worker to continue functioning
  }
}

// Get current state
async function getState() {
  try {
    const data = await chrome.storage.local.get([
      'friendRequest',
      'messaging',
      'scheduling',
      'safety',
      'state',
      'activityLog'
    ]);

    return {
      settings: {
        friendRequest: data.friendRequest || {},
        messaging: data.messaging || {},
        scheduling: data.scheduling || {},
        safety: data.safety || {}
      },
      state: data.state || {},
      activityLog: data.activityLog || []
    };
  } catch (error) {
    console.error('[Worker] Error in getState:', error);
    // Return default state on error
    return {
      settings: {
        friendRequest: {},
        messaging: {},
        scheduling: {},
        safety: {}
      },
      state: { status: 'stopped' },
      activityLog: []
    };
  }
}

// Update state
async function updateState(updates) {
  const current = await chrome.storage.local.get(['state', 'friendRequest', 'settings']);
  const currentState = current.state && typeof current.state === 'object' ? current.state : {};
  let effectiveUpdates = { ...updates };

  // Safeguard: ignore spurious status:'stopped' when session limit not reached.
  // Skip when user explicitly clicked Stop (userRequestedStop) so Stop always takes effect.
  const userRequestedStop = effectiveUpdates.userRequestedStop === true;
  if (userRequestedStop) delete effectiveUpdates.userRequestedStop;
  if (effectiveUpdates.status === 'stopped' && currentState.status === 'running' && !userRequestedStop) {
    const sessionSent = currentState.sessionFriendRequests || 0;
    const friendRequest = current.friendRequest || {};
    const settings = current.settings || {};
    const limit = settings.numberOfRequests ?? friendRequest.numberOfRequests ?? 2;
    const requestsLimit = settings.requestsLimit ?? friendRequest.requestsLimit ?? 'limited';
    if (requestsLimit === 'limited' && sessionSent < limit) {
      delete effectiveUpdates.status; // keep running until limit actually reached
    }
  }

  const newState = { ...currentState, ...effectiveUpdates };

  // Never drop status when merging partial updates (e.g. friendRequestsSent only)
  if (effectiveUpdates.status === undefined && (currentState.status === 'running' || currentState.status === 'paused')) {
    newState.status = currentState.status;
  }
  newState.status = newState.status ?? currentState.status ?? 'stopped';

  // Handle status transitions
  if (effectiveUpdates.status === 'running' && currentState.status !== 'running') {
    newState.sessionStartTime = Date.now();
    newState.sessionFriendRequests = 0;
    newState.sessionMessages = 0;
  }

  // If session counters are explicitly reset (e.g. from popup), follow that
  if (effectiveUpdates.sessionFriendRequests === 0) newState.sessionFriendRequests = 0;
  if (effectiveUpdates.sessionMessages === 0) newState.sessionMessages = 0;

  // Track increments from content script
  // Note: Content script sends the TOTAL current count (friendRequestsSent)
  // We calculate session count based on when status was last started.
  if (effectiveUpdates.friendRequestsSent !== undefined && currentState.status === 'running') {
    const prevSent = currentState.friendRequestsSent || 0;
    if (effectiveUpdates.friendRequestsSent > prevSent) {
      newState.sessionFriendRequests = (currentState.sessionFriendRequests || 0) + (effectiveUpdates.friendRequestsSent - prevSent);
    }
  }

  if (effectiveUpdates.messagesSent !== undefined && currentState.status === 'running') {
    const prevMsg = currentState.messagesSent || 0;
    if (effectiveUpdates.messagesSent > prevMsg) {
      newState.sessionMessages = (currentState.sessionMessages || 0) + (effectiveUpdates.messagesSent - prevMsg);
    }
  }

  await chrome.storage.local.set({ state: newState });

  // Update badge
  updateBadge(newState);
}

// Update extension icon badge
function updateBadge(state) {
  // Show session count (current run) instead of total count
  const count = state.sessionFriendRequests || 0;
  const status = state.status || 'stopped';

  if (status === 'running' || status === 'paused') {
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: status === 'running' ? '#4CAF50' : '#FFC107' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Reset session counters (when automation stops)
// Note: No daily limit, so we don't reset daily counters
async function resetCounters() {
  const data = await chrome.storage.local.get(['state']);
  
  // Only reset session counters when automation stops
  // Daily counters are kept for tracking purposes but not used for limits
  if (data.state?.status === 'stopped') {
    await chrome.storage.local.set({
      state: {
        ...data.state,
        sessionFriendRequests: 0,
        sessionMessages: 0
      }
    });
  }
}

// Log activity
async function logActivity(activity) {
  const data = await chrome.storage.local.get(['activityLog']);
  const log = data.activityLog || [];

  log.unshift({
    timestamp: new Date().toISOString(),
    type: activity.type,
    message: activity.message,
    data: activity.data || {}
  });

  // Keep only last 100 entries
  if (log.length > 100) {
    log.pop();
  }

  await chrome.storage.local.set({ activityLog: log });
}

// Check if automation should run based on schedule
async function shouldRunBasedOnSchedule() {
  const data = await chrome.storage.local.get(['scheduling']);
  const schedule = data.scheduling || {};

  if (!schedule.enabled) {
    return true; // No schedule restrictions
  }

  const now = new Date();
  const currentDay = now.getDay() || 7; // Convert Sunday (0) to 7
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Check day of week
  if (!schedule.daysOfWeek?.includes(currentDay)) {
    return false;
  }

  // Parse start/end times
  const [startHour, startMin] = schedule.startTime.split(':').map(Number);
  const [endHour, endMin] = schedule.endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const currentMinutes = currentHour * 60 + currentMinute;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// Periodic check for scheduling (runs every minute)
setInterval(async () => {
  const data = await chrome.storage.local.get(['state', 'scheduling']);
  const state = data.state || {};
  const schedule = data.scheduling || {};

  if (state.status === 'running' && schedule.enabled) {
    const shouldRun = await shouldRunBasedOnSchedule();

    if (!shouldRun) {
      // Auto-pause when outside schedule
      await chrome.storage.local.set({
        state: { ...state, status: 'paused' }
      });

      // Notify content script
      chrome.tabs.query({ url: '*://www.facebook.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SCHEDULE_PAUSE'
          }).catch(() => { }); // Ignore errors if content script not ready
        });
      });
    }
  }
}, 60000); // Check every minute

// No daily reset needed - session counters reset when automation stops/starts

// ============================================================================
// TAB MANAGEMENT UTILITIES
// ============================================================================

/**
 * Open a new tab with options
 * @param {string} url - URL to open
 * @param {Object} options - {pinned: boolean, active: boolean}
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function openTab(url, options = {}) {
  const { pinned = false, active = true } = options;
  
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, pinned, active }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tab);
      }
    });
  });
}

/**
 * Wait for a tab to finish loading
 * @param {number} tabId - Tab ID to wait for
 * @returns {Promise<void>}
 */
async function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    // Check if tab already loaded
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (tab && tab.status === 'complete') {
        resolve();
        return;
      }
      
      // Wait for tab to load
      const listener = (id, changeInfo) => {
        if (id === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, 30000);
    });
  });
}

/**
 * Get or create a single worker tab for profile/messaging. Reuses one tab so we don't open 16+ tabs.
 * @param {string} url - URL to open or navigate to
 * @param {Object} options - { pinned: boolean, active: boolean }
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function getOrCreateProfileWorkerTab(url, options = {}) {
  const { pinned = true, active = false } = options;
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([WORKER_TAB_STORAGE_KEY], async (data) => {
      const existingId = data[WORKER_TAB_STORAGE_KEY];
      if (existingId) {
        chrome.tabs.get(existingId, (tab) => {
          if (tab && !chrome.runtime.lastError) {
            chrome.tabs.update(existingId, { url, active, pinned: tab.pinned || pinned }, (updatedTab) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(updatedTab);
              }
            });
          } else {
            chrome.storage.local.remove([WORKER_TAB_STORAGE_KEY], () => {
              openTab(url, { pinned, active })
                .then((newTab) => {
                  chrome.storage.local.set({ [WORKER_TAB_STORAGE_KEY]: newTab.id });
                  resolve(newTab);
                })
                .catch(reject);
            });
          }
        });
      } else {
        openTab(url, { pinned, active })
          .then((newTab) => {
            chrome.storage.local.set({ [WORKER_TAB_STORAGE_KEY]: newTab.id });
            resolve(newTab);
          })
          .catch(reject);
      }
    });
  });
}

/**
 * Get or create a messaging tab
 * @param {string} url - URL for messaging
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function getOrCreateMessagingTab(url) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['messagingTabId'], async (data) => {
      if (data.messagingTabId) {
        // Check if tab still exists
        chrome.tabs.get(data.messagingTabId, (tab) => {
          if (tab && !chrome.runtime.lastError) {
            // Update existing tab
            chrome.tabs.update(data.messagingTabId, { url, active: false }, (updatedTab) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(updatedTab);
              }
            });
          } else {
            // Tab doesn't exist, create new one
            chrome.storage.sync.remove(['messagingTabId'], async () => {
              try {
                const newTab = await openTab(url, { pinned: true, active: false });
                chrome.storage.sync.set({ messagingTabId: newTab.id });
                resolve(newTab);
              } catch (error) {
                reject(error);
              }
            });
          }
        });
      } else {
        // Create new tab
        openTab(url, { pinned: true, active: false })
          .then((newTab) => {
            chrome.storage.sync.set({ messagingTabId: newTab.id });
            resolve(newTab);
          })
          .catch(reject);
      }
    });
  });
}

// ============================================================================
// DTSG TOKEN FETCHING (For API-based messaging)
// ============================================================================

/**
 * Fetch DTSG token from Facebook (for API-based messaging)
 * @returns {Promise<{success: boolean, token?: string, error?: string}>}
 */
async function getDtsgToken() {
  try {
    const response = await fetch("https://www.facebook.com/", {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
      }
    });
    
    if (!response.ok) {
      return { success: false, error: `Failed to fetch Facebook page: ${response.status}` };
    }
    
    const html = await response.text();
    
    // Extract DTSG token
    const tokenRegex = /"DTSGInitialData".*?"token"\s*:\s*"([^"]+)"/;
    const match = html.match(tokenRegex);
    
    if (match && match[1]) {
      return { success: true, token: match[1] };
    }
    
    // Try alternative regex pattern
    const altRegex = /"token"\s*:\s*"([^"]+)"/;
    const altMatch = html.match(altRegex);
    
    if (altMatch && altMatch[1]) {
      return { success: true, token: altMatch[1] };
    }
    
    return { success: false, error: "Token not found in response" };
  } catch (error) {
    console.error('[Worker] Error fetching DTSG token:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get DTSG token and Facebook user ID
 * @returns {Promise<{status: boolean, data?: {dtsg: string, fbId?: string}, message: string}>}
 */
async function getDtsg() {
  try {
    const result = await getDtsgToken();
    
    if (!result.success) {
      return {
        status: false,
        message: "Please log in to Facebook to use this feature",
        data: null
      };
    }
    
    // Try to extract Facebook user ID from the same response
    // This would require fetching again or parsing from HTML
    // For now, return the token
    return {
      status: true,
      message: "Successfully fetched DTSG token",
      data: {
        dtsg: result.token,
        fbId: null // Can be extracted separately if needed
      }
    };
  } catch (error) {
    console.error('[Worker] Error in getDtsg:', error);
    return {
      status: false,
      message: error.message,
      data: null
    };
  }
}

// ============================================================================
// ENHANCED PENDING REQUEST DELETION
// ============================================================================

/**
 * Open pending request page and inject deletion script
 * Enhanced version with better error handling and tab management
 * @returns {Promise<void>}
 */
async function openPendingRequestPage() {
  // Navigate to main friend requests page
  // Content script will click "View sent requests" button to get to sent requests
  const requestsUrl = "https://www.facebook.com/friends/requests";
  
  try {
    // Reset counter
    chrome.storage.local.set({ pendingRequestCount: 0 });
    
    // Check if we already have a tab open on requests page
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ url: '*://www.facebook.com/friends/requests*' }, resolve);
    });
    
    let tab;
    
    if (tabs && tabs.length > 0) {
      // Use existing tab
      tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
      // Reload to ensure we're on the right page
      await chrome.tabs.reload(tab.id);
    } else {
      // Open new tab to requests page
      tab = await openTab(requestsUrl, { active: true });
    }
    
    // Wait for page to load
    await waitForTabLoad(tab.id);
    
    // Give extra time for page to fully load and render
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Inject deletion script via message to content script
    // The content script will handle DELETE_PENDING_REQUESTS (may respond async; tab may close before response)
    const sendDeleteMessage = () => {
      chrome.tabs.sendMessage(tab.id, { type: 'DELETE_PENDING_REQUESTS' }, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || String(chrome.runtime.lastError);
          const tabGone = /Receiving end does not exist|message port closed|Could not establish connection/i.test(errorMsg);
          if (tabGone) {
            // Tab closed or navigated – expected; don't retry or log as error
            return;
          }
          console.warn('[Worker] Deletion message:', errorMsg);
          // Content script might not be ready yet; retry once after delay (only if tab likely still there)
          chrome.tabs.get(tab.id).then(() => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { type: 'DELETE_PENDING_REQUESTS' }, (retryResponse) => {
                if (chrome.runtime.lastError && !/Receiving end does not exist|message port closed/i.test(chrome.runtime.lastError.message || '')) {
                  console.warn('[Worker] Deletion retry:', chrome.runtime.lastError.message);
                }
              });
            }, 3000);
          }).catch(() => {});
        } else {
          console.log('[Worker] Deletion message sent successfully');
        }
      });
    };
    
    sendDeleteMessage();
    
    // Log activity
    await logActivity({
      type: 'info',
      message: 'Opened friend requests page for deletion (will navigate to sent requests)',
      data: { tabId: tab.id, url: requestsUrl }
    });
    
  } catch (error) {
    console.error('[Worker] Error in openPendingRequestPage:', error);
    
    // Log error
    await logActivity({
      type: 'error',
      message: 'Failed to open friend requests page',
      data: { error: error.message }
    });
    
    throw error;
  }
}

// ============================================================================
// PENDING REQUEST CHECKING
// ============================================================================

/**
 * Check if a profile is in the pending requests list
 * @param {string} profileUrl - Profile URL to check
 * @returns {Promise<{shouldCheck: boolean, pendingRequest?: Object}>}
 */
async function checkProfileForPendingRequest(profileUrl) {
  try {
    const result = await chrome.storage.local.get(['pendingFriendRequests']);
    const pendingRequests = result.pendingFriendRequests || [];
    
    // Find matching pending request
    const pendingRequest = pendingRequests.find(req => 
      req.url === profileUrl && !req.messageSent
    );
    
    if (pendingRequest) {
      return {
        shouldCheck: true,
        pendingRequest: pendingRequest
      };
    }
    
    return { shouldCheck: false };
  } catch (error) {
    console.error('[Worker] Error in checkProfileForPendingRequest:', error);
    return { shouldCheck: false, error: error.message };
  }
}

/**
 * Check all pending requests for acceptance
 * This function is called periodically to check if any pending requests have been accepted
 * Since background worker can't access DOM, this mainly logs and can trigger content script checks
 * @returns {Promise<void>}
 */
async function checkPendingRequestsForAcceptance() {
  try {
    const result = await chrome.storage.local.get(['pendingFriendRequests', 'state']);
    const pendingRequests = result.pendingFriendRequests || [];
    const state = result.state || {};
    
    // Only check if automation is running
    if (state.status !== 'running') {
      return;
    }
    
    // Filter out requests that already have messages sent
    const pendingToCheck = pendingRequests.filter(req => !req.messageSent);
    
    if (pendingToCheck.length === 0) {
      return; // No pending requests to check
    }
    
    console.log(`[Worker] Checking ${pendingToCheck.length} pending friend requests for acceptance`);
    
    // The actual checking happens when profiles are visited via PROFILE_VISITED message
    // This function mainly serves as a placeholder for future enhancements
    // (e.g., opening tabs to check profiles, or using API calls)
    
    // Log activity
    await logActivity({
      type: 'info',
      message: `Checking ${pendingToCheck.length} pending requests for acceptance`,
      data: { count: pendingToCheck.length }
    });
    
  } catch (error) {
    console.error('[Worker] Error in checkPendingRequestsForAcceptance:', error);
    // Don't throw - allow worker to continue
  }
}

