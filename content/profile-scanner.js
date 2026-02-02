/**
 * Profile Scanner
 * Scans profiles one by one, applies filters, and processes friend requests
 */

class ProfileScanner {
  constructor() {
    this.currentIndex = 0;
    this.scannedProfiles = new Set(); // Track processed profiles by unique identifier
    this.validProfiles = [];
    this.settings = null;
    this.isScanning = false;
    this.lastPosition = 0; // For resume functionality
    this.processedProfileIds = new Set(); // Track which profiles we've already processed
  }

  _handleContextInvalidated(err) {
    if (typeof window !== 'undefined' && window.frienderIsContextInvalidatedError?.(err)) {
      window.frienderOnContextInvalidated?.();
      this.isScanning = false;
      return true;
    }
    return false;
  }

  // Initialize scanner with settings
  async initialize(settings) {
    this.settings = settings;

    // Only reset index if we're starting fresh (not already scanning)
    if (!this.isScanning) {
      if (settings.resumeFromLastSearch === 'yes') {
        let saved = {};
        try {
          saved = await chrome.storage.local.get(['lastSearchPosition', 'lastSearchUrl']);
        } catch (e) {
          if (this._handleContextInvalidated(e)) return;
          throw e;
        }
        const posFromForm = settings.lastSearchPosition != null && String(settings.lastSearchPosition).trim() !== '' ? Number(settings.lastSearchPosition) : NaN;
        this.currentIndex = !isNaN(posFromForm) ? posFromForm : (saved.lastSearchPosition || settings.lastSearchPosition || 0);
        this.lastPosition = this.currentIndex;
        if (saved.lastSearchUrl && saved.lastSearchUrl !== window.location.href) {
          this.currentIndex = 0;
          this.lastPosition = 0;
          this.processedProfileIds.clear();
        }
      } else {
        // Only reset if we're truly starting fresh
        // If already scanning, preserve current index
        if (this.currentIndex === 0 && this.processedProfileIds.size === 0) {
          this.currentIndex = 0;
          this.lastPosition = 0;
        }
        // Otherwise keep current index to maintain sequential order
      }
    } else {
      // Already scanning - preserve current index to continue sequentially
      console.log('[ProfileScanner] Already scanning, preserving currentIndex:', this.currentIndex);
    }

    console.log('[ProfileScanner] Initialized with settings:', {
      resumeFromLastSearch: settings.resumeFromLastSearch,
      currentIndex: this.currentIndex,
      processedCount: this.processedProfileIds.size,
      numberOfRequests: settings.numberOfRequests,
      lookupInterval: settings.lookupInterval,
      useGenderFilter: settings.useGenderFilter,
      gender: settings.gender,
      useCountryFilter: settings.useCountryFilter,
      mutualFriendsOperator: settings.mutualFriendsOperator,
      mutualFriendsCount: settings.mutualFriendsCount,
      keywords: settings.keywords,
      negativeKeywords: settings.negativeKeywords
    });
  }

  // Get only visible profiles (in viewport or just below)
  getVisibleProfiles(allProfiles) {
    const viewportTop = window.scrollY;
    const viewportBottom = window.scrollY + window.innerHeight;
    const buffer = window.innerHeight * 0.5; // Include profiles slightly below viewport
    
    const visibleProfiles = allProfiles.filter(profileEl => {
      if (!profileEl || !document.body.contains(profileEl)) return false;
      
      const rect = profileEl.getBoundingClientRect();
      const elementTop = viewportTop + rect.top;
      const elementBottom = elementTop + rect.height;
      
      // Include if in viewport or just below (within buffer)
      return elementBottom >= viewportTop - buffer && elementTop <= viewportBottom + buffer;
    });
    
    return visibleProfiles;
  }

