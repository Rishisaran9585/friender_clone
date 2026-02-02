/**
 * Content Script Main
 * Entry point that coordinates automation on Facebook pages
 */

// Helper to check if extension context is still valid
function isExtensionContextValid() {
  try {
    // Check if chrome.runtime is available
    if (!chrome || !chrome.runtime || !chrome.runtime.getManifest) {
      return false;
    }
    // Try to access manifest - this will throw if context is invalidated
    chrome.runtime.getManifest();
    return true;
  } catch (e) {
    // Context invalidated - this is expected when extension is reloaded
    return false;
  }
}

// Ensure context-invalidated toast helper exists (may already be set by automation-engine.js)
if (typeof window !== 'undefined' && !window.frienderOnContextInvalidated) {
  window.frienderOnContextInvalidated = function () {
    if (window.__frienderContextInvalidatedNotified) return;
    window.__frienderContextInvalidatedNotified = true;
    if (typeof window.showFrienderToast === 'function') {
      window.showFrienderToast('Extension reloaded', 'Refresh this Facebook page (F5) and try again.', 'warning');
    }
  };
  window.frienderIsContextInvalidatedError = function (err) {
    return err && String(err.message || '').includes('Extension context invalidated');
  };
}

// Safe wrapper for chrome.runtime.sendMessage
async function safeSendMessage(message) {
  if (!isExtensionContextValid()) {
    console.warn('[Friender] Extension context invalidated, cannot send message.');
    return null;
  }
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError.message || '';
        // Ignore expected errors: context invalidated, port closed, or channel closed before response (e.g. tab closed / extension reload)
        if (errMsg.includes('Extension context invalidated') ||
            errMsg.includes('message port closed') ||
            errMsg.includes('Could not establish connection') ||
            errMsg.includes('message channel closed') ||
            errMsg.includes('asynchronous response')) {
          if (errMsg.includes('Extension context invalidated')) {
            console.warn('[Friender] Extension context invalidated, stopping operations.');
          }
          resolve(null);
        } else {
          console.error('[Friender] Error sending message:', errMsg);
          resolve(null);
        }
      } else {
        resolve(response);
      }
    });
  });
}

// Strip trailing timestamp from display name (e.g. "Hari 41m" -> "Hari", "Jane 2h" -> "Jane")
function stripTimestampFromName(name) {
  if (!name || typeof name !== 'string' || name === 'Unknown') return name;
  return name.replace(/\s+\d+[mhd]\s*$/i, '').trim() || name;
}

/** Extract display name only from friend-request card text (e.g. "UnreadHari sent you a friend request." → "Hari"). */
function normalizeFriendRequestDisplayName(name) {
  if (!name || typeof name !== 'string' || name === 'Unknown') return name;
  let cleaned = String(name).trim();
  // Strip leading "Unread" (with or without space) so "UnreadHari" or "Unread Hari" → "Hari"
  cleaned = cleaned.replace(/^\s*Unread\s*/i, '');
  // Strip trailing " sent you a friend request." or "New friend request notification" and similar
  cleaned = cleaned.replace(/\s*sent\s+you\s+a\s+friend\s+request\.?\s*$/i, '');
  cleaned = cleaned.replace(/\s*New\s+friend\s+request\s+notification\s*$/i, '');
  cleaned = cleaned.replace(/\s*Mark as read\s*$/i, '').replace(/\s*Confirm\s*$/i, '').replace(/\s*Delete\s*$/i, '');
  cleaned = cleaned.trim();
  return cleaned || name;
}

/** Return true if text is a UI label (section header, link text), not a person's name. */
function isFriendRequestUILabel(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (/^\d+\s*friend\s*requests?$/i.test(t)) return true;
  if (/^View\s+sent\s+requests$/i.test(t)) return true;
  if (/^See\s+all$/i.test(t)) return true;
  if (/^Friend\s+requests$/i.test(t)) return true;
  return false;
}

/** Blocklist: never use as a profile name (ads, UI, section headers). */
function isFriendRequestBlocklistedName(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim().toLowerCase();
  const blocklist = [
    'sponsored', 'see all', 'birthdays', 'contacts', 'meta ai', 'verified account',
    'group chats', 'create group chat', 'online status indicator', 'active',
    'link to see everyone', 'followed by', 'wanotifier.com', 'friend requests',
    'new friend request', 'confirm', 'delete', 'remove', 'decline', 'add friend',
    'message', 'notifications', 'menu', 'search', 'home', 'watch', 'marketplace',
    'create group', 'lovely student\'s', 'create group chat', 'create group'
  ];
  if (blocklist.some(b => t === b || t.startsWith(b + ' ') || t.endsWith(' ' + b))) return true;
  if (/^\d+[mhd]\s*$/i.test(t)) return true;
  if (/followed by \d/i.test(t)) return true;
  if (/^[\w.]+\s*,\s*[\w.]+\s+and\s+\d+\s+others?$/i.test(t)) return true;
  if (t.length <= 1 || t.length > 80) return true;
  if (t.split(/\s+/).length > 5) return true;
  return false;
}

/** Return true if text is the "You're now friends with X" status phrase (not a real profile name). */
function isAcceptedStatusPhrase(text) {
  if (!text || typeof text !== 'string') return false;
  return /^You\'re now friends with\s+.+$/i.test(text.trim());
}
/** If text is "You're now friends with X.", return "X"; otherwise return null. */
function parseNameFromAcceptedStatusPhrase(text) {
  if (!text || typeof text !== 'string') return null;
  const m = text.trim().match(/^You\'re now friends with\s+(.+?)\s*[.\s]*$/i);
  return m ? m[1].trim() : null;
}

/** Return true if text looks like a location (e.g. "Theni, India") rather than a person's name. */
function looksLikeLocation(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!/, /.test(t)) return false;
  const parts = t.split(',').map(s => s.trim());
  if (parts.length !== 2) return false;
  const second = parts[1];
  if (second.split(/\s+/).length > 2) return false;
  if (/^(India|USA|UK|U\.?S\.?A\.?|United States|Canada|Australia|Germany|France|Pakistan|Bangladesh|Sri Lanka|Malaysia|Singapore|Dubai|UAE|Nepal|Indonesia|Philippines|Vietnam|Japan|China|Brazil|Mexico|Nigeria|South Africa|Kenya|Egypt|Russia|Ukraine|Italy|Spain|Netherlands|Sweden|Poland|Turkey|Saudi Arabia|Iran|Iraq|Israel|Thailand|Myanmar|Cambodia|Laos|Portugal|Greece|Romania|Hungary|Czech|Austria|Switzerland|Ireland|Scotland|Wales|New Zealand|Argentina|Chile|Colombia|Peru|Venezuela|Ethiopia|Ghana|Tanzania|Uganda|Morocco|Algeria|Tunisia|Korea|Taiwan|Hong Kong|Qatar|Kuwait|Oman|Bahrain|Jordan|Lebanon|Syria|Yemen|Afghanistan)$/i.test(second)) return true;
  if (second.split(/\s+/).length === 2 && second.length >= 4) return true;
  return false;
}

/** Count valid Facebook profile links inside an element (used to prefer one-card containers). */
function countProfileLinksIn(el) {
  if (!el || !el.querySelectorAll) return 0;
  let n = 0;
  const links = el.querySelectorAll('a[href*="/profile.php"], a[href*="facebook.com/"], a[href*="/user/"]');
  for (const a of links) {
    const href = a.href || a.getAttribute('href') || '';
    if (!href) continue;
    try {
      const full = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
      if (isFacebookProfileUrl(full)) n++;
    } catch (_) {}
  }
  return n;
}

/** Find smallest ancestor of btn that contains exactly one profile link (so one card per entry). */
function findSmallestCardWithOneProfileLink(btn) {
  let el = btn.parentElement;
  for (let w = 0; w < 25 && el; w++) {
    const count = countProfileLinksIn(el);
    if (count === 1) return el;
    el = el.parentElement;
  }
  return null;
}

/** Return true only for real Facebook profile links (not ads, redirects, or external). */
function isFacebookProfileUrl(href) {
  if (!href || typeof href !== 'string') return false;
  try {
    const u = href.startsWith('http') ? new URL(href) : new URL(href, window.location.origin);
    const host = u.hostname.toLowerCase();
    if (host !== 'www.facebook.com' && host !== 'facebook.com' && host !== 'm.facebook.com') return false;
    if (href.includes('/l.php') || href.includes('l.facebook.com/l.php')) return false;
    if (u.pathname === '/' && u.searchParams.has('profile_id')) return true;
    if (u.pathname.includes('/profile.php') && u.searchParams.get('id')) return /^\d+$/.test(u.searchParams.get('id'));
    if (u.pathname.includes('/user/')) return true;
    if (u.pathname.includes('/friends/') && u.pathname.includes('/requests/') && u.searchParams.has('profile_id')) return true;
    const seg = u.pathname.replace(/^\/|\/$/g, '').split('/');
    if (seg.length === 1 && seg[0] && !seg[0].startsWith('pages') && !['friends', 'messages', 'groups', 'events', 'marketplace', 'login', 'logout', 'help'].includes(seg[0])) return true;
    return false;
  } catch (_) {
    return false;
  }
}

/** profile.php?id= only accepts numeric IDs. Username URLs must stay as facebook.com/username. Preserve group profile URLs (groups/XXX/user/YYY) so opened tab has same layout. */
function getProfileUrlForNavigation(profile) {
  if (!profile) return null;
  const id = profile.profileId;
  const url = profile.url && profile.url.includes('http') ? profile.url : (profile.url ? `https://www.facebook.com${profile.url.startsWith('/') ? profile.url : '/' + profile.url}` : null);
  if (url && url.includes('/groups/') && url.includes('/user/')) return url;
  if (id && /^\d+$/.test(String(id))) return `https://www.facebook.com/profile.php?id=${id}`;
  if (url) {
    const profileIdFromUrl = url.match(/[?&]profile_id=(\d+)/);
    if (profileIdFromUrl) return `https://www.facebook.com/profile.php?id=${profileIdFromUrl[1]}`;
    if (!url.includes('/friends/') && !url.includes('/messages/'))
      return url;
  }
  return url || null;
}
window.getProfileUrlForNavigation = getProfileUrlForNavigation;

// Open Messenger thread in a background tab; content script sends the message (no profile page, no UI)
function scheduleSendViaMessengerTab(profileId, profileName, trigger) {
  if (!profileId) return Promise.resolve(false);
  return safeSendMessage({
    type: 'OPEN_MESSENGER_AND_SEND',
    data: { userId: String(profileId), profileName: profileName || 'Friend', trigger: trigger || 'after_accept' }
  }).then(r => !!r?.success);
}
// Expose for profile-scanner and other scripts
window.scheduleSendViaMessengerTab = scheduleSendViaMessengerTab;

// Open Messenger thread in background tab, send message there, resolve when tab closes (for profile scanner – message input is on messages page)
function openMessengerAndSendMessageWait(userId, profileName, trigger, storedMessage) {
  if (!userId) return Promise.resolve(false);
  return safeSendMessage({
    type: 'OPEN_MESSENGER_AND_SEND_WAIT',
    data: {
      userId: String(userId),
      profileName: profileName || 'Friend',
      trigger: trigger || 'after_request',
      storedMessage: storedMessage && String(storedMessage).trim() ? String(storedMessage).trim() : null
    }
  }).then(r => !!r?.success);
}
window.openMessengerAndSendMessageWait = openMessengerAndSendMessageWait;

// Open profile page in background tab; content on that tab will find Message button, send, then close tab (no UI switch)
function openProfileAndSendMessage(profileUrl, profileId, profileName, trigger, storedMessage) {
  if (!profileUrl) return Promise.resolve(false);
  return safeSendMessage({
    type: 'OPEN_PROFILE_AND_SEND_MESSAGE',
    data: {
      profileUrl,
      profileId: profileId || null,
      profileName: profileName || 'Friend',
      trigger: trigger || 'after_request',
      storedMessage: storedMessage && String(storedMessage).trim() ? String(storedMessage).trim() : null
    }
  }).then(r => !!r?.success);
}
window.openProfileAndSendMessage = openProfileAndSendMessage;

// When we're on a Messenger tab that was opened to send a pending message, send it automatically then close tab
async function trySendPendingAutoMessage(threadIdFromUrl) {
  try {
    const { pendingAutoMessage } = await chrome.storage.local.get('pendingAutoMessage');
    if (!pendingAutoMessage || !pendingAutoMessage.userId) return;
    const wantedId = String(pendingAutoMessage.userId).trim();
    const threadId = String(threadIdFromUrl || '').trim();
    if (threadId !== wantedId && !threadId.includes(wantedId) && !wantedId.includes(threadId)) return;
    await chrome.storage.local.remove('pendingAutoMessage');
    const profileName = pendingAutoMessage.profileName || 'Friend';
    const trigger = pendingAutoMessage.trigger || 'after_accept';
    const storedMessage = pendingAutoMessage.storedMessage || null;
    console.log('[Friender] Messenger tab: sending to', profileName, 'trigger:', trigger, 'storedMessage:', storedMessage ? 'yes' : 'no');
    if (!window.facebookHandler) {
      console.warn('[Friender] facebookHandler not ready, retrying in 2s...');
      await new Promise(r => setTimeout(r, 2000));
    }
    if (!window.facebookHandler) {
      console.error('[Friender] facebookHandler not available for pending message');
      await safeSendMessage({ type: 'PROFILE_PAGE_DONE' });
      return;
    }
    const maxAttempts = 2;
    const delayMs = 2000;
    let sent = false;
    let sendError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        sent = await window.facebookHandler.sendMessage(null, storedMessage, trigger, profileName);
        if (sent) break;
      } catch (err) {
        sendError = err;
        const messagingNotAllowed = err?.message?.includes('Messaging not allowed for this account');
        if (messagingNotAllowed) {
          console.log('[Friender] Can\'t message this account (e.g. not friends yet) – skipping');
          if (window.showFrienderToast) {
            window.showFrienderToast('Message skipped', `Can't message ${profileName} until they accept your friend request.`, 'info');
          }
          await safeSendMessage({ type: 'PROFILE_PAGE_DONE' });
          return;
        }
        const isLimit = err?.message?.includes('Message request limit');
        const isInputNotFound = err?.message?.includes('Message input not found');
        if (isLimit || isInputNotFound) {
          const profileUrl = wantedId && /^\d+$/.test(String(wantedId)) ? `https://www.facebook.com/profile.php?id=${wantedId}` : null;
          await storePendingMessageRetry(profileUrl, wantedId, profileName, trigger, storedMessage);
        }
        if (isLimit) break; // stored for retry, don't throw
        if (attempt < maxAttempts && isInputNotFound) {
          console.log('[Friender] Message input not ready, retry', attempt + 1, 'of', maxAttempts, 'in', delayMs, 'ms...');
          await new Promise(r => setTimeout(r, delayMs));
        } else {
          throw err;
        }
      }
    }
    if (sent) {
      console.log('[Friender] ✅ Auto-message sent to', profileName);
      await safeSendMessage({ type: 'REMOVE_PENDING_RETRY', profileId: wantedId });
      if (window.showFrienderToast) {
        window.showFrienderToast('Message sent', `Message sent to ${profileName}.`, 'success');
      }
    } else {
      console.warn('[Friender] Auto-message send returned false for', profileName);
      // Limit/input-not-found already stored in catch above
    }
    await safeSendMessage({ type: 'PROFILE_PAGE_DONE' });
  } catch (e) {
    console.error('[Friender] Error sending pending auto-message:', e);
    try { await safeSendMessage({ type: 'PROFILE_PAGE_DONE' }); } catch (_) {}
  }
}

// On profile page: handle pendingIncomingMessage (navigated from friend requests page to send to new request)
async function trySendPendingIncomingMessageOnProfilePage() {
  try {
    const { pendingIncomingMessage } = await chrome.storage.local.get('pendingIncomingMessage');
    if (!pendingIncomingMessage || !pendingIncomingMessage.profileName) return;
    const urlId = (window.location.href.match(/[?&]id=(\d+)/) || [])[1];
    const wantId = pendingIncomingMessage.profileId ? String(pendingIncomingMessage.profileId) : null;
    if (wantId && urlId !== wantId) return;
    await chrome.storage.local.remove('pendingIncomingMessage');
    const profileName = pendingIncomingMessage.profileName || 'Friend';
    const trigger = pendingIncomingMessage.trigger || 'incoming_request';
    const msgBtn = document.querySelector('div[aria-label="Message"]') ||
      document.querySelector('div[aria-label*="Message"]') ||
      document.querySelector('a[href*="/messages/"]') ||
      Array.from(document.querySelectorAll('div[role="button"], span[role="button"], a')).find(b => {
        const t = (b.textContent || '').toLowerCase();
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        const h = (b.getAttribute('href') || '').toLowerCase();
        return t.includes('message') || a.includes('message') || h.includes('/messages/');
      });
    if (!msgBtn) return;
    msgBtn.click();
    await new Promise(r => setTimeout(r, 3000));
    if (window.facebookHandler) {
      await window.facebookHandler.sendMessage(window.location.href, null, trigger, profileName);
    }
  } catch (e) {
    console.error('[Friender] Error in trySendPendingIncomingMessageOnProfilePage:', e);
  }
}

// Normalize profile URL for comparison (origin + pathname, no trailing slash).
function normalizeProfileUrlForMatch(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = url.startsWith('http') ? new URL(url) : new URL(url, window.location.origin);
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    return u.origin + path;
  } catch (_) {
    return url;
  }
}

