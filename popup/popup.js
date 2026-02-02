/**
 * Popup Script - Friender Style
 * Simplified to match original extension exactly
 */

// State
let settings = {
  lookupInterval: 'auto',
  requestsLimit: 'limited',
  numberOfRequests: 2,
  resumeFromLastSearch: 'no',
  lastSearchPosition: 0,
  useGenderFilter: false,
  gender: null,
  useCountryFilter: false,
  countryFilter: null,
  mutualFriendsOperator: 'greater',
  mutualFriendsCount: 1,
  messageGroups: 'test12',
  keywords: [],
  negativeKeywords: [],
  segments: [],
  groups: [],
  editingId: null,
  editingType: null, // 'segment' or 'group'
  currentGroupItems: [], // Temporary items for the group being built
  selectedTiers: [],
  selectedCountries: []
};

const ALL_COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Holy See", "Honduras", "Hungary",
  "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast",
  "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway",
  "Oman",
  "Pakistan", "Palau", "Palestine State", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar",
  "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Vanuatu", "Venezuela", "Vietnam",
  "Yemen",
  "Zambia", "Zimbabwe"
];

// DOM Elements
const elements = {
  lookupInterval: document.getElementById('lookupInterval'),
  limitLimited: document.getElementById('limitLimited'),
  limitInfinite: document.getElementById('limitInfinite'),
  numberOfRequests: document.getElementById('numberOfRequests'),
  useGenderFilter: document.getElementById('useGenderFilter'),
  genderOptions: document.getElementById('genderOptions'),
  genderRadios: document.querySelectorAll('input[name="gender"]'),
  useGenderFilterGroups: document.getElementById('useGenderFilterGroups'),
  genderOptionsGroups: document.getElementById('genderOptionsGroups'),
  genderRadiosGroups: document.querySelectorAll('input[name="genderGroups"]'),
  useCountryFilter: document.getElementById('useCountryFilter'),
  countryOptions: document.getElementById('countryOptions'),
  countryFilterRadios: document.querySelectorAll('input[name="countryFilter"]'),
  mutualFriendsOperator: document.getElementById('mutualFriendsOperator'),
  mutualFriendsCount: document.getElementById('mutualFriendsCount'),
  messageGroups: document.getElementById('messageGroups'),
  runBtn: document.getElementById('runBtn'),
  userEmail: document.getElementById('userEmail'),
  // New Elements
  segmentsList: document.getElementById('segmentsList'),
  groupsList: document.getElementById('groupsList'),
  addSegmentBtn: document.querySelector('#segmentsTab .btn-add'),
  addGroupBtn: document.querySelector('#groupsTab .btn-add'),
  segmentTitle: document.getElementById('segmentTitle'),
  segmentMessage: document.getElementById('segmentMessage'),
  saveSegmentBtn: document.getElementById('saveSegmentBtn'),
  segmentBackBtn: document.getElementById('segmentBackBtn'),
  keywordBtns: document.querySelectorAll('.keyword-btn'),
  groupTitle: document.getElementById('groupTitle'),
  saveGroupBtn: document.getElementById('saveGroupBtn'),
  groupBackBtn: document.getElementById('groupBackBtn'),
  // Dropdown Elements
  messageGroupsGroups: document.getElementById('messageGroupsGroups'),
  msgOnNewRequestGroup: document.getElementById('msgOnNewRequestGroup'),
  msgOnAcceptGroup: document.getElementById('msgOnAcceptGroup'),
  msgOnDeclineGroup: document.getElementById('msgOnDeclineGroup'),
  // Group Builder Elements
  insertSegmentBtn: document.getElementById('insertSegmentBtn'),
  insertDropdown: document.getElementById('insertDropdown'),
  groupMessageItems: document.getElementById('groupMessageItems'),
  // Modal Elements
  viewModal: document.getElementById('viewModal'),
  viewModalClose: document.getElementById('viewModalClose'),
  viewModalTitle: document.getElementById('viewModalTitle'),
  viewModalContent: document.getElementById('viewModalContent'),
  selectSegmentModal: document.getElementById('selectSegmentModal'),
  selectSegmentClose: document.getElementById('selectSegmentClose'),
  segmentsDropdownList: document.getElementById('segmentsDropdownList'),
  staticTextModal: document.getElementById('staticTextModal'),
  staticTextClose: document.getElementById('staticTextClose'),
  staticTextInput: document.getElementById('staticTextInput'),
  saveStaticTextBtn: document.getElementById('saveStaticTextBtn'),
  keywordsModal: document.getElementById('keywordsModal'),
  keywordsClose: document.getElementById('keywordsClose'),
  // Country Filter Elements
  tierSelection: document.getElementById('tierSelection'),
  tierSelectBox: document.getElementById('tierSelectBox'),
  tierDropdown: document.getElementById('tierDropdown'),
  tierList: document.getElementById('tierList'),
  countryMultiSelect: document.getElementById('countryMultiSelect'),
  countrySelectBox: document.getElementById('countrySelectBox'),
  countryDropdown: document.getElementById('countryDropdown'),
  countryList: document.getElementById('countryList'),
  countrySearch: document.querySelector('#countryDropdown input'),
  // Groups Page Country Filter
  useCountryFilterGroups: document.getElementById('useCountryFilterGroups'),
  countryOptionsGroups: document.getElementById('countryOptionsGroups'),
  tierSelectionGroups: document.getElementById('tierSelectionGroups'),
  tierSelectBoxGroups: document.getElementById('tierSelectBoxGroups'),
  tierDropdownGroups: document.getElementById('tierDropdownGroups'),
  tierListGroups: document.getElementById('tierListGroups'),
  countryMultiSelectGroups: document.getElementById('countryMultiSelectGroups'),
  countrySelectBoxGroups: document.getElementById('countrySelectBoxGroups'),
  countryDropdownGroups: document.getElementById('countryDropdownGroups'),
  countryListGroups: document.getElementById('countryListGroups'),
  countrySearchGroups: document.querySelector('#countryDropdownGroups input'),
  // Menu Items
  menuChangePassword: document.getElementById('menuChangePassword'),
  menuManageAccount: document.getElementById('menuManageAccount'),
  menuLogout: document.getElementById('menuLogout'),
  // Password & Account Elements
  passwordBackBtn: document.getElementById('passwordBackBtn'),
  accountBackBtn: document.getElementById('accountBackBtn'),
  resetPasswordBtn: document.getElementById('resetPasswordBtn'),
  accountUserEmailDisp: document.getElementById('accountUserEmailDisp'),
  // Groups Page Specifics
  lookupIntervalGroups: document.getElementById('lookupIntervalGroups'),
  limitLimitedGroups: document.getElementById('limitLimitedGroups'),
  limitInfiniteGroups: document.getElementById('limitInfiniteGroups'),
  numberOfRequestsGroups: document.getElementById('numberOfRequestsGroups'),
  lastSearchPositionGroups: document.getElementById('lastSearchPositionGroups'),
  // Inputs for clearing
  keywordsInput: document.getElementById('keywordsInput'),
  negativeKeywordsInput: document.getElementById('negativeKeywordsInput'),
  // Footer
  footerVersion: document.getElementById('footerVersion'),
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadUserEmail();
  setupEventListeners();
  setupTabs();
  setupPageNavigation(); // Setup navigation before detecting context
  detectPageContext();
  // Footer version from manifest
  try {
    const manifest = chrome.runtime.getManifest();
    if (elements.footerVersion && manifest.version) {
      elements.footerVersion.textContent = 'v' + manifest.version;
    }
  } catch (_) {}
});

