/**
 * Automation Engine
 * Core queue-based execution system with safety controls
 */

// Shared handler for "Extension context invalidated" (extension was reloaded) – show once per page
if (typeof window !== 'undefined') {
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

class AutomationEngine {
  constructor() {
    this.queue = [];
    this.isRunning = false;
    this.isPaused = false;
    this.currentAction = null;
    this.failureCount = 0;
    this.settings = null;
    this.state = null;
    
    // Bind methods
    this.start = this.start.bind(this);
    this.pause = this.pause.bind(this);
    this.resume = this.resume.bind(this);
    this.stop = this.stop.bind(this);
    this.emergencyStop = this.emergencyStop.bind(this);
    
    // Initialize
    this.loadSettings();
    this.setupMessageListener();
  }
  
  // Check if extension context is still valid
  isExtensionContextValid() {
    try {
      return chrome.runtime?.id !== undefined;
    } catch (error) {
      return false;
    }
  }
  
  // Safe wrapper for chrome.runtime.sendMessage with error handling
  async safeSendMessage(message) {
    if (!this.isExtensionContextValid()) {
      throw new Error('Extension context invalidated');
    }
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || '';
          if (errorMsg.includes('Extension context invalidated') || 
              errorMsg.includes('message port closed') ||
              errorMsg.includes('Could not establish connection')) {
            reject(new Error('Extension context invalidated'));
          } else {
            reject(new Error(chrome.runtime.lastError.message));
          }
        } else {
          resolve(response);
        }
      });
    });
  }
  
  // Load settings from storage
  async loadSettings() {
    try {
      // Use safe message sending
      const response = await this.safeSendMessage({ type: 'GET_STATE' });
      
      if (!response) {
        console.warn('[AutomationEngine] No response from background worker');
        return;
      }
      
      this.settings = response.settings;
      this.state = response.state;
      
      // Check emergency stop
      if (this.settings?.safety?.emergencyStop) {
        this.isRunning = false;
        this.isPaused = true;
      }
      
      // Only auto-start when on a page where the scanner runs (suggestions or group members).
      // Avoid starting in background tabs (e.g. profile page opened for messaging) to prevent races.
      const url = typeof window !== 'undefined' ? window.location?.href || '' : '';
      const isScanPage = (url.includes('/friends/suggestions') || url.includes('/friends') || url.includes('/find-friends')) ||
        (url.includes('/groups/') && (url.includes('/members') || url.includes('/people')));
      
      // Check status
      if (this.state?.status === 'running' && !this.isPaused && isScanPage) {
        this.start();
      } else if (this.state?.status === 'paused') {
        this.isPaused = true;
      }
    } catch (error) {
      // Handle extension context invalidated error specifically
      if (error.message?.includes('Extension context invalidated') || 
          error.message?.includes('message port closed') ||
          error.message?.includes('Could not establish connection')) {
        // Extension was reloaded - this is expected, just reset state silently
        console.log('[AutomationEngine] Extension context invalidated - extension was reloaded (this is normal)');
        this.isRunning = false;
        this.isPaused = false;
        
        // Try to load settings from local storage as fallback
        try {
          const localData = await chrome.storage.local.get(['settings']);
          if (localData.settings) {
            this.settings = localData.settings;
            console.log('[AutomationEngine] Loaded settings from local storage as fallback');
          }
        } catch (storageError) {
          // Ignore storage errors
        }
        
        return;
      }
      
      console.error('[AutomationEngine] Error loading settings:', error);
      // Don't throw - allow automation to continue with cached settings if available
    }
  }
  
  // Setup message listener for commands from popup/background
  // START_AUTOMATION is handled only by content-main.js (scanner + toast); do not respond here so popup gets one response
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'START_AUTOMATION') {
        this.start();
        return true; // keep channel open; content-main will sendResponse
      } else if (message.type === 'PAUSE_AUTOMATION') {
        this.pause();
        sendResponse({ success: true });
      } else if (message.type === 'RESUME_AUTOMATION') {
        this.resume();
        sendResponse({ success: true });
      } else if (message.type === 'STOP_AUTOMATION') {
        this.stop();
        sendResponse({ success: true });
      } else if (message.type === 'EMERGENCY_STOP') {
        this.emergencyStop();
        sendResponse({ success: true });
      } else if (message.type === 'SCHEDULE_PAUSE') {
        this.pause();
        sendResponse({ success: true });
      } else if (message.type === 'SETTINGS_UPDATED') {
        this.loadSettings();
        sendResponse({ success: true });
      }
      return true;
    });
  }
  
  // Start automation
  async start() {
    if (this.isRunning) {
      return;
    }
    
    await this.loadSettings();
    
    // Check emergency stop
    if (this.settings?.safety?.emergencyStop) {
      this.log('Cannot start: Emergency stop is active', 'error');
      return;
    }
    
    // Check if we're on Facebook
    if (!window.location.href.includes('facebook.com')) {
      this.log('Please navigate to Facebook to start automation', 'error');
      return;
    }
    
    this.isRunning = true;
    this.isPaused = false;
    this.failureCount = 0;
    
    await this.updateState({ status: 'running', sessionStartTime: Date.now() });
    this.log('Automation started', 'success');
    
    // Start processing queue
    this.processQueue();
  }
  
  // Pause automation
  async pause() {
    this.isPaused = true;
    await this.updateState({ status: 'paused' });
    this.log('Automation paused', 'info');
  }
  
  // Resume automation
  async resume() {
    if (!this.isRunning) {
      await this.start();
      return;
    }
    
    this.isPaused = false;
    await this.updateState({ status: 'running' });
    this.log('Automation resumed', 'success');
    this.processQueue();
  }
  
  // Stop automation
  async stop() {
    this.isRunning = false;
    this.isPaused = false;
    this.queue = [];
    this.currentAction = null;
    this.failureCount = 0;
    
    await this.updateState({ status: 'stopped', sessionStartTime: null });
    this.log('Automation stopped', 'info');
  }
  
  // Emergency stop
  async emergencyStop() {
    await this.stop();
    await this.updateSettings({ safety: { ...this.settings.safety, emergencyStop: true } });
    this.log('EMERGENCY STOP ACTIVATED', 'error');
  }
  
  // Add action to queue
  addToQueue(action) {
    this.queue.push(action);
    
    // Auto-start if not running but should be
    if (!this.isRunning && this.state?.status === 'running') {
      this.start();
    }
  }
  
  // Process queue
  async processQueue() {
    while (this.isRunning && !this.isPaused) {
      try {
        // Reload settings periodically
        await this.loadSettings();
        
        // Check if extension context was invalidated
        if (!chrome.runtime?.id) {
          // Extension was reloaded - this is expected, just stop silently
          console.log('[AutomationEngine] Extension context invalidated - extension was reloaded (this is normal)');
          this.isRunning = false;
          this.isPaused = false;
          break;
        }
        
        // Check emergency stop
        if (this.settings?.safety?.emergencyStop) {
          await this.stop();
          break;
        }
        
        // Check daily limits
        const limitsExceeded = await this.checkLimits();
        if (limitsExceeded) {
          await this.pause();
          this.log('Daily or session limits reached. Automation paused.', 'warning');
          break;
        }
      } catch (error) {
        if (error.message?.includes('Extension context invalidated') || 
            error.message?.includes('message port closed') ||
            error.message?.includes('Could not establish connection')) {
          // Extension was reloaded - this is expected, just stop silently
          console.log('[AutomationEngine] Extension context invalidated - extension was reloaded (this is normal)');
          this.isRunning = false;
          this.isPaused = false;
          break;
        }
        console.error('[AutomationEngine] Error in processQueue:', error);
        // Continue processing with cached settings
      }
      
      // Check failure count
      const maxFailures = this.settings?.safety?.maxFailures || 5;
      if (this.failureCount >= maxFailures) {
        await this.stop();
        this.log(`Too many failures (${this.failureCount}). Automation stopped.`, 'error');
        break;
      }
      
      // Process next action
      if (this.queue.length > 0) {
        this.currentAction = this.queue.shift();
        await this.executeAction(this.currentAction);
        this.currentAction = null;
      } else {
        // No actions in queue, wait a bit
        await this.delay(2000);
      }
      
      // Add random delay between actions
      if (this.settings?.safety?.randomizeDelays) {
        const delay = this.getRandomDelay(
          this.settings.friendRequest?.delayMin || 3000,
          this.settings.friendRequest?.delayMax || 8000
        );
        await this.delay(delay);
      }
    }
  }
  
  // Execute a single action
  async executeAction(action) {
    try {
      this.log(`Executing: ${action.type}`, 'info');
      
      if (action.type === 'FRIEND_REQUEST') {
        await this.executeFriendRequest(action);
      } else if (action.type === 'MESSAGE') {
        await this.executeMessage(action);
      } else {
        throw new Error(`Unknown action type: ${action.type}`);
      }
      
      // Reset failure count on success
      this.failureCount = 0;
      
    } catch (error) {
      this.failureCount++;
      const errorMsg = error.message || 'Unknown error';
      this.log(`Action failed: ${errorMsg}`, 'error');
      await this.incrementError();
      
      // If too many failures, stop automation
      const maxFailures = this.settings?.safety?.maxFailures || 5;
      if (this.failureCount >= maxFailures) {
        this.log(`Too many consecutive failures (${this.failureCount}). Stopping automation.`, 'error');
        await this.stop();
        throw new Error(`Automation stopped due to ${this.failureCount} consecutive failures`);
      }
      
      // Re-throw to let caller know it failed
      throw error;
    }
  }
  
  // Execute friend request
  async executeFriendRequest(action) {
    try {
      this.log(`Processing friend request for: ${action.target || 'current page'}`, 'info');
      
      // Verify we're on a valid page
      if (!window.facebookHandler?.isProfilePage() && !action.target) {
        throw new Error('Not on a profile page and no target URL provided');
      }
      
      // Navigate to profile if target URL provided and different from current
      if (action.target && action.target !== window.location.href) {
        this.log(`Navigating to profile: ${action.target}`, 'info');
        window.location.href = action.target;
        // Wait for page to load
        await this.delay(3000);
      }
      
      // Wait for page to be ready
      await this.delay(1000);
      
      // Send friend request
      const success = await window.facebookHandler?.sendFriendRequest(action.target);
      
      if (success) {
        await this.incrementFriendRequest();
        this.log('Friend request sent successfully', 'success');
        
        // Auto-send message if enabled
        if (this.settings?.friendRequest?.autoMessageAfterRequest) {
          this.log('Queueing auto-message after friend request', 'info');
          this.addToQueue({
            type: 'MESSAGE',
            target: action.target || window.location.href,
            trigger: 'after_request'
          });
        }
        
        return true;
      } else {
        throw new Error('Friend request returned false');
      }
    } catch (error) {
      this.log(`Friend request failed: ${error.message}`, 'error');
      throw error;
    }
  }
  
  // Execute message
  async executeMessage(action) {
    const success = await window.facebookHandler?.sendMessage(
      action.target,
      action.message,
      action.trigger
    );
    
    if (success) {
      await this.incrementMessage();
    } else {
      throw new Error('Message failed');
    }
  }
  
  // Check if limits are exceeded
  async checkLimits() {
    await this.loadSettings();
    
    const state = this.state || {};
    const friendRequest = this.settings?.friendRequest || {};
    const messaging = this.settings?.messaging || {};
    
    // Check friend request limits (only session limit). No "enable Add Friend" setting – limits always apply when tool runs on Suggestions/Group page.
    if (friendRequest.requestsLimit === 'limited') {
      const sessionLimit = friendRequest.numberOfRequests || 2;
      if ((state.sessionFriendRequests || 0) >= sessionLimit) {
        return true;
      }
    }
    
    // Check message limits (only session limit, no daily limit)
    if (messaging.enabled) {
      // Session limit only
      if (messaging.messagesLimit === 'limited') {
        const sessionLimit = messaging.numberOfMessages || 5;
        if ((state.sessionMessagesSent || 0) >= sessionLimit) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  // Get random delay
  getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  // Delay utility
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Update state
  async updateState(updates) {
    try {
      await this.safeSendMessage({
        type: 'UPDATE_STATE',
        data: updates
      });
      this.state = { ...this.state, ...updates };
    } catch (error) {
      if (error.message?.includes('Extension context invalidated') || 
          error.message?.includes('message port closed')) {
        // Extension was reloaded - this is expected, just update local state silently
        console.log('[AutomationEngine] Extension context invalidated - extension was reloaded (this is normal)');
        // Update local state only
        this.state = { ...this.state, ...updates };
      } else {
        console.error('[AutomationEngine] Error updating state:', error);
        // Still update local state
        this.state = { ...this.state, ...updates };
      }
    }
  }
  
  // Update settings
  async updateSettings(updates) {
    // This would need to be handled by background script
    // For now, reload settings
    await this.loadSettings();
  }
  
  // Increment counters
  async incrementFriendRequest() {
    const current = (this.state?.friendRequestsSent || 0) + 1;
    await this.updateState({ friendRequestsSent: current });
    this.log(`Friend request sent (${current} today)`, 'success');
  }
  
  async incrementMessage() {
    const current = (this.state?.messagesSent || 0) + 1;
    await this.updateState({ messagesSent: current });
    this.log(`Message sent (${current} today)`, 'success');
  }
  
  async incrementError() {
    const current = (this.state?.errors || 0) + 1;
    await this.updateState({ errors: current });
  }
  
  // Log activity
  async log(message, type = 'info') {
    // Always log to console
    console.log(`[AutomationEngine] ${type.toUpperCase()}: ${message}`);
    
    try {
      await this.safeSendMessage({
        type: 'LOG_ACTIVITY',
        data: {
          type,
          message,
          url: window.location.href
        }
      });
    } catch (error) {
      // If extension context is invalidated, we already logged to console
      // Just silently fail - console log is sufficient
      if (!error.message?.includes('Extension context invalidated') && 
          !error.message?.includes('message port closed')) {
        console.error('[AutomationEngine] Error logging activity:', error);
      }
    }
  }
}

// Initialize global automation engine
window.automationEngine = new AutomationEngine();