// On profile page (opened in background): send message then close tab; or store for accept later and close tab. Handles both after_request and after_accept.
async function trySendPendingProfilePageMessageAfterRequest() {
  let lastErr = null;
  try {
    const { pendingProfilePageMessage } = await chrome.storage.local.get('pendingProfilePageMessage');
    if (!pendingProfilePageMessage) {
      try { await safeSendMessage({ type: 'PROFILE_PAGE_DONE' }); } catch (_) {}
      return;
    }
    const trigger = pendingProfilePageMessage.trigger || 'after_request';
    const urlId = (window.location.href.match(/[?&]id=(\d+)/) || window.location.href.match(/\/user\/(\d+)/) || [])[1];
    const wantId = pendingProfilePageMessage.profileId ? String(pendingProfilePageMessage.profileId).trim() : null;
    // Only bail when we have numeric ids in both URL and payload and they differ (wrong profile).
    // Do NOT bail on storedNorm !== currentNorm: Facebook often redirects profile.php?id=123 to facebook.com/username, so we'd close the tab without sending.
    if (wantId && urlId && urlId !== wantId) {
      try { await safeSendMessage({ type: 'PROFILE_PAGE_DONE' }); } catch (_) {}
      return;
    }
    const profileName = pendingProfilePageMessage.profileName || 'Friend';
    const storedMessage = pendingProfilePageMessage.storedMessage || null;
    const profileUrl = window.location.href;
    await chrome.storage.local.remove('pendingProfilePageMessage');
    console.log('[Friender] Profile tab: pending message for', profileName, '– storedMessage:', storedMessage ? 'yes' : 'no');
    const findMessageBtn = () => {
      const exact = document.querySelector('div[aria-label="Message"]');
      if (exact) return exact;
      const link = document.querySelector('a[href*="/messages/"]');
      if (link) return link;
      const withMessage = document.querySelector('div[aria-label*="Message"]');
      if (withMessage) {
        const label = (withMessage.getAttribute('aria-label') || '').toLowerCase();
        if (!label.includes('share')) return withMessage;
      }
      return Array.from(document.querySelectorAll('div[role="button"], span[role="button"], a')).find(b => {
        const t = (b.textContent || '').toLowerCase();
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        const h = (b.getAttribute('href') || '').toLowerCase();
        return (t.includes('message') || a.includes('message') || h.includes('/messages/')) &&
          !t.includes('add friend') && !a.includes('share');
      });
    };
    let msgBtn = findMessageBtn();
    for (let w = 0; w < 8 && !msgBtn; w++) {
      console.log('[Friender] Profile tab: Message button not yet visible, waiting 2s (background tab may load slow)...');
      await new Promise(r => setTimeout(r, 2000));
      msgBtn = findMessageBtn();
    }
    let sent = false;
    if (!msgBtn) {
      console.warn('[Friender] Profile tab: Message button not found on page after wait');
    } else if (!window.facebookHandler) {
      console.warn('[Friender] Profile tab: facebookHandler not available');
    } else {
      // Do not focus this tab – user stays on their page; profile tab runs in pinned background
      msgBtn.click();
      console.log('[Friender] Profile tab: Message button clicked (background), waiting for chat panel (14s)...');
      await new Promise(r => setTimeout(r, 14000));
      // Resolve template in profile tab so we have message text even when group page passed null (e.g. segment had no text yet)
      let messageToSend = storedMessage;
      if (!messageToSend && window.facebookHandler) {
        messageToSend = await window.facebookHandler.getMessageTemplate(trigger, profileName);
        console.log('[Friender] Profile tab: template resolved for trigger', trigger, '–', messageToSend ? 'yes' : 'no (add message text in Segments tab for your selected segment)');
      }
      const inputNotFoundMsg = 'Message input not found';
      const isInputNotFound = (msg) => msg?.includes(inputNotFoundMsg) || msg?.includes('Element not found');
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          sent = await window.facebookHandler.sendMessage(profileUrl, messageToSend, trigger, profileName);
          console.log('[Friender] Profile tab: sendMessage result:', sent);
          break;
        } catch (err) {
          lastErr = err;
          console.warn('[Friender] sendMessage failed on profile page (attempt ' + attempt + '):', err?.message);
          if (attempt < 2 && isInputNotFound(err?.message)) {
            const waitSec = 8;
            console.log('[Friender] Profile tab: input not found – waiting ' + waitSec + 's and retrying (2 attempts then move to next ID)...');
            await new Promise(r => setTimeout(r, waitSec * 1000));
          } else {
            break;
          }
        }
      }
    }
    if (sent) {
      // Remove from pending message retry list so we don't send to same profile again (fixes O Maharajan loop)
      const idToRemove = urlId || wantId || null;
      if (idToRemove) await safeSendMessage({ type: 'REMOVE_PENDING_RETRY', profileId: idToRemove });
      await safeSendMessage({ type: 'PROFILE_PAGE_DONE' });
    } else {
      const errMsg = (typeof lastErr?.message === 'string' ? lastErr.message : '') || '';
      if (errMsg.includes('Message request limit') || errMsg.includes('Message input not found')) {
        const msgToStore = storedMessage ?? (window.facebookHandler ? await window.facebookHandler.getMessageTemplate(trigger, profileName) : null);
        await storePendingMessageRetry(profileUrl, urlId || wantId || null, profileName, trigger, msgToStore);
      }
      if (trigger === 'after_request') {
        const storedMsg = window.facebookHandler ? await window.facebookHandler.getMessageTemplate('after_request', profileName) : null;
        await storePendingForAcceptLater(profileUrl, profileName, urlId || wantId || null, storedMsg);
      }
      await safeSendMessage({ type: 'PROFILE_PAGE_DONE' });
    }
  } catch (e) {
    console.error('[Friender] Error in trySendPendingProfilePageMessageAfterRequest:', e);
    try { await safeSendMessage({ type: 'PROFILE_PAGE_DONE' }); } catch (_) {}
  }
}

// Store message for sending when they accept friend request later (same message from template sent on accept).
async function storePendingForAcceptLater(profileUrl, profileName, profileId, storedMessage = null) {
  const result = await chrome.storage.local.get(['pendingFriendRequests']);
  const pendingRequests = result.pendingFriendRequests || [];
  const exists = pendingRequests.some(req =>
    (req.profileId && req.profileId === profileId) ||
    (req.url && req.url === profileUrl) ||
    (req.name && req.name.toLowerCase() === (profileName || '').toLowerCase())
  );
  if (!exists && (profileUrl || profileId || profileName)) {
    pendingRequests.push({
      url: profileUrl || (profileId && /^\d+$/.test(String(profileId)) ? `https://www.facebook.com/profile.php?id=${profileId}` : null),
      name: profileName || 'Friend',
      profileId: profileId || null,
      messageSent: false,
      storedMessage: storedMessage && String(storedMessage).trim() ? storedMessage.trim() : null
    });
    await chrome.storage.local.set({ pendingFriendRequests: pendingRequests });
  }
}

// Store profile + message when send failed (e.g. message request limit) – will retry when on suggestions/group page
const PENDING_MESSAGE_RETRY_KEY = 'pendingMessageRetry';
async function storePendingMessageRetry(profileUrl, profileId, profileName, trigger, storedMessage = null) {
  const result = await chrome.storage.local.get([PENDING_MESSAGE_RETRY_KEY]);
  const list = result[PENDING_MESSAGE_RETRY_KEY] || [];
  const exists = list.some(
    (e) => (e.profileId && e.profileId === profileId) || (e.url === profileUrl) || (e.name && profileName && e.name.toLowerCase() === profileName.toLowerCase())
  );
  if (!exists && (profileUrl || profileId || profileName)) {
    list.push({
      url: profileUrl || (profileId && /^\d+$/.test(String(profileId)) ? `https://www.facebook.com/profile.php?id=${profileId}` : null),
      profileId: profileId || null,
      name: profileName || 'Friend',
      trigger: trigger || 'after_accept',
      storedMessage: storedMessage && String(storedMessage).trim() ? storedMessage.trim() : null,
      addedAt: Date.now()
    });
    await chrome.storage.local.set({ [PENDING_MESSAGE_RETRY_KEY]: list });
    console.log('[Friender] Stored for retry when available:', profileName);
  }
}
window.storePendingMessageRetry = storePendingMessageRetry;

const PENDING_RETRY_THROTTLE_KEY = 'lastPendingRetryRunAt';
const PENDING_RETRY_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes – don't retry same profile every time scan restarts

// Try sending one pending retry (call when on suggestions/group page); throttled so we don't open same profile repeatedly
async function trySendPendingMessageRetries() {
  const result = await chrome.storage.local.get([PENDING_MESSAGE_RETRY_KEY, PENDING_RETRY_THROTTLE_KEY]);
  const list = result[PENDING_MESSAGE_RETRY_KEY] || [];
  if (list.length === 0) return;
  const lastRun = result[PENDING_RETRY_THROTTLE_KEY] || 0;
  if (Date.now() - lastRun < PENDING_RETRY_THROTTLE_MS) {
    console.log('[Friender] Pending message retry skipped – ran recently, will retry after', Math.ceil((PENDING_RETRY_THROTTLE_MS - (Date.now() - lastRun)) / 60000), 'min');
    return;
  }
  await chrome.storage.local.set({ [PENDING_RETRY_THROTTLE_KEY]: Date.now() });
  const entry = list[0];
  const profileId = entry.profileId;
  const profileUrl = entry.url;
  const profileName = entry.name || 'Friend';
  const trigger = entry.trigger || 'after_accept';
  const storedMessage = entry.storedMessage || null;
  const hasNumericId = profileId && /^\d+$/.test(String(profileId));
  if (hasNumericId && typeof window.openMessengerAndSendMessageWait === 'function') {
    console.log('[Friender] Retrying stored send to', profileName, 'via Messenger...');
    await window.openMessengerAndSendMessageWait(profileId, profileName, trigger, storedMessage);
  } else if (profileUrl && typeof window.openProfileAndSendMessage === 'function') {
    console.log('[Friender] Retrying stored send to', profileName, 'via profile...');
    await window.openProfileAndSendMessage(profileUrl, profileId, profileName, trigger, storedMessage);
  }
}
window.trySendPendingMessageRetries = trySendPendingMessageRetries;

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

async function initialize() {
  console.log('[Friender] ==========================================');
  console.log('[Friender] 🎯 Content script loaded and initializing');
  console.log('[Friender] Current URL:', window.location.href);
  console.log('[Friender] Profile scanner available:', !!window.profileScanner);
  console.log('[Friender] Facebook handler available:', !!window.facebookHandler);
  console.log('[Friender] ==========================================');

  // Wait a bit for other scripts to load
  await delay(1000);

  // Check if we're on Facebook
  if (!window.location.href.includes('facebook.com')) {
    console.log('[Friender] ⚠️ Not on Facebook, skipping initialization');
    return;
  }

  // If we're on a Messenger thread page opened by the extension, send the pending message automatically (no user action)
  const messengerMatch = window.location.pathname.match(/\/messages\/t\/([^/?]+)/);
  if (messengerMatch) {
    const threadId = messengerMatch[1];
    // Give the messages page time to render (input can appear after 3–5s)
    setTimeout(() => trySendPendingAutoMessage(threadId), 5000);
  }

  // If we're on a profile page: handle incoming-request flow (same-tab nav) and after_request flow (opened tab)
  // Support profile.php?id=, /user/123, and username URLs (e.g. facebook.com/username) – Facebook often redirects to username
  const pathname = window.location.pathname || '';
  const isProfilePage = (pathname.includes('profile.php') && window.location.search.includes('id=')) ||
    (pathname.includes('/user/') && /\/user\/(\d+)/.test(pathname)) ||
    (/^\/[^\/]+$/.test(pathname) && !pathname.startsWith('/groups') && !pathname.startsWith('/friends') && !pathname.startsWith('/messages') && !pathname.startsWith('/watch') && !pathname.startsWith('/marketplace'));
  if (isProfilePage) {
    // Longer delay for profile pages opened in background (pinned) – DOM and Message button need time to render
    setTimeout(() => {
      trySendPendingIncomingMessageOnProfilePage();
      trySendPendingProfilePageMessageAfterRequest();
    }, 7000);
  }

  // Initialize automation if settings indicate it should run
  try {
    const response = await safeSendMessage({ type: 'GET_STATE' });
    if (!response) {
      console.warn('[Friender] Could not get state, extension may have been reloaded');
      return;
    }
    const state = response?.state || {};

    console.log('[Friender] Current automation state:', state.status);

    if (state.status === 'running') {
      console.log('[Friender] Automation should be running – page monitoring will start scanner on this page.');
    }

    // Set up page monitoring (on scan pages this will start the scanner when state is 'running', including after refresh)
    console.log('[Friender] Setting up page monitoring...');
    setupPageMonitoring();

    // Start monitoring for "friend request accepted" notifications (tool sends stored message in background)
    startAcceptedRequestMonitoring();
    setupAcceptedNotificationObserver();

    // Also check for pending requests on page load/refresh (in case user refreshes after friend requests were sent)
    // This works on ANY page type (groups_people, friend_suggestions, or any other page)
    console.log('[Friender] Checking for pending friend requests on page load (works on all page types)...');
    setTimeout(() => {
      const currentUrl = window.location.href;
      const bodyText = (document.body && document.body.innerText) || '';
      const hasAcceptedText = bodyText.includes('accepted your friend request');
      if (currentUrl.includes('notif_t=friend_confirmed') || currentUrl.includes('friend_confirmed') || hasAcceptedText) {
        console.log('[Friender] Friend confirmation / accepted notifications on page – scanning and sending stored messages');
        scanPageForAcceptedNotificationsAndSend();
        checkFriendConfirmationNotification();
      }
      if (currentUrl.includes('/friends/requests') || currentUrl.includes('/friends/requests/')) {
        console.log('[Friender] ✅ Friend requests page detected on page load - checking for all request actions...');
        checkFriendRequestsPageForAllActions();
      } else if (currentUrl.includes('/profile.php') || currentUrl.includes('/user/')) {
        checkIfCurrentProfileIsPending();
      }
    }, 2000);

  } catch (error) {
    console.error('[Friender] ❌ Error initializing:', error);
  }
}