// Load settings from storage
async function loadSettings() {
  try {
    // Try to get state from background worker first
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (response && !response.error) {
        // Use state from worker if available
        if (response.settings) {
          settings = { ...settings, ...response.settings.friendRequest };
        }
      }
    } catch (workerError) {
      console.log('Worker not ready, using local storage:', workerError);
    }


    // Fallback to local storage
    const data = await chrome.storage.local.get(['settings', 'segments', 'groups']);
    if (data.settings) {
      settings = { ...settings, ...data.settings };
    }
    if (data.segments) {
      settings.segments = data.segments;
    } else {
      // Default segments if none exist
      settings.segments = [{ id: 1, name: 'test' }, { id: 2, name: 'test' }];
    }
    if (data.groups) {
      settings.groups = data.groups;
    } else {
      // Default groups if none exist
      settings.groups = [{ id: 1, name: 'test12' }];
    }

    updateUI();
    renderSegments();
    renderGroups();
    populateDropdowns();
    loadMessagingSettings(); // Load messaging settings to UI
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Load messaging settings to UI
function loadMessagingSettings() {
  try {
    const activateSettings = document.getElementById('activateSettings');
    const messageOnNewRequest = document.getElementById('messageOnNewRequest');
    const messageOnAccept = document.getElementById('messageOnAccept');
    const messageOnDecline = document.getElementById('messageOnDecline');
    const msgOnNewRequestGroup = document.getElementById('msgOnNewRequestGroup');
    const msgOnAcceptGroup = document.getElementById('msgOnAcceptGroup');
    const msgOnDeclineGroup = document.getElementById('msgOnDeclineGroup');
    
    // Initialize messaging settings if not exists
    if (!settings.messaging) {
      settings.messaging = {
        enabled: false,
        sendOnIncomingRequest: false,
        sendAfterAccept: false,
        sendOnDecline: false
      };
    }
    
    // Update UI from settings
    // Activate toggle shows current enabled state
    if (activateSettings) {
      activateSettings.checked = settings.messaging.enabled || false;
    }
    
    // Card checkboxes show which processes are configured
    if (messageOnNewRequest) {
      messageOnNewRequest.checked = settings.messaging.sendOnIncomingRequest || false;
    }
    if (messageOnAccept) {
      messageOnAccept.checked = settings.messaging.sendAfterAccept || false;
    }
    if (messageOnDecline) {
      messageOnDecline.checked = settings.messaging.sendOnDecline || false;
    }
    
    // Update dropdowns
    if (msgOnNewRequestGroup && settings.messaging.incomingRequestGroup) {
      msgOnNewRequestGroup.value = settings.messaging.incomingRequestGroup;
    }
    if (msgOnAcceptGroup && settings.messaging.acceptGroup) {
      msgOnAcceptGroup.value = settings.messaging.acceptGroup;
    }
    if (msgOnDeclineGroup && settings.messaging.declineGroup) {
      msgOnDeclineGroup.value = settings.messaging.declineGroup;
    }
    
    console.log('[Popup] Messaging settings loaded:', {
      enabled: settings.messaging.enabled,
      sendOnIncomingRequest: settings.messaging.sendOnIncomingRequest,
      sendAfterAccept: settings.messaging.sendAfterAccept,
      sendOnDecline: settings.messaging.sendOnDecline
    });
  } catch (error) {
    console.error('[Popup] Error loading messaging settings:', error);
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    await chrome.storage.local.set({ settings });
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Save messaging settings from Settings page
// This saves the card selections and message groups, but NOT the activate toggle
// The activate toggle is handled separately and controls whether background process runs
async function saveMessagingSettings() {
  try {
    // Get card selections from UI (DO NOT get activate toggle here)
    const messageOnNewRequest = document.getElementById('messageOnNewRequest');
    const messageOnAccept = document.getElementById('messageOnAccept');
    const messageOnDecline = document.getElementById('messageOnDecline');
    const msgOnNewRequestGroup = document.getElementById('msgOnNewRequestGroup');
    const msgOnAcceptGroup = document.getElementById('msgOnAcceptGroup');
    const msgOnDeclineGroup = document.getElementById('msgOnDeclineGroup');
    
    // Initialize messaging settings if not exists
    if (!settings.messaging) {
      settings.messaging = {};
    }
    
    // Save card selections (which processes are configured)
    settings.messaging.sendOnIncomingRequest = messageOnNewRequest?.checked || false;
    settings.messaging.sendAfterAccept = messageOnAccept?.checked || false;
    settings.messaging.sendOnDecline = messageOnDecline?.checked || false;
    
    // Save message group selections
    if (msgOnNewRequestGroup) {
      settings.messaging.incomingRequestGroup = msgOnNewRequestGroup.value || 'default';
    }
    if (msgOnAcceptGroup) {
      settings.messaging.acceptGroup = msgOnAcceptGroup.value || 'default';
    }
    if (msgOnDeclineGroup) {
      settings.messaging.declineGroup = msgOnDeclineGroup.value || 'default';
    }
    
    // NOTE: We do NOT save settings.messaging.enabled here
    // The "Activate settings" toggle is handled separately and controls background process
    
    // Save to storage
    await chrome.storage.local.set({ settings });
    
    console.log('[Popup] ✅ Messaging card selections saved:', {
      sendOnIncomingRequest: settings.messaging.sendOnIncomingRequest,
      sendAfterAccept: settings.messaging.sendAfterAccept,
      sendOnDecline: settings.messaging.sendOnDecline,
      enabled: settings.messaging.enabled || false
    });
    
    // Show success message
    alert('Settings saved successfully! You can now activate the settings toggle to enable the background process. Please refresh Facebook after activating.');
    
  } catch (error) {
    console.error('[Popup] Error saving messaging settings:', error);
    alert('Error saving settings. Please try again.');
  }
}

// Load user email (if available)
async function loadUserEmail() {
  try {
    // Try to get from Facebook page
    const [tab] = await chrome.tabs.query({ url: '*://www.facebook.com/*' });
    if (tab) {
      // Could inject script to get email, but for now use placeholder
      // In real implementation, you'd get this from Facebook
    }
  } catch (error) {
    console.error('Error loading user email:', error);
  }
}

// Update UI from settings
function updateUI() {
  elements.lookupInterval.value = settings.lookupInterval || 'auto';

  // Update limit buttons
  if (settings.requestsLimit === 'limited') {
    elements.limitLimited.classList.add('active');
    elements.limitInfinite.classList.remove('active');
    elements.numberOfRequests.disabled = false;
  } else {
    elements.limitLimited.classList.remove('active');
    elements.limitInfinite.classList.add('active');
    elements.numberOfRequests.disabled = true;
  }

  elements.numberOfRequests.value = settings.numberOfRequests || 2;
  if (elements.numberOfRequestsGroups) {
    elements.numberOfRequestsGroups.value = settings.numberOfRequests || 2;
  }

  // Update group limit buttons
  if (elements.limitLimitedGroups && elements.limitInfiniteGroups) {
    if (settings.requestsLimit === 'limited') {
      elements.limitLimitedGroups.classList.add('active');
      elements.limitInfiniteGroups.classList.remove('active');
      if (elements.numberOfRequestsGroups) elements.numberOfRequestsGroups.disabled = false;
    } else {
      elements.limitLimitedGroups.classList.remove('active');
      elements.limitInfiniteGroups.classList.add('active');
      if (elements.numberOfRequestsGroups) elements.numberOfRequestsGroups.disabled = true;
    }
  }

  // Gender filter
  elements.useGenderFilter.checked = settings.useGenderFilter || false;
  elements.genderOptions.style.display = settings.useGenderFilter ? 'block' : 'none';
  if (settings.useGenderFilter) {
    elements.genderRadios.forEach(radio => {
      radio.disabled = false;
      if (radio.value === settings.gender) {
        radio.checked = true;
      }
    });
    elements.genderRadiosGroups.forEach(radio => {
      radio.disabled = false;
      if (radio.value === settings.gender) {
        radio.checked = true;
      }
    });
  } else {
    elements.genderRadios.forEach(radio => {
      radio.disabled = true;
      radio.checked = false;
    });
    elements.genderRadiosGroups.forEach(radio => {
      radio.disabled = true;
      radio.checked = false;
    });
  }

  // Country filter
  elements.useCountryFilter.checked = settings.useCountryFilter || false;
  elements.countryOptions.style.display = settings.useCountryFilter ? 'block' : 'none';
  if (settings.useCountryFilter) {
    elements.countryFilterRadios.forEach(radio => {
      radio.disabled = false;
      if (radio.value === settings.countryFilter) {
        radio.checked = true;
      }
    });
  } else {
    elements.countryFilterRadios.forEach(radio => {
      radio.disabled = true;
      radio.checked = false;
    });
  }

  elements.mutualFriendsOperator.value = settings.mutualFriendsOperator || 'greater';
  elements.mutualFriendsCount.value = settings.mutualFriendsCount || 1;
  elements.messageGroups.value = settings.messageGroups || 'test12';

  // Tiers and Countries
  updateCountryTags();
  updateCountryTags('groups');
  updateTierTags();
  updateTierTags('groups');

  // Country filter view toggle
  const showTier = settings.countryFilter === 'tier';
  if (elements.tierSelection) elements.tierSelection.style.display = showTier ? 'block' : 'none';
  if (elements.countryMultiSelect) elements.countryMultiSelect.style.display = showTier ? 'none' : 'block';

  // Resume search settings (for groups page)
  const resumeSearch = document.querySelector('input[name="resumeSearch"]:checked');
  if (resumeSearch) {
    settings.resumeFromLastSearch = resumeSearch.value;
  }

  if (elements.lastSearchPosition) {
    elements.lastSearchPosition.value = settings.lastSearchPosition || '';
  }
  if (elements.lastSearchPositionGroups) {
    elements.lastSearchPositionGroups.value = (settings.lastSearchPosition != null && settings.lastSearchPosition !== '') ? String(settings.lastSearchPosition) : '';
  }
}

// Helper function for limit toggle UI (must be global to be accessible from resetAllSettings)
function updateLimitUI(type = 'settings') {
  const isLimited = settings.requestsLimit === 'limited';
  const limitBtn = type === 'settings' ? elements.limitLimited : elements.limitLimitedGroups;
  const infBtn = type === 'settings' ? elements.limitInfinite : elements.limitInfiniteGroups;
  const input = type === 'settings' ? elements.numberOfRequests : elements.numberOfRequestsGroups;

  if (limitBtn && infBtn) {
    if (isLimited) {
      limitBtn.classList.add('active');
      infBtn.classList.remove('active');
      if (input) input.disabled = false;
    } else {
      limitBtn.classList.remove('active');
      infBtn.classList.add('active');
      if (input) input.disabled = true;
    }
  }

  // Sync other page buttons
  const otherLimitBtn = type === 'settings' ? elements.limitLimitedGroups : elements.limitLimited;
  const otherInfBtn = type === 'settings' ? elements.limitInfiniteGroups : elements.limitInfinite;
  const otherInput = type === 'settings' ? elements.numberOfRequestsGroups : elements.numberOfRequests;

  if (otherLimitBtn && otherInfBtn) {
    if (isLimited) {
      otherLimitBtn.classList.add('active');
      otherInfBtn.classList.remove('active');
      if (otherInput) otherInput.disabled = false;
    } else {
      otherLimitBtn.classList.remove('active');
      otherInfBtn.classList.add('active');
      if (otherInput) otherInput.disabled = true;
    }
  }
}

// Setup event listeners
function setupEventListeners() {
  // Lookup interval
  elements.lookupInterval.addEventListener('change', (e) => {
    settings.lookupInterval = e.target.value;
    saveSettings();
  });

  // Limit toggle buttons
  elements.limitLimited.addEventListener('click', () => {
    settings.requestsLimit = 'limited';
    updateLimitUI('settings');
    saveSettings();
  });

  elements.limitInfinite.addEventListener('click', () => {
    settings.requestsLimit = 'infinite';
    updateLimitUI('settings');
    saveSettings();
  });

  // Number of requests
  elements.numberOfRequests.addEventListener('change', (e) => {
    settings.numberOfRequests = parseInt(e.target.value) || 2;
    // Sync Groups page input
    if (elements.numberOfRequestsGroups) {
      elements.numberOfRequestsGroups.value = e.target.value;
    }
    saveSettings();
  });

  if (elements.numberOfRequestsGroups) {
    elements.numberOfRequestsGroups.addEventListener('change', (e) => {
      settings.numberOfRequests = parseInt(e.target.value) || 10;
      // Sync main input
      elements.numberOfRequests.value = e.target.value;
      saveSettings();
    });
  }

  // Groups Page Limit toggle buttons
  if (elements.limitLimitedGroups) {
    elements.limitLimitedGroups.addEventListener('click', () => {
      settings.requestsLimit = 'limited';
      updateLimitUI('groups');
      saveSettings();
    });
  }

  if (elements.limitInfiniteGroups) {
    elements.limitInfiniteGroups.addEventListener('click', () => {
      settings.requestsLimit = 'infinite';
      updateLimitUI('groups');
      saveSettings();
    });
  }

  // Note: updateLimitUI is now defined globally below

  // Gender filter toggle
  if (elements.useGenderFilter) {
    elements.useGenderFilter.addEventListener('change', (e) => {
      settings.useGenderFilter = e.target.checked;
      elements.genderOptions.style.display = e.target.checked ? 'flex' : 'none';
      if (e.target.checked) {
        elements.genderRadios.forEach(radio => radio.disabled = false);
      } else {
        elements.genderRadios.forEach(radio => {
          radio.disabled = true;
          radio.checked = false;
        });
        settings.gender = null;
      }
      saveSettings();
    });
  }

  if (elements.useGenderFilterGroups) {
    elements.useGenderFilterGroups.addEventListener('change', (e) => {
      settings.useGenderFilter = e.target.checked;
      elements.genderOptionsGroups.style.display = e.target.checked ? 'flex' : 'none';
      const groupsPageEl = document.getElementById('groupsPage');
      if (groupsPageEl) groupsPageEl.classList.toggle('gender-filter-on', e.target.checked);
      if (e.target.checked) {
        elements.genderRadiosGroups.forEach(radio => radio.disabled = false);
      } else {
        elements.genderRadiosGroups.forEach(radio => {
          radio.disabled = true;
          radio.checked = false;
        });
        settings.gender = null;
      }
      saveSettings();
    });
  }

  // Gender radio buttons
  elements.genderRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) {
        settings.gender = e.target.value;
        saveSettings();
      }
    });
  });

  elements.genderRadiosGroups.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) {
        settings.gender = e.target.value;
        saveSettings();
      }
    });
  });

  // Country filter toggle
  elements.useCountryFilter.addEventListener('change', (e) => {
    settings.useCountryFilter = e.target.checked;
    elements.countryOptions.style.display = e.target.checked ? 'block' : 'none';

    if (e.target.checked) {
      elements.countryFilterRadios.forEach(radio => {
        radio.disabled = false;
      });
    } else {
      elements.countryFilterRadios.forEach(radio => {
        radio.disabled = true;
        radio.checked = false;
      });
      settings.countryFilter = null;
    }
    saveSettings();
  });

  // Country filter radio buttons
  elements.countryFilterRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) {
        settings.countryFilter = e.target.value;
        if (elements.tierSelection) elements.tierSelection.style.display = e.target.value === 'tier' ? 'block' : 'none';
        if (elements.countryMultiSelect) elements.countryMultiSelect.style.display = e.target.value === 'tier' ? 'none' : 'block';
        saveSettings();
      }
    });
  });

  // Groups Page Country Filter Radios
  document.querySelectorAll('input[name="countryFilterGroups"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) {
        settings.countryFilter = e.target.value;
        if (elements.tierSelectionGroups) elements.tierSelectionGroups.style.display = e.target.value === 'tier' ? 'block' : 'none';
        if (elements.countryMultiSelectGroups) elements.countryMultiSelectGroups.style.display = e.target.value === 'tier' ? 'none' : 'block';
        saveSettings();
      }
    });
  });

  // Tier select boxes
  setupTierMultiSelect();
  setupTierMultiSelect('groups');

  // Use Country Filter Toggle
  if (elements.useCountryFilter) {
    elements.useCountryFilter.addEventListener('change', (e) => {
      settings.useCountryFilter = e.target.checked;
      elements.countryOptions.style.display = e.target.checked ? 'block' : 'none';
      saveSettings();
    });
  }

  if (elements.useCountryFilterGroups) {
    elements.useCountryFilterGroups.addEventListener('change', (e) => {
      settings.useCountryFilter = e.target.checked;
      elements.countryOptionsGroups.style.display = e.target.checked ? 'block' : 'none';
      saveSettings();
    });
  }

  // Country Multi-select
  setupCountryMultiSelect();
  setupCountryMultiSelect('groups');

  // Mutual friends
  elements.mutualFriendsOperator.addEventListener('change', (e) => {
    settings.mutualFriendsOperator = e.target.value;
    saveSettings();
  });

  elements.mutualFriendsCount.addEventListener('change', (e) => {
    settings.mutualFriendsCount = parseInt(e.target.value) || 1;
    saveSettings();
  });

  // Message groups
  elements.messageGroups.addEventListener('change', (e) => {
    settings.messageGroups = e.target.value;
    saveSettings();
  });

  // Resume search radio buttons
  document.querySelectorAll('input[name="resumeSearch"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      settings.resumeFromLastSearch = e.target.value;
      saveSettings();
    });
  });

  // Last search position (Settings page)
  if (elements.lastSearchPosition) {
    elements.lastSearchPosition.addEventListener('change', (e) => {
      settings.lastSearchPosition = parseInt(e.target.value, 10) || 0;
      saveSettings();
    });
  }
  // Last search position (Groups page)
  if (elements.lastSearchPositionGroups) {
    elements.lastSearchPositionGroups.addEventListener('change', (e) => {
      settings.lastSearchPosition = parseInt(e.target.value, 10) || 0;
      saveSettings();
    });
  }

  // Run button
  if (elements.runBtn) {
    elements.runBtn.addEventListener('click', async () => {
      const currentStatus = await getCurrentStatus();
      if (currentStatus === 'paused') {
        await resumeAutomation();
      } else {
        await startAutomation();
      }
    });
  }

  // Run button for groups page
  const runBtnGroups = document.getElementById('runBtnGroups');
  if (runBtnGroups) {
    runBtnGroups.addEventListener('click', async () => {
      const currentStatus = await getCurrentStatus();
      if (currentStatus === 'paused') {
        await resumeAutomation();
      } else {
        await startAutomation('groups');
      }
    });
  }

  // Pause button
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', async () => {
      await pauseAutomation();
    });
  }

  // Stop button
  const stopBtn = document.getElementById('stopBtn');
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to stop automation?')) {
        await stopAutomation();
      }
    });
  }

  // Pause button for groups page
  const pauseBtnGroups = document.getElementById('pauseBtnGroups');
  if (pauseBtnGroups) {
    pauseBtnGroups.addEventListener('click', async () => {
      await pauseAutomation();
    });
  }

  // Stop button for groups page
  const stopBtnGroups = document.getElementById('stopBtnGroups');
  if (stopBtnGroups) {
    stopBtnGroups.addEventListener('click', async () => {
      if (confirm('Are you sure you want to stop automation?')) {
        await stopAutomation();
      }
    });
  }

  // Check current status and update UI
  checkAutomationStatus();

  // Setup tags input for keywords
  setupTagsInput('keywordsInput');
  setupTagsInput('negativeKeywordsInput');

  // Setup instruction page buttons
  setupInstructionPage();

  // Setup Message Segments and Groups listeners
  setupMessageSystemListeners();
  
  // Save Settings button handler
  const saveSettingsBtn = document.querySelector('.btn-save-settings');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
      await saveMessagingSettings();
    });
  }
  
  // Activate Settings toggle handler (separate from Save button)
  const activateSettings = document.getElementById('activateSettings');
  if (activateSettings) {
    activateSettings.addEventListener('change', async (e) => {
      // Initialize messaging settings if not exists
      if (!settings.messaging) {
        settings.messaging = {};
      }
      
      // Save the activate toggle state (this controls background process)
      settings.messaging.enabled = e.target.checked;
      
      // Save to storage
      await chrome.storage.local.set({ settings });
      
      console.log('[Popup] ✅ Activate settings toggle:', e.target.checked ? 'ON' : 'OFF');
      
      if (e.target.checked) {
        alert('Settings activated! Background process is now running. Please refresh Facebook for changes to take effect.');
      } else {
        alert('Settings deactivated! Background process stopped. Please refresh Facebook.');
      }
    });
  }
}

