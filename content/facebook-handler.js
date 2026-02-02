/**
 * Facebook Handler
 * Handles DOM interaction with Facebook pages
 * Uses defensive selectors that can be easily updated if Facebook changes their structure
 */

// Add CSS animation for counter pulse
if (!document.getElementById('friender-counter-styles')) {
  const style = document.createElement('style');
  style.id = 'friender-counter-styles';
  style.textContent = `
    @keyframes frienderCounterPulse {
      0% { transform: translate(-50%, -50%) scale(1); }
      50% { transform: translate(-50%, -50%) scale(1.1); }
      100% { transform: translate(-50%, -50%) scale(1); }
    }
  `;
  document.head.appendChild(style);
}

class FacebookHandler {
  constructor() {
    this._lastSentKey = null;
    this._lastSentTime = 0;
    this._sendDebounceMs = 6000;
    this.selectors = {
      // Friend request button selectors (multiple fallbacks)
      // Updated with more comprehensive selectors for better detection
      addFriendButton: [
        'div[aria-label^="Add Friend"]',
        'div[aria-label^="Add friend"]',
        'div[aria-label^="add friend"]',
        'a[href*="/friends/add"]',
        'a[href*="/friends/center/add"]',
        '[data-testid*="add-friend"]',
        '[data-testid="add-friend-button"]',
        'div[role="button"]'
      ],

      // Message button selectors
      messageButton: [
        'div[aria-label*="Message"]',
        'a[href*="/messages/t/"]',
        '[data-testid*="message"]'
      ],

      // Message input selectors – Lexical editor first (Facebook chat: data-lexical-editor, aria-label="Message", aria-placeholder="Aa")
      messageInput: [
        'div[data-lexical-editor="true"][aria-label="Message"]',
        'div[contenteditable="true"][role="textbox"][aria-label="Message"]',
        'div[contenteditable="true"][role="textbox"][aria-placeholder="Aa"]',
        'div[contenteditable="true"][role="textbox"][aria-label*="Message"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-testid*="message"]',
        'div[contenteditable="true"][aria-label*="message"]',
        'div[contenteditable="true"]',
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="message"]'
      ],

      // Send button selectors
      sendButton: [
        'div[aria-label*="Send"]',
        'div[aria-label*="Press Enter to send"]',
        '[data-testid*="send"]'
      ],

      // Friend request sent indicator
      friendRequestSent: [
        'div[aria-label^="Friend Request Sent"]',
        'div[aria-label^="Request sent"]'
      ],

      // Accept friend request button
      acceptFriendRequest: [
        'div[aria-label^="Confirm"]',
        'div[aria-label^="Accept"]'
      ],

      // Cancel friend request button
      cancelRequestButton: [
        'div[aria-label^="Cancel Request"]',
        'div[aria-label^="Cancel request"]',
        'div[role="button"]'
      ]
    };
  }

  // Find element using multiple selector strategies
  findElement(selectorArray, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const trySelectors = () => {
        for (const selector of selectorArray) {
          try {
            // Handle :contains() pseudo-selector manually
            if (selector.includes(':contains(')) {
              const text = selector.match(/:contains\("([^"]+)"\)/)?.[1];
              if (text) {
                const elements = Array.from(document.querySelectorAll('*'));
                const found = elements.find(el =>
                  el.textContent?.includes(text) &&
                  (el.getAttribute('role') === 'button' || el.tagName === 'A' || el.tagName === 'SPAN')
                );
                if (found) {
                  resolve(found);
                  return;
                }
              }
            } else {
              const element = document.querySelector(selector);
              if (element && this.isVisible(element)) {
                resolve(element);
                return;
              }
            }
          } catch (e) {
            // Continue to next selector
          }
        }

        // If not found and timeout not reached, try again
        if (Date.now() - startTime < timeout) {
          setTimeout(trySelectors, 200);
        } else {
          resolve(null);
        }
      };

      trySelectors();
    });
  }

  // Check if element is visible
  isVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0
    );
  }

  // Wait for element to appear
  async waitForElement(selectorArray, timeout = 10000) {
    const element = await this.findElement(selectorArray, timeout);
    if (!element) {
      throw new Error(`Element not found: ${selectorArray[0]}`);
    }
    return element;
  }

  // Send friend request
  async sendFriendRequest(profileUrl = null) {
    try {
      // If profileUrl provided, navigate first (in real implementation)
      // For now, assume we're already on the profile page

      console.log('[FacebookHandler] Attempting to send friend request...');

      // Find Add Friend button with extended timeout
      const button = await this.waitForElement(this.selectors.addFriendButton, 8000);

      if (!button) {
        // Try alternative detection method
        const altButton = await this.findAddFriendButtonAlternative();
        if (!altButton) {
          throw new Error('Add Friend button not found on page');
        }
        return await this.clickAddFriendButton(altButton);
      }

      return await this.clickAddFriendButton(button);

    } catch (error) {
      console.error('[FacebookHandler] Error sending friend request:', error);
      throw error;
    }
  }

  // Alternative method to find Add Friend button
  async findAddFriendButtonAlternative() {
    // Search for buttons with "Add" text
    const allButtons = Array.from(document.querySelectorAll('div[role="button"], a[role="button"], button'));

    for (const btn of allButtons) {
      const text = btn.textContent?.toLowerCase() || '';
      const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';

      if ((text.includes('add friend') || ariaLabel.includes('add friend')) &&
        this.isVisible(btn) &&
        !text.includes('sent') &&
        !text.includes('cancel')) {
        return btn;
      }
    }

    return null;
  }

  // Click Add Friend button with verification
  async clickAddFriendButton(button) {
    try {
      // Check if already sent
      const sentIndicator = await this.findElement(this.selectors.friendRequestSent, 1000);
      if (sentIndicator) {
        console.log('[FacebookHandler] Friend request already sent');
        return true;
      }

      // Check button state
      const buttonText = button.textContent?.toLowerCase() || '';
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

      if (buttonText.includes('sent') || buttonText.includes('cancel') ||
        ariaLabel.includes('sent') || ariaLabel.includes('cancel')) {
        console.log('[FacebookHandler] Friend request already sent (button state)');
        return true;
      }

      // Scroll into view smoothly
      button.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(800);

      // Wait for button to be stable
      await this.delay(300);

      // Click the button
      console.log('[FacebookHandler] Clicking Add Friend button');
      this.simulateClick(button);

      // Wait for Facebook to process
      await this.delay(2500);

      // Verify it was sent - multiple checks
      const verification = await this.verifyFriendRequestSent(button);

      if (verification.success) {
        console.log('[FacebookHandler] Friend request sent successfully');
        return true;
      } else {
        throw new Error(verification.reason || 'Could not verify friend request was sent');
      }

    } catch (error) {
      console.error('[FacebookHandler] Error in clickAddFriendButton:', error);
      throw error;
    }
  }

  // Verify friend request was sent
  async verifyFriendRequestSent(originalButton) {
    // Method 1: Check for sent indicator
    const sentIndicator = await this.findElement(this.selectors.friendRequestSent, 2000);
    if (sentIndicator) {
      return { success: true, method: 'indicator' };
    }

    // Method 2: Check if button text changed
    const newButton = await this.findElement(this.selectors.addFriendButton, 2000);
    if (newButton) {
      const buttonText = newButton.textContent?.toLowerCase() || '';
      const ariaLabel = newButton.getAttribute('aria-label')?.toLowerCase() || '';

      if (buttonText.includes('sent') || buttonText.includes('cancel') ||
        buttonText.includes('request sent') ||
        ariaLabel.includes('sent') || ariaLabel.includes('cancel')) {
        return { success: true, method: 'button-state' };
      }
    }

    // Method 3: Check original button state
    if (originalButton) {
      const buttonText = originalButton.textContent?.toLowerCase() || '';
      const ariaLabel = originalButton.getAttribute('aria-label')?.toLowerCase() || '';

      if (buttonText.includes('sent') || buttonText.includes('cancel') ||
        ariaLabel.includes('sent') || ariaLabel.includes('cancel')) {
        return { success: true, method: 'original-button' };
      }
    }

    // Method 4: Check for "Cancel Request" button
    const cancelButton = await this.findElement([
      'div[aria-label*="Cancel Request"]',
      'span:contains("Cancel Request")',
      'div[role="button"]:has-text("Cancel")'
    ], 2000);

    if (cancelButton) {
      return { success: true, method: 'cancel-button' };
    }

    return { success: false, reason: 'No verification method succeeded' };
  }

  // Send message - Enhanced with better detection and retry logic (single send per recipient)
  async sendMessage(recipientUrl = null, messageText = null, trigger = 'manual', profileName = null) {
    try {
      // Get message template if not provided (only from segment/group – no defaults)
      if (!messageText) {
        messageText = await this.getMessageTemplate(trigger, profileName);
      }
      if (!messageText || !String(messageText).trim()) {
        let groupName = 'default';
        try {
          const r = await chrome.storage.local.get(['settings']);
          groupName = r.settings?.messageGroups ?? r.settings?.messaging?.sendAfterRequestGroup ?? 'default';
        } catch (e) {
          if (window.frienderIsContextInvalidatedError?.(e)) { window.frienderOnContextInvalidated?.(); return false; }
        }
        console.log('[FacebookHandler] No message template selected (segment/group) – skipping send. Trigger:', trigger, 'Message Groups setting:', groupName);
        return false;
      }

      // Replace keywords in message if profile name is provided
      if (profileName && (messageText.includes('{First Name}') || messageText.includes('{Last Name}'))) {
        messageText = this.replaceKeywords(messageText, profileName);
      }
      const trimmedMessage = String(messageText).trim();
      const recipientKey = (recipientUrl || '').replace(/\?.*$/, '') || (profileName || '').toLowerCase();
      const sentKey = recipientKey + '|' + trimmedMessage.slice(0, 50);
      if (this._lastSentKey === sentKey && (Date.now() - this._lastSentTime) < this._sendDebounceMs) {
        console.log('[FacebookHandler] Skipping duplicate send to same recipient within debounce window');
        return 'skipped'; // Caller should not mark as "tracked" – no message actually sent
      }
      // Cross-tab dedupe: avoid sending twice if multiple tabs or callers run (e.g. profile scanner + profile tab)
      const dedupeKey = 'lastMessageSentTo';
      let lastSent;
      try {
        const stored = await chrome.storage.local.get(dedupeKey);
        lastSent = stored[dedupeKey];
      } catch (e) {
        if (window.frienderIsContextInvalidatedError?.(e)) { window.frienderOnContextInvalidated?.(); return false; }
        throw e;
      }
      const DEDUPE_MS = 45000;
      if (lastSent && lastSent.key === recipientKey && (Date.now() - (lastSent.time || 0)) < DEDUPE_MS) {
        console.log('[FacebookHandler] Skipping – already sent to this recipient recently (cross-tab dedupe)');
        return 'skipped'; // Caller should not mark as "tracked" – no message actually sent this time
      }
      console.log('[FacebookHandler] Message to send:', JSON.stringify(trimmedMessage));

      // Helper: find message input in a root (document or shadowRoot)
      const findInputInRoot = (root) => {
        if (!root || !root.querySelector) return null;
        return root.querySelector('div[data-lexical-editor="true"][aria-label="Message"]') ||
          root.querySelector('div[contenteditable="true"][role="textbox"][aria-label="Message"]') ||
          root.querySelector('div[contenteditable="true"][role="textbox"][aria-placeholder="Aa"]') ||
          root.querySelector('div[contenteditable="true"][role="textbox"]') ||
          root.querySelector('div[contenteditable="true"][aria-label*="Message"]') ||
          root.querySelector('div[contenteditable="true"][aria-label*="Aa"]') ||
          root.querySelector('div[contenteditable="true"]') ||
          root.querySelector('textarea[placeholder*="Message"]') ||
          root.querySelector('textarea[placeholder*="Aa"]');
      };
      const findInputInShadowRoots = (root) => {
        let el = findInputInRoot(root);
        if (el) return el;
        try {
          for (const node of root.querySelectorAll('*')) {
            if (node.shadowRoot) {
              el = findInputInRoot(node.shadowRoot) || findInputInShadowRoots(node.shadowRoot);
              if (el) return el;
            }
          }
        } catch (_) {}
        return null;
      };

      // Enhanced message input detection - try multiple methods
      let messageInput = null;
      
      // Method 1: Try to find existing message input (if already in chat)
      messageInput = await this.findElement(this.selectors.messageInput, 2000);

      // Method 2: If not found, try to find and click Message button
      if (!messageInput) {
        const messageButton = await this.findElement(this.selectors.messageButton, 3000);
        if (messageButton) {
          console.log('[FacebookHandler] Found message button, clicking...');
          messageButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await this.delay(500);
          this.simulateClick(messageButton);
          await this.delay(3000); // Wait for chat to open
          messageInput = await this.waitForElement(this.selectors.messageInput, 5000);
        }
      }

      // Method 3: Try to find message input in Messenger popup/overlay (Facebook chat panel)
      if (!messageInput) {
        const messengerOverlay = document.querySelector('[role="dialog"], [aria-label*="Messenger"], [data-testid*="messenger"], [role="complementary"]');
        if (messengerOverlay) {
          messageInput = messengerOverlay.querySelector('div[contenteditable="true"][role="textbox"]') ||
                        messengerOverlay.querySelector('div[contenteditable="true"][aria-label*="Message"]') ||
                        messengerOverlay.querySelector('div[contenteditable="true"][aria-label*="Aa"]') ||
                        messengerOverlay.querySelector('div[contenteditable="true"]');
        }
      }

      // Method 4: Broader selectors – include aria-label "Aa" (Facebook placeholder), Lexical editor
      if (!messageInput) {
        messageInput = document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                      document.querySelector('div[contenteditable="true"][aria-label*="Message"]') ||
                      document.querySelector('div[contenteditable="true"][aria-label*="Aa"]') ||
                      document.querySelector('div[data-lexical-editor="true"]') ||
                      document.querySelector('div[contenteditable="true"][data-testid*="message"]') ||
                      document.querySelector('div[contenteditable="true"]') ||
                      document.querySelector('textarea[placeholder*="Message"]') ||
                      document.querySelector('textarea[placeholder*="message"]') ||
                      document.querySelector('textarea[placeholder*="Aa"]');
      }
      // Method 4b: Last resort – any contenteditable in a dialog (Facebook chat panel)
      if (!messageInput) {
        const dialog = document.querySelector('[role="dialog"], [role="complementary"], [data-pagelet*="ChatTab"]');
        if (dialog) {
          messageInput = dialog.querySelector('div[contenteditable="true"]') || dialog.querySelector('[contenteditable="true"]');
        }
      }

      // Method 5: Retry waiting for input (Lexical chat panel may mount after a delay; also check iframes + shadow roots each second)
      if (!messageInput) {
        console.log('[FacebookHandler] Message input not found yet, waiting up to 15s (main doc + iframes + shadow roots)...');
        for (let wait = 0; wait < 15; wait++) {
          await this.delay(1000);
          messageInput = findInputInRoot(document) || findInputInShadowRoots(document);
          if (!messageInput) {
            try {
              for (const frame of document.querySelectorAll('iframe')) {
                try {
                  const fdoc = frame.contentDocument || frame.contentWindow?.document;
                  if (!fdoc) continue;
                  messageInput = findInputInRoot(fdoc) || findInputInShadowRoots(fdoc);
                  if (messageInput) {
                    console.log('[FacebookHandler] Message input found inside iframe after', wait + 1, 's');
                    break;
                  }
                } catch (_) {}
              }
            } catch (_) {}
          }
          if (messageInput) {
            if (!messageInput.getAttribute?.('data-lexical-editor')) console.log('[FacebookHandler] Message input found after', wait + 1, 's');
            break;
          }
        }
      }

      // Method 6: Chat panel may be inside an iframe (Facebook sometimes renders Messenger in iframe); also check shadow roots
      if (!messageInput) {
        try {
          const iframes = document.querySelectorAll('iframe');
          for (const frame of iframes) {
            try {
              const fdoc = frame.contentDocument || frame.contentWindow?.document;
              if (!fdoc) continue;
              messageInput = findInputInRoot(fdoc) || findInputInShadowRoots(fdoc);
              if (messageInput) {
                console.log('[FacebookHandler] Message input found inside iframe');
                break;
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      if (!messageInput) {
        const bodyText = (document.body?.innerText || document.body?.textContent || '').toLowerCase();
        if (bodyText.includes("can't message this account") || bodyText.includes("you can't message this account")) {
          console.log('[FacebookHandler] Messaging not allowed for this account (e.g. not friends yet)');
          throw new Error('Messaging not allowed for this account');
        }
        if (bodyText.includes('message request limit') || bodyText.includes("you've reached the message request limit") || bodyText.includes('limit to how many requests you can send')) {
          console.log('[FacebookHandler] Message request limit reached – will store and retry when available');
          throw new Error('Message request limit reached');
        }
        const ceCount = document.querySelectorAll('[contenteditable="true"]').length;
        console.error('[FacebookHandler] Message input not found – panel may not have opened. contenteditables on page:', ceCount);
        throw new Error('Message input not found - may need to navigate to profile or open Messenger');
      }
      
      // Re-query so we have a fresh reference (only in main doc; if input was found in iframe, keep it)
      const inIframe = messageInput && messageInput.ownerDocument !== document;
      if (!inIframe) {
        const freshInput = document.querySelector('div[data-lexical-editor="true"][aria-label="Message"]') ||
          document.querySelector('div[contenteditable="true"][role="textbox"][aria-label="Message"]') ||
          document.querySelector('div[contenteditable="true"][role="textbox"]') ||
          messageInput;
        messageInput = freshInput;
      }
      // Re-check for message request limit (can appear in chat panel after opening)
      const bodyTextNow = (document.body?.innerText || document.body?.textContent || '').toLowerCase();
      if (bodyTextNow.includes('message request limit') || bodyTextNow.includes("you've reached the message request limit") || bodyTextNow.includes('limit to how many requests you can send')) {
        console.log('[FacebookHandler] Message request limit shown in chat – will store and retry when available');
        throw new Error('Message request limit reached');
      }
      console.log('[FacebookHandler] Message input found –', inIframe ? 'inside iframe –' : '', 'clicking input box, then typing...');

      // Use innermost contenteditable if this is a container (Facebook sometimes wraps the real input)
      let inputToUse = messageInput;
      const inner = messageInput.querySelector('[contenteditable="true"]');
      if (inner && !inner.querySelector('[contenteditable="true"]')) {
        inputToUse = inner;
      }

      // If input is inside an iframe, focus the iframe first so the input can receive focus
      if (inputToUse.ownerDocument !== document) {
        try {
          const frame = Array.from(document.querySelectorAll('iframe')).find(f => (f.contentDocument || f.contentWindow?.document) === inputToUse.ownerDocument);
          if (frame) {
            frame.focus?.();
            if (frame.contentWindow) frame.contentWindow.focus?.();
            await this.delay(200);
          }
        } catch (_) {}
      }
      // Click the input box so Facebook activates the composer (focus alone often isn't enough)
      inputToUse.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(400);
      this.simulateClick(inputToUse);
      await this.delay(300);
      inputToUse.focus();
      await this.delay(500);

      // Type message (single write – do not trigger extra events that could auto-send)
      await this.typeMessage(inputToUse, trimmedMessage);

      await this.delay(500);

      // Re-read after delay (Lexical updates DOM async). Never run fallback for contenteditable – would type twice and create "HiHi" or duplicated long text.
      const isContentEditableInput = inputToUse.isContentEditable || inputToUse.getAttribute?.('contenteditable') === 'true' ||
        (inputToUse.closest && inputToUse.closest('[data-lexical-editor="true"]'));
      const inputDoc = inputToUse.ownerDocument || document;
      let afterTypeText = (inputToUse.textContent || inputToUse.innerText || '').trim();
      if (afterTypeText === '' || !afterTypeText.includes(trimmedMessage.slice(0, 20))) {
        await this.delay(400);
        afterTypeText = (inputToUse.textContent || inputToUse.innerText || '').trim();
      }
      const alreadyHasMessage = afterTypeText && (afterTypeText === trimmedMessage || afterTypeText.includes(trimmedMessage.slice(0, 30)));

      // Skip fallback for any contenteditable (Facebook/Lexical) – typeMessage already inserted once; fallback would duplicate text
      if (!isContentEditableInput && !alreadyHasMessage && afterTypeText === '' && trimmedMessage && inputDoc.execCommand) {
        inputToUse.focus();
        try {
          const sel = inputDoc.getSelection();
          if (sel) {
            const range = inputDoc.createRange();
            range.selectNodeContents(inputToUse);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          inputDoc.execCommand('insertText', false, trimmedMessage);
          inputToUse.dispatchEvent(new Event('input', { bubbles: true }));
          await this.delay(300);
        } catch (_) {}
        afterTypeText = (inputToUse.textContent || inputToUse.innerText || '').trim();
      }
      if (!isContentEditableInput && !alreadyHasMessage && afterTypeText === '' && trimmedMessage) {
        try {
          const data = new DataTransfer();
          data.setData('text/plain', trimmedMessage);
          inputToUse.focus();
          inputToUse.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
          await this.delay(400);
          afterTypeText = (inputToUse.textContent || inputToUse.innerText || '').trim();
        } catch (_) {}
      }

      await this.delay(400);

      // If input still empty after typing and we had a message, typing likely failed – still try send button
      if (afterTypeText === '' && trimmedMessage) {
        console.warn('[FacebookHandler] Input still empty after typing – trying send button anyway');
      } else if (afterTypeText === '') {
        console.log('[FacebookHandler] Input empty after typing – treating as sent (no send button click)');
        this._lastSentKey = sentKey;
        this._lastSentTime = Date.now();
        await chrome.storage.local.set({ lastMessageSentTo: { key: recipientKey, time: Date.now() } });
        return true;
      }

      // Find and click send button – ONLY the chat composer Send (never Share / "Send in Messenger")
      await this.delay(800);
      const docForSend = inputToUse.ownerDocument || document;
      const isShareOrSendInMessenger = (el) => {
        const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').toLowerCase();
        if (label.includes('share')) return true;
        if (label.includes('send in messenger') || label.includes('send to messenger')) return true;
        const inShareDialog = el.closest('[role="dialog"], [aria-modal="true"]');
        if (inShareDialog) {
          const dialogText = (inShareDialog.getAttribute('aria-label') || inShareDialog.textContent || '').toLowerCase();
          if (dialogText.includes('share')) return true;
        }
        return false;
      };
      const sendSelectors = [
        'div[aria-label*="Press Enter"]', 'div[aria-label="Send"]',
        'div[aria-label*="Send"]', 'div[aria-label*="send"]',
        '[data-testid*="send"]', 'div[role="button"][aria-label*="Send"]', 'span[role="button"][aria-label*="Send"]'
      ];
      let sendButton = null;
      // 1) Only look in the smallest composer that wraps the message input (same row as input – chat send, not Share)
      let composer = inputToUse.parentElement;
      for (let up = 0; up < 8 && composer; up++) {
        const candidates = [];
        for (const sel of sendSelectors) {
          composer.querySelectorAll(sel).forEach(el => candidates.push(el));
        }
        const valid = candidates.find(el => !isShareOrSendInMessenger(el));
        if (valid) {
          sendButton = valid;
          break;
        }
        composer = composer.parentElement;
      }
      // 2) If not found by walking up, use chat panel container but still exclude Share
      if (!sendButton) {
        const chatContainer = inputToUse.closest('[role="dialog"], [role="complementary"], [data-pagelet*="Chat"], [class*="composer"], [class*="messenger"]');
        if (chatContainer) {
          for (const sel of sendSelectors) {
            for (const el of chatContainer.querySelectorAll(sel)) {
              if (!isShareOrSendInMessenger(el)) {
                sendButton = el;
                break;
              }
            }
            if (sendButton) break;
          }
        }
      }
      if (!sendButton) {
        const fallback = await this.waitForElement(this.selectors.sendButton, 3000);
        if (fallback && !isShareOrSendInMessenger(fallback)) sendButton = fallback;
      }
      if (!sendButton) {
        console.error('[FacebookHandler] Send button not found – cannot send message (avoided Share / Send in Messenger)');
        throw new Error('Send button not found');
      }

      console.log('[FacebookHandler] Clicking send button (once)');
      try {
        sendButton.scrollIntoView({ block: 'center', inline: 'center' });
        await this.delay(200);
      } catch (_) {}
      // Use simulateClick so the event registers even when tab is in background (native click() can be ignored)
      this.simulateClick(sendButton);
      await this.delay(2000);

      this._lastSentKey = sentKey;
      this._lastSentTime = Date.now();
      await chrome.storage.local.set({ lastMessageSentTo: { key: recipientKey, time: Date.now() } });

      const inputText = (inputToUse.textContent || inputToUse.innerText || '').trim();
      if (inputText === '') {
        console.log('[FacebookHandler] Message sent successfully');
      } else {
        console.log('[FacebookHandler] Send button clicked; input may clear shortly. Treating as sent.');
      }
      return true;

    } catch (error) {
      if (window.frienderIsContextInvalidatedError?.(error)) {
        window.frienderOnContextInvalidated?.();
        return false;
      }
      console.error('[FacebookHandler] Error sending message:', error);
      throw error;
    }
  }

  // Type message – set full text at once so Facebook's input doesn't send per character
  async typeMessage(element, text) {
    if (!text || typeof text !== 'string') return;
    const message = String(text).trim();
    if (!message) return;

    const doc = element.ownerDocument || document;
    const isLexical = element.isContentEditable ||
      (element.getAttribute && element.getAttribute('data-lexical-editor') === 'true') ||
      (element.closest && !!element.closest('[data-lexical-editor="true"]'));

    // Only add range if node is in document (avoids "addRange(): The given range isn't in document")
    const safeSelectElement = (target) => {
      try {
        if (!doc.contains(target)) return;
        const sel = doc.getSelection();
        if (!sel) return;
        const range = doc.createRange();
        range.selectNodeContents(target);
        range.collapse(true);
        if (!doc.contains(range.startContainer)) return;
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    };

    // Click then focus so the input box is the active composer
    try {
      element.click();
      await this.delay(200);
    } catch (_) {}
    element.focus();
    await this.delay(isLexical ? 400 : 300);

    let currentText = '';

    // Helper: re-read and return true if message is in the element (avoids typing twice)
    const hasMessage = () => {
      const t = (element.textContent || element.innerText || '').trim();
      return t === message || (message.length >= 15 && t.includes(message.slice(0, 15)));
    };

    // Lexical editor (Facebook chat): select only the input's contents (never selectAll – that would select whole page), then insertText
    if (isLexical) {
      try {
        const target = element.querySelector('p') || element;
        safeSelectElement(target);
        doc.execCommand('insertText', false, message);
        await this.delay(200);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await this.delay(150);
      } catch (_) {}
      return;
    }

    // Non-Lexical: standard path (only when not Lexical)
    if (currentText !== message) {
      try { safeSelectElement(element); } catch (_) {}
      element.textContent = '';
      element.innerText = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await this.delay(150);
      element.textContent = message;
      element.innerText = message;
      element.dispatchEvent(new InputEvent('input', { data: message, bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await this.delay(200);
      currentText = (element.textContent || element.innerText || '').trim();
    }

    if (currentText !== message && doc.execCommand) {
      element.focus();
      try {
        safeSelectElement(element);
        doc.execCommand('insertText', false, message);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
      await this.delay(200);
      currentText = (element.textContent || element.innerText || '').trim();
    }

    if (currentText !== message) {
      element.focus();
      try {
        const data = new DataTransfer();
        data.setData('text/plain', message);
        element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
        await this.delay(300);
        currentText = (element.textContent || element.innerText || '').trim();
      } catch (_) {}
    }

    if (currentText !== message) {
      console.warn('[FacebookHandler] typeMessage: text may not have stuck. Got:', currentText.slice(0, 30) + (currentText.length > 30 ? '...' : ''));
    }
  }

  // Get message template based on trigger type and message group
  async getMessageTemplate(trigger = 'manual', profileName = null) {
    try {
      const result = await chrome.storage.local.get(['settings', 'segments', 'groups']);
      const settings = result.settings || {};
      if (result.segments) settings.segments = result.segments;
      if (result.groups) settings.groups = result.groups;
      const messaging = settings.messaging || {};
      
      // Get message group based on trigger
      let messageGroup = 'default';
      if (trigger === 'incoming_request') {
        messageGroup = messaging.incomingRequestGroup || messaging.sendOnIncomingRequestGroup || 'default';
      } else if (trigger === 'after_accept' || trigger === 'accept') {
        messageGroup = messaging.acceptGroup || messaging.sendAfterAcceptGroup || 'default';
      } else if (trigger === 'decline') {
        messageGroup = messaging.declineGroup || messaging.sendOnDeclineGroup || 'default';
      } else if (trigger === 'after_request') {
        // Run page saves selected template as settings.messageGroups (flat); also support nested friendRequest
        messageGroup = messaging.sendAfterRequestGroup || messaging.afterRequestGroup || settings.friendRequest?.messageGroups || settings.messageGroups || 'default';
      }
      if (trigger === 'after_request') {
        console.log('[FacebookHandler] getMessageTemplate(after_request): messageGroup =', JSON.stringify(messageGroup), '| settings.messageGroups =', JSON.stringify(settings.messageGroups), '| segments count =', (settings.segments || []).length, '| groups count =', (settings.groups || []).length);
      }
      
      // Run page (suggestions/group) dropdown shows segments and saves segment id – resolve segment first
      const segments = settings.segments || [];
      const selectedSegment = segments.find(s => s.id == messageGroup || s.name === messageGroup || String(s.id) === String(messageGroup));
      if (selectedSegment && messageGroup !== 'default') {
        if (!selectedSegment.message || !String(selectedSegment.message).trim()) {
          console.warn('[FacebookHandler] Segment "' + (selectedSegment.name || messageGroup) + '" has no message text – add text in Segments tab. No message will be sent.');
          return null;
        } else {
          const raw = selectedSegment.message.trim();
          if (raw) return this.replaceKeywords(raw, profileName);
        }
      }
      
      // Get message groups from settings (group contains items: segments, static, keywords)
      const groups = settings.groups || [];
      const selectedGroup = groups.find(g => g.name === messageGroup || g.id == messageGroup || String(g.id) === String(messageGroup));
      
      if (selectedGroup && selectedGroup.items && selectedGroup.items.length > 0) {
        // Use message group items (segments, static text, keywords)
        const items = selectedGroup.items;
        let message = '';
        
        for (const item of items) {
          if (item.type === 'segment') {
            // Get segment content
            const segments = settings.segments || [];
            const segment = segments.find(s => s.id === item.segmentId || s.name === item.segmentId);
            if (segment && segment.message) {
              message += segment.message;
            }
          } else if (item.type === 'static') {
            message += item.text || item.value || '';
          } else if (item.type === 'keyword') {
            // Replace keywords
            if (item.keyword === '{First Name}' && profileName) {
              const firstName = profileName.split(/\s+/)[0] || '';
              message += firstName;
            } else if (item.keyword === '{Last Name}' && profileName) {
              const nameParts = profileName.split(/\s+/);
              message += nameParts.slice(1).join(' ') || '';
            } else {
              message += item.keyword || '';
            }
          }
        }
        
        if (message.trim()) {
          return message.trim();
        }
        if (trigger === 'after_request') console.warn('[FacebookHandler] Group "' + (selectedGroup.name || messageGroup) + '" has no message content – add segments/static text in the group. No message will be sent.');
      } else if (trigger === 'after_request' && messageGroup !== 'default') {
        console.warn('[FacebookHandler] No segment or group matched messageGroup =', JSON.stringify(messageGroup), '– check Run page dropdown (Select Segment / Select Group) and that segment/group exists with message text.');
      }
      
      // No default/fallback – only send when user has selected a segment or group with message text
      return null;
    } catch (error) {
      if (window.frienderIsContextInvalidatedError?.(error)) {
        window.frienderOnContextInvalidated?.();
        return null;
      }
      console.error('[FacebookHandler] Error getting template:', error);
      return null;
    }
  }

  // Replace keywords in message template with actual profile data
  replaceKeywords(message, profileName) {
    if (!profileName || !message) return message;
    
    // Normalize to display name only (same logic as content-main normalizeFriendRequestDisplayName)
    let displayName = String(profileName).trim();
    displayName = displayName.replace(/^\s*Unread\s*/i, '');
    displayName = displayName.replace(/\s*sent\s+you\s+a\s+friend\s+request\.?\s*$/i, '');
    displayName = displayName.replace(/\s*New\s+friend\s+request\s+notification\s*$/i, '');
    displayName = displayName.replace(/\s*Mark as read\s*$/i, '').replace(/\s*Confirm\s*$/i, '').replace(/\s*Delete\s*$/i, '');
    displayName = displayName.trim();
    if (!displayName) displayName = profileName.trim();
    
    // First name = first token, last name = rest (e.g. "Hari" → first "Hari", last ""; "John Smith" → first "John", last "Smith")
    const nameParts = displayName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    // Replace keywords
    let replacedMessage = message;
    
    // Replace {First Name}
    if (replacedMessage.includes('{First Name}')) {
      replacedMessage = replacedMessage.replace(/{First Name}/g, firstName);
      console.log(`[FacebookHandler] Replaced {First Name} with: "${firstName}"`);
    }
    
    // Replace {Last Name}
    if (replacedMessage.includes('{Last Name}')) {
      replacedMessage = replacedMessage.replace(/{Last Name}/g, lastName);
      console.log(`[FacebookHandler] Replaced {Last Name} with: "${lastName}"`);
    }
    
    return replacedMessage;
  }

  // Simulate human-like click (one logical click only – do not also call element.click() or message sends twice)
  simulateClick(element) {
    const events = [
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
    ];
    events.forEach(event => element.dispatchEvent(event));
  }

  // Delay utility
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Detect if we're on a profile page
  isProfilePage() {
    const url = window.location.href;
    return url.includes('/profile.php') ||
      url.match(/facebook\.com\/[^\/]+$/); // username profile
  }

  // Detect if we're in messages
  isMessagesPage() {
    return window.location.href.includes('/messages/') ||
      window.location.href.includes('/t/');
  }

  // Find profile URLs on current page
  findProfileLinks() {
    const links = Array.from(document.querySelectorAll('a[href*="/profile.php"], a[href*="facebook.com"][href*="/"]'));
    return links
      .map(link => {
        const href = link.getAttribute('href');
        if (href && (href.includes('/profile.php') || href.match(/facebook\.com\/[^\/\?]+$/))) {
          return href.split('?')[0]; // Remove query params
        }
      })
      .filter((href, index, self) => href && self.indexOf(href) === index); // Unique
  }

  // Cancel or Delete all pending requests on the current page
  // Works like the original Friend Connector Pro tool
  // Deletes SENT requests (outgoing requests that we sent to others)
  async cancelAllPendingRequests() {
    console.log('Delete pending--------------------------------------------------------------');
    console.log('Starting deletion of pending requests...');

    let processedCount = 0;
    let pendingRequestCount = 0;
    
    // Create centered counter overlay (like original tool)
    this.createCenteredCounter();

    // Step 1: Always click "View sent requests" button to navigate to sent requests view
    // The direct URL doesn't work, so we must use the button
    console.log('Looking for "View sent requests" button...');
    
    // Wait a bit for page to fully render
    await this.delay(2000);
    
    // Scroll to top to ensure button is visible
    window.scrollTo(0, 0);
    await this.delay(500);
    
    // Try multiple times to find and click the button
    let viewSentRequestsButton = null;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!viewSentRequestsButton && attempts < maxAttempts) {
      viewSentRequestsButton = this.findViewSentRequestsButton();
      
      if (!viewSentRequestsButton) {
        attempts++;
        console.log(`[FacebookHandler] Button not found, attempt ${attempts}/${maxAttempts}, waiting...`);
        
        // Try scrolling to different positions
        if (attempts % 2 === 0) {
          window.scrollTo(0, 0);
        } else {
          window.scrollTo(0, 200);
        }
        
        await this.delay(1500);
      }
    }
    
    if (viewSentRequestsButton) {
      console.log('[FacebookHandler] Found "View sent requests" button, clicking...');
      console.log('[FacebookHandler] Button element:', viewSentRequestsButton);
      console.log('[FacebookHandler] Button text:', viewSentRequestsButton.textContent);
      
      // Scroll button into view
      viewSentRequestsButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(1500);
      
      // Try multiple click methods - Facebook buttons need comprehensive event handling
      console.log('[FacebookHandler] Attempting to click button with multiple methods...');
      
      try {
        // Method 1: Focus first (important for Facebook buttons)
        if (viewSentRequestsButton.focus) {
          viewSentRequestsButton.focus();
          await this.delay(200);
        }
        
        // Method 2: Try direct click
        if (viewSentRequestsButton.click) {
          console.log('[FacebookHandler] Trying direct .click() method');
          viewSentRequestsButton.click();
          await this.delay(500);
        }
        
        // Method 3: Dispatch comprehensive mouse events
        console.log('[FacebookHandler] Dispatching mouse events...');
        const mouseEvents = [
          new MouseEvent('mousedown', { 
            bubbles: true, 
            cancelable: true, 
            view: window,
            button: 0,
            buttons: 1
          }),
          new MouseEvent('mouseup', { 
            bubbles: true, 
            cancelable: true, 
            view: window,
            button: 0,
            buttons: 0
          }),
          new MouseEvent('click', { 
            bubbles: true, 
            cancelable: true, 
            view: window,
            button: 0,
            buttons: 0
          })
        ];
        
        mouseEvents.forEach((event, index) => {
          setTimeout(() => {
            viewSentRequestsButton.dispatchEvent(event);
          }, index * 50);
        });
        
        await this.delay(300);
        
        // Method 4: Try keyboard Enter (for buttons with tabindex)
        if (viewSentRequestsButton.getAttribute('tabindex') !== null) {
          console.log('[FacebookHandler] Trying keyboard Enter key...');
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            view: window
          });
          viewSentRequestsButton.dispatchEvent(enterEvent);
          
          const enterUpEvent = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            view: window
          });
          viewSentRequestsButton.dispatchEvent(enterUpEvent);
        }
        
        console.log('[FacebookHandler] ✅ All click methods executed');
        
      } catch (clickError) {
        console.error('[FacebookHandler] Error in click methods:', clickError);
        // Last resort: simple click event
        try {
          const simpleClick = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          viewSentRequestsButton.dispatchEvent(simpleClick);
        } catch (e) {
          console.error('[FacebookHandler] Even simple click failed:', e);
        }
      }
      
      // Wait for sent requests modal/view to appear
      await this.delay(4000);
      
      // Verify sent requests view is open by checking for modal or sent requests content
      let sentRequestsVisible = false;
      for (let i = 0; i < 8; i++) {
        const modal = this.findSentRequestsModal();
        const pageText = document.body.textContent.toLowerCase();
        const hasSentRequestsText = pageText.includes('sent request') && 
                                   (pageText.includes('cancel request') || pageText.includes('request cancelled'));
        
        if (modal || hasSentRequestsText) {
          sentRequestsVisible = true;
          console.log('[FacebookHandler] ✅ Sent requests view is now visible');
          break;
        }
        
        console.log(`[FacebookHandler] Waiting for sent requests view... (${i + 1}/8)`);
        await this.delay(1000);
      }
      
      if (!sentRequestsVisible) {
        console.warn('[FacebookHandler] ⚠️ Sent requests view may not have opened, but continuing...');
        console.warn('[FacebookHandler] Page text contains:', document.body.textContent.substring(0, 200));
      }
    } else {
      console.error('[FacebookHandler] ❌ Could not find "View sent requests" button after multiple attempts!');
      console.error('[FacebookHandler] Current page URL:', window.location.href);
      console.error('[FacebookHandler] Page text (first 500 chars):', document.body.textContent.substring(0, 500));
      throw new Error('Could not find "View sent requests" button. Please navigate to friend requests page first.');
    }

    // Dismiss any existing error modals before starting
    await this.dismissErrorModal();
    await this.delay(1000);

    // Step 2: Find and click all "Cancel request" buttons
    let noMoreFoundCount = 0;
    let retryCount = 0;
    const maxRetries = 20;

    while (noMoreFoundCount < 3 && retryCount < maxRetries) {
      // Find "Cancel request" buttons (sent requests)
      const cancelRequestSelectors = [
        'div[aria-label^="Cancel Request"]',
        'div[aria-label^="Cancel request"]',
        'div[aria-label*="Cancel Request"]',
        'div[aria-label*="Cancel request"]',
        'span:contains("Cancel Request")',
        'span:contains("Cancel request")'
      ];

      let cancelButtons = [];
      for (const selector of cancelRequestSelectors) {
        try {
          const buttons = Array.from(document.querySelectorAll(selector));
          cancelButtons = cancelButtons.concat(buttons);
        } catch (e) {
          // Some selectors might not be valid, skip
        }
      }

      // Also try finding by text content
      const allButtons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], a[role="button"]'));
      const textCancelButtons = allButtons.filter(btn => {
        const text = (btn.textContent || '').toLowerCase();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        return (text.includes('cancel request') || ariaLabel.includes('cancel request')) && 
               !text.includes('view sent') && 
               !text.includes('sent requests');
      });

      cancelButtons = cancelButtons.concat(textCancelButtons);

      // Remove duplicates
      cancelButtons = [...new Set(cancelButtons)];

      // Filter visible buttons
      const activeButtons = cancelButtons.filter(btn => this.isVisible(btn));

      if (activeButtons.length === 0) {
        retryCount++;
        console.log(`No delete button, retrying... ${retryCount}`);
        
        // Scroll to load more
        window.scrollTo(0, document.body.scrollHeight);
        await this.delay(2000);

        // Check again after scroll
        const checkButtons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'))
          .filter(btn => {
            const text = (btn.textContent || '').toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            return (text.includes('cancel request') || ariaLabel.includes('cancel request')) && 
                   this.isVisible(btn);
          });

        if (checkButtons.length === 0) {
          noMoreFoundCount++;
          if (noMoreFoundCount >= 3) {
            // Check one more time if all requests are cleared
            const finalCheck = this.findCancelRequestButtons();
            if (finalCheck.length === 0) {
              console.log('[FacebookHandler] ✅ All requests cleared! No more cancel buttons found.');
              break;
            }
            break;
          }
        }
        continue;
      }
      
      // After processing buttons, check if all are cleared
      let remainingAfterProcess = this.findCancelRequestButtons();
      if (remainingAfterProcess.length === 0) {
        console.log('[FacebookHandler] ✅ All requests have been cleared!');
        break;
      }

      // Reset counters when buttons found
      noMoreFoundCount = 0;
      retryCount = 0;

      // Click all cancel buttons
      for (const btn of activeButtons) {
        try {
          // Check for and dismiss any error modals before clicking
          await this.dismissErrorModal();
          
          console.log('Clicked \'Cancel request\' button');
          this.simulateClick(btn);
          
          // Wait a bit for Facebook to process
          await this.delay(1500);
          
          // Check for error modal after clicking
          const hasError = await this.dismissErrorModal();
          if (hasError) {
            console.warn('[FacebookHandler] Error modal appeared after cancel click, dismissed it');
            // Wait longer after error to avoid rate limiting
            await this.delay(3000);
          }
          
          processedCount++;
          pendingRequestCount++;
          
          // Update centered counter display
          this.updateCenteredCounter(pendingRequestCount);
          
          // Update count in storage (like original tool)
          chrome.storage.local.set({ pendingRequestCount: pendingRequestCount }, () => {
            console.log(`Updated pending request count: ${pendingRequestCount}`);
          });
          
          // Wait between clicks - increased delay to avoid rate limiting
          // Random delay between 2-4 seconds to appear more human-like
          const waitTime = 2000 + Math.random() * 2000; // 2-4 seconds
          console.log(`Waiting :: ${Math.round(waitTime / 100)}`);
          await this.delay(waitTime);
        } catch (error) {
          console.error('[FacebookHandler] Error clicking cancel button:', error);
          // Wait longer on error
          await this.delay(3000);
        }
      }

      // After processing buttons, check if all are cleared
      remainingAfterProcess = this.findCancelRequestButtons();
      if (remainingAfterProcess.length === 0) {
        console.log('[FacebookHandler] ✅ All requests have been cleared!');
        break;
      }

      // Scroll a bit to load more if needed
      window.scrollBy(0, 800);
      await this.delay(1000);
    }

    console.log(`[FacebookHandler] Finished. Processed ${processedCount} requests.`);
    
    // Check if all requests are cleared
    const remainingButtons = this.findCancelRequestButtons();
    if (remainingButtons.length === 0) {
      console.log('[FacebookHandler] ✅ All requests have been cleared!');
      
      // Update counter to show completion
      this.updateCenteredCounter(pendingRequestCount, true);
      
      // Wait a moment to show final count
      await this.delay(2000);
      
      // Remove counter overlay
      const counter = document.getElementById('friender-centered-counter');
      if (counter) {
        counter.style.transition = 'opacity 0.5s';
        counter.style.opacity = '0';
        setTimeout(() => counter.remove(), 500);
      }
      
      // Close the sent requests modal if it's open
      await this.closeSentRequestsModal();
      
      console.log('[FacebookHandler] 🎉 Deletion complete! All sent requests have been cancelled.');
    }
    
    return processedCount;
  }
  
  // Find all cancel request buttons (helper method)
  findCancelRequestButtons() {
    const cancelRequestSelectors = [
      'div[aria-label^="Cancel Request"]',
      'div[aria-label^="Cancel request"]',
      'div[aria-label*="Cancel Request"]',
      'div[aria-label*="Cancel request"]'
    ];

    let cancelButtons = [];
    for (const selector of cancelRequestSelectors) {
      try {
        const buttons = Array.from(document.querySelectorAll(selector));
        cancelButtons = cancelButtons.concat(buttons);
      } catch (e) {
        // Some selectors might not be valid, skip
      }
    }

    // Also try finding by text content
    const allButtons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], a[role="button"]'));
    const textCancelButtons = allButtons.filter(btn => {
      const text = (btn.textContent || '').toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      return (text.includes('cancel request') || ariaLabel.includes('cancel request')) && 
             !text.includes('view sent') && 
             !text.includes('sent requests') &&
             this.isVisible(btn);
    });

    cancelButtons = cancelButtons.concat(textCancelButtons);
    
    // Remove duplicates
    cancelButtons = [...new Set(cancelButtons)];
    
    // Filter visible buttons
    return cancelButtons.filter(btn => this.isVisible(btn));
  }
  
  // Close sent requests modal
  async closeSentRequestsModal() {
    try {
      const modal = this.findSentRequestsModal();
      if (modal) {
        // Look for close button (X icon)
        const closeButton = modal.querySelector('[aria-label*="Close"]') ||
                           modal.querySelector('[aria-label*="close"]') ||
                           modal.querySelector('div[role="button"][aria-label*="Close"]') ||
                           modal.querySelector('svg[aria-label*="Close"]') ||
                           Array.from(modal.querySelectorAll('div[role="button"], span[role="button"]'))
                             .find(btn => {
                               const text = (btn.textContent || '').trim();
                               const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                               return text === '×' || text === '✕' || ariaLabel.includes('close');
                             });
        
        if (closeButton && this.isVisible(closeButton)) {
          console.log('[FacebookHandler] Closing sent requests modal...');
          this.simulateClick(closeButton);
          await this.delay(1000);
        } else {
          // Try pressing Escape key
          console.log('[FacebookHandler] Pressing Escape to close modal...');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
          await this.delay(500);
        }
      }
    } catch (error) {
      console.error('[FacebookHandler] Error closing modal:', error);
    }
  }
  
  // Create centered counter overlay (like original tool)
  createCenteredCounter() {
    // Remove existing counter if any
    const existing = document.getElementById('friender-centered-counter');
    if (existing) existing.remove();
    
    // Create counter element
    const counter = document.createElement('div');
    counter.id = 'friender-centered-counter';
    counter.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 255, 255, 0.95);
      color: #1877F2;
      padding: 15px 30px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      z-index: 999999;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      border: 2px solid #1877F2;
      pointer-events: none;
      text-align: center;
      min-width: 300px;
    `;
    
    counter.innerHTML = `
      <div style="font-size: 20px; margin-bottom: 5px;">⏳</div>
      <div id="friender-counter-text">Pending Request(s) Cleared: 0</div>
    `;
    
    document.body.appendChild(counter);
    console.log('[FacebookHandler] Centered counter created');
  }
  
  // Update centered counter
  updateCenteredCounter(count) {
    const counter = document.getElementById('friender-centered-counter');
    const counterText = document.getElementById('friender-counter-text');
    
    if (counter && counterText) {
      const text = count === 1 
        ? `Pending Request Cleared: ${count}`
        : `Pending Request(s) Cleared: ${count}`;
      
      counterText.textContent = text;
      
      // Pulse animation on update
      counter.style.animation = 'none';
      setTimeout(() => {
        counter.style.animation = 'frienderCounterPulse 0.4s ease-in-out';
      }, 10);
    }
  }
  
  // Find "Sent requests" modal
  findSentRequestsModal() {
    // Try multiple selectors for the modal
    const selectors = [
      'div[role="dialog"]',
      'div[aria-labelledby*="sent"]',
      '[data-testid*="sent-requests"]'
    ];
    
    // Look for modal containing "Sent requests" text
    const allDialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    for (const dialog of allDialogs) {
      const text = (dialog.textContent || '').toLowerCase();
      if (text.includes('sent requests') || text.includes('sent request')) {
        return dialog;
      }
    }
    
    // Fallback: look for modal with high z-index (usually modals)
    const highZIndexDialogs = allDialogs.filter(dialog => {
      const style = window.getComputedStyle(dialog);
      const zIndex = parseInt(style.zIndex) || 0;
      return zIndex > 1000;
    });
    
    if (highZIndexDialogs.length > 0) {
      return highZIndexDialogs[0];
    }
    
    return null;
  }

  // Dismiss error modal if present
  async dismissErrorModal() {
    try {
      // Look for error modal with "Sorry, we can't process this request" text
      const errorModalSelectors = [
        'div[role="dialog"]',
        'div[role="alertdialog"]',
        '[aria-labelledby*="error"]',
        '[aria-describedby*="error"]'
      ];
      
      let errorModal = null;
      
      // Try to find modal by text content
      const allDialogs = Array.from(document.querySelectorAll('div[role="dialog"], div[role="alertdialog"]'));
      for (const dialog of allDialogs) {
        const text = (dialog.textContent || '').toLowerCase();
        if (text.includes("sorry, we can't process") || 
            text.includes("can't process this request") ||
            text.includes("please try again")) {
          errorModal = dialog;
          break;
        }
      }
      
      if (errorModal) {
        console.log('[FacebookHandler] Error modal detected, dismissing...');
        
        // Try to find OK button or close button
        const okButton = errorModal.querySelector('div[role="button"]') ||
                         Array.from(errorModal.querySelectorAll('div[role="button"], span[role="button"], button'))
                           .find(btn => {
                             const text = (btn.textContent || '').toLowerCase();
                             return text === 'ok' || text.includes('ok');
                           });
        
        const closeButton = errorModal.querySelector('[aria-label*="Close"]') ||
                            errorModal.querySelector('[aria-label*="close"]') ||
                            errorModal.querySelector('i[class*="close"]') ||
                            errorModal.querySelector('svg[aria-label*="Close"]');
        
        if (okButton && this.isVisible(okButton)) {
          console.log('[FacebookHandler] Clicking OK button to dismiss error modal');
          this.simulateClick(okButton);
          await this.delay(1000);
          return true;
        } else if (closeButton && this.isVisible(closeButton)) {
          console.log('[FacebookHandler] Clicking close button to dismiss error modal');
          this.simulateClick(closeButton);
          await this.delay(1000);
          return true;
        } else {
          // Try pressing Escape key
          console.log('[FacebookHandler] Pressing Escape to dismiss error modal');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
          await this.delay(1000);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('[FacebookHandler] Error dismissing modal:', error);
      return false;
    }
  }

  // Find "View sent requests" button
  findViewSentRequestsButton() {
    // Method 1: Find by exact text "View sent requests" in span or div
    const allElements = Array.from(document.querySelectorAll('div[role="button"], span, a, div[role="link"]'));
    
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      const textLower = text.toLowerCase();
      
      // Check for exact match "View sent requests"
      if (textLower === 'view sent requests' || textLower === 'view sent request') {
        if (this.isVisible(el)) {
          console.log('[FacebookHandler] Found "View sent requests" by exact text match:', text);
          // Return the parent button if this is a span inside a button
          if (el.tagName === 'SPAN' && el.parentElement && el.parentElement.getAttribute('role') === 'button') {
            return el.parentElement;
          }
          return el;
        }
      }
    }
    
    // Method 2: Find div[role="button"] containing span with "View sent requests"
    const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
    for (const button of buttons) {
      const span = button.querySelector('span');
      if (span) {
        const spanText = (span.textContent || '').trim().toLowerCase();
        if (spanText === 'view sent requests' || spanText === 'view sent request') {
          if (this.isVisible(button)) {
            console.log('[FacebookHandler] Found "View sent requests" button (div with span):', spanText);
            return button;
          }
        }
      }
      
      // Also check button's own text
      const buttonText = (button.textContent || '').trim().toLowerCase();
      if (buttonText === 'view sent requests' || buttonText === 'view sent request') {
        if (this.isVisible(button)) {
          console.log('[FacebookHandler] Found "View sent requests" button (div text):', buttonText);
          return button;
        }
      }
    }
    
    // Method 3: Try href patterns
    const links = Array.from(document.querySelectorAll('a[href*="/friends/requests/outgoing"], a[href*="/friends/requests/sent"]'));
    for (const link of links) {
      if (this.isVisible(link)) {
        console.log('[FacebookHandler] Found "View sent requests" by href:', link.getAttribute('href'));
        return link;
      }
    }
    
    // Method 4: Search all elements for text containing "view sent"
    for (const el of allElements) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (text.includes('view sent') && text.includes('request')) {
        if (this.isVisible(el)) {
          console.log('[FacebookHandler] Found "View sent requests" by partial text:', text);
          // Return parent button if span
          if (el.tagName === 'SPAN' && el.parentElement && el.parentElement.getAttribute('role') === 'button') {
            return el.parentElement;
          }
          return el;
        }
      }
    }

    console.warn('[FacebookHandler] Could not find "View sent requests" button');
    console.warn('[FacebookHandler] Available buttons on page:', 
      Array.from(document.querySelectorAll('div[role="button"]'))
        .map(b => b.textContent?.trim())
        .filter(t => t && t.length < 50)
        .slice(0, 10)
    );
    return null;
  }
}

// Initialize global Facebook handler
window.facebookHandler = new FacebookHandler();