// Monitor page for friend request opportunities
function setupPageMonitoring() {
  // Only monitor if automation is enabled. Use timeout (not interval) for next run; store ID so we can cancel on Stop.
  let monitoringTimeoutId = null;

  const startMonitoring = async () => {
    if (monitoringTimeoutId !== null) return;

    const monitor = async () => {
      monitoringTimeoutId = null; // consumed this run
      try {
        const response = await safeSendMessage({ type: 'GET_STATE' });
        if (!response) return;
        const state = response?.state || {};
        const settings = response?.settings || {};
        const popupSettings = await chrome.storage.local.get(['settings']);
        const currentSettings = popupSettings.settings || {};

        // Only monitor if automation is running
        if (state.status !== 'running') {
          // Remove start toast if automation stopped
          const startToast = document.getElementById('friender-start-toast');
          if (startToast) {
            startToast.remove();
          }
          return;
        }

        // Check for accepted friend requests and send messages
        await checkAndSendMessagesForAcceptedRequests();

        // Only run the profile scanner on group members or suggestions pages – never on a profile page (e.g. tab opened just to send message)
        const url = window.location.href;
        const isScanPage = (url.includes('/groups/') && (url.includes('/members') || url.includes('/people'))) ||
          url.includes('/friends') || url.includes('/find-friends') || url.includes('/friends/suggestions');
        if (!isScanPage) {
          const interval = getLookupInterval(currentSettings);
          monitoringTimeoutId = setTimeout(monitor, interval);
          return;
        }

        // Check friend request automation (scan pages only)
        if (currentSettings && window.facebookHandler) {
          // Use profile scanner for one-by-one processing
          if (window.profileScanner && !window.profileScanner.isScanning) {
            // Re-check state right before starting (avoids race: Stop clicked while this monitor() was in flight)
            const recheck = await safeSendMessage({ type: 'GET_STATE' });
            if (recheck?.state?.status !== 'running') {
              return;
            }
            // Show "Tool started" toast when starting scanner (e.g. after page refresh with state still running)
            showStartNotification();
            console.log('[Friender] Initializing profile scanner with settings:', currentSettings);
            await window.profileScanner.initialize(currentSettings);

            // Only start scan if automation wasn't stopped while we were initializing
            const beforeStart = await safeSendMessage({ type: 'GET_STATE' });
            if (beforeStart?.state?.status !== 'running') return;

            window.profileScanner.scanProfiles().catch(error => {
              console.error('[Friender] Profile scanning error:', error);
            });
          } else {
            if (!window.profileScanner) {
              console.warn('[Friender] ⚠️ Profile scanner not available!');
            } else if (window.profileScanner.isScanning) {
              console.log('[Friender] Profile scanner is already scanning...');
            }
          }
        } else {
          if (!currentSettings) {
            console.warn('[Friender] ⚠️ No settings found!');
          }
          if (!window.facebookHandler) {
            console.warn('[Friender] ⚠️ Facebook handler not available!');
          }
        }

        // Schedule next check based on lookup interval (store ID so Stop can cancel it)
        const interval = getLookupInterval(currentSettings);
        monitoringTimeoutId = setTimeout(monitor, interval);

      } catch (error) {
        console.error('[Friender] Monitoring error:', error);
        // Retry after delay
        monitoringTimeoutId = setTimeout(monitor, 5000);
      }
    };

    // Start monitoring
    monitor();
  };

  const stopMonitoring = () => {
    if (monitoringTimeoutId !== null) {
      clearTimeout(monitoringTimeoutId);
      monitoringTimeoutId = null;
    }
    // Also stop accepted request monitoring
    stopAcceptedRequestMonitoring();
  };

  // Start monitoring
  startMonitoring();
  
  // Start monitoring for accepted friend requests (only once)
  startAcceptedRequestMonitoring();

  // Listen for status changes and commands from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Friender] 📨 Message received:', message.type);
    
    if (message.type === 'START_AUTOMATION') {
      console.log('[Friender] 🚀 START_AUTOMATION received!');
      
      // Handle async operations – always call sendResponse in finally so popup gets a response
      (async () => {
        let responded = false;
        const done = (success) => {
          if (responded) return;
          responded = true;
          try { sendResponse({ success: !!success }); } catch (_) {}
        };
        try {
          let settings = message.settings;
          if (!settings) {
            const stored = await chrome.storage.local.get('settings');
            settings = stored.settings;
          }
          if (!settings) {
            console.error('[Friender] ❌ No settings available');
            if (window.showFrienderToast) window.showFrienderToast('Settings missing', 'Save settings in the extension popup first.', 'error');
            done(false);
            return;
          }

          // Save settings
          await chrome.storage.local.set({ settings });

          // Only run scanner on group people or friend suggestions page – human just goes there and clicks Run
          const url = window.location.href;
          const isGroupPeople = url.includes('/groups/') && (url.includes('/members') || url.includes('/people'));
          const isSuggestions = url.includes('/friends') || url.includes('/find-friends') || url.includes('/friends/suggestions');
          const isProfilePage = url.includes('/profile.php') || (/facebook\.com\/[^\/\?]+(\?|$)/.test(url.replace(/^https?:\/\//, '')));
          if (!isGroupPeople && !isSuggestions) {
            console.warn('[Friender] Not on a group members or suggestions page. Scanner runs only there.');
            if (window.showFrienderToast) {
              const hint = isProfilePage
                ? "You're on a profile page. Open a group's Members list or Friends suggestions, then click Run."
                : 'Go to a group Members list or Friends suggestions list, then click Run.';
              window.showFrienderToast('Wrong page', hint, 'warning');
            }
            done(false);
            return;
          }

          if (!window.profileScanner) {
            console.error('[Friender] ❌ Profile scanner not found');
            if (window.showFrienderToast) window.showFrienderToast('Error', 'Refresh the page and try again.', 'error');
            done(false);
            return;
          }

          // Show "Tool started" toast immediately so user sees it right away (before any slow init)
          showStartNotification();

          console.log('[Friender] Profile scanner found, initializing...');
          await window.profileScanner.initialize(settings);
          console.log('[Friender] Starting automatic scan → filter → friend request → message...');
          window.profileScanner.scanProfiles().catch(error => {
            console.error('[Friender] Profile scanning error:', error);
          });

          await safeSendMessage({
            type: 'UPDATE_STATE',
            data: { status: 'running', sessionStartTime: Date.now() }
          });

          startMonitoring();
          done(true);
        } catch (err) {
          console.error('[Friender] START_AUTOMATION error:', err);
          if (window.showFrienderToast) window.showFrienderToast('Start failed', (err && err.message) || 'Something went wrong.', 'error');
          done(false);
        }
      })();
      return true;
    } else if (message.type === 'RESUME_AUTOMATION') {
      if (window.automationEngine) {
        window.automationEngine.resume();
      }
      startMonitoring();
      sendResponse({ success: true });
      return true;
    } else if (message.type === 'STOP_AUTOMATION' || message.type === 'PAUSE_AUTOMATION') {
      // Cancel monitoring first so no scheduled run can restart the scanner
      stopMonitoring();
      if (message.type === 'STOP_AUTOMATION' && window.profileScanner) {
        window.profileScanner.isScanning = false;
      }
      (async () => {
        if (message.type === 'STOP_AUTOMATION') {
          // Persist stopped in background so popup GET_STATE and polls see 'stopped'
          try {
            await safeSendMessage({
              type: 'UPDATE_STATE',
              data: { status: 'stopped', userRequestedStop: true }
            });
          } catch (e) { /* ignore */ }
          if (window.automationEngine) await window.automationEngine.stop();
        } else {
          if (window.automationEngine) window.automationEngine.pause();
        }

        // Remove start toast if exists
        const startToast = document.getElementById('friender-start-toast');
        if (startToast) startToast.remove();

        sendResponse({ success: true });
      })();
      return true;
    } else if (message.type === 'DELETE_PENDING_REQUESTS') {
      if (window.facebookHandler) {
        // Stop automation so it doesn't keep opening profile tabs while we're on the requests page
        if (window.profileScanner) {
          window.profileScanner.isScanning = false;
        }
        chrome.runtime.sendMessage({ type: 'STOP_AUTOMATION' }).catch(() => {});
        window.showFrienderToast('Deleting...', 'Cleaning up pending friend requests.', 'info');
        window.facebookHandler.cancelAllPendingRequests()
          .then(count => {
            window.showFrienderToast('Done!', `Cancelled ${count} pending requests.`, 'success');
            // When delete completes, clear pending list and counter so tool stops – no more visiting profiles
            return new Promise(resolve => {
              chrome.storage.local.set({ pendingFriendRequests: [], pendingRequestCount: 0 }, () => resolve(count));
            });
          })
          .then(count => {
            sendResponse({ success: true, count });
          })
          .catch(err => {
            window.showFrienderToast('Error', 'Failed to delete pending requests.', 'error');
            sendResponse({ success: false, error: err.message });
          });
      } else {
        sendResponse({ success: false, error: 'Facebook handler not found' });
      }
      return true;
    } else if (message.type === 'CHECK_FRIEND_STATUS') {
      // Check if current profile is a friend (request was accepted)
      const isFriend = checkFriendStatusOnPage();
      sendResponse({ isFriend });
      return true;
    } else if (message.type === 'CHECK_PENDING_AND_SEND') {
      // Background worker detected this profile is pending - check if accepted and send message
      checkPendingProfileAndSendMessage()
        .then(result => sendResponse(result))
        .catch(error => {
          console.error('[Friender] Error checking pending profile:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
  });
  
  // Monitor current page - check if it's a profile page or friend confirmation notification
  // This works on ANY page type (groups_people, friend_suggestions, or any other page)
  const currentUrl = window.location.href;
  
  // Check if it's a friend confirmation notification page
  // Friend confirmations can happen from any page - groups, suggestions, or anywhere on Facebook
  if (currentUrl.includes('notif_t=friend_confirmed') || currentUrl.includes('friend_confirmed')) {
    console.log('[Friender] ✅ Friend confirmation notification detected (works on all page types), checking for pending request...');
    // Wait a bit for page to load, then check
    setTimeout(() => {
      checkFriendConfirmationNotification();
    }, 2000);
  }
  // Check if it's the friend requests page (where you accept/decline incoming requests)
  else if (currentUrl.includes('/friends/requests') || currentUrl.includes('/friends/requests/')) {
    console.log('[Friender] ✅ Friend requests page detected - monitoring for new, accepted, and declined requests...');
    // Monitor for all request types on this page
    setTimeout(() => {
      checkFriendRequestsPageForAllActions();
    }, 2000);
    
    // Also set up MutationObserver to watch for dynamic changes
    setupFriendRequestsPageObserver();
  }
  // Check if it's a regular profile page
  else if (currentUrl.includes('/profile.php') || currentUrl.includes('/user/')) {
    checkIfCurrentProfileIsPending();
  }
}

// Check if current page shows friend status (request was accepted)
function checkFriendStatusOnPage() {
  try {
    // Check for "Friends" indicator or "Message" button (not "Add Friend")
    const friendsIndicator = document.querySelector('div[aria-label*="Friends"]') ||
      Array.from(document.querySelectorAll('span')).find(s => (s.textContent || '').trim() === 'Friends');
    
    const addFriendButton = document.querySelector('div[aria-label*="Add Friend"]') ||
                            document.querySelector('div[aria-label*="Add friend"]');
    
    const messageButton = document.querySelector('div[aria-label="Message"]') ||
                         document.querySelector('a[href*="/messages/"]');
    
    // If we see "Friends" indicator or Message button (but no Add Friend), they're a friend
    if (friendsIndicator || (messageButton && !addFriendButton)) {
      return true;
    }
    
    // Check button text
    const buttons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'));
    const hasFriendText = buttons.some(b => {
      const text = b.textContent?.toLowerCase() || '';
      return text.includes('friends') && !text.includes('add');
    });
    
    return hasFriendText;
  } catch (error) {
    // DOMException can occur with invalid selectors or detached nodes; treat as "not friend"
    const msg = error && (error.message || String(error));
    if (msg && !msg.includes('DOMException')) console.warn('[Friender] Error checking friend status:', msg);
    return false;
  }
}

// Check filters before processing
async function checkFilters(settings) {
  // Check mutual friends filter
  if (settings.mutualFriendsCount > 0) {
    // This would need to be implemented to check mutual friends count
    // For now, we'll skip this check
  }

  // Check gender filter (would need to extract from profile)
  if (settings.useGenderFilter && settings.gender) {
    // This would need to be implemented to check profile gender
    // For now, we'll skip this check
  }

  // Check country filter (would need to extract from profile)
  if (settings.useCountryFilter && settings.countryFilter) {
    // This would need to be implemented to check profile location
    // For now, we'll skip this check
  }

  return true; // Allow processing for now
}

// Get lookup interval delay
function getLookupInterval(settings) {
  const interval = settings.lookupInterval || 'auto';

  if (interval === 'auto') {
    // Random between 30-60 seconds
    return Math.floor(Math.random() * (60000 - 30000 + 1)) + 30000;
  }

  return parseInt(interval) * 1000; // Convert to milliseconds
}

// Utility delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Show notification toast that automation has started
function showStartNotification() {
  // Clear any existing toast first
  const existing = document.getElementById('friender-start-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'friender-start-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 16px;
    left: 16px;
    background: #ffdb99;
    color: #333;
    padding: 10px 14px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.15);
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: inherit;
    border-left: 4px solid #ffa500;
    max-width: 320px;
    animation: slideInFriender 0.5s ease-out;
  `;

  toast.innerHTML = `
    <div style="width: 36px; height: 36px; background: #00d4ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px;">🚀</div>
    <div>
      <div style="font-weight: bold; font-size: 13px; margin-bottom: 2px;">Friender has Started & Running</div>
      <div style="font-size: 11px; color: #555;">Your script has been started. Do not refresh the page.</div>
    </div>
    <div id="close-friender-toast" style="margin-left: auto; cursor: pointer; font-size: 16px; color: #777;">×</div>
  `;

  // Add animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInFriender {
      from { transform: translateX(-100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);

  document.getElementById('close-friender-toast').onclick = () => toast.remove();
}

// Global Toast function – compact size; "limit reached" message shown in 2 lines
window.showFrienderToast = function (title, message, type = 'info') {
  const borderColor = type === 'success' ? '#4CAF50' : type === 'error' ? '#d32f2f' : type === 'warning' ? '#f57c00' : '#2196F3';
  if (typeof message === 'string' && message.includes('limit reached')) {
    message = message.replace(/\blimit reached\b/gi, 'limit<br>reached');
  }
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    background: white;
    padding: 8px 12px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    z-index: 100000;
    border-left: 3px solid ${borderColor};
    font-family: inherit;
    font-size: 12px;
    line-height: 1.35;
    max-width: 280px;
  `;
  toast.innerHTML = `<strong style="font-size: 12px;">${title}</strong><div style="font-size: 11px; margin-top: 2px;">${message}</div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
};

// Handle navigation (SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    
    // Check if URL changed to friend confirmation page
    if (url.includes('notif_t=friend_confirmed') || url.includes('friend_confirmed')) {
      console.log('[Friender] Navigation detected: Friend confirmation page, checking for pending request...');
      setTimeout(() => {
        checkFriendConfirmationNotification();
      }, 2000);
    }
    // Check if URL changed to profile page
    else if (url.includes('/profile.php') || url.includes('/user/')) {
      setTimeout(() => {
        checkIfCurrentProfileIsPending();
      }, 1000);
    }
    // Page changed, re-initialize if needed
    setTimeout(initialize, 1000);
    
    // Check if navigating to friend confirmation notification page
    // This works regardless of which page type you're on (groups, suggestions, etc.)
    if (url.includes('notif_t=friend_confirmed') || url.includes('friend_confirmed')) {
      console.log('[Friender] ✅ Navigation detected: Friend confirmation page (works on all page types), checking for pending request...');
      setTimeout(() => {
        checkFriendConfirmationNotification();
      }, 2000);
    }
    // Check if navigating to friend requests page (where you accept/decline incoming requests)
    else if (url.includes('/friends/requests') || url.includes('/friends/requests/')) {
      console.log('[Friender] ✅ Navigation detected: Friend requests page - monitoring for all request actions...');
      setTimeout(() => {
        checkFriendRequestsPageForAllActions();
      }, 2000);
    }
    // If navigating to a profile page, check if it's pending
    else if (url.includes('/profile.php') || url.includes('/user/')) {
      setTimeout(() => checkIfCurrentProfileIsPending(), 2000);
    }
  }
}).observe(document, { subtree: true, childList: true });

// Monitor for accepted friend requests - delegate to background worker
// Background worker will handle checking and sending messages without opening tabs
async function checkAndSendMessagesForAcceptedRequests() {
  try {
    if (!isExtensionContextValid()) {
      return;
    }
    
    // Check if messaging is activated before checking
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {};
    
    if (!settings?.messaging?.enabled) {
      // Messaging not activated, skip checking
      return;
    }
    
    // Simply notify background worker to check pending requests
    // Background worker will handle the checking and messaging
    await safeSendMessage({
      type: 'CHECK_PENDING_REQUESTS'
    });
  } catch (error) {
    // Silently handle extension context invalidation (expected when extension reloads)
    if (!error.message?.includes('Extension context invalidated') &&
        !error.message?.includes('message port closed') &&
        !error.message?.includes('Could not establish connection')) {
      console.error('[Friender] Error checking accepted requests:', error);
    }
  }
}

// Global variable to store the accepted request monitoring interval
let acceptedRequestMonitoringInterval = null;
let acceptedNotificationObserverActive = false;
let acceptedNotificationScanTimeout = null;

// When new "accepted your friend request" appears in the page (e.g. notifications dropdown), scan and send stored message
function setupAcceptedNotificationObserver() {
  if (acceptedNotificationObserverActive || !document.body) return;
  acceptedNotificationObserverActive = true;
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const text = (node.innerText || node.textContent || '').toLowerCase();
          const inChild = node.querySelector && node.querySelector('*') && Array.from(node.querySelectorAll('*')).some(el => (el.innerText || el.textContent || '').toLowerCase().includes('accepted your friend request'));
          if (text.includes('accepted your friend request') || inChild) {
            if (acceptedNotificationScanTimeout) clearTimeout(acceptedNotificationScanTimeout);
            acceptedNotificationScanTimeout = setTimeout(() => {
              acceptedNotificationScanTimeout = null;
              scanPageForAcceptedNotificationsAndSend();
            }, 800);
            break;
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  console.log('[Friender] Monitoring for "friend request accepted" notifications – tool will send stored message in background');
}

// Start monitoring for accepted friend requests
function startAcceptedRequestMonitoring() {
  // Don't start if already running
  if (acceptedRequestMonitoringInterval !== null) {
    return;
  }
  
  // Check every 30 seconds - background worker handles the actual checking
  acceptedRequestMonitoringInterval = setInterval(async () => {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      // Extension was reloaded - this is expected, just stop monitoring silently
      if (acceptedRequestMonitoringInterval) {
        clearInterval(acceptedRequestMonitoringInterval);
        acceptedRequestMonitoringInterval = null;
      }
      return;
    }
    
    try {
      const response = await safeSendMessage({ type: 'GET_STATE' });
      if (!response) {
        // Context invalidated or no response - stop monitoring
        if (acceptedRequestMonitoringInterval) {
          clearInterval(acceptedRequestMonitoringInterval);
          acceptedRequestMonitoringInterval = null;
        }
        return;
      }
      const state = response?.state || {};
      
      const settingsResult = await chrome.storage.local.get(['settings']);
      const currentSettings = settingsResult.settings || {};
      const currentUrl = window.location.href;

      // When messaging is enabled: monitor for "friend request accepted" and send stored message (tool opens profile in background)
      if (currentSettings?.messaging?.enabled) {
        if (currentUrl.includes('/friends/requests') || currentUrl.includes('/friends/requests/')) {
          await checkFriendRequestsPageForAllActions();
        }
        const bodyText = (document.body && document.body.innerText) || '';
        if (bodyText.includes('accepted your friend request')) {
          await scanPageForAcceptedNotificationsAndSend();
        }
      }
      if (state.status === 'running') {
        await checkAndSendMessagesForAcceptedRequests();
      }
    } catch (error) {
      if (error.message?.includes('Extension context invalidated') || 
          error.message?.includes('message port closed') ||
          error.message?.includes('Could not establish connection')) {
        // Extension was reloaded - this is expected, just stop monitoring silently
        if (acceptedRequestMonitoringInterval) {
          clearInterval(acceptedRequestMonitoringInterval);
          acceptedRequestMonitoringInterval = null;
        }
      } else {
        console.error('[Friender] Error in monitoring:', error);
      }
    }
  }, 30000); // Check every 30 seconds
}

// Stop monitoring for accepted friend requests
function stopAcceptedRequestMonitoring() {
  if (acceptedRequestMonitoringInterval !== null) {
    clearInterval(acceptedRequestMonitoringInterval);
    acceptedRequestMonitoringInterval = null;
  }
}

// Check if current profile page is in pending list
async function checkIfCurrentProfileIsPending() {
  try {
    const profileUrl = window.location.href.split('?')[0]; // Remove query params
    
    // Notify background worker
    safeSendMessage({
      type: 'PROFILE_VISITED',
      profileUrl: profileUrl
    }).then(async (response) => {
      if (!response || !response?.shouldCheck) {
        return; // Not pending or error
      }
      
      // This profile is pending - check if accepted and send message
      await checkPendingProfileAndSendMessage();
    }).catch(error => {
      if (!error.message?.includes('Extension context invalidated')) {
        console.error('[Friender] Error checking if profile is pending:', error);
      }
    });
  } catch (error) {
    console.error('[Friender] Error checking if profile is pending:', error);
  }
}

// Extract profile ID from page DOM when "accepted your friend request" is visible (e.g. notification panel or permalink)
function extractProfileIdFromAcceptedNotificationInDOM() {
  const bodyText = (document.body && document.body.innerText) || '';
  if (!bodyText.includes('accepted your friend request')) return null;
  const links = document.querySelectorAll('a[href*="profile.php?id="], a[href*="/user/"]');
  for (const a of links) {
    const href = a.href || a.getAttribute('href') || '';
    const idMatch = href.match(/profile\.php\?id=(\d+)/) || href.match(/\/user\/(\d+)/);
    if (idMatch && idMatch[1]) return idMatch[1];
  }
  return null;
}

// Find all "accepted your friend request" notifications on the page and return { profileId, profileName, profileUrl } for each (unique by id or url)
function extractAllAcceptedNotificationsFromDOM() {
  const results = [];
  const seenKeys = new Set();
  const walk = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const links = root.querySelectorAll('a[href*="profile.php?id="], a[href*="/user/"], a[href*="facebook.com/"]');
    for (const a of links) {
      const href = (a.href || a.getAttribute('href') || '').trim();
      if (!href || !href.includes('facebook.com')) continue;
      let profileId = null;
      let profileUrl = null;
      const idMatch = href.match(/profile\.php\?id=(\d+)/) || href.match(/\/user\/(\d+)/);
      if (idMatch && idMatch[1]) {
        profileId = idMatch[1];
        profileUrl = `https://www.facebook.com/profile.php?id=${profileId}`;
      } else {
        const userMatch = href.match(/facebook\.com\/([^\/\?]+)(\?|$)/);
        if (userMatch && userMatch[1] && !/^(profile|friends|notifications|messages|watch|marketplace)$/.test(userMatch[1])) {
          profileUrl = href.split('?')[0];
        }
      }
      if (!profileUrl && !profileId) continue;
      const key = (profileId || profileUrl || '').toString();
      if (seenKeys.has(key)) continue;
      const container = a.closest('[role="article"], [role="listitem"], [data-pagelet], div[class]') || a.parentElement;
      const containerText = (container && (container.innerText || container.textContent || '')) || '';
      if (!containerText.includes('accepted your friend request')) continue;
      seenKeys.add(key);
      const nameMatch = containerText.match(/^([^·\n]+?)\s+accepted your friend request/i) ||
        containerText.match(/([^\n]+)\s+accepted your friend request/i);
      const profileName = stripTimestampFromName((nameMatch && nameMatch[1].trim()) || 'Friend');
      results.push({ profileId, profileName, profileUrl: profileUrl || (profileId ? `https://www.facebook.com/profile.php?id=${profileId}` : null) });
    }
  };
  walk(document.body);
  return results;
}

// Scan page for "friend request accepted" notifications and send message to each (even if not in pending – use template when sendAfterAccept is on)
async function scanPageForAcceptedNotificationsAndSend() {
  if (!document.body || !document.body.innerText) return;
  const bodyText = document.body.innerText;
  if (!bodyText.includes('accepted your friend request')) return;
  const result = await chrome.storage.local.get(['pendingFriendRequests', 'settings', 'acceptedNotificationsMessageSent']);
  const pendingRequests = result.pendingFriendRequests || [];
  const settings = result.settings || {};
  let sentSet = result.acceptedNotificationsMessageSent;
  if (Array.isArray(sentSet)) sentSet = new Set(sentSet);
  else if (!sentSet) sentSet = new Set();

  if (!settings?.messaging?.enabled) return;
  const hasAnyStored = pendingRequests.some(r => r.storedMessage && String(r.storedMessage).trim());
  if (!settings?.messaging?.sendAfterAccept && !hasAnyStored) return;

  const accepted = extractAllAcceptedNotificationsFromDOM();
  for (const { profileId, profileName, profileUrl: extractedUrl } of accepted) {
    const key = (profileId || extractedUrl || profileName).toString();
    if (sentSet.has(key)) continue;

    const pending = pendingRequests.find(req =>
      (req.profileId && req.profileId === profileId) ||
      (req.url && extractedUrl && (req.url.includes(profileId) || req.url === extractedUrl || (profileId && req.url.includes(profileId))))
    );
    const profileUrl = extractedUrl || pending?.url || (profileId ? `https://www.facebook.com/profile.php?id=${profileId}` : null);
    if (!profileUrl) continue;

    const name = (pending?.name || profileName || 'Friend').trim();
    const storedMessage = pending?.storedMessage && String(pending.storedMessage).trim() ? pending.storedMessage : null;
    const shouldSend = (pending && !pending.messageSent && (storedMessage || settings?.messaging?.sendAfterAccept)) ||
      (!pending && settings?.messaging?.sendAfterAccept);
    if (!shouldSend) continue;

    console.log('[Friender] Notification: friend request accepted by', name, '- sending message in background');
    const opened = await openProfileAndSendMessage(profileUrl, profileId, name, 'after_accept', storedMessage || null);
    if (opened) {
      sentSet.add(key);
      await chrome.storage.local.set({ acceptedNotificationsMessageSent: Array.from(sentSet) });
      if (pending) {
        pending.messageSent = true;
        pending.messageSentAt = Date.now();
        await chrome.storage.local.set({ pendingFriendRequests: pendingRequests });
      }
      if (window.showFrienderToast) {
        window.showFrienderToast('Message sent', `Sending message to ${name} in the background.`, 'success');
      }
    }
  }
}

// Check friend confirmation notification and send message if needed
// This works on ANY page type (groups_people, friend_suggestions, or any other Facebook page)
async function checkFriendConfirmationNotification() {
  try {
    const url = window.location.href;
    let profileId = (url.match(/[?&]profile_id=(\d+)/) || [])[1];
    if (!profileId) profileId = extractProfileIdFromAcceptedNotificationInDOM();
    if (!profileId) {
      console.log('[Friender] No profile_id found in URL or page for friend confirmation');
      return;
    }
    console.log(`[Friender] ✅ Friend confirmation detected for profile ID: ${profileId}`);
    console.log(`[Friender] This works on any page type (groups, suggestions, or any Facebook page)`);
    
    // Get pending requests
    const result = await chrome.storage.local.get(['pendingFriendRequests', 'settings']);
    const pendingRequests = result.pendingFriendRequests || [];
    const settings = result.settings || {};
    
    // Check if messaging is activated (master switch)
    if (!settings?.messaging?.enabled) {
      console.log('[Friender] Messaging is not activated in settings (Activate settings toggle is off)');
      return;
    }
    
    // Find matching pending request first; then allow send if we have storedMessage OR sendAfterAccept is on
    // Try to find by profile ID first, then by constructing URL
    let pendingRequest = pendingRequests.find(req => {
      if (req.profileId && req.profileId === profileId) {
        return true;
      }
      // Try to match by URL pattern
      if (req.url && (req.url.includes(profileId) || req.url.includes(`/profile.php?id=${profileId}`))) {
        return true;
      }
      return false;
    });
    
    // If not found by ID, try to construct profile URL and match
    if (!pendingRequest) {
      const profileUrl = `https://www.facebook.com/profile.php?id=${profileId}`;
      pendingRequest = pendingRequests.find(req => req.url === profileUrl || req.url.includes(profileId));
    }
    
    if (!pendingRequest) {
      console.log(`[Friender] No pending request found for profile ID ${profileId}`);
      // Try to find by name if we can extract it from the page
      const nameElement = document.querySelector('h1, h2, [data-testid="user-name"]') || 
                          document.querySelector('a[href*="/profile.php"]') ||
                          Array.from(document.querySelectorAll('a')).find(a => a.href.includes(`profile.php?id=${profileId}`));
      
      if (nameElement) {
        const profileName = nameElement.textContent?.trim() || 'Unknown';
        console.log(`[Friender] Found profile name: ${profileName}, checking if in pending list...`);
        
        // Try to find by name
        pendingRequest = pendingRequests.find(req => 
          req.name && req.name.toLowerCase() === profileName.toLowerCase() && !req.messageSent
        );
      }
    }
    
    if (!pendingRequest) {
      console.log(`[Friender] Profile ID ${profileId} not found in pending requests list`);
      return;
    }
    
    if (pendingRequest.messageSent) {
      console.log('[Friender] Message already sent to', pendingRequest.name || profileId);
      return;
    }
    const hasStoredMessage = pendingRequest.storedMessage && String(pendingRequest.storedMessage).trim();
    if (!hasStoredMessage && !settings?.messaging?.sendAfterAccept) {
      console.log('[Friender] No stored message and sendAfterAccept not selected – skip send');
      return;
    }
    // Friend request was accepted (we're on confirmation page) - send message
    console.log('[Friender] Friend request accepted for', pendingRequest.name || profileId, '- sending message...');
    
    // Wait a bit for page to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const profileUrl = pendingRequest.url || `https://www.facebook.com/profile.php?id=${profileId}`;
    const profileName = pendingRequest.name || 'Friend';
    
    // Try to find message button on the notification page first
    let messageButton = document.querySelector('div[aria-label="Message"]') ||
                       document.querySelector('a[href*="/messages/"]') ||
                       Array.from(document.querySelectorAll('div[role="button"], span[role="button"], a')).find(b => {
                         const text = b.textContent?.toLowerCase() || '';
                         const ariaLabel = b.getAttribute('aria-label')?.toLowerCase() || '';
                         const href = b.getAttribute('href') || '';
                         return (text.includes('message') || ariaLabel.includes('message') || href.includes('/messages/')) &&
                                !text.includes('add friend');
                       });
    
    // If message button found on notification page, use it
    if (messageButton) {
      console.log('[Friender] Found message button on notification page, clicking...');
      messageButton.click();
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for chat to open
      
      // Send message using facebook handler (use stored message from template if we stored for accept later)
      if (window.facebookHandler) {
        console.log(`[Friender] Sending message to ${profileName}...`);
        const messageText = pendingRequest.storedMessage || null;
        try {
          const messageSent = await window.facebookHandler.sendMessage(profileUrl, messageText, 'after_accept', profileName);
          
          if (messageSent) {
            console.log(`[Friender] ✅ Message sent successfully to ${profileName}`);
            
            // Mark as message sent
            pendingRequest.messageSent = true;
            pendingRequest.messageSentAt = Date.now();
            pendingRequest.profileId = profileId;
            await chrome.storage.local.set({ pendingFriendRequests: pendingRequests });
            
            if (window.showFrienderToast) {
              window.showFrienderToast(
                'Message Sent!',
                `Message sent to ${profileName} after friend request acceptance.`,
                'success'
              );
            }
          } else {
            console.warn(`[Friender] ⚠️ Message sending returned false for ${profileName}`);
          }
        } catch (error) {
          console.error(`[Friender] Error sending message to ${profileName}:`, error);
        }
      } else {
        console.error('[Friender] Facebook handler not available');
      }
    } else {
      // Open profile in background tab to send (no tab switch for user); tab will send then close
      const profilePageUrl = `https://www.facebook.com/profile.php?id=${profileId}`;
      console.log('[Friender] Message button not on this page – opening profile in background to send, then close tab');
      const opened = await openProfileAndSendMessage(
        profilePageUrl,
        profileId,
        pendingRequest.name || 'Friend',
        'after_accept',
        pendingRequest.storedMessage || null
      );
      if (opened) {
        if (window.showFrienderToast) {
          window.showFrienderToast('Sending message…', `Message will be sent to ${pendingRequest.name || profileId} in the background.`, 'success');
        }
        pendingRequest.messageSent = true;
        pendingRequest.messageSentAt = Date.now();
        await chrome.storage.local.set({ pendingFriendRequests: pendingRequests });
      } else {
        if (window.showFrienderToast) {
          window.showFrienderToast('Open profile to send', `Open ${pendingRequest.name || profileId}'s profile to send the message.`, 'info');
        }
      }
    }
  } catch (error) {
    console.error('[Friender] Error in checkFriendConfirmationNotification:', error);
  }
}

// Check friend requests page for all actions: new requests, accepted, and declined
// This handles all three messaging scenarios
async function checkFriendRequestsPageForAllActions() {
  if (!isExtensionContextValid()) return;
  try {
    // Check for new incoming requests (Blue card)
    await checkNewIncomingRequests();
    
    // Check for accepted requests (Green card)
    await checkAcceptedRequestsOnFriendRequestsPage();
    
    // Check for declined requests (Red card)
    await checkDeclinedRequestsOnFriendRequestsPage();
  } catch (error) {
    if (window.frienderIsContextInvalidatedError?.(error)) {
      window.frienderOnContextInvalidated?.();
      return;
    }
    console.error('[Friender] Error in checkFriendRequestsPageForAllActions:', error);
  }
}

// One-time migration: old code marked requests as "processed" before sending; clear so pending requests get a real send attempt
const INCOMING_TRACKING_MIGRATION_KEY = 'friender_incoming_tracking_migration_v2';
const INCOMING_TRACKING_MIGRATION_V3_KEY = 'friender_incoming_tracking_migration_v3'; // Clear again after fixing "skipped" = tracked bug
const INCOMING_TRACKING_MIGRATION_V4_KEY = 'friender_incoming_tracking_migration_v4'; // Clear again after fixing "empty input = return true" bug
async function maybeClearIncomingTrackingMigration() {
  const r = await chrome.storage.local.get([INCOMING_TRACKING_MIGRATION_KEY, INCOMING_TRACKING_MIGRATION_V3_KEY, INCOMING_TRACKING_MIGRATION_V4_KEY]);
  if (r[INCOMING_TRACKING_MIGRATION_V4_KEY]) return;
  if (r[INCOMING_TRACKING_MIGRATION_KEY] || r[INCOMING_TRACKING_MIGRATION_V3_KEY]) {
    await chrome.storage.local.set({
      incomingRequestsTracked: [],
      [INCOMING_TRACKING_MIGRATION_V4_KEY]: true
    });
    console.log('[Friender] Cleared incoming request tracking (v4) so wrongly-marked requests can be messaged.');
    return;
  }
  await chrome.storage.local.set({
    incomingRequestsTracked: [],
    [INCOMING_TRACKING_MIGRATION_KEY]: true
  });
  console.log('[Friender] Cleared incoming request tracking (one-time) so pending requests can be messaged.');
}

// Check for new incoming friend requests on the friend requests page
// Blue card: "Send message when you receive a new friend request from someone"
async function checkNewIncomingRequests() {
  if (!isExtensionContextValid()) return;
  try {
    console.log('[Friender] Checking friend requests page for new incoming requests...');
    
    // One-time migration: clear old "processed" list so people wrongly marked (before we fixed "only track when sent") get a retry
    await maybeClearIncomingTrackingMigration();

    // Get settings
    const result = await chrome.storage.local.get(['settings', 'incomingRequestsTracked']);
    const settings = result.settings || {};
    let incomingRequestsTracked = result.incomingRequestsTracked;
    if (Array.isArray(incomingRequestsTracked)) {
      incomingRequestsTracked = new Set(incomingRequestsTracked);
    } else if (!incomingRequestsTracked) {
      incomingRequestsTracked = new Set();
    }
    
    // Check if messaging is activated (master switch)
    if (!settings?.messaging?.enabled) {
      return;
    }
    
    // Check if sendOnIncomingRequest card is selected
    if (!settings?.messaging?.sendOnIncomingRequest) {
      console.log('[Friender] sendOnIncomingRequest card is not selected in settings');
      return;
    }
    
    console.log('[Friender] ✅ sendOnIncomingRequest is enabled - checking for new requests...');
    
    // Find all friend request entries on the page
    // Look for entries that show pending friend requests (not accepted/declined)
    // Try multiple selectors - Facebook may use aria-label or visible text
    let confirmButtons = document.querySelectorAll('div[aria-label="Confirm"], button[aria-label="Confirm"], div[aria-label*="Confirm"], button[aria-label*="Confirm"]');
    let deleteButtons = document.querySelectorAll('div[aria-label="Delete"], button[aria-label="Delete"], div[aria-label*="Delete"], button[aria-label*="Delete"], div[aria-label*="Remove"], button[aria-label*="Remove"]');
    
    // Fallback: find by visible text (Facebook sometimes uses spans inside div[role="button"])
    if (confirmButtons.length === 0 || deleteButtons.length === 0) {
      const allButtons = document.querySelectorAll('div[role="button"], span[role="button"], button');
      const byTextConfirm = [];
      const byTextDelete = [];
      allButtons.forEach(el => {
        const t = (el.textContent || '').trim();
        if (t === 'Confirm' || t === 'Accept') byTextConfirm.push(el);
        if (t === 'Delete' || t === 'Remove' || t === 'Decline') byTextDelete.push(el);
      });
      if (confirmButtons.length === 0 && byTextConfirm.length > 0) confirmButtons = byTextConfirm;
      if (deleteButtons.length === 0 && byTextDelete.length > 0) deleteButtons = byTextDelete;
    }
    
    console.log(`[Friender] Found ${confirmButtons.length} Confirm buttons and ${deleteButtons.length} Delete buttons directly`);
    
    let requestEntries;
    let foundViaButtons = false; // Track if we found entries via buttons
    
    // If found buttons, get the FULL request card. Prefer smallest container with exactly one profile link so we don't merge multiple cards into one entry.
    if (confirmButtons.length > 0 || deleteButtons.length > 0) {
      const containers = new Map();
      const addCardForButton = (btn) => {
        let el = findSmallestCardWithOneProfileLink(btn);
        if (el && !containers.has(el)) {
          containers.set(el, btn);
          return;
        }
        el = btn.parentElement;
        for (let w = 0; w < 25 && el; w++) {
          const profileLink = el.querySelector && el.querySelector('a[href*="/profile.php"], a[href*="facebook.com/"][href*="/"], a[href*="/user/"]');
          if (profileLink && el.contains(btn)) {
            containers.set(el, btn);
            return;
          }
          el = el.parentElement;
        }
        let container = btn.closest('div[class*="x6s0dn4"], div[class*="x1q0q8m5"], div[class*="x1n2onr6"]');
        if (container) {
          el = container;
          for (let w = 0; w < 15 && el; w++) {
            if (el.querySelector && (el.querySelector('a[href*="/profile.php"]') || el.querySelector('a[href*="facebook.com/"][href*="/"]'))) {
              containers.set(el, btn);
              return;
            }
            el = el.parentElement;
          }
          containers.set(container, btn);
        } else {
          containers.set(btn.parentElement, btn);
        }
      };
      confirmButtons.forEach(addCardForButton);
      deleteButtons.forEach(btn => {
        let el = findSmallestCardWithOneProfileLink(btn);
        if (el && !containers.has(el)) {
          containers.set(el, btn);
          return;
        }
        el = btn.parentElement;
        for (let w = 0; w < 25 && el; w++) {
          const profileLink = el.querySelector && el.querySelector('a[href*="/profile.php"], a[href*="facebook.com/"][href*="/"], a[href*="/user/"]');
          if (profileLink && el.contains(btn) && !containers.has(el)) {
            containers.set(el, btn);
            return;
          }
          el = el.parentElement;
        }
        let container = btn.closest('div[class*="x6s0dn4"], div[class*="x1q0q8m5"], div[class*="x1n2onr6"]');
        if (container && !containers.has(container)) {
          el = container;
          for (let w = 0; w < 15 && el; w++) {
            if (el.querySelector && (el.querySelector('a[href*="/profile.php"]') || el.querySelector('a[href*="facebook.com/"][href*="/"]')) && !containers.has(el)) {
              containers.set(el, btn);
              return;
            }
            el = el.parentElement;
          }
          containers.set(container, btn);
        }
      });
      requestEntries = Array.from(containers.keys());
      foundViaButtons = true;
      console.log(`[Friender] Found ${requestEntries.length} request cards by button parents`);
    } else {
      // Fallback: try broader selectors
      requestEntries = document.querySelectorAll(
        '[role="article"], ' +
        'div[data-pagelet], ' +
        'div[class*="x1q0q8m5"][class*="x1qhh985"], ' +
        'div[class*="x6s0dn4"][class*="x1q0q8m5"][class*="x1qhh985"], ' +
        'div[class*="x1n2onr6"][class*="x1qhh985"]'
      );
      foundViaButtons = false; // Mark that we used fallback
      console.log(`[Friender] Using fallback selectors, found ${requestEntries.length} entries`);
    }
    const newRequests = [];
    
    console.log(`[Friender] Found ${requestEntries.length} potential request entries`);
    
    for (let i = 0; i < requestEntries.length; i++) {
      const entry = requestEntries[i];
      const text = entry.textContent || '';
      
      console.log(`[Friender] Processing entry ${i + 1}/${requestEntries.length}, text length: ${text.length}`);
      
      // Skip if entry is too small (likely not a request card). When we found via Confirm/Delete buttons, card can be just name + "1m" (e.g. "Hari" = 4 + "1m" = 2 → 7 chars)
      const minLength = foundViaButtons ? 2 : 15;
      if (text.length < minLength) {
        console.log(`[Friender] Entry ${i + 1} skipped - too small (${text.length} chars)`);
        continue;
      }
      // Skip if entry is too large – likely a merged container (multiple cards in one DOM node). Single card is ~40–80 chars.
      if (text.length > 120) {
        console.log(`[Friender] Entry ${i + 1} skipped - too large (${text.length} chars), likely merged container`);
        continue;
      }
      
      // Skip if already accepted or declined
      if (text.includes('Request accepted') || text.includes('Declined') || text.includes('accepted your friend request')) {
        console.log(`[Friender] Entry ${i + 1} skipped - already accepted/declined`);
        continue;
      }
      
      // Check if this is a pending request (has "Accept" or "Confirm" button, not "Request accepted" or "Declined")
      const hasConfirmButton = entry.querySelector('div[aria-label="Confirm"], button[aria-label="Confirm"], div[aria-label*="Confirm"]');
      const hasAcceptButton = entry.querySelector('div[aria-label*="Accept"], button[aria-label*="Accept"]');
      const hasDeleteButton = entry.querySelector('div[aria-label="Delete"], button[aria-label="Delete"], div[aria-label*="Delete"], div[aria-label*="Remove"]');
      const hasDeclineButton = entry.querySelector('div[aria-label*="Decline"], button[aria-label*="Decline"]');
      // Also check for buttons by visible text (span inside div[role="button"])
      let hasConfirmByText = false;
      let hasDeleteByText = false;
      const buttonsInEntry = entry.querySelectorAll('div[role="button"], span[role="button"], button');
      for (const b of buttonsInEntry) {
        const t = (b.textContent || '').trim();
        if (t === 'Confirm' || t === 'Accept') hasConfirmByText = true;
        if (t === 'Delete' || t === 'Remove' || t === 'Decline') hasDeleteByText = true;
      }
      const hasConfirmText = (text.includes('Confirm') || text.includes('Accept')) && !text.includes('Request accepted');
      const hasDeleteText = (text.includes('Delete') || text.includes('Remove')) && !text.includes('Declined');
      
      // Debug logging - always log for entries found via buttons
      if (text.length > 50 || foundViaButtons) {
        console.log(`[Friender] Entry ${i + 1} check: hasConfirmButton=${!!hasConfirmButton}, hasDeleteButton=${!!hasDeleteButton}, hasConfirmText=${hasConfirmText}, hasDeleteText=${hasDeleteText}, foundViaButtons=${foundViaButtons}`);
        console.log(`[Friender] Entry ${i + 1} text preview: ${text.substring(0, 200)}...`);
      }
      
      // If it has Confirm/Accept or Delete/Decline buttons (by aria-label or text), it's a new incoming request
      // OR if we found this entry via button parents, it definitely has buttons (even if querySelector doesn't find them due to DOM structure)
      if (hasConfirmButton || hasAcceptButton || hasDeleteButton || hasDeclineButton || hasConfirmByText || hasDeleteByText || hasConfirmText || hasDeleteText || foundViaButtons) {
        console.log(`[Friender] ✅ Entry ${i + 1} - Found entry with Confirm/Delete buttons, extracting profile info...`);
        console.log(`[Friender] Entry ${i + 1} text sample (first 300 chars): ${text.substring(0, 300)}`);
        
        // Get the actual button element for direct navigation
        const actualConfirmBtn = entry.querySelector('div[aria-label="Confirm"], button[aria-label="Confirm"]');
        const actualDeleteBtn = entry.querySelector('div[aria-label="Delete"], button[aria-label="Delete"]');
        const actualButton = actualConfirmBtn || actualDeleteBtn;
        
        // Try to extract profile information - look for name and profile link
        // Enhanced method similar to Friend Connector Pro
        let profileName = 'Unknown';
        
        // Method 1: Look for the profile name link (most reliable - Friend Connector Pro method)
        // The name is usually in a clickable link that goes to the profile
        // Try multiple selectors for profile links, prioritizing links near the button
        let profileNameLink = null;
        
        // Find first link that is a real Facebook profile URL (not ad/redirect like l.php or external)
        const pickProfileLink = (root) => {
          if (!root) return null;
          const links = root.querySelectorAll ? Array.from(root.querySelectorAll('a[href]')) : [];
          for (const a of links) {
            const href = a.href || a.getAttribute('href') || '';
            const full = href.startsWith('http') ? href : (href ? new URL(href, window.location.origin).href : '');
            if (full && isFacebookProfileUrl(full)) return a;
          }
          return null;
        };
        if (actualButton) {
          let searchElement = actualButton.parentElement;
          for (let d = 0; d < 5 && searchElement; d++) {
            profileNameLink = pickProfileLink(searchElement);
            if (profileNameLink) break;
            searchElement = searchElement.parentElement;
          }
        }
        if (!profileNameLink) profileNameLink = pickProfileLink(entry);
        
        if (profileNameLink) {
          const linkText = profileNameLink.textContent?.trim() || '';
          // Also try innerText and textContent of child elements
          const actualText = linkText || 
                           profileNameLink.innerText?.trim() || 
                           profileNameLink.querySelector('span')?.textContent?.trim() ||
                           profileNameLink.querySelector('div')?.textContent?.trim() || '';
          
          // Check if it's a valid name (not UI text, not too long)
          let nameFromLink = actualText;
          if (nameFromLink.length <= 1 || nameFromLink.length >= 100 || 
              nameFromLink.includes('mutual friends') || 
              nameFromLink.includes('Profile picture') ||
              nameFromLink.split(' ').length > 5) {
            nameFromLink = '';
          } else if (nameFromLink.includes('Confirm') || nameFromLink.includes('Delete') || nameFromLink.match(/\d+[mhd]/)) {
            // Link text can be "Mohan Nihal 50mConfirmDeleteConfirmDelete" or "Mohan Nihal 50m" – strip trailing timestamp and/or button text
            let cleaned = nameFromLink.replace(/\s*\d+[mhd]\s*(?:Confirm|Delete).*$/gi, '').trim();
            if (cleaned === nameFromLink) cleaned = nameFromLink.replace(/\s*\d+[mhd]$/i, '').trim();
            if (cleaned.length > 1 && cleaned.length < 100 && 
                !cleaned.includes('Confirm') && !cleaned.includes('Delete') &&
                cleaned.split(' ').length <= 5) {
              nameFromLink = cleaned;
            } else {
              nameFromLink = '';
            }
          }
          if (nameFromLink) {
            profileName = nameFromLink;
            console.log(`[Friender] ✅ Found name from profile link: ${profileName}`);
          } else if (profileNameLink) {
            console.log(`[Friender] Profile link text not usable, will try span[dir="auto"]: "${actualText.slice(0, 80)}"`);
          }
        } else {
          console.log(`[Friender] No profile name link found in entry`);
        }
        
        // Method 2: Look for span[dir="auto"] with name (fallback) – exclude ads/UI (Sponsored, See all, etc.)
        if (profileName === 'Unknown') {
          const nameSpans = entry.querySelectorAll('span[dir="auto"]');
          const candidateNames = []; // { name, span } to prefer name inside profile link
          
          for (const span of nameSpans) {
            let txt = span.textContent?.trim() || span.innerText?.trim() || '';
            if (!txt && span.querySelector('span')) {
              txt = span.querySelector('span')?.textContent?.trim() || '';
            }
            if (txt.length > 2 && txt.length < 80 && 
                !txt.includes('mutual friends') && 
                !txt.includes('Confirm') && 
                !txt.includes('Delete') &&
                !txt.includes('New friend request') &&
                !txt.includes('ago') &&
                !txt.match(/^\d+[mhd]$/) &&
                !txt.includes('Profile picture of') &&
                !txt.includes('who is a mutual friend') &&
                !txt.includes('Link to see everyone') &&
                !txt.includes('See more') &&
                !isFriendRequestUILabel(txt) &&
                !isFriendRequestBlocklistedName(txt) &&
                !looksLikeLocation(txt) &&
                txt.split(/\s+/).length <= 5) {
              candidateNames.push({ name: txt, span });
            }
          }
          
          if (candidateNames.length > 0) {
            const notBlocklisted = candidateNames.filter(c => !isFriendRequestBlocklistedName(c.name));
            const list = notBlocklisted.length ? notBlocklisted : candidateNames;
            let chosen = null;
            if (profileNameLink) {
              const fromLink = list.find(c => profileNameLink.contains(c.span));
              if (fromLink && !isFriendRequestBlocklistedName(fromLink.name)) chosen = fromLink.name;
            }
            if (!chosen && list.length > 0) {
              chosen = list[0].name;
              if (isFriendRequestBlocklistedName(chosen)) chosen = null;
            }
            if (chosen) {
              profileName = chosen;
              console.log(`[Friender] ✅ Found name from span[dir="auto"]: ${profileName} (from ${candidateNames.length} candidates)`);
            }
          }
          if (profileName === 'Unknown') {
            console.log(`[Friender] No valid name candidates found in ${nameSpans.length} spans`);
            // Log all span texts for debugging
            if (nameSpans.length > 0) {
              console.log(`[Friender] All span texts:`, Array.from(nameSpans).map(s => s.textContent?.trim()).filter(t => t));
            }
          }
        }
        
        // Method 2: Look for nested spans with name (more specific) – exclude blocklisted
        if (profileName === 'Unknown') {
          const nestedNameSpans = entry.querySelectorAll('span[dir="auto"] span');
          for (const span of nestedNameSpans) {
            const txt = span.textContent?.trim() || '';
            if (txt.length > 2 && txt.length < 80 && 
                !txt.includes('mutual') && 
                !txt.includes('Confirm') && 
                !txt.includes('Delete') &&
                !txt.match(/^\d+[mhd]$/) &&
                !txt.includes('Profile picture') &&
                !isFriendRequestBlocklistedName(txt)) {
              profileName = txt;
              console.log(`[Friender] Found name from nested span: ${profileName}`);
              break;
            }
          }
        }
        
        // Method 3: Look for strong/h2/h3 tags
        if (profileName === 'Unknown') {
          const heading = entry.querySelector('strong, h2, h3');
          if (heading) {
            const txt = heading.textContent?.trim() || '';
            if (txt.length > 2 && txt.length < 100) {
              profileName = txt;
              console.log(`[Friender] Found name from heading: ${profileName}`);
            }
          }
        }
        
        // Method 4: Try to extract from the first meaningful text in the entry
        if (profileName === 'Unknown') {
          const allText = entry.textContent || entry.innerText || '';
          // Split by common separators and find the first meaningful chunk
          const lines = allText.split(/\n|\r|•|·/).map(l => l.trim()).filter(l => l.length > 2 && l.length < 100);
          for (const line of lines) {
            if (!line.includes('Confirm') && 
                !line.includes('Delete') &&
                !line.includes('mutual friends') &&
                !line.includes('ago') &&
                !line.match(/^\d+[mhd]$/) &&
                !line.includes('Profile picture') &&
                !line.includes('who is a mutual friend') &&
                line.split(' ').length >= 1 &&
                line.split(' ').length <= 5) { // Names are usually short
              profileName = line;
              console.log(`[Friender] Found name from text extraction: ${profileName}`);
              break;
            }
          }
        }
        
        // Method 5: Direct extraction from button's closest parent with name
        if (profileName === 'Unknown') {
          // Find the actual button element and walk up the DOM
          const actualButton = entry.querySelector('div[aria-label="Confirm"], button[aria-label="Confirm"], div[aria-label="Delete"], button[aria-label="Delete"]');
          if (actualButton) {
            let current = actualButton.parentElement;
            let depth = 0;
            
            while (current && depth < 10) {
              // Look for name in this element
              const nameInElement = current.querySelector('span[dir="auto"] span, a[href*="profile"], a[href*="facebook.com/"]');
              if (nameInElement) {
                const txt = nameInElement.textContent?.trim() || nameInElement.innerText?.trim() || '';
                if (txt.length > 1 && txt.length < 100 && 
                    !txt.includes('mutual') && 
                    !txt.includes('Confirm') && 
                    !txt.includes('Delete') &&
                    txt.split(' ').length <= 5) {
                  profileName = txt;
                  console.log(`[Friender] Found name from button parent walk (depth ${depth}): ${profileName}`);
                  break;
                }
              }
              current = current.parentElement;
              depth++;
            }
          }
        }
        
        // Clean up name (remove extra whitespace, newlines, trailing timestamp like " 41m" / " 2h" / " 1d")
        profileName = profileName.replace(/\s+/g, ' ').trim();
        profileName = stripTimestampFromName(profileName);
        // Normalize friend-request phrasing to display name only (e.g. "UnreadHari sent you a friend request." → "Hari")
        profileName = normalizeFriendRequestDisplayName(profileName);
        
        // Try to find profile link - look for any link that might be a profile
        // Enhanced method: prioritize the name link we found
        let profileUrl = null;
        
        // First, use the profile name link only if it's a real Facebook profile URL (not ad/redirect)
        if (profileNameLink && profileNameLink.href) {
          const href = (profileNameLink.href || profileNameLink.getAttribute('href') || '').trim();
          const fullHref = href && href.startsWith('http') ? href : (href ? new URL(href, window.location.origin).href : '');
          if (fullHref && isFacebookProfileUrl(fullHref)) {
            profileUrl = fullHref;
            console.log(`[Friender] Found profile URL from name link: ${profileUrl}`);
          }
        }
        
        // Fallback: search all links (more comprehensive)
        if (!profileUrl) {
          const allLinks = entry.querySelectorAll('a[href]');
          console.log(`[Friender] Searching ${allLinks.length} links for profile URL...`);
          
          for (const link of allLinks) {
            const href = link.href || link.getAttribute('href') || '';
            if (!href) continue;
            const fullHref = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
            if (isFacebookProfileUrl(fullHref)) {
              profileUrl = fullHref;
              console.log(`[Friender] Found profile URL from search: ${profileUrl}`);
              break;
            }
          }
          
          // If still no URL but we have a name, try to construct URL from name
          if (!profileUrl && profileName !== 'Unknown') {
            // Try to find any link that might be related to the name
            const nameLinks = Array.from(entry.querySelectorAll('a')).filter(a => {
              const txt = a.textContent?.trim() || '';
              return txt.toLowerCase() === profileName.toLowerCase() || 
                     txt.toLowerCase().includes(profileName.toLowerCase().split(' ')[0]);
            });
            
            for (const a of nameLinks) {
              const href = a.href || a.getAttribute('href') || '';
              const fullHref = href.startsWith('http') ? href : (href ? new URL(href, window.location.origin).href : '');
              if (fullHref && isFacebookProfileUrl(fullHref)) {
                profileUrl = fullHref;
                console.log(`[Friender] Found profile URL from name link: ${profileUrl}`);
                break;
              }
            }
          }
        }
        
        // Require a valid Facebook profile URL (reject ads, sponsored, external redirects)
        if (!profileUrl) continue;
        try {
          const fullUrl = profileUrl.startsWith('http') ? profileUrl : new URL(profileUrl, window.location.origin).href;
          if (!isFacebookProfileUrl(fullUrl)) continue;
          profileUrl = fullUrl;
        } catch (_) {
          continue;
        }
        // Reject ad/sidebar labels mistaken as names
        const nameBlock = (profileName || '').trim();
        if (/^(Sponsored|See all|Friend requests|Build Your App Now)$/i.test(nameBlock)) continue;
        if (isFriendRequestUILabel(nameBlock)) continue;
        if (isFriendRequestBlocklistedName(nameBlock)) continue;
        if (/\.(com|sh|io|net|org)$/i.test(nameBlock) || nameBlock.includes('.com') || /Creative Cloud|adobe|Build Your App|emergent\.sh/i.test(nameBlock)) continue;

        // If we have a name or URL, process it
        if (profileName !== 'Unknown' || profileUrl) {
          // Extract profile ID from URL – only numeric (profile.php?id= expects digits; username must not go there)
          let profileId = null;
          if (profileUrl && typeof profileUrl === 'string') {
            const numMatch = profileUrl.match(/profile\.php\?id=(\d+)/) ||
                             profileUrl.match(/[?&]profile_id=(\d+)/) ||
                             profileUrl.match(/user\/(\d+)/);
            if (numMatch) profileId = numMatch[1];
          }
          
          // If we have URL but no name, try to get name from URL or use a default
          if (profileName === 'Unknown' && profileUrl) {
            // Try to extract name from URL (username)
            const usernameMatch = profileUrl.match(/facebook\.com\/([^\/\?]+)/);
            if (usernameMatch && usernameMatch[1] && !usernameMatch[1].includes('profile.php')) {
              profileName = usernameMatch[1].replace(/\./g, ' ').replace(/\d+/g, '').trim();
              if (profileName.length < 2) {
                profileName = 'Friend'; // Fallback name
              }
            } else {
              profileName = 'Friend'; // Fallback name if we have URL but can't extract name
            }
            console.log(`[Friender] Using fallback name "${profileName}" since we have URL: ${profileUrl}`);
          }
          
          // Create a unique key for this request (prefer profileId so same person = one send)
          const requestKey = profileId || profileUrl || profileName.toLowerCase();
          
          // Check if we've already processed this request
          if (!incomingRequestsTracked.has(requestKey)) {
            console.log(`[Friender] ✅ Found new incoming request: ${profileName}${profileUrl ? ` (${profileUrl})` : ''}`);
            newRequests.push({
              name: profileName,
              url: profileUrl,
              profileId: profileId,
              key: requestKey,
              entryElement: entry
            });
          } else {
            console.log(`[Friender] Already processed incoming request: ${profileName}`);
          }
        } else {
          console.log(`[Friender] ⚠️ Entry ${i + 1} - Could not extract profile name or URL from entry`);
          console.log(`[Friender] Entry ${i + 1} - profileName: "${profileName}", profileUrl: ${profileUrl}`);
          console.log(`[Friender] Entry ${i + 1} - Full text (first 500 chars):`, text.substring(0, 500));
          console.log(`[Friender] Entry ${i + 1} - HTML sample (first 1000 chars):`, entry.innerHTML.substring(0, 1000));
          
          // Last resort: Try to extract ANY text that looks like a name
          const words = text.split(/\s+/).filter(w => w.length > 2 && w.length < 20);
          const potentialNames = words.filter(w => 
            !w.includes('Confirm') && 
            !w.includes('Delete') && 
            !w.includes('mutual') &&
            !w.match(/^\d+[mhd]$/) &&
            !w.toLowerCase().includes('friend') &&
            !w.toLowerCase().includes('request')
          );
          
          if (potentialNames.length >= 2) {
            const fallbackName = potentialNames.slice(0, 2).join(' ');
            console.log(`[Friender] ⚠️ Using last-resort name extraction: "${fallbackName}"`);
            // Don't add it automatically, but log it for debugging
          }
        }
      } else {
        // Log why this entry was skipped
        console.log(`[Friender] Entry ${i + 1} skipped - no Confirm/Delete buttons found. Text includes Confirm: ${text.includes('Confirm')}, Delete: ${text.includes('Delete')}, foundViaButtons: ${foundViaButtons}`);
      }
    }
    
    if (newRequests.length === 0) {
      console.log(`[Friender] ⚠️ No new incoming requests found after processing ${requestEntries.length} entries`);
      return;
    }
    
    // Deduplicate by profile key so we only process/send once per person (avoids multiple tabs or duplicate sends)
    const seenKeys = new Set();
    const uniqueNewRequests = newRequests.filter(p => {
      const k = p.key || p.profileId || p.url || p.name;
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    });
    if (uniqueNewRequests.length < newRequests.length) {
      console.log(`[Friender] Deduplicated: ${newRequests.length} entries → ${uniqueNewRequests.length} unique request(s)`);
    }
    
    console.log(`[Friender] ✅ Found ${uniqueNewRequests.length} new incoming friend request(s)`);
    
    // Process each new request – only mark as tracked when message actually sent (so we retry if send fails)
    for (const profile of uniqueNewRequests) {
      // Normalize name: strip timestamp like "37m" / "38m" so display and template use "Mohan Nihal" not "Mohan Nihal 37m"
      const displayName = stripTimestampFromName(profile.name);
      if (displayName !== profile.name) profile.name = displayName;

      console.log(`[Friender] Processing new incoming request from: ${profile.name}`);
      // Do NOT add to incomingRequestsTracked here – only add when message is successfully sent (below)

      // Wait a bit before processing next
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send message - Enhanced method similar to Friend Connector Pro with retry logic
      if (window.facebookHandler) {
        try {
          // profile.php?id= only accepts numeric IDs; use username URL as-is (facebook.com/username)
          const profilePageUrl = getProfileUrlForNavigation(profile);
          
          // Method 1: Try to open message directly from friend requests page (Friend Connector Pro method)
          // Look for message button in the entry element
          let messageButton = null;
          let messageOpened = false;
          
          if (profile.entryElement) {
            const entry = profile.entryElement;
            const searchRoots = [entry];
            if (entry.parentElement) searchRoots.push(entry.parentElement);
            for (const root of searchRoots) {
              messageButton = root.querySelector('div[aria-label="Message"]') ||
                            root.querySelector('div[aria-label*="Message"]') ||
                            root.querySelector('a[href*="/messages/"]') ||
                            root.querySelector('a[href*="messages/t/"]') ||
                            root.querySelector('div[role="button"][aria-label*="Message"]') ||
                            root.querySelector('[data-testid*="message"]') ||
                            Array.from(root.querySelectorAll('div[role="button"], span[role="button"], a')).find(b => {
                              const text = (b.textContent || '').trim().toLowerCase();
                              const ariaLabel = (b.getAttribute('aria-label') || '').toLowerCase();
                              const href = (b.getAttribute('href') || '').toLowerCase();
                              return (text === 'message' || text.includes('message') || ariaLabel.includes('message') || href.includes('/messages/')) &&
                                     !text.includes('add friend') && !text.includes('confirm') && !text.includes('delete');
                            });
              if (messageButton) break;
            }
            if (messageButton) {
              console.log(`[Friender] Found message button for ${profile.name} on friend requests page, clicking...`);
              messageButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await new Promise(resolve => setTimeout(resolve, 500));
              messageButton.click();
              // Wait for chat panel to open and message input to render (Lexical can take 5–8s)
              await new Promise(resolve => setTimeout(resolve, 8000));
              messageOpened = true;
            } else {
              console.log(`[Friender] No message button found on card for ${profile.name} – will try profile tab if send fails`);
            }
          }
          
          // Send message: try on current page first (panel opened by Message button), then auto-send via new tab if needed
          let messageSent = false;
          let messagingBlocked = false; // true when Facebook shows "You can't message this account"
          let retryCount = 0;
          const maxRetries = 3;
          const retryDelays = [2000, 5000, 10000];

          while (!messageSent && !messagingBlocked && retryCount < maxRetries) {
            try {
              if (retryCount > 0) {
                console.log(`[Friender] Retry ${retryCount}/${maxRetries} sending message to ${profile.name}...`);
                await new Promise(resolve => setTimeout(resolve, retryDelays[retryCount - 1]));
              }

              const sendResult = await window.facebookHandler.sendMessage(
                profilePageUrl || window.location.href,
                null,
                'incoming_request',
                profile.name
              );
              // Only treat as sent when we actually sent; 'skipped' = dedupe, don't mark as tracked (so we'll try again next time)
              messageSent = sendResult === true;
              if (sendResult === 'skipped') {
                console.log(`[Friender] Send skipped for ${profile.name} (dedupe) – will not mark as processed, can retry later`);
                break;
              }

              if (messageSent) {
                console.log(`[Friender] ✅ Message sent successfully to ${profile.name} for new incoming friend request${retryCount > 0 ? ` (after ${retryCount} retries)` : ''}`);
                incomingRequestsTracked.add(profile.key);
                if (window.showFrienderToast) {
                  window.showFrienderToast('Message Sent!', `Message sent to ${profile.name} for new friend request.`, 'success');
                }
                break;
              }
              retryCount++;
            } catch (error) {
              const messagingNotAllowed = error?.message?.includes('Messaging not allowed for this account');
              if (messagingNotAllowed) {
                messagingBlocked = true;
                console.log(`[Friender] Can't message ${profile.name} yet (messaging not allowed – e.g. accept request first)`);
                if (window.showFrienderToast) {
                  window.showFrienderToast('Message skipped', `Can't message ${profile.name} until they accept your friend request.`, 'info');
                }
                break;
              }
              // Message input not found = panel didn't open or not messageable; retrying won't help
              const inputNotFound = error?.message?.includes('Message input not found');
              if (inputNotFound) {
                console.log(`[Friender] Message input not found for ${profile.name}, skipping retries`);
                break;
              }
              retryCount++;
              console.error(`[Friender] Error sending message to ${profile.name} (attempt ${retryCount}/${maxRetries}):`, error);
            }
          }

          // If we couldn't send on page: open profile in one background tab (throttle: at most once per 90s per person)
          // When we never opened the message panel on the card (no Message button), allow one profile open even if throttled
          const INCOMING_OPEN_THROTTLE_MS = 90000;
          const lastOpen = (window.__frienderLastIncomingProfileOpen = window.__frienderLastIncomingProfileOpen || {});
          const now = Date.now();
          const canOpenProfile = !lastOpen[profile.key] || (now - lastOpen[profile.key] > INCOMING_OPEN_THROTTLE_MS);
          const neverOpenedPanelAndNoPriorOpen = !messageOpened && !lastOpen[profile.key];
          const shouldOpenProfile = (canOpenProfile || neverOpenedPanelAndNoPriorOpen) && profilePageUrl && typeof window.openProfileAndSendMessage === 'function';
          if (!messageSent && !messagingBlocked && shouldOpenProfile) {
            lastOpen[profile.key] = now;
            console.log(`[Friender] Opening profile in background to send via Message button to ${profile.name}...`);
            const opened = await window.openProfileAndSendMessage(profilePageUrl, profile.profileId, profile.name, 'incoming_request');
            if (opened && window.showFrienderToast) window.showFrienderToast('Sending…', `Message will be sent to ${profile.name} in the background.`, 'success');
          } else if (!messageSent && !messagingBlocked && !shouldOpenProfile && !canOpenProfile) {
            console.log(`[Friender] Skipping profile open for ${profile.name} – already opened recently, will retry on-page next time.`);
          } else if (!messageSent && !messagingBlocked && window.showFrienderToast) {
            window.showFrienderToast('Message skipped', `Couldn't send to ${profile.name}. Open the chat manually if needed.`, 'info');
          }
        } catch (error) {
          console.error(`[Friender] Error sending message to ${profile.name}:`, error);
          // Don't mark as tracked on error - allows retry
        }
      } else {
        console.error(`[Friender] Facebook handler not available for ${profile.name} - will retry on next check`);
        // Don't mark as tracked if handler unavailable - allows retry
      }
    }
    
    // Save tracked requests
    await chrome.storage.local.set({ incomingRequestsTracked: Array.from(incomingRequestsTracked) });
    
  } catch (error) {
    if (window.frienderIsContextInvalidatedError?.(error)) {
      window.frienderOnContextInvalidated?.();
      return;
    }
    console.error('[Friender] Error in checkNewIncomingRequests:', error);
  }
}

// Check for accepted friend requests on the friend requests page
// Green card: "Send message when you accept a friend request you received from someone"
async function checkAcceptedRequestsOnFriendRequestsPage() {
  if (!isExtensionContextValid()) return;
  try {
    console.log('[Friender] Checking friend requests page for accepted requests...');
    
    // Get settings and pending requests (for stored message text when sending after accept)
    const result = await chrome.storage.local.get(['settings', 'acceptedRequestsTracked', 'pendingFriendRequests']);
    const settings = result.settings || {};
    const pendingRequests = result.pendingFriendRequests || [];
    // Convert array to Set if stored as array
    let acceptedRequestsTracked = result.acceptedRequestsTracked;
    if (Array.isArray(acceptedRequestsTracked)) {
      acceptedRequestsTracked = new Set(acceptedRequestsTracked);
    } else if (!acceptedRequestsTracked) {
      acceptedRequestsTracked = new Set();
    }
    
    if (!settings?.messaging?.enabled) {
      console.log('[Friender] Messaging is not activated in settings');
      return;
    }
    const hasAnyStoredMessage = pendingRequests.some(r => r.storedMessage && String(r.storedMessage).trim());
    if (!settings?.messaging?.sendAfterAccept && !hasAnyStoredMessage) {
      console.log('[Friender] sendAfterAccept not selected and no pending stored messages');
      return;
    }
    
    // Find all friend request entries on the page
    // Look for entries that show "Request accepted" status
    // Try multiple selectors for friend request cards
    const requestEntries = document.querySelectorAll(
      '[role="article"], ' +
      'div[data-pagelet], ' +
      'div[class*="x1q0q8m5"], ' +
      'div[class*="x1n2onr6"][class*="x1qhh985"], ' +
      'div[class*="x6s0dn4"][class*="x1q0q8m5"]'
    );
    const acceptedProfiles = [];
    
    console.log(`[Friender] Checking ${requestEntries.length} entries for accepted requests...`);
    
    for (const entry of requestEntries) {
      const text = entry.textContent || '';
      
      // Check if this entry shows "Request accepted" or similar status
      // Also check for "accepted" without "your" (when you accept their request)
      // Look for absence of Confirm/Delete buttons and presence of accepted status
      const hasConfirmButton = entry.querySelector('div[aria-label="Confirm"], button[aria-label="Confirm"]');
      const hasDeleteButton = entry.querySelector('div[aria-label="Delete"], button[aria-label="Delete"]');
      
      // If it has Confirm/Delete buttons, it's still pending (not accepted yet)
      if (hasConfirmButton || hasDeleteButton) {
        continue;
      }
      
      // Check for accepted status: text says "Request accepted" / "accepted your friend request", OR card has Message button (no Confirm/Delete) and looks like a request card
      const hasMessageButton = entry.querySelector('div[aria-label="Message"], div[aria-label*="Message"], a[href*="/messages/"], a[href*="messages/t/"]') ||
        Array.from(entry.querySelectorAll('div[role="button"], span[role="button"], a')).some(el => {
          const t = (el.textContent || '').toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const href = el.getAttribute('href') || '';
          return (t === 'message' || aria.includes('message') || href.includes('/messages/')) && !t.includes('add friend');
        });
      const looksAcceptedByText = text.includes('Request accepted') ||
          text.includes('accepted your friend request') ||
          (text.includes('accepted') && text.includes('friend request')) ||
          text.includes('You\'re now friends');
      const looksAcceptedByUI = hasMessageButton && (text.includes('friend') || text.length >= 20);
      
      if (looksAcceptedByText || looksAcceptedByUI) {
        // Try to extract profile information - similar to new requests
        let profileName = 'Unknown';
        const nameSpans = entry.querySelectorAll('span[dir="auto"]');
        for (const span of nameSpans) {
          const txt = span.textContent?.trim() || '';
          if (txt.length > 2 && txt.length < 100 &&
              !txt.includes('mutual friends') &&
              !txt.includes('Request accepted') &&
              !txt.includes('ago') && !looksLikeLocation(txt) &&
              !isAcceptedStatusPhrase(txt)) {
            profileName = txt;
            break;
          }
          // If the only candidate is "You're now friends with X.", use the extracted name
          if (isAcceptedStatusPhrase(txt)) {
            const parsed = parseNameFromAcceptedStatusPhrase(txt);
            if (parsed && profileName === 'Unknown') profileName = parsed;
          }
        }
        
        if (profileName === 'Unknown') {
          const nestedNameSpans = entry.querySelectorAll('span[dir="auto"] span');
          for (const span of nestedNameSpans) {
            const txt = span.textContent?.trim() || '';
            if (txt.length > 2 && txt.length < 100 && !txt.includes('mutual') && !looksLikeLocation(txt) && !isAcceptedStatusPhrase(txt)) {
              profileName = txt;
              break;
            }
            if (isAcceptedStatusPhrase(txt)) {
              const parsed = parseNameFromAcceptedStatusPhrase(txt);
              if (parsed && profileName === 'Unknown') profileName = parsed;
            }
          }
        }
        
        profileName = profileName.replace(/\s+/g, ' ').trim();
        profileName = normalizeFriendRequestDisplayName(profileName);
        // If we still have the status sentence as "name", replace with the actual name (e.g. "Pamela")
        if (isAcceptedStatusPhrase(profileName)) {
          const parsed = parseNameFromAcceptedStatusPhrase(profileName);
          if (parsed) profileName = parsed;
        }
        
        // Find profile link: same logic as incoming requests – use isFacebookProfileUrl and search entry + parents
        let profileUrl = null;
        let nameFromLink = null;
        const pickProfileLinkFrom = (root) => {
          if (!root || !root.querySelectorAll) return null;
          const links = Array.from(root.querySelectorAll('a[href]'));
          for (const a of links) {
            const href = a.href || a.getAttribute('href') || '';
            const full = href.startsWith('http') ? href : (href ? new URL(href, window.location.origin).href : '');
            if (full && isFacebookProfileUrl(full)) return a;
          }
          return null;
        };
        let profileNameLink = pickProfileLinkFrom(entry);
        if (!profileNameLink) {
          let searchElement = entry.parentElement;
          for (let d = 0; d < 6 && searchElement; d++) {
            profileNameLink = pickProfileLinkFrom(searchElement);
            if (profileNameLink) break;
            searchElement = searchElement.parentElement;
          }
        }
        if (!profileNameLink && hasMessageButton) {
          const msgBtn = entry.querySelector('div[aria-label="Message"], div[aria-label*="Message"], a[href*="/messages/"]');
          if (msgBtn) {
            let searchElement = msgBtn.parentElement;
            for (let d = 0; d < 6 && searchElement; d++) {
              profileNameLink = pickProfileLinkFrom(searchElement);
              if (profileNameLink) break;
              searchElement = searchElement.parentElement;
            }
          }
        }
        if (profileNameLink) {
          const href = profileNameLink.href || profileNameLink.getAttribute('href') || '';
          profileUrl = href.startsWith('http') ? href : (href ? new URL(href, window.location.origin).href : null);
          const linkText = (profileNameLink.textContent || profileNameLink.innerText || '').trim();
          if (linkText.length >= 2 && linkText.length <= 50 && !linkText.includes('sent you') && !linkText.includes('Request accepted') && !looksLikeLocation(linkText)) {
            nameFromLink = linkText;
          }
        }
        
        // Fallback: page URL may contain profile_id when viewing a single request (e.g. after accepting)
        if (!profileUrl && window.location.href) {
          const pageIdMatch = window.location.href.match(/[?&]profile_id=(\d+)/);
          if (pageIdMatch) {
            profileUrl = `https://www.facebook.com/profile.php?id=${pageIdMatch[1]}`;
          }
        }
        
        // Prefer name from profile link (usually just "Hari") over span text (often "UnreadHari sent you a friend request.")
        if (nameFromLink) {
          profileName = nameFromLink.replace(/\s+/g, ' ').trim();
          profileName = normalizeFriendRequestDisplayName(profileName);
        }
        
        // Fallback: extract profile URL/ID from Message link (e.g. /messages/t/61587205104052) when we have no profile link
        if (!profileUrl && entry) {
          const msgLinks = entry.querySelectorAll('a[href*="/messages/t/"], a[href*="/messages/thread/"]');
          for (const a of msgLinks) {
            const href = a.href || a.getAttribute('href') || '';
            const idFromMsg = href.match(/\/messages\/t\/(\d+)/)?.[1] || href.match(/\/messages\/thread\/[^\/]*\/(\d+)/)?.[1];
            if (idFromMsg && /^\d+$/.test(idFromMsg)) {
              profileUrl = `https://www.facebook.com/profile.php?id=${idFromMsg}`;
              break;
            }
          }
        }

        // Extract profile ID from URL (profile link or Message link)
        let profileId = null;
        if (profileUrl && typeof profileUrl === 'string') {
          const idMatch = profileUrl.match(/profile\.php\?id=(\d+)/) ||
                         profileUrl.match(/[?&]profile_id=(\d+)/) ||
                         profileUrl.match(/user\/(\d+)/) ||
                         profileUrl.match(/facebook\.com\/([^\/\?]+)/);
          if (idMatch) {
            profileId = idMatch[1];
          }
        }

        // Skip UI labels that are not real profile names (See all, Friends, Notifications, etc.)
        const acceptedNameBlocklist = /^(See all|Friends?|Notifications?|Friend requests?|Add friend|Message|Confirm|Delete|Sponsored|Build Your App Now)$/i;
        if (acceptedNameBlocklist.test(profileName.trim())) continue;
        if (profileName === 'Unknown' && !profileUrl) continue;

        if (profileName !== 'Unknown' || profileUrl) {
          
          // If we have name but no URL/ID, try to resolve from pending requests (we stored them when they sent the request)
          if ((!profileUrl || !profileId) && profileName !== 'Unknown') {
            const pending = pendingRequests.find(p =>
              (p.name && profileName && p.name.toLowerCase().trim() === profileName.toLowerCase().trim()) ||
              (p.profileId && profileId && p.profileId === profileId)
            );
            if (pending) {
              if (!profileUrl && (pending.profileUrl || pending.profileId)) {
                profileUrl = pending.profileUrl || (pending.profileId && /^\d+$/.test(String(pending.profileId)) ? `https://www.facebook.com/profile.php?id=${pending.profileId}` : null);
              }
              if (!profileId && pending.profileId) profileId = pending.profileId;
            }
          }

          // Only add entries we can act on (have URL or ID). Skip status-only cards like "You're now friends with Pamela." when we have no link – avoids repeated warnings and processing.
          if (!profileUrl && !profileId) continue;

          // Create a unique key for this accepted request
          const requestKey = profileId || profileUrl || profileName.toLowerCase();

          // Check if we've already processed this request
          if (!acceptedRequestsTracked.has(requestKey)) {
            acceptedProfiles.push({
              name: profileName,
              url: profileUrl,
              profileId: profileId,
              key: requestKey,
              entryElement: entry // Store the entry element for later use
            });
          }
        }
      }
    }
    
    if (acceptedProfiles.length === 0) {
      console.log('[Friender] No new accepted requests found on friend requests page');
      return;
    }
    
    // Dedupe by key so we don't process the same person twice (and show toast only once)
    const seenKeys = new Set();
    const uniqueAccepted = acceptedProfiles.filter(p => {
      if (seenKeys.has(p.key)) return false;
      seenKeys.add(p.key);
      return true;
    });
    if (uniqueAccepted.length < acceptedProfiles.length) {
      console.log(`[Friender] Deduplicated accepted: ${acceptedProfiles.length} → ${uniqueAccepted.length} unique`);
    }
    
    console.log(`[Friender] ✅ Found ${uniqueAccepted.length} newly accepted friend request(s) on friend requests page`);
    
    // Process each accepted request
    for (const profile of uniqueAccepted) {
      console.log(`[Friender] Processing accepted request for: ${profile.name}`);
      
      // If we still don't have URL/ID, try once more from pending (they sent the request – we stored their URL)
      if ((!profile.url && !profile.profileId) && profile.name !== 'Unknown') {
        const pending = pendingRequests.find(p =>
          p.name && profile.name && p.name.toLowerCase().trim() === profile.name.toLowerCase().trim()
        );
        if (pending) {
          profile.url = profile.url || pending.profileUrl || (pending.profileId && /^\d+$/.test(String(pending.profileId)) ? `https://www.facebook.com/profile.php?id=${pending.profileId}` : null);
          profile.profileId = profile.profileId || pending.profileId || null;
          if (profile.profileId) profile.key = profile.profileId;
          if (profile.url || profile.profileId) console.log(`[Friender] Resolved URL/ID for ${profile.name} from pending request`);
        }
      }
      // Fallback: extract profile link from the card DOM (entryElement) if we still have no url/profileId
      if ((!profile.url || !profile.profileId) && profile.entryElement) {
        const links = profile.entryElement.querySelectorAll('a[href]');
        for (const a of links) {
          const href = a.href || a.getAttribute('href');
          if (!href) continue;
          const full = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
          if (isFacebookProfileUrl(full)) {
            profile.url = full;
            const id = full.match(/profile\.php\?id=(\d+)/)?.[1] || full.match(/[?&]profile_id=(\d+)/)?.[1] || full.match(/\/user\/(\d+)/)?.[1];
            if (id) {
              profile.profileId = id;
              profile.key = profile.profileId;
            } else {
              profile.key = profile.key || profile.url || profile.name?.toLowerCase();
            }
            if (profile.url || profile.profileId) console.log(`[Friender] Resolved URL/ID for ${profile.name} from card link`);
            break;
          }
        }
        // Also try Message link (e.g. /messages/t/61587205104052) to get profile ID
        if (!profile.profileId && !profile.url) {
          const msgLinks = profile.entryElement.querySelectorAll('a[href*="/messages/t/"], a[href*="/messages/thread/"]');
          for (const a of msgLinks) {
            const href = a.href || a.getAttribute('href') || '';
            const idFromMsg = href.match(/\/messages\/t\/(\d+)/)?.[1] || href.match(/\/messages\/thread\/[^\/]*\/(\d+)/)?.[1];
            if (idFromMsg && /^\d+$/.test(idFromMsg)) {
              profile.url = `https://www.facebook.com/profile.php?id=${idFromMsg}`;
              profile.profileId = idFromMsg;
              profile.key = profile.profileId;
              console.log(`[Friender] Resolved URL/ID for ${profile.name} from Message link`);
              break;
            }
          }
        }
      }
      
      // Mark as tracked
      acceptedRequestsTracked.add(profile.key);
      
      // Wait a bit before processing next
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send message automatically: try from card (Message button + panel), else open Messenger tab and send there (no profile opening)
      if (window.facebookHandler && (profile.url || profile.profileId)) {
        const profilePageUrl = getProfileUrlForNavigation(profile);
        let messageSent = false;
        try {
          let messageButton = null;
          if (profile.entryElement) {
            messageButton = profile.entryElement.querySelector('div[aria-label="Message"]') ||
                          profile.entryElement.querySelector('div[aria-label*="Message"]') ||
                          profile.entryElement.querySelector('a[href*="/messages/"]') ||
                          profile.entryElement.querySelector('a[href*="messages/t/"]') ||
                          Array.from(profile.entryElement.querySelectorAll('div[role="button"], span[role="button"], a')).find(b => {
                            const txt = (b.textContent || '').toLowerCase();
                            const ariaLabel = (b.getAttribute('aria-label') || '').toLowerCase();
                            const href = b.getAttribute('href') || '';
                            return (txt.includes('message') || ariaLabel.includes('message') || href.includes('/messages/')) &&
                                   !txt.includes('add friend');
                          });
          }

          if (messageButton) {
            console.log(`[Friender] Found message button for ${profile.name}, opening chat and sending...`);
            messageButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 500));
            if (window.facebookHandler.simulateClick) {
              window.facebookHandler.simulateClick(messageButton);
            } else {
              messageButton.click();
            }
            await new Promise(resolve => setTimeout(resolve, 4000));
            const pendingForProfile = pendingRequests.find(req =>
              (req.profileId && profile.profileId && req.profileId === profile.profileId) ||
              (req.name && profile.name && req.name.toLowerCase() === profile.name.toLowerCase())
            );
            const messageText = pendingForProfile?.storedMessage || null;
            try {
              const sendResult = await window.facebookHandler.sendMessage(profilePageUrl || undefined, messageText, 'after_accept', profile.name);
              messageSent = sendResult === true;
            } catch (sendErr) {
              console.error(`[Friender] sendMessage threw for ${profile.name}:`, sendErr);
            }
          }

          if (!messageSent && (profilePageUrl || profile.profileId)) {
            const profileUrl = profilePageUrl || getProfileUrlForNavigation(profile);
            const pendingForProfile = pendingRequests.find(req =>
              (req.profileId && profile.profileId && req.profileId === profile.profileId) ||
              (req.name && profile.name && req.name.toLowerCase() === profile.name.toLowerCase())
            );
            const storedMessage = pendingForProfile?.storedMessage || null;
            // Prefer opening Messenger thread directly when we have numeric profileId – no profile Message button needed, more reliable
            const hasNumericId = profile.profileId && /^\d+$/.test(String(profile.profileId));
            if (hasNumericId && typeof window.openMessengerAndSendMessageWait === 'function') {
              console.log(`[Friender] Opening Messenger in background to send message to ${profile.name}...`);
              const opened = await window.openMessengerAndSendMessageWait(profile.profileId, profile.name, 'after_accept', storedMessage);
              if (opened && window.showFrienderToast) {
                window.showFrienderToast('Sending message…', `Message will be sent to ${profile.name} in the background.`, 'success');
              }
            } else if (profileUrl && typeof window.openProfileAndSendMessage === 'function') {
              console.log(`[Friender] Opening profile in background to send message to ${profile.name}...`);
              const opened = await window.openProfileAndSendMessage(profileUrl, profile.profileId, profile.name, 'after_accept', storedMessage);
              if (opened && window.showFrienderToast) {
                window.showFrienderToast('Sending message…', `Message will be sent to ${profile.name} in the background.`, 'success');
              }
            }
          } else if (messageSent === true) {
            console.log(`[Friender] ✅ Message sent successfully to ${profile.name} after accepting their friend request`);
            const pendingForProfile = pendingRequests.find(req =>
              (req.profileId && profile.profileId && req.profileId === profile.profileId) ||
              (req.name && profile.name && req.name.toLowerCase() === profile.name.toLowerCase())
            );
            if (pendingForProfile) {
              pendingForProfile.messageSent = true;
              pendingForProfile.messageSentAt = Date.now();
              await chrome.storage.local.set({ pendingFriendRequests: pendingRequests });
            }
            if (window.showFrienderToast) {
              window.showFrienderToast('Message Sent!', `Message sent to ${profile.name} after accepting friend request.`, 'success');
            }
          }
        } catch (error) {
          console.error(`[Friender] Error sending message to ${profile.name}:`, error);
          const profileUrl = getProfileUrlForNavigation(profile);
          const pendingForProfile = pendingRequests.find(req =>
            (req.profileId && profile.profileId && req.profileId === profile.profileId) ||
            (req.name && profile.name && req.name.toLowerCase() === profile.name.toLowerCase())
          );
          const storedMessage = pendingForProfile?.storedMessage || null;
          const hasNumericId = profile.profileId && /^\d+$/.test(String(profile.profileId));
          if (hasNumericId && typeof window.openMessengerAndSendMessageWait === 'function') {
            const opened = await window.openMessengerAndSendMessageWait(profile.profileId, profile.name, 'after_accept', storedMessage);
            if (opened && window.showFrienderToast) {
              window.showFrienderToast('Sending message…', `Message will be sent to ${profile.name} in the background.`, 'success');
            }
          } else if (profileUrl && typeof window.openProfileAndSendMessage === 'function') {
            const opened = await window.openProfileAndSendMessage(profileUrl, profile.profileId, profile.name, 'after_accept', storedMessage);
            if (opened && window.showFrienderToast) {
              window.showFrienderToast('Sending message…', `Message will be sent to ${profile.name} in the background.`, 'success');
            }
          }
        }
      } else {
        if (!window.facebookHandler) console.warn(`[Friender] facebookHandler not available for ${profile.name}`);
        if (!profile.url && !profile.profileId) console.warn(`[Friender] No profile.url or profileId for ${profile.name}`);
      }
    }
    
    // Save tracked requests (convert Set to Array for storage)
    await chrome.storage.local.set({ acceptedRequestsTracked: Array.from(acceptedRequestsTracked) });
    
  } catch (error) {
    if (window.frienderIsContextInvalidatedError?.(error)) {
      window.frienderOnContextInvalidated?.();
      return;
    }
    console.error('[Friender] Error in checkAcceptedRequestsOnFriendRequestsPage:', error);
  }
}