// Setup Message Segments and Groups listeners
function setupMessageSystemListeners() {
  // Show Add Segment Page
  if (elements.addSegmentBtn) {
    elements.addSegmentBtn.addEventListener('click', () => {
      settings.editingId = null;
      settings.editingType = 'segment';
      elements.segmentTitle.value = '';
      elements.segmentMessage.value = '';
      document.querySelector('#createSegmentPage h2').textContent = 'Create Message Segment';
      showPage('createSegmentPage');
    });
  }

  // Show Add Group Page
  if (elements.addGroupBtn) {
    elements.addGroupBtn.addEventListener('click', () => {
      settings.editingId = null;
      settings.editingType = 'group';
      settings.currentGroupItems = [];
      elements.groupTitle.value = '';
      renderGroupItems();
      document.querySelector('#createGroupPage h2').textContent = 'Create Message Group';
      showPage('createGroupPage');
    });
  }

  // Back Buttons
  if (elements.segmentBackBtn) {
    elements.segmentBackBtn.addEventListener('click', () => {
      settings.editingId = null;
      settings.editingType = null;
      showPage('homePage');
      const btn = document.querySelector('[data-tab="segments"]');
      if (btn) btn.click();
    });
  }

  if (elements.groupBackBtn) {
    elements.groupBackBtn.addEventListener('click', () => {
      settings.editingId = null;
      settings.editingType = null;
      showPage('homePage');
      const btn = document.querySelector('[data-tab="groups"]');
      if (btn) btn.click();
    });
  }

  // Group Builder Logic
  if (elements.insertSegmentBtn) {
    elements.insertSegmentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.insertDropdown.classList.toggle('show');
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    if (elements.insertDropdown) elements.insertDropdown.classList.remove('show');
  });

  // Insert options
  document.querySelectorAll('.insert-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const type = opt.dataset.type;
      if (type === 'segment') {
        showSelectSegmentModal();
      } else if (type === 'static') {
        elements.staticTextInput.value = '';
        elements.staticTextModal.classList.add('show');
      } else if (type === 'keyword') {
        elements.keywordsModal.classList.add('show');
      }
    });
  });

  // Modal Close buttons
  [elements.viewModalClose, elements.selectSegmentClose, elements.staticTextClose, elements.keywordsClose].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        btn.closest('.modal').classList.remove('show');
      });
    }
  });

  // Action for adding static text
  if (elements.saveStaticTextBtn) {
    elements.saveStaticTextBtn.addEventListener('click', () => {
      const text = elements.staticTextInput.value.trim();
      if (text) {
        settings.currentGroupItems.push({ type: 'static', value: text });
        renderGroupItems();
        elements.staticTextModal.classList.remove('show');
      }
    });
  }

  // Keyword selection
  document.querySelectorAll('.keyword-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const keyword = opt.dataset.keyword;
      settings.currentGroupItems.push({ type: 'keyword', value: keyword });
      renderGroupItems();
      elements.keywordsModal.classList.remove('show');
    });
  });

  // Keyword Buttons (Segment Page)
  elements.keywordBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const keyword = btn.dataset.keyword;
      const textarea = elements.segmentMessage;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      textarea.value = text.substring(0, start) + keyword + text.substring(end);
      textarea.focus();
      textarea.setSelectionRange(start + keyword.length, start + keyword.length);
    });
  });

  // Save Segment
  if (elements.saveSegmentBtn) {
    elements.saveSegmentBtn.addEventListener('click', async () => {
      const title = elements.segmentTitle.value.trim();
      const message = elements.segmentMessage.value.trim();

      if (!title || !message) {
        alert('Please enter both title and message.');
        return;
      }

      if (settings.editingId) {
        const index = settings.segments.findIndex(s => s.id === settings.editingId);
        if (index !== -1) {
          settings.segments[index].name = title;
          settings.segments[index].message = message;
        }
      } else {
        const newSegment = {
          id: Date.now(),
          name: title,
          message: message
        };
        settings.segments.push(newSegment);
      }

      await chrome.storage.local.set({ segments: settings.segments });
      renderSegments();
      populateDropdowns();
      elements.segmentBackBtn.click();
    });
  }

  // Save Group
  if (elements.saveGroupBtn) {
    elements.saveGroupBtn.addEventListener('click', async () => {
      const title = elements.groupTitle.value.trim();

      if (!title) {
        alert('Please enter a group title.');
        return;
      }

      if (settings.currentGroupItems.length === 0) {
        alert('Please add at least one item to the message set.');
        return;
      }

      if (settings.editingId) {
        const index = settings.groups.findIndex(g => g.id === settings.editingId);
        if (index !== -1) {
          settings.groups[index].name = title;
          settings.groups[index].items = [...settings.currentGroupItems];
        }
      } else {
        const newGroup = {
          id: Date.now(),
          name: title,
          items: [...settings.currentGroupItems]
        };
        settings.groups.push(newGroup);
      }

      await chrome.storage.local.set({ groups: settings.groups });
      renderGroups();
      populateDropdowns();
      elements.groupBackBtn.click();
    });
  }

  // Menu Navigation
  if (elements.menuChangePassword) {
    elements.menuChangePassword.addEventListener('click', () => {
      showPage('changePasswordPage');
      if (elements.dropdownMenu) elements.dropdownMenu.classList.remove('show');
    });
  }

  if (elements.menuManageAccount) {
    elements.menuManageAccount.addEventListener('click', () => {
      if (elements.accountUserEmailDisp) {
        elements.accountUserEmailDisp.textContent = elements.userEmail.textContent;
      }
      showPage('manageAccountPage');
      if (elements.dropdownMenu) elements.dropdownMenu.classList.remove('show');
    });
  }

  if (elements.passwordBackBtn) {
    elements.passwordBackBtn.addEventListener('click', () => {
      showPage('homePage');
    });
  }

  if (elements.accountBackBtn) {
    elements.accountBackBtn.addEventListener('click', () => {
      showPage('homePage');
    });
  }

  if (elements.resetPasswordBtn) {
    elements.resetPasswordBtn.addEventListener('click', () => {
      alert('Password reset functionality would be connected to your backend API here.');
    });
  }
}

