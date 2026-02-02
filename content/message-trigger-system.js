/**
 * Message Trigger System
 * Event-based messaging logic that responds to Facebook events
 */

class MessageTriggerSystem {
  constructor() {
    this.triggers = new Map();
    this.eventListeners = [];
    this.setupTriggers();
  }
  
  // Setup trigger handlers
  setupTriggers() {
    // Trigger: After friend request sent
    this.registerTrigger('after_request', {
      condition: async (data) => {
        return data.type === 'FRIEND_REQUEST' && data.success === true;
      },
      action: async (data) => {
        const settings = await this.getSettings();
        if (settings?.friendRequest?.autoMessageAfterRequest) {
          return {
            enabled: true,
            target: data.target,
            delay: 2000 // Wait 2 seconds after request
          };
        }
        return { enabled: false };
      }
    });
    
    // Trigger: After friend request accepted
    this.registerTrigger('after_accept', {
      condition: async (data) => {
        // This would be detected by monitoring friend request notifications
        // For now, we'll handle this in the main automation engine
        return false; // Placeholder
      },
      action: async (data) => {
        const settings = await this.getSettings();
        if (settings?.messaging?.sendAfterAccept) {
          return {
            enabled: true,
            target: data.target,
            delay: 5000 // Wait 5 seconds after acceptance
          };
        }
        return { enabled: false };
      }
    });
    
    // Trigger: On incoming friend request
    this.registerTrigger('incoming_request', {
      condition: async (data) => {
        // Detect incoming friend request notifications
        return data.type === 'INCOMING_FRIEND_REQUEST';
      },
      action: async (data) => {
        const settings = await this.getSettings();
        if (settings?.messaging?.sendOnIncomingRequest) {
          return {
            enabled: true,
            target: data.target,
            delay: 3000
          };
        }
        return { enabled: false };
      }
    });
  }
  
  // Register a trigger
  registerTrigger(name, config) {
    this.triggers.set(name, {
      name,
      condition: config.condition,
      action: config.action,
      enabled: config.enabled !== false
    });
  }
  
  // Process an event and check triggers
  async processEvent(eventData) {
    const triggeredActions = [];
    
    for (const [name, trigger] of this.triggers) {
      if (!trigger.enabled) continue;
      
      try {
        const shouldTrigger = await trigger.condition(eventData);
        if (shouldTrigger) {
          const action = await trigger.action(eventData);
          if (action.enabled) {
            triggeredActions.push({
              trigger: name,
              ...action
            });
          }
        }
      } catch (error) {
        console.error(`[MessageTrigger] Error processing trigger ${name}:`, error);
      }
    }
    
    return triggeredActions;
  }
  
  // Get settings
  async getSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      return response?.settings || {};
    } catch (error) {
      console.error('[MessageTrigger] Error getting settings:', error);
      return {};
    }
  }
  
  // Enable/disable a trigger
  setTriggerEnabled(name, enabled) {
    const trigger = this.triggers.get(name);
    if (trigger) {
      trigger.enabled = enabled;
    }
  }
  
  // Get all triggers
  getTriggers() {
    return Array.from(this.triggers.values());
  }
}

// Initialize global message trigger system
window.messageTriggerSystem = new MessageTriggerSystem();

// Listen for automation events
if (window.automationEngine) {
  // Hook into automation engine events
  const originalExecuteFriendRequest = window.automationEngine?.executeFriendRequest;
  if (originalExecuteFriendRequest) {
    window.automationEngine.executeFriendRequest = async function(action) {
      const result = await originalExecuteFriendRequest.call(this, action);
      
      // Process trigger after friend request
      if (result) {
        const triggers = await window.messageTriggerSystem?.processEvent({
          type: 'FRIEND_REQUEST',
          success: true,
          target: action.target
        });
        
        // Add triggered messages to queue
        triggers.forEach(trigger => {
          setTimeout(() => {
            this.addToQueue({
              type: 'MESSAGE',
              target: trigger.target,
              trigger: trigger.trigger,
              delay: trigger.delay || 0
            });
          }, trigger.delay || 0);
        });
      }
      
      return result;
    };
  }
}