// Helper: extract name and profile URL from a DOM node (for declined "Request removed" sub-card).
function extractProfileFromDeclinedCard(cardEl) {
  if (!cardEl || !cardEl.querySelectorAll) return null;
  let profileName = 'Unknown';
  const nameSpans = cardEl.querySelectorAll('span[dir="auto"]');
  for (const span of nameSpans) {
    const txt = span.textContent?.trim() || '';
    if (txt.length > 2 && txt.length < 100 &&
        !txt.includes('mutual friends') &&
        !txt.includes('Declined') && !txt.includes('Request removed') &&
        !txt.includes('ago') && !isFriendRequestUILabel(txt) &&
        !looksLikeLocation(txt) &&
        !/^\d+[mhd]$/.test(txt)) {
      profileName = txt;
      break;
    }
  }
  if (profileName === 'Unknown') {
    for (const span of cardEl.querySelectorAll('span[dir="auto"] span')) {
      const txt = span.textContent?.trim() || '';
      if (txt.length > 2 && txt.length < 100 && !txt.includes('mutual') && !txt.includes('Request removed') && !looksLikeLocation(txt)) {
        profileName = txt;
        break;
      }
    }
  }
  profileName = profileName.replace(/\s+/g, ' ').trim();
  profileName = stripTimestampFromName(profileName);
  profileName = normalizeFriendRequestDisplayName(profileName);
  if (profileName === 'Unknown' || !profileName) return null;

  let profileUrl = null;
  let profileId = null;
  const links = cardEl.querySelectorAll('a[href]');
  for (const link of links) {
    const href = link.href || link.getAttribute('href');
    if (!href) continue;
    try {
      const fullHref = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
      if (isFacebookProfileUrl(fullHref)) {
        profileUrl = fullHref;
        break;
      }
      const idFromHref = fullHref.match(/profile\.php\?id=(\d+)/)?.[1] || fullHref.match(/[?&]profile_id=(\d+)/)?.[1] || fullHref.match(/\/user\/(\d+)/)?.[1];
      if (idFromHref) {
        profileUrl = `https://www.facebook.com/profile.php?id=${idFromHref}`;
        profileId = idFromHref;
        break;
      }
    } catch (_) {}
  }
  if (!profileUrl && profileName !== 'Unknown') {
    for (const link of links) {
      const href = (link.href || link.getAttribute('href') || '').trim();
      const idFromHref = href.match(/profile\.php\?id=(\d+)/)?.[1] || href.match(/[?&]profile_id=(\d+)/)?.[1] || href.match(/\/user\/(\d+)/)?.[1];
      if (idFromHref) {
        profileUrl = `https://www.facebook.com/profile.php?id=${idFromHref}`;
        profileId = idFromHref;
        break;
      }
    }
  }
  if (!profileUrl) return null;
  if (profileName === 'Unknown' || !profileName) profileName = 'Friend';
  if (!profileId) {
    const idMatch = profileUrl.match(/profile\.php\?id=(\d+)/) ||
                    profileUrl.match(/[?&]profile_id=(\d+)/) ||
                    profileUrl.match(/user\/(\d+)/);
    if (idMatch) profileId = idMatch[1];
  }
  return { profileName, profileUrl, profileId };
}