function populateDropdowns() {
  // 1. Groups People Page Dropdown -> show Message Groups
  if (elements.messageGroupsGroups) {
    populateSelect(elements.messageGroupsGroups, settings.groups, 'Select Group');
  }

  // 2. Settings Page Dropdown -> show Message Segments (per user request)
  if (elements.messageGroups) {
    populateSelect(elements.messageGroups, settings.segments, 'Select Segment');
  }

  // 3. Automation Tab Dropdowns -> show Message Segments (per user request for friend request page)
  if (elements.msgOnNewRequestGroup) {
    populateSelect(elements.msgOnNewRequestGroup, settings.segments, 'Default');
  }
  if (elements.msgOnAcceptGroup) {
    populateSelect(elements.msgOnAcceptGroup, settings.segments, 'Default');
  }
  if (elements.msgOnDeclineGroup) {
    populateSelect(elements.msgOnDeclineGroup, settings.segments, 'Default');
  }
}

function populateSelect(selectElem, items, defaultText) {
  const currentValue = selectElem.value;
  selectElem.innerHTML = '';

  // Default option
  const defOpt = document.createElement('option');
  defOpt.value = 'default';
  defOpt.textContent = defaultText;
  selectElem.appendChild(defOpt);

  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    selectElem.appendChild(opt);
  });

  // Restore previous value if it still exists
  if (currentValue && Array.from(selectElem.options).some(o => o.value === currentValue)) {
    selectElem.value = currentValue;
  }
}