  // Scan profiles on current page - CONTINUOUS INDEXING WITH IMMEDIATE FILTERING
  async scanProfiles() {
    if (this.isScanning) {
      console.log('[ProfileScanner] Already scanning, skipping duplicate call');
      return;
    }

    this.isScanning = true;
    console.log('[ProfileScanner] Starting continuous indexing and processing...');

    // Inject CSS styles for visual indicators
    this.injectVisualIndicatorStyles();

    try {
      // Detect page type
      const pageType = this.detectPageType();
      console.log(`[ProfileScanner] Page type: ${pageType} - Starting continuous indexing and processing...`);
      
      if (pageType === 'friend_suggestions') {
        console.log('[ProfileScanner] ✅ Friend suggestions page – same process: index one → check filters (limit, gender, country, keywords, message) → process if match → next');
      } else if (pageType === 'groups_people') {
        console.log('[ProfileScanner] ✅ Group people page – same process as suggestions: index one → check filters (limit, gender, country, last search, keywords, message) → process if match → next');
      }

      // Try pending message retries once when scan starts (e.g. after "message request limit"), not on every profile
      if (typeof window.trySendPendingMessageRetries === 'function') {
        try {
          await window.trySendPendingMessageRetries();
        } catch (retryErr) {
          console.warn('[ProfileScanner] Pending message retry failed:', retryErr?.message);
        }
      }

      // SAME PROCESS for both pages: suggestions and group people.
      // Index one profile → check all filters (limit, gender, country, keywords, message) → if match, process → then next.
      // CONTINUOUS LOOP: Index one profile → Check filters → Process if match → Continue
      while (true) {
        if (!this.isScanning) {
          console.log('[ProfileScanner] Stop requested (isScanning false), exiting loop');
          break;
        }
        // Refresh state from background
        let stateData;
        try {
          stateData = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
        } catch (e) {
          if (this._handleContextInvalidated(e)) break;
          throw e;
        }
        const currentState = stateData?.state || { status: 'stopped' };
        if (currentState.status !== 'running') {
          console.log('[ProfileScanner] Automation stopped, exiting continuous loop. GET_STATE state:', currentState?.status ?? '(no status)', 'full state keys:', stateData?.state ? Object.keys(stateData.state) : 'no state');
          break;
        }

        // Check limit (from run-page input)
        if (await this.isLimitReached()) {
          const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
          const state = response?.state || {};
          const requestsLimit = this.settings?.requestsLimit || 'limited';
          const numberOfRequests = this.settings?.numberOfRequests || 2;
          const sent = state.sessionFriendRequests || 0;
          
          // Determine which limit was reached
          let limitMessage = '';
          if (requestsLimit === 'limited' && sent >= numberOfRequests) {
            limitMessage = `You've reached your session limit of ${numberOfRequests} friend request${numberOfRequests > 1 ? 's' : ''}.`;
          } else {
            limitMessage = 'You\'ve reached your request limit.';
          }
          
          // Show notification
          window.showFrienderToast?.(
            'Limit Reached!', 
            `${limitMessage} Automation stopped automatically.`,
            'success'
          );
          
          // Automatically stop automation
          try {
            this.isScanning = false;
            const startToast = document.getElementById('friender-start-toast');
            if (startToast) startToast.remove();
            
            await chrome.runtime.sendMessage({
              type: 'UPDATE_STATE',
              data: { status: 'stopped' }
            });
            
            console.log('[ProfileScanner] Automation stopped automatically due to limit reached');
          } catch (error) {
            console.error('[ProfileScanner] Error stopping automation:', error);
          }
          
          break;
        }

        // Get ALL profiles on page (same for suggestions and group people)
        const allProfileLinks = await this.getProfileLinks(pageType);
        
        // Get visible profiles in DOM order
        const visibleProfiles = this.getVisibleProfiles(allProfileLinks);
        
        // Last search: when resume is on, skip first currentIndex profiles (use currentIndex so "Your last search member's position" is respected)
        const startOffset = (this.settings?.resumeFromLastSearch === 'yes' && this.currentIndex > 0)
          ? Math.min(this.currentIndex, visibleProfiles.length)
          : 0;
        if (startOffset > 0) {
          console.log(`[ProfileScanner] Resume from last search: starting from position ${startOffset + 1} (skip first ${startOffset}, currentIndex=${this.currentIndex})`);
        }
        
        // Find next unindexed visible profile (one by one)
        let nextProfileToIndex = null;
        for (let i = startOffset; i < visibleProfiles.length; i++) {
          const profileEl = visibleProfiles[i];
          if (!profileEl || !document.body.contains(profileEl)) continue;
          
          // Check if already indexed
          const existingBadge = profileEl.querySelector('.friender-index-badge');
          if (!existingBadge) {
            nextProfileToIndex = profileEl;
            break; // Found next profile to index
          }
        }
        
        // If no unindexed visible profiles, scroll to load more
        if (!nextProfileToIndex) {
          console.log(`[ProfileScanner] No more unindexed visible profiles, scrolling to load more...`);
          
          const newProfilesLoaded = await this.loadMoreProfiles(pageType);
          
          if (!newProfilesLoaded) {
            // No new profiles - all done
            console.log(`[ProfileScanner] ✅✅✅ ALL PROFILES PROCESSED!`);
            console.log(`[ProfileScanner] Total profiles processed: ${this.processedProfileIds.size}`);
            
            if (window.showFrienderToast) {
              window.showFrienderToast(
                'Scan Complete!',
                `All visible profiles have been processed. Total: ${this.processedProfileIds.size} profiles.`,
                'success'
              );
            }
            
            await chrome.runtime.sendMessage({
              type: 'UPDATE_STATE',
              data: { status: 'stopped' }
            });
            
            break; // Exit loop
          }
          
          // Wait a bit for new profiles to render (interruptible by Stop)
          await this.delayWithStopCheck(1000);
          if (!this.isScanning) break;
          continue; // Continue loop to index new profiles
        }
        
        // STEP 1: INDEX the profile (assign index number)
        this.currentIndex += 1;
        const profileIndex = this.currentIndex;
        this.addIndexNumberToProfile(nextProfileToIndex, profileIndex, null);
        await this.savePosition(this.currentIndex);
        
        console.log(`[ProfileScanner] 📋 Indexed profile #${profileIndex} (continuous indexing: index → check filters → process if match → continue)`);
        
        // STEP 2: Extract profile data immediately - COMPREHENSIVE EXTRACTION
        // First, remove index badge and other UI elements before extracting text
        const indexBadgeClone = nextProfileToIndex.querySelector('.friender-index-badge');
        const processingBadgeClone = nextProfileToIndex.querySelector('.friender-processing-badge');
        const processedBadgeClone = nextProfileToIndex.querySelector('.friender-processed-badge');
        
        // Temporarily hide badges to exclude from text extraction
        const originalDisplay = {};
        if (indexBadgeClone) {
          originalDisplay.indexBadge = indexBadgeClone.style.display;
          indexBadgeClone.style.display = 'none';
        }
        if (processingBadgeClone) {
          originalDisplay.processingBadge = processingBadgeClone.style.display;
          processingBadgeClone.style.display = 'none';
        }
        if (processedBadgeClone) {
          originalDisplay.processedBadge = processedBadgeClone.style.display;
          processedBadgeClone.style.display = 'none';
        }
        
        let profileText = nextProfileToIndex.innerText || nextProfileToIndex.textContent || "";
        
        // Also extract text from all nested elements (more comprehensive)
        const allTextElements = nextProfileToIndex.querySelectorAll('span, div, p, a, strong, em, b, h1, h2, h3, h4');
        for (const el of allTextElements) {
          // Skip button elements, badges, and UI elements
          if (el.closest('button') || 
              el.getAttribute('role') === 'button' || 
              el.classList.contains('friender-index-badge') ||
              el.classList.contains('friender-processing-badge') ||
              el.classList.contains('friender-processed-badge') ||
              el.textContent?.toLowerCase().includes('add friend') ||
              el.textContent?.toLowerCase().includes('cancel request') ||
              el.textContent?.toLowerCase().includes('message') ||
              el.textContent?.toLowerCase().includes('remove') ||
              el.textContent?.match(/^#\d+$/)) { // Skip index numbers like "#9"
            continue;
          }
          
          // Get text from element
          const elText = el.innerText || el.textContent || '';
          if (elText && elText.trim().length > 1) {
            const trimmedText = elText.trim();
            const lowerTrimmed = trimmedText.toLowerCase();
            const lowerProfileText = profileText.toLowerCase();
            
            // Skip UI text
            if (lowerTrimmed.includes('add friend') ||
                lowerTrimmed.includes('cancel request') ||
                lowerTrimmed.includes('message') ||
                lowerTrimmed.includes('remove') ||
                lowerTrimmed.match(/^#\d+$/) ||
                lowerTrimmed.includes('profile picture of') ||
                lowerTrimmed.includes('who is a mutual friend') ||
                lowerTrimmed.includes('link to see everyone')) {
              continue;
            }
            
            // Add if not already included
            if (!lowerProfileText.includes(lowerTrimmed)) {
              profileText += ' ' + trimmedText;
            }
          }
        }
        
        // Also check aria-labels for additional text (important for "Works at" info)
        const ariaElements = nextProfileToIndex.querySelectorAll('[aria-label]');
        for (const el of ariaElements) {
          // Skip button aria-labels
          if (el.closest('button') || el.getAttribute('role') === 'button') continue;
          
          const ariaLabel = el.getAttribute('aria-label') || '';
          if (ariaLabel && ariaLabel.trim().length > 0) {
            const lowerAria = ariaLabel.toLowerCase();
            const lowerProfileText = profileText.toLowerCase();
            if (!lowerProfileText.includes(lowerAria) &&
                !lowerAria.includes('add friend') &&
                !lowerAria.includes('button') &&
                !lowerAria.includes('remove')) {
              profileText += ' ' + ariaLabel.trim();
            }
          }
        }
        
        // Restore badge visibility
        if (indexBadgeClone && originalDisplay.indexBadge !== undefined) {
          indexBadgeClone.style.display = originalDisplay.indexBadge;
        }
        if (processingBadgeClone && originalDisplay.processingBadge !== undefined) {
          processingBadgeClone.style.display = originalDisplay.processingBadge;
        }
        if (processedBadgeClone && originalDisplay.processedBadge !== undefined) {
          processedBadgeClone.style.display = originalDisplay.processedBadge;
        }
        
        // Clean up the extracted text - remove duplicate words and UI artifacts
        profileText = profileText.replace(/\s+/g, ' ').trim();
        
        // Extract profile name more carefully - find the actual name element
        // Try to find name in common name selectors first
        let profileName = `Profile ${profileIndex}`;
        
        // Try to find name in common name selectors
        const nameSelectors = [
          'h1', 'h2', 'h3',
          '[data-testid*="name"]',
          'span[dir="auto"]',
          'a[href*="/profile.php"]',
          'a[href*="/user/"]'
        ];
        
        for (const selector of nameSelectors) {
          const nameEl = nextProfileToIndex.querySelector(selector);
          if (nameEl) {
            const nameText = nameEl.textContent?.trim() || '';
            // Make sure it's not UI text
            const lowerName = nameText.toLowerCase();
            if (nameText && 
                nameText.length > 0 && 
                nameText.length < 100 && // Reasonable name length
                !lowerName.includes('add friend') &&
                !lowerName.includes('remove') &&
                !lowerName.includes('message') &&
                !lowerName.match(/^#\d+$/) &&
                !lowerName.includes('profile picture of') &&
                !lowerName.includes('who is a mutual friend')) {
              profileName = nameText;
              break;
            }
          }
        }
        
        // Fallback: use first line of cleaned text, but filter out UI words
        if (profileName === `Profile ${profileIndex}`) {
          const firstLine = profileText.split('\n')[0]?.trim() || '';
          // Remove common UI words
          const cleaned = firstLine
            .replace(/\b(add friend|remove|message|cancel request)\b/gi, '')
            .replace(/\b#\d+\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleaned && cleaned.length > 0 && cleaned.length < 100) {
            profileName = cleaned;
          }
        }
        
        const profileId = profileName.toLowerCase().trim();
        
        // Skip if already processed
        if (this.processedProfileIds.has(profileId)) {
          console.log(`[ProfileScanner] ⏭️ Profile #${profileIndex} "${profileName}" already processed, continuing indexing...`);
          await this.delay(200); // Small delay before next profile
          continue; // Continue to next profile
        }
        
        // STEP 3: CHECK FILTERS IMMEDIATELY (while indexing)
        console.log(`[ProfileScanner] 🔍 Checking filters for profile #${profileIndex}: "${profileName}" (checking immediately after indexing)`);
        
        // Scroll element into view
        try {
          nextProfileToIndex.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await this.delay(500);
        } catch (scrollErr) {
          console.warn('[ProfileScanner] Scroll failed:', scrollErr);
        }
        
        const isValid = await this.validateProfile(nextProfileToIndex, profileText, pageType);
        
        // STEP 4: IF MATCH FOUND, PROCESS THIS PROFILE FULLY – only then move to next
        if (isValid) {
          console.log(`[ProfileScanner] ✅ Profile #${profileIndex} "${profileName}" MATCHED FILTERS – processing this profile now (next profile only after this completes)`);
          
          // Mark as being processed
          this.processedProfileIds.add(profileId);
          
          const profileEl = nextProfileToIndex;

          // No "enable Add Friend" setting – on Suggestions/Group pages we always send friend requests when profile matches filters.
          // Find the Add Friend button
          const addBtn = this.findAddBtn(profileEl);

          if (!addBtn) {
            console.warn(`[ProfileScanner] ⚠️ Could not find "Add Friend" button for profile #${profileIndex} "${profileName}" – done with this profile, moving to next.`);
            await this.delay(this.getLookupInterval());
            continue;
          }

          if (addBtn) {
            // Add processing indicator badge (index badge already shown)
            this.addProcessingIndicator(profileEl, profileIndex);

            console.log('[ProfileScanner] Engaging profile:', profileName);
            addBtn.click();
            await this.delay(2000);

            // Handle potential Confirm dialog
            const confirmBtn = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'))
              .find(el => {
                const t = el.textContent || "";
                return t === "Confirm" || t === "OK" || el.ariaLabel === "Confirm";
              });

            if (confirmBtn) {
              console.log('[ProfileScanner] Confirming click...');
              confirmBtn.click();
              await this.delay(1500);
            }

            // Check if button changed to "Cancel request" (friend request sent)
            await this.delay(1000);
            
            // Try multiple methods to detect if friend request was sent
            let requestSent = false;
            
            // Method 1: Check for Cancel Request button
            const cancelBtn = profileEl.querySelector('div[aria-label*="Cancel Request"], div[aria-label*="Cancel request"]');
            if (cancelBtn) {
              requestSent = true;
            }
            
            // Method 2: Check button text/aria-label
            const updatedBtn = this.findAddBtn(profileEl);
            if (updatedBtn) {
              const btnText = updatedBtn.textContent?.toLowerCase() || '';
              const ariaLabel = updatedBtn.getAttribute('aria-label')?.toLowerCase() || '';
              
              if (btnText.includes('cancel') || btnText.includes('sent') || 
                  ariaLabel.includes('cancel') || ariaLabel.includes('sent')) {
                requestSent = true;
              }
            }
            
            // Method 3: Check for "Friend Request Sent" indicator
            const sentIndicator = profileEl.querySelector('div[aria-label*="Friend Request Sent"], div[aria-label*="Request sent"]');
            if (sentIndicator) {
              requestSent = true;
            }
            
            if (requestSent) {
              // Friend request was sent successfully - update indicator
              this.updateProcessedIndicator(profileEl, profileIndex);
            }

            // Sync successful request count
            const stateResponse = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
            const currentStateForUpdate = stateResponse?.state || {};
            await chrome.runtime.sendMessage({
              type: 'UPDATE_STATE',
              data: { friendRequestsSent: (currentStateForUpdate.friendRequestsSent || 0) + 1 }
            });

            // Handle Messaging: send message after friend request if messaging enabled and message group set
            const messagingEnabled = this.settings.messaging?.enabled;
            const messageGroupSet = this.settings.messageGroups && this.settings.messageGroups !== 'none';
            if (messagingEnabled && messageGroupSet) {
              // Extract profile URL, profileId, and the clickable element (profile link / profile image link)
              let profileUrl = null;
              let profileId = null;
              let profileLinkEl = null;

              // Method 1: Find anchor tag with profile link (most common)
              const profileLink = profileEl.querySelector('a[href*="/profile.php"]') ||
                                 profileEl.querySelector('a[href*="/user/"]') ||
                                 profileEl.querySelector('a[href*="facebook.com/"][href*="/"]') ||
                                 profileEl.closest('a[href*="/profile.php"]') ||
                                 profileEl.closest('a[href*="/user/"]');
              if (profileLink) {
                profileLinkEl = profileLink;
                profileUrl = profileLink.href || profileLink.getAttribute('href');
                if (profileUrl && !profileUrl.startsWith('http')) {
                  profileUrl = new URL(profileUrl, window.location.origin).href;
                }
                if (profileUrl) {
                  const idM = profileUrl.match(/profile\.php\?id=(\d+)/) || profileUrl.match(/user\/(\d+)/) || profileUrl.match(/facebook\.com\/([^\/\?]+)/);
                  if (idM) profileId = idM[1];
                }
              }
              // Method 2: Try to find profile link in parent elements
              if (!profileUrl) {
                let parent = profileEl.parentElement;
                for (let depth = 0; depth < 5 && parent; depth++) {
                  const link = parent.querySelector('a[href*="/profile.php"], a[href*="/user/"], a[href*="facebook.com/"][href*="/"]');
                  if (link) {
                    profileLinkEl = link;
                    profileUrl = link.href || link.getAttribute('href');
                    if (profileUrl && !profileUrl.startsWith('http')) {
                      profileUrl = new URL(profileUrl, window.location.origin).href;
                    }
                    if (profileUrl) {
                      const idM = profileUrl.match(/profile\.php\?id=(\d+)/) || profileUrl.match(/user\/(\d+)/) || profileUrl.match(/facebook\.com\/([^\/\?]+)/);
                      if (idM) profileId = idM[1];
                    }
                    break;
                  }
                  parent = parent.parentElement;
                }
              }
              if (!profileLinkEl && profileEl) {
                profileLinkEl = profileEl.querySelector('a[href*="/profile.php"], a[href*="/user/"], a[href*="facebook.com/"]');
              }

              if (profileUrl) {
                const msgBtnOnCard = profileEl.querySelector('div[aria-label="Message"]') ||
                  profileEl.querySelector('div[aria-label*="Message"]') ||
                  Array.from(profileEl.querySelectorAll('div[role="button"], span[role="button"]')).find(b => {
                    const text = (b.textContent || '').toLowerCase();
                    const ariaLabel = (b.getAttribute('aria-label') || '').toLowerCase();
                    return text.includes('message') || ariaLabel.includes('message');
                  });

                if (msgBtnOnCard) {
                  console.log(`[ProfileScanner] Message button on card for "${profileName}" – sending message on this page (no new tab)`);
                  try {
                    msgBtnOnCard.click();
                    await this.delay(3000);
                    if (window.facebookHandler) {
                      const messageSent = await window.facebookHandler.sendMessage(profileUrl, null, 'after_request', profileName);
                      if (messageSent) {
                        console.log(`[ProfileScanner] ✅ Message sent to "${profileName}"`);
                      } else {
                        const storedMsg = await this.getStoredMessageForPending(profileName);
                        await this.storePendingRequest(profileUrl, profileName, profileId, storedMsg);
                        console.log(`[ProfileScanner] Send failed – stored "${profileName}" for message when they accept`);
                      }
                    } else {
                      const storedMsg = await this.getStoredMessageForPending(profileName);
                      await this.storePendingRequest(profileUrl, profileName, profileId, storedMsg);
                    }
                  } catch (msgErr) {
                    console.warn(`[ProfileScanner] Error sending message: ${msgErr.message}`);
                    const storedMsg = await this.getStoredMessageForPending(profileName);
                    await this.storePendingRequest(profileUrl, profileName, profileId, storedMsg);
                  }
                } else {
                  // No Message on card: open profile page in background; content script there will click profile Message button, send, then close tab (no Messenger URL)
                  const storedMsg = await this.getStoredMessageForPending(profileName);
                  const navUrl = typeof window.getProfileUrlForNavigation === 'function'
                    ? window.getProfileUrlForNavigation({ url: profileUrl, profileId })
                    : (profileId && /^\d+$/.test(String(profileId)) ? `https://www.facebook.com/profile.php?id=${profileId}` : profileUrl);
                  if (navUrl && typeof window.openProfileAndSendMessage === 'function') {
                    console.log(`[ProfileScanner] Message button not on card – opening profile in background for "${profileName}" (profile Message button, send there, tab closes; no UI)`);
                    await window.openProfileAndSendMessage(navUrl, profileId, profileName, 'after_request', storedMsg);
                  } else {
                    await this.storePendingRequest(profileUrl, profileName, profileId, storedMsg);
                    console.log(`[ProfileScanner] Stored "${profileName}" for message when they accept`);
                  }
                }
              }
            }

            // Only after processing is fully complete, move to next profile
            const waitTime = this.getLookupInterval();
            await this.delay(waitTime);
            console.log(`[ProfileScanner] ✅ Processing complete for "${profileName}" – moving to next profile.`);
          }
        } else {
          // Profile did not pass filters - continue indexing
          console.log(`[ProfileScanner] ❌ Profile #${profileIndex} "${profileName}" did not match filters – continuing to next profile...`);
          await this.delay(200); // Small delay before next profile
        }
        
        // Loop continues to next profile only after current one is done (processed or skipped)
      } // End of while(true) loop
    } catch (error) {
      if (this._handleContextInvalidated(error)) return;
      console.error('[ProfileScanner] Critical Error:', error.name, error.message);
      console.error(error.stack);
      if (window.showFrienderToast) window.showFrienderToast('Scan Error', 'Technical issue detected.', 'error');
    } finally {
      this.isScanning = false;
    }
  }

  // Detect page type
  detectPageType() {
    const url = window.location.href;

    if (url.includes('/groups/') && (url.includes('/members') || url.includes('/people'))) {
      return 'groups_people';
    } else if (url.includes('/friends') || url.includes('/find-friends') || url.includes('/friends/suggestions')) {
      return 'friend_suggestions';
    } else if (url.includes('/profile.php') || url.match(/facebook\.com\/[^\/\?]+$/)) {
      return 'profile';
    }

    return 'unknown';
  }

  // Returns true if container has an "Add Friend" / "Add" style button (so order is stable across scrolls)
  hasAddFriendButton(el) {
    const text = (el.textContent || '').trim();
    return text.includes('Add Friend') || text.includes('Add friend') || text.includes('Add');
  }

  // Sort by DOCUMENT position (top + scrollY, left + scrollX) so order is STABLE across scrolling
  sortContainersByDocumentPosition(arr) {
    const scrollY = window.scrollY || 0;
    const scrollX = window.scrollX || 0;
    arr.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      const topA = rectA.top + scrollY;
      const topB = rectB.top + scrollY;
      const verticalDiff = topA - topB;
      if (Math.abs(verticalDiff) > 5) return verticalDiff;
      return (rectA.left + scrollX) - (rectB.left + scrollX);
    });
  }

  // Get profile containers from current page
  // Returns profiles in STRICT document order (top to bottom) for sequential processing and stable "last position"
  async getProfileLinks(pageType) {
    // 1. Check for modern dynamic list items
    let containers = Array.from(document.querySelectorAll('.x1oo3zqc, [role="listitem"], .x1gljlme, [role="article"]'));

    // 2. Filter for containers that actually contain Add Friend / Add button
    containers = containers.filter(el => this.hasAddFriendButton(el));

    // 3. CRITICAL: Sort by DOCUMENT position (not viewport) so order is stable across scroll – "last search position" stays correct
    if (containers.length > 0) {
      this.sortContainersByDocumentPosition(containers);
      console.log(`[ProfileScanner] Found ${containers.length} profiles, sorted by document position (stable across scroll)`);
      return containers;
    }

    // 4. Fallback: elements with data-visualcompletion that contain Add Friend / Add
    let fallback = Array.from(document.querySelectorAll('div[data-visualcompletion="ignore-dynamic"]')).filter(el =>
      this.hasAddFriendButton(el)
    );

    // 5. Fallback: any card that has a profile link + Add Friend (for groups/members and suggestions)
    if (fallback.length === 0) {
      const withProfileLink = Array.from(document.querySelectorAll('a[href*="/profile.php"], a[href*="/user/"], a[href*="facebook.com/"][href*="/"]'));
      const seen = new Set();
      for (const a of withProfileLink) {
        const href = (a.getAttribute('href') || a.href || '').split('?')[0];
        if (!href || href.includes('/groups') || href.includes('/friends') || href.includes('/messages')) continue;
        const card = a.closest('[role="listitem"], [role="article"], .x1oo3zqc, .x1gljlme, div[data-visualcompletion="ignore-dynamic"], div[style*="position"]');
        const root = card || a.closest('div[style]') || a.parentElement?.parentElement?.parentElement;
        if (!root || seen.has(root)) continue;
        if (this.hasAddFriendButton(root)) {
          seen.add(root);
          fallback.push(root);
        }
      }
    }

    if (fallback.length > 0) {
      this.sortContainersByDocumentPosition(fallback);
      console.log(`[ProfileScanner] Using fallback method: Found ${fallback.length} profiles, sorted by document position`);
      return fallback;
    }
    return [];
  }

  findAddBtn(container) {
    // Try structured aria-label first
    const labelMatch = container.querySelector('div[aria-label^="Add Friend"], div[aria-label^="Add friend"]');
    if (labelMatch) return labelMatch;

    // Search specifically for the text within buttons
    const buttons = Array.from(container.querySelectorAll('div[role="button"], span[role="button"]'));
    return buttons.find(b => {
      const t = b.textContent || "";
      return t === "Add Friend" || t === "Add friend";
    });
  }

  // Check if URL is a valid profile URL
  isValidProfileUrl(url) {
    if (!url || !url.includes('facebook.com')) return false;

    // Exclude non-profile pages
    const excludePatterns = [
      '/home',
      '/groups/',
      '/friends',
      '/messages',
      '/watch',
      '/marketplace',
      '/events',
      '/pages',
      '/login',
      '/register',
      '/help',
      '/about',
      '/privacy',
      '/terms'
    ];

    return !excludePatterns.some(pattern => url.includes(pattern));
  }

  // Check if link is a profile link
  isProfileLink(href) {
    if (!href) return false;

    return href.includes('/profile.php') ||
      (href.includes('facebook.com/') &&
        !href.includes('/home') &&
        !href.includes('/groups') &&
        !href.includes('/friends') &&
        !href.includes('/messages') &&
        !href.includes('/watch') &&
        !href.includes('/marketplace') &&
        href.match(/facebook\.com\/[^\/\?]+$/));
  }

  // Validate profile against all filters
  // pageType: 'friend_suggestions' | 'groups_people' – mutual friends filter only applied on suggestions (not on group people)
  async validateProfile(container, text, pageType) {
    if (!this.settings) {
      console.warn('[ProfileScanner] ⚠️ No settings available for validation!');
      return false;
    }

    // Extract profile name from container element (more reliable than text)
    let profileName = 'Unknown';
    
    // Try to find name in common name selectors
    const nameSelectors = [
      'h1', 'h2', 'h3',
      '[data-testid*="name"]',
      'span[dir="auto"]',
      'a[href*="/profile.php"]',
      'a[href*="/user/"]'
    ];
    
    for (const selector of nameSelectors) {
      const nameEl = container.querySelector(selector);
      if (nameEl) {
        const nameText = nameEl.textContent?.trim() || '';
        const lowerName = nameText.toLowerCase();
        if (nameText && 
            nameText.length > 0 && 
            nameText.length < 100 &&
            !lowerName.includes('add friend') &&
            !lowerName.includes('remove') &&
            !lowerName.includes('message') &&
            !lowerName.match(/^#\d+$/)) {
          profileName = nameText;
          break;
        }
      }
    }
    
    // Fallback to first line of text
    if (profileName === 'Unknown') {
      const firstLine = text.split('\n')[0]?.trim() || '';
      const cleaned = firstLine
        .replace(/\b(add friend|remove|message|cancel request)\b/gi, '')
        .replace(/\b#\d+\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned && cleaned.length > 0 && cleaned.length < 100) {
        profileName = cleaned;
      }
    }
    
    console.log(`[ProfileScanner] 🔍 Validating profile: "${profileName}"`);
    console.log(`[ProfileScanner] Active filters:`, {
      useGenderFilter: this.settings.useGenderFilter,
      gender: this.settings.gender,
      useCountryFilter: this.settings.useCountryFilter,
      mutualFriendsOperator: this.settings.mutualFriendsOperator,
      mutualFriendsCount: this.settings.mutualFriendsCount,
      keywords: this.settings.keywords?.length || 0,
      negativeKeywords: this.settings.negativeKeywords?.length || 0
    });

    // Get ALL text from the profile container - comprehensive extraction
    // This includes name, bio, work info, location, etc.
    let allText = text; // Start with main text
    
    // Try multiple selectors to get additional profile information
    const additionalSelectors = [
      '.xjbqb8w', '.x1yztbdb', // Common bio/description classes
      '[data-testid*="profile"]', // Profile test IDs
      'span', 'div', 'p' // General text containers
    ];
    
    // Get all text from nested elements (excluding buttons and UI elements)
    const allElements = container.querySelectorAll('span, div, p, a');
    for (const el of allElements) {
      // Skip button elements, badges, and UI elements
      if (el.closest('button') || 
          el.getAttribute('role') === 'button' ||
          el.classList.contains('friender-index-badge') ||
          el.classList.contains('friender-processing-badge') ||
          el.classList.contains('friender-processed-badge')) {
        continue;
      }
      
      const elText = el.textContent?.trim() || '';
      if (elText && elText.length > 0) {
        const lowerElText = elText.toLowerCase();
        
        // Skip UI text
        if (lowerElText.includes('add friend') ||
            lowerElText.includes('cancel request') ||
            lowerElText.includes('message') ||
            lowerElText.includes('remove') ||
            lowerElText.match(/^#\d+$/) ||
            lowerElText.includes('profile picture of') ||
            lowerElText.includes('who is a mutual friend') ||
            lowerElText.includes('link to see everyone')) {
          continue;
        }
        
        if (!allText.toLowerCase().includes(lowerElText)) {
          allText += ' ' + elText;
        }
      }
    }
    
    // Also try to get text from aria-labels and data attributes (excluding button labels)
    const ariaLabels = container.querySelectorAll('[aria-label]');
    for (const el of ariaLabels) {
      // Skip button aria-labels
      if (el.closest('button') || el.getAttribute('role') === 'button') continue;
      
      const label = el.getAttribute('aria-label')?.trim() || '';
      if (label && label.length > 0) {
        const lowerLabel = label.toLowerCase();
        if (!lowerLabel.includes('add friend') &&
            !lowerLabel.includes('button') &&
            !lowerLabel.includes('remove') &&
            !allText.toLowerCase().includes(lowerLabel)) {
          allText += ' ' + label;
        }
      }
    }
    
    const lowerText = allText.toLowerCase();
    
    // Debug: Log full extracted text for troubleshooting
    if (this.settings.keywords && this.settings.keywords.length > 0) {
      console.log(`[ProfileScanner] Full extracted text (first 300 chars): "${lowerText.substring(0, 300)}..."`);
    }

    // 1. Mandatory Keywords (Bio/Name/Role)
    if (this.settings.keywords && Array.isArray(this.settings.keywords) && this.settings.keywords.length > 0) {
      const keywords = this.settings.keywords.filter(k => k && k.trim().length > 0).map(k => k.toLowerCase().trim());
      if (keywords.length > 0) {
        // Check if any keyword is found in the text (case-insensitive)
        const matchedKeyword = keywords.find(k => {
          const keywordLower = k.toLowerCase().trim();
          return lowerText.includes(keywordLower);
        });
        
        if (!matchedKeyword) {
          console.log(`[ProfileScanner] ❌ Skipping "${profileName}" - Missing required keywords. Looking for: [${keywords.join(', ')}]`);
          console.log(`[ProfileScanner] Profile text sample: "${lowerText.substring(0, 200)}..."`);
          
          // Debug: Show if "works" variations exist
          if (keywords.some(k => k.includes('work'))) {
            const hasWorks = lowerText.includes('work');
            const hasWorksAt = lowerText.includes('works at') || lowerText.includes('work at');
            console.log(`[ProfileScanner] Debug - Has "work": ${hasWorks}, Has "works at"/"work at": ${hasWorksAt}`);
          }
          
          return false;
        }
        console.log(`[ProfileScanner] ✅ Profile "${profileName}" passed keywords filter - Matched keyword: "${matchedKeyword}"`);
      }
    } else {
      console.log(`[ProfileScanner] ℹ️ Keywords filter not active (empty or not set)`);
    }

    // 2. Prohibited Keywords
    if (this.settings.negativeKeywords?.length > 0) {
      const hasNegative = this.settings.negativeKeywords.some(k => lowerText.includes(k.toLowerCase()));
      if (hasNegative) {
        console.log(`[ProfileScanner] ❌ Skipping "${profileName}" - Contains negative keywords`);
        return false;
      }
      console.log(`[ProfileScanner] ✅ Profile "${profileName}" passed negative keywords filter`);
    }

    // 3. Gender Guessing Logic
    if (this.settings.useGenderFilter && this.settings.gender) {
      const profileName = text.split('\n')[0]?.trim() || '';
      
      // Try to detect gender from profile text
      const isMale = lowerText.includes('he/him') || 
                     lowerText.includes(' male') || 
                     lowerText.includes(' man ') ||
                     lowerText.includes(' his ') ||
                     lowerText.includes(' him ') ||
                     lowerText.includes(' he ');
      
      const isFemale = lowerText.includes('she/her') || 
                       lowerText.includes(' female') || 
                       lowerText.includes(' woman ') ||
                       lowerText.includes(' her ') ||
                       lowerText.includes(' she ');
      
      // Additional check: Look for gender-specific profile elements
      const genderElements = container.querySelectorAll('[aria-label*="male"], [aria-label*="female"], [data-testid*="gender"]');
      let detectedGender = null;
      
      for (const el of genderElements) {
        const elText = el.textContent?.toLowerCase() || el.getAttribute('aria-label')?.toLowerCase() || '';
        if (elText.includes('male') || elText.includes('man')) {
          detectedGender = 'male';
          break;
        } else if (elText.includes('female') || elText.includes('woman')) {
          detectedGender = 'female';
          break;
        }
      }
      
      // Determine final gender detection
      let finalGender = detectedGender;
      if (!finalGender) {
        if (isMale) finalGender = 'male';
        else if (isFemale) finalGender = 'female';
        else {
          // Try name-based gender detection as fallback
          finalGender = this.detectGenderFromName(profileName);
          if (finalGender) {
            console.log(`[ProfileScanner] 🔍 Name-based gender detection: "${profileName}" → ${finalGender.toUpperCase()}`);
          }
        }
      }
      
      console.log(`[ProfileScanner] 🔍 Gender detection result for "${profileName}": ${finalGender || 'UNKNOWN'}`);
      
      // Apply gender filter - STRICT: only allow if gender clearly matches
      // If gender cannot be determined, skip the profile (be strict)
      if (this.settings.gender === 'male') {
        if (finalGender === 'female') {
          console.log(`[ProfileScanner] ❌ Skipping "${profileName}" - Detected as FEMALE (gender filter: MALE)`);
          return false;
        }
        if (finalGender === 'male') {
          console.log(`[ProfileScanner] ✅ Profile "${profileName}" passed gender filter - Detected: MALE, Filter: MALE`);
        } else {
          // Gender unclear - skip to be strict
          console.log(`[ProfileScanner] ❌ Skipping "${profileName}" - Gender unclear (cannot determine), gender filter requires MALE`);
          return false;
        }
      } else if (this.settings.gender === 'female') {
        if (finalGender === 'male') {
          console.log(`[ProfileScanner] ❌ Skipping "${profileName}" - Detected as MALE (gender filter: FEMALE)`);
          return false;
        }
        if (finalGender === 'female') {
          console.log(`[ProfileScanner] ✅ Profile "${profileName}" passed gender filter - Detected: FEMALE, Filter: FEMALE`);
        } else {
          // Gender unclear - skip to be strict
          console.log(`[ProfileScanner] ❌ Skipping "${profileName}" - Gender unclear (cannot determine), gender filter requires FEMALE`);
          return false;
        }
      }
    }

    // 4. Country & Tier Filtering
    if (this.settings.useCountryFilter) {
      if (this.settings.countryFilter === 'tier' && this.settings.selectedTiers?.length > 0) {
        const tierList = this.getTierCountries(this.settings.selectedTiers);
        const matchesTier = tierList.some(c => lowerText.includes(c.toLowerCase()));
        if (!matchesTier) return false;
      } else if (this.settings.countryFilter === 'country' && this.settings.selectedCountries?.length > 0) {
        const matchesCountry = this.settings.selectedCountries.some(c => lowerText.includes(c.toLowerCase()));
        if (!matchesCountry) return false;
      }
    }

    // 5. Mutual Friends Constraint – only on Suggestions (and friend-of-friend). NOT on Group people page (no UI for it there).
    if (pageType !== 'groups_people') {
      let count = 0;
      // Pattern 1: "X mutual friends" or "X mutual friend"
      let mutualMatch = lowerText.match(/(\d+)\s+mutual\s+(?:friend|friends)/);
      if (mutualMatch) {
        count = parseInt(mutualMatch[1]) || 0;
      } else {
        // Pattern 2: "X mutual" (shorter form)
        mutualMatch = lowerText.match(/(\d+)\s+mutual/);
        if (mutualMatch) {
          count = parseInt(mutualMatch[1]) || 0;
        } else {
          // Pattern 3: Group/suggestions cards – use full container text (innerText can catch text we missed)
          const containerFull = (container.innerText || container.textContent || '').toLowerCase();
          mutualMatch = containerFull.match(/(\d+)\s+mutual\s+(?:friend|friends)?/);
          if (mutualMatch) {
            count = parseInt(mutualMatch[1]) || 0;
          } else {
            // Pattern 4: Look in specific DOM elements
            const mutualElements = container.querySelectorAll('[data-testid*="mutual"], [aria-label*="mutual"], span, div');
            for (const el of mutualElements) {
              const elText = el.textContent?.toLowerCase() || '';
              mutualMatch = elText.match(/(\d+)\s+mutual/);
              if (mutualMatch) {
                count = parseInt(mutualMatch[1]) || 0;
                break;
              }
            }
          }
        }
      }
      const required = this.settings.mutualFriendsCount || 0;
      const operator = this.settings.mutualFriendsOperator || 'greater';
      if (!this.matchesMutualFriendsFilter(count)) {
        console.log(`[ProfileScanner] ❌ Skipping "${profileName}" - Mutual friends: ${count}, Required: ${operator} ${required}`);
        return false;
      }
      console.log(`[ProfileScanner] ✅ Profile "${profileName}" passed mutual friends filter - Count: ${count}, Required: ${operator} ${required}`);
    }

    // All filters passed
    console.log(`[ProfileScanner] ✅✅✅ Profile "${profileName}" PASSED ALL FILTERS - Proceeding with friend request`);
    return true;
  }

  getTierCountries(tiers) {
    const data = {
      '1': ["United States", "Canada", "United Kingdom", "Australia", "New Zealand", "Germany", "France", "Netherlands", "Belgium", "Switzerland", "Sweden", "Norway", "Denmark", "Finland", "Austria", "Ireland", "Japan", "Singapore", "South Korea"],
      '2': ["India", "China", "Malaysia", "Thailand", "Vietnam", "Indonesia", "Philippines", "Sri Lanka", "UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Poland", "Czech Republic", "Hungary", "Romania", "Portugal", "Spain", "Italy", "Greece", "Brazil", "Mexico", "Argentina", "Chile", "Colombia", "South Africa", "Egypt"],
      '3': ["Pakistan", "Bangladesh", "Nepal", "Afghanistan", "Myanmar", "Cambodia", "Laos", "Nigeria", "Kenya", "Ghana", "Ethiopia", "Uganda", "Tanzania", "Rwanda", "Zimbabwe", "Iraq", "Yemen", "Syria", "Bolivia", "Peru", "Venezuela", "Haiti"]
    };
    let result = [];
    tiers.forEach(t => { if (data[t]) result = result.concat(data[t]); });
    return result;
  }

  // Detect gender from name (simple heuristic)
  detectGenderFromName(name) {
    if (!name) return null;
    
    const nameLower = name.toLowerCase().trim();
    const nameParts = nameLower.split(/\s+/);
    const firstName = nameParts[0];
    
    console.log(`[ProfileScanner] 🔍 Analyzing name: "${name}" → firstName: "${firstName}"`);
    
    // Common female name endings/patterns
    const femalePatterns = [
      /^[a-z]+a$/,  // Ends with 'a' (Maria, Anna, etc.)
      /^[a-z]+i$/,  // Ends with 'i' (Priya, Devi, etc.)
      /^[a-z]+y$/,  // Ends with 'y' (Mary, Lucy, etc.)
      /^[a-z]+ee$/, // Ends with 'ee' (Lee, etc.)
      /^[a-z]+ia$/, // Ends with 'ia' (Maria, etc.)
    ];
    
    // Common female names (add more as needed)
    const femaleNames = [
      'priya', 'devi', 'kumari', 'lakshmi', 'sita', 'geeta', 'meera', 'radha',
      'mary', 'anna', 'sarah', 'lisa', 'jane', 'emily', 'sophia', 'olivia',
      'sumaiya', 'tluangi', 'rima', 'jeya', 'gayatri', 'gayathiri'
    ];
    
    // Common male name endings/patterns
    const malePatterns = [
      /^[a-z]+an$/, // Ends with 'an' (Raman, etc.)
      /^[a-z]+ar$/, // Ends with 'ar' (Kumar, etc.)
      /^[a-z]+esh$/, // Ends with 'esh' (Rajesh, etc.)
      /^[a-z]+th$/,  // Ends with 'th' (Smith, etc.)
    ];
    
    // Common male names
    const maleNames = [
      'raj', 'kumar', 'muthu', 'vinoth', 'ram', 'kishore', 'arun', 'mohan',
      'john', 'mike', 'david', 'james', 'robert', 'william', 'richard'
    ];
    
    // Check if it's a known female name
    if (femaleNames.some(n => firstName.includes(n) || nameLower.includes(n))) {
      return 'female';
    }
    
    // Check if it's a known male name
    if (maleNames.some(n => firstName.includes(n) || nameLower.includes(n))) {
      return 'male';
    }
    
    // Check patterns
    for (const pattern of femalePatterns) {
      if (pattern.test(firstName)) {
        return 'female';
      }
    }
    
    for (const pattern of malePatterns) {
      if (pattern.test(firstName)) {
        return 'male';
      }
    }
    
    return null; // Cannot determine
  }

  // Get profile gender (if available)
  async getProfileGender() {
    try {
      // Look for gender indicators in profile
      const profileText = document.body.textContent?.toLowerCase() || '';

      // Check for gender-specific terms
      if (profileText.includes('male') || profileText.includes('man') || profileText.includes('he/him')) {
        return 'male';
      } else if (profileText.includes('female') || profileText.includes('woman') || profileText.includes('she/her')) {
        return 'female';
      }

      // Could also check profile structure, but Facebook doesn't always show this
      return null; // Unknown
    } catch (error) {
      console.error('[ProfileScanner] Error getting gender:', error);
      return null;
    }
  }

  // Get profile country/location
  async getProfileCountry() {
    try {
      // Look for location information
      const locationElements = document.querySelectorAll('[data-testid*="location"], [data-testid*="city"], .location, .city');

      for (const el of locationElements) {
        const text = el.textContent?.toLowerCase() || '';
        if (text) {
          return text;
        }
      }

      // Alternative: search in profile text
      const profileText = document.body.textContent?.toLowerCase() || '';
      // This is a simplified check - in reality, you'd need a country database

      return null; // Unknown
    } catch (error) {
      console.error('[ProfileScanner] Error getting country:', error);
      return null;
    }
  }

  // Check if country matches filter
  matchesCountryFilter(profileCountry) {
    // This would need actual country matching logic
    // For now, return true if country filter is not specific
    if (!profileCountry) return true; // If we can't determine, allow it

    // Tier Level vs Country Level logic would go here
    return true; // Placeholder
  }

  // Get mutual friends count
  async getMutualFriendsCount() {
    try {
      // Look for mutual friends indicator
      const mutualFriendsText = document.body.textContent?.match(/(\d+)\s+mutual\s+friend/i);
      if (mutualFriendsText) {
        return parseInt(mutualFriendsText[1]) || 0;
      }

      // Alternative: look for specific elements
      const mutualElements = document.querySelectorAll('[data-testid*="mutual"], .mutual-friends');
      for (const el of mutualElements) {
        const text = el.textContent || '';
        const match = text.match(/(\d+)/);
        if (match) {
          return parseInt(match[1]) || 0;
        }
      }

      return 0; // Default to 0 if can't determine
    } catch (error) {
      console.error('[ProfileScanner] Error getting mutual friends:', error);
      return 0;
    }
  }

  // Check if mutual friends match filter
  matchesMutualFriendsFilter(count) {
    const operator = this.settings.mutualFriendsOperator || 'greater';
    const required = this.settings.mutualFriendsCount || 0;

    switch (operator) {
      case 'greater':
        return count >= required;
      case 'equal':
        return count === required;
      case 'less':
        return count <= required;
      default:
        return true;
    }
  }

  // Get profile text for keyword matching
  async getProfileText() {
    try {
      // Get all visible text from profile
      const profileContent = document.querySelector('[role="main"]') || document.body;
      return profileContent.textContent?.toLowerCase() || '';
    } catch (error) {
      console.error('[ProfileScanner] Error getting profile text:', error);
      return '';
    }
  }

  // Check if profile matches keywords
  matchesKeywords(profileText, keywords) {
    if (!keywords || keywords.length === 0) return true;

    // Check if any keyword is found in profile text
    return keywords.some(keyword =>
      profileText.includes(keyword.toLowerCase())
    );
  }

  // Check if profile matches negative keywords
  matchesNegativeKeywords(profileText, negativeKeywords) {
    if (!negativeKeywords || negativeKeywords.length === 0) return false;

    // Check if any negative keyword is found
    return negativeKeywords.some(keyword =>
      profileText.includes(keyword.toLowerCase())
    );
  }

  // Get lookup interval
  getLookupInterval() {
    const interval = this.settings?.lookupInterval || 'auto';

    if (interval === 'auto') {
      // Random between 30-60 seconds
      return Math.floor(Math.random() * (60000 - 30000 + 1)) + 30000;
    }

    return parseInt(interval) * 1000; // Convert to milliseconds
  }

  // Delay that can be interrupted by Stop (checks isScanning and GET_STATE every 500ms)
  async delayWithStopCheck(ms) {
    const chunk = 500;
    let remaining = ms;
    while (remaining > 0 && this.isScanning) {
      try {
        const stateData = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
        const status = stateData?.state?.status;
        if (status !== 'running') {
          this.isScanning = false;
          return;
        }
      } catch (_) {}
      await this.delay(Math.min(chunk, remaining));
      remaining -= chunk;
    }
  }

  // Check if limit is reached
  async isLimitReached() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      const state = response?.state || {};
      const settings = response?.settings || {};

      const requestsLimit = this.settings?.requestsLimit || 'limited';
      const numberOfRequests = this.settings?.numberOfRequests || 2;

      if (requestsLimit === 'limited') {
        const sent = state.sessionFriendRequests || 0;
        if (sent >= numberOfRequests) {
          return true;
        }
      }

      // No daily limit check - only session limit

      return false;
    } catch (error) {
      console.error('[ProfileScanner] Error checking limits:', error);
      return false;
    }
  }

  // Get message text from after_request template for storing with pending request (sent when they accept).
  async getStoredMessageForPending(profileName) {
    if (!window.facebookHandler) return null;
    try {
      return await window.facebookHandler.getMessageTemplate('after_request', profileName);
    } catch (e) {
      return null;
    }
  }

  // Store pending friend request for later message sending after acceptance.
  // Stores message text from template so the same message is sent when they accept (all page types).
  async storePendingRequest(profileUrl, profileName, profileId = null, storedMessage = null) {
    try {
      const result = await chrome.storage.local.get(['pendingFriendRequests']);
      const pendingRequests = result.pendingFriendRequests || [];

      if (!profileId && profileUrl) {
        const idMatch = profileUrl.match(/[?&]id=(\d+)/);
        if (idMatch) profileId = idMatch[1];
        else {
          const pathMatch = profileUrl.match(/facebook\.com\/(?:profile\.php\?id=|user\/)?(\d+)/);
          if (pathMatch) profileId = pathMatch[1];
        }
      }

      const exists = pendingRequests.some(req =>
        req.url === profileUrl ||
        (profileId && req.profileId === profileId) ||
        (req.name && req.name.toLowerCase() === profileName.toLowerCase() && !req.messageSent)
      );

      if (!exists) {
        pendingRequests.push({
          url: profileUrl,
          name: profileName,
          profileId: profileId,
          sentAt: Date.now(),
          messageSent: false,
          storedMessage: storedMessage && String(storedMessage).trim() ? storedMessage.trim() : null
        });
        await chrome.storage.local.set({ pendingFriendRequests: pendingRequests });
        console.log(`[ProfileScanner] ✅ Stored pending request for: ${profileName}${profileId ? ` (ID: ${profileId})` : ''} – message will send when they accept (all pages)`);
      } else {
        console.log(`[ProfileScanner] Pending request already exists for: ${profileName}`);
      }
    } catch (error) {
      if (this._handleContextInvalidated(error)) return;
      console.error('[ProfileScanner] Error storing pending request:', error);
    }
  }

  // Get automation state
  async getAutomationState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      return response?.state || { status: 'stopped' };
    } catch (error) {
      if (this._handleContextInvalidated(error)) return { status: 'stopped' };
      return { status: 'stopped' };
    }
  }

  // Save current position for resume
  async savePosition(index) {
    this.lastPosition = index;
    try {
      await chrome.storage.local.set({
        lastSearchPosition: index,
        lastSearchUrl: window.location.href
      });
    } catch (e) {
      if (this._handleContextInvalidated(e)) return;
      throw e;
    }
  }

  // Load more profiles (scroll or pagination)
  // Returns true if new profiles were loaded, false otherwise
  async loadMoreProfiles(pageType) {
    try {
      const previousProfileCount = this.processedProfileIds.size;
      const previousIndex = this.currentIndex;
      
      // Scroll to bottom to load more
      const scrollPosition = window.scrollY;
      const documentHeight = document.body.scrollHeight;
      
      console.log(`[ProfileScanner] Scrolling to bottom (current: ${scrollPosition}, target: ${documentHeight})...`);
      window.scrollTo(0, documentHeight);
      
      // Wait for new content to load (Facebook uses lazy loading) – interruptible by Stop
      console.log(`[ProfileScanner] ⏳ Waiting for new profiles to load...`);
      await this.delayWithStopCheck(3000);
      if (!this.isScanning) return false;
      
      // Check if page scrolled and new content appeared
      const newScrollPosition = window.scrollY;
      const newDocumentHeight = document.body.scrollHeight;
      
      // If document height increased, more content is loading
      if (newDocumentHeight > documentHeight) {
        console.log(`[ProfileScanner] Document height increased (${documentHeight} → ${newDocumentHeight}), waiting more...`);
        await this.delayWithStopCheck(3000);
        if (!this.isScanning) return false;
      }
      
      // Get all profiles after scroll (but we'll only index visible ones)
      const newLinks = await this.getProfileLinks(pageType);
      const totalCount = newLinks.length;
      
      console.log(`[ProfileScanner] After scroll: Total profiles on page: ${totalCount}, Previous index: ${previousIndex}`);
      
      // Check if we actually got new visible profiles (not just total count)
      const visibleAfterScroll = this.getVisibleProfiles(newLinks);
      const newVisibleCount = visibleAfterScroll.filter(el => {
        const badge = el.querySelector('.friender-index-badge');
        return !badge; // Not indexed yet
      }).length;
      
      if (newVisibleCount > 0 || totalCount > previousIndex) {
        console.log(`[ProfileScanner] ✅ Loaded ${newVisibleCount} new visible profiles (${totalCount - previousIndex} total new on page)`);
        console.log(`[ProfileScanner] Will continue from sequential position ${this.currentIndex} (next unprocessed profile)`);
        return true; // New profiles loaded
      } else {
        // No new profiles - check if we're truly at the bottom
        const finalScrollPosition = window.scrollY;
        const finalDocumentHeight = document.body.scrollHeight;
        
        if (finalScrollPosition >= finalDocumentHeight - 100) {
          // We're at the bottom and no new profiles appeared
          console.log(`[ProfileScanner] ⛔ Reached bottom of page. No new profiles loaded.`);
          console.log(`[ProfileScanner] Total profiles indexed: ${totalCount}, Processed: ${this.processedProfileIds.size}`);
          return false; // No new profiles
        } else {
          // Not at bottom yet, try scrolling more
          console.log(`[ProfileScanner] Not at bottom yet, scrolling more...`);
          window.scrollTo(0, document.body.scrollHeight);
          await this.delayWithStopCheck(3000);
          if (!this.isScanning) return false;
          
          // Final check
          const finalLinks = await this.getProfileLinks(pageType);
          const finalTotal = finalLinks.length;
          
          // Check for new visible profiles
          const finalVisible = this.getVisibleProfiles(finalLinks);
          const finalNewVisible = finalVisible.filter(el => {
            const badge = el.querySelector('.friender-index-badge');
            return !badge;
          }).length;
          
          if (finalNewVisible > 0 || finalTotal > previousIndex) {
            console.log(`[ProfileScanner] ✅ After additional scroll, found ${finalNewVisible} new visible profiles!`);
            return true;
          } else {
            console.log(`[ProfileScanner] ⛔ No new visible profiles after additional scroll. All profiles processed.`);
            return false;
          }
        }
      }
    } catch (error) {
      console.error('[ProfileScanner] Error loading more profiles:', error);
      return false; // Assume no new profiles on error
    }
  }

  // Inject CSS styles for visual indicators
  injectVisualIndicatorStyles() {
    // Check if styles already injected
    if (document.getElementById('friender-visual-indicators-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'friender-visual-indicators-style';
    style.textContent = `
      .friender-index-badge {
        position: absolute;
        top: 8px;
        left: 8px;
        background: #2196F3;
        color: white;
        border-radius: 4px;
        padding: 4px 8px;
        min-width: 32px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        font-family: Arial, sans-serif;
      }
      
      .friender-processing-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        background: #ff4444;
        color: white;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        z-index: 10001;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        animation: friender-pulse 1.5s ease-in-out infinite;
      }
      
      .friender-processed-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        background: #4CAF50;
        color: white;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: bold;
        z-index: 10001;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }
      
      .friender-processing-indicator {
        position: relative;
        border: 2px solid #ff4444 !important;
        box-shadow: 0 0 10px rgba(255, 68, 68, 0.5) !important;
        background: rgba(255, 68, 68, 0.05) !important;
      }
      
      .friender-processed-indicator {
        position: relative;
        border: 2px solid #4CAF50 !important;
        box-shadow: 0 0 10px rgba(76, 175, 80, 0.3) !important;
        background: rgba(76, 175, 80, 0.05) !important;
      }
      
      @keyframes friender-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.1);
          opacity: 0.8;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Add index number badge to a single profile
  addIndexNumberToProfile(profileEl, indexNumber, totalCount) {
    if (!profileEl || !document.body.contains(profileEl)) return;
    
    // Remove existing index badge if any
    const existingIndexBadge = profileEl.querySelector('.friender-index-badge');
    if (existingIndexBadge) {
      existingIndexBadge.remove();
    }
    
    // Ensure parent has position relative
    const computedStyle = window.getComputedStyle(profileEl);
    if (computedStyle.position === 'static') {
      profileEl.style.position = 'relative';
    }
    
    // Create and add index badge
    const indexBadge = document.createElement('div');
    indexBadge.className = 'friender-index-badge';
    indexBadge.textContent = `#${indexNumber}`;
    indexBadge.title = `Profile Index: ${indexNumber}${totalCount ? ` of ${totalCount}` : ''}`;
    
    profileEl.appendChild(indexBadge);
  }

  // Add index number badge to all profiles (legacy - for backward compatibility)
  addIndexNumbersToProfiles(profileLinks) {
    profileLinks.forEach((profileEl, index) => {
      this.addIndexNumberToProfile(profileEl, index + 1, profileLinks.length);
    });
    
    console.log(`[ProfileScanner] ✅ Added index numbers to ${profileLinks.length} profiles`);
  }

  // Add processing indicator badge to profile element
  addProcessingIndicator(profileEl, profileId) {
    // Remove any existing processing/processed badges (but keep index badge)
    const existingBadge = profileEl.querySelector('.friender-processing-badge, .friender-processed-badge');
    if (existingBadge) {
      existingBadge.remove();
    }

    // Remove processing/processed classes
    profileEl.classList.remove('friender-processing-indicator', 'friender-processed-indicator');

    // Add processing class
    profileEl.classList.add('friender-processing-indicator');

    // Create and add processing badge
    const badge = document.createElement('div');
    badge.className = 'friender-processing-badge';
    badge.textContent = '⏳';
    badge.title = `Processing profile #${profileId} (position in list)`;
    
    // Ensure parent has position relative
    const computedStyle = window.getComputedStyle(profileEl);
    if (computedStyle.position === 'static') {
      profileEl.style.position = 'relative';
    }
    
    profileEl.appendChild(badge);
  }

  // Update indicator to show processed state
  updateProcessedIndicator(profileEl, profileId) {
    // Remove processing badge
    const processingBadge = profileEl.querySelector('.friender-processing-badge');
    if (processingBadge) {
      processingBadge.remove();
    }

    // Remove processing class, add processed class
    profileEl.classList.remove('friender-processing-indicator');
    profileEl.classList.add('friender-processed-indicator');

    // Create processed badge (checkmark) - index badge remains visible
    const badge = document.createElement('div');
    badge.className = 'friender-processed-badge';
    badge.textContent = '✓';
    badge.title = `Profile ID ${profileId} processed - Friend request sent`;
    
    // Ensure parent has position relative
    const computedStyle = window.getComputedStyle(profileEl);
    if (computedStyle.position === 'static') {
      profileEl.style.position = 'relative';
    }
    
    profileEl.appendChild(badge);
  }

  // Delay utility
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize global profile scanner
window.profileScanner = new ProfileScanner();