// Check for declined friend requests on the friend requests page
// Red card: "Send message when you decline a friend request you received from someone"
async function checkDeclinedRequestsOnFriendRequestsPage() {
  if (!isExtensionContextValid()) return;
  try {
    console.log('[Friender] Checking friend requests page for declined requests...');
    
    const result = await chrome.storage.local.get(['settings', 'declinedRequestsTracked']);
    const settings = result.settings || {};
    let declinedRequestsTracked = result.declinedRequestsTracked;
    if (Array.isArray(declinedRequestsTracked)) {
      declinedRequestsTracked = new Set(declinedRequestsTracked);
    } else if (!declinedRequestsTracked) {
      declinedRequestsTracked = new Set();
    }
    
    if (!settings?.messaging?.enabled) return;
    if (!settings?.messaging?.sendOnDecline) return;
    
    const requestEntries = document.querySelectorAll(
      '[role="article"], ' +
      'div[data-pagelet], ' +
      'div[class*="x1q0q8m5"], ' +
      'div[class*="x1n2onr6"][class*="x1qhh985"], ' +
      'div[class*="x6s0dn4"][class*="x1q0q8m5"]'
    );
    const declinedProfiles = [];
    const hasDeclinedStatus = (t) => t.includes('Declined') || t.includes('declined your friend request') || t.includes('Request removed');
    
    console.log(`[Friender] Checking ${requestEntries.length} entries for declined requests...`);
    
    for (const entry of requestEntries) {
      const text = entry.textContent || '';
      if (!hasDeclinedStatus(text)) continue;
      
      const hasConfirmButton = entry.querySelector('div[aria-label="Confirm"], button[aria-label="Confirm"]');
      const hasDeleteButton = entry.querySelector('div[aria-label="Delete"], button[aria-label="Delete"]');
      
      let cardToUse = entry;
      // If entry has both Confirm/Delete and "Request removed" (merged card), get the sub-card for the declined person only
      if ((hasConfirmButton || hasDeleteButton) && text.includes('Request removed')) {
        const requestRemovedEl = Array.from(entry.querySelectorAll('*')).find(el => {
          const t = (el.textContent || '').trim();
          return t === 'Request removed' || (t.length < 50 && t.includes('Request removed'));
        });
        if (requestRemovedEl) {
          let el = requestRemovedEl.parentElement;
          for (let w = 0; w < 20 && el && el !== entry; w++) {
            const count = countProfileLinksIn(el);
            if (count === 1) {
              cardToUse = el;
              break;
            }
            el = el.parentElement;
          }
        }
        // If no one-link sub-card, pick the profile link whose name appears right before "Request removed" (declined person)
        if (cardToUse === entry) {
          const beforeRemoved = text.split('Request removed')[0] || '';
          const allLinks = Array.from(entry.querySelectorAll('a[href]'));
          let best = null;
          let bestLastIdx = -1;
          for (const link of allLinks) {
            const href = link.href || link.getAttribute('href');
            if (!href) continue;
            let fullHref;
            try {
              fullHref = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
              if (!isFacebookProfileUrl(fullHref)) continue;
            } catch (_) { continue; }
            const linkName = (link.textContent || '').trim();
            const cleanLinkName = normalizeFriendRequestDisplayName(stripTimestampFromName(linkName));
            if (!cleanLinkName || cleanLinkName.length < 2) continue;
            if (!beforeRemoved.includes(cleanLinkName) && !beforeRemoved.includes(linkName)) continue;
            const lastIdx = Math.max(beforeRemoved.lastIndexOf(cleanLinkName), beforeRemoved.lastIndexOf(linkName));
            if (lastIdx > bestLastIdx) {
              bestLastIdx = lastIdx;
              best = { link, fullHref, linkName, cleanLinkName };
            }
          }
          if (best) {
            const { fullHref, cleanLinkName } = best;
            const profileName = cleanLinkName;
            let profileUrl = fullHref;
            let profileId = (profileUrl.match(/profile\.php\?id=(\d+)/) || profileUrl.match(/[?&]profile_id=(\d+)/) || profileUrl.match(/user\/(\d+)/))?.[1] || null;
            if (profileUrl.includes('profile_id=')) {
              const m = profileUrl.match(/[?&]profile_id=(\d+)/);
              if (m) {
                profileId = m[1];
                profileUrl = `https://www.facebook.com/profile.php?id=${profileId}`;
              }
            }
            const requestKey = profileId || profileUrl || profileName.toLowerCase();
            if (!declinedRequestsTracked.has(requestKey)) {
              declinedProfiles.push({
                name: profileName,
                url: profileUrl,
                profileId: profileId,
                key: requestKey,
                entryElement: entry
              });
            }
          }
        }
      } else if (hasConfirmButton || hasDeleteButton) {
        continue;
      }
      
      if (cardToUse !== entry) {
        const extracted = extractProfileFromDeclinedCard(cardToUse);
        if (!extracted || (!extracted.profileUrl && !extracted.profileId)) continue;
        const { profileName, profileUrl, profileId } = extracted;
        const requestKey = profileId || profileUrl || profileName.toLowerCase();
        if (declinedRequestsTracked.has(requestKey)) continue;
        declinedProfiles.push({
          name: profileName,
          url: profileUrl,
          profileId: profileId,
          key: requestKey,
          entryElement: cardToUse
        });
      } else if (!text.includes('Request removed') || !(hasConfirmButton || hasDeleteButton)) {
        const extracted = extractProfileFromDeclinedCard(cardToUse);
        if (!extracted || (!extracted.profileUrl && !extracted.profileId)) continue;
        const { profileName, profileUrl, profileId } = extracted;
        const requestKey = profileId || profileUrl || profileName.toLowerCase();
        if (declinedRequestsTracked.has(requestKey)) continue;
        declinedProfiles.push({
          name: profileName,
          url: profileUrl,
          profileId: profileId,
          key: requestKey,
          entryElement: cardToUse
        });
      }
    }
    
    // Fallback: entries with no Confirm/Delete and declined text (standalone declined card)
    if (declinedProfiles.length === 0) {
      for (const entry of requestEntries) {
        const text = entry.textContent || '';
        const hasConfirmButton = entry.querySelector('div[aria-label="Confirm"], button[aria-label="Confirm"]');
        const hasDeleteButton = entry.querySelector('div[aria-label="Delete"], button[aria-label="Delete"]');
        if (hasConfirmButton || hasDeleteButton) continue;
        if (!hasDeclinedStatus(text)) continue;
        
        const extracted = extractProfileFromDeclinedCard(entry);
        if (!extracted || (!extracted.profileUrl && !extracted.profileId)) continue;
        const { profileName, profileUrl, profileId } = extracted;
        const requestKey = profileId || profileUrl || profileName.toLowerCase();
        if (declinedRequestsTracked.has(requestKey)) continue;
        declinedProfiles.push({
          name: profileName,
          url: profileUrl,
          profileId: profileId,
          key: requestKey,
          entryElement: entry
        });
      }
    }
    
    if (declinedProfiles.length === 0) {
      return;
    }
    
    console.log(`[Friender] ✅ Found ${declinedProfiles.length} newly declined friend request(s)`);
    
    // Process each declined request
    for (const profile of declinedProfiles) {
      console.log(`[Friender] Processing declined request for: ${profile.name}`);
      
      // Mark as tracked
      declinedRequestsTracked.add(profile.key);
      
      // Wait a bit before processing next
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send message automatically (no profile opening)
      if (window.facebookHandler && (profile.url || profile.profileId)) {
        try {
          const profilePageUrl = getProfileUrlForNavigation(profile);
          let messageSent = false;
          let messageButton = null;
          if (profile.entryElement) {
            messageButton = profile.entryElement.querySelector('div[aria-label="Message"]') ||
                          profile.entryElement.querySelector('div[aria-label*="Message"]') ||
                          profile.entryElement.querySelector('a[href*="/messages/"]') ||
                          Array.from(profile.entryElement.querySelectorAll('div[role="button"], span[role="button"], a')).find(b => {
                            const text = (b.textContent || '').toLowerCase();
                            const ariaLabel = (b.getAttribute('aria-label') || '').toLowerCase();
                            const href = b.getAttribute('href') || '';
                            return (text.includes('message') || ariaLabel.includes('message') || href.includes('/messages/')) &&
                                   !text.includes('add friend');
                          });
          }
          if (messageButton) {
            console.log(`[Friender] Found message button for ${profile.name}, opening chat and sending...`);
            messageButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 500));
            if (window.facebookHandler.simulateClick) window.facebookHandler.simulateClick(messageButton);
            else messageButton.click();
            await new Promise(resolve => setTimeout(resolve, 4000));
            try {
              messageSent = await window.facebookHandler.sendMessage(profilePageUrl, null, 'decline', profile.name);
            } catch (e) {
              console.error(`[Friender] sendMessage threw for declined ${profile.name}:`, e);
            }
          }
          if (!messageSent) {
            const profilePageUrl = getProfileUrlForNavigation(profile);
            if (profilePageUrl && typeof window.openProfileAndSendMessage === 'function') {
              console.log(`[Friender] Opening profile in background to send decline message to ${profile.name}...`);
              const opened = await window.openProfileAndSendMessage(profilePageUrl, profile.profileId, profile.name, 'decline');
              if (opened && window.showFrienderToast) {
                window.showFrienderToast('Sending…', `Message will be sent to ${profile.name} in the background.`, 'success');
              }
            }
          }
          if (messageSent) {
            console.log(`[Friender] ✅ Message sent successfully to ${profile.name} after declining their friend request`);
            if (window.showFrienderToast) {
              window.showFrienderToast('Message Sent!', `Message sent to ${profile.name} after declining friend request.`, 'success');
            }
          }
        } catch (error) {
          console.error(`[Friender] Error sending decline message to ${profile.name}:`, error);
          const profilePageUrl = getProfileUrlForNavigation(profile);
          if (profilePageUrl && typeof window.openProfileAndSendMessage === 'function') {
            await window.openProfileAndSendMessage(profilePageUrl, profile.profileId, profile.name, 'decline');
          }
        }
      }
    }
    
    // Save tracked requests
    await chrome.storage.local.set({ declinedRequestsTracked: Array.from(declinedRequestsTracked) });
    
  } catch (error) {
    if (window.frienderIsContextInvalidatedError?.(error)) {
      window.frienderOnContextInvalidated?.();
      return;
    }
    console.error('[Friender] Error in checkDeclinedRequestsOnFriendRequestsPage:', error);
  }
}