function showSelectSegmentModal() {
  if (!elements.segmentsDropdownList) return;
  elements.segmentsDropdownList.innerHTML = '';

  if (settings.segments.length === 0) {
    elements.segmentsDropdownList.innerHTML = '<div class="info-text">No segments created yet.</div>';
  } else {
    settings.segments.forEach(seg => {
      const div = document.createElement('div');
      div.className = 'selection-item';
      div.textContent = seg.name;
      div.addEventListener('click', () => {
        settings.currentGroupItems.push({ type: 'segment', id: seg.id, name: seg.name });
        renderGroupItems();
        elements.selectSegmentModal.classList.remove('show');
      });
      elements.segmentsDropdownList.appendChild(div);
    });
  }
  elements.selectSegmentModal.classList.add('show');
}

function renderGroupItems() {
  if (!elements.groupMessageItems) return;
  elements.groupMessageItems.innerHTML = '';

  settings.currentGroupItems.forEach((item, index) => {
    const chip = document.createElement('div');
    chip.className = 'message-item-chip';

    let text = '';
    if (item.type === 'segment') {
      text = `<span class="chip-type">Segment:</span> ${item.name}`;
    } else if (item.type === 'static') {
      text = `<span class="chip-type">Static:</span> ${item.value}`;
    } else if (item.type === 'keyword') {
      text = `<span class="chip-type">Keyword:</span> ${item.value}`;
    }

    chip.innerHTML = `
      <span>${text}</span>
      <span class="chip-remove" data-index="${index}">✕</span>
    `;
    elements.groupMessageItems.appendChild(chip);
  });

  // Remove item listeners
  elements.groupMessageItems.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      settings.currentGroupItems.splice(index, 1);
      renderGroupItems();
    });
  });
}

function renderSegments() {
  if (!elements.segmentsList) return;
  elements.segmentsList.innerHTML = '';

  settings.segments.forEach(segment => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <span class="item-name">${segment.name}</span>
      <div class="item-actions">
        <button class="action-btn view-btn" data-id="${segment.id}" title="View">👁️</button>
        <button class="action-btn edit-btn" data-id="${segment.id}">✏️ Edit</button>
        <button class="action-btn delete-btn" data-id="${segment.id}">🗑️</button>
      </div>
    `;
    elements.segmentsList.appendChild(item);
  });

  // View Segment
  elements.segmentsList.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const segment = settings.segments.find(s => s.id === id);
      if (segment) {
        elements.viewModalTitle.textContent = `View Segment: ${segment.name}`;
        elements.viewModalContent.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit;">${segment.message}</pre>`;
        elements.viewModal.classList.add('show');
      }
    });
  });

  // Edit Segment
  elements.segmentsList.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const segment = settings.segments.find(s => s.id === id);
      if (segment) {
        settings.editingId = id;
        settings.editingType = 'segment';
        elements.segmentTitle.value = segment.name;
        elements.segmentMessage.value = segment.message;
        document.querySelector('#createSegmentPage h2').textContent = 'Edit Message Segment';
        showPage('createSegmentPage');
      }
    });
  });

  // Add delete listeners
  elements.segmentsList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (confirm('Are you sure you want to delete this segment?')) {
        const id = parseInt(btn.dataset.id);
        settings.segments = settings.segments.filter(s => s.id !== id);
        await chrome.storage.local.set({ segments: settings.segments });
        renderSegments();
      }
    });
  });
}