// Set up MutationObserver to watch for changes on friend requests page
// This detects when you accept a request and the page updates
function setupFriendRequestsPageObserver() {
  // Don't set up multiple observers
  if (window.friendRequestsPageObserver) {
    return;
  }
  
  console.log('[Friender] Setting up MutationObserver for friend requests page...');
  
  let lastCheckTime = 0;
  const checkInterval = 2000; // Check at most every 2 seconds
  
  window.friendRequestsPageObserver = new MutationObserver((mutations) => {
    const now = Date.now();
    if (now - lastCheckTime < checkInterval) {
      return; // Throttle checks
    }
    lastCheckTime = now;
    
    // Check if we're still on friend requests page
    if (window.location.href.includes('/friends/requests')) {
      // Debounce - wait for DOM to settle after accept/decline (then re-check all three: new, accepted, declined)
      setTimeout(() => {
        checkFriendRequestsPageForAllActions();
      }, 600);
    }
  });
  
  // Start observing
  window.friendRequestsPageObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  console.log('[Friender] MutationObserver set up for friend requests page');
}

// Check if current profile is pending and accepted, then send message
async function checkPendingProfileAndSendMessage() {
  try {
    const profileUrl = window.location.href.split('?')[0];
    const result = await chrome.storage.local.get(['pendingFriendRequests', 'settings']);
    const pendingRequests = result.pendingFriendRequests || [];
    const settings = result.settings || {};
    
    // Find matching pending request
    const pendingRequest = pendingRequests.find(req => 
      req.url === profileUrl && !req.messageSent
    );
    
    if (!pendingRequest) {
      return { success: false, reason: 'not_pending' };
    }
    
    // Check if friend request was accepted
    const isFriend = checkFriendStatusOnPage();
    
    if (!isFriend) {
      return { success: false, reason: 'not_accepted' };
    }
    
    // Friend request was accepted - send message
    console.log(`[Friender] Friend request accepted for ${pendingRequest.name}, sending message...`);
    
    // Find and click message button
    let messageButton = document.querySelector('div[aria-label="Message"]') ||
                       document.querySelector('a[href*="/messages/"]') ||
                       Array.from(document.querySelectorAll('div[role="button"], span[role="button"]')).find(b => {
                         const text = b.textContent?.toLowerCase() || '';
                         const ariaLabel = b.getAttribute('aria-label')?.toLowerCase() || '';
                         return text.includes('message') || ariaLabel.includes('message');
                       });
    
    if (messageButton) {
      messageButton.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Send message using facebook handler
      if (window.facebookHandler) {
        await window.facebookHandler.sendMessage(profileUrl, pendingRequest.storedMessage || null, 'after_accept', pendingRequest.name);
        console.log(`[Friender] Message sent to ${pendingRequest.name}`);
        
        // Mark as message sent
        pendingRequest.messageSent = true;
        pendingRequest.messageSentAt = Date.now();
        await chrome.storage.local.set({ pendingFriendRequests: pendingRequests });
        
        return { success: true, messageSent: true };
      } else {
        return { success: false, reason: 'handler_unavailable' };
      }
    } else {
      return { success: false, reason: 'message_button_not_found' };
    }
  } catch (error) {
    console.error('[Friender] Error in checkPendingProfileAndSendMessage:', error);
    return { success: false, error: error.message };
  }
}