function renderGroups() {
  if (!elements.groupsList) return;
  elements.groupsList.innerHTML = '';

  settings.groups.forEach(group => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <span class="item-name">${group.name}</span>
      <div class="item-actions">
        <button class="action-btn view-btn" data-id="${group.id}" title="View">👁️</button>
        <button class="action-btn edit-btn" data-id="${group.id}">✏️ Edit</button>
        <button class="action-btn delete-btn" data-id="${group.id}">🗑️</button>
      </div>
    `;
    elements.groupsList.appendChild(item);
  });

  // View Group
  elements.groupsList.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const group = settings.groups.find(g => g.id === id);
      if (group) {
        elements.viewModalTitle.textContent = `View Group: ${group.name}`;
        let content = '<div class="group-view-items">';
        if (group.items && group.items.length > 0) {
          group.items.forEach(item => {
            let label = '';
            let val = '';
            if (item.type === 'segment') { label = 'Segment'; val = item.name; }
            else if (item.type === 'static') { label = 'Static'; val = item.value; }
            else if (item.type === 'keyword') { label = 'Keyword'; val = item.value; }
            content += `<div style="margin-bottom: 8px;"><strong>${label}:</strong> ${val}</div>`;
          });
        } else {
          content += 'No items in this group.';
        }
        content += '</div>';
        elements.viewModalContent.innerHTML = content;
        elements.viewModal.classList.add('show');
      }
    });
  });

  // Edit Group
  elements.groupsList.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const group = settings.groups.find(g => g.id === id);
      if (group) {
        settings.editingId = id;
        settings.editingType = 'group';
        settings.currentGroupItems = [...(group.items || [])];
        elements.groupTitle.value = group.name;
        renderGroupItems();
        document.querySelector('#createGroupPage h2').textContent = 'Edit Message Group';
        showPage('createGroupPage');
      }
    });
  });

  // Add delete listeners
  elements.groupsList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (confirm('Are you sure you want to delete this group?')) {
        const id = parseInt(btn.dataset.id);
        settings.groups = settings.groups.filter(g => g.id !== id);
        await chrome.storage.local.set({ groups: settings.groups });
        renderGroups();
      }
    });
  });
}

// Setup tags input functionality
function setupTagsInput(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const input = container.querySelector('.tags-input-field');
  if (!input) return;

  input.addEventListener('keydown', (e) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      const value = input.value.trim();
      if (value) {
        addTag(container, value);
        input.value = '';
      }
    }
  });

  // Remove tag on click
  container.addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-remove')) {
      e.target.closest('.tag').remove();
    }
  });
}

// Add tag to container
function addTag(container, text) {
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.innerHTML = `${text} <span class="tag-remove">×</span>`;
  const input = container.querySelector('.tags-input-field');
  input.parentNode.insertBefore(tag, input);
}

// Resume automation
async function resumeAutomation() {
  try {
    const [tab] = await chrome.tabs.query({ url: '*://www.facebook.com/*' });
    if (tab) {
      await chrome.tabs.sendMessage(tab.id, { type: 'RESUME_AUTOMATION' });
      await chrome.runtime.sendMessage({
        type: 'UPDATE_STATE',
        data: { status: 'running' }
      });
      updateAutomationControls('running');
    }
  } catch (error) {
    console.error('Error resuming automation:', error);
    alert('Error: ' + error.message);
  }
}

// Get current automation status
async function getCurrentStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    return response?.state?.status || 'stopped';
  } catch (error) {
    return 'stopped';
  }
}

// Check and update automation status
async function checkAutomationStatus() {
  const status = await getCurrentStatus();
  updateAutomationControls(status);

  // Check periodically
  setInterval(async () => {
    const currentStatus = await getCurrentStatus();
    updateAutomationControls(currentStatus);
  }, 2000);
}

// Setup instruction page
function setupInstructionPage() {
  const goToFriendsBtn = document.getElementById('goToFriendsBtn');
  const goToGroupsBtn = document.getElementById('goToGroupsBtn');

  if (goToFriendsBtn) {
    goToFriendsBtn.addEventListener('click', async () => {
      try {
        await chrome.tabs.create({ url: 'https://www.facebook.com/friends/suggestions' });
      } catch (error) {
        console.error('Error opening friend suggestions:', error);
      }
    });
  }

  if (goToGroupsBtn) {
    goToGroupsBtn.addEventListener('click', async () => {
      try {
        await chrome.tabs.create({ url: 'https://www.facebook.com/groups' });
      } catch (error) {
        console.error('Error opening groups:', error);
      }
    });
  }
}

// Setup tabs
function setupTabs() {
  // Home page tabs
  const homeTabBtns = document.querySelectorAll('#homePage .tab-btn');
  const homeTabPanes = document.querySelectorAll('#homePage .tab-pane');

  homeTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      // Update buttons
      homeTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update panes
      homeTabPanes.forEach(pane => pane.classList.remove('active'));
      let pane;
      if (tabName === 'settings') {
        pane = document.getElementById('homeSettingsTab');
      } else {
        pane = document.getElementById(`${tabName}Tab`);
      }
      if (pane) {
        pane.classList.add('active');
      }
    });
  });
}

// Detect page context and show appropriate view
async function detectPageContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      showPage('instructionPage');
      return;
    }

    const url = tab.url;

    // Check if on groups people page
    if (url.includes('facebook.com/groups/') && (url.includes('/members') || url.includes('/people'))) {
      showPage('groupsPage');
    }
    // Check if on friend suggestions page - show settings page
    else if (url.includes('facebook.com/friends/suggestions') ||
      url.includes('facebook.com/friends') ||
      url.includes('facebook.com/find-friends')) {
      showPage('settingsPage');
    }
    // Check if on friend's friend list - show settings page
    else if (url.includes('facebook.com/') && url.includes('/friends') && !url.includes('/groups/')) {
      showPage('settingsPage');
    }
    // Wrong page - show instructions
    else {
      showPage('instructionPage');
    }
  } catch (error) {
    console.error('Error detecting page context:', error);
    showPage('instructionPage');
  }
}


// Show specific page
function showPage(pageId) {
  console.log('Showing page:', pageId);
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  const page = document.getElementById(pageId);
  const container = document.querySelector('.friender-container');
  if (pageId === 'instructionPage') {
    if (container) {
      container.classList.add('page-is-instruction');
      container.classList.remove('page-is-settings');
    }
    document.body.classList.add('instruction-page-active');
    document.body.classList.remove('settings-page-active');
  } else if (pageId === 'settingsPage') {
    if (container) {
      container.classList.add('page-is-settings');
      container.classList.remove('page-is-instruction');
    }
    document.body.classList.add('settings-page-active');
    document.body.classList.remove('instruction-page-active');
  } else {
    if (container) {
      container.classList.remove('page-is-instruction');
      container.classList.remove('page-is-settings');
    }
    document.body.classList.remove('instruction-page-active');
    document.body.classList.remove('settings-page-active');
  }
  if (page) {
    page.classList.add('active');
    console.log('Page activated:', pageId);
  } else {
    console.error('Page not found:', pageId);
  }
}

// Setup page navigation
function setupPageNavigation() {
  // Settings icon button - should work from any page
  // Opens the page with Segments/Groups/Settings tabs (homePage)
  const settingsIconBtn = document.getElementById('settingsIconBtn');
  if (settingsIconBtn) {
    // Use onclick to ensure it works
    settingsIconBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Settings icon clicked, showing home page with tabs');
      showPage('homePage');
      return false;
    };
  }

  // Home button - return to context-appropriate page
  const homeBtn = document.getElementById('homeBtn');
  if (homeBtn) {
    // Use onclick to ensure it works
    homeBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Home icon clicked, detecting page context');
      detectPageContext();
      return false;
    };
  }

  // Menu button - toggle dropdown menu
  const menuBtn = document.getElementById('menuBtn');
  const dropdownMenu = document.getElementById('dropdownMenu');
  const menuClose = document.getElementById('menuClose');

  if (menuBtn && dropdownMenu) {
    menuBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Menu icon clicked, toggling dropdown');
      dropdownMenu.classList.toggle('show');
      return false;
    };
  }

  if (menuClose && dropdownMenu) {
    menuClose.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropdownMenu.classList.remove('show');
      return false;
    };
  }

  // Close menu when clicking outside
  document.addEventListener('click', function (e) {
    if (dropdownMenu && menuBtn && !dropdownMenu.contains(e.target) && !menuBtn.contains(e.target)) {
      dropdownMenu.classList.remove('show');
    }
  });

  // Setup menu item clicks
  setupMenuItems();
}

// Setup menu item actions
function setupMenuItems() {
  const menuItems = document.querySelectorAll('.menu-item');

  menuItems.forEach(item => {
    item.addEventListener('click', function () {
      const text = this.querySelector('.menu-text').textContent;
      console.log('Menu item clicked:', text);

      // Close menu
      const dropdownMenu = document.getElementById('dropdownMenu');
      if (dropdownMenu) {
        dropdownMenu.classList.remove('show');
      }

      // Handle different menu items
      if (text === 'Settings') {
        showPage('homePage');
      } else if (text === 'Logout') {
        if (confirm('Are you sure you want to logout?')) {
          // Handle logout
          console.log('Logout clicked');
        }
      } else if (text === 'Training') {
        // Handle training
        console.log('Training clicked');
      } else if (text === 'Delete Pending Request') {
        handleDeletePendingRequests();
      } else if (text === 'Clear All') {
        handleClearAll();
      } else if (text === 'Change Password') {
        // Handle change password
        console.log('Change Password clicked');
      } else if (text === 'Manage my account') {
        // Handle manage account
        console.log('Manage my account clicked');
      }
    });
  });
}

// Start automation
async function startAutomation(pageType = 'settings') {
  console.log('[Popup] 🚀 Starting automation, pageType:', pageType);
  
  try {
    // Save current settings
    await saveSettings();
    console.log('[Popup] Settings saved');

    // Get Facebook tab
    const [tab] = await chrome.tabs.query({ url: '*://www.facebook.com/*' });
    if (!tab) {
      alert('Please navigate to Facebook to start automation.');
      console.error('[Popup] ❌ No Facebook tab found');
      return;
    }
    
    console.log('[Popup] Facebook tab found:', tab.id, tab.url);

    // Get settings based on page type
    let automationSettings = { ...settings };
    if (pageType === 'groups') {
      // Get groups page specific settings
      const groupsSettings = await chrome.storage.local.get(['groupsSettings']);
      if (groupsSettings.groupsSettings) {
        automationSettings = { ...automationSettings, ...groupsSettings.groupsSettings };
      }

      // Get keywords from tags (groups page only)
      const keywordsContainer = document.getElementById('keywordsInput');
      const negativeKeywordsContainer = document.getElementById('negativeKeywordsInput');

      if (keywordsContainer) {
        const keywordTags = keywordsContainer.querySelectorAll('.tag');
        automationSettings.keywords = Array.from(keywordTags).map(tag =>
          tag.textContent.replace('×', '').trim()
        ).filter(k => k);
      }

      if (negativeKeywordsContainer) {
        const negativeTags = negativeKeywordsContainer.querySelectorAll('.tag');
        automationSettings.negativeKeywords = Array.from(negativeTags).map(tag =>
          tag.textContent.replace('×', '').trim()
        ).filter(k => k);
      }
    } else {
      // Suggestion people page: no Keywords/Negative Keywords, no Resume/Last position – use only this page's fields
      automationSettings.keywords = [];
      automationSettings.negativeKeywords = [];
    }

    // Use ONLY the fields that exist on the current page (separate run per page)
    if (pageType === 'settings') {
      // Suggestion people page fields only (image 1) – no resume/last position on suggestions; do NOT overwrite stored group values
      automationSettings.lookupInterval = elements.lookupInterval?.value || 'auto';
      const settingsLimitBtn = document.querySelector('#settingsPage .toggle-btn.active');
      automationSettings.requestsLimit = settingsLimitBtn?.id === 'limitInfinite' ? 'infinite' : 'limited';
      automationSettings.numberOfRequests = parseInt(elements.numberOfRequests?.value) || 2;
      automationSettings.resumeFromLastSearch = 'no';
      automationSettings.lastSearchPosition = 0;
      // (lastSearchPosition/resumeFromLastSearch only apply to groups; keep above for this run so suggestions never resume)

      automationSettings.useGenderFilter = elements.useGenderFilter?.checked || false;
      const settingsGenderRadio = document.querySelector('#settingsPage input[name="gender"]:checked');
      automationSettings.gender = settingsGenderRadio?.value || null;

      automationSettings.useCountryFilter = elements.useCountryFilter?.checked || false;
      const settingsCountryRadio = document.querySelector('#settingsPage input[name="countryFilter"]:checked');
      automationSettings.countryFilter = settingsCountryRadio?.value || 'tier';

      automationSettings.mutualFriendsOperator = elements.mutualFriendsOperator?.value || 'greater';
      automationSettings.mutualFriendsCount = parseInt(elements.mutualFriendsCount?.value) || 1;
      automationSettings.messageGroups = elements.messageGroups?.value || 'test12';
    } else {
      // Group peoples page fields only (image 2)
      automationSettings.lookupInterval = elements.lookupIntervalGroups?.value || 'auto';
      const groupsLimitBtn = document.querySelector('#groupsPage .toggle-btn.active');
      automationSettings.requestsLimit = groupsLimitBtn?.id === 'limitInfiniteGroups' ? 'infinite' : 'limited';
      automationSettings.numberOfRequests = parseInt(elements.numberOfRequestsGroups?.value) || 10;

      const groupsResumeRadio = document.querySelector('#groupsPage input[name="resumeSearch"]:checked');
      automationSettings.resumeFromLastSearch = groupsResumeRadio?.value || 'no';
      automationSettings.lastSearchPosition = parseInt(elements.lastSearchPositionGroups?.value, 10) || 0;

      automationSettings.useGenderFilter = elements.useGenderFilterGroups?.checked || false;
      const groupsGenderRadio = document.querySelector('#groupsPage input[name="genderGroups"]:checked');
      automationSettings.gender = groupsGenderRadio?.value || null;

      automationSettings.useCountryFilter = elements.useCountryFilterGroups?.checked || false;
      const groupsCountryRadio = document.querySelector('#groupsPage input[name="countryFilterGroups"]:checked');
      automationSettings.countryFilter = groupsCountryRadio?.value || 'tier';

      automationSettings.mutualFriendsOperator = 'greater';
      automationSettings.mutualFriendsCount = 1;
      automationSettings.messageGroups = elements.messageGroupsGroups?.value || 'test12';
    }

    // Tier and Country Selections (from current page context – shared keys, but UI is per page)
    automationSettings.selectedTiers = settings.selectedTiers || [];
    automationSettings.selectedCountries = settings.selectedCountries || [];

    // Merge with existing settings so messaging (after_accept, decline, incoming) and segments/groups are not wiped
    const current = await chrome.storage.local.get(['settings']);
    const merged = { ...(current.settings || {}), ...automationSettings };
    // When running from suggestions, do not overwrite lastSearchPosition/resumeFromLastSearch in storage so groups "Your last search member's position" is preserved
    const toSave = (pageType === 'settings' && current.settings)
      ? { ...merged, lastSearchPosition: current.settings.lastSearchPosition, resumeFromLastSearch: current.settings.resumeFromLastSearch }
      : merged;
    await chrome.storage.local.set({ settings: toSave });

    // Update state to running and reset session counter
    await chrome.runtime.sendMessage({
      type: 'UPDATE_STATE',
      data: {
        status: 'running',
        sessionStartTime: Date.now(),
        sessionFriendRequests: 0,
        sessionMessages: 0
      }
    });

    // Try to send message to content script (send merged so messaging/segments are available)
    console.log('[Popup] 📤 Sending START_AUTOMATION message to tab:', tab.id);
    
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'START_AUTOMATION',
        settings: merged
      });
      
      console.log('[Popup] ✅ Response from content script:', response);

      if (response && response.success) {
        // Update button state
        updateAutomationControls('running');
        return;
      }
    } catch (messageError) {
      // Content script might not be loaded, try to inject it
      console.log('[Popup] ⚠️ Content script not ready, injecting...', messageError);

      try {
        // Only inject if tab is still on Facebook (URL can change)
        const tabUrl = (tab && tab.url) || '';
        if (!tabUrl.includes('facebook.com')) {
          throw new Error('Tab is no longer on Facebook. Open a group Members or Friends suggestions page and try again.');
        }
        // Inject content scripts (one at a time so we know which fails; avoids "unknown error when fetching" being opaque)
        const files = [
          'content/automation-engine.js',
          'content/message-trigger-system.js',
          'content/facebook-handler.js',
          'content/profile-scanner.js',
          'content/content-main.js'
        ];
        for (const file of files) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [file]
          });
        }

        // Wait for scripts to initialize and register listeners (longer wait so START_AUTOMATION is handled)
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Try sending message again (use merged so messaging/segments preserved)
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'START_AUTOMATION',
          settings: merged
        });

        if (response && response.success) {
          // Update button state
          updateAutomationControls('running');
          return;
        }
      } catch (injectError) {
        console.error('Error injecting scripts:', injectError);
        const msg = (injectError && injectError.message) || String(injectError);
        const isFetchError = /fetching the script|unknown error/i.test(msg);
        const hint = isFetchError
          ? 'Refresh the Facebook tab (F5), then click Run again. If it still fails, reload the extension from chrome://extensions.'
          : 'Please refresh the Facebook page and try again.';
        throw new Error('Could not load automation scripts. ' + hint);
      }
    }

    // If we get here, something went wrong
    throw new Error('Could not start automation. Please refresh the Facebook page and try again.');

  } catch (error) {
    console.error('Error starting automation:', error);
    alert('Error: ' + error.message);
    updateAutomationControls('stopped');
  }
}

// Pause automation
async function pauseAutomation() {
  try {
    const [tab] = await chrome.tabs.query({ url: '*://www.facebook.com/*' });
    if (tab) {
      await chrome.tabs.sendMessage(tab.id, { type: 'PAUSE_AUTOMATION' });
      await chrome.runtime.sendMessage({
        type: 'UPDATE_STATE',
        data: { status: 'paused' }
      });
      updateAutomationControls('paused');
    }
  } catch (error) {
    console.error('Error pausing automation:', error);
    alert('Error: ' + error.message);
  }
}

// Stop automation – force stop everywhere: UI first, then background, then tell tabs to stop
async function stopAutomation() {
  // 1. Update popup UI immediately so "Running" is removed and "Run" shows
  updateAutomationControls('stopped');

  try {
    // 2. Persist stopped state in background (so GET_STATE returns 'stopped' and poll won't flip back)
    await chrome.runtime.sendMessage({
      type: 'UPDATE_STATE',
      data: { status: 'stopped', userRequestedStop: true }
    });

    // 3. Tell all Facebook tabs to stop the scanner
    const tabs = await chrome.tabs.query({ url: '*://www.facebook.com/*' });
    for (const tab of tabs || []) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'STOP_AUTOMATION' });
      } catch (e) {
        // Tab might not have content script; ignore
      }
    }

    // 4. Reset filters and data
    await resetAllSettings();
  } catch (error) {
    console.error('Error stopping automation:', error);
    alert('Error: ' + error.message);
  }
}

// Update automation control buttons
function updateAutomationControls(status) {
  // Settings page controls
  const runBtn = document.getElementById('runBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const controls = document.getElementById('automationControls');

  // Groups page controls
  const runBtnGroups = document.getElementById('runBtnGroups');
  const pauseBtnGroups = document.getElementById('pauseBtnGroups');
  const stopBtnGroups = document.getElementById('stopBtnGroups');
  const controlsGroups = document.getElementById('automationControlsGroups');

  // Helper function to update a set of controls
  const updateControls = (runButton, pauseButton, stopButton, controlsContainer) => {
    if (!runButton) return;

    if (status === 'running') {
      runButton.innerHTML = '<i class="bi bi-lightning-charge-fill me-1"></i><span>Running...</span>';
      runButton.disabled = true;
      runButton.style.background = '#28a745';
      if (controlsContainer) controlsContainer.style.display = 'flex';
      if (pauseButton) pauseButton.disabled = false;
      if (stopButton) stopButton.disabled = false;
    } else if (status === 'paused') {
      runButton.innerHTML = '<i class="bi bi-play-fill me-1"></i><span>Resume</span>';
      runButton.disabled = false;
      runButton.style.background = '#ffc107';
      if (controlsContainer) controlsContainer.style.display = 'flex';
      if (pauseButton) pauseButton.disabled = true;
      if (stopButton) stopButton.disabled = false;
    } else {
      runButton.innerHTML = '<i class="bi bi-lightning-charge-fill me-1"></i><span>Run</span>';
      runButton.disabled = false;
      runButton.style.background = '#667eea';
      if (controlsContainer) controlsContainer.style.display = 'none';
      if (pauseButton) pauseButton.disabled = true;
      if (stopButton) stopButton.disabled = true;
    }
  };

  // Update both pages
  updateControls(runBtn, pauseBtn, stopBtn, controls);
  updateControls(runBtnGroups, pauseBtnGroups, stopBtnGroups, controlsGroups);
}

/**
 * Clear all extension data: storage, in-memory state, and reset UI.
 * Shows confirmation dialog, then success message.
 */
async function handleClearAll() {
  if (!confirm('Are you sure you want to clear all extension data? This cannot be undone.')) {
    return;
  }

  try {
    await chrome.storage.local.clear();

    // Reset in-memory settings to defaults (including default segments/groups)
    settings = {
      lookupInterval: 'auto',
      requestsLimit: 'limited',
      numberOfRequests: 2,
      resumeFromLastSearch: 'no',
      lastSearchPosition: 0,
      useGenderFilter: false,
      gender: null,
      useCountryFilter: false,
      countryFilter: null,
      mutualFriendsOperator: 'greater',
      mutualFriendsCount: 1,
      messageGroups: 'default',
      keywords: [],
      negativeKeywords: [],
      segments: [{ id: 1, name: 'Default' }],
      groups: [{ id: 1, name: 'Default' }],
      editingId: null,
      editingType: null,
      currentGroupItems: [],
      selectedTiers: [],
      selectedCountries: [],
      messaging: {
        enabled: false,
        sendOnIncomingRequest: false,
        sendAfterAccept: false,
        sendOnDecline: false,
        incomingRequestGroup: 'default',
        acceptGroup: 'default',
        declineGroup: 'default'
      }
    };

    // Persist default state so extension works after clear
    await chrome.storage.local.set({
      settings,
      segments: settings.segments,
      groups: settings.groups
    });

    // Tell background to stop automation
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_STATE',
        data: { status: 'stopped', userRequestedStop: true }
      });
    } catch (_) {}

    updateUI();
    renderSegments();
    renderGroups();
    populateDropdowns();
    loadMessagingSettings();
    updateAutomationControls('stopped');

    showClearAllSuccess();
  } catch (error) {
    console.error('[Popup] Error clearing all data:', error);
    alert('Failed to clear data. Please try again.');
  }
}

function showClearAllSuccess() {
  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.textContent = 'All data cleared successfully.';
  toast.className = 'clear-all-toast';
  toast.style.cssText = 'position: fixed; top: 10px; right: 10px; background: #28a745; color: white; padding: 6px 12px; border-radius: 6px; z-index: 10000; font-size: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.12);';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Enhanced pending request deletion with better tab management
 * Uses background worker for improved reliability
 */
async function handleDeletePendingRequests() {
  try {
    // Check if user is logged in to Facebook
    const [tab] = await chrome.tabs.query({ url: '*://www.facebook.com/*' });
    if (!tab) {
      alert('Please open Facebook first.');
      return;
    }

    // Confirm action
    if (!confirm('This will delete all pending friend requests on the Pending Requests page. Continue?')) {
      return;
    }

    // Use background worker to handle tab management and deletion
    const response = await chrome.runtime.sendMessage({ 
      type: 'OPEN_PENDING_REQUEST_PAGE' 
    });

    if (response && response.success) {
      // Show success message
      console.log('[Popup] Pending request deletion initiated');
      
      // The background worker will handle:
      // 1. Opening/navigating to the pending requests page
      // 2. Waiting for page to load
      // 3. Sending deletion message to content script
      
      // Show user feedback
      const toast = document.createElement('div');
      toast.textContent = 'Deleting pending requests...';
      toast.style.cssText = 'position: fixed; top: 10px; right: 10px; background: #4CAF50; color: white; padding: 6px 12px; border-radius: 6px; z-index: 10000; font-size: 12px;';
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.remove();
      }, 3000);
    } else {
      const errorMsg = response?.error || 'Unknown error';
      alert(`Failed to open pending requests page: ${errorMsg}`);
      console.error('[Popup] Error opening pending requests page:', errorMsg);
    }
  } catch (error) {
    console.error('[Popup] Error in handleDeletePendingRequests:', error);
    alert(`Error: ${error.message}`);
  }
}

function setupTierMultiSelect(type = 'settings') {
  const selectBox = type === 'settings' ? elements.tierSelectBox : elements.tierSelectBoxGroups;
  const dropdown = type === 'settings' ? elements.tierDropdown : elements.tierDropdownGroups;
  const items = type === 'settings' ? elements.tierList.querySelectorAll('.dropdown-item') : elements.tierListGroups.querySelectorAll('.dropdown-item');

  if (!selectBox || !dropdown) return;

  // Toggle dropdown
  selectBox.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });

  // Items handling
  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const tierId = item.dataset.tier;
      toggleTier(tierId, type);
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !selectBox.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });
}

function toggleTier(tierId, type = 'settings') {
  const index = settings.selectedTiers.indexOf(tierId);
  if (index === -1) {
    settings.selectedTiers.push(tierId);
  } else {
    settings.selectedTiers.splice(index, 1);
  }

  updateTierTags();
  updateTierTags('groups');

  // Update item styling
  const list = type === 'settings' ? elements.tierList : elements.tierListGroups;
  list.querySelectorAll('.dropdown-item').forEach(item => {
    if (settings.selectedTiers.includes(item.dataset.tier)) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });

  saveSettings();
}

function updateTierTags(type = 'settings') {
  const selectBox = type === 'settings' ? elements.tierSelectBox : elements.tierSelectBoxGroups;
  if (!selectBox) return;

  const placeholder = selectBox.querySelector('.placeholder');
  if (placeholder) placeholder.style.display = settings.selectedTiers.length > 0 ? 'none' : 'block';

  // Remove existing tags
  selectBox.querySelectorAll('.selected-tag').forEach(tag => tag.remove());

  settings.selectedTiers.forEach(tierId => {
    const tag = document.createElement('span');
    tag.className = 'selected-tag';
    tag.innerHTML = `Tier ${tierId} <span class="tag-close" data-tier="${tierId}">×</span>`;

    tag.querySelector('.tag-close').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTier(tierId, type);
    });

    selectBox.appendChild(tag);
  });
}

function setupCountryMultiSelect(type = 'settings') {
  const selectBox = type === 'settings' ? elements.countrySelectBox : elements.countrySelectBoxGroups;
  const dropdown = type === 'settings' ? elements.countryDropdown : elements.countryDropdownGroups;
  const list = type === 'settings' ? elements.countryList : elements.countryListGroups;
  const searchInput = type === 'settings' ? elements.countrySearch : elements.countrySearchGroups;

  if (!selectBox || !dropdown) return;

  // Toggle dropdown
  selectBox.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
    if (dropdown.classList.contains('show')) {
      searchInput.focus();
      renderDropdownList(list, searchInput.value, type);
    }
  });

  // Search functionality
  searchInput.addEventListener('input', () => {
    renderDropdownList(list, searchInput.value, type);
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !selectBox.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });
}

function renderDropdownList(listElem, filter = '', type = 'settings') {
  listElem.innerHTML = '';
  const filtered = ALL_COUNTRIES.filter(c => c.toLowerCase().includes(filter.toLowerCase()));

  filtered.forEach(country => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    if (settings.selectedCountries.includes(country)) {
      item.classList.add('selected');
    }
    item.textContent = country;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCountry(country, type);
    });
    listElem.appendChild(item);
  });
}

function toggleCountry(country, type = 'settings') {
  const index = settings.selectedCountries.indexOf(country);
  if (index === -1) {
    settings.selectedCountries.push(country);
  } else {
    settings.selectedCountries.splice(index, 1);
  }

  updateCountryTags();
  updateCountryTags('groups');

  // Refresh dropdown selection
  const list = type === 'settings' ? elements.countryList : elements.countryListGroups;
  const searchInput = type === 'settings' ? elements.countrySearch : elements.countrySearchGroups;
  renderDropdownList(list, searchInput.value, type);

  saveSettings();
}

function updateCountryTags(type = 'settings') {
  const selectBox = type === 'settings' ? elements.countrySelectBox : elements.countrySelectBoxGroups;
  if (!selectBox) return;

  const placeholder = selectBox.querySelector('.placeholder');
  if (placeholder) placeholder.style.display = settings.selectedCountries.length > 0 ? 'none' : 'block';

  // Remove existing tags
  selectBox.querySelectorAll('.selected-tag').forEach(tag => tag.remove());

  settings.selectedCountries.forEach(country => {
    const tag = document.createElement('span');
    tag.className = 'selected-tag';
    tag.innerHTML = `${country} <span class="tag-close" data-country="${country}">×</span>`;

    tag.querySelector('.tag-close').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCountry(country, type);
    });

    selectBox.appendChild(tag);
  });
}
async function resetAllSettings() {
  // Reset state object to defaults
  settings = {
    ...settings,
    lookupInterval: 'auto',
    requestsLimit: 'limited',
    numberOfRequests: 2,
    resumeFromLastSearch: 'no',
    lastSearchPosition: 0,
    useGenderFilter: false,
    gender: null,
    useCountryFilter: false,
    countryFilter: null,
    selectedTiers: [],
    selectedCountries: [],
    keywords: [],
    negativeKeywords: []
  };

  // Clear storage
  await chrome.storage.local.set({ settings });

  // Reset UI elements
  if (elements.lookupInterval) elements.lookupInterval.value = 'auto';
  if (elements.numberOfRequests) elements.numberOfRequests.value = 2;
  if (elements.numberOfRequestsGroups) elements.numberOfRequestsGroups.value = 2;

  // Reset limit buttons
  updateLimitUI('settings');

  // Reset radios
  const noResumes = document.querySelectorAll('input[name="resumeSearch"][value="no"]');
  noResumes.forEach(r => r.checked = true);

  if (elements.lastSearchPosition) elements.lastSearchPosition.value = '0';
  if (elements.lastSearchPositionGroups) elements.lastSearchPositionGroups.value = '';

  // Reset filter checkboxes
  if (elements.useGenderFilter) elements.useGenderFilter.checked = false;
  if (elements.useGenderFilterGroups) elements.useGenderFilterGroups.checked = false;
  if (elements.useCountryFilter) elements.useCountryFilter.checked = false;
  if (elements.useCountryFilterGroups) elements.useCountryFilterGroups.checked = false;

  // Clear tags inputs
  const tagInputs = [elements.keywordsInput, elements.negativeKeywordsInput];
  tagInputs.forEach(container => {
    if (container) {
      const tags = container.querySelectorAll('.tag');
      tags.forEach(t => t.remove());
      const input = container.querySelector('input');
      if (input) input.value = '';
    }
  });

  // Update UI state (hiding Options etc.)
  updateUI();

  // Refresh Country/Tier Tags
  updateCountryTags();
  updateCountryTags('groups');
  updateTierTags();
  updateTierTags('groups');

  console.log('[Popup] All filters and data cleared.');
}
