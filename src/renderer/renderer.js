/**
 * PowerDeck Pro - Renderer Controller
 * Coordinates UI states, authentication flows, theme switching, and Agora config
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Global HTML sanitization helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Global rich text formatting: escapes HTML and converts URLs / @mentions to interactive links
  function formatRichTextWithLinks(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);

    // Replace URLs (http://, https://, www., or clubhouse.com/) with clickable anchors
    const urlRegex = /(?:https?:\/\/|www\.|clubhouse\.com\/)[^\s<]+[^<.,:;"')\]\s]/gi;
    escaped = escaped.replace(urlRegex, (matchedUrl) => {
      // Decode HTML entities to produce clean URL for href
      const rawUrl = matchedUrl
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      const targetHref = (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))
        ? rawUrl
        : `https://${rawUrl}`;

      const safeHref = escapeHtml(targetHref);
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="rich-text-link chat-msg-link" title="${safeHref}">${matchedUrl}</a>`;
    });

    // Replace @mentions with clickable user tags (ignoring tags inside HTML attributes/tags)
    escaped = escaped.replace(/(^|\s)@([a-zA-Z0-9_]{2,30})(?![^<]*>)/g, '$1<span class="rich-text-mention" data-username="$2">@$2</span>');
    return escaped;
  }

  // Link Action Dialog State (Ask user: Open in Browser or Copy Link)
  let pendingActionLinkUrl = null;

  function showLinkActionDialog(url) {
    if (!url) return;
    pendingActionLinkUrl = url;
    const modal = document.getElementById('modal-link-action-dialog');
    const previewEl = document.getElementById('link-action-url-preview');
    const btnCopy = document.getElementById('btn-link-action-copy');
    if (previewEl) previewEl.textContent = url;
    if (btnCopy) btnCopy.textContent = '📋 Copy Link';
    if (modal) modal.style.display = 'flex';
  }

  function hideLinkActionDialog() {
    pendingActionLinkUrl = null;
    const modal = document.getElementById('modal-link-action-dialog');
    if (modal) modal.style.display = 'none';
  }

  const btnCloseLinkAction = document.getElementById('btn-close-link-action');
  const btnLinkActionOpen = document.getElementById('btn-link-action-open');
  const btnLinkActionCopy = document.getElementById('btn-link-action-copy');
  const modalLinkAction = document.getElementById('modal-link-action-dialog');

  if (btnCloseLinkAction) {
    btnCloseLinkAction.addEventListener('click', hideLinkActionDialog);
  }
  if (modalLinkAction) {
    modalLinkAction.addEventListener('click', (e) => {
      if (e.target === modalLinkAction) hideLinkActionDialog();
    });
  }
  if (btnLinkActionOpen) {
    btnLinkActionOpen.addEventListener('click', () => {
      if (pendingActionLinkUrl) {
        if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
          window.powerdeckAPI.openExternal(pendingActionLinkUrl);
        } else {
          window.open(pendingActionLinkUrl, '_blank');
        }
      }
      hideLinkActionDialog();
    });
  }
  if (btnLinkActionCopy) {
    btnLinkActionCopy.addEventListener('click', async () => {
      if (pendingActionLinkUrl) {
        try {
          if (window.powerdeckAPI && window.powerdeckAPI.copyToClipboard) {
            await window.powerdeckAPI.copyToClipboard(pendingActionLinkUrl);
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(pendingActionLinkUrl);
          }
          btnLinkActionCopy.textContent = '✓ Link Copied!';
          setTimeout(() => {
            hideLinkActionDialog();
          }, 600);
        } catch (_) {
          hideLinkActionDialog();
        }
      }
    });
  }

  // Delegated click & auxclick handler for rich text links & @mentions across all modals/boxes/chat
  function handleExternalLinkNavigation(e) {
    const linkEl = e.target.closest('.rich-text-link, .chat-msg-link, #channel-chat-panel a, .chat-message-item a, a[href]');
    if (linkEl) {
      const href = linkEl.getAttribute('href') || linkEl.href;
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        let targetUrl = href;
        if (targetUrl.startsWith('www.')) targetUrl = `https://${targetUrl}`;
        else if (targetUrl.startsWith('clubhouse.com')) targetUrl = `https://${targetUrl}`;

        if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
          e.preventDefault();
          e.stopPropagation();

          // If the link is clicked inside the Room Chat, ask the user: Open in Browser or Copy Link?
          if (linkEl.closest('#channel-chat-panel, .room-chat-drawer, .chat-panel, .chat-message-item, .chat-msg-text, .chat-msg-replied-text')) {
            showLinkActionDialog(targetUrl);
            return true;
          }

          if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
            window.powerdeckAPI.openExternal(targetUrl);
          } else {
            window.open(targetUrl, '_blank');
          }
          return true;
        }
      }
    }
    return false;
  }

  document.addEventListener('click', (e) => {
    if (handleExternalLinkNavigation(e)) return;

    const mentionEl = e.target.closest('.rich-text-mention');
    if (mentionEl) {
      const uname = mentionEl.getAttribute('data-username');
      if (uname && typeof openUserProfileModal === 'function') {
        e.preventDefault();
        e.stopPropagation();
        openUserProfileModal(uname);
      }
    }
  });

  document.addEventListener('auxclick', (e) => {
    if (e.button === 1) { // Middle click opens external link in browser
      handleExternalLinkNavigation(e);
    }
  });

  // ============================================================
  // DOM ELEMENTS
  // ============================================================

  // Header & Controls
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon');
  const themeText = document.getElementById('theme-text');
  const btnMinimize = document.getElementById('btn-minimize');
  const btnMaximize = document.getElementById('btn-maximize');
  const btnClose = document.getElementById('btn-close');
  const headerDeviceId = document.getElementById('header-device-id');
  const deviceChip = document.getElementById('device-chip');
  const headerLockBadge = document.getElementById('header-lock-badge');

  // Status Bar
  const appStatusText = document.getElementById('app-status-text');

  // Views
  const viewLogin = document.getElementById('view-login');
  const viewHome = document.getElementById('view-home');

  // Existing Profile Banner
  const existingProfileBanner = document.getElementById('existing-profile-banner');
  const existingProfileDesc = document.getElementById('existing-profile-desc');
  const btnResumeSession = document.getElementById('btn-resume-session');

  // Mode Navigation Buttons (The 3 Buttons)
  const modeButtons = {
    phone: document.getElementById('mode-btn-phone'),
    password: document.getElementById('mode-btn-password'),
    token: document.getElementById('mode-btn-token')
  };

  const panels = {
    phone: document.getElementById('panel-phone'),
    password: document.getElementById('panel-password'),
    token: document.getElementById('panel-token')
  };

  // Phone Auth Elements
  const phonePanelDeviceId = document.getElementById('phone-panel-device-id');
  const phonePanelLockStatus = document.getElementById('phone-panel-lock-status');
  const btnRegenDeviceId = document.getElementById('btn-regen-device-id');
  const inputPhoneNumber = document.getElementById('input-phone-number');
  const btnSendOtp = document.getElementById('btn-send-otp');
  const otpSection = document.getElementById('otp-section');
  const inputOtpCode = document.getElementById('input-otp-code');
  const btnVerifyOtp = document.getElementById('btn-verify-otp');

  // Password Auth Elements
  const inputPassPhone = document.getElementById('input-pass-phone');
  const inputPassPassword = document.getElementById('input-pass-password');
  const btnTogglePassVisibility = document.getElementById('btn-toggle-pass-visibility');
  const btnPasswordLogin = document.getElementById('btn-password-login');

  // Token Auth Elements
  const inputTokenDirect = document.getElementById('input-token-direct');
  const btnToggleTokenVisibility = document.getElementById('btn-toggle-token-visibility');
  const btnTokenLogin = document.getElementById('btn-token-login');

  // Separated Token Preview Box
  const tokenPreviewCard = document.getElementById('token-preview-card');
  const tokenPreviewInput = document.getElementById('token-preview-input');
  const tokenStatusBadge = document.getElementById('token-status-badge');
  const btnCopyPreviewToken = document.getElementById('btn-copy-preview-token');
  const btnMaskPreviewToken = document.getElementById('btn-mask-preview-token');

  // Alert Box
  const alertBox = document.getElementById('alert-box');
  const alertIcon = document.getElementById('alert-icon');
  const alertMessage = document.getElementById('alert-message');

  // Home View Elements
  const homeProfileSummary = document.getElementById('home-profile-summary');
  const homeAvatar = document.getElementById('home-avatar');
  const homeAvatarFallback = document.getElementById('home-avatar-fallback');
  const homeUserName = document.getElementById('home-user-name');
  const homeUserHandle = document.getElementById('home-user-handle');
  const homeUserId = document.getElementById('home-user-id');
  const homeUserFollowing = document.getElementById('home-user-following');
  const homeUserFollowingTag = document.getElementById('home-user-following-tag');
  const btnOpenFolder = document.getElementById('btn-open-folder');
  const btnViewJson = document.getElementById('btn-view-json');
  const btnUnlinkProfile = document.getElementById('btn-unlink-profile');
  const btnLogout = document.getElementById('btn-logout');

  // Modal Elements
  const jsonModal = document.getElementById('json-modal');
  const modalJsonText = document.getElementById('modal-json-text');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnModalDismiss = document.getElementById('btn-modal-dismiss');
  const btnCopyModalJson = document.getElementById('btn-copy-modal-json');

  // Search Results Overlay Elements
  const searchResultsOverlay = document.getElementById('search-results-overlay');
  const searchResultsBody = document.getElementById('search-results-body');
  const btnCloseSearchResults = document.getElementById('btn-close-search-results');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const tabSearchAll = document.getElementById('tab-search-all');
  const tabSearchUsers = document.getElementById('tab-search-users');
  const tabSearchClubs = document.getElementById('tab-search-clubs');
  const tabSearchRooms = document.getElementById('tab-search-rooms');
  const countSearchAll = document.getElementById('count-search-all');
  const countSearchUsers = document.getElementById('count-search-users');
  const countSearchClubs = document.getElementById('count-search-clubs');
  const countSearchRooms = document.getElementById('count-search-rooms');

  // Room Details Modal Elements
  const modalRoomDetails = document.getElementById('modal-room-details');
  const btnCloseRoomDetailsModal = document.getElementById('btn-close-room-details-modal');
  const btnDismissRoomDetails = document.getElementById('btn-dismiss-room-details');
  const btnJoinRoomFromDetails = document.getElementById('btn-join-room-from-details');
  const btnCopyRoomDetailsUrl = document.getElementById('btn-copy-room-details-url');
  const btnOpenRoomDetailsUrl = document.getElementById('btn-open-room-details-url');
  let roomDetailsTimer = null;
  let activeViewingRoomChannel = null;
  let currentEmojiReactionOptions = null;

  // Person Profile Modal Elements
  const modalUserProfile = document.getElementById('modal-user-profile');
  const btnCloseProfileModal = document.getElementById('btn-close-profile-modal');
  const btnPmClose = document.getElementById('btn-pm-close');
  const btnPmFollow = document.getElementById('btn-pm-follow');
  const pmFollowLabel = document.getElementById('pm-follow-label');
  const pmAvatar = document.getElementById('pm-avatar');
  const pmAvatarFallback = document.getElementById('pm-avatar-fallback');
  const pmName = document.getElementById('pm-name');
  const pmUsername = document.getElementById('pm-username');
  const pmUserId = document.getElementById('pm-user-id');
  const pmFollowersCount = document.getElementById('pm-followers-count');
  const pmFollowingCount = document.getElementById('pm-following-count');
  const pmFriendsCount = document.getElementById('pm-friends-count');
  const pmClubsCount = document.getElementById('pm-clubs-count');
  const pmBio = document.getElementById('pm-bio');
  const pmCreatedDate = document.getElementById('pm-created-date');
  const pmInviterRow = document.getElementById('pm-inviter-row');
  const pmInviterAvatar = document.getElementById('pm-inviter-avatar');
  const pmInviterFallback = document.getElementById('pm-inviter-fallback');
  const pmInviterName = document.getElementById('pm-inviter-name');
  const pmInviterHandle = document.getElementById('pm-inviter-handle');
  const pmClubsSection = document.getElementById('pm-clubs-section');
  const pmClubsList = document.getElementById('pm-clubs-list');

  // Social Club (House) Modal Elements
  const modalSocialClub = document.getElementById('modal-social-club');
  const btnCloseClubModal = document.getElementById('btn-close-club-modal');
  const btnCmClose = document.getElementById('btn-cm-close');
  const btnCmAction = document.getElementById('btn-cm-action');
  const cmAvatar = document.getElementById('cm-avatar');
  const cmAvatarFallback = document.getElementById('cm-avatar-fallback');
  const cmName = document.getElementById('cm-name');
  const cmSubtitle = document.getElementById('cm-subtitle');
  const cmDesc = document.getElementById('cm-desc');

  // Badges in Member Profile
  const pmPaidPlus = document.getElementById('pm-paid-plus');
  const pmKarmaBadge = document.getElementById('pm-karma-badge');

  // House Modal Elements & Live Rooms
  const btnCmOpenMembers = document.getElementById('btn-cm-open-members');
  const cmMembersCount = document.getElementById('cm-members-count');
  const cmLiveRoomsBadge = document.getElementById('cm-live-rooms-badge');
  const cmLiveRoomsCount = document.getElementById('cm-live-rooms-count');
  const cmLiveRoomsSection = document.getElementById('cm-live-rooms-section');
  const cmLiveRoomsList = document.getElementById('cm-live-rooms-list');

  // House Members List Modal Elements
  const modalClubMembers = document.getElementById('modal-club-members');
  const cmMembersModalTitle = document.getElementById('cm-members-modal-title');
  const rateLimitOverlay = document.getElementById('rate-limit-overlay');
  const cmMembersScrollArea = document.getElementById('cm-members-scroll-area');
  const clubMembersStream = document.getElementById('club-members-stream');
  const membersLoadMore = document.getElementById('members-load-more');
  const btnLoadMoreMembers = document.getElementById('btn-load-more-members');
  const btnCloseMembersModal = document.getElementById('btn-close-members-modal');
  const btnCloseMembers = document.getElementById('btn-close-members');

  // Floating Active Room Audio Bar & Stage Viewer Modal
  const activeRoomFloatingBar = document.getElementById('active-room-floating-bar');
  const floatingRoomTitle = document.getElementById('floating-room-title');
  const floatingRoomChannel = document.getElementById('floating-room-channel');
  const btnOpenStageModal = document.getElementById('btn-open-stage-modal');
  const btnFloatingMic = document.getElementById('btn-floating-mic');
  const floatingMicIcon = document.getElementById('floating-mic-icon');
  const floatingMicLabel = document.getElementById('floating-mic-label');
  const btnFloatingLeave = document.getElementById('btn-floating-leave');
  const modalStageViewer = document.getElementById('modal-stage-viewer');
  const btnCloseStageModal = document.getElementById('btn-close-stage-modal');
  const btnDismissStageModal = document.getElementById('btn-dismiss-stage-modal');
  const modalSocialGraph = document.getElementById('modal-social-graph');
  const modalPingSpeakers = document.getElementById('modal-ping-speakers');

  // Dynamic Z-Index Manager for Stacking Modals
  let activeModalZIndex = 6000;
  function bringModalToFront(modalEl) {
    if (!modalEl) return;
    activeModalZIndex = Math.max(activeModalZIndex + 10, 6010);
    modalEl.style.zIndex = activeModalZIndex;
    modalEl.style.setProperty('z-index', String(activeModalZIndex), 'important');
    const card = modalEl.querySelector('.modal-card') ||
                 modalEl.querySelector('.modal-profile-card') ||
                 modalEl.querySelector('.modal-social-card') ||
                 modalEl.querySelector('.modal-club-card') ||
                 modalEl.querySelector('.modal-members-card') ||
                 modalEl.querySelector('.modal-photo-lightbox-card') ||
                 modalEl.querySelector('.modal-lightbox-content') ||
                 modalEl.querySelector('.modal-blocked-card') ||
                 modalEl.querySelector('.modal-mod-history-card') ||
                 modalEl.querySelector('.modal-giphy-card') ||
                 modalEl.querySelector('.modal-ping-card') ||
                 modalEl.querySelector('.modal-studio-card');
    if (card) {
      card.style.zIndex = activeModalZIndex + 1;
      card.style.setProperty('z-index', String(activeModalZIndex + 1), 'important');
    }
  }

  // Any click on an open modal or its card immediately elevates that modal to the front
  document.addEventListener('pointerdown', (e) => {
    const modalBackdrop = e.target.closest('.modal-backdrop');
    if (modalBackdrop && modalBackdrop.style.display !== 'none' && !e.target.closest('.btn-close-modal')) {
      bringModalToFront(modalBackdrop);
    }
  }, { capture: true });

  // State Variables
  let currentTheme = localStorage.getItem('powerdeck_theme') || 'dark';
  let activeDeviceId = '';
  let activeToken = '';
  let activeProfile = null;
  let isPowerDeckPremium = true; // All features fully unlocked
  let activeLicenseRecord = null;
  let isPhoneOtpSent = false;
  let activeSearchTab = 'all';
  let currentSearchResults = [];
  let searchDebounceTimer = null;
  let viewingProfileUserId = null;
  let viewingProfileLoggingContext = null;
  let isViewingProfileFollowed = false;
  let cachedBlockedUserIds = new Set();
  const cachedFollowingUserIds = new Set();
  let viewingClubId = null;
  let viewingClubStatus = null;
  let currentViewingClub = null;
  let currentViewingClubPerms = null;
  let activeClubCreatorProfileId = null;
  let activeClubMembersId = null;
  let activeClubMembersName = '';
  let clubMembersList = [];
  let clubMembersCursor = null;
  let isLoadingClubMembers = false;

  // ============================================================
  // THEME & 22-COLOR ACCENT PALETTE MANAGEMENT
  // ============================================================

  const PALETTE_DEFINITIONS = {
    purple: { name: 'Electric Purple', color: '#7C6FFF', hover: '#9287FF', pressed: '#6152E8', glow: 'rgba(124, 111, 255, 0.45)', badgeBg: 'rgba(124, 111, 255, 0.18)', badgeBorder: 'rgba(124, 111, 255, 0.45)' },
    blue: { name: 'Cyber Blue', color: '#00D2FF', hover: '#38BDF8', pressed: '#0284C7', glow: 'rgba(0, 210, 255, 0.45)', badgeBg: 'rgba(0, 210, 255, 0.18)', badgeBorder: 'rgba(0, 210, 255, 0.45)' },
    cyan: { name: 'Electric Cyan', color: '#00F0FF', hover: '#67E8F9', pressed: '#0891B2', glow: 'rgba(0, 240, 255, 0.45)', badgeBg: 'rgba(0, 240, 255, 0.18)', badgeBorder: 'rgba(0, 240, 255, 0.45)' },
    teal: { name: 'Electric Teal', color: '#06B6D4', hover: '#22D3EE', pressed: '#0891B2', glow: 'rgba(6, 182, 212, 0.45)', badgeBg: 'rgba(6, 182, 212, 0.18)', badgeBorder: 'rgba(6, 182, 212, 0.45)' },
    mint: { name: 'Mint Turquoise', color: '#2DD4BF', hover: '#5EEAD4', pressed: '#0D9488', glow: 'rgba(45, 212, 191, 0.45)', badgeBg: 'rgba(45, 212, 191, 0.18)', badgeBorder: 'rgba(45, 212, 191, 0.45)' },
    emerald: { name: 'Neon Emerald', color: '#00F5A0', hover: '#34D399', pressed: '#059669', glow: 'rgba(0, 245, 160, 0.45)', badgeBg: 'rgba(0, 245, 160, 0.18)', badgeBorder: 'rgba(0, 245, 160, 0.45)' },
    matrix: { name: 'Matrix Green', color: '#00FF66', hover: '#33FF88', pressed: '#00DD55', glow: 'rgba(0, 255, 102, 0.45)', badgeBg: 'rgba(0, 255, 102, 0.18)', badgeBorder: 'rgba(0, 255, 102, 0.45)' },
    lime: { name: 'Toxic Lime', color: '#39FF14', hover: '#5CFF3D', pressed: '#28CC00', glow: 'rgba(57, 255, 20, 0.45)', badgeBg: 'rgba(57, 255, 20, 0.18)', badgeBorder: 'rgba(57, 255, 20, 0.45)' },
    yellow: { name: 'Acid Lemon', color: '#FFE600', hover: '#FFF04D', pressed: '#D4BE00', glow: 'rgba(255, 230, 0, 0.45)', badgeBg: 'rgba(255, 230, 0, 0.18)', badgeBorder: 'rgba(255, 230, 0, 0.45)' },
    amber: { name: 'Solar Amber', color: '#FFB800', hover: '#FCD34D', pressed: '#D97706', glow: 'rgba(255, 184, 0, 0.45)', badgeBg: 'rgba(255, 184, 0, 0.18)', badgeBorder: 'rgba(255, 184, 0, 0.45)' },
    gold: { name: 'Royal Gold', color: '#FFD700', hover: '#FFE033', pressed: '#B45309', glow: 'rgba(255, 215, 0, 0.45)', badgeBg: 'rgba(255, 215, 0, 0.18)', badgeBorder: 'rgba(255, 215, 0, 0.45)' },
    peach: { name: 'Coral Peach', color: '#FB923C', hover: '#FDBA74', pressed: '#EA580C', glow: 'rgba(251, 146, 60, 0.45)', badgeBg: 'rgba(251, 146, 60, 0.18)', badgeBorder: 'rgba(251, 146, 60, 0.45)' },
    orange: { name: 'Tangerine Blaze', color: '#FF8533', hover: '#FFA15C', pressed: '#E66710', glow: 'rgba(255, 133, 51, 0.45)', badgeBg: 'rgba(255, 133, 51, 0.18)', badgeBorder: 'rgba(255, 133, 51, 0.45)' },
    sunset: { name: 'Sunset Flame', color: '#FF4D00', hover: '#FF7033', pressed: '#CC3D00', glow: 'rgba(255, 77, 0, 0.45)', badgeBg: 'rgba(255, 77, 0, 0.18)', badgeBorder: 'rgba(255, 77, 0, 0.45)' },
    ruby: { name: 'Vivid Ruby', color: '#E11D48', hover: '#F43F5E', pressed: '#BE123C', glow: 'rgba(225, 29, 72, 0.45)', badgeBg: 'rgba(225, 29, 72, 0.18)', badgeBorder: 'rgba(225, 29, 72, 0.45)' },
    crimson: { name: 'Crimson Ruby', color: '#FF1744', hover: '#FF5252', pressed: '#D50000', glow: 'rgba(255, 23, 68, 0.45)', badgeBg: 'rgba(255, 23, 68, 0.18)', badgeBorder: 'rgba(255, 23, 68, 0.45)' },
    rose: { name: 'Hot Rose', color: '#FF3366', hover: '#FB7185', pressed: '#E11D48', glow: 'rgba(255, 51, 102, 0.45)', badgeBg: 'rgba(255, 51, 102, 0.18)', badgeBorder: 'rgba(255, 51, 102, 0.45)' },
    magenta: { name: 'Neon Fuchsia', color: '#FF007F', hover: '#FF3399', pressed: '#D6006A', glow: 'rgba(255, 0, 127, 0.45)', badgeBg: 'rgba(255, 0, 127, 0.18)', badgeBorder: 'rgba(255, 0, 127, 0.45)' },
    lavender: { name: 'Lavender Mist', color: '#C084FC', hover: '#DDD6FE', pressed: '#9333EA', glow: 'rgba(192, 132, 252, 0.45)', badgeBg: 'rgba(192, 132, 252, 0.18)', badgeBorder: 'rgba(192, 132, 252, 0.45)' },
    violet: { name: 'Hyper Violet', color: '#A855F7', hover: '#C084FC', pressed: '#9333EA', glow: 'rgba(168, 85, 247, 0.45)', badgeBg: 'rgba(168, 85, 247, 0.18)', badgeBorder: 'rgba(168, 85, 247, 0.45)' },
    indigo: { name: 'Cosmic Indigo', color: '#6366F1', hover: '#818CF8', pressed: '#4F46E5', glow: 'rgba(99, 102, 241, 0.45)', badgeBg: 'rgba(99, 102, 241, 0.18)', badgeBorder: 'rgba(99, 102, 241, 0.45)' },
    platinum: { name: 'Titanium Platinum', color: '#F8FAFC', hover: '#FFFFFF', pressed: '#94A3B8', glow: 'rgba(248, 250, 252, 0.45)', badgeBg: 'rgba(248, 250, 252, 0.18)', badgeBorder: 'rgba(248, 250, 252, 0.45)' }
  };

  const VALID_COLOR_THEMES = Object.keys(PALETTE_DEFINITIONS);
  let currentColorTheme = 'purple';
  try {
    const savedColor = localStorage.getItem('powerdeck_color_theme');
    if (savedColor && VALID_COLOR_THEMES.includes(savedColor)) {
      currentColorTheme = savedColor;
    }
  } catch (_) {}

  const btnColorPickerToggle = document.getElementById('btn-color-picker-toggle');
  const activeColorDot = document.getElementById('active-color-dot');
  const activeColorName = document.getElementById('active-color-name');
  const colorPalettePopover = document.getElementById('color-palette-popover');
  const popoverColorGrid = document.getElementById('popover-color-grid');
  const btnClosePalettePopover = document.getElementById('btn-close-palette-popover');
  const btnDonePalettePopover = document.getElementById('btn-done-palette-popover');
  const colorPickerWrapper = document.getElementById('color-picker-dropdown-wrapper');

  function renderPopoverColors() {
    if (!popoverColorGrid) return;
    popoverColorGrid.innerHTML = '';

    Object.entries(PALETTE_DEFINITIONS).forEach(([key, pal]) => {
      const isSelected = key === currentColorTheme;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `palette-option-item ${isSelected ? 'is-active' : ''}`;
      btn.setAttribute('data-color', key);
      btn.title = `${pal.name} (${pal.color})`;

      btn.innerHTML = `
        <span class="palette-option-dot" style="background: ${pal.color}; box-shadow: 0 0 8px ${pal.glow};"></span>
        <div class="palette-option-info">
          <span class="palette-option-name">${pal.name}</span>
          <span class="palette-option-hex">${pal.color}</span>
        </div>
        ${isSelected ? '<span class="palette-option-check">✓</span>' : ''}
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyColorTheme(key, true);
        renderPopoverColors();
      });

      popoverColorGrid.appendChild(btn);
    });
  }

  function openColorPopover() {
    renderPopoverColors();
    if (colorPalettePopover) {
      colorPalettePopover.style.display = 'flex';
    }
    if (btnColorPickerToggle) {
      btnColorPickerToggle.classList.add('is-open');
    }
  }

  function closeColorPopover() {
    if (colorPalettePopover) {
      colorPalettePopover.style.display = 'none';
    }
    if (btnColorPickerToggle) {
      btnColorPickerToggle.classList.remove('is-open');
    }
  }

  function toggleColorPopover() {
    if (colorPalettePopover && colorPalettePopover.style.display === 'flex') {
      closeColorPopover();
    } else {
      openColorPopover();
    }
  }

  if (btnColorPickerToggle) {
    btnColorPickerToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleColorPopover();
    });
  }

  if (btnClosePalettePopover) {
    btnClosePalettePopover.addEventListener('click', (e) => {
      e.stopPropagation();
      closeColorPopover();
    });
  }

  if (btnDonePalettePopover) {
    btnDonePalettePopover.addEventListener('click', (e) => {
      e.stopPropagation();
      closeColorPopover();
    });
  }

  // Close popover when clicking anywhere outside
  document.addEventListener('click', (e) => {
    if (colorPickerWrapper && !colorPickerWrapper.contains(e.target)) {
      closeColorPopover();
    }
  });

  function applyColorTheme(color, notify = false) {
    if (!VALID_COLOR_THEMES.includes(color)) color = 'purple';
    currentColorTheme = color;
    const pal = PALETTE_DEFINITIONS[color] || PALETTE_DEFINITIONS.purple;

    document.body.setAttribute('data-color', color);
    document.documentElement.setAttribute('data-color', color);

    // Apply inline style on documentElement to guarantee 100% cascade override over any interface
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--primary', pal.color);
    rootStyle.setProperty('--primary-hover', pal.hover);
    rootStyle.setProperty('--primary-pressed', pal.pressed);
    rootStyle.setProperty('--primary-glow', pal.glow);
    rootStyle.setProperty('--badge-bg', pal.badgeBg);
    rootStyle.setProperty('--badge-border', pal.badgeBorder);
    rootStyle.setProperty('--input-focus', pal.color);

    try {
      localStorage.setItem('powerdeck_color_theme', color);
    } catch (_) {}

    // Update single-color trigger button display in top bar
    if (activeColorDot) {
      activeColorDot.style.background = pal.color;
      activeColorDot.style.boxShadow = `0 0 10px ${pal.glow}`;
    }
    if (activeColorName) {
      activeColorName.textContent = pal.name;
    }
    if (btnColorPickerToggle) {
      btnColorPickerToggle.title = `Color: ${pal.name} (${pal.color}) - Click to open 22-color studio`;
    }

    // Update popover items if rendered
    if (popoverColorGrid) {
      popoverColorGrid.querySelectorAll('.palette-option-item').forEach(item => {
        const itemCol = item.getAttribute('data-color');
        const isMatch = itemCol === color;
        item.classList.toggle('is-active', isMatch);
        let check = item.querySelector('.palette-option-check');
        if (isMatch && !check) {
          const chkSpan = document.createElement('span');
          chkSpan.className = 'palette-option-check';
          chkSpan.textContent = '✓';
          item.appendChild(chkSpan);
        } else if (!isMatch && check) {
          check.remove();
        }
      });
    }

    if (window.particleEngine && typeof window.particleEngine.setColor === 'function') {
      window.particleEngine.setColor(color);
    }

    if (notify && typeof showAlert === 'function') {
      showAlert('info', `Accent Color: ${pal.name}`);
    }
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('powerdeck_theme', theme);
    } catch (_) {}

    if (themeIcon) {
      themeIcon.textContent = (theme === 'light') ? '🌙' : '☀️';
    }
    if (themeText) {
      themeText.textContent = (theme === 'light') ? 'Dark Mode' : 'Light Mode';
    }

    if (window.particleEngine && typeof window.particleEngine.setTheme === 'function') {
      window.particleEngine.setTheme(theme, currentColorTheme);
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
  }

  applyTheme(currentTheme);
  applyColorTheme(currentColorTheme, false);

  // ============================================================
  // POWERDECK 10 MULTI-INTERFACE DESIGN SYSTEMS
  // ============================================================

  const POWERDECK_INTERFACES = [
    {
      id: 'cyberpunk',
      name: 'Cyberpunk Neon',
      icon: '⚡',
      category: 'Cyberpunk / HUD',
      defaultColor: 'cyan',
      tagline: '2077 Night City combat HUD with neon cyan, hot fuchsia and laser grid glow.',
      palette: ['#00F0FF', '#FF007F', '#00FF66', '#FFB703'],
      gradient: 'linear-gradient(90deg, #00F0FF, #FF007F, #00FF66)'
    },
    {
      id: 'aurora',
      name: 'Aurora Frost',
      icon: '❄️',
      category: 'Nordic Glassmorphism',
      defaultColor: 'emerald',
      tagline: 'Translucent Scandinavian frosted glass with emerald aurora and violet dusk ambient lights.',
      palette: ['#00F5A0', '#7C3AED', '#00D9F5', '#F43F5E'],
      gradient: 'linear-gradient(90deg, #00F5A0, #00D9F5, #7C3AED)'
    },
    {
      id: 'obsidian',
      name: 'Midnight Obsidian',
      icon: '💎',
      category: 'Stealth Luxury OLED',
      defaultColor: 'platinum',
      tagline: 'Pure black OLED stealth architecture, diamond-cut titanium borders and ice silver highlights.',
      palette: ['#F8FAFC', '#94A3B8', '#38BDF8', '#10B981'],
      gradient: 'linear-gradient(90deg, #F8FAFC, #94A3B8, #38BDF8)'
    },
    {
      id: 'vaporwave',
      name: 'Retro Vaporwave',
      icon: '🌴',
      category: '80s Synthwave Sunset',
      defaultColor: 'magenta',
      tagline: 'Retro-futuristic arcade Miami dreamscape with neon flamingo pink and dusk sunset orange.',
      palette: ['#FF388E', '#FF8533', '#00FFF0', '#FFE600'],
      gradient: 'linear-gradient(90deg, #FF388E, #FF8533, #FFE600)'
    },
    {
      id: 'matrix',
      name: 'Matrix Cyberdeck',
      icon: '💻',
      category: 'Mainframe Console',
      defaultColor: 'matrix',
      tagline: 'Phosphor terminal green matrix rain, mainframe telemetry readouts and hacker aesthetic.',
      palette: ['#00FF66', '#33FF88', '#00DD55', '#22C55E'],
      gradient: 'linear-gradient(90deg, #00FF66, #33FF88, #00DD55)'
    },
    {
      id: 'tokyo',
      name: 'Tokyo Drift',
      icon: '🏎️',
      category: 'Electric JDM Night',
      defaultColor: 'lime',
      tagline: 'High-octane Shinjuku underground racing with toxic lime, asphalt graphite and amber hazards.',
      palette: ['#39FF14', '#FFB703', '#FF0055', '#00E5FF'],
      gradient: 'linear-gradient(90deg, #39FF14, #FFB703, #FF0055)'
    },
    {
      id: 'solar',
      name: 'Solar Flare VIP',
      icon: '👑',
      category: 'Royal Champagne Gold',
      defaultColor: 'gold',
      tagline: 'Executive gold Clubhouse edition with gilded champagne radiance and velvet obsidian surfaces.',
      palette: ['#F59E0B', '#FFD700', '#B45309', '#10B981'],
      gradient: 'linear-gradient(90deg, #FFD700, #F59E0B, #B45309)'
    },
    {
      id: 'crimson',
      name: 'Crimson Dynasty',
      icon: '🩸',
      category: 'Cyber Goth Laser',
      defaultColor: 'crimson',
      tagline: 'Intense bloodline ruby lasers, dark metallic combat panels and predatory crimson backlighting.',
      palette: ['#FF1744', '#FF5252', '#D50000', '#FF8A80'],
      gradient: 'linear-gradient(90deg, #FF1744, #FF5252, #D50000)'
    },
    {
      id: 'cosmic',
      name: 'Cosmic Starlight',
      icon: '✨',
      category: 'Deep Celestial Space',
      defaultColor: 'indigo',
      tagline: 'Deep space stardust with luminous nebula indigo, galactic cyan and ethereal nebula clouds.',
      palette: ['#4361EE', '#4CC9F0', '#7209B7', '#F72585'],
      gradient: 'linear-gradient(90deg, #4361EE, #4CC9F0, #7209B7)'
    },
    {
      id: 'minimalist',
      name: 'Modern Studio',
      icon: '📐',
      category: 'Bauhaus Precision',
      defaultColor: 'blue',
      tagline: 'Ultra-clean architectural studio layout with Bauhaus slate, deep contrast and crisp azure focus.',
      palette: ['#38BDF8', '#0284C7', '#64748B', '#0EA5E9'],
      gradient: 'linear-gradient(90deg, #38BDF8, #0284C7, #64748B)'
    }
  ];

  let currentInterfaceId = 'cyberpunk';
  try {
    const saved = localStorage.getItem('powerdeck_active_interface');
    if (saved && POWERDECK_INTERFACES.some(i => i.id === saved)) {
      currentInterfaceId = saved;
    }
  } catch (_) {}

  const btnInterfaceSwitch = document.getElementById('btn-interface-switch');
  const btnInterfaceCycle = document.getElementById('btn-interface-cycle');
  const interfacePillIcon = document.getElementById('interface-pill-icon');
  const interfacePillName = document.getElementById('interface-pill-name');
  const modalInterfaceSwitcher = document.getElementById('modal-interface-switcher');
  const interfaceCardsGrid = document.getElementById('interface-cards-grid');
  const btnCloseInterfaceModal = document.getElementById('btn-close-interface-modal');
  const btnDoneInterfaceModal = document.getElementById('btn-done-interface-modal');

  function renderInterfaceCards() {
    if (!interfaceCardsGrid) return;
    interfaceCardsGrid.innerHTML = '';

    POWERDECK_INTERFACES.forEach(iface => {
      const isActive = iface.id === currentInterfaceId;
      const card = document.createElement('div');
      card.className = `interface-card ${isActive ? 'is-active' : ''}`;
      card.setAttribute('data-id', iface.id);

      const dotsHtml = iface.palette.map(color => `<span class="interface-palette-dot" style="background: ${color};"></span>`).join('');

      card.innerHTML = `
        <div class="interface-card-header-row">
          <div class="interface-card-title-group">
            <span class="interface-card-icon">${iface.icon}</span>
            <div>
              <div class="interface-card-name">${iface.name}</div>
              <div class="interface-card-category">${iface.category}</div>
            </div>
          </div>
          <span class="interface-card-status">${isActive ? 'ACTIVE ✓' : 'SELECT'}</span>
        </div>
        <p class="interface-card-tagline">${iface.tagline}</p>
        <div class="interface-card-palette-strip">
          ${dotsHtml}
          <div class="interface-palette-gradient-bar" style="background: ${iface.gradient};"></div>
        </div>
      `;

      card.addEventListener('click', () => {
        applyInterface(iface.id, true);
      });

      interfaceCardsGrid.appendChild(card);
    });
  }

  function applyInterface(interfaceId, notify = false) {
    const target = POWERDECK_INTERFACES.find(i => i.id === interfaceId) || POWERDECK_INTERFACES[0];
    currentInterfaceId = target.id;

    document.documentElement.setAttribute('data-interface', target.id);
    document.body.setAttribute('data-interface', target.id);

    try {
      localStorage.setItem('powerdeck_active_interface', target.id);
    } catch (_) {}

    if (interfacePillIcon) interfacePillIcon.textContent = target.icon;
    if (interfacePillName) interfacePillName.textContent = target.name;
    if (btnInterfaceSwitch) {
      btnInterfaceSwitch.title = `Theme: ${target.name} (${target.category}) - Click to browse all 10 interfaces`;
    }

    // Sync card statuses
    if (interfaceCardsGrid) {
      const cards = interfaceCardsGrid.querySelectorAll('.interface-card');
      cards.forEach(c => {
        const cId = c.getAttribute('data-id');
        const isSelected = cId === target.id;
        c.classList.toggle('is-active', isSelected);
        const statusSpan = c.querySelector('.interface-card-status');
        if (statusSpan) {
          statusSpan.textContent = isSelected ? 'ACTIVE ✓' : 'SELECT';
        }
      });
    }

    // Refresh particle engine color if initialized
    if (window.particleEngine && typeof window.particleEngine.setTheme === 'function') {
      window.particleEngine.setTheme(currentTheme, currentColorTheme);
    }

    if (notify) {
      if (target.defaultColor) {
        applyColorTheme(target.defaultColor, false);
      }
      if (typeof showAlert === 'function') {
        showAlert('success', `Interface visual style switched to: ${target.name}`);
      }
    }
  }

  function cycleNextInterface() {
    const currentIndex = POWERDECK_INTERFACES.findIndex(i => i.id === currentInterfaceId);
    const nextIndex = (currentIndex + 1) % POWERDECK_INTERFACES.length;
    const nextIface = POWERDECK_INTERFACES[nextIndex];
    applyInterface(nextIface.id, true);
  }

  function openInterfaceModal() {
    renderInterfaceCards();
    if (modalInterfaceSwitcher) {
      modalInterfaceSwitcher.style.display = 'flex';
    }
  }

  function closeInterfaceModal() {
    if (modalInterfaceSwitcher) {
      modalInterfaceSwitcher.style.display = 'none';
    }
  }

  if (btnInterfaceSwitch) {
    btnInterfaceSwitch.addEventListener('click', (e) => {
      e.stopPropagation();
      openInterfaceModal();
    });
  }

  if (btnInterfaceCycle) {
    btnInterfaceCycle.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleNextInterface();
    });
  }

  if (btnCloseInterfaceModal) {
    btnCloseInterfaceModal.addEventListener('click', closeInterfaceModal);
  }

  if (btnDoneInterfaceModal) {
    btnDoneInterfaceModal.addEventListener('click', closeInterfaceModal);
  }

  if (modalInterfaceSwitcher) {
    modalInterfaceSwitcher.addEventListener('click', (e) => {
      if (e.target === modalInterfaceSwitcher) {
        closeInterfaceModal();
      }
    });
  }

  // Hotkey: Alt + I to cycle next interface
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      cycleNextInterface();
    } else if (e.key === 'Escape') {
      if (modalInterfaceSwitcher && modalInterfaceSwitcher.style.display === 'flex') {
        closeInterfaceModal();
      }
      closeColorPopover();
    }
  });

  // Initial apply of the saved/default interface
  applyInterface(currentInterfaceId, false);
  // Re-apply saved/chosen color theme so it overrides with highest inline priority
  applyColorTheme(currentColorTheme, false);

  // ============================================================
  // WINDOW CONTROLS
  // ============================================================

  btnMinimize.addEventListener('click', () => window.powerdeckAPI.minimizeWindow());
  btnMaximize.addEventListener('click', async () => {
    const isMax = await window.powerdeckAPI.toggleMaximizeWindow();
    btnMaximize.textContent = isMax ? '❐' : '▢';
  });
  btnClose.addEventListener('click', async () => {
    try {
      isIntentionalAgoraDisconnect = true;
      if (currentActiveRoom) {
        try { await leaveActiveRoom(); } catch (_) {}
      }
      if (agoraLocalAudioTrack) {
        try { agoraLocalAudioTrack.close(); } catch (_) {}
        agoraLocalAudioTrack = null;
      }
      if (agoraClient) {
        const oldClient = agoraClient;
        agoraClient = null;
        try {
          await Promise.race([
            oldClient.leave(),
            new Promise(res => setTimeout(res, 250))
          ]);
        } catch (_) {}
      }
    } finally {
      if (window.powerdeckAPI && window.powerdeckAPI.closeWindow) {
        window.powerdeckAPI.closeWindow();
      } else {
        window.close();
      }
    }
  });

  window.addEventListener('beforeunload', () => {
    isIntentionalAgoraDisconnect = true;
    try {
      if (agoraLocalAudioTrack) {
        try { agoraLocalAudioTrack.close(); } catch (_) {}
      }
      if (agoraClient) {
        try { agoraClient.leave(); } catch (_) {}
      }
      if (currentActiveRoom && currentActiveRoom.channel) {
        try { window.powerdeckAPI.leaveChannel(currentActiveRoom.channel); } catch (_) {}
      }
    } catch (_) {}
  });

  window.powerdeckAPI.onWindowStateChanged(({ isMaximized }) => {
    btnMaximize.textContent = isMaximized ? '❐' : '▢';
  });

  // ============================================================
  // DEVICE ID MANAGEMENT
  // ============================================================

  async function refreshDeviceId() {
    activeDeviceId = await window.powerdeckAPI.getDeviceId();
    headerDeviceId.textContent = activeDeviceId.substring(0, 16) + '...';
    headerDeviceId.title = activeDeviceId;
    phonePanelDeviceId.textContent = activeDeviceId;
    phonePanelDeviceId.title = activeDeviceId;
  }

  await refreshDeviceId();

  // Run Startup Loading Screen for 5 seconds every time
  const startupSplashScreen = document.getElementById('startup-splash-screen');
  const startupStatusText = document.getElementById('startup-status-text');
  const startupLoaderBar = document.getElementById('startup-loader-bar');
  if (startupSplashScreen) {
    const startupTotalDuration = 5000;
    const startupStartTime = Date.now();
    const startupInterval = setInterval(() => {
      const elapsed = Date.now() - startupStartTime;
      const progress = Math.min(100, (elapsed / startupTotalDuration) * 100);
      const remainingSec = Math.max(1, Math.ceil((startupTotalDuration - elapsed) / 1000));

      if (startupLoaderBar) {
        startupLoaderBar.style.animation = 'none';
        startupLoaderBar.style.width = `${progress}%`;
      }

      if (startupStatusText) {
        const dotCount = (Math.floor(elapsed / 450) % 3) + 1;
        startupStatusText.textContent = `Starting Powerdeck Pro${'.'.repeat(dotCount)}`;
      }

      if (elapsed >= startupTotalDuration) {
        clearInterval(startupInterval);
        if (startupLoaderBar) startupLoaderBar.style.width = '100%';
        if (startupStatusText) startupStatusText.textContent = 'Starting Powerdeck Pro...';
        setTimeout(() => {
          startupSplashScreen.classList.add('fade-out');
          setTimeout(() => {
            startupSplashScreen.style.display = 'none';
          }, 550);
        }, 150);
      }
    }, 50);
  }

  btnRegenDeviceId.addEventListener('click', async () => {
    if (isPhoneOtpSent) {
      const confirmChange = confirm("Warning: Generating a new Device ID will reset your active OTP session. Continue?");
      if (!confirmChange) return;
    }
    activeDeviceId = await window.powerdeckAPI.generateNewDeviceId();
    headerDeviceId.textContent = activeDeviceId.substring(0, 16) + '...';
    phonePanelDeviceId.textContent = activeDeviceId;
    resetPhoneOtpFlow();
    showAlert('info', 'New hardware Device ID generated.');
    setAppStatus('New Device ID generated');
  });

  deviceChip.addEventListener('click', async () => {
    await window.powerdeckAPI.copyToClipboard(activeDeviceId);
    const oldText = headerDeviceId.textContent;
    headerDeviceId.textContent = 'COPIED!';
    setTimeout(() => { headerDeviceId.textContent = oldText; }, 1200);
  });

  // ============================================================
  // 3 MODE NAVIGATION BUTTONS
  // ============================================================

  function switchMode(mode) {
    Object.keys(modeButtons).forEach(m => {
      modeButtons[m].classList.toggle('active', m === mode);
      panels[m].classList.toggle('active', m === mode);
    });
    hideAlert();
  }

  modeButtons.phone.addEventListener('click', () => switchMode('phone'));
  modeButtons.password.addEventListener('click', () => switchMode('password'));
  modeButtons.token.addEventListener('click', () => switchMode('token'));

  // ============================================================
  // TOKEN PREVIEW BOX CONTROLLER
  // ============================================================

  function setPreviewToken(token, source = 'Auth') {
    activeToken = token;
    tokenPreviewInput.value = token;
    btnCopyPreviewToken.disabled = false;
    tokenPreviewCard.classList.add('has-token');
    tokenStatusBadge.textContent = `✓ Active (${token.length}c)`;
    tokenStatusBadge.classList.add('active');
  }

  btnCopyPreviewToken.addEventListener('click', async () => {
    if (activeToken) {
      await window.powerdeckAPI.copyToClipboard(activeToken);
      const originalText = btnCopyPreviewToken.textContent;
      btnCopyPreviewToken.textContent = '✓ Copied!';
      setTimeout(() => { btnCopyPreviewToken.textContent = originalText; }, 1500);
    }
  });

  btnMaskPreviewToken.addEventListener('click', () => {
    if (tokenPreviewInput.type === 'password') {
      tokenPreviewInput.type = 'text';
      btnMaskPreviewToken.textContent = '🔒';
    } else {
      tokenPreviewInput.type = 'password';
      btnMaskPreviewToken.textContent = '👁️';
    }
  });

  // ============================================================
  // ALERTS & STATUS
  // ============================================================

  function showAlert(type, message) {
    alertBox.className = `alert-box ${type}`;
    alertBox.style.display = 'flex';

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    alertIcon.textContent = icons[type] || 'ℹ️';
    alertMessage.textContent = message;
  }

  function hideAlert() {
    alertBox.style.display = 'none';
  }

  // Floating Success Message Popup for Profile & House modifications
  function showSuccessFloatPopup(message, duration = 3600) {
    if (!message) return;
    let container = document.getElementById('float-success-popup-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'float-success-popup-container';
      container.className = 'float-success-popup-container';
      document.body.appendChild(container);
    }

    const popup = document.createElement('div');
    popup.className = 'float-success-popup';
    popup.innerHTML = `
      <div class="float-success-popup-icon">✓</div>
      <div class="float-success-popup-text">${escapeHtml(message)}</div>
      <button type="button" class="float-success-popup-close" title="Dismiss">✕</button>
    `;

    const closeBtn = popup.querySelector('.float-success-popup-close');
    let isRemoved = false;
    const removePopup = () => {
      if (isRemoved) return;
      isRemoved = true;
      popup.classList.add('is-leaving');
      setTimeout(() => {
        if (popup.parentElement) {
          popup.parentElement.removeChild(popup);
        }
      }, 300);
    };

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePopup();
      });
    }

    container.appendChild(popup);
    setTimeout(removePopup, duration);
  }

  // Custom Asynchronous Input Prompt Modal (replaces window.prompt which is not supported in Electron)
  function showInputPrompt({ title = 'Input', label = 'Enter value:', defaultValue = '', placeholder = '', confirmText = 'Save' } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-prompt-dialog');
      const titleEl = document.getElementById('prompt-dialog-title');
      const labelEl = document.getElementById('prompt-dialog-label');
      const inputEl = document.getElementById('prompt-dialog-input');
      const btnConfirm = document.getElementById('btn-confirm-prompt-dialog');
      const btnCancel = document.getElementById('btn-cancel-prompt-dialog');
      const btnClose = document.getElementById('btn-close-prompt-dialog');

      if (!modal || !inputEl) {
        resolve(null);
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (labelEl) labelEl.textContent = label;
      if (btnConfirm) btnConfirm.textContent = confirmText;
      inputEl.value = defaultValue || '';
      inputEl.placeholder = placeholder || '';

      modal.style.display = 'flex';
      bringModalToFront(modal);
      modal.scrollTop = 0;
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 50);

      let isResolved = false;
      const finish = (result) => {
        if (isResolved) return;
        isResolved = true;
        modal.style.display = 'none';
        btnConfirm.onclick = null;
        btnCancel.onclick = null;
        if (btnClose) btnClose.onclick = null;
        inputEl.onkeydown = null;
        resolve(result);
      };

      btnConfirm.onclick = () => {
        finish(inputEl.value);
      };

      btnCancel.onclick = () => {
        finish(null);
      };

      if (btnClose) {
        btnClose.onclick = () => {
          finish(null);
        };
      }

      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(inputEl.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      };
    });
  }

  function setAppStatus(text) {
    // Suppress transient status spam (microphone live, feed updated, agora connects)
    if (appStatusText) {
      appStatusText.textContent = 'PowerDeck Pro System Ready';
    }
  }

  function setButtonLoading(button, isLoading, originalLabel) {
    const spinner = button.querySelector('.btn-spinner');
    const label = button.querySelector('.btn-label');
    if (isLoading) {
      button.disabled = true;
      if (spinner) spinner.style.display = 'inline-block';
      if (label) label.textContent = ' Processing...';
    } else {
      button.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (label) label.textContent = originalLabel;
    }
  }

  // ============================================================
  // AUTO-RESUME PROFILE & DIRECT TO HOME PAGE ON EVERY RESTART
  // ============================================================

  async function checkExistingProfile() {
    try {
      const res = await window.powerdeckAPI.checkExistingProfile();
      if (res && res.exists && res.data) {
        const token = res.data.token || (res.data.tokens && res.data.tokens.auth);
        if (token) {
          activeProfile = res.data;
          activeToken = token;
          activeDeviceId = res.data.deviceId || activeDeviceId;
          refreshDeviceId();
          setPreviewToken(activeToken, 'Saved Session');
          transitionToHome(res.data, res.path);
          setAppStatus(`Session active for @${(res.data.user && res.data.user.username) || 'user'} • Agora Ready`);

          // Call /api/me to extract authentic user ID & profile settings into headers
          if (window.powerdeckAPI && window.powerdeckAPI.me) {
            window.powerdeckAPI.me().then(async (meRes) => {
              if (meRes && meRes.success && meRes.data && meRes.data.user_profile) {
                const freshUp = meRes.data.user_profile;
                if (activeProfile) {
                  activeProfile.userId = freshUp.user_id;
                  if (!activeProfile.user) activeProfile.user = {};
                  Object.assign(activeProfile.user, freshUp);
                  if (activeProfile._debug && activeProfile._debug.user_profile) {
                    Object.assign(activeProfile._debug.user_profile, freshUp);
                  }
                  if (freshUp.share_url) {
                    activeProfile.user.share_url = freshUp.share_url;
                    if (activeProfile._debug && activeProfile._debug.user_profile) {
                      activeProfile._debug.user_profile.share_url = freshUp.share_url;
                    }
                  }
                }
                updateProfileStudioUI(freshUp);
                updateTopAnonButtonVisibility();
              }

              // Auto-join Agora channel if user was already on a channel or active room detected on open
              const activeCh = (meRes && meRes.data && (meRes.data.channel || meRes.data.active_channel || meRes.data.channel_id)) ||
                               localStorage.getItem('powerdeck_active_channel');
              if (activeCh && !currentActiveRoom) {
                const chId = typeof activeCh === 'string' ? activeCh.trim() : (activeCh.channel || activeCh.channel_id);
                if (chId) {
                  console.log(`[Startup Auto-Join] Active channel detected on startup: ${chId}. Joining Agora audio...`);
                  setAppStatus(`Auto-joining channel ${chId} • Agora Audio connecting...`);
                  try {
                    await joinChannelById(chId);
                  } catch (joinErr) {
                    console.warn("[Startup Auto-Join] Notice:", joinErr.message);
                    localStorage.removeItem('powerdeck_active_channel');
                  }
                }
              }
            }).catch(err => console.warn("Initial /api/me call:", err));
          }

          // Pre-fetch blocked users to populate blocked IDs cache
          if (window.powerdeckAPI && window.powerdeckAPI.getBlockedUsers) {
            window.powerdeckAPI.getBlockedUsers().then(blkRes => {
              const raw = (blkRes && blkRes.data) ? blkRes.data : blkRes;
              const users = (blkRes && Array.isArray(blkRes.users)) ? blkRes.users :
                            (raw && Array.isArray(raw.users)) ? raw.users :
                            (raw && Array.isArray(raw.blocked_users)) ? raw.blocked_users :
                            (Array.isArray(raw) ? raw : []);
              users.forEach(u => {
                if (u && u.user_id) cachedBlockedUserIds.add(Number(u.user_id));
              });
            }).catch(err => console.warn("Initial getBlockedUsers call:", err));
          }

          // Pre-fetch following users to populate following IDs cache
          preloadMyFollowingIds();

          return true;
        }
      }
    } catch (e) {
      console.error("Error reading existing profile:", e);
    }

    // No existing profile.json found -> show the login view
    viewLogin.classList.add('active');
    return false;
  }

  // ============================================================
  // AUTH 1: PHONE NUMBER LOGIN (OTP WITH SYNCED DEVICE ID)
  // ============================================================

  function resetPhoneOtpFlow() {
    isPhoneOtpSent = false;
    otpSection.style.opacity = '0.5';
    otpSection.style.pointerEvents = 'none';
    inputOtpCode.value = '';
    phonePanelLockStatus.textContent = '🔓 Ready';
    headerLockBadge.textContent = '🔓';
  }

  btnSendOtp.addEventListener('click', async () => {
    const phone = inputPhoneNumber.value.trim();
    if (!phone) {
      showAlert('warning', 'Please enter a valid phone number with country code (e.g. +919876543210).');
      inputPhoneNumber.focus();
      return;
    }

    setButtonLoading(btnSendOtp, true, 'Send Otp');
    hideAlert();
    setAppStatus('Sending verification code with Clubhouse API...');

    try {
      const res = await window.powerdeckAPI.startPhoneAuth(phone, activeDeviceId);
      setButtonLoading(btnSendOtp, false, 'Send Otp');

      if (res.success) {
        isPhoneOtpSent = true;
        otpSection.style.opacity = '1';
        otpSection.style.pointerEvents = 'auto';
        inputOtpCode.focus();

        phonePanelLockStatus.textContent = '🔒 Locked for Auth Pair';
        headerLockBadge.textContent = '🔒';

        showAlert('success', `✓ Verification code sent! Status: ${res.status}. Enter the OTP code below.`);
        setAppStatus('OTP sent. Enter code to verify.');
      } else {
        showAlert('error', res.error || 'Failed to start phone verification.');
        setAppStatus('Verification request failed');
      }
    } catch (err) {
      setButtonLoading(btnSendOtp, false, 'Send Otp');
      showAlert('error', 'Network error: ' + err.message);
      setAppStatus('Network error');
    }
  });

  inputPhoneNumber.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSendOtp.click();
  });

  btnVerifyOtp.addEventListener('click', async () => {
    const phone = inputPhoneNumber.value.trim();
    const otp = inputOtpCode.value.trim();

    if (!otp) {
      showAlert('warning', 'Please enter the SMS verification OTP code.');
      inputOtpCode.focus();
      return;
    }

    setButtonLoading(btnVerifyOtp, true, '✓ 2. Verify OTP & Complete Login');
    hideAlert();
    setAppStatus('Verifying OTP with bound hardware Device ID...');

    try {
      const res = await window.powerdeckAPI.verifyOtp(phone, otp, activeDeviceId);
      setButtonLoading(btnVerifyOtp, false, '✓ 2. Verify OTP & Complete Login');

      if (res.success && res.token) {
        setPreviewToken(res.token, 'OTP Auth');
        showAlert('success', '✓ Login successful! Welcome back.');
        setAppStatus('Authentication successful • Transitioning to Home...');

        setTimeout(() => {
          transitionToHome(res.profile, res.savedPath);
        }, 600);
      } else {
        showAlert('error', res.error || 'Verification code failed. Please check OTP.');
        setAppStatus('OTP verification failed');
      }
    } catch (err) {
      setButtonLoading(btnVerifyOtp, false, '✓ 2. Verify OTP & Complete Login');
      showAlert('error', 'Network error: ' + err.message);
      setAppStatus('Network error');
    }
  });

  inputOtpCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnVerifyOtp.click();
  });

  // ============================================================
  // AUTH 2: PASSWORD LOGIN
  // ============================================================

  btnTogglePassVisibility.addEventListener('click', () => {
    if (inputPassPassword.type === 'password') {
      inputPassPassword.type = 'text';
      btnTogglePassVisibility.textContent = '🔒';
    } else {
      inputPassPassword.type = 'password';
      btnTogglePassVisibility.textContent = '👁️';
    }
  });

  btnPasswordLogin.addEventListener('click', async () => {
    const phone = inputPassPhone.value.trim();
    const password = inputPassPassword.value;

    if (!phone || !password) {
      showAlert('warning', 'Please provide both phone number and password.');
      return;
    }

    setButtonLoading(btnPasswordLogin, true, '🔐 Log In via Password');
    hideAlert();
    setAppStatus('Authenticating with Clubhouse servers...');

    try {
      const res = await window.powerdeckAPI.passwordAuth(phone, password, activeDeviceId);
      setButtonLoading(btnPasswordLogin, false, '🔐 Log In via Password');

      if (res.success && res.token) {
        setPreviewToken(res.token, 'Password Auth');
        showAlert('success', '✓ Password login successful! Welcome back.');
        setAppStatus('Authentication successful • Transitioning to Home...');

        setTimeout(() => {
          transitionToHome(res.profile, res.savedPath);
        }, 600);
      } else {
        showAlert('error', res.error || 'Password login failed. Check credentials.');
        setAppStatus('Password authentication failed');
      }
    } catch (err) {
      setButtonLoading(btnPasswordLogin, false, '🔐 Log In via Password');
      showAlert('error', 'Network error: ' + err.message);
      setAppStatus('Network error');
    }
  });

  inputPassPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnPasswordLogin.click();
  });

  // ============================================================
  // AUTH 3: TOKEN DIRECT LOGIN
  // ============================================================

  btnToggleTokenVisibility.addEventListener('click', () => {
    if (inputTokenDirect.type === 'password') {
      inputTokenDirect.type = 'text';
      btnToggleTokenVisibility.textContent = '🔒';
    } else {
      inputTokenDirect.type = 'password';
      btnToggleTokenVisibility.textContent = '👁️';
    }
  });

  btnTokenLogin.addEventListener('click', async () => {
    const token = inputTokenDirect.value.trim();
    if (!token) {
      showAlert('warning', 'Please paste an active Clubhouse auth token.');
      inputTokenDirect.focus();
      return;
    }

    setButtonLoading(btnTokenLogin, true, '🚀 Log In with Token');
    hideAlert();
    setAppStatus('Verifying token and synthesizing profile...');

    try {
      const res = await window.powerdeckAPI.tokenAuth(token, activeDeviceId);
      setButtonLoading(btnTokenLogin, false, '🚀 Log In with Token');

      if (res.success && res.token) {
        setPreviewToken(res.token, 'Direct Token');
        showAlert('success', '✓ Token verified! Welcome back.');
        setAppStatus('Token login successful • Transitioning to Home...');

        setTimeout(() => {
          transitionToHome(res.profile, res.savedPath);
        }, 600);
      } else {
        showAlert('error', res.error || 'Token verification failed. Please check token validity.');
        setAppStatus('Token verification failed');
      }
    } catch (err) {
      setButtonLoading(btnTokenLogin, false, '🚀 Log In with Token');
      showAlert('error', 'Network error: ' + err.message);
      setAppStatus('Network error');
    }
  });

  inputTokenDirect.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnTokenLogin.click();
  });

  // ============================================================
  // TRANSITION TO HOME VIEW (STEP 1 COMPLETED)
  // ============================================================

  function transitionToHome(profileData, savedPath) {
    activeProfile = profileData;
    const uid = String(profileData.userId || (profileData.user && profileData.user.user_id) || '').trim();
    checkAppLicenseStatus(uid).catch(() => {});
    startLicenseAutoCheck();
    const user = profileData.user || {};
    const debug = profileData._debug || {};
    const userProf = debug.user_profile || user;

    console.log("[Renderer] transitionToHome: Booting to Home View for user", userProf.username || user.username);

    // Switch views FIRST to guarantee Home page is displayed immediately
    viewLogin.classList.remove('active');
    viewHome.classList.add('active');

    // Populate user profile info safely
    if (homeUserName) homeUserName.textContent = userProf.name || user.name || 'PowerDeck User';
    if (homeUserHandle) homeUserHandle.textContent = `@${userProf.username || user.username || 'username'}`;
    if (homeUserId) homeUserId.textContent = userProf.user_id || user.user_id || profileData.userId || 'N/A';
    if (homeUserFollowing) homeUserFollowing.textContent = debug.num_preselect_follows != null ? debug.num_preselect_follows : '0';

    const isPaid = !!(
      userProf.is_paid_user === true ||
      userProf.is_paid === true ||
      userProf.is_subscribed === true ||
      userProf.is_plus === true ||
      userProf.has_plus === true ||
      userProf.is_paid_member === true ||
      user.is_paid_user === true ||
      user.is_paid === true ||
      profileData.is_paid_user === true ||
      profileData.is_paid === true
    );
    const homePaidPlus = document.getElementById('home-paid-plus');
    if (homePaidPlus) homePaidPlus.style.display = isPaid ? 'inline-flex' : 'none';

    if (user.photo_url || userProf.photo_url) {
      if (homeAvatar) {
        homeAvatar.src = user.photo_url || userProf.photo_url;
        homeAvatar.style.display = 'block';
      }
      if (homeAvatarFallback) homeAvatarFallback.style.display = 'none';
    } else {
      if (homeAvatar) homeAvatar.style.display = 'none';
      if (homeAvatarFallback) homeAvatarFallback.style.display = 'flex';
    }

    // Initialize Step 2: Hallway & Audio Stage
    try {
      initHallwayEngine(userProf);
    } catch (err) {
      console.warn("Hallway engine init:", err);
    }

    try {
      updateTopAnonButtonVisibility();
    } catch (e) {
      console.warn("Anon button visibility init:", e);
    }

    setAppStatus(`Logged in as @${userProf.username || 'user'} • Agora Audio Engine Live`);
  }

  // ============================================================
  // STEP 2: CLUBHOUSE HALLWAY & AGORA AUDIO STAGE ENGINE
  // ============================================================

  let liveRooms = [];
  let currentActiveRoom = null;
  let isMicMuted = true;
  let isHandRaised = false;
  let currentFilter = 'all';
  let currentSearchQuery = '';
  let currentFeedPage = 1;
  let isLoadingFeed = false;
  let detectedDirectChannelId = null;
  let detectedProfileUsername = null;
  let detectedHouseSlug = null;
  let detectedSocialClubObj = null;

  // Real-time loop timers & channel flags
  let channelPollTimer = null;
  let activePingTimer = null;
  let chatPollTimer = null;
  let isChatPanelOpen = false;
  let isFirstChatLoad = true;
  let unreadChatCount = 0;
  let activeModTargetUser = null;
  let isCurrentUserSpeaker = false;
  let isCurrentUserModerator = false;

  // Real Agora Audio & PubNub Client References
  let agoraClient = null;
  let agoraLocalAudioTrack = null;
  let currentAgoraChannel = null;
  let pubnubClient = null;
  const unmutedSpeakerUids = new Set();
  let agoraMutedUids = new Set();

  function isSpeakerUnmuted(userId) {
    if (!userId) return false;
    const uidStr = String(userId).trim();
    const myId = String(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '').trim();
    if (myId && uidStr === myId) {
      return !isMicMuted;
    }
    if (agoraMutedUids.has(uidStr)) {
      return false;
    }
    if (typeof agoraClient !== 'undefined' && agoraClient && Array.isArray(agoraClient.remoteUsers)) {
      const rUser = agoraClient.remoteUsers.find(u => String(u.uid) === uidStr);
      if (rUser) {
        if (!rUser.hasAudio) return false;
        if (rUser.audioTrack && (rUser.audioTrack.isMuted || rUser.audioTrack.muted)) return false;
      }
    }
    if (currentActiveRoom && Array.isArray(currentActiveRoom.speakers)) {
      const spk = currentActiveRoom.speakers.find(s => String(s.userId || s.user_id || s.id) === uidStr);
      if (spk && typeof spk.isMuted === 'boolean') {
        if (spk.isMuted && !unmutedSpeakerUids.has(uidStr)) {
          return false;
        }
      }
    }
    return unmutedSpeakerUids.has(uidStr);
  }

  function isSpeakerMuted(userId) {
    return !isSpeakerUnmuted(userId);
  }

  function isAnonymousUser(u) {
    if (!u) return false;
    if (u.is_anonymous_user === true || u.isAnonymousUser === true) {
      return true;
    }
    const name = (u.name || u.first_name || u.username || '').trim().toLowerCase();
    const hasPhoto = Boolean(u.photo || u.photo_url);
    if (!hasPhoto && (name === 'anon' || name === 'anonymous')) {
      return true;
    }
    return false;
  }

  function getAnonymousUserEmoji(u) {
    if (!u) return '🕶️';
    return u.anonymous_user_emoji || u.anonymousUserEmoji || '🕶️';
  }

  // Official Clubhouse channel reactions mapping
  const CLUBHOUSE_OFFICIAL_REACTIONS = [
    { id: 34, emoji: "❤️" },
    { id: 35, emoji: "😂" },
    { id: 36, emoji: "👍" },
    { id: 37, emoji: "🙌" },
    { id: 38, emoji: "👏" },
    { id: 39, emoji: "💯" },
    { id: 40, emoji: "🔥" },
    { id: 41, emoji: "🌶️" },
    { id: 42, emoji: "😢" },
    { id: 43, emoji: "👀" },
    { id: 44, emoji: "🥳" },
    { id: 45, emoji: "💀" },
    { id: 46, emoji: "👎" },
    { id: 47, emoji: "🙄" },
    { id: 48, emoji: "❌" },
    { id: 49, emoji: "😡" }
  ];

  const EMOJI_TO_REACTION_ID = {
    '❤️': 34, '❤': 34,
    '😂': 35,
    '👍': 36,
    '🙌': 37,
    '👏': 38,
    '💯': 39,
    '🔥': 40,
    '🌶️': 41, '🌶': 41,
    '😢': 42,
    '👀': 43,
    '🥳': 44,
    '💀': 45,
    '👎': 46,
    '🙄': 47,
    '❌': 48,
    '😡': 49
  };

  const REACTION_ID_TO_EMOJI = {
    34: '❤️', 35: '😂', 36: '👍', 37: '🙌', 38: '👏', 39: '💯',
    40: '🔥', 41: '🌶️', 42: '😢', 43: '👀', 44: '🥳', 45: '💀',
    46: '👎', 47: '🙄', 48: '❌', 49: '😡',
    1: '👏', 2: '🔥', 3: '😂', 4: '🎉', 5: '🙌'
  };

  // Screen-wide channel floating reaction stream (Clubhouse live stream reactions)
  function triggerFloatingReaction(emoji = '❤️', fromName = null) {
    if (!emoji) emoji = '❤️';
    const cleanEmoji = String(emoji).trim() || '❤️';
    const container = document.getElementById('floating-reactions-container');
    const targetParent = (container && container.offsetParent !== null) ? container : document.body;
    const isFixed = targetParent === document.body;

    const burstCount = Math.floor(Math.random() * 2) + 2; // 2-3 emojis per reaction
    for (let i = 0; i < burstCount; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'floating-emoji';

        if (fromName && i === 0) {
          el.innerHTML = `<span>${escapeHtml(cleanEmoji)}</span><span class="floating-emoji-author">${escapeHtml(fromName)}</span>`;
        } else {
          el.textContent = cleanEmoji;
        }

        if (isFixed) {
          el.style.position = 'fixed';
          el.style.bottom = '85px';
          el.style.zIndex = '99999';
        }

        const randomLeft = Math.floor(Math.random() * 66) + 17;
        el.style.left = `${randomLeft}%`;

        const randomRot = Math.floor(Math.random() * 28) - 14;
        el.style.transform = `rotate(${randomRot}deg)`;

        targetParent.appendChild(el);
        setTimeout(() => {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }, 2600);
      }, i * 140);
    }
  }
  let currentAgoraVolume = 100;
  let currentAgoraMicVolume = 100;
  let cachedAudioOutputDevice = 'default';

  let hasFetchedInitialChannelMessages = false;

  // In-memory caches for real-time performance & call indicators
  const profileCache = new Map();
  const speakerCallStatusMap = new Map();
  const channelMessagesStore = new Map();
  let totalRoomMessagesCount = 0;
  let openCreateRoomModal = null;
  const roomActivityHistory = [];
  const raisedHandUserIds = new Set();
  const speakingStateCache = new Map();
  const speakerMuteVisualCache = new Map();
  let isIntentionalAgoraDisconnect = false;
  let isShowingAllListeners = false;
  let channelPreviewUpdateTimer = null;

  function updateChatCountPill(count) {
    const pill = document.getElementById('chat-count-pill');
    if (!pill) return;
    if (typeof count === 'number' && count > 0) {
      pill.textContent = count.toLocaleString();
      pill.style.display = 'inline-flex';
    } else {
      pill.style.display = 'none';
    }
  }

  function updateDockHandraiseCount() {
    const badge = document.getElementById('dock-hand-count');
    if (!badge) return;
    const count = raisedHandUserIds.size;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  function updateUserHandRaisedBadge(userId, isRaised) {
    if (!userId) return;
    const uid = String(userId);
    const tiles = document.querySelectorAll(`.speaker-tile[data-user-id="${uid}"], .listener-tile[data-user-id="${uid}"]`);
    tiles.forEach(tile => {
      const wrap = tile.querySelector('.speaker-avatar-wrap, .listener-avatar-wrap');
      if (!wrap) return;
      const existingBadge = wrap.querySelector('.hand-raised-badge');
      if (isRaised) {
        if (!existingBadge) {
          const badge = document.createElement('span');
          badge.className = 'hand-raised-badge';
          badge.title = 'Raised Hand to Speak ✋';
          badge.textContent = '✋';
          wrap.appendChild(badge);
        }
      } else {
        if (existingBadge) {
          existingBadge.remove();
        }
      }
    });
  }

  async function refreshHandraiseQueue(channelId) {
    if (!channelId || !window.powerdeckAPI?.getHandraiseQueue) return;
    try {
      const res = await window.powerdeckAPI.getHandraiseQueue(channelId);
      if (res && res.success && res.data) {
        const queue = Array.isArray(res.data.handraises) ? res.data.handraises :
                      (Array.isArray(res.data.users) ? res.data.users :
                      (Array.isArray(res.data.items) ? res.data.items : []));
        raisedHandUserIds.clear();
        queue.forEach(item => {
          const uId = item.user_profile_id || item.user_id || (item.user_profile && item.user_profile.user_id);
          if (uId) raisedHandUserIds.add(String(uId));
        });
        updateDockHandraiseCount();
        document.querySelectorAll('.listener-tile, .speaker-tile').forEach(tile => {
          const uId = tile.getAttribute('data-user-id');
          if (uId) {
            updateUserHandRaisedBadge(uId, raisedHandUserIds.has(String(uId)));
          }
        });
      }
    } catch (e) {
      console.warn('[Handraise Queue] Fetch error:', e);
    }
  }

  function updateSpeakerCallStatusBadge(userId, isOnCall) {
    if (!userId) return;
    const uid = String(userId).trim();
    if (isOnCall) {
      speakerCallStatusMap.set(uid, true);
    } else {
      speakerCallStatusMap.delete(uid);
    }

    if (currentActiveRoom) {
      const all = [
        ...(Array.isArray(currentActiveRoom.speakers) ? currentActiveRoom.speakers : []),
        ...(Array.isArray(currentActiveRoom.listeners) ? currentActiveRoom.listeners : []),
        ...(Array.isArray(currentActiveRoom.users) ? currentActiveRoom.users : [])
      ];
      all.forEach(u => {
        if (String(u.userId || u.user_id || u.id) === uid) {
          u.isOnCall = isOnCall;
          u.is_on_call = isOnCall;
          u.is_on_phone_call = isOnCall;
        }
      });
    }

    findUserTile(uid);
    const tiles = document.querySelectorAll(`[data-user-id="${uid}"]`);
    tiles.forEach(tile => {
      const wrap = tile.querySelector('.speaker-avatar-wrap, .listener-avatar-wrap, .speaker-avatar, .listener-avatar') || tile;
      if (!wrap) return;
      const existingBadge = wrap.querySelector('.avatar-phone-call-badge');
      if (isOnCall) {
        if (!existingBadge) {
          const badge = document.createElement('div');
          badge.className = 'avatar-phone-call-badge';
          badge.title = 'On a phone call';
          badge.textContent = '📞';
          wrap.appendChild(badge);
        }
      } else {
        if (existingBadge) {
          existingBadge.remove();
        }
      }
    });
  }

  async function getProfileCached(userId) {
    if (!userId) return null;
    const uid = String(userId);
    if (profileCache.has(uid)) {
      return profileCache.get(uid);
    }
    const myId = String(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '');
    if (uid === myId) {
      const myU = getLoggedInUser() || (activeProfile && activeProfile.user) || {};
      const prof = {
        user_id: uid,
        name: myU.name || myU.displayname || 'You',
        username: myU.username || '',
        photo_url: myU.photo_url || ''
      };
      profileCache.set(uid, prof);
      return prof;
    }
    if (currentActiveRoom) {
      const roomUsers = [
        ...(Array.isArray(currentActiveRoom.users) ? currentActiveRoom.users : []),
        ...(Array.isArray(currentActiveRoom.speakers) ? currentActiveRoom.speakers : [])
      ];
      const found = roomUsers.find(ru => String(ru.user_id || ru.userId) === uid);
      if (found && (found.name || found.displayname)) {
        const prof = {
          user_id: uid,
          name: found.name || found.displayname || '',
          username: found.username || '',
          photo_url: found.photo_url || found.photo || ''
        };
        profileCache.set(uid, prof);
        return prof;
      }
    }
    try {
      const res = await window.powerdeckAPI.getProfile(Number(uid));
      const userProf = (res && res.user_profile) || (res && res.data && res.data.user_profile) || res;
      if (userProf && (userProf.name || userProf.displayname || userProf.username)) {
        const prof = {
          user_id: uid,
          name: userProf.name || userProf.displayname || `@${userProf.username}`,
          username: userProf.username || '',
          photo_url: userProf.photo_url || ''
        };
        profileCache.set(uid, prof);
        return prof;
      }
    } catch (e) {
      console.warn("getProfileCached fetch error for user:", uid, e);
    }
    return null;
  }

  function updateVolumeBadgeUI(val) {
    const num = Math.round(Number(val)) || 0;
    const badge = document.getElementById('val-audio-volume');
    if (!badge) return;
    if (num > 100) {
      badge.textContent = `${num}% (Boost ⚡)`;
      badge.className = 'audio-volume-badge badge-boosted';
    } else if (num === 0) {
      badge.textContent = `0% (Muted)`;
      badge.className = 'audio-volume-badge badge-muted';
    } else {
      badge.textContent = `${num}%`;
      badge.className = 'audio-volume-badge';
    }
  }

  function updateMicVolumeBadgeUI(val) {
    const num = Math.round(Number(val)) || 0;
    const badge = document.getElementById('val-mic-volume');
    if (!badge) return;
    if (num > 100) {
      badge.textContent = `${num}% (Boost ⚡)`;
      badge.className = 'audio-volume-badge badge-boosted';
    } else if (num === 0) {
      badge.textContent = `0% (Muted)`;
      badge.className = 'audio-volume-badge badge-muted';
    } else {
      badge.textContent = `${num}%`;
      badge.className = 'audio-volume-badge';
    }
  }

  let isRemoteAudioMuted = false;
  let audioPrefsSaveTimeout = null;

  function persistAudioPrefsDebounced() {
    clearTimeout(audioPrefsSaveTimeout);
    audioPrefsSaveTimeout = setTimeout(async () => {
      try {
        const selectAudioInput = document.getElementById('select-audio-input');
        const selectAudioOutput = document.getElementById('select-audio-output');
        const checkSpatialAudio = document.getElementById('check-spatial-audio');
        const prefs = {
          inputDeviceId: selectAudioInput ? selectAudioInput.value : 'default',
          outputDeviceId: selectAudioOutput ? selectAudioOutput.value : 'default',
          audioQuality: 'Music Mode',
          spatialAudio: checkSpatialAudio ? checkSpatialAudio.checked : false,
          volume: currentAgoraVolume,
          micVolume: currentAgoraMicVolume
        };
        if (window.powerdeckAPI && window.powerdeckAPI.saveAudioPrefs) {
          await window.powerdeckAPI.saveAudioPrefs(prefs);
        }
      } catch (e) {
        console.warn("Auto-saving audio preferences failed:", e);
      }
    }, 400);
  }

  function toggleMuteRemoteAudio(forceState) {
    if (typeof forceState === 'boolean') {
      isRemoteAudioMuted = forceState;
    } else {
      isRemoteAudioMuted = !isRemoteAudioMuted;
    }

    const checkMuteRemote = document.getElementById('check-mute-remote-audio');
    if (checkMuteRemote) {
      checkMuteRemote.checked = isRemoteAudioMuted;
    }

    const stageVolIcon = document.getElementById('stage-vol-icon');
    if (stageVolIcon) {
      stageVolIcon.textContent = isRemoteAudioMuted ? '🔇' : '🔊';
    }

    applyAgoraVolume(currentAgoraVolume);

    showAlert(
      isRemoteAudioMuted ? 'warning' : 'success',
      isRemoteAudioMuted ? '🔇 Room audio muted (Ctrl + X)' : '🔊 Room audio unmuted'
    );
  }
  window.toggleMuteRemoteAudio = toggleMuteRemoteAudio;

  function applyAgoraVolume(volumeLevel) {
    const vol = Math.max(0, Math.min(250, Number(volumeLevel) !== undefined && !isNaN(Number(volumeLevel)) ? Number(volumeLevel) : 100));
    currentAgoraVolume = vol;

    // Sync badges & inputs
    updateVolumeBadgeUI(vol);
    const sliderAudioVolume = document.getElementById('slider-audio-volume');
    if (sliderAudioVolume && Number(sliderAudioVolume.value) !== vol) {
      sliderAudioVolume.value = vol;
    }
    const stageVolSlider = document.getElementById('stage-volume-slider');
    const stageVolPct = document.getElementById('stage-volume-pct');
    if (stageVolSlider && Number(stageVolSlider.value) !== vol) {
      stageVolSlider.value = vol;
    }
    if (stageVolPct) {
      stageVolPct.textContent = isRemoteAudioMuted ? 'Muted' : `${vol}%`;
    }

    const effectiveVol = isRemoteAudioMuted ? 0 : vol;

    // 1. Set volume on all Agora remote tracks (0 to 250 with amplification boost support)
    if (agoraClient && Array.isArray(agoraClient.remoteUsers)) {
      agoraClient.remoteUsers.forEach(u => {
        if (u.audioTrack) {
          try {
            if (isRemoteAudioMuted) {
              if (typeof u.audioTrack.setVolume === 'function') {
                u.audioTrack.setVolume(0);
              }
            } else if (effectiveVol > 100 && typeof u.audioTrack.setAmplifiedVolume === 'function') {
              u.audioTrack.setAmplifiedVolume(effectiveVol);
            } else if (typeof u.audioTrack.setVolume === 'function') {
              u.audioTrack.setVolume(effectiveVol);
            }
          } catch (err) {
            console.warn(`[Agora] Error setting volume for remote user ${u.uid}:`, err);
          }
        }
      });
    }

    // 2. Set volume & mute on standalone HTML5 audio elements
    const normVol = isRemoteAudioMuted ? 0 : (effectiveVol <= 100 ? Math.max(0, Math.min(1, effectiveVol / 100)) : 1);
    document.querySelectorAll('audio, video').forEach(el => {
      try {
        el.muted = isRemoteAudioMuted;
        el.volume = normVol;
      } catch (_) {}
    });
  }

  function applyAgoraMicVolume(volumeLevel) {
    const vol = Math.max(0, Math.min(250, Number(volumeLevel) !== undefined && !isNaN(Number(volumeLevel)) ? Number(volumeLevel) : 100));
    currentAgoraMicVolume = vol;

    // Sync badge & slider
    updateMicVolumeBadgeUI(vol);
    const sliderMicVolume = document.getElementById('slider-mic-volume');
    if (sliderMicVolume && Number(sliderMicVolume.value) !== vol) {
      sliderMicVolume.value = vol;
    }

    if (agoraLocalAudioTrack && typeof agoraLocalAudioTrack.setVolume === 'function') {
      try {
        agoraLocalAudioTrack.setVolume(vol);
        console.log(`[Agora] Applied local mic volume & boost: ${vol}%`);
      } catch (err) {
        console.warn("[Agora] Error setting local mic volume:", err);
      }
    }
  }

  // ============================================================
  // WINDOWS VPS RTC & AUDIO KEEP-ALIVE WATCHDOG
  // ============================================================
  let vpsAudioKeepAliveContext = null;
  let vpsAudioKeepAliveNode = null;
  let vpsWatchdogTimer = null;
  let isVpsWatchdogRunning = false;

  function ensureVpsAudioContextResumed() {
    try {
      if (vpsAudioKeepAliveContext && vpsAudioKeepAliveContext.state === 'suspended') {
        vpsAudioKeepAliveContext.resume().catch(() => {});
      }
      if (micFxAudioContext && micFxAudioContext.state === 'suspended') {
        micFxAudioContext.resume().catch(() => {});
      }
      if (window.AgoraRTC && typeof window.AgoraRTC.resumeAudioContext === 'function') {
        window.AgoraRTC.resumeAudioContext().catch(() => {});
      }
    } catch (_) {}
  }

  function startVpsAudioKeepAlive() {
    if (vpsAudioKeepAliveContext) {
      ensureVpsAudioContextResumed();
      return;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      vpsAudioKeepAliveContext = new AudioCtx({ latencyHint: 'interactive' });

      // Create an imperceptible silent oscillator (0.000001 gain) to keep the Windows audio pipe permanently open
      const osc = vpsAudioKeepAliveContext.createOscillator();
      const gain = vpsAudioKeepAliveContext.createGain();
      gain.gain.value = 0.000001; // Imperceptible silence
      osc.connect(gain);
      gain.connect(vpsAudioKeepAliveContext.destination);
      osc.start();
      vpsAudioKeepAliveNode = osc;

      vpsAudioKeepAliveContext.onstatechange = () => {
        if (vpsAudioKeepAliveContext.state === 'suspended' || vpsAudioKeepAliveContext.state === 'interrupted') {
          console.log("[VPS Audio KeepAlive] AudioContext suspended, auto-resuming for Windows VPS...");
          vpsAudioKeepAliveContext.resume().catch(() => {});
        }
      };

      console.log("[VPS Audio KeepAlive] Web Audio keepalive pipeline active (prevents audio freeze on RDP minimize/disconnect)");
    } catch (e) {
      console.warn("[VPS Audio KeepAlive] Initialization notice:", e.message);
    }
  }

  // Resume all remote users' audio elements if Windows RDP muted or interrupted playback
  function restoreRemoteAudioPlayback() {
    if (!agoraClient) return;
    try {
      if (Array.isArray(agoraClient.remoteUsers)) {
        agoraClient.remoteUsers.forEach(u => {
          if (u.audioTrack && !u.audioTrack.isPlaying) {
            try {
              u.audioTrack.play();
            } catch (_) {}
          }
        });
      }
    } catch (_) {}
  }

  // Auto-detect persistent sound cards on Windows VPS to prevent detachment on RDP disconnect
  async function resolveOptimalAudioInputDeviceId(userChosenDeviceId = null) {
    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        return userChosenDeviceId && userChosenDeviceId !== 'default' ? userChosenDeviceId : undefined;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
      if (!audioInputs.length) return undefined;

      // 1. If user explicitly chose a specific device in Settings, use it
      if (userChosenDeviceId && userChosenDeviceId !== 'default') {
        const found = audioInputs.find(d => d.deviceId === userChosenDeviceId);
        if (found) return found.deviceId;
      }

      // 2. Windows VPS Optimization: Check for persistent virtual audio sound cards
      // (VB-Audio Virtual Cable, CABLE Output, Voicemeeter, Stereo Mix, Virtual Audio)
      // These drivers on the VPS NEVER disconnect when RDP is closed with 'X'!
      const persistentKeywords = ['cable', 'vb-audio', 'voicemeeter', 'stereo mix', 'virtual', 'line in'];
      const persistentDev = audioInputs.find(d => {
        const lbl = (d.label || '').toLowerCase();
        const isRemote = lbl.includes('remote audio') || lbl.includes('remote desktop');
        return !isRemote && persistentKeywords.some(kw => lbl.includes(kw));
      });
      if (persistentDev) {
        console.log(`[VPS Audio] Auto-binding to persistent audio device on VPS: "${persistentDev.label}" (${persistentDev.deviceId})`);
        return persistentDev.deviceId;
      }

      // 3. Fallback: Any non-Remote audio device
      const localDev = audioInputs.find(d => {
        const lbl = (d.label || '').toLowerCase();
        return !lbl.includes('remote audio') && !lbl.includes('remote desktop') && d.deviceId !== 'default';
      });
      if (localDev) {
        return localDev.deviceId;
      }

      return userChosenDeviceId && userChosenDeviceId !== 'default' ? userChosenDeviceId : undefined;
    } catch (e) {
      return userChosenDeviceId && userChosenDeviceId !== 'default' ? userChosenDeviceId : undefined;
    }
  }

  let isRecoveringMic = false;
  let isVirtualMicFallback = false;
  let vpsVirtualMicDestination = null;
  let vpsVirtualMicOsc = null;

  function createVpsVirtualMicTrack() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!vpsAudioKeepAliveContext && AudioCtx) {
        startVpsAudioKeepAlive();
      }
      const ctx = vpsAudioKeepAliveContext || (AudioCtx ? new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' }) : null);
      if (!ctx) return null;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (!vpsVirtualMicDestination) {
        vpsVirtualMicDestination = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.00001; // Ultra-low inaudible carrier keeps WebRTC active
        osc.connect(gain);
        gain.connect(vpsVirtualMicDestination);
        osc.start();
        vpsVirtualMicOsc = osc;
      }
      const stream = vpsVirtualMicDestination.stream;
      const tracks = stream ? stream.getAudioTracks() : [];
      return tracks && tracks.length ? tracks[0] : null;
    } catch (e) {
      console.warn("[VPS Audio] createVpsVirtualMicTrack error:", e);
      return null;
    }
  }

  async function recoverMicrophoneIfSpeaker(force = false) {
    if (isRecoveringMic) return;
    if (!isCurrentUserSpeaker || !agoraClient || agoraClient.connectionState !== 'CONNECTED') return;

    // Check if the current microphone track is healthy and live
    let isTrackLive = false;
    let rawTrack = null;
    try {
      rawTrack = agoraLocalAudioTrack && typeof agoraLocalAudioTrack.getMediaStreamTrack === 'function' && agoraLocalAudioTrack.getMediaStreamTrack();
      isTrackLive = Boolean(agoraLocalAudioTrack && rawTrack && rawTrack.readyState === 'live');
    } catch (_) {
      isTrackLive = false;
    }

    // If the track is already live and healthy and not on virtual fallback, NEVER interrupt or recreate it!
    if (isTrackLive && !isVirtualMicFallback && !force) {
      return;
    }

    let needsRecovery = false;
    if (!agoraLocalAudioTrack || !isTrackLive) {
      needsRecovery = true;
    } else if (isVirtualMicFallback) {
      // If currently running on virtual mic fallback, check if real mic device has become available (e.g. RDP reconnected)
      try {
        if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
          const devList = await navigator.mediaDevices.enumerateDevices();
          const hasRealInputs = devList.some(d => d.kind === 'audioinput' && d.deviceId);
          if (hasRealInputs) {
            needsRecovery = true;
            console.log("[VPS Audio] Real audio input device detected while on fallback. Upgrading to real microphone...");
          }
        }
      } catch (_) {}
    } else if (force && !isTrackLive) {
      needsRecovery = true;
    }

    if (!needsRecovery) return;

    isRecoveringMic = true;
    console.log("[VPS Audio] Restoring detached microphone stream...");

    try {
      await publishLocalMicrophone(false);
      console.log(`[VPS Audio] Microphone session successfully restored! isVirtualFallback: ${isVirtualMicFallback}`);
    } catch (err) {
      console.warn("[VPS Audio] Microphone recovery notice (device might be offline):", err.message);
    } finally {
      isRecoveringMic = false;
    }
  }

  let isFastRtcReconnecting = false;
  let fastRtcReconnectTimer = null;
  let fastRtcLastTriggerTime = 0;
  let fastRtcForceVirtualMic = false;

  async function triggerFastVpsRtcReconnect(triggerReason = 'RDP close', forceVirtualMic = false) {
    const now = Date.now();
    if (now - fastRtcLastTriggerTime < 300) return;
    fastRtcLastTriggerTime = now;

    if (!currentActiveRoom || !currentActiveRoom.channel || isLeavingActiveRoom || isIntentionalAgoraDisconnect) return;

    if (fastRtcReconnectTimer) {
      clearTimeout(fastRtcReconnectTimer);
      fastRtcReconnectTimer = null;
    }

    if (forceVirtualMic) {
      fastRtcForceVirtualMic = true;
    }

    isFastRtcReconnecting = true;
    console.log(`[VPS Fast RTC Reconnect] ${triggerReason} detected! Auto-disconnecting stalled RTC and reconnecting with fast loop (<1s)...`);
    setAppStatus(`VPS Session changed: Auto-reconnecting RTC (<1s)...`);

    // 1. Immediately disconnect old stalled RTC session (with 200ms safety timeout)
    try {
      await disconnectAgoraAudio(false);
    } catch (e) {
      console.warn("[VPS Fast RTC Reconnect] Quick disconnect notice:", e.message);
    }

    // 2. Fast sub-second reconnection loop
    let loopAttempt = 0;
    const maxLoopAttempts = 10;

    async function executeFastConnectLoop() {
      if (!currentActiveRoom || !currentActiveRoom.channel || isLeavingActiveRoom || isIntentionalAgoraDisconnect) {
        isFastRtcReconnecting = false;
        fastRtcForceVirtualMic = false;
        return;
      }

      loopAttempt++;
      console.log(`[VPS Fast RTC Reconnect] Loop #${loopAttempt}: Reconnecting Agora RTC immediately...`);

      try {
        await connectAgoraAudio(currentActiveRoom.channel, currentActiveRoom, true);
        if (agoraClient && agoraClient.connectionState === 'CONNECTED') {
          console.log(`[VPS Fast RTC Reconnect] Connected successfully in loop #${loopAttempt} within sub-second!`);
          isFastRtcReconnecting = false;
          fastRtcForceVirtualMic = false;
          if (fastRtcReconnectTimer) {
            clearTimeout(fastRtcReconnectTimer);
            fastRtcReconnectTimer = null;
          }
          return;
        }
      } catch (loopErr) {
        console.warn(`[VPS Fast RTC Reconnect] Loop #${loopAttempt} notice:`, loopErr.message);
      }

      if (loopAttempt < maxLoopAttempts && currentActiveRoom && !isLeavingActiveRoom && !isIntentionalAgoraDisconnect) {
        fastRtcReconnectTimer = setTimeout(executeFastConnectLoop, 350);
      } else {
        isFastRtcReconnecting = false;
        fastRtcForceVirtualMic = false;
      }
    }

    // Start loop immediately (0ms delay!)
    executeFastConnectLoop();
  }

  function attachLocalMicTrackWatchdog(localTrack) {
    if (!localTrack) return;
    const triggerRecovery = () => {
      console.log("[VPS Audio] Microphone hardware detached (RDP disconnect or device unplugged). Triggering fast RTC reconnect loop (<1s)...");
      triggerFastVpsRtcReconnect("RDP close / Microphone detached", true);
    };

    try {
      localTrack.on("track-ended", triggerRecovery);
    } catch (_) {}

    try {
      const raw = typeof localTrack.getMediaStreamTrack === 'function' && localTrack.getMediaStreamTrack();
      if (raw) {
        raw.onended = triggerRecovery;
      }
    } catch (_) {}
  }

  function initVpsRtcWatchdog() {
    if (isVpsWatchdogRunning) return;
    isVpsWatchdogRunning = true;

    startVpsAudioKeepAlive();

    // Re-verify on document visibility / focus / device change (e.g. Remote Audio attach/detach on VPS)
    // NEVER disconnect or recreate active microphone when minimizing or maximizing!
    document.addEventListener('visibilitychange', () => {
      ensureVpsAudioContextResumed();
      recoverMicrophoneIfSpeaker(false);
      restoreRemoteAudioPlayback();
    });
    window.addEventListener('blur', () => {
      ensureVpsAudioContextResumed();
    });
    window.addEventListener('focus', () => {
      ensureVpsAudioContextResumed();
      recoverMicrophoneIfSpeaker(false);
      restoreRemoteAudioPlayback();
    });

    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        console.log("[VPS RTC Watchdog] Device change detected on Windows VPS. Verifying audio pipelines...");
        ensureVpsAudioContextResumed();
        if (currentActiveRoom && currentActiveRoom.channel && !isLeavingActiveRoom && !isIntentionalAgoraDisconnect) {
          if (!agoraClient || agoraClient.connectionState === 'DISCONNECTED') {
            triggerFastVpsRtcReconnect("Device change while disconnected", false);
          } else {
            recoverMicrophoneIfSpeaker(false);
          }
        }
        restoreRemoteAudioPlayback();
      });
    }

    if (window.AgoraRTC) {
      try {
        window.AgoraRTC.onAudioAutoplayFailed = () => {
          console.log("[Agora VPS] Audio autoplay notice -> auto-resuming AudioContext & playback");
          ensureVpsAudioContextResumed();
          restoreRemoteAudioPlayback();
        };
      } catch (_) {}
    }

    // Recurring 1.5-second watchdog heartbeat for non-stop RTC operation on Windows VPS
    if (vpsWatchdogTimer) clearInterval(vpsWatchdogTimer);
    vpsWatchdogTimer = setInterval(async () => {
      ensureVpsAudioContextResumed();

      // Check if room is active but Agora unexpectedly disconnected or stalled
      if (currentActiveRoom && currentActiveRoom.channel && !isIntentionalAgoraDisconnect && !isLeavingActiveRoom) {
        if (!agoraClient || agoraClient.connectionState === 'DISCONNECTED') {
          console.warn("[VPS RTC Watchdog] Active room detected but Agora RTC is disconnected. Triggering fast reconnect loop...");
          triggerFastVpsRtcReconnect("Watchdog detected DISCONNECTED", false);
          return;
        }

        if (agoraClient.connectionState === 'RECONNECTING' && !isFastRtcReconnecting) {
          console.warn("[VPS RTC Watchdog] Agora RTC stalled in RECONNECTING on Windows VPS. Bypassing stall...");
          triggerFastVpsRtcReconnect("Watchdog detected RECONNECTING stall", false);
          return;
        }

        // Active speaker microphone check & upgrade from virtual fallback
        if (isCurrentUserSpeaker && agoraClient.connectionState === 'CONNECTED') {
          const rawTrack = agoraLocalAudioTrack && typeof agoraLocalAudioTrack.getMediaStreamTrack === 'function' && agoraLocalAudioTrack.getMediaStreamTrack();
          const isTrackEnded = !agoraLocalAudioTrack || (rawTrack && rawTrack.readyState === 'ended');
          if (isTrackEnded) {
            console.warn("[VPS RTC Watchdog] Active speaker track ended. Triggering fast reconnect...");
            triggerFastVpsRtcReconnect("Active speaker track detached", true);
            return;
          } else if (isVirtualMicFallback) {
            try {
              if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
                const devs = await navigator.mediaDevices.enumerateDevices();
                const hasRealDev = devs.some(d => {
                  const lbl = (d.label || '').toLowerCase();
                  return d.kind === 'audioinput' && d.deviceId && !lbl.includes('remote audio') && !lbl.includes('remote desktop');
                });
                if (hasRealDev) {
                  console.log("[VPS RTC Watchdog] Real audio input device detected while on fallback. Upgrading to real mic...");
                  recoverMicrophoneIfSpeaker(true);
                }
              }
            } catch (_) {}
          }
        }
        restoreRemoteAudioPlayback();
      }
    }, 1500);
  }

  // ============================================================
  // AGORA AUDIO ENGINE (Studio-Quality Music Mode Stereo 48kHz)
  // ============================================================

  function applyAgoraStereoParameters() {
    if (!window.AgoraRTC || typeof window.AgoraRTC.setParameter !== 'function') return;
    const params = [
      '{"che.audio.stereo.capture":true}',
      '{"che.audio.stereo.playback":true}',
      '{"che.audio.force.stereo":true}',
      '{"che.audio.playback.channels":2}',
      '{"che.audio.fullband.enable":true}',
      '{"che.audio.bitrate":192000}',
      '{"che.audio.custom_bitrate":192000}',
      '{"che.audio.max_bitrate":256000}',
      '{"che.audio.enable.hq_tx":true}',
      '{"che.audio.enable.hq_rx":false}', // Scale downlink dynamically to prevent packet choke on 100-1000 speakers
      '{"che.audio.neteq.enable":true}',   // WebRTC NetEQ jitter buffer to prevent audio dropouts
      '{"che.audio.neteq.max_delay":1000}',
      '{"che.audio.downlink.quality.smooth":true}',
      '{"che.audio.profile":5}',
      '{"che.audio.scenario":3}',
      '{"che.audio.enable.aec":false}',
      '{"che.audio.enable.ns":false}',
      '{"che.audio.enable.agc":false}',
      '{"che.audio.agc.enable":false}',
      '{"che.audio.agc2.enable":false}',
      '{"che.audio.smartvolume.enable":false}',
      '{"che.audio.volumecomp.enable":false}',
      '{"che.audio.force.disable_agc":true}',
      '{"che.audio.autogain.enable":false}',
      '{"che.audio.volume_control.enable":true}',
      '{"che.audio.ignore_remote_volume":false}',
      '{"che.audio.ducking.enable":false}',
      '{"che.audio.autovolume.enable":false}',
      '{"che.audio.windows.control_volume":true}',
      '{"che.audio.windows.ducking.disable":true}',
      '{"che.audio.enable.hpf":false}',
      '{"che.audio.tx_highpass_filter":false}',
      '{"che.audio.rx_highpass_filter":false}',
      '{"che.audio.tx_lowpass_filter":false}',
      '{"che.audio.rx_lowpass_filter":false}',
      '{"che.audio.enable.limiter":false}',
      '{"rtc.cloud_proxy":3}',
      '{"rtc.enable_web_socket":true}',
      '{"che.audio.keep_alive":true}',
      '{"che.audio.tcp.enable":true}',
      '{"che.audio.vps.mode":true}'
    ];
    for (const p of params) {
      try {
        window.AgoraRTC.setParameter(p);
      } catch (e) {
        // ignore
      }
    }
  }

  async function connectAgoraAudio(channelName, channelData, forceReconnect = false) {
    if (!window.AgoraRTC) {
      console.warn("[Agora] AgoraRTC Web SDK not loaded");
      return;
    }

    const agoraAppId = (activeProfile && activeProfile.agoraKey) || "938de3e8055e42b281bb8c6f69c21f78";
    // Ensure real authentic channel ID from Clubhouse response (e.g. "P03VoKnm") is used for Agora
    const realChannel = (channelData && channelData.channel && String(channelData.channel).trim()) ||
                        (channelData && channelData.data && channelData.data.channel && String(channelData.data.channel).trim()) ||
                        channelName;

    // Only skip connection if already truly healthy and CONNECTED and NOT forcing reconnect
    if (!forceReconnect && agoraClient && agoraClient.connectionState === 'CONNECTED' && currentAgoraChannel === realChannel) {
      console.log(`[Agora] Already connected to channel ${realChannel}, keeping RTC WebSocket intact.`);
      return;
    }

    try {
      await disconnectAgoraAudio(false);
      isIntentionalAgoraDisconnect = false;

      // Apply low-latency stereo parameters & disable AGC volume adjustments
      applyAgoraStereoParameters();
      const myUserId = (channelData && (channelData.user_profile_id || (channelData.data && channelData.data.user_profile_id))) || getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '577813458';
      const numericUid = Number(myUserId);
      const rtcToken = (channelData && (channelData.token || (channelData.data && channelData.data.token) || channelData.rtm_token)) || null;

      console.log(`[Agora] Initializing client for channel: ${realChannel}, AppId: ${agoraAppId.substring(0, 8)}...`);

      agoraClient = window.AgoraRTC.createClient({ mode: "live", codec: "vp8" });

      // Enable Cloud Proxy Mode 3 (WebSocket over TLS / TCP 443) for Windows VPS & restricted network resilience
      let isCloudProxyActive = false;
      try {
        if (typeof agoraClient.startProxyServer === 'function') {
          agoraClient.startProxyServer(3);
          isCloudProxyActive = true;
          console.log("[Agora VPS] Cloud Proxy Mode 3 (WebSocket/TLS 443) initialized for robust Windows VPS RTC");
        }
      } catch (proxyErr) {
        console.warn("[Agora VPS] Cloud proxy initialization notice:", proxyErr.message);
      }

      // Enable volume indicator to drive speaker green halos and sync unmuted speaking with high-concurrency throttling
      try {
        agoraClient.enableAudioVolumeIndicator();
        agoraClient.on("volume-indicator", (volumes) => {
          if (!currentActiveRoom || !volumes || !volumes.length) return;
          const myId = String(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '').trim();
          for (let i = 0; i < volumes.length; i++) {
            const vol = volumes[i];
            const uId = String(vol.uid);
            const isSpeaking = vol.level > 10;
            const isSelf = uId === '0' || (myId && uId === myId);
            if (isSpeaking) {
              if (!unmutedSpeakerUids.has(uId)) {
                unmutedSpeakerUids.add(uId);
                agoraMutedUids.delete(uId);
                updateSpeakerMuteVisuals(uId, false);
              }
            }
            updateUserSpeakingIndicator(uId, isSpeaking);
          }
        });
      } catch (e) {
        console.warn("[Agora] Volume indicator error:", e);
      }

      // Pre-cache audio volume & output device preference in memory to avoid IPC bottlenecks during remote user bursts
      let cachedAudioOutputDevice = 'default';
      try {
        const prefsRes = await window.powerdeckAPI.getAudioPrefs();
        if (prefsRes && prefsRes.success && prefsRes.prefs) {
          if (typeof prefsRes.prefs.volume === 'number') currentAgoraVolume = prefsRes.prefs.volume;
          if (typeof prefsRes.prefs.micVolume === 'number') currentAgoraMicVolume = prefsRes.prefs.micVolume;
          if (prefsRes.prefs.outputDeviceId) cachedAudioOutputDevice = prefsRes.prefs.outputDeviceId;
        }
      } catch (e) {}

      // Subscribe and auto-play remote speakers audio safely with track-limit resilience
      agoraClient.on("user-published", async (user, mediaType) => {
        if (!user || !user.uid) return;
        const uidStr = String(user.uid);
        // Note: Do not mark user as unmuted here. Clubhouse speakers publish audio tracks even when muted.
        // They will be marked unmuted when they actively speak (volume-indicator) or unmute (user-unmute-audio).
        try {
          if (!agoraClient || agoraClient.connectionState === "DISCONNECTED") return;
          await agoraClient.subscribe(user, mediaType);
          if (mediaType === "audio" && user.audioTrack) {
            try {
              user.audioTrack.play();
            } catch (playErr) {
              console.warn(`[Agora] Audio play notice for ${uidStr}:`, playErr.message);
            }
            if (typeof user.audioTrack.setVolume === 'function') {
              try {
                if (currentAgoraVolume > 100 && typeof user.audioTrack.setAmplifiedVolume === 'function') {
                  user.audioTrack.setAmplifiedVolume(currentAgoraVolume);
                } else {
                  user.audioTrack.setVolume(currentAgoraVolume);
                }
              } catch (_) {}
            }
            if (currentAgoraVolume <= 100) {
              const norm = Math.max(0, Math.min(1, currentAgoraVolume / 100));
              document.querySelectorAll('audio, video').forEach(el => {
                try { el.volume = norm; } catch (_) {}
              });
            }
            if (cachedAudioOutputDevice && cachedAudioOutputDevice !== 'default') {
              if (typeof user.audioTrack.setPlaybackDevice === 'function') {
                try { await user.audioTrack.setPlaybackDevice(cachedAudioOutputDevice); } catch (_) {}
              }
            }
          }
        } catch (subErr) {
          console.warn(`[Agora] Subscribe notice for user ${uidStr}:`, subErr.message);
        }
      });

      agoraClient.on("user-unpublished", (user, mediaType) => {
        if (!user || !user.uid) return;
        const uidStr = String(user.uid);
        if (mediaType === "audio") {
          unmutedSpeakerUids.delete(uidStr);
          agoraMutedUids.add(uidStr);
          updateSpeakerMuteVisuals(uidStr, true);
          updateUserSpeakingIndicator(uidStr, false);
        }
      });

      agoraClient.on("user-mute-audio", (user) => {
        if (!user || !user.uid) return;
        const uidStr = String(user.uid);
        unmutedSpeakerUids.delete(uidStr);
        agoraMutedUids.add(uidStr);
        updateSpeakerMuteVisuals(uidStr, true);
        updateUserSpeakingIndicator(uidStr, false);
      });

      agoraClient.on("user-unmute-audio", (user) => {
        if (!user || !user.uid) return;
        const uidStr = String(user.uid);
        unmutedSpeakerUids.add(uidStr);
        agoraMutedUids.delete(uidStr);
        updateSpeakerMuteVisuals(uidStr, false);
      });

      agoraClient.on("user-left", (user) => {
        if (!user || !user.uid) return;
        const uidStr = String(user.uid);
        unmutedSpeakerUids.delete(uidStr);
        agoraMutedUids.delete(uidStr);
        updateSpeakerMuteVisuals(uidStr, true);
        updateUserSpeakingIndicator(uidStr, false);
      });

      // Automatic Connection State Management & Recovery
      let reconnectingStallTimer = null;
      agoraClient.on("connection-state-change", (curState, revState, reason) => {
        console.log(`[Agora Connection State] ${revState} -> ${curState} (reason: ${reason})`);
        if (curState === "CONNECTED") {
          setAppStatus(`Agora Audio Connected: Studio Stereo Music Streaming 48kHz (${role.toUpperCase()})`);
          ensureVpsAudioContextResumed();
          if (reconnectingStallTimer) {
            clearTimeout(reconnectingStallTimer);
            reconnectingStallTimer = null;
          }
        } else if (curState === "RECONNECTING") {
          setAppStatus(`Agora Audio Reconnecting (Fast recovery loop)...`);
          // If stuck in RECONNECTING on Windows VPS for >1.2s, bypass the stall immediately
          if (!reconnectingStallTimer && !isIntentionalAgoraDisconnect && currentActiveRoom && currentActiveRoom.channel && !isLeavingActiveRoom) {
            reconnectingStallTimer = setTimeout(() => {
              reconnectingStallTimer = null;
              if (agoraClient && agoraClient.connectionState === "RECONNECTING") {
                console.warn("[Agora VPS] RECONNECTING stalled (>1.2s). Triggering fast reconnect loop...");
                triggerFastVpsRtcReconnect("Agora RECONNECTING stall bypassed", false);
              }
            }, 1200);
          }
        } else if (curState === "DISCONNECTED") {
          if (reconnectingStallTimer) {
            clearTimeout(reconnectingStallTimer);
            reconnectingStallTimer = null;
          }
          if (!isIntentionalAgoraDisconnect && currentActiveRoom && currentActiveRoom.channel && !isLeavingActiveRoom && reason !== "LEAVE") {
            console.warn(`[Agora VPS] Unexpected disconnection in active room (reason: ${reason}). Auto-reconnecting RTC with fast loop...`);
            triggerFastVpsRtcReconnect(`Agora DISCONNECTED (${reason})`, false);
          }
        }
      });

      // Keep RTC engine running non-stop 24/7 on Windows VPS during long room sessions
      agoraClient.on("token-privilege-will-expire", async () => {
        console.log("[Agora VPS] RTC Token privilege will expire soon, renewing in background...");
        try {
          if (currentActiveRoom && currentActiveRoom.channel) {
            const res = await window.powerdeckAPI.getChannel(currentActiveRoom.channel);
            const chData = (res && res.data && (res.data.channel || res.data)) ? (res.data.channel || res.data) : (res && res.data);
            const freshToken = chData && (chData.token || chData.rtm_token);
            if (freshToken && agoraClient) {
              await agoraClient.renewToken(freshToken);
              console.log("[Agora VPS] RTC Token renewed successfully. RTC engine continuing uninterrupted.");
            }
          }
        } catch (renewErr) {
          console.warn("[Agora VPS] Token renewal notice:", renewErr.message);
        }
      });

      agoraClient.on("token-privilege-did-expire", async () => {
        console.warn("[Agora VPS] RTC Token expired! Re-fetching token and resuming RTC engine...");
        try {
          if (currentActiveRoom && currentActiveRoom.channel) {
            const res = await window.powerdeckAPI.getChannel(currentActiveRoom.channel);
            const chData = (res && res.data && (res.data.channel || res.data)) ? (res.data.channel || res.data) : (res && res.data);
            const freshToken = chData && (chData.token || chData.rtm_token);
            if (freshToken && agoraClient) {
              await agoraClient.renewToken(freshToken);
              console.log("[Agora VPS] RTC Token refreshed after expiry.");
            } else {
              connectAgoraAudio(currentActiveRoom.channel, currentActiveRoom);
            }
          }
        } catch (err) {
          console.warn("[Agora VPS] Token expiry recovery notice:", err.message);
          if (currentActiveRoom && currentActiveRoom.channel) {
            connectAgoraAudio(currentActiveRoom.channel, currentActiveRoom);
          }
        }
      });

      agoraClient.on("exception", (evt) => {
        console.warn(`[Agora Exception] code=${evt.code}, msg=${evt.msg}, uid=${evt.uid}`);
        ensureVpsAudioContextResumed();
      });

      // Join client as host or audience
      const role = isCurrentUserSpeaker ? "host" : "audience";
      await agoraClient.setClientRole(role);
      console.log(`[Agora] Joining channel ${realChannel} as ${role} with uid ${numericUid}...`);

      try {
        await agoraClient.join(agoraAppId, realChannel, rtcToken, numericUid);
      } catch (joinErr) {
        if (isCloudProxyActive && typeof agoraClient.stopProxyServer === 'function') {
          console.warn("[Agora VPS] Cloud proxy join notice, attempting direct gateway join:", joinErr.message);
          try { agoraClient.stopProxyServer(); } catch (_) {}
          try {
            await agoraClient.join(agoraAppId, realChannel, rtcToken, numericUid);
          } catch (directJoinErr) {
            joinErr = directJoinErr;
          }
        }
        const errStr = String(joinErr && (joinErr.message || joinErr.code || joinErr)).toLowerCase();
        if (errStr.includes('token') || errStr.includes('authorized') || errStr.includes('expired') || errStr.includes('invalid')) {
          console.log("[Agora VPS] Token invalid/expired on join, fetching fresh token from Clubhouse...");
          try {
            const chRes = await window.powerdeckAPI.getChannel(realChannel);
            const freshCh = (chRes && chRes.data && (chRes.data.channel || chRes.data)) || (chRes && chRes.data);
            const freshToken = freshCh && (freshCh.token || freshCh.rtm_token);
            if (freshToken) {
              await agoraClient.join(agoraAppId, realChannel, freshToken, numericUid);
            } else {
              throw joinErr;
            }
          } catch (freshErr) {
            throw freshErr;
          }
        } else {
          throw joinErr;
        }
      }
      currentAgoraChannel = realChannel;
      console.log(`[Agora] Successfully joined channel ${realChannel}!`);

      // Apply audio volume preference to remote participants
      applyAgoraVolume(currentAgoraVolume);

      if (isCurrentUserSpeaker) {
        await publishLocalMicrophone();
      }

      setAppStatus(`Agora Audio Connected: Studio Stereo Music Streaming 48kHz (${role.toUpperCase()})`);
    } catch (err) {
      console.error("[Agora] Connection failed:", err);
      showAlert('warning', `Agora audio connection notice: ${err.message}`);
    }
  }

  // ============================================================
  // STUDIO MIC EQUALIZER, REVERB & VOICE MIXER ENGINE (PRO ⚡)
  // ============================================================
  let micFxAudioContext = null;
  let micFxSourceNode = null;
  let micFxDestinationNode = null;
  let micFxPreampNode = null;
  let micFxFilterLowCut = null;
  let micFxFilterBand1 = null; // 60 Hz Sub
  let micFxFilterBand2 = null; // 120 Hz Bass
  let micFxFilterBand3 = null; // 300 Hz Body
  let micFxFilterBand4 = null; // 700 Hz Mid
  let micFxFilterBand5 = null; // 1.8 kHz Warmth
  let micFxFilterBand6 = null; // 3.5 kHz Presence
  let micFxFilterBand7 = null; // 7.0 kHz Crisp
  let micFxFilterBand8 = null; // 12.0 kHz Air
  let micFxCharFilterLow = null;
  let micFxCharFilterHigh = null;
  let micFxCharPeaking = null;
  let micFxCompressor = null;
  let micFxNoiseGateGain = null;
  let micFxDelayNode = null;
  let micFxDelayFeedbackGain = null;
  let micFxDelayWetGain = null;
  let micFxDelayDryGain = null;
  let micFxReverbConvolver = null;
  let micFxReverbDryGain = null;
  let micFxReverbWetGain = null;
  let micFxMasterGain = null;
  let micFxAnalyser = null;
  let micFxMonitorGain = null;
  let micFxAnimationId = null;
  let micFxRawStream = null;

  const MIC_FX_PRESETS = {
    flat: { band1: 0, band2: 0, band3: 0, band4: 0, band5: 0, band6: 0, band7: 0, band8: 0, reverb: 0, room: 'booth', comp: 0, gate: 0, delayMix: 0, delayTime: 220, delayFeedback: 35, lowCut: true, makeupGain: 0, character: 'clean' },
    radio: { band1: 6, band2: 5, band3: 2, band4: 0, band5: 2, band6: 3, band7: 2, band8: 1, reverb: 8, room: 'booth', comp: 50, gate: 20, delayMix: 0, delayTime: 200, delayFeedback: 30, lowCut: true, makeupGain: 2, character: 'radio' },
    warmth: { band1: 3, band2: 4, band3: 4, band4: 1, band5: 2, band6: 0, band7: 1, band8: 0, reverb: 15, room: 'room', comp: 35, gate: 10, delayMix: 0, delayTime: 220, delayFeedback: 35, lowCut: true, makeupGain: 1, character: 'clean' },
    clarity: { band1: -2, band2: -1, band3: 0, band4: 1, band5: 3, band6: 5, band7: 6, band8: 5, reverb: 10, room: 'booth', comp: 40, gate: 15, delayMix: 0, delayTime: 220, delayFeedback: 35, lowCut: true, makeupGain: 1, character: 'clean' },
    broadcast: { band1: 5, band2: 4, band3: 2, band4: 1, band5: 3, band6: 5, band7: 5, band8: 4, reverb: 18, room: 'stage', comp: 65, gate: 25, delayMix: 10, delayTime: 180, delayFeedback: 25, lowCut: true, makeupGain: 3, character: 'radio' },
    music: { band1: 3, band2: 2, band3: 1, band4: 0, band5: 2, band6: 3, band7: 5, band8: 6, reverb: 25, room: 'hall', comp: 15, gate: 0, delayMix: 15, delayTime: 280, delayFeedback: 40, lowCut: false, makeupGain: 0, character: 'clean' }
  };

  let micFxConfig = {
    enabled: false,
    preset: 'flat',
    lowCut: true,
    character: 'clean',
    eqBand1: 0,
    eqBand2: 0,
    eqBand3: 0,
    eqBand4: 0,
    eqBand5: 0,
    eqBand6: 0,
    eqBand7: 0,
    eqBand8: 0,
    delayTime: 220,
    delayFeedback: 35,
    delayMix: 0,
    reverbMix: 0,
    reverbRoom: 'booth',
    compressorPunch: 0,
    noiseGate: 0,
    makeupGain: 0,
    monitor: false
  };

  try {
    const savedFx = localStorage.getItem('powerdeck_mic_fx_config');
    if (savedFx) {
      const parsed = JSON.parse(savedFx);
      // Backwards compatibility migration from 4-band to 8-band
      if (parsed.eqBass !== undefined && parsed.eqBand1 === undefined) parsed.eqBand1 = parsed.eqBass;
      if (parsed.eqLowMid !== undefined && parsed.eqBand3 === undefined) parsed.eqBand3 = parsed.eqLowMid;
      if (parsed.eqHighMid !== undefined && parsed.eqBand6 === undefined) parsed.eqBand6 = parsed.eqHighMid;
      if (parsed.eqTreble !== undefined && parsed.eqBand8 === undefined) parsed.eqBand8 = parsed.eqTreble;
      micFxConfig = { ...micFxConfig, ...parsed };
    }
  } catch (_) {}

  function saveMicFxConfig() {
    try {
      localStorage.setItem('powerdeck_mic_fx_config', JSON.stringify(micFxConfig));
    } catch (_) {}
    updateDockMicFxButtonState();
  }

  function updateDockMicFxButtonState() {
    const btn = document.getElementById('btn-audio-settings');
    if (btn) {
      btn.classList.toggle('has-active-eq', !!micFxConfig.enabled);
    }
  }

  function createReverbImpulse(audioCtx, roomType = 'booth') {
    const params = {
      booth: { duration: 0.6, decay: 3.5, reverse: false },
      room: { duration: 1.2, decay: 2.2, reverse: false },
      stage: { duration: 1.8, decay: 1.8, reverse: false },
      hall: { duration: 2.5, decay: 1.4, reverse: false },
      cathedral: { duration: 4.2, decay: 1.0, reverse: false },
      space: { duration: 6.0, decay: 0.7, reverse: false }
    }[roomType] || { duration: 0.8, decay: 2.5, reverse: false };

    const sampleRate = (audioCtx && audioCtx.sampleRate) || 48000;
    const length = Math.floor(sampleRate * params.duration);
    const impulse = audioCtx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = params.reverse ? length - i : i;
      const envelope = Math.exp(-n / (sampleRate * (params.decay / 6)));
      left[i] = (Math.random() * 2 - 1) * envelope;
      right[i] = (Math.random() * 2 - 1) * envelope;
    }
    return impulse;
  }

  function updateReverbGains() {
    if (!micFxReverbDryGain || !micFxReverbWetGain) return;
    const wetRatio = (micFxConfig.reverbMix || 0) / 100;
    micFxReverbWetGain.gain.value = Math.sin(wetRatio * (Math.PI / 2)) * 0.85;
    micFxReverbDryGain.gain.value = Math.cos(wetRatio * (Math.PI / 2));
  }

  function updateDelayGains() {
    if (!micFxDelayNode || !micFxDelayFeedbackGain || !micFxDelayWetGain || !micFxDelayDryGain) return;
    const wetRatio = (micFxConfig.delayMix || 0) / 100;
    const timeSec = Math.max(0.05, Math.min(0.8, (micFxConfig.delayTime || 220) / 1000));
    const feedbackRatio = Math.max(0, Math.min(0.85, (micFxConfig.delayFeedback || 35) / 100));

    micFxDelayNode.delayTime.value = timeSec;
    micFxDelayFeedbackGain.gain.value = feedbackRatio;
    micFxDelayWetGain.gain.value = Math.sin(wetRatio * (Math.PI / 2)) * 0.85;
    micFxDelayDryGain.gain.value = Math.cos(wetRatio * (Math.PI / 2));
  }

  function updateCompressorPunch() {
    if (!micFxCompressor) return;
    const punch = (micFxConfig.compressorPunch || 0) / 100;
    micFxCompressor.threshold.value = -12 - (punch * 24);
    micFxCompressor.ratio.value = 2 + (punch * 8);
  }

  function updateLowCutFilter() {
    if (!micFxFilterLowCut) return;
    if (micFxConfig.lowCut) {
      micFxFilterLowCut.type = 'highpass';
      micFxFilterLowCut.frequency.value = 80;
      micFxFilterLowCut.Q.value = 0.707;
    } else {
      micFxFilterLowCut.type = 'allpass';
    }
  }

  function updateMasterMakeupGain() {
    if (!micFxMasterGain) return;
    const db = Number(micFxConfig.makeupGain) || 0;
    micFxMasterGain.gain.value = Math.pow(10, db / 20);
  }

  function updateVoiceCharacterDSP() {
    if (!micFxCharFilterLow || !micFxCharFilterHigh || !micFxCharPeaking) return;
    const char = micFxConfig.character || 'clean';
    if (char === 'phone') {
      micFxCharFilterLow.type = 'highpass';
      micFxCharFilterLow.frequency.value = 450;
      micFxCharFilterHigh.type = 'lowpass';
      micFxCharFilterHigh.frequency.value = 3200;
      micFxCharPeaking.type = 'peaking';
      micFxCharPeaking.frequency.value = 1400;
      micFxCharPeaking.gain.value = 6;
    } else if (char === 'megaphone') {
      micFxCharFilterLow.type = 'highpass';
      micFxCharFilterLow.frequency.value = 550;
      micFxCharFilterHigh.type = 'lowpass';
      micFxCharFilterHigh.frequency.value = 4500;
      micFxCharPeaking.type = 'peaking';
      micFxCharPeaking.frequency.value = 2200;
      micFxCharPeaking.gain.value = 9;
    } else if (char === 'anime') {
      micFxCharFilterLow.type = 'allpass';
      micFxCharFilterHigh.type = 'highshelf';
      micFxCharFilterHigh.frequency.value = 4500;
      micFxCharFilterHigh.gain.value = 6;
      micFxCharPeaking.type = 'peaking';
      micFxCharPeaking.frequency.value = 3200;
      micFxCharPeaking.gain.value = 4;
    } else if (char === 'radio') {
      micFxCharFilterLow.type = 'lowshelf';
      micFxCharFilterLow.frequency.value = 150;
      micFxCharFilterLow.gain.value = 6;
      micFxCharFilterHigh.type = 'peaking';
      micFxCharFilterHigh.frequency.value = 3000;
      micFxCharFilterHigh.gain.value = 3;
      micFxCharPeaking.type = 'allpass';
    } else if (char === 'robot') {
      micFxCharFilterLow.type = 'peaking';
      micFxCharFilterLow.frequency.value = 600;
      micFxCharFilterLow.Q.value = 8.0;
      micFxCharFilterLow.gain.value = 8;
      micFxCharFilterHigh.type = 'peaking';
      micFxCharFilterHigh.frequency.value = 1800;
      micFxCharFilterHigh.Q.value = 6.0;
      micFxCharFilterHigh.gain.value = 8;
      micFxCharPeaking.type = 'peaking';
      micFxCharPeaking.frequency.value = 3400;
      micFxCharPeaking.Q.value = 6.0;
      micFxCharPeaking.gain.value = 8;
    } else {
      micFxCharFilterLow.type = 'allpass';
      micFxCharFilterHigh.type = 'allpass';
      micFxCharPeaking.type = 'allpass';
    }
  }

  function initMicFxAudioGraph(sourceStream) {
    if (!micFxAudioContext || micFxAudioContext.state === 'closed') {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      micFxAudioContext = new AudioCtxClass({ sampleRate: 48000 });
    }
    if (micFxAudioContext.state === 'suspended') {
      micFxAudioContext.resume().catch(() => {});
    }

    const ctx = micFxAudioContext;

    try {
      if (micFxSourceNode) micFxSourceNode.disconnect();
    } catch (_) {}

    micFxSourceNode = ctx.createMediaStreamSource(sourceStream);

    // 1. Preamp
    micFxPreampNode = ctx.createGain();
    micFxPreampNode.gain.value = 1.0;

    // 2. 80Hz Low-Cut Filter
    micFxFilterLowCut = ctx.createBiquadFilter();
    updateLowCutFilter();

    // 3. 8-Band Parametric Equalizer
    micFxFilterBand1 = ctx.createBiquadFilter();
    micFxFilterBand1.type = 'lowshelf';
    micFxFilterBand1.frequency.value = 60;
    micFxFilterBand1.gain.value = micFxConfig.eqBand1 || 0;

    micFxFilterBand2 = ctx.createBiquadFilter();
    micFxFilterBand2.type = 'peaking';
    micFxFilterBand2.frequency.value = 120;
    micFxFilterBand2.Q.value = 1.0;
    micFxFilterBand2.gain.value = micFxConfig.eqBand2 || 0;

    micFxFilterBand3 = ctx.createBiquadFilter();
    micFxFilterBand3.type = 'peaking';
    micFxFilterBand3.frequency.value = 300;
    micFxFilterBand3.Q.value = 1.0;
    micFxFilterBand3.gain.value = micFxConfig.eqBand3 || 0;

    micFxFilterBand4 = ctx.createBiquadFilter();
    micFxFilterBand4.type = 'peaking';
    micFxFilterBand4.frequency.value = 700;
    micFxFilterBand4.Q.value = 1.1;
    micFxFilterBand4.gain.value = micFxConfig.eqBand4 || 0;

    micFxFilterBand5 = ctx.createBiquadFilter();
    micFxFilterBand5.type = 'peaking';
    micFxFilterBand5.frequency.value = 1800;
    micFxFilterBand5.Q.value = 1.2;
    micFxFilterBand5.gain.value = micFxConfig.eqBand5 || 0;

    micFxFilterBand6 = ctx.createBiquadFilter();
    micFxFilterBand6.type = 'peaking';
    micFxFilterBand6.frequency.value = 3500;
    micFxFilterBand6.Q.value = 1.2;
    micFxFilterBand6.gain.value = micFxConfig.eqBand6 || 0;

    micFxFilterBand7 = ctx.createBiquadFilter();
    micFxFilterBand7.type = 'peaking';
    micFxFilterBand7.frequency.value = 7000;
    micFxFilterBand7.Q.value = 1.0;
    micFxFilterBand7.gain.value = micFxConfig.eqBand7 || 0;

    micFxFilterBand8 = ctx.createBiquadFilter();
    micFxFilterBand8.type = 'highshelf';
    micFxFilterBand8.frequency.value = 12000;
    micFxFilterBand8.gain.value = micFxConfig.eqBand8 || 0;

    // 4. Voice Character DSP Nodes
    micFxCharFilterLow = ctx.createBiquadFilter();
    micFxCharFilterHigh = ctx.createBiquadFilter();
    micFxCharPeaking = ctx.createBiquadFilter();
    updateVoiceCharacterDSP();

    // 5. Dynamics Compressor
    micFxCompressor = ctx.createDynamicsCompressor();
    micFxCompressor.knee.value = 12;
    micFxCompressor.attack.value = 0.003;
    micFxCompressor.release.value = 0.15;
    updateCompressorPunch();

    // 6. Noise Gate Gain
    micFxNoiseGateGain = ctx.createGain();
    micFxNoiseGateGain.gain.value = 1.0;

    // 7. Stereo Delay & Echo Block
    micFxDelayNode = ctx.createDelay(1.0);
    micFxDelayFeedbackGain = ctx.createGain();
    micFxDelayWetGain = ctx.createGain();
    micFxDelayDryGain = ctx.createGain();
    updateDelayGains();

    // 8. Reverb Engine Block
    micFxReverbConvolver = ctx.createConvolver();
    micFxReverbConvolver.buffer = createReverbImpulse(ctx, micFxConfig.reverbRoom || 'booth');
    micFxReverbDryGain = ctx.createGain();
    micFxReverbWetGain = ctx.createGain();
    updateReverbGains();

    // 9. Master Makeup Gain
    micFxMasterGain = ctx.createGain();
    updateMasterMakeupGain();

    // 10. Destination & Metering
    micFxDestinationNode = ctx.createMediaStreamDestination();
    micFxAnalyser = ctx.createAnalyser();
    micFxAnalyser.fftSize = 256;
    micFxAnalyser.smoothingTimeConstant = 0.3;

    // 11. Headphone Monitor
    micFxMonitorGain = ctx.createGain();
    micFxMonitorGain.gain.value = micFxConfig.monitor ? 1.0 : 0.0;
    micFxMonitorGain.connect(ctx.destination);

    // Chaining Graph
    micFxSourceNode.connect(micFxPreampNode);
    micFxPreampNode.connect(micFxFilterLowCut);

    // 8-Band EQ Serial Chain
    micFxFilterLowCut.connect(micFxFilterBand1);
    micFxFilterBand1.connect(micFxFilterBand2);
    micFxFilterBand2.connect(micFxFilterBand3);
    micFxFilterBand3.connect(micFxFilterBand4);
    micFxFilterBand4.connect(micFxFilterBand5);
    micFxFilterBand5.connect(micFxFilterBand6);
    micFxFilterBand6.connect(micFxFilterBand7);
    micFxFilterBand7.connect(micFxFilterBand8);

    // Voice Character Chain
    micFxFilterBand8.connect(micFxCharFilterLow);
    micFxCharFilterLow.connect(micFxCharFilterHigh);
    micFxCharFilterHigh.connect(micFxCharPeaking);

    // Dynamics
    micFxCharPeaking.connect(micFxCompressor);
    micFxCompressor.connect(micFxNoiseGateGain);

    // Delay Parallel Split
    micFxNoiseGateGain.connect(micFxDelayDryGain);
    micFxNoiseGateGain.connect(micFxDelayNode);
    micFxDelayNode.connect(micFxDelayFeedbackGain);
    micFxDelayFeedbackGain.connect(micFxDelayNode); // Feedback loop
    micFxDelayNode.connect(micFxDelayWetGain);

    // Mix Delay into Reverb
    const delaySum = ctx.createGain();
    micFxDelayDryGain.connect(delaySum);
    micFxDelayWetGain.connect(delaySum);

    // Reverb Parallel Split
    delaySum.connect(micFxReverbDryGain);
    delaySum.connect(micFxReverbConvolver);
    micFxReverbConvolver.connect(micFxReverbWetGain);

    // Master Makeup Gain
    micFxReverbDryGain.connect(micFxMasterGain);
    micFxReverbWetGain.connect(micFxMasterGain);

    // Master to Destination & Analyser
    micFxMasterGain.connect(micFxDestinationNode);
    micFxMasterGain.connect(micFxAnalyser);
    micFxMasterGain.connect(micFxMonitorGain);

    startMicVuMeterLoop();

    return micFxDestinationNode.stream.getAudioTracks()[0];
  }

  function startMicVuMeterLoop() {
    if (micFxAnimationId) cancelAnimationFrame(micFxAnimationId);
    const vuFill = document.getElementById('mic-vu-fill');
    if (!vuFill || !micFxAnalyser) return;

    const dataArray = new Uint8Array(micFxAnalyser.frequencyBinCount);
    function tick() {
      if (!micFxAnalyser) return;
      micFxAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const percent = Math.min(100, Math.round((avg / 128) * 100));
      if (vuFill) vuFill.style.width = `${percent}%`;

      // Noise gate processing
      if (micFxNoiseGateGain && micFxConfig.noiseGate > 0 && micFxAudioContext) {
        const threshold = (micFxConfig.noiseGate / 100) * 18;
        if (avg < threshold) {
          micFxNoiseGateGain.gain.setTargetAtTime(0.01, micFxAudioContext.currentTime, 0.04);
        } else {
          micFxNoiseGateGain.gain.setTargetAtTime(1.0, micFxAudioContext.currentTime, 0.02);
        }
      }

      micFxAnimationId = requestAnimationFrame(tick);
    }
    tick();
  }

  async function publishLocalMicrophone(forceUnmuted = false) {
    if (!agoraClient || agoraClient.connectionState === 'DISCONNECTED') {
      console.warn("[Agora] publishLocalMicrophone skipped: agoraClient is not connected");
      return;
    }

    if (forceUnmuted) {
      isMicMuted = false;
      updateMicUI();
    }

    try {
      if (agoraLocalAudioTrack) {
        try {
          if (agoraClient && agoraClient.connectionState === 'CONNECTED') {
            await agoraClient.unpublish([agoraLocalAudioTrack]);
          }
        } catch (e) {}
        try { agoraLocalAudioTrack.close(); } catch (_) {}
        agoraLocalAudioTrack = null;
      }
      if (micFxRawStream) {
        try {
          micFxRawStream.getTracks().forEach(t => t.stop());
        } catch (_) {}
        micFxRawStream = null;
      }

      // Fast probe: check if any audio input devices are detected in the system
      let hasHardwareMics = false;
      let inputDeviceId = undefined;
      if (!fastRtcForceVirtualMic) {
        try {
          if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
            const devList = await navigator.mediaDevices.enumerateDevices();
            hasHardwareMics = devList.some(d => {
              const lbl = (d.label || '').toLowerCase();
              return d.kind === 'audioinput' && d.deviceId && !lbl.includes('remote audio') && !lbl.includes('remote desktop');
            });
          }
        } catch (_) {}
      }

      if (hasHardwareMics && !fastRtcForceVirtualMic) {
        try {
          let savedPrefId = undefined;
          const pRes = await window.powerdeckAPI.getAudioPrefs();
          if (pRes && pRes.success && pRes.prefs && pRes.prefs.inputDeviceId && pRes.prefs.inputDeviceId !== 'default') {
            savedPrefId = pRes.prefs.inputDeviceId;
          }
          inputDeviceId = await resolveOptimalAudioInputDeviceId(savedPrefId);
        } catch (e) {}
      }

      console.log("[Agora] Initializing microphone audio track (Music Mode 48kHz, 192kbps)...");
      let acquiredRealMic = false;

      if (!hasHardwareMics || fastRtcForceVirtualMic) {
        console.log("[Agora VPS] Headless session or RDP detached. Instantly activating resilient virtual carrier track (<1s)...");
        const vTrack = createVpsVirtualMicTrack();
        if (vTrack) {
          agoraLocalAudioTrack = await window.AgoraRTC.createCustomAudioTrack({
            mediaStreamTrack: vTrack
          });
          isVirtualMicFallback = true;
          acquiredRealMic = false;
          console.log("[Agora VPS] Resilient virtual carrier track published instantly!");
        }
      } else {
        try {
          if (micFxConfig.enabled) {
            console.log("[Agora Mic FX] Routing through Studio Parametric Equalizer & Reverb DSP Chain...");
            const rawStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 48000,
                channelCount: 2
              }
            });
            micFxRawStream = rawStream;
            const processedTrack = initMicFxAudioGraph(rawStream);
            agoraLocalAudioTrack = await window.AgoraRTC.createCustomAudioTrack({
              mediaStreamTrack: processedTrack
            });
            acquiredRealMic = true;
          } else {
            agoraLocalAudioTrack = await window.AgoraRTC.createMicrophoneAudioTrack({
              encoderConfig: {
                sampleRate: 48000,
                stereo: true,
                bitrate: 192
              },
              AEC: false, // Turn off speech echo canceler to maintain unclipped musical dynamic range
              ANS: false, // Turn off speech noise suppression to keep full stereo instruments & percussion
              AGC: false, // Turn off AGC to preserve transients and eliminate volume pumping
              microphoneId: inputDeviceId
            });
            acquiredRealMic = true;
          }
        } catch (audioErr) {
          console.warn("[Agora] Custom Mic FX or HQ track failed, trying basic mic track:", audioErr.message || audioErr);
          try {
            agoraLocalAudioTrack = await window.AgoraRTC.createMicrophoneAudioTrack(
              inputDeviceId ? { microphoneId: inputDeviceId } : undefined
            );
            acquiredRealMic = true;
          } catch (basicErr) {
            console.warn("[Agora VPS] Hardware microphone unavailable (VPS RDP disconnected). Activating resilient virtual carrier track:", basicErr.message || basicErr);
            const vTrack = createVpsVirtualMicTrack();
            if (vTrack) {
              agoraLocalAudioTrack = await window.AgoraRTC.createCustomAudioTrack({
                mediaStreamTrack: vTrack
              });
              isVirtualMicFallback = true;
              acquiredRealMic = false;
              console.log("[Agora VPS] Resilient virtual carrier track published! RTC staying active in room.");
            } else {
              throw basicErr;
            }
          }
        }
      }

      if (acquiredRealMic) {
        isVirtualMicFallback = false;
      }

      // Attach health watchdog to detect RDP detachment and auto-recover
      if (agoraLocalAudioTrack && !isVirtualMicFallback) {
        attachLocalMicTrackWatchdog(agoraLocalAudioTrack);
      }

      // Apply mic volume & boost gain immediately upon track creation
      applyAgoraMicVolume(currentAgoraMicVolume);

      // Match current mute state using standard Agora RTC setMuted
      if (typeof agoraLocalAudioTrack.setMuted === 'function') {
        await agoraLocalAudioTrack.setMuted(isMicMuted);
      }

      if (agoraClient && typeof agoraClient.setClientRole === 'function') {
        await agoraClient.setClientRole("host");
      }

      if (agoraClient && agoraLocalAudioTrack) {
        await agoraClient.publish([agoraLocalAudioTrack]);
      }

      // Enforce muted state after publishing to prevent Agora Web SDK from defaulting track to unmuted
      if (typeof agoraLocalAudioTrack.setMuted === 'function') {
        await agoraLocalAudioTrack.setMuted(isMicMuted);
      }

      // Re-apply mic volume after publishing to ensure peer connection picks up gain
      applyAgoraMicVolume(currentAgoraMicVolume);
      fastRtcForceVirtualMic = false;
      updateDockMicFxButtonState();
      console.log(`[Agora] Local microphone published successfully! isMicMuted: ${isMicMuted}, isVirtualFallback: ${isVirtualMicFallback}`);
    } catch (err) {
      console.error("[Agora] publishLocalMicrophone error:", err);
      if (!isVirtualMicFallback) {
        showAlert('warning', `Microphone hardware access: ${err.message}`);
      }
    }
  }

  async function promoteToSpeakerInAgora(agoraToken) {
    isCurrentUserSpeaker = true;
    updateHandUI();
    updateMicUI();

    if (agoraClient) {
      try {
        // Use token from become_speaker response to renew Agora RTC token if provided
        if (agoraToken && typeof agoraClient.renewToken === 'function') {
          console.log("[Agora] Using new RTC token from become_speaker to renew host permissions...");
          try {
            await agoraClient.renewToken(agoraToken);
          } catch (tErr) {
            console.warn("[Agora] renewToken error:", tErr);
          }
        }

        await agoraClient.setClientRole("host");
        await publishLocalMicrophone();
      } catch (e) {
        console.warn("[Agora] promoteToSpeaker error:", e);
      }
    }
  }

  async function demoteToAudienceInAgora() {
    isCurrentUserSpeaker = false;
    if (agoraLocalAudioTrack) {
      try {
        if (agoraClient) await agoraClient.unpublish([agoraLocalAudioTrack]);
      } catch (e) {}
      agoraLocalAudioTrack.close();
      agoraLocalAudioTrack = null;
    }
    if (agoraClient) {
      try {
        await agoraClient.setClientRole("audience");
      } catch (e) {}
    }
    await setMicMuted(true);
  }

  function updateSpeakerMuteVisuals(userId, isMuted, force = false) {
    if (!userId) return;
    const uidStr = String(userId).trim();
    if (!force && speakerMuteVisualCache.get(uidStr) === isMuted) return;
    speakerMuteVisualCache.set(uidStr, isMuted);

    const targetTiles = document.querySelectorAll(`.speaker-tile[data-user-id="${uidStr}"]`);
    targetTiles.forEach(tile => {
      const wrap = tile.querySelector('.speaker-avatar-wrap');
      if (wrap) {
        // Clean any existing muted overlay
        const overlay = wrap.querySelector('.avatar-muted-overlay');
        if (overlay) overlay.remove();

        let unmutedBadge = wrap.querySelector('.avatar-unmuted-badge');
        if (isMuted) {
          // If muted, do NOT show anything on avatar (clean avatar)
          if (unmutedBadge) unmutedBadge.remove();
        } else {
          // Only show microphone active icon when unmuted
          if (!unmutedBadge) {
            unmutedBadge = document.createElement('div');
            unmutedBadge.className = 'avatar-unmuted-badge';
            unmutedBadge.title = 'Microphone Active';
            unmutedBadge.innerHTML = '<span class="avatar-unmuted-icon">🎙️</span>';
            wrap.appendChild(unmutedBadge);
          }
        }
      }

      // If muted, do NOT show the mute button for speakers in the action box (only unmuted speakers show mute button to moderators)
      const muteBtn = tile.querySelector('.act-mute');
      const muteSep = tile.querySelector('.act-mute-sep');
      if (muteBtn) {
        const canMute = Boolean(isCurrentUserModerator && !isMuted);
        muteBtn.style.display = canMute ? 'inline-flex' : 'none';
      }
      if (muteSep) muteSep.style.display = 'none';
    });
  }

  function updateMicUI() {
    const dockMic = document.getElementById('btn-dock-mic');
    const dockIcon = document.getElementById('dock-mic-icon');
    const dockLabel = document.getElementById('dock-mic-label');
    const btnAcceptSpeaker = document.getElementById('btn-dock-accept-speaker');
    const dockJoinLabel = document.getElementById('dock-join-label');
    const btnMic = document.getElementById('btn-mic-toggle');
    const micIcon = document.getElementById('mic-icon');
    const micLabel = document.getElementById('mic-label');
    const floatingMic = document.getElementById('btn-floating-mic');
    const floatingMicIcon = document.getElementById('floating-mic-icon');
    const floatingMicLabel = document.getElementById('floating-mic-label');

    // Role-based Audience vs Speaker Controls:
    // When in audience panel (not on speaker stage, is_speaker false):
    // 1. DO NOT show the mute button!
    // 2. Show the Join button in the mic button position!
    if (!isCurrentUserSpeaker) {
      if (dockMic) dockMic.style.display = 'none';
      if (btnMic) btnMic.style.display = 'none';
      if (floatingMic) floatingMic.style.display = 'none';

      if (btnAcceptSpeaker) {
        btnAcceptSpeaker.style.display = 'inline-flex';
        const myUserId = String(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '').trim();
        const meInUsers = currentActiveRoom && currentActiveRoom.users && currentActiveRoom.users.find(u => String(u.user_id) === myUserId);
        const isInvited = Boolean(meInUsers && meInUsers.is_invited_as_speaker);
        if (isInvited) {
          btnAcceptSpeaker.classList.add('is-invited');
          if (dockJoinLabel) dockJoinLabel.textContent = 'Join Channel';
          btnAcceptSpeaker.title = 'Moderator invited you to speak! Click to join channel';
        } else {
          btnAcceptSpeaker.classList.remove('is-invited');
          if (dockJoinLabel) dockJoinLabel.textContent = 'Join';
          btnAcceptSpeaker.title = 'Join channel as speaker';
        }
      }
    } else {
      // User is on speaker stage:
      // Show the mute button, hide the Join button
      if (dockMic) dockMic.style.display = 'inline-flex';
      if (btnMic) btnMic.style.display = 'inline-flex';
      if (floatingMic) floatingMic.style.display = 'flex';
      if (btnAcceptSpeaker) btnAcceptSpeaker.style.display = 'none';
    }

    if (isMicMuted) {
      if (dockMic) {
        dockMic.classList.remove('active', 'is-unmuted');
        dockMic.classList.add('is-muted', 'muted');
        dockMic.title = 'Microphone Muted - Click to Unmute (Ctrl+M)';
      }
      if (dockIcon) dockIcon.textContent = '🔇';
      if (dockLabel) dockLabel.textContent = 'Muted';

      if (btnMic) {
        btnMic.classList.remove('active');
        btnMic.classList.add('muted');
      }
      if (micIcon) micIcon.textContent = '🔇';
      if (micLabel) micLabel.textContent = 'Muted';

      if (floatingMic) {
        floatingMic.classList.remove('active');
        floatingMic.classList.add('muted');
      }
      if (floatingMicIcon) floatingMicIcon.textContent = '🔇';
      if (floatingMicLabel) floatingMicLabel.textContent = 'Unmute';

      setAppStatus('Microphone Muted');
    } else {
      if (dockMic) {
        dockMic.classList.add('active', 'is-unmuted');
        dockMic.classList.remove('is-muted', 'muted');
        dockMic.title = 'Microphone Live - Click to Mute (Ctrl+M)';
      }
      if (dockIcon) dockIcon.textContent = '🎙️';
      if (dockLabel) dockLabel.textContent = 'Unmuted';

      if (btnMic) {
        btnMic.classList.add('active');
        btnMic.classList.remove('muted');
      }
      if (micIcon) micIcon.textContent = '🎙️';
      if (micLabel) micLabel.textContent = 'Unmuted';

      if (floatingMic) {
        floatingMic.classList.add('active');
        floatingMic.classList.remove('muted');
      }
      if (floatingMicIcon) floatingMicIcon.textContent = '🎙️';
      if (floatingMicLabel) floatingMicLabel.textContent = 'Mute';

      setAppStatus('Microphone Live • Studio Stereo Agora');
    }

    // Update all act-self-mute buttons across stage tiles
    document.querySelectorAll('.act-self-mute').forEach(btn => {
      if (isMicMuted) {
        btn.classList.add('is-muted');
        btn.classList.remove('is-live');
        btn.innerHTML = '🎙️ Unmute';
        btn.title = 'Unmute microphone';
      } else {
        btn.classList.remove('is-muted');
        btn.classList.add('is-live');
        btn.innerHTML = '🔇 Mute';
        btn.title = 'Mute microphone';
      }
    });

    // Update self avatar DP overlay
    const myId = String(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '').trim();
    if (myId) {
      updateSpeakerMuteVisuals(myId, isMicMuted);
    }
  }

  function updateHandUI() {
    const btnHand = document.getElementById('btn-raise-hand');
    const handIcon = document.getElementById('hand-icon');
    const handLabel = document.getElementById('hand-label');
    const dockHand = document.getElementById('btn-dock-hand');
    const dockIcon = document.getElementById('dock-hand-icon');
    const dockLabel = document.getElementById('dock-hand-label');

    if (dockHand) {
      dockHand.style.display = 'inline-flex';
      if (isCurrentUserSpeaker) {
        if (dockLabel) dockLabel.textContent = isCurrentUserModerator ? 'Raised Hands' : 'Hands';
        dockHand.title = isCurrentUserModerator ? 'View raised hands queue' : 'Raised hands';
        dockHand.classList.remove('active');
      } else {
        if (dockLabel) dockLabel.textContent = isHandRaised ? 'Hand Raised' : 'Raise Hand';
        dockHand.title = isHandRaised ? 'Lower Hand' : 'Raise Hand to Speak';
        if (isHandRaised) {
          dockHand.classList.add('active');
        } else {
          dockHand.classList.remove('active');
        }
      }
    }
    updateDockHandraiseCount();

    if (btnHand) {
      btnHand.style.display = isCurrentUserSpeaker ? 'none' : 'inline-flex';
    }

    if (isHandRaised) {
      if (btnHand) btnHand.classList.add('active');
      if (dockHand && !isCurrentUserSpeaker) dockHand.classList.add('active');
      if (handIcon) handIcon.textContent = '✋';
      if (handLabel) handLabel.textContent = 'Hand Raised';
      if (dockIcon) dockIcon.textContent = '✋';
      if (dockLabel && !isCurrentUserSpeaker) dockLabel.textContent = 'Hand Raised';
      setAppStatus('Hand Raised • Host notified');
    } else {
      if (btnHand) btnHand.classList.remove('active');
      if (dockHand && !isCurrentUserSpeaker) dockHand.classList.remove('active');
      if (handIcon) handIcon.textContent = '✋';
      if (handLabel) handLabel.textContent = 'Raise Hand';
      if (dockIcon) dockIcon.textContent = '✋';
      if (dockLabel && !isCurrentUserSpeaker) dockLabel.textContent = 'Raise Hand';
      setAppStatus('Hand Lowered');
    }
  }

  async function setMicMuted(muted) {
    isMicMuted = muted;
    if (agoraLocalAudioTrack) {
      try {
        if (typeof agoraLocalAudioTrack.setMuted === 'function') {
          await agoraLocalAudioTrack.setMuted(muted);
        }
        if (!muted && typeof agoraLocalAudioTrack.setVolume === 'function') {
          agoraLocalAudioTrack.setVolume(currentAgoraMicVolume);
        }
      } catch (e) {
        console.warn("[Agora] setMuted error:", e);
      }
    } else if (!muted && isCurrentUserSpeaker && agoraClient) {
      try {
        await publishLocalMicrophone(true);
      } catch (e) {
        console.warn("[Agora] publishLocalMicrophone error in setMicMuted:", e);
      }
    }
    updateMicUI();
    const myId = String(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '').trim();
    if (myId) {
      if (muted) {
        unmutedSpeakerUids.delete(myId);
        agoraMutedUids.add(myId);
      } else {
        unmutedSpeakerUids.add(myId);
        agoraMutedUids.delete(myId);
      }
      updateSpeakerMuteVisuals(myId, muted, true);
      updateUserSpeakingIndicator(myId, !muted);
    }
  }

  async function toggleMicMuted() {
    await setMicMuted(!isMicMuted);
  }

  async function disconnectAgoraAudio(isExplicitUserAction = false) {
    isIntentionalAgoraDisconnect = Boolean(isExplicitUserAction);
    speakingStateCache.clear();
    speakerMuteVisualCache.clear();
    unmutedSpeakerUids.clear();
    agoraMutedUids.clear();
    try {
      if (agoraLocalAudioTrack) {
        if (agoraClient) {
          try { await agoraClient.unpublish([agoraLocalAudioTrack]); } catch (e) {}
        }
        try { agoraLocalAudioTrack.close(); } catch (_) {}
        agoraLocalAudioTrack = null;
      }
      if (micFxRawStream) {
        try { micFxRawStream.getTracks().forEach(t => t.stop()); } catch (_) {}
        micFxRawStream = null;
      }
      if (agoraClient) {
        const clientToLeave = agoraClient;
        agoraClient = null;
        try {
          await Promise.race([
            clientToLeave.leave(),
            new Promise(resolve => setTimeout(resolve, 200))
          ]);
        } catch (_) {}
      }
      currentAgoraChannel = null;
      unmutedSpeakerUids.clear();
      agoraMutedUids.clear();
      console.log(`[Agora] Disconnected from channel audio. isIntentional: ${isExplicitUserAction}`);
    } catch (err) {
      console.warn("[Agora] disconnect error:", err);
      agoraClient = null;
      agoraLocalAudioTrack = null;
      currentAgoraChannel = null;
    }
  }

  function updateUserSpeakingIndicator(userId, isSpeaking) {
    if (!userId) return;
    const uidStr = String(userId);
    if (speakingStateCache.get(uidStr) === isSpeaking) return;
    speakingStateCache.set(uidStr, isSpeaking);

    const tile = document.querySelector(`.speaker-tile[data-user-id="${uidStr}"]`);
    if (tile) {
      const wrap = tile.querySelector('.speaker-avatar-wrap');
      let halo = wrap ? wrap.querySelector('.speaking-halo') : null;
      if (isSpeaking) {
        if (!halo && wrap) {
          halo = document.createElement('div');
          halo.className = 'speaking-halo';
          wrap.appendChild(halo);
        }
      } else {
        if (halo) halo.remove();
      }
    }
  }

  // ============================================================
  // CHANNEL PINNED LINK NORMALIZATION & EXTRACTION HELPERS
  // ============================================================
  function normalizeLinkItem(item) {
    if (!item || typeof item !== 'object') return null;
    const linkId = String(item.link_id || item.id || item.linkId || '');
    const targetUrl = item.display_link || item.target_link || item.link || item.url || item.href || '';
    if (!targetUrl && !linkId) return null;

    let fromName = item.from_name ||
                   item.added_by_name ||
                   item.added_by_display_name ||
                   item.user_name ||
                   item.creator_name ||
                   item.created_by_name ||
                   (item.user && (item.user.name || item.user.displayname || item.user.first_name || item.user.username)) ||
                   (item.user_profile && (item.user_profile.name || item.user_profile.displayname || item.user_profile.first_name || item.user_profile.username)) ||
                   (item.creator && (item.creator.name || item.creator.first_name)) ||
                   (item.added_by && (item.added_by.name || item.added_by.first_name)) ||
                   item.name ||
                   '';

    let fromPhoto = item.from_photo_url ||
                    item.photo_url ||
                    item.from_photo ||
                    (item.user && item.user.photo_url) ||
                    (item.user_profile && item.user_profile.photo_url) ||
                    (item.creator && item.creator.photo_url) ||
                    (item.added_by && item.added_by.photo_url) ||
                    null;

    const authorId = item.from_user_id ||
                     item.added_by_id ||
                     item.added_by_user_id ||
                     item.user_id ||
                     item.creator_user_id ||
                     item.creator_user_profile_id ||
                     (item.user && item.user.user_id) ||
                     (item.user_profile && item.user_profile.user_id) ||
                     null;

    return {
      ...item,
      link_id: linkId,
      id: linkId,
      target_link: targetUrl,
      display_link: targetUrl,
      link: targetUrl,
      url: targetUrl,
      title: item.link_title || item.title || item.name || '',
      link_title: item.link_title || item.title || item.name || '',
      link_preview_url: item.link_preview_url || item.preview_url || item.thumbnail || null,
      link_description: item.link_description || item.description || '',
      from_name: fromName,
      added_by_name: fromName,
      from_photo_url: fromPhoto,
      from_user_id: authorId,
      user_id: authorId
    };
  }

  function extractChannelLinks(data, resData) {
    if (!data && !resData) return null;
    const sources = [
      data,
      data && data.channel,
      data && data.room,
      resData && resData.channel,
      resData && resData.room,
      resData
    ].filter(Boolean);

    // 1. Array variants with items
    for (const src of sources) {
      const arr = src.links || src.pinned_links || src.channel_links;
      if (Array.isArray(arr) && arr.length > 0) {
        const mapped = arr.map(normalizeLinkItem).filter(Boolean);
        if (mapped.length > 0) return mapped;
      }
    }

    // 2. Singular object variants
    for (const src of sources) {
      const single = src.pinned_link || src.link || src.channel_link;
      if (single && typeof single === 'object') {
        const norm = normalizeLinkItem(single);
        if (norm) return [norm];
      }
    }

    // 3. Explicit empty or null indicating removed link
    for (const src of sources) {
      if (Array.isArray(src.links) && src.links.length === 0) return [];
      if (Array.isArray(src.pinned_links) && src.pinned_links.length === 0) return [];
      if (Array.isArray(src.channel_links) && src.channel_links.length === 0) return [];
      if (src.pinned_link === null || src.pinned_link === false) return [];
    }

    return null; // Not present in response
  }

  // ============================================================
  // PUBNUB LIVE EVENT ENGINE
  // ============================================================

  // Disconnect & cleanup PubNub client and background loop
  function disconnectPubNub() {
    if (pubnubClient) {
      try {
        pubnubClient.unsubscribeAll();
        pubnubClient.stop();
      } catch (e) {
        console.warn("[PubNub] Client stop notice:", e);
      }
      pubnubClient = null;
    }
    if (window.powerdeckAPI && window.powerdeckAPI.stopPubNubLoop) {
      try {
        window.powerdeckAPI.stopPubNubLoop();
      } catch (e) {}
    }
    raisedHandUserIds.clear();
    updateDockHandraiseCount();
    hasFetchedInitialChannelMessages = false;
    channelMessagesStore.clear();
    chatNextCursor = null;
    isLoadingOlderChatMessages = false;
  }

  // Handle incoming live PubNub events from client listener or Electron background loop
  function handleIncomingPubNubEvent(raw) {
    if (!raw) return;

    // Handle stringified JSON
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (_) {
        return;
      }
    }
    if (!raw || typeof raw !== 'object') return;

    // Unwrap PubNub envelope if array or 'd'/'m' format
    if (raw.d !== undefined) {
      let inner = raw.d;
      if (typeof inner === 'string') {
        try { inner = JSON.parse(inner); } catch (_) {}
      }
      if (inner && typeof inner === 'object') {
        if (!inner._pubnubChannel && (raw._pubnubChannel || raw.c)) inner._pubnubChannel = raw._pubnubChannel || raw.c;
        if (!inner.channel && raw.channel) inner.channel = raw.channel;
        if (!inner.channel && (raw._pubnubChannel || raw.c)) {
          const chM = String(raw._pubnubChannel || raw.c).match(/(?:channel_all|channel_speakers|channel_user)\.([a-zA-Z0-9_-]+)/);
          if (chM && chM[1]) inner.channel = chM[1];
        }
        handleIncomingPubNubEvent(inner);
        return;
      } else if (inner !== undefined) {
        handleIncomingPubNubEvent(inner);
        return;
      }
    }
    if (Array.isArray(raw.m)) {
      raw.m.forEach(m => {
        let inner = m.d !== undefined ? m.d : m;
        if (typeof inner === 'string') {
          try { inner = JSON.parse(inner); } catch (_) {}
        }
        if (inner && typeof inner === 'object') {
          if (!inner._pubnubChannel && (m._pubnubChannel || m.c)) inner._pubnubChannel = m._pubnubChannel || m.c;
          if (!inner.channel && m.channel) inner.channel = m.channel;
          if (!inner.channel && (m._pubnubChannel || m.c)) {
            const chM = String(m._pubnubChannel || m.c).match(/(?:channel_all|channel_speakers|channel_user)\.([a-zA-Z0-9_-]+)/);
            if (chM && chM[1]) inner.channel = chM[1];
          }
        }
        handleIncomingPubNubEvent(inner);
      });
      return;
    }
    if (Array.isArray(raw)) {
      raw.forEach(handleIncomingPubNubEvent);
      return;
    }

    const msg = (raw.channel_message && typeof raw.channel_message === 'object')
      ? raw.channel_message
      : ((raw.data && typeof raw.data === 'object') ? raw.data : raw);

    const action = String(
      raw.action || raw.action_type || raw.type || raw.event ||
      msg.action || msg.action_type || msg.type || msg.event || ''
    ).toLowerCase().trim();

    // 0. End Channel / Room Ended (e.g. {'action': 'end_channel', 'channel': 'mgb9rzpM'})
    const isEndChannel = action === 'end_channel' ||
                         action === 'channel_ended' ||
                         action === 'end_room' ||
                         action === 'room_ended';
    if (isEndChannel) {
      const eventChannel = String(
        raw.channel || msg.channel ||
        raw.channel_id || msg.channel_id ||
        raw._pubnubChannel || msg._pubnubChannel || ''
      ).trim();

      const activeChannel = String(
        (currentActiveRoom && (currentActiveRoom.channel || currentActiveRoom.id)) || ''
      ).trim();

      console.warn(`[PubNub] Room Ended event received for channel "${eventChannel}" (Active: "${activeChannel}"):`, raw);

      const isMatch = !eventChannel || !activeChannel ||
        eventChannel.toLowerCase() === activeChannel.toLowerCase() ||
        eventChannel.toLowerCase().includes(activeChannel.toLowerCase()) ||
        activeChannel.toLowerCase().includes(eventChannel.toLowerCase());

      if (isMatch && currentActiveRoom) {
        const roomTitle = currentActiveRoom.title || eventChannel || activeChannel || 'Room';
        const actorId = msg.actor_user_id || msg.user_id || raw.actor_user_id || raw.user_id;
        const actorName = msg.actor_name || raw.actor_name || 'Moderator';

        logRoomActivity({
          type: 'end_channel',
          title: 'Room Ended',
          icon: '🛑',
          actor_id: actorId,
          actor_name: actorName,
          detail: `Room "${roomTitle}" was ended by moderator. Leaving quietly.`,
          timestamp: Date.now()
        });

        leaveActiveRoom(`Room "${roomTitle}" was ended by moderator. Left quietly.`);
      }
      return;
    }

    // 0. Live Pinned Channel Link updates via PubNub (add_channel_link, remove_channel_link, etc.)
    if (action.includes('channel_link') || action.includes('pinned_link') || action === 'pin_link' || action === 'unpin_link') {
      if (action.includes('remove') || action.includes('delete') || action.includes('unpin')) {
        if (currentActiveRoom) currentActiveRoom.links = [];
        if (currentActiveRoom) renderStageController(currentActiveRoom);
      } else {
        const linkData = msg.channel_link || msg.link || msg.pinned_link || msg.channel_links || msg;
        const norm = extractChannelLinks(linkData, msg);
        if (norm && norm.length > 0 && currentActiveRoom) {
          currentActiveRoom.links = norm;
          renderStageController(currentActiveRoom);
        }
        refreshActiveChannelState().catch(() => {});
      }
      return;
    }

    // 1. Stage GIF Reactions (PubNub broadcast: gif_reaction, send_channel_gif_reaction, channel_gif_reaction, or new_channel_reaction with image_url)
    const reactionObj = (msg.reaction && typeof msg.reaction === 'object') ? msg.reaction : ((raw.reaction && typeof raw.reaction === 'object') ? raw.reaction : {});
    let gifMediaUrl = msg.giphy_id || raw.giphy_id || msg.gif_id || raw.gif_id ||
                      msg.gif_url || raw.gif_url || msg.image_url || raw.image_url || msg.url || raw.url ||
                      reactionObj.image_url || reactionObj.url || reactionObj.gif_url || reactionObj.giphy_id ||
                      (msg.gif && (msg.gif.id || msg.gif.url)) || (raw.gif && (raw.gif.id || raw.gif.url));

    if (typeof gifMediaUrl === 'object' && gifMediaUrl !== null) {
      gifMediaUrl = gifMediaUrl.image_url || gifMediaUrl.url || gifMediaUrl.gif_url || gifMediaUrl.giphy_id || gifMediaUrl.id || '';
    }
    if (gifMediaUrl === 'None' || gifMediaUrl === 'null' || gifMediaUrl === 'undefined') {
      gifMediaUrl = null;
    }

    const hasGifMedia = Boolean(
      gifMediaUrl && (
        String(gifMediaUrl).includes('http') ||
        String(gifMediaUrl).includes('.gif') ||
        String(gifMediaUrl).includes('giphy') ||
        msg.giphy_id || raw.giphy_id || msg.gif_id || raw.gif_id ||
        (reactionObj && reactionObj.image_url && reactionObj.image_url !== 'None' && reactionObj.image_url !== 'null') ||
        (reactionObj && reactionObj.giphy_id)
      )
    );

    const isGifReaction = action.includes('gif') ||
                          action === 'gif_reaction' ||
                          action === 'send_channel_gif_reaction' ||
                          action === 'channel_gif_reaction' ||
                          action === 'new_channel_gif_reaction' ||
                          reactionObj.is_gif ||
                          reactionObj.type === 'gif' ||
                          hasGifMedia;
    if (isGifReaction && gifMediaUrl) {
      const gifUser = msg.from_user_id || msg.user_id || msg.actor_id || msg.actor_user_id ||
                      (msg.action_user_profile && (msg.action_user_profile.id || msg.action_user_profile.user_id)) ||
                      (raw.action_user_profile && (raw.action_user_profile.id || raw.action_user_profile.user_id)) ||
                      (msg.user_profile && (msg.user_profile.id || msg.user_profile.user_id)) ||
                      (raw.user_profile && (raw.user_profile.id || raw.user_profile.user_id)) ||
                      raw.from_user_id || raw.user_id;

      const targetUser = (msg.target_user_profile && (msg.target_user_profile.id || msg.target_user_profile.user_id)) ||
                         (raw.target_user_profile && (raw.target_user_profile.id || raw.target_user_profile.user_id)) ||
                         msg.target_user_id || raw.target_user_id;

      const rawTargets = msg.target_user_ids || raw.target_user_ids || (targetUser ? [targetUser] : []);
      const actionProfile = msg.action_user_profile || raw.action_user_profile || msg.user_profile || raw.user_profile || {};
      const targetProfile = msg.target_user_profile || raw.target_user_profile || {};

      const duration = Number(msg.display_time || msg.duration || reactionObj.display_time_s || reactionObj.display_time || raw.display_time || raw.duration || 15);

      if (Array.isArray(rawTargets) && rawTargets.length > 0) {
        rawTargets.forEach(tId => {
          const tidStr = typeof tId === 'object' ? (tId.id || tId.user_id) : tId;
          if (tidStr) {
            console.log(`[PubNub GIF Reaction] Target user ${tidStr} received GIF ${gifMediaUrl} (${duration}s)`);
            setUserProfileGifReaction(tidStr, gifMediaUrl, duration, targetProfile);
          }
        });
      } else if (targetUser) {
        console.log(`[PubNub GIF Reaction] Target user ${targetUser} received GIF ${gifMediaUrl} (${duration}s)`);
        setUserProfileGifReaction(targetUser, gifMediaUrl, duration, targetProfile);
      }
      if (gifUser && String(gifUser) !== String(targetUser)) {
        console.log(`[PubNub GIF Reaction] User ${gifUser} reacted with GIF ${gifMediaUrl} (${duration}s)`);
        setUserProfileGifReaction(gifUser, gifMediaUrl, duration, actionProfile);
      }
      return;
    }

    // 2. Stage Reactions (Emoji reaction from member to member or channel broadcast)
    const isReaction = action === 'new_channel_reaction' ||
                       action.includes('react') ||
                       action.includes('emoji') ||
                       action === 'send_channel_reaction' ||
                       action === 'channel_reaction' ||
                       action === 'emoji_reaction' ||
                       action === 'reaction' ||
                       action === 'send_reaction' ||
                       action === 'reaction_added' ||
                       action === 'channel_emoji_reaction' ||
                       msg.message_type === 6 ||
                       raw.message_type === 6 ||
                       Boolean(reactionObj && (reactionObj.emoji || reactionObj.id || reactionObj.reaction_id)) ||
                       Boolean((msg.emoji || raw.emoji || msg.emoji_code || raw.emoji_code) && !msg.channel_message && !msg.chat_message && !action.includes('join') && !action.includes('leave'));

    if (isReaction) {
      const reactionId = msg.reaction_id || raw.reaction_id || reactionObj.reaction_id || reactionObj.id;
      const emoji = msg.emoji || msg.emoji_code || raw.emoji || raw.emoji_code || reactionObj.emoji || reactionObj.emoji_code ||
                    (reactionId && REACTION_ID_TO_EMOJI[Number(reactionId)]) || '❤️';

      const actionProfile = msg.action_user_profile || raw.action_user_profile ||
                            msg.user_profile || raw.user_profile ||
                            msg.sender || raw.sender ||
                            msg.from_user || raw.from_user || {};
      const targetProfile = msg.target_user_profile || raw.target_user_profile ||
                            msg.target_user || raw.target_user || {};

      const fromId = msg.from_user_id || msg.user_id || msg.actor_id || msg.actor_user_id ||
                     actionProfile.id || actionProfile.user_id ||
                     (msg.user_profile && (msg.user_profile.id || msg.user_profile.user_id)) ||
                     (raw.user_profile && (raw.user_profile.id || raw.user_profile.user_id)) ||
                     (msg.sender && (msg.sender.id || msg.sender.user_id)) ||
                     (raw.sender && (raw.sender.id || raw.sender.user_id)) ||
                     raw.from_user_id || raw.user_id;

      const targetIdFromProfile = targetProfile.id || targetProfile.user_id;

      // Extract target IDs (single or array)
      let targetIds = [];
      const rawTargets = msg.target_user_ids || raw.target_user_ids ||
                         msg.target_users || raw.target_users ||
                         (targetIdFromProfile ? [targetIdFromProfile] : null) ||
                         (msg.target_user_id ? [msg.target_user_id] : null) ||
                         (raw.target_user_id ? [raw.target_user_id] : null) ||
                         (msg.target_user ? [msg.target_user] : null) ||
                         (raw.target_user ? [raw.target_user] : null) ||
                         (msg.to_user_id ? [msg.to_user_id] : null) ||
                         (raw.to_user_id ? [raw.to_user_id] : null) ||
                         (msg.target_id ? [msg.target_id] : null) ||
                         (raw.target_id ? [raw.target_id] : null);

      if (Array.isArray(rawTargets)) {
        targetIds = rawTargets.map(t => {
          if (t && typeof t === 'object') return String(t.id || t.user_id || '');
          return String(t || '');
        }).filter(t => t && t !== '0' && t !== 'undefined' && t !== 'null');
      }

      if (targetIds.length === 0 && targetIdFromProfile) {
        targetIds = [String(targetIdFromProfile)];
      }

      console.log(`[PubNub Channel Reaction] from=${fromId} (${actionProfile.name || ''}), targets=${JSON.stringify(targetIds)} (${targetProfile.name || ''}), emoji=${emoji}`);

      // Always trigger the screen-wide floating reaction stream
      const senderDisplayName = (actionProfile && (actionProfile.name || actionProfile.first_name || actionProfile.username)) || '';
      triggerFloatingReaction(emoji, senderDisplayName);

      if (targetIds.length > 0) {
        let stagger = 0;
        targetIds.forEach(tId => {
          setTimeout(() => {
            // Instantly pop reaction preview directly on target's avatar tile on stage
            triggerTargetEmojiAnimation(tId, emoji, targetProfile);
            if (fromId && String(tId) === String(fromId)) {
              triggerStageReactionAnimation(fromId, null, emoji, actionProfile, targetProfile);
            } else {
              triggerStageReactionAnimation(fromId, tId, emoji, actionProfile, targetProfile);
            }
          }, stagger);
          stagger += 60;
        });
      } else {
        if (fromId) {
          triggerTargetEmojiAnimation(fromId, emoji, actionProfile);
        }
        triggerStageReactionAnimation(fromId, null, emoji, actionProfile, targetProfile);
      }
      return;
    }

    // 3. Room Chat Messages (synchronous real-time delivery via PubNub)
    const isChatMessage = action === 'send_channel_message' ||
                          msg.channel_message ||
                          (msg.message && typeof msg.message === 'string' && action !== 'leave_channel' && !msg.action) ||
                          msg.message_type === 1 ||
                          msg.message_type === 'chat';
    if (isChatMessage && msg.message_type !== 6 && !msg.reaction) {
      appendIncomingChatMessage(msg.channel_message || msg);
      return;
    }

    // 3b. Phone Call Status (e.g. {'action': 'update_speaker_call_status', 'channel': 'MdR5OEa8', 'user_id': 1607419629, 'is_on_call': True, 'audio_profile': 3})
    if (action === 'update_speaker_call_status' || action === 'user_phone_call_status' || action === 'call_status' || typeof msg.is_on_call !== 'undefined' || typeof msg.is_on_phone_call !== 'undefined') {
      const uId = msg.user_id || raw.user_id ||
                  (msg.action_user_profile && (msg.action_user_profile.id || msg.action_user_profile.user_id)) ||
                  (msg.user_profile && (msg.user_profile.id || msg.user_profile.user_id));
      const isCalling = Boolean(msg.is_on_call !== undefined ? msg.is_on_call : (raw.is_on_call !== undefined ? raw.is_on_call : (msg.is_on_phone_call || raw.is_on_phone_call)));
      if (uId) {
        const uidStr = String(uId);
        if (isCalling) {
          speakerCallStatusMap.set(uidStr, true);
        } else {
          speakerCallStatusMap.delete(uidStr);
        }
        updateSpeakerCallStatusBadge(uidStr, isCalling);
      }
      return;
    }

    // 3b. Cumulative Visitor Count Update (PubNub broadcast: {'action': 'cumulative_count_update', 'num_ever': 81})
    if (action === 'cumulative_count_update' || action === 'update_cumulative_count' || typeof msg.num_ever !== 'undefined') {
      const numEver = msg.num_ever || msg.cumulative_count || msg.num_all || msg.count;
      if (numEver !== undefined) {
        updateCumulativeCountDisplay(numEver);
      }
      if (action === 'cumulative_count_update' || action === 'update_cumulative_count') return;
    }

    // 3c. Listener Raised Hand to Speak
    if (action === 'raise_hands' || action === 'raise_hand' || action === 'handraise' || action === 'hand_raised') {
      const uId = msg.user_id || msg.user_profile_id || msg.from_user_id || (msg.user_profile && msg.user_profile.user_id);
      if (uId) {
        const uIdStr = String(uId);
        raisedHandUserIds.add(uIdStr);
        updateUserHandRaisedBadge(uIdStr, true);
        updateDockHandraiseCount();

        let raisedName = msg.name || msg.user_name || (msg.user_profile && (msg.user_profile.name || msg.user_profile.first_name));
        const photo = msg.photo_url || (msg.user_profile && msg.user_profile.photo_url);

        if (!raisedName && profileCache.has(uIdStr)) {
          raisedName = profileCache.get(uIdStr).name;
        }

        if (raisedName) {
          showChannelToast('moderator', { user_id: uId, name: raisedName, photo_url: photo }, 'raised their hand to speak ✋', '✋');
        } else {
          getProfileCached(uId).then(p => {
            const n = (p && p.name) ? p.name : 'Someone';
            showChannelToast('moderator', p || { user_id: uId, name: n }, 'raised their hand to speak ✋', '✋');
          }).catch(() => {
            showChannelToast('moderator', { user_id: uId, name: 'A listener' }, 'raised their hand to speak ✋', '✋');
          });
        }
      }
      return;
    }

    // 3d. Listener Lowered Hand
    if (action === 'unraise_hands' || action === 'unraise_hand' || action === 'lower_hand' || action === 'lower_hands' || action === 'unhandraise') {
      const uId = msg.user_id || msg.user_profile_id || msg.from_user_id || (msg.user_profile && msg.user_profile.user_id);
      if (uId) {
        const uIdStr = String(uId);
        raisedHandUserIds.delete(uIdStr);
        updateUserHandRaisedBadge(uIdStr, false);
        updateDockHandraiseCount();
      }
      return;
    }

    // 4. Channel Message Deleted Notification (Notification bottom of Leave Quietly)
    if (action === 'delete_channel_message' || action === 'message_deleted' || action === 'delete_message') {
      const msgId = msg.message_id || msg.id;
      let targetAuthorName = 'Member';
      let targetAuthorId = null;
      let targetAuthorPhoto = null;
      let deletedSnippet = '';

      if (msgId && channelMessagesStore.has(String(msgId))) {
        const stored = channelMessagesStore.get(String(msgId));
        if (stored.name && stored.name !== 'Member') targetAuthorName = stored.name;
        targetAuthorId = stored.user_id;
        targetAuthorPhoto = stored.photo || null;
        deletedSnippet = stored.message || '';
      }

      if (msgId) {
        const itemEl = document.querySelector(`.chat-message-item[data-message-id="${msgId}"]`);
        if (itemEl) {
          if (!deletedSnippet) deletedSnippet = itemEl.getAttribute('data-message-text') || '';
          if (targetAuthorName === 'Member') targetAuthorName = itemEl.getAttribute('data-author-name') || targetAuthorName;
          if (!targetAuthorId) targetAuthorId = itemEl.getAttribute('data-author-id');
          itemEl.remove();
        }
      }

      const snippetShort = deletedSnippet ? (deletedSnippet.length > 35 ? deletedSnippet.slice(0, 32) + '...' : deletedSnippet) : '';
      const snippetQuote = snippetShort ? ` "${snippetShort}"` : '';
      const actorId = msg.actor_user_id || msg.user_id;

      Promise.all([
        actorId ? getProfileCached(actorId).catch(() => null) : Promise.resolve(null),
        (targetAuthorId && targetAuthorName === 'Member') ? getProfileCached(targetAuthorId).catch(() => null) : Promise.resolve(null)
      ]).then(([actorProf, authorProf]) => {
        const actorName = (actorProf && actorProf.name) ? actorProf.name : (msg.actor_name || 'Moderator');
        const resolvedAuthorName = (authorProf && authorProf.name) ? authorProf.name : targetAuthorName;
        const authorPhoto = (authorProf && authorProf.photo_url) || targetAuthorPhoto;

        showChannelToast('moderator', actorProf || { user_id: actorId, name: actorName }, `deleted ${resolvedAuthorName}'s message${snippetQuote}`, '🗑️');

        logRoomActivity({
          type: 'delete_channel_message',
          title: 'Deleted Message',
          icon: '🗑️',
          actor_id: actorId,
          actor_name: actorName,
          actor_photo: actorProf ? actorProf.photo_url : null,
          target_id: targetAuthorId,
          target_name: resolvedAuthorName,
          target_photo: authorPhoto,
          detail: `deleted ${resolvedAuthorName}'s message`,
          snippet: deletedSnippet,
          timestamp: Date.now()
        });
      });
      return;
    }

    // 5. Handraise Settings Changed Notification (Notification bottom of Leave Quietly)
    if (action === 'change_handraise_settings' || action === 'handraise_settings_changed') {
      const isEnabled = msg.is_handraise_enabled !== false;
      if (currentActiveRoom) currentActiveRoom.is_handraise_enabled = isEnabled;

      let settingStr = 'openstage';
      const settingCode = msg.handraise_queue_setting !== undefined ? Number(msg.handraise_queue_setting) : null;
      if (settingCode === 0) {
        settingStr = 'openstage';
      } else if (settingCode === 1) {
        settingStr = 'invite only';
      } else if (settingCode === 2) {
        settingStr = 'request to join';
      } else if (!isEnabled) {
        settingStr = 'off';
      }

      const btnDockHand = document.getElementById('btn-dock-hand');
      if (btnDockHand) {
        btnDockHand.title = isEnabled ? `Hand raising (${settingStr})` : 'Hand raising is currently disabled by moderators';
      }

      const actorId = msg.from_user_id || msg.actor_user_id || msg.user_id;
      const fromName = msg.from_name || msg.actor_name || (msg.user_profile && msg.user_profile.name);
      const actionText = `turned handraise settings to ${settingStr}`;

      if (fromName) {
        showChannelToast('moderator', { user_id: actorId, name: fromName }, actionText, '✋');
        logRoomActivity({
          type: 'change_handraise_settings',
          title: 'Handraise Settings Changed',
          icon: '✋',
          actor_id: actorId,
          actor_name: fromName,
          detail: `${fromName} ${actionText}`,
          timestamp: Date.now()
        });
      } else if (actorId) {
        getProfileCached(actorId).then(actorProf => {
          const actorName = (actorProf && actorProf.name) ? actorProf.name : 'Moderator';
          showChannelToast('moderator', actorProf || { user_id: actorId, name: actorName }, actionText, '✋');
          logRoomActivity({
            type: 'change_handraise_settings',
            title: 'Handraise Settings Changed',
            icon: '✋',
            actor_id: actorId,
            actor_name: actorName,
            actor_photo: actorProf ? actorProf.photo_url : null,
            detail: `${actorName} ${actionText}`,
            timestamp: Date.now()
          });
        }).catch(() => {
          showChannelToast('moderator', { user_id: actorId, name: 'Moderator' }, actionText, '✋');
        });
      } else {
        showChannelToast('moderator', { name: 'Moderator' }, actionText, '✋');
      }
      return;
    }

    // 6. User Joined Stage / Channel (Notify on user join, silent on leave per user requirement)
    if (action === 'join_channel' && msg.user_profile) {
      const myId = getLoggedInUserId();
      const isSelf = myId && String(msg.user_profile.user_id) === String(myId);
      // If event is for current logged-in user and user is already a speaker on stage, never demote!
      if (isSelf && isCurrentUserSpeaker) {
        return;
      }
      if (currentActiveRoom && Array.isArray(currentActiveRoom.users)) {
        const pUid = String(msg.user_profile.user_id);
        const existingIdx = currentActiveRoom.users.findIndex(u => String(u.user_id) === pUid);
        if (existingIdx !== -1) {
          currentActiveRoom.users[existingIdx] = Object.assign({}, currentActiveRoom.users[existingIdx], msg.user_profile);
        } else {
          currentActiveRoom.users.push(msg.user_profile);
        }

        const isAnon = isAnonymousUser(msg.user_profile);
        const anonEmoji = getAnonymousUserEmoji(msg.user_profile);

        if (msg.user_profile.is_on_phone_call || msg.user_profile.is_on_call || msg.user_profile.phone_call_status) {
          speakerCallStatusMap.set(pUid, true);
        }

        // Show User Joined toast notification and log to Room Activity Log
        if (!isSelf) {
          const joinedName = isAnon ? 'Anonymous listener' : (msg.user_profile.name || msg.user_profile.first_name || msg.user_profile.username || 'A member');
          const joinedPhoto = isAnon ? null : (msg.user_profile.photo_url || null);
          showChannelToast('normal', { user_id: msg.user_profile.user_id, name: joinedName, photo_url: joinedPhoto }, 'joined the room 👋', '👋');

          logRoomActivity({
            type: 'join_channel',
            title: 'User Joined',
            icon: '👋',
            actor_id: msg.user_profile.user_id,
            actor_name: joinedName,
            actor_photo: joinedPhoto,
            detail: `${joinedName} joined the room`,
            timestamp: Date.now()
          });
        }

        if (msg.user_profile.is_speaker) {
          currentActiveRoom.speakers = currentActiveRoom.speakers || [];
          const spkIdx = currentActiveRoom.speakers.findIndex(s => String(s.userId || s.user_id) === pUid);
          const spkObj = {
            userId: msg.user_profile.user_id,
            name: msg.user_profile.name || msg.user_profile.first_name || (isAnon ? 'anon' : 'Speaker'),
            handle: msg.user_profile.username ? `@${msg.user_profile.username}` : '',
            photo: msg.user_profile.photo_url || null,
            isModerator: !!msg.user_profile.is_moderator,
            isSpeaker: true,
            speaking: false,
            isMuted: Boolean(msg.user_profile.is_muted || msg.user_profile.is_speaker_muted || msg.user_profile.is_self_muted),
            badge: msg.user_profile.is_moderator ? '★ Moderator' : 'Speaker',
            channelEmoji: msg.user_profile.channel_emoji || null,
            isPaidUser: !!msg.user_profile.is_paid_user,
            isAnonymousUser: isAnon,
            anonymousUserEmoji: isAnon ? anonEmoji : null
          };
          if (spkIdx !== -1) {
            currentActiveRoom.speakers[spkIdx] = Object.assign(currentActiveRoom.speakers[spkIdx], spkObj);
          } else {
            currentActiveRoom.speakers.push(spkObj);
          }
          if (Array.isArray(currentActiveRoom.listeners)) {
            currentActiveRoom.listeners = currentActiveRoom.listeners.filter(l => String(l.userId || l.user_id) !== pUid);
          }
        } else {
          currentActiveRoom.listeners = currentActiveRoom.listeners || [];
          // Make sure user is removed from speakers so they NEVER show in both!
          if (Array.isArray(currentActiveRoom.speakers)) {
            currentActiveRoom.speakers = currentActiveRoom.speakers.filter(s => String(s.userId || s.user_id) !== pUid);
          }
          const lisIdx = currentActiveRoom.listeners.findIndex(l => String(l.userId || l.user_id) === pUid);
          const lisObj = {
            userId: msg.user_profile.user_id,
            name: msg.user_profile.name || msg.user_profile.first_name || (isAnon ? 'anon' : 'Listener'),
            handle: msg.user_profile.username ? `@${msg.user_profile.username}` : '',
            photo: msg.user_profile.photo_url || null,
            channelEmoji: msg.user_profile.channel_emoji || null,
            isPaidUser: !!msg.user_profile.is_paid_user,
            isAnonymousUser: isAnon,
            anonymousUserEmoji: isAnon ? anonEmoji : null
          };
          if (lisIdx !== -1) {
            currentActiveRoom.listeners[lisIdx] = Object.assign(currentActiveRoom.listeners[lisIdx], lisObj);
          } else {
            currentActiveRoom.listeners.push(lisObj);
          }
        }
        scheduleChannelPreviewUpdate(currentActiveRoom);
      }
      return;
    }

    // 7. User Left Channel (Silent update, no toast per user preference)
    if (action === 'leave_channel' && msg.user_id) {
      const uId = String(msg.user_id);
      const myId = getLoggedInUserId();
      // If packet is for self but user is still in room, do not remove self from stage
      if (myId && uId === String(myId) && currentActiveRoom) {
        return;
      }
      speakerCallStatusMap.delete(uId);
      unmutedSpeakerUids.delete(uId);
      agoraMutedUids.delete(uId);
      updateSpeakerMuteVisuals(uId, true, true);
      updateUserSpeakingIndicator(uId, false);
      raisedHandUserIds.delete(uId);
      updateUserHandRaisedBadge(uId, false);
      updateDockHandraiseCount();
      if (currentActiveRoom) {
        if (Array.isArray(currentActiveRoom.speakers)) {
          currentActiveRoom.speakers = currentActiveRoom.speakers.filter(s => String(s.userId) !== uId);
        }
        if (Array.isArray(currentActiveRoom.listeners)) {
          currentActiveRoom.listeners = currentActiveRoom.listeners.filter(l => String(l.userId) !== uId);
        }
        if (Array.isArray(currentActiveRoom.users)) {
          currentActiveRoom.users = currentActiveRoom.users.filter(u => String(u.user_id) !== uId);
        }
        scheduleChannelPreviewUpdate(currentActiveRoom);
      }
      return;
    }

    // 8. Speaker Added / Promoted
    if (action === 'add_speaker' && msg.user_profile) {
      const spkId = String(msg.user_profile.user_id);
      unmutedSpeakerUids.delete(spkId);
      agoraMutedUids.add(spkId);
      updateSpeakerMuteVisuals(spkId, true, true);
      updateUserSpeakingIndicator(spkId, false);
      raisedHandUserIds.delete(spkId);
      updateUserHandRaisedBadge(spkId, false);
      updateDockHandraiseCount();

      const myId = getLoggedInUserId();
      if (myId && String(msg.user_profile.user_id) === String(myId)) {
        isCurrentUserSpeaker = true;
        promoteToSpeakerInAgora();
        updateEndRoomButtonVisibility();
      }
      if (currentActiveRoom) {
        currentActiveRoom.speakers = currentActiveRoom.speakers || [];
        if (!currentActiveRoom.speakers.some(s => s.userId === msg.user_profile.user_id)) {
          currentActiveRoom.speakers.push({
            userId: msg.user_profile.user_profile || msg.user_profile.user_id,
            name: msg.user_profile.name || 'Speaker',
            handle: msg.user_profile.username ? `@${msg.user_profile.username}` : '',
            photo: msg.user_profile.photo_url || null,
            isModerator: !!msg.user_profile.is_moderator,
            isSpeaker: true,
            speaking: false,
            badge: msg.user_profile.is_moderator ? '★ Moderator' : 'Speaker'
          });
        }
        if (Array.isArray(currentActiveRoom.listeners)) {
          currentActiveRoom.listeners = currentActiveRoom.listeners.filter(l => String(l.userId) !== String(msg.user_profile.user_id));
        }
        scheduleChannelPreviewUpdate(currentActiveRoom);
      }
      return;
    }

    // 9. Make Moderator
    if (action === 'make_moderator' && msg.user_id) {
      const myId = getLoggedInUserId();
      if (myId && String(msg.user_id) === String(myId)) {
        isCurrentUserModerator = true;
        updateEndRoomButtonVisibility();
      }
      if (currentActiveRoom && Array.isArray(currentActiveRoom.speakers)) {
        const spk = currentActiveRoom.speakers.find(s => String(s.userId) === String(msg.user_id));
        if (spk) {
          spk.isModerator = true;
          spk.badge = '★ Moderator';
          scheduleChannelPreviewUpdate(currentActiveRoom);
        }
      }
      return;
    }

    // 10. Sync Mute / Unmute / Move To Audience via PubNub
    if (action === 'mute_speaker' || action === 'mute' || (action.includes('mute') && !action.includes('unmute'))) {
      const targetId = String(msg.target_user_id || msg.user_id || (msg.user_profile && msg.user_profile.user_id) || '').trim();
      if (targetId) {
        unmutedSpeakerUids.delete(targetId);
        agoraMutedUids.add(targetId);
        updateSpeakerMuteVisuals(targetId, true, true);
        updateUserSpeakingIndicator(targetId, false);
      }
    } else if (action === 'unmute_speaker' || action === 'unmute') {
      const targetId = String(msg.target_user_id || msg.user_id || (msg.user_profile && msg.user_profile.user_id) || '').trim();
      if (targetId) {
        unmutedSpeakerUids.add(targetId);
        agoraMutedUids.delete(targetId);
        updateSpeakerMuteVisuals(targetId, false, true);
      }
    } else if (action === 'uninvite_speaker' || action === 'remove_speaker') {
      const targetId = String(msg.target_user_id || msg.user_id || (msg.user_profile && msg.user_profile.user_id) || '').trim();
      if (targetId) {
        unmutedSpeakerUids.delete(targetId);
        agoraMutedUids.delete(targetId);
        updateSpeakerMuteVisuals(targetId, true, true);
        updateUserSpeakingIndicator(targetId, false);
      }
    }
  }

  function connectPubNub(channelId, channelData) {
    disconnectPubNub();
    channelMessagesStore.clear();

    const realChannel = (channelData && channelData.channel && String(channelData.channel).trim()) ||
                        (channelData && channelData.data && channelData.data.channel && String(channelData.data.channel).trim()) ||
                        channelId;

    const pubnubToken = channelData && (channelData.pubnub_token || (channelData.data && channelData.data.pubnub_token));
    if (pubnubToken && window.powerdeckAPI?.startPubNubLoop) {
      console.log(`[PubNub] Starting background Node stream loop for channel ${realChannel}...`);
      window.powerdeckAPI.startPubNubLoop(realChannel, pubnubToken);
    }
    refreshHandraiseQueue(realChannel);

    if (!window.PubNub) {
      console.warn("[PubNub] PubNub SDK not loaded on window");
      return;
    }

    const pubnubPubKey = (activeProfile && activeProfile.pubnubPubKey) || "pub-c-6878d382-5ae6-4494-9099-f930f938868b";
    const pubnubSubKey = (activeProfile && activeProfile.pubnubSubKey) || "sub-c-a4abea84-9ca3-11ea-8e71-f2b83ac9263d";
    let myUserId = (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id)));
    let tokenChannels = null;
    if (pubnubToken) {
      try {
        const raw = atob(pubnubToken);
        const m = raw.match(/channel_user\.[^.]+\.(\d+)/) || raw.match(/users\.(\d+)/);
        if (m) myUserId = m[1];

        const chRegex = /(?:users\.\d+|channel_speakers\.[a-zA-Z0-9_-]+|channel_all\.[a-zA-Z0-9_-]+|channel_user\.[a-zA-Z0-9_-]+\.\d+)/g;
        const set = new Set();
        let chMatch;
        while ((chMatch = chRegex.exec(raw)) !== null) set.add(chMatch[0]);
        if (set.size > 0) tokenChannels = Array.from(set);
      } catch (_) {}
    }
    if (!myUserId) myUserId = getLoggedInUserId() || '1897378975';
    const origin = (channelData && channelData.pubnub_origin) || "clubhouse.pubnubapi.com";

    try {
      console.log(`[PubNub] Initializing PubNub client for user ${myUserId}...`);
      pubnubClient = new window.PubNub({
        publishKey: pubnubPubKey,
        subscribeKey: pubnubSubKey,
        origin: origin,
        authKey: pubnubToken,
        userId: String(myUserId),
        uuid: String(myUserId),
        ssl: true,
        heartbeatInterval: (channelData && channelData.pubnub_heartbeat_interval) || 9
      });

      const subSet = new Set([
        `channel_all.${channelId}`,
        `channel_speakers.${channelId}`,
        `channel_user.${channelId}.${myUserId}`,
        `users.${myUserId}`
      ]);
      if (Array.isArray(tokenChannels)) {
        tokenChannels.forEach(c => subSet.add(c));
      }
      const subChannels = Array.from(subSet);

      console.log(`[PubNub] Subscribing to channels:`, subChannels);

      pubnubClient.addListener({
        status: (statusEvent) => {
          console.log("[PubNub Status]", statusEvent.category);
          if (statusEvent.category === "PNConnectedCategory") {
            setAppStatus(`PubNub connected: live channel sync active`);
          }
        },
        message: (msgObj) => {
          console.log("[PubNub Message]", msgObj.channel, msgObj.message);
          let m = msgObj.message;
          if (m && typeof m === 'object') {
            if (!m.channel && msgObj.channel) {
              const chMatch = String(msgObj.channel).match(/(?:channel_all|channel_speakers|channel_user)\.([a-zA-Z0-9_-]+)/);
              if (chMatch && chMatch[1]) m.channel = chMatch[1];
            }
            if (msgObj.channel) m._pubnubChannel = msgObj.channel;
          }
          handleIncomingPubNubEvent(m);
        }
      });

      pubnubClient.subscribe({
        channels: subChannels,
        withPresence: false
      });
    } catch (err) {
      console.error("[PubNub] Initialization error:", err);
    }
  }

  const channelActivityLogs = [];

  function logChannelActivity(type, user) {
    if (!user) return;
    channelActivityLogs.push({
      time: Date.now(),
      type,
      user_id: user.user_id,
      name: user.name || user.first_name || 'Member',
      photo: user.photo_url || user.photo
    });
    if (channelActivityLogs.length > 100) channelActivityLogs.shift();
  }

  function showChannelToast(type, user, customText = null, iconOverride = null) {
    const container = document.getElementById('channel-toast-container');
    if (!container || !user) return;

    const toast = document.createElement('div');
    toast.className = `channel-toast-item toast-${type}`;

    let userName = user.name || user.first_name || user.displayname || '';
    if (!userName && user.user_id && currentActiveRoom) {
      const roomUsers = [
        ...(Array.isArray(currentActiveRoom.users) ? currentActiveRoom.users : []),
        ...(Array.isArray(currentActiveRoom.speakers) ? currentActiveRoom.speakers : [])
      ];
      const found = roomUsers.find(ru => String(ru.user_id) === String(user.user_id));
      if (found) userName = found.name || found.displayname || '';
    }
    if (!userName) userName = user.username ? `@${user.username}` : 'Member';

    const photoUrl = user.photo_url || user.photo || user.from_photo_url;
    const initial = (userName || 'M').charAt(0).toUpperCase();

    const avatarHtml = photoUrl
      ? `<img src="${photoUrl}" class="channel-toast-avatar" alt="${escapeHtml(userName)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'channel-toast-avatar-fallback\\'>${initial}</div>';">`
      : `<div class="channel-toast-avatar-fallback">${initial}</div>`;

    let icon = iconOverride;
    let actionText = customText;

    if (!icon || !actionText) {
      if (type === 'join') {
        icon = icon || '🟢';
        actionText = actionText || 'joined the room';
      } else if (type === 'leave') {
        icon = icon || '👋';
        actionText = actionText || 'left the room';
      } else if (type === 'speaker') {
        icon = icon || '🎤';
        actionText = actionText || 'joined the channel as speaker';
      } else if (type === 'moderator') {
        icon = icon || '⭐';
        actionText = actionText || 'is now a moderator';
      } else if (type === 'chat') {
        icon = icon || '💬';
        actionText = actionText || 'sent a message';
      } else {
        icon = icon || 'ℹ️';
        actionText = actionText || '';
      }
    }

    toast.innerHTML = `
      ${avatarHtml}
      <span class="channel-toast-text">${icon} <strong>${escapeHtml(userName)}</strong> ${escapeHtml(actionText)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 4500);
  }

  function updateCumulativeCountDisplay(count) {
    const num = Number(count) || 0;
    if (num > 0 && currentActiveRoom) {
      currentActiveRoom.cumulative_count = num;
      currentActiveRoom.num_ever = num;
    }
    const container = document.getElementById('ch-cumulative-container');
    const val = document.getElementById('val-cumulative-count');
    if (val && num > 0) {
      val.textContent = num.toLocaleString();
      if (container) container.style.display = 'inline';
    }
  }

  function isElementRenderedVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return (rect.width > 0 && rect.height > 0);
  }

  const userActiveGifMap = new Map();

  function setUserProfileGifReaction(userId, giphyIdOrUrl, durationSec = 15, profileHint = null, isVideo = false) {
    if (!userId || !giphyIdOrUrl) return;
    const uidStr = String(userId).trim();
    if (!uidStr) return;

    let rawGif = giphyIdOrUrl;
    if (typeof rawGif === 'object' && rawGif !== null) {
      rawGif = rawGif.image_url || rawGif.url || rawGif.gif_url || rawGif.giphy_id || rawGif.id || '';
    }
    rawGif = String(rawGif).trim();
    if (!rawGif || rawGif === 'None' || rawGif === 'null' || rawGif === 'undefined') return;

    const gifUrl = (rawGif.startsWith('http') || rawGif.startsWith('data:'))
      ? rawGif
      : `https://i.giphy.com/${rawGif}.gif`;

    const durationMs = Math.max(3000, (Number(durationSec) || 15) * 1000);
    const expiresAt = Date.now() + durationMs;

    // Cache original profile picture if not cached yet
    let originalPhotoUrl = null;
    const existing = userActiveGifMap.get(uidStr);
    if (existing && existing.originalPhotoUrl) {
      originalPhotoUrl = existing.originalPhotoUrl;
      if (existing.timerId) clearTimeout(existing.timerId);
    } else {
      const myId = String(getLoggedInUserId() || '');
      if (uidStr === myId) {
        originalPhotoUrl = originalProfileAvatarSrc || (homeAvatar && homeAvatar.src) || (activeProfile && (activeProfile.photo_url || (activeProfile.user && activeProfile.user.photo_url))) || '';
      } else {
        const u = currentActiveRoom && [
          ...(Array.isArray(currentActiveRoom.speakers) ? currentActiveRoom.speakers : []),
          ...(Array.isArray(currentActiveRoom.listeners) ? currentActiveRoom.listeners : []),
          ...(Array.isArray(currentActiveRoom.users) ? currentActiveRoom.users : [])
        ].find(x => String(x.userId || x.user_id || x.id) === uidStr);
        originalPhotoUrl = (u && (u.photo || u.photo_url)) || (profileHint && (profileHint.photo_url || profileHint.photo)) || '';
      }
    }

    const timerId = setTimeout(() => {
      clearUserProfileGifReaction(uidStr);
    }, durationMs);

    userActiveGifMap.set(uidStr, {
      gifUrl,
      originalPhotoUrl,
      expiresAt,
      timerId,
      isVideo
    });

    const myId = String(getLoggedInUserId() || '');
    const isSelf = uidStr === myId;

    if (isSelf && homeAvatar) {
      if (!originalProfileAvatarSrc && homeAvatar.src && !homeAvatar.src.startsWith('data:image/svg')) {
        originalProfileAvatarSrc = homeAvatar.src;
      }
      homeAvatar.src = gifUrl;
      homeAvatar.style.display = 'block';
      if (homeAvatarFallback) homeAvatarFallback.style.display = 'none';
    }

    // Clean any accidental stray reaction halos in the room chat bar
    const chatContainer = document.getElementById('channel-chat-panel');
    if (chatContainer) {
      chatContainer.querySelectorAll('.gif-reaction-halo, .gif-avatar-video, .gif-temp-avatar-img').forEach(el => el.remove());
    }

    // Collect all matching participant tiles across speakers and listeners grids (strictly stage & channel grids)
    const matchingTiles = new Set();
    const candidateSelectors = [
      `#channel-speakers-grid .speaker-tile[data-user-id="${uidStr}"]`,
      `#channel-listeners-grid .listener-tile[data-user-id="${uidStr}"]`,
      `#stage-speakers-grid .speaker-tile[data-user-id="${uidStr}"]`,
      `#stage-listeners-grid .listener-tile[data-user-id="${uidStr}"]`,
      `.speaker-tile[data-user-id="${uidStr}"]`,
      `.listener-tile[data-user-id="${uidStr}"]`
    ];
    candidateSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(t => {
        // STRICT GUARD: Must NEVER target room chat or drawer elements
        if (!t.closest('#channel-chat-panel, .room-chat-drawer, .chat-panel, .chat-message-item, .chat-msg-avatar-col, .room-chat-box')) {
          matchingTiles.add(t);
        }
      });
    });

    const foundTile = findUserTile(uidStr, profileHint);
    if (foundTile && !foundTile.closest('#channel-chat-panel, .room-chat-drawer, .chat-panel, .chat-message-item, .chat-msg-avatar-col, .room-chat-box')) {
      matchingTiles.add(foundTile);
    }

    if (isSelf) {
      document.querySelectorAll('.speaker-tile.is-self, .listener-tile.is-self').forEach(t => {
        if (!t.closest('#channel-chat-panel, .room-chat-drawer, .chat-panel, .chat-message-item, .chat-msg-avatar-col, .room-chat-box')) {
          matchingTiles.add(t);
        }
      });
    }

    // Match by display name if not found yet (STRICTLY on speaker/listener tiles, NEVER chat)
    if (matchingTiles.size === 0 && profileHint && (profileHint.name || profileHint.username)) {
      const hintName = (profileHint.name || profileHint.username).trim().toLowerCase();
      document.querySelectorAll('#channel-speakers-grid .speaker-tile, #channel-listeners-grid .listener-tile, #stage-speakers-grid .speaker-tile, #stage-listeners-grid .listener-tile, .speaker-tile, .listener-tile').forEach(t => {
        if (t.closest('#channel-chat-panel, .room-chat-drawer, .chat-panel, .chat-message-item, .chat-msg-avatar-col, .room-chat-box')) return;
        const nameEl = t.querySelector('.speaker-name-text, .listener-name-text, .speaker-tile-name, .listener-tile-name');
        if (nameEl && nameEl.textContent.trim().toLowerCase() === hintName) {
          t.setAttribute('data-user-id', uidStr);
          matchingTiles.add(t);
        }
      });
    }

    matchingTiles.forEach(tile => {
      if (!tile || tile.closest('#channel-chat-panel, .room-chat-drawer, .chat-panel, .chat-message-item, .chat-msg-avatar-col, .room-chat-box')) return;

      // STRICT: Must have a valid round avatar container (.speaker-avatar-wrap or .listener-avatar-wrap)
      const wrap = tile.querySelector('.speaker-avatar-wrap, .listener-avatar-wrap, .speaker-avatar, .listener-avatar');
      if (!wrap) return;

      // Add green pulsing halo around the round profile picture
      let halo = wrap.querySelector('.gif-reaction-halo');
      if (!halo) {
        halo = document.createElement('div');
        halo.className = 'gif-reaction-halo';
        wrap.appendChild(halo);
      }

      // Remove any old overlay box if present
      const oldOverlay = wrap.querySelector('.avatar-gif-reaction-overlay');
      if (oldOverlay) oldOverlay.remove();

      const isListener = tile.classList.contains('listener-tile') || wrap.classList.contains('listener-avatar-wrap');
      const avatarClass = isListener ? 'listener-tile-avatar' : 'speaker-tile-avatar';

      // Update avatar image directly to GIF inside the round profile circle
      if (isVideo) {
        let vid = wrap.querySelector('.gif-avatar-video');
        if (!vid) {
          vid = document.createElement('video');
          vid.className = `${avatarClass} gif-avatar-video`;
          vid.autoplay = true;
          vid.loop = true;
          vid.muted = true;
          vid.playsInline = true;
          wrap.appendChild(vid);
        }
        vid.src = gifUrl;
        vid.style.display = 'block';
        const img = wrap.querySelector('img.speaker-tile-avatar, img.listener-tile-avatar');
        if (img) img.style.display = 'none';
      } else {
        let img = wrap.querySelector('img.speaker-tile-avatar, img.listener-tile-avatar');
        if (img) {
          if (!originalPhotoUrl && img.src && !img.src.includes('giphy.com')) {
            originalPhotoUrl = img.src;
            const rec = userActiveGifMap.get(uidStr);
            if (rec) rec.originalPhotoUrl = originalPhotoUrl;
          }
          // Prevent destructive onerror from wiping out the img element
          img.onerror = () => {
            if (originalPhotoUrl && img.src !== originalPhotoUrl) {
              img.src = originalPhotoUrl;
            }
          };
          img.src = gifUrl;
          img.style.display = 'block';
        } else {
          // If fallback letter circle was present, temporarily display GIF img inside round circle
          const fallbackDiv = wrap.querySelector('.speaker-tile-avatar.avatar-fallback-circ, .listener-tile-avatar.avatar-fallback-circ, .avatar-anon-circ');
          if (fallbackDiv) {
            fallbackDiv.style.display = 'none';
          }
          let tempImg = wrap.querySelector('.gif-temp-avatar-img');
          if (!tempImg) {
            tempImg = document.createElement('img');
            tempImg.className = `${avatarClass} gif-temp-avatar-img`;
            tempImg.alt = 'GIF Reaction';
            wrap.appendChild(tempImg);
          }
          tempImg.onerror = () => {
            tempImg.style.display = 'none';
            if (fallbackDiv) fallbackDiv.style.display = '';
          };
          tempImg.src = gifUrl;
          tempImg.style.display = 'block';
        }
        const vid = wrap.querySelector('.gif-avatar-video');
        if (vid) vid.style.display = 'none';
      }
    });

    // Also update profile modal avatar if viewing this user
    const pmWrap = document.getElementById('pm-avatar-wrap');
    if (pmWrap && viewingProfileUserId && String(viewingProfileUserId) === uidStr) {
      let pmHalo = pmWrap.querySelector('.gif-reaction-halo');
      if (!pmHalo) {
        pmHalo = document.createElement('div');
        pmHalo.className = 'gif-reaction-halo';
        pmWrap.appendChild(pmHalo);
      }
      const pmImg = pmWrap.querySelector('img#pm-avatar');
      if (pmImg) {
        pmImg.src = gifUrl;
      }
    }

    // Immediately trigger a preview update so stage signatures incorporate the new GIF
    if (currentActiveRoom) {
      try {
        const spkGrid = document.getElementById('channel-speakers-grid');
        const lisGrid = document.getElementById('channel-listeners-grid');
        if (spkGrid) spkGrid.removeAttribute('data-speaker-sig');
        if (lisGrid) lisGrid.removeAttribute('data-listener-sig');
        updateChannelPreview(currentActiveRoom);
      } catch (_) {}
    }

    // Also update stage modal if visible
    const stageModal = document.getElementById('modal-stage-channel');
    if (stageModal && stageModal.style.display !== 'none' && currentActiveRoom) {
      try {
        renderStageModal(currentActiveRoom);
      } catch (_) {}
    }
  }
      const tempImg = wrap.querySelector('.gif-temp-avatar-img');
      if (tempImg) tempImg.remove();

      const fallbackDiv = wrap.querySelector('.speaker-tile-avatar.avatar-fallback-circ, .listener-tile-avatar.avatar-fallback-circ, .avatar-anon-circ');
      if (fallbackDiv) {
        fallbackDiv.style.display = '';
      }

      const img = wrap.querySelector('img.speaker-tile-avatar, img.listener-tile-avatar');
      if (img) {
        if (originalPhotoUrl) {
          img.src = originalPhotoUrl;
          img.style.display = 'block';
        } else if (fallbackDiv) {
          img.style.display = 'none';
        }
      }
    });

    const pmWrap = document.getElementById('pm-avatar-wrap');
    if (pmWrap && viewingProfileUserId && String(viewingProfileUserId) === uidStr) {
      const pmHalo = pmWrap.querySelector('.gif-reaction-halo');
      if (pmHalo) pmHalo.remove();
      const pmImg = pmWrap.querySelector('img#pm-avatar');
      if (pmImg && originalPhotoUrl) {
        pmImg.src = originalPhotoUrl;
      }
    }

    // Invalidate signatures so preview re-renders clean original avatars
    if (currentActiveRoom) {
      try {
        const spkGrid = document.getElementById('channel-speakers-grid');
        const lisGrid = document.getElementById('channel-listeners-grid');
        if (spkGrid) spkGrid.removeAttribute('data-speaker-sig');
        if (lisGrid) lisGrid.removeAttribute('data-listener-sig');
        updateChannelPreview(currentActiveRoom);
      } catch (_) {}
    }

    const stageModal = document.getElementById('modal-stage-channel');
    if (stageModal && stageModal.style.display !== 'none' && currentActiveRoom) {
      try {
        renderStageModal(currentActiveRoom);
      } catch (_) {}
    }
  }

  function triggerStageGifReaction(userId, giphyId, displayTimeS = 15, profileHint = null) {
    setUserProfileGifReaction(userId, giphyId, displayTimeS, profileHint, false);
  }

  // Find a user's avatar profile box on stage or in audience
  function findUserTile(userId, profileHint = null) {
    if (!userId) return null;
    const uidStr = String(userId).trim();
    if (!uidStr) return null;

    // 1. Search candidate elements across all visible participant grids (strictly speaker & listener tiles)
    const selectors = [
      `#channel-speakers-grid .speaker-tile[data-user-id="${uidStr}"]`,
      `#channel-listeners-grid .listener-tile[data-user-id="${uidStr}"]`,
      `#stage-speakers-grid .speaker-tile[data-user-id="${uidStr}"]`,
      `#stage-listeners-grid .listener-tile[data-user-id="${uidStr}"]`,
      `.speaker-tile[data-user-id="${uidStr}"]`,
      `.listener-tile[data-user-id="${uidStr}"]`
    ];

    // First try: pick the first rendered element with non-zero dimensions
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (!el.closest('#channel-chat-panel, .room-chat-drawer, .chat-panel, .chat-message-item, .chat-msg-avatar-col') && isElementRenderedVisible(el)) {
          return el;
        }
      }
    }

    // Second try: any element matching in DOM (strictly non-chat)
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (!el.closest('#channel-chat-panel, .room-chat-drawer, .chat-panel, .chat-message-item, .chat-msg-avatar-col')) {
          return el;
        }
      }
    }

    // 3. Fallback for logged-in user profile tile / avatar
    const myId = String(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '');
    if (myId && uidStr === myId) {
      const selfEls = [
        document.querySelector('.speaker-tile.is-self'),
        document.querySelector('.listener-tile.is-self'),
        document.getElementById('home-avatar'),
        document.getElementById('user-badge'),
        document.getElementById('pm-avatar-wrap')
      ];
      for (const el of selfEls) {
        if (el && isElementRenderedVisible(el)) return el;
      }
      for (const el of selfEls) {
        if (el) return el;
      }
    }

    // 4. Match by username or display name in active room users
    if (currentActiveRoom) {
      const allParticipants = [
        ...(Array.isArray(currentActiveRoom.speakers) ? currentActiveRoom.speakers : []),
        ...(Array.isArray(currentActiveRoom.listeners) ? currentActiveRoom.listeners : []),
        ...(Array.isArray(currentActiveRoom.users) ? currentActiveRoom.users : [])
      ];
      const foundUser = allParticipants.find(usr => String(usr.userId || usr.user_id || usr.id) === uidStr);
      if (foundUser && (foundUser.name || foundUser.first_name || foundUser.username)) {
        const matchName = (foundUser.name || foundUser.first_name || foundUser.username).trim().toLowerCase();
        const allTiles = document.querySelectorAll('.speaker-tile, .listener-tile');
        for (const t of allTiles) {
          const nameEl = t.querySelector('.speaker-name-text, .listener-name-text, .speaker-tile-name, .listener-tile-name');
          if (nameEl && nameEl.textContent.trim().toLowerCase() === matchName && isElementRenderedVisible(t)) {
            t.setAttribute('data-user-id', uidStr);
            return t;
          }
        }
      }
    }

    // 5. If profileHint is provided (from PubNub reaction event), match by name or cache
    if (profileHint && typeof profileHint === 'object') {
      const isAnon = isAnonymousUser(profileHint);
      const uName = profileHint.name || profileHint.first_name || profileHint.username || (isAnon ? 'anon' : 'Member');
      const photo = profileHint.photo_url || profileHint.photo || null;

      if (typeof profileCache !== 'undefined' && profileCache && profileCache.set) {
        profileCache.set(uidStr, {
          user_id: uidStr,
          id: uidStr,
          name: uName,
          photo_url: photo,
          ...profileHint
        });
      }

      // Check if tile already matches name
      const allTiles = document.querySelectorAll('.speaker-tile, .listener-tile');
      const matchName = uName.trim().toLowerCase();
      for (const t of allTiles) {
        const nameEl = t.querySelector('.speaker-name-text, .listener-name-text, .speaker-tile-name, .listener-tile-name');
        if (nameEl && nameEl.textContent.trim().toLowerCase() === matchName && isElementRenderedVisible(t)) {
          t.setAttribute('data-user-id', uidStr);
          return t;
        }
      }
    }

    return null;
  }

  function triggerTargetEmojiAnimation(targetUserId, emoji = '❤️', targetProfile = null) {
    if (!targetUserId) return;
    const uidStr = String(targetUserId).trim();
    const tile = findUserTile(uidStr, targetProfile);

    // Collect all matching elements in DOM (both channel view and modal stage viewer)
    const matchingTiles = new Set();
    if (tile) matchingTiles.add(tile);
    document.querySelectorAll(`[data-user-id="${uidStr}"]`).forEach(t => matchingTiles.add(t));

    // 1. Attach Pop-In Avatar Reaction Badge directly to avatar
    matchingTiles.forEach(t => {
      const wrap = t.querySelector('.speaker-avatar-wrap, .listener-avatar-wrap, .speaker-avatar, .listener-avatar') || t;
      if (wrap) {
        // Remove prior badge to cleanly re-trigger pop animation
        const existingBadge = wrap.querySelector('.avatar-reaction-badge');
        if (existingBadge) existingBadge.remove();

        const badge = document.createElement('div');
        badge.className = 'avatar-reaction-badge';
        badge.textContent = emoji;
        wrap.appendChild(badge);

        setTimeout(() => {
          if (badge.parentElement) badge.remove();
        }, 2400);
      }
    });

    // 2. Floating burst reactions floating upward from avatar center
    const primeTile = (tile && isElementRenderedVisible(tile)) ? tile : (Array.from(matchingTiles).find(t => isElementRenderedVisible(t)) || tile);
    if (primeTile) {
      const rect = primeTile.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const centerX = rect.left + (rect.width / 2);
        const centerY = rect.top + (rect.height / 2);

        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            const floater = document.createElement('div');
            floater.className = 'target-floating-reaction';
            floater.textContent = emoji;
            floater.style.position = 'fixed';
            floater.style.left = `${Math.round(centerX + (Math.random() * 32 - 16))}px`;
            floater.style.top = `${Math.round(centerY)}px`;
            floater.style.zIndex = '99999';
            floater.style.pointerEvents = 'none';
            document.body.appendChild(floater);
            setTimeout(() => floater.remove(), 1800);
          }, i * 120);
        }
      }
    }
  }

  // Floating notification directly on top of target user when reactions are maxed out
  function showTargetUserMaxedOutNotification(targetUserId, message) {
    if (!targetUserId) return;
    const tile = findUserTile(targetUserId);

    const text = message || "You’ve maxed out reacts to this speaker! You can give more in a bit.";
    console.warn(`[Clubhouse Reaction Notice] User ${targetUserId}: ${text}`);

    if (!tile) {
      return;
    }

    const existingId = `maxed-out-notice-${targetUserId}`;
    const existing = document.getElementById(existingId);
    if (existing) {
      existing.remove();
    }

    const rect = tile.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    let topPos = rect.top - 8;
    if (topPos < 10) topPos = Math.max(10, rect.top - 4);

    const notice = document.createElement('div');
    notice.id = existingId;
    notice.className = 'maxed-out-reaction-notice';
    notice.innerHTML = `
      <div class="maxed-out-content">
        <span class="maxed-out-icon">⚠️</span>
        <span class="maxed-out-text">${escapeHtml(text)}</span>
      </div>
    `;

    notice.style.left = `${Math.round(centerX)}px`;
    notice.style.top = `${Math.round(topPos)}px`;
    document.body.appendChild(notice);

    setTimeout(() => {
      if (notice.parentElement) {
        notice.remove();
      }
    }, 4000);
  }

  function handleReactionApiResponse(res, fallbackTargetId) {
    if (!res) return;
    const msg = res.error || (res.isMaxedOut ? "You’ve maxed out reacts to this speaker! You can give more in a bit." : null);
    const isMaxed = Boolean(res.isMaxedOut || (msg && /maxed\s*out/i.test(msg)));

    if (isMaxed) {
      const displayMsg = msg || "You’ve maxed out reacts to this speaker! You can give more in a bit.";
      console.warn(`[Clubhouse Reaction Rate Limit]:`, displayMsg);
      showAlert('warning', displayMsg);

      let targetIds = [];
      if (Array.isArray(res.maxedOutTargetIds) && res.maxedOutTargetIds.length > 0) {
        targetIds = res.maxedOutTargetIds;
      } else if (res.targetUserId) {
        targetIds = Array.isArray(res.targetUserId) ? res.targetUserId : [res.targetUserId];
      } else if (fallbackTargetId) {
        targetIds = Array.isArray(fallbackTargetId) ? fallbackTargetId : [fallbackTargetId];
      }

      if (targetIds.length > 0) {
        targetIds.forEach(tId => {
          if (tId && tId !== 'ALL_USERS') {
            showTargetUserMaxedOutNotification(tId, displayMsg);
          }
        });
      }
      return;
    }

    if (res.success === false && res.error) {
      console.warn(`[Clubhouse Reaction Failed]:`, res.error);
      showAlert('warning', res.error);
    }
  }

  function triggerStageReactionAnimation(fromUserId, targetUserId, emoji = '❤️', fromProfile = null, targetProfile = null) {
    const targetTile = targetUserId ? findUserTile(targetUserId, targetProfile) : null;
    const fromTile = fromUserId ? (findUserTile(fromUserId, fromProfile) ||
                     (String(fromUserId) === String(getLoggedInUserId()) ?
                       (document.querySelector('.speaker-tile.is-self') ||
                        document.querySelector('.listener-tile.is-self') ||
                        document.getElementById('home-avatar')) : null)) : null;

    // Profile box to target profile box animation
    if (fromTile && targetTile && fromTile !== targetTile) {
      const fromRect = fromTile.getBoundingClientRect();
      const toRect = targetTile.getBoundingClientRect();

      // Ensure coordinates fall nicely within viewport
      const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
      const fromCenterX = clamp((fromRect.left + (fromRect.width / 2)) || (window.innerWidth / 3), 40, window.innerWidth - 40);
      const fromCenterY = clamp((fromRect.top + (fromRect.height / 2)) || (window.innerHeight / 2), 60, window.innerHeight - 80);
      const toCenterX = clamp((toRect.left + (toRect.width / 2)) || (window.innerWidth * 2 / 3), 40, window.innerWidth - 40);
      const toCenterY = clamp((toRect.top + (toRect.height / 2)) || (window.innerHeight / 2), 60, window.innerHeight - 80);

      let fromName = (fromProfile && (fromProfile.name || fromProfile.first_name || fromProfile.username)) ||
                     (fromTile.querySelector('.speaker-name-text') || fromTile.querySelector('.listener-name-text') || fromTile.querySelector('.speaker-tile-name'))?.textContent?.trim();
      let toName = (targetProfile && (targetProfile.name || targetProfile.first_name || targetProfile.username)) ||
                   (targetTile.querySelector('.speaker-name-text') || targetTile.querySelector('.listener-name-text') || targetTile.querySelector('.speaker-tile-name'))?.textContent?.trim();

      if (!fromName && currentActiveRoom) {
        const u = [
          ...(currentActiveRoom.speakers || []),
          ...(currentActiveRoom.listeners || []),
          ...(currentActiveRoom.users || [])
        ].find(x => String(x.userId || x.user_id || x.id) === String(fromUserId));
        fromName = (u && (u.name || u.first_name)) || (String(fromUserId) === String(getLoggedInUserId()) ? 'You' : 'Member');
      }

      if (!toName && currentActiveRoom) {
        const u = [
          ...(currentActiveRoom.speakers || []),
          ...(currentActiveRoom.listeners || []),
          ...(currentActiveRoom.users || [])
        ].find(x => String(x.userId || x.user_id || x.id) === String(targetUserId));
        toName = (u && (u.name || u.first_name)) || (String(targetUserId) === String(getLoggedInUserId()) ? 'You' : 'Member');
      }
      fromName = fromName || (String(fromUserId) === String(getLoggedInUserId()) ? 'You' : 'Speaker');
      toName = toName || 'Speaker';

      // 1. Subtle pop effect on sender profile box
      fromTile.classList.add('reaction-sender-popping');
      setTimeout(() => fromTile.classList.remove('reaction-sender-popping'), 450);

      // 2. Create the flying reaction element with the emoji and names badge
      const flyingEl = document.createElement('div');
      flyingEl.className = 'flying-stage-reaction';
      flyingEl.innerHTML = `
        <span class="flying-emoji-icon">${escapeHtml(emoji)}</span>
        <span class="flying-reaction-names">${escapeHtml(fromName)} → ${escapeHtml(toName)}</span>
      `;
      flyingEl.style.position = 'fixed';
      flyingEl.style.left = `${Math.round(fromCenterX)}px`;
      flyingEl.style.top = `${Math.round(fromCenterY)}px`;
      flyingEl.style.transform = 'translate(-50%, -50%) scale(0.6)';
      flyingEl.style.opacity = '1';
      flyingEl.style.zIndex = '99999';
      flyingEl.style.pointerEvents = 'none';
      document.body.appendChild(flyingEl);

      // Arc calculation for smooth parabolic trajectory from profile box to target profile box
      const deltaX = toCenterX - fromCenterX;
      const deltaY = toCenterY - fromCenterY;
      const distance = Math.hypot(deltaX, deltaY);
      const arcHeight = Math.min(120, Math.max(40, distance * 0.22));
      const midX = (fromCenterX + toCenterX) / 2;
      const midY = (fromCenterY + toCenterY) / 2 - arcHeight;

      if (typeof flyingEl.animate === 'function') {
        const anim = flyingEl.animate([
          {
            left: `${Math.round(fromCenterX)}px`,
            top: `${Math.round(fromCenterY)}px`,
            transform: 'translate(-50%, -50%) scale(0.6)',
            opacity: 0.95
          },
          {
            left: `${Math.round(midX)}px`,
            top: `${Math.round(midY)}px`,
            transform: 'translate(-50%, -50%) scale(1.35) rotate(-5deg)',
            opacity: 1,
            offset: 0.45
          },
          {
            left: `${Math.round(toCenterX)}px`,
            top: `${Math.round(toCenterY)}px`,
            transform: 'translate(-50%, -50%) scale(1.2) rotate(0deg)',
            opacity: 1,
            offset: 0.88
          },
          {
            left: `${Math.round(toCenterX)}px`,
            top: `${Math.round(toCenterY)}px`,
            transform: 'translate(-50%, -50%) scale(1.45)',
            opacity: 0,
            offset: 1
          }
        ], {
          duration: 800,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards'
        });

        anim.onfinish = () => {
          if (flyingEl.parentElement) {
            flyingEl.remove();
          }
          // Celebration & impact on target profile box
          targetTile.classList.add('reaction-target-pulsing');
          setTimeout(() => targetTile.classList.remove('reaction-target-pulsing'), 650);
          triggerTargetEmojiAnimation(targetUserId, emoji, targetProfile);
        };
      } else {
        flyingEl.style.transition = 'left 0.75s cubic-bezier(0.25, 1, 0.5, 1), top 0.75s cubic-bezier(0.25, 1, 0.5, 1), transform 0.75s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.75s ease';
        requestAnimationFrame(() => {
          flyingEl.style.left = `${Math.round(toCenterX)}px`;
          flyingEl.style.top = `${Math.round(toCenterY)}px`;
          flyingEl.style.transform = 'translate(-50%, -50%) scale(1.25)';
        });
        setTimeout(() => {
          if (flyingEl.parentElement) flyingEl.remove();
          targetTile.classList.add('reaction-target-pulsing');
          setTimeout(() => targetTile.classList.remove('reaction-target-pulsing'), 650);
          triggerTargetEmojiAnimation(targetUserId, emoji, targetProfile);
        }, 750);
      }
      return;
    }

    // If only target tile is found: audience member or off-screen member reacting to target speaker
    if (targetTile) {
      const toRect = targetTile.getBoundingClientRect();
      const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
      const toCenterX = clamp((toRect.left + (toRect.width / 2)) || (window.innerWidth / 2), 40, window.innerWidth - 40);
      const toCenterY = clamp((toRect.top + (toRect.height / 2)) || (window.innerHeight / 2), 60, window.innerHeight - 80);
      const startX = toCenterX + (Math.random() * 60 - 30);
      const startY = window.innerHeight - 60;

      let fromName = (fromProfile && (fromProfile.name || fromProfile.first_name || fromProfile.username)) || 'Member';
      let toName = (targetProfile && (targetProfile.name || targetProfile.first_name || targetProfile.username)) ||
                   (targetTile.querySelector('.speaker-name-text') || targetTile.querySelector('.listener-name-text') || targetTile.querySelector('.speaker-tile-name'))?.textContent?.trim() || 'Speaker';

      const flyingEl = document.createElement('div');
      flyingEl.className = 'flying-stage-reaction';
      flyingEl.innerHTML = `
        <span class="flying-emoji-icon">${escapeHtml(emoji)}</span>
        <span class="flying-reaction-names">${escapeHtml(fromName)} → ${escapeHtml(toName)}</span>
      `;
      flyingEl.style.position = 'fixed';
      flyingEl.style.left = `${Math.round(startX)}px`;
      flyingEl.style.top = `${Math.round(startY)}px`;
      flyingEl.style.zIndex = '99999';
      flyingEl.style.pointerEvents = 'none';
      document.body.appendChild(flyingEl);

      if (typeof flyingEl.animate === 'function') {
        const anim = flyingEl.animate([
          { left: `${Math.round(startX)}px`, top: `${Math.round(startY)}px`, transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0.95 },
          { left: `${Math.round((startX + toCenterX) / 2)}px`, top: `${Math.round(toCenterY - 40)}px`, transform: 'translate(-50%, -50%) scale(1.3) rotate(-5deg)', opacity: 1, offset: 0.5 },
          { left: `${Math.round(toCenterX)}px`, top: `${Math.round(toCenterY)}px`, transform: 'translate(-50%, -50%) scale(1.2) rotate(0deg)', opacity: 1, offset: 0.88 },
          { left: `${Math.round(toCenterX)}px`, top: `${Math.round(toCenterY)}px`, transform: 'translate(-50%, -50%) scale(1.45)', opacity: 0, offset: 1 }
        ], { duration: 750, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });

        anim.onfinish = () => {
          if (flyingEl.parentElement) flyingEl.remove();
          targetTile.classList.add('reaction-target-pulsing');
          setTimeout(() => targetTile.classList.remove('reaction-target-pulsing'), 650);
          triggerTargetEmojiAnimation(targetUserId, emoji, targetProfile);
        };
      } else {
        setTimeout(() => {
          if (flyingEl.parentElement) flyingEl.remove();
          targetTile.classList.add('reaction-target-pulsing');
          setTimeout(() => targetTile.classList.remove('reaction-target-pulsing'), 650);
          triggerTargetEmojiAnimation(targetUserId, emoji, targetProfile);
        }, 650);
      }
      return;
    }

    // If only sender tile is found, burst emoji directly on sender profile box
    if (fromTile) {
      fromTile.classList.add('reaction-sender-popping');
      setTimeout(() => fromTile.classList.remove('reaction-sender-popping'), 450);
      triggerTargetEmojiAnimation(fromUserId, emoji, fromProfile);
      return;
    }

    // Fallback: neither tile visible in current DOM
    triggerFloatingReaction(emoji, (fromProfile && (fromProfile.name || fromProfile.first_name)) || null);
    if (fromUserId) {
      getProfileCached(fromUserId).then(p => {
        const n = (fromProfile && (fromProfile.name || fromProfile.first_name)) || (p && (p.name || p.first_name)) || 'A member';
        showChannelToast('reaction', { user_id: fromUserId, name: n }, `reacted with ${emoji}`, emoji);
      }).catch(() => {});
    }
  }

  // Helper: Normalize room chat message from PubNub, REST, or Local Client
  function normalizeChatMessage(m) {
    if (!m || typeof m === 'string') return null;

    // Filter out reactions or non-chat ticker events
    if (m.message_type === 6 || m.reaction) {
      return null;
    }

    const messageText = String(m.message || m.text || (m.channel_message && (m.channel_message.message || m.channel_message.text)) || '').trim();
    if (!messageText) {
      return null;
    }

    const myId = getLoggedInUserId();
    const myUser = getLoggedInUser() || (activeProfile && activeProfile.user) || {};

    // Extract user profile / author from all possible shapes
    const author = m.user_profile || m.user || m.action_user_profile || m.sender || {};
    const userId = String(m.from_user_id || m.user_id || author.user_id || author.id || '');
    const isMe = Boolean(myId && userId && String(userId) === String(myId));

    let name = m.from_name || author.name || author.displayname || m.name || '';
    let username = m.from_username || author.username || m.username || '';
    let photo = m.from_photo_url || author.photo_url || m.photo_url || '';

    // If it's the current logged in user and details are missing or generic:
    if (isMe) {
      if (!name || name === 'Member') {
        name = myUser.name || myUser.displayname || (activeProfile && activeProfile.user && (activeProfile.user.name || activeProfile.user.displayname)) || 'You';
      }
      if (!username) {
        username = myUser.username || (activeProfile && activeProfile.user && activeProfile.user.username) || '';
      }
      if (!photo) {
        photo = myUser.photo_url || (activeProfile && activeProfile.user && activeProfile.user.photo_url) || '';
      }
    }

    // Check cached profile if available
    if ((!name || name === 'Member' || !photo) && userId && profileCache.has(userId)) {
      const cp = profileCache.get(userId);
      if (cp.name && cp.name !== 'Member') name = cp.name;
      if (cp.username && !username) username = cp.username;
      if (cp.photo_url && !photo) photo = cp.photo_url;
    }

    // If still missing name or photo, check active channel users and speakers:
    if ((!name || name === 'Member' || !photo) && userId && currentActiveRoom) {
      const roomUsers = [
        ...(Array.isArray(currentActiveRoom.users) ? currentActiveRoom.users : []),
        ...(Array.isArray(currentActiveRoom.speakers) ? currentActiveRoom.speakers : [])
      ];
      const found = roomUsers.find(ru => String(ru.user_id || ru.userId) === String(userId));
      if (found) {
        if (!name || name === 'Member') name = found.name || found.displayname || '';
        if (!username) username = found.username || '';
        if (!photo) photo = found.photo_url || found.photo || '';
      }
    }

    if (!name || name.trim() === '') {
      name = username ? `@${username}` : 'Member';
    }

    // Timestamp
    const rawTime = m.time_created || m.time_received || m.timestamp || m.created_at;
    let timeStr = '';
    let rawTimestamp = 0;
    if (rawTime) {
      try {
        const dt = new Date(rawTime);
        timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        rawTimestamp = dt.getTime();
      } catch (_) {}
    }
    if (!timeStr) {
      timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      rawTimestamp = Date.now();
    }

    const messageId = String(m.message_id || m.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);

    let replyInfo = null;
    if (m.reply_to_message) {
      const repAuthor = (m.reply_to_message.user_profile && m.reply_to_message.user_profile.name) ||
                        m.reply_to_message.from_name ||
                        m.reply_to_message.name ||
                        'Member';
      const repText = m.reply_to_message.message || m.reply_to_message.text || '';
      replyInfo = { author: repAuthor, text: repText };
    }

    const result = {
      message_id: messageId,
      message: messageText,
      user_id: userId,
      name,
      username,
      photo,
      timeStr,
      rawTimestamp: rawTimestamp || Date.now(),
      isMe,
      num_likes: Number(m.num_likes || 0),
      replyInfo
    };
    if (messageId) {
      channelMessagesStore.set(String(messageId), result);
    }
    return result;
  }

  function renderSingleChatMessageHtml(m) {
    const item = (m && m.rawTimestamp && m.message_id) ? m : normalizeChatMessage(m);
    if (!item) return '';

    const initial = (item.name || 'M').charAt(0).toUpperCase();
    const avatarHtml = item.photo
      ? `<img src="${escapeHtml(item.photo)}" class="chat-msg-avatar" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'chat-msg-avatar-fallback\\'>${initial}</div>';">`
      : `<div class="chat-msg-avatar-fallback">${initial}</div>`;

    let repliedHtml = '';
    if (item.replyInfo) {
      repliedHtml = `
        <div class="chat-msg-replied-box" title="${escapeHtml(item.replyInfo.text)}">
          <span class="chat-msg-replied-author">↳ ${escapeHtml(item.replyInfo.author)}:</span>
          <span class="chat-msg-replied-text">${formatRichTextWithLinks(item.replyInfo.text)}</span>
        </div>
      `;
    }

    const youBadge = item.isMe ? `<span class="chat-msg-you-badge">You</span>` : '';

    return `
      <div class="chat-message-item ${item.isMe ? 'chat-msg-mine' : ''}" data-message-id="${escapeHtml(item.message_id)}" data-author-id="${escapeHtml(item.user_id || '')}" data-author-name="${escapeHtml(item.name || 'Member')}" data-message-text="${escapeHtml(item.message || '')}">
        <div class="chat-msg-avatar-col" data-user-id="${escapeHtml(item.user_id)}" data-username="${escapeHtml(item.username)}" title="Click to view profile" style="cursor: pointer;">
          ${avatarHtml}
        </div>
        <div class="chat-msg-content">
          <div class="chat-msg-header">
            <span class="chat-msg-author" data-user-id="${escapeHtml(item.user_id)}" data-username="${escapeHtml(item.username)}" title="Click to view profile" style="cursor: pointer;">${escapeHtml(item.name)}</span>
            ${youBadge}
            <span class="chat-msg-time">${escapeHtml(item.timeStr)}</span>
          </div>
          ${repliedHtml}
          <div class="chat-msg-text">${formatRichTextWithLinks(item.message)}</div>
          <div class="chat-msg-footer">
            ${item.num_likes > 0 ? `<span class="chat-msg-likes">❤️ ${item.num_likes}</span>` : '<span></span>'}
            <div class="chat-msg-actions">
              <button type="button" class="btn-copy-msg" data-text="${escapeHtml(item.message)}" title="Copy message text">📋 Copy</button>
              <button type="button" class="btn-reply-msg" data-msg-id="${escapeHtml(item.message_id)}" data-author="${escapeHtml(item.name)}" data-text="${escapeHtml(item.message)}">Reply</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function appendIncomingChatMessage(msgData) {
    if (!msgData) return;
    const dataObj = (msgData.channel_message && typeof msgData.channel_message === 'object')
      ? msgData.channel_message
      : (typeof msgData === 'object' ? msgData : null);
    if (!dataObj) return;

    if (dataObj.message_type === 6 || dataObj.reaction) {
      const reactionEmoji = (dataObj.reaction && (dataObj.reaction.emoji || dataObj.reaction.emoji_code)) || dataObj.emoji || '❤️';
      const actionProfile = dataObj.action_user_profile || dataObj.user_profile;
      const targetProfile = dataObj.target_user_profile || dataObj.target_user;
      const fromId = dataObj.from_user_id || dataObj.user_id || (actionProfile && (actionProfile.id || actionProfile.user_id));
      const targetId = dataObj.target_user_id || (Array.isArray(dataObj.target_user_ids) && dataObj.target_user_ids[0]) || (targetProfile && (targetProfile.id || targetProfile.user_id));
      triggerStageReactionAnimation(fromId, targetId, reactionEmoji, actionProfile, targetProfile);
      return;
    }

    const norm = normalizeChatMessage(dataObj);
    if (!norm || !norm.message) return;

    const msgList = document.getElementById('chat-messages-list');

    // If chat drawer is currently open:
    if (isChatPanelOpen && msgList) {
      const emptyState = msgList.querySelector('.chat-empty-state');
      if (emptyState) emptyState.remove();

      // Deduplicate if already present by message ID
      if (norm.message_id && msgList.querySelector(`.chat-message-item[data-message-id="${norm.message_id}"]`)) {
        return;
      }

      // Reconcile optimistic temp message sent by me
      let reconciled = false;
      const myId = getLoggedInUserId();
      if (myId && norm.user_id && String(norm.user_id) === String(myId)) {
        const tempItems = msgList.querySelectorAll('.chat-message-item[data-message-id^="temp_"]');
        for (const tItem of tempItems) {
          const textEl = tItem.querySelector('.chat-msg-text');
          if (textEl && textEl.textContent.trim() === norm.message.trim()) {
            tItem.setAttribute('data-message-id', norm.message_id);
            reconciled = true;
            break;
          }
        }
      }

      if (!reconciled) {
        totalRoomMessagesCount++;
        updateChatCountPill(totalRoomMessagesCount);

        // Check if user is scrolled up reading earlier messages
        const isNearBottom = (msgList.scrollHeight - msgList.scrollTop - msgList.clientHeight) < 100;

        const temp = document.createElement('div');
        temp.innerHTML = renderSingleChatMessageHtml(norm);
        const itemEl = temp.firstElementChild;
        if (itemEl) {
          msgList.appendChild(itemEl);
          wireChatReplyButtons(itemEl);
          if (isNearBottom) {
            msgList.scrollTop = msgList.scrollHeight;
          }
        }
      }

      // Asynchronously resolve authentic profile if name is 'Member' or avatar missing
      if (norm.user_id && (!norm.name || norm.name === 'Member' || !norm.photo)) {
        getProfileCached(norm.user_id).then(prof => {
          if (prof && prof.name && prof.name !== 'Member') {
            const el = msgList.querySelector(`.chat-message-item[data-message-id="${norm.message_id}"]`);
            if (el) {
              const authorEl = el.querySelector('.chat-msg-author');
              if (authorEl && (authorEl.textContent === 'Member' || !authorEl.textContent)) {
                authorEl.textContent = prof.name;
              }
              const avatarCol = el.querySelector('.chat-msg-avatar-col');
              if (avatarCol && prof.photo_url && !avatarCol.querySelector('img')) {
                avatarCol.innerHTML = `<img src="${escapeHtml(prof.photo_url)}" class="chat-msg-avatar" alt="${escapeHtml(prof.name)}">`;
              }
            }
          }
        }).catch(console.warn);
      }
    } else {
      // Chat drawer is closed: message is already stored in channelMessagesStore!
      totalRoomMessagesCount++;
      updateChatCountPill(totalRoomMessagesCount);
      unreadChatCount++;
      const btnTopRoomChat = document.getElementById('btn-top-room-chat');
      if (btnTopRoomChat) {
        btnTopRoomChat.innerHTML = `<span>💬 Room Chat <span class="badge-chat-unread">${unreadChatCount}</span></span>`;
      }
    }
  }

  let activeChatReplyTo = null;

  function cancelChatReply() {
    activeChatReplyTo = null;
    const replyBar = document.getElementById('chat-reply-bar');
    const chatInput = document.getElementById('chat-input-text');
    if (replyBar) replyBar.style.display = 'none';
    if (chatInput) chatInput.placeholder = 'Type a message to the room...';
  }

  function setChatReplyTo(messageId, authorName) {
    activeChatReplyTo = { messageId, authorName };
    const replyBar = document.getElementById('chat-reply-bar');
    const replyNameEl = document.getElementById('chat-reply-name');
    const chatInput = document.getElementById('chat-input-text');
    if (replyBar) replyBar.style.display = 'flex';
    if (replyNameEl) replyNameEl.textContent = authorName;
    if (chatInput) {
      chatInput.placeholder = `Replying to ${authorName}...`;
      chatInput.focus();
    }
  }

  function wireChatReplyButtons(container) {
    if (!container) return;
    container.querySelectorAll('.btn-reply-msg').forEach(btn => {
      if (btn.hasAttribute('data-wired')) return;
      btn.setAttribute('data-wired', 'true');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const msgId = btn.getAttribute('data-msg-id');
        const author = btn.getAttribute('data-author') || 'Member';
        setChatReplyTo(msgId, author);
      });
    });

    // Wire message text copy button
    container.querySelectorAll('.btn-copy-msg').forEach(btn => {
      if (btn.hasAttribute('data-copy-wired')) return;
      btn.setAttribute('data-copy-wired', 'true');
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-text') || '';
        if (!text) return;
        try {
          if (window.powerdeckAPI && window.powerdeckAPI.copyToClipboard) {
            await window.powerdeckAPI.copyToClipboard(text);
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
          }
          const orig = btn.innerHTML;
          btn.innerHTML = '✓ Copied!';
          btn.classList.add('is-copied');
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.classList.remove('is-copied');
          }, 1500);
        } catch (err) {
          console.warn('Copy message text error:', err);
        }
      });
    });

    // Wire clicking on avatar or author name to open full user profile
    container.querySelectorAll('.chat-msg-avatar-col, .chat-msg-author').forEach(el => {
      if (el.hasAttribute('data-profile-wired')) return;
      el.setAttribute('data-profile-wired', 'true');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = el.getAttribute('data-user-id');
        const username = el.getAttribute('data-username');
        if (uid || username) {
          openUserProfileModal(uid, 'room_chat', username, true);
        }
      });
    });
  }

  async function sendChatMessage(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!currentActiveRoom || !currentActiveRoom.channel) {
      showAlert('warning', 'Please join a channel to send room messages.');
      return;
    }
    const chatInput = document.getElementById('chat-input-text');
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;

    const replyId = activeChatReplyTo ? activeChatReplyTo.messageId : null;
    const replyAuthor = activeChatReplyTo ? activeChatReplyTo.authorName : null;
    const btnSend = document.getElementById('btn-chat-send');
    if (btnSend) btnSend.disabled = true;

    // Immediately append optimistic message with authentic user profile info
    const myId = getLoggedInUserId();
    const myUser = getLoggedInUser() || (activeProfile && activeProfile.user) || {};
    const myName = myUser.name || myUser.displayname || (activeProfile && activeProfile.user && (activeProfile.user.name || activeProfile.user.displayname)) || 'You';
    const myPhoto = myUser.photo_url || (activeProfile && activeProfile.user && activeProfile.user.photo_url) || '';
    const myUsername = myUser.username || (activeProfile && activeProfile.user && activeProfile.user.username) || '';
    const tempMsgId = `temp_${Date.now()}`;

    const optimisticMsg = {
      message_id: tempMsgId,
      message: text,
      from_user_id: myId,
      from_name: myName,
      from_username: myUsername,
      from_photo_url: myPhoto,
      time_received: new Date().toISOString(),
      rawTimestamp: Date.now(),
      reply_to_message: replyId ? {
        message: replyAuthor ? `Replying to ${replyAuthor}` : '',
        user_profile: { name: replyAuthor }
      } : null
    };

    appendIncomingChatMessage(optimisticMsg);
    chatInput.value = '';
    cancelChatReply();

    const msgList = document.getElementById('chat-messages-list');
    if (msgList) msgList.scrollTop = msgList.scrollHeight;

    try {
      console.log(`[Clubhouse] Calling /api/send_channel_message to ${currentActiveRoom.channel}, replyId=${replyId}`);
      const res = await window.powerdeckAPI.sendChannelMessage(currentActiveRoom.channel, text, replyId);
      console.log("[Clubhouse] sendChannelMessage response:", res);

      // Reconcile real ID if returned in API response
      if (res && res.data) {
        const realId = String(res.data.message_id || res.data.channel_message_id || '');
        if (realId) {
          if (channelMessagesStore.has(tempMsgId)) {
            const item = channelMessagesStore.get(tempMsgId);
            item.message_id = realId;
            channelMessagesStore.delete(tempMsgId);
            channelMessagesStore.set(realId, item);
          }
          if (msgList) {
            const tempEl = msgList.querySelector(`.chat-message-item[data-message-id="${tempMsgId}"]`);
            if (tempEl) {
              tempEl.setAttribute('data-message-id', realId);
            }
          }
        }
      }
    } catch (err) {
      console.error("[Clubhouse] sendChannelMessage error:", err);
      showAlert('error', `Failed to send room message: ${err.message}`);
      if (msgList) {
        const tempEl = msgList.querySelector(`.chat-message-item[data-message-id="${tempMsgId}"]`);
        if (tempEl) tempEl.remove();
      }
    } finally {
      if (btnSend) btnSend.disabled = false;
    }
  }

  function openRoomChat() {
    const chatPanel = document.getElementById('channel-chat-panel');
    const btnTopRoomChat = document.getElementById('btn-top-room-chat');
    if (!currentActiveRoom || !chatPanel) return;
    chatPanel.style.display = 'flex';
    if (btnTopRoomChat) {
      btnTopRoomChat.classList.add('active');
      btnTopRoomChat.innerHTML = '<span>💬 Room Chat</span>';
    }
    unreadChatCount = 0;
    isChatPanelOpen = true;
    updateChatCountPill(totalRoomMessagesCount);

    // Render stored messages immediately if present so drawer opens without delay
    renderAllStoredChatMessages();

    // Call get_channel_messages once on join/first open if not already fetched
    if (!hasFetchedInitialChannelMessages) {
      fetchInitialChannelMessages(false);
    }
  }

  function closeRoomChat() {
    const chatPanel = document.getElementById('channel-chat-panel');
    const btnTopRoomChat = document.getElementById('btn-top-room-chat');
    if (!chatPanel) return;
    chatPanel.style.display = 'none';
    if (btnTopRoomChat) {
      btnTopRoomChat.classList.remove('active');
      btnTopRoomChat.innerHTML = '<span>💬 Room Chat</span>';
    }
    unreadChatCount = 0;
    isChatPanelOpen = false;
    cancelChatReply();
    if (chatPollTimer) {
      clearInterval(chatPollTimer);
      chatPollTimer = null;
    }
  }

  let chatNextCursor = null;
  let isLoadingOlderChatMessages = false;

  async function loadOlderChannelMessages() {
    if (!currentActiveRoom || !currentActiveRoom.channel || !chatNextCursor || isLoadingOlderChatMessages) return;
    isLoadingOlderChatMessages = true;

    const msgList = document.getElementById('chat-messages-list');
    const oldBtn = document.getElementById('btn-load-older-messages');
    if (oldBtn) {
      oldBtn.classList.add('is-loading');
      oldBtn.innerHTML = '<span class="chat-load-icon">⏳</span> <span>Loading older messages...</span>';
    }

    const prevScrollHeight = msgList ? msgList.scrollHeight : 0;
    const prevScrollTop = msgList ? msgList.scrollTop : 0;

    try {
      console.log(`[Clubhouse] Fetching older messages for ${currentActiveRoom.channel} with next_cursor=${chatNextCursor}...`);
      const res = await window.powerdeckAPI.getChannelMessages(currentActiveRoom.channel, false, chatNextCursor);
      if (res && res.success && res.data) {
        chatNextCursor = res.data.next_cursor || null;
        if (typeof res.data.num_messages === 'number' && res.data.num_messages > totalRoomMessagesCount) {
          totalRoomMessagesCount = res.data.num_messages;
          updateChatCountPill(totalRoomMessagesCount);
        }
        if (Array.isArray(res.data.messages)) {
          const msgs = res.data.messages.filter(m => (m && (m.message || m.text) && String(m.message || m.text).trim().length > 0 && m.message_type !== 6));
          msgs.forEach(m => normalizeChatMessage(m));
        }
      } else {
        chatNextCursor = null;
      }
    } catch (err) {
      console.warn('[Clubhouse] Failed to load older messages:', err);
    } finally {
      isLoadingOlderChatMessages = false;
      renderAllStoredChatMessages(false);
      if (msgList) {
        const newScrollHeight = msgList.scrollHeight;
        msgList.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
      }
    }
  }

  function renderAllStoredChatMessages(autoScrollToBottom = true) {
    const msgList = document.getElementById('chat-messages-list');
    if (!msgList) return;

    const allMsgs = Array.from(channelMessagesStore.values())
      .filter(m => m && m.message && String(m.message).trim().length > 0)
      .sort((a, b) => (a.rawTimestamp || 0) - (b.rawTimestamp || 0));

    if (allMsgs.length === 0) {
      msgList.innerHTML = `
        <div class="chat-empty-state">
          <span class="chat-empty-icon">💭</span>
          <p>No messages yet in this room.</p>
        </div>
      `;
      return;
    }

    let historyBannerHtml = '';
    if (chatNextCursor) {
      historyBannerHtml = `
        <div class="chat-load-older-banner" id="btn-load-older-messages" title="Click to load older messages">
          <span class="chat-load-icon">📜</span>
          <span>Load older messages</span>
        </div>
      `;
    } else if (allMsgs.length > 5) {
      historyBannerHtml = `<div class="chat-history-hint">Beginning of room chat history</div>`;
    }

    msgList.innerHTML = historyBannerHtml + allMsgs.map(m => renderSingleChatMessageHtml(m)).join('');
    wireChatReplyButtons(msgList);

    const btnLoadOlder = document.getElementById('btn-load-older-messages');
    if (btnLoadOlder) {
      btnLoadOlder.addEventListener('click', (e) => {
        e.stopPropagation();
        loadOlderChannelMessages();
      });
    }

    if (!msgList.hasAttribute('data-scroll-pagination-wired')) {
      msgList.setAttribute('data-scroll-pagination-wired', 'true');
      msgList.addEventListener('scroll', () => {
        if (msgList.scrollTop < 25 && chatNextCursor && !isLoadingOlderChatMessages) {
          loadOlderChannelMessages();
        }
      });
    }

    // Asynchronously resolve authentic profiles for any senders missing names/avatars
    allMsgs.forEach(m => {
      const uId = String(m.user_id || '');
      if (uId && (!m.name || m.name === 'Member' || !m.photo)) {
        getProfileCached(uId).then(prof => {
          if (prof && prof.name && prof.name !== 'Member') {
            const el = msgList.querySelector(`.chat-message-item[data-message-id="${m.message_id}"]`);
            if (el) {
              const authorEl = el.querySelector('.chat-msg-author');
              if (authorEl && (authorEl.textContent === 'Member' || !authorEl.textContent)) {
                authorEl.textContent = prof.name;
              }
              const avatarCol = el.querySelector('.chat-msg-avatar-col');
              if (avatarCol && prof.photo_url && !avatarCol.querySelector('img')) {
                avatarCol.innerHTML = `<img src="${escapeHtml(prof.photo_url)}" class="chat-msg-avatar" alt="${escapeHtml(prof.name)}">`;
              }
            }
          }
        }).catch(console.warn);
      }
    });

    // Auto-scroll to latest messages at the bottom when requested
    if (autoScrollToBottom) {
      msgList.scrollTop = msgList.scrollHeight;
    }
  }

  async function fetchInitialChannelMessages(forceRefresh = false) {
    if (!currentActiveRoom || !currentActiveRoom.channel) return;
    if (hasFetchedInitialChannelMessages && !forceRefresh) return;
    hasFetchedInitialChannelMessages = true;

    const msgList = document.getElementById('chat-messages-list');
    if (channelMessagesStore.size === 0 && msgList) {
      msgList.innerHTML = `
        <div class="chat-empty-state" style="padding: 24px; text-align: center; color: var(--text-muted);">
          <span>Loading messages...</span>
        </div>
      `;
    }

    try {
      console.log(`[Clubhouse] Calling get_channel_messages for ${currentActiveRoom.channel} (once on join)...`);
      const res = await window.powerdeckAPI.getChannelMessages(currentActiveRoom.channel, false, null);
      if (res && res.success && res.data) {
        chatNextCursor = res.data.next_cursor || null;
        if (typeof res.data.num_messages === 'number') {
          totalRoomMessagesCount = res.data.num_messages;
        } else if (Array.isArray(res.data.messages)) {
          totalRoomMessagesCount = res.data.messages.length;
        }
        updateChatCountPill(totalRoomMessagesCount);

        if (Array.isArray(res.data.messages)) {
          const msgs = res.data.messages.filter(m => (m && (m.message || m.text) && String(m.message || m.text).trim().length > 0 && m.message_type !== 6));
          // Normalize each message and store in channelMessagesStore (does not wipe messages received via PubNub)
          msgs.forEach(m => {
            normalizeChatMessage(m);
          });
        }
      }
    } catch (e) {
      console.warn("[Clubhouse] getChannelMessages error:", e);
    } finally {
      renderAllStoredChatMessages();
    }
  }

  function loadRoomMessages() {
    return fetchInitialChannelMessages(true);
  }

  // Get all active speakers user IDs on stage (strictly other speakers, never listeners, excluding own user ID)
  function getAllSpeakerUserIds(excludeSelf = true) {
    const ids = new Set();
    const myId = Number(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))));

    if (currentActiveRoom) {
      if (Array.isArray(currentActiveRoom.speakers)) {
        currentActiveRoom.speakers.forEach(s => {
          const uid = Number(s.user_id || s.userId || s.id);
          if (!isNaN(uid) && uid > 0 && (!excludeSelf || uid !== myId)) {
            ids.add(uid);
          }
        });
      }
      if (Array.isArray(currentActiveRoom.users)) {
        currentActiveRoom.users.forEach(u => {
          if (u && (u.is_speaker === true || u.is_speaker === 1 || u.is_moderator === true)) {
            const uid = Number(u.user_id || u.userId || u.id);
            if (!isNaN(uid) && uid > 0 && (!excludeSelf || uid !== myId)) {
              ids.add(uid);
            }
          }
        });
      }
    }
    document.querySelectorAll('#speakers-grid .speaker-tile, .speaker-tile').forEach(t => {
      const uid = Number(t.getAttribute('data-user-id'));
      if (!isNaN(uid) && uid > 0 && (!excludeSelf || uid !== myId)) {
        ids.add(uid);
      }
    });
    return Array.from(ids);
  }

  // Fetch fresh get_channel every time react is triggered and extract ONLY speakers user IDs (never listeners, excluding own user ID to prevent overusage)
  async function getFreshSpeakerUserIds(excludeSelf = true) {
    const speakerIds = new Set();
    const myId = Number(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))));

    const chId = typeof currentActiveRoom?.channel === 'string'
      ? currentActiveRoom.channel
      : (currentActiveRoom?.id || (currentActiveRoom?.channel && (currentActiveRoom.channel.channel || currentActiveRoom.channel.id)));

    if (chId && window.powerdeckAPI && window.powerdeckAPI.getChannel) {
      try {
        console.log(`[React] Fetching fresh get_channel for ${chId} to extract speakers...`);
        const res = await window.powerdeckAPI.getChannel(chId);
        if (res && res.success && res.data) {
          const chData = (res.data && (res.data.channel || res.data.room)) || res.data;
          const userList = Array.isArray(chData.users) ? chData.users : (Array.isArray(res.data.users) ? res.data.users : []);
          userList.forEach(u => {
            if (u && (u.is_speaker === true || u.is_speaker === 1)) {
              const uid = Number(u.user_id || u.userId || u.id);
              if (!isNaN(uid) && uid > 0 && (!excludeSelf || uid !== myId)) {
                speakerIds.add(uid);
              }
            }
          });
        }
      } catch (err) {
        console.warn("[React] get_channel fetch error:", err);
      }
    }

    if (speakerIds.size > 0) {
      return Array.from(speakerIds);
    }

    return getAllSpeakerUserIds(excludeSelf);
  }

  // Get all active room users user IDs (all speakers + listeners + users in room)
  function getAllUsersUserIds() {
    const ids = new Set();
    if (currentActiveRoom) {
      if (Array.isArray(currentActiveRoom.users)) {
        currentActiveRoom.users.forEach(u => {
          const uid = Number(u.user_id || u.userId || u.id);
          if (!isNaN(uid) && uid > 0) ids.add(uid);
        });
      }
      if (Array.isArray(currentActiveRoom.speakers)) {
        currentActiveRoom.speakers.forEach(s => {
          const uid = Number(s.user_id || s.userId || s.id);
          if (!isNaN(uid) && uid > 0) ids.add(uid);
        });
      }
      if (Array.isArray(currentActiveRoom.listeners)) {
        currentActiveRoom.listeners.forEach(l => {
          const uid = Number(l.user_id || l.userId || l.id);
          if (!isNaN(uid) && uid > 0) ids.add(uid);
        });
      }
    }
    document.querySelectorAll('.speaker-tile, .listener-tile').forEach(t => {
      const uid = Number(t.getAttribute('data-user-id'));
      if (!isNaN(uid) && uid > 0) ids.add(uid);
    });
    const myId = Number(getLoggedInUserId());
    if (myId && !isNaN(myId) && myId > 0) ids.add(myId);
    return Array.from(ids);
  }

  // Bottom dock reactions popover (Stage / All Speakers)
  function updateEmojiOptions(options) {
    let items = [];
    if (Array.isArray(options) && options.length > 0) {
      items = options.map((opt, idx) => {
        if (typeof opt === 'string') {
          const emId = EMOJI_TO_REACTION_ID[opt] || (34 + idx);
          return { id: emId, emoji: opt };
        }
        const emojiStr = (opt && (opt.emoji || opt.emoji_code || opt.name)) || '❤️';
        const emId = (opt && opt.id !== undefined && !isNaN(Number(opt.id)))
          ? Number(opt.id)
          : (EMOJI_TO_REACTION_ID[emojiStr] || (34 + idx));
        return { id: emId, emoji: emojiStr };
      });
      currentEmojiReactionOptions = items;
    } else if (Array.isArray(currentEmojiReactionOptions) && currentEmojiReactionOptions.length > 0) {
      items = currentEmojiReactionOptions;
    } else {
      items = CLUBHOUSE_OFFICIAL_REACTIONS;
      currentEmojiReactionOptions = items;
    }

    const reactionsGrid = document.getElementById('reactions-emoji-grid');
    const reactionsPopover = document.getElementById('channel-reactions-popover');
    if (!reactionsGrid) return;

    reactionsGrid.innerHTML = items.map(item => `
      <button type="button" class="btn-emoji-react" data-emoji="${escapeHtml(item.emoji)}" data-reaction-id="${item.id}" title="${escapeHtml(item.emoji)} (ID: ${item.id})">
        ${escapeHtml(item.emoji)}
      </button>
    `).join('');

    reactionsGrid.querySelectorAll('.btn-emoji-react').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const emoji = btn.getAttribute('data-emoji');
        const reactionId = Number(btn.getAttribute('data-reaction-id') || EMOJI_TO_REACTION_ID[emoji] || 34);
        if (reactionsPopover) reactionsPopover.style.display = 'none';

        // Fetch fresh get_channel and get ONLY other speakers user IDs (never listeners, excluding self to prevent overusage)
        const speakerIds = await getFreshSpeakerUserIds(true);
        const myId = Number(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))));

        // Trigger visual reaction from own profile box to other speakers on stage smoothly one by one
        if (speakerIds.length > 0) {
          let staggerDelay = 0;
          speakerIds.forEach(targetId => {
            setTimeout(() => {
              triggerStageReactionAnimation(myId, targetId, emoji);
            }, staggerDelay);
            staggerDelay += 40;
          });
        } else if (myId) {
          triggerTargetEmojiAnimation(myId, emoji);
        }

        if (currentActiveRoom && currentActiveRoom.channel && speakerIds.length > 0) {
          try {
            console.log(`[Clubhouse] React for speakers: sending reaction ID ${reactionId} ("${emoji}") to ${speakerIds.length} speakers (excluding self):`, speakerIds);
            const res = await window.powerdeckAPI.sendChannelReaction(
              currentActiveRoom.channel,
              speakerIds,
              reactionId,
              false,
              emoji,
              false // Standard React uses send_channel_reaction with reaction_id
            );
            console.log("[Clubhouse] sendChannelReaction response:", res);
            handleReactionApiResponse(res, speakerIds);
          } catch (e) {
            console.warn("[Clubhouse] sendChannelReaction error:", e);
          }
        } else if (speakerIds.length === 0) {
          console.log(`[Clubhouse] No other speakers on stage besides self. Skipped API reaction to avoid overusage.`);
        }
      });
    });
  }

  // Comprehensive Windows & iOS Emoji Catalog for Extra React
  const WINDOWS_EMOJIS = {
    smileys: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '🥹',
      '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😋',
      '😛', '😜', '🤪', '😝', '🤑', '🤗', '🫣', '🤭', '🫢', '🫡',
      '🤫', '🫠', '🤔', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏',
      '😒', '🙄', '😬', '😮‍💨', '🤥', '😔', '😪', '🤤', '😴', '😷',
      '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯',
      '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮',
      '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢',
      '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤',
      '😡', '😠', '🤬', '💀', '☠️', '💩', '🤡', '👻', '👽', '🤖'
    ],
    gestures: [
      '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌',
      '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛',
      '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅',
      '🤳', '💪', '👂', '👃', '🧠', '🫀', '🫁', '👁️', '👅', '👄'
    ],
    hearts: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '💌', '💐', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '✨'
    ],
    party: [
      '🔥', '💯', '✨', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈',
      '🥉', '👑', '💎', '🚀', '⚡', '🌟', '💥', '🍿', '🍻', '🥂',
      '🍾', '🍷', '🍸', '🍹', '🍺', '☕', '🧋', '🎵', '🎶', '🎤',
      '🎧', '🎸', '🎹', '🥁', '📢', '📣', '🔔', '🪩', '🎇', '🎆'
    ],
    objects: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦅', '🦉',
      '🐺', '🦄', '🐝', '🦋', '🐢', '🐙', '🐬', '🐳', '🦈', '🐉',
      '🍀', '🍁', '🍄', '🌍', '🌙', '⭐', '☀️', '🌈', '☃️', '🚗'
    ]
  };

  let activeExtraTargetUserId = null;
  let activeExtraCategory = 'smileys';

  async function dispatchSendReaction(emoji, reactionId = 34, targetUserId = null, isExtra = false) {
    if (!emoji) return;
    const cleanEmoji = String(emoji).trim();
    if (!cleanEmoji) return;

    const myId = Number(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))));
    const resolvedReactionId = (reactionId && !isNaN(Number(reactionId)) && Number(reactionId) > 0)
      ? Number(reactionId)
      : (EMOJI_TO_REACTION_ID[cleanEmoji] || 34);

    // Support ALL_USERS or ALL_SPEAKERS or array of user IDs
    if (targetUserId === 'ALL_USERS' || targetUserId === 'ALL_SPEAKERS' || Array.isArray(targetUserId)) {
      const rawSpeakerIds = Array.isArray(targetUserId) ? targetUserId : await getFreshSpeakerUserIds(true);
      const speakerIds = rawSpeakerIds.map(Number).filter(uid => !isNaN(uid) && uid > 0 && uid !== myId);

      if (speakerIds.length > 0) {
        let staggerDelay = 0;
        speakerIds.forEach(uId => {
          setTimeout(() => {
            triggerStageReactionAnimation(myId, uId, cleanEmoji);
          }, staggerDelay);
          staggerDelay += 40;
        });
      }
      if (currentActiveRoom && currentActiveRoom.channel && speakerIds.length > 0) {
        try {
          console.log(`[Clubhouse] dispatchSendReaction to stage speakers: reaction_id=${resolvedReactionId} ("${cleanEmoji}"), isExtra=${isExtra}, targets (excluding self):`, speakerIds);
          const res = await window.powerdeckAPI.sendChannelReaction(
            currentActiveRoom.channel,
            speakerIds,
            resolvedReactionId,
            false,
            cleanEmoji,
            isExtra
          );
          console.log("[Clubhouse] sendChannelReaction response:", res);
          handleReactionApiResponse(res, speakerIds);
        } catch (e) {
          console.warn("[Clubhouse] sendChannelReaction error:", e);
        }
      } else if (speakerIds.length === 0) {
        console.log(`[Clubhouse] No other speakers on stage besides self. Skipped API reaction to avoid overusage.`);
      }
      return;
    }

    // Single target guard: if target is self, only trigger local visual animation on own profile box
    if (targetUserId && (!isNaN(Number(targetUserId)) && Number(targetUserId) === myId)) {
      console.log(`[Clubhouse] Skipping reaction to own user ID (${myId}) to prevent overusage.`);
      triggerTargetEmojiAnimation(myId, cleanEmoji);
      return;
    }

    // Trigger visual animation from person profile box to target profile box
    if (targetUserId) {
      triggerStageReactionAnimation(myId, targetUserId, cleanEmoji);
    } else {
      triggerTargetEmojiAnimation(myId, cleanEmoji);
    }

    if (currentActiveRoom && currentActiveRoom.channel && targetUserId) {
      try {
        console.log(`[Clubhouse] dispatchSendReaction: reaction_id=${resolvedReactionId}, emoji=${cleanEmoji}, target=${targetUserId}, isExtra=${isExtra}`);
        const res = await window.powerdeckAPI.sendChannelReaction(
          currentActiveRoom.channel,
          targetUserId,
          resolvedReactionId,
          false,
          cleanEmoji,
          isExtra
        );
        console.log("[Clubhouse] sendChannelReaction response:", res);
        handleReactionApiResponse(res, targetUserId);
      } catch (e) {
        console.warn("[Clubhouse] sendChannelReaction error:", e);
      }
    }
  }

  function renderExtraEmojiGrid(category) {
    const grid = document.getElementById('extra-reactions-grid');
    const popover = document.getElementById('extra-reactions-popover');
    if (!grid) return;

    let emojis = [];
    if (category === 'all') {
      emojis = Array.from(new Set([
        ...WINDOWS_EMOJIS.smileys,
        ...WINDOWS_EMOJIS.gestures,
        ...WINDOWS_EMOJIS.hearts,
        ...WINDOWS_EMOJIS.party,
        ...WINDOWS_EMOJIS.objects
      ]));
    } else if (WINDOWS_EMOJIS[category]) {
      emojis = WINDOWS_EMOJIS[category];
    } else {
      emojis = WINDOWS_EMOJIS.smileys;
    }

    grid.innerHTML = emojis.map((em, idx) => {
      const emId = EMOJI_TO_REACTION_ID[em] || 34;
      return `
        <button type="button" class="btn-emoji-react" data-emoji="${escapeHtml(em)}" data-reaction-id="${emId}" title="${escapeHtml(em)}">
          ${escapeHtml(em)}
        </button>
      `;
    }).join('');

    grid.querySelectorAll('.btn-emoji-react').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const emoji = btn.getAttribute('data-emoji');
        const reactionId = Number(btn.getAttribute('data-reaction-id') || 34);
        if (popover) popover.style.display = 'none';

        if (activeExtraTargetUserId === 'ALL_USERS' || activeExtraTargetUserId === 'ALL_SPEAKERS') {
          const speakerIds = await getFreshSpeakerUserIds(true);
          const myId = Number(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))));
          if (speakerIds.length > 0) {
            let staggerDelay = 0;
            speakerIds.forEach(uId => {
              setTimeout(() => {
                triggerStageReactionAnimation(myId, uId, emoji);
              }, staggerDelay);
              staggerDelay += 40;
            });
          } else if (myId) {
            triggerTargetEmojiAnimation(myId, emoji);
          }
          if (currentActiveRoom && currentActiveRoom.channel && speakerIds.length > 0) {
            window.powerdeckAPI.sendChannelReaction(
              currentActiveRoom.channel,
              speakerIds,
              reactionId,
              false,
              emoji,
              true // Extra React uses emoji_reaction with unicode emoji
            ).then(res => handleReactionApiResponse(res, speakerIds)).catch(console.warn);
          } else if (speakerIds.length === 0) {
            console.log(`[Clubhouse] Extra React: No other speakers on stage besides self. Skipped API reaction to avoid overusage.`);
          }
          activeExtraTargetUserId = null;
        } else if (activeExtraTargetUserId) {
          const myId = Number(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))));
          if (!isNaN(Number(activeExtraTargetUserId)) && Number(activeExtraTargetUserId) === myId) {
            console.log(`[Clubhouse] Extra React: Skipping reaction to own user ID (${myId}) to avoid overusage.`);
            triggerTargetEmojiAnimation(myId, emoji);
          } else {
            dispatchSendReaction(emoji, reactionId, activeExtraTargetUserId, true);
          }
          activeExtraTargetUserId = null;
        }
      });
    });
  }

  function wireExtraReactionControls() {
    const popover = document.getElementById('extra-reactions-popover');
    const tabsContainer = document.getElementById('extra-reactions-tabs');
    const btnClose = document.getElementById('btn-close-extra-reactions');
    const customInput = document.getElementById('extra-custom-emoji-input');
    const btnSendCustom = document.getElementById('btn-extra-send-custom');

    if (btnClose && !btnClose.hasAttribute('data-wired')) {
      btnClose.setAttribute('data-wired', 'true');
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        if (popover) popover.style.display = 'none';
        activeExtraTargetUserId = null;
      });
    }

    if (tabsContainer && !tabsContainer.hasAttribute('data-wired')) {
      tabsContainer.setAttribute('data-wired', 'true');
      tabsContainer.querySelectorAll('.extra-react-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          const cat = tab.getAttribute('data-cat') || 'smileys';
          activeExtraCategory = cat;
          tabsContainer.querySelectorAll('.extra-react-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          renderExtraEmojiGrid(cat);
        });
      });
    }

    const handleSendCustom = async () => {
      if (!customInput) return;
      const val = customInput.value.trim();
      if (!val) return;
      customInput.value = '';
      if (popover) popover.style.display = 'none';

      if (activeExtraTargetUserId === 'ALL_USERS' || activeExtraTargetUserId === 'ALL_SPEAKERS') {
        const speakerIds = await getFreshSpeakerUserIds(true);
        const myId = Number(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))));
        if (speakerIds.length > 0) {
          let staggerDelay = 0;
          speakerIds.forEach(uId => {
            setTimeout(() => {
              triggerStageReactionAnimation(myId, uId, val);
            }, staggerDelay);
            staggerDelay += 40;
          });
        } else if (myId) {
          triggerTargetEmojiAnimation(myId, val);
        }
        if (currentActiveRoom && currentActiveRoom.channel && speakerIds.length > 0) {
          window.powerdeckAPI.sendChannelReaction(
            currentActiveRoom.channel,
            speakerIds,
            34,
            false,
            val,
            true // Extra React uses emoji_reaction with unicode emoji
          ).then(res => handleReactionApiResponse(res, speakerIds)).catch(console.warn);
        } else if (speakerIds.length === 0) {
          console.log(`[Clubhouse] Extra Custom React: No other speakers on stage besides self. Skipped API reaction to avoid overusage.`);
        }
        activeExtraTargetUserId = null;
      } else if (activeExtraTargetUserId) {
        const myId = Number(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))));
        if (!isNaN(Number(activeExtraTargetUserId)) && Number(activeExtraTargetUserId) === myId) {
          console.log(`[Clubhouse] Extra Custom React: Skipping reaction to own user ID (${myId}) to avoid overusage.`);
          triggerTargetEmojiAnimation(myId, val);
        } else {
          dispatchSendReaction(val, 34, activeExtraTargetUserId, true);
        }
        activeExtraTargetUserId = null;
      }
    };

    if (btnSendCustom && !btnSendCustom.hasAttribute('data-wired')) {
      btnSendCustom.setAttribute('data-wired', 'true');
      btnSendCustom.addEventListener('click', (e) => {
        e.stopPropagation();
        handleSendCustom();
      });
    }

    if (customInput && !customInput.hasAttribute('data-wired')) {
      customInput.setAttribute('data-wired', 'true');
      customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSendCustom();
        }
      });
    }
  }

  function showExtraReactionPalette(anchorBtn, targetUserId, userName) {
    if (!anchorBtn || !targetUserId) return;
    activeExtraTargetUserId = targetUserId;

    const popover = document.getElementById('extra-reactions-popover');
    const titleEl = document.getElementById('extra-reactions-title');
    if (!popover) return;

    // Ensure popover is attached to document.body so it is never clipped by scroll containers
    if (popover.parentElement !== document.body) {
      document.body.appendChild(popover);
    }

    if (titleEl) {
      titleEl.textContent = (targetUserId === 'ALL_USERS' || targetUserId === 'ALL_SPEAKERS') ? 'React to Channel Speakers' : `React to ${userName || 'Speaker'}`;
    }

    renderExtraEmojiGrid(activeExtraCategory);
    wireExtraReactionControls();

    // Make popover temporarily display flex to measure height/width
    popover.style.display = 'flex';
    popover.style.visibility = 'hidden';

    // The user tile (speaker or listener card) or dock button
    const targetTile = anchorBtn.closest('.speaker-tile, .listener-tile') || anchorBtn;
    const popoverW = 340;
    const popoverH = popover.offsetHeight || 240;

    // If targetTile is in participants scroll container and too close to the top, smoothly make room
    const scrollContainer = document.getElementById('channel-participants-scroll') || targetTile.closest('.channel-participants-scroll');
    let tileRect = targetTile.getBoundingClientRect();
    if (scrollContainer && targetTile !== anchorBtn && tileRect.top < popoverH + 20) {
      const scrollDiff = (popoverH + 24) - tileRect.top;
      scrollContainer.scrollBy({ top: -scrollDiff, behavior: 'instant' });
      tileRect = targetTile.getBoundingClientRect();
    }

    const tileCenterX = tileRect.left + (tileRect.width / 2);

    // Position popover DIRECTLY ON TOP OF (ABOVE) the user tile (never flipped below)
    let top = tileRect.top - popoverH - 10;
    if (top < 10) {
      top = 10;
    }

    let left = tileCenterX - (popoverW / 2);
    left = Math.max(12, Math.min(window.innerWidth - popoverW - 12, left));

    popover.style.position = 'fixed';
    popover.style.zIndex = '4000';
    popover.style.top = `${Math.round(top)}px`;
    popover.style.left = `${Math.round(left)}px`;
    popover.style.visibility = 'visible';

    // Anchor arrow pointer pointing directly at the center of the user card
    const arrow = document.getElementById('extra-reactions-arrow');
    if (arrow) {
      const arrowLeft = Math.max(18, Math.min(popoverW - 28, tileCenterX - left - 6));
      arrow.style.left = `${Math.round(arrowLeft)}px`;
      arrow.className = 'extra-reactions-arrow arrow-bottom';
    }
  }

  function openModActionMenu() {}

  function closeModActionMenu() {
    activeModTargetUser = null;
  }

  // Audio Settings Modal Operations
  function closeAudioSettingsModal() {
    const modalAudioSettings = document.getElementById('modal-audio-settings');
    if (modalAudioSettings) {
      modalAudioSettings.style.display = 'none';
    }
  }
  window.closeAudioSettingsModal = closeAudioSettingsModal;

  let isMicFxUIWired = false;

  function syncMicFxUI() {
    const checkEnable = document.getElementById('check-mic-fx-enable');
    const lockBanner = document.getElementById('mic-fx-lock-banner');
    const bodyControls = document.getElementById('mic-fx-body-controls');
    const selectPreset = document.getElementById('select-eq-preset');
    const checkLowCut = document.getElementById('check-mic-lowcut');

    if (lockBanner) {
      lockBanner.style.display = 'none';
    }
    if (bodyControls) {
      bodyControls.classList.remove('is-disabled');
    }
    if (checkEnable) {
      checkEnable.checked = Boolean(micFxConfig.enabled);
    }
    if (checkLowCut) {
      checkLowCut.checked = micFxConfig.lowCut !== false;
    }

    if (selectPreset) selectPreset.value = micFxConfig.preset || 'flat';

    // Sync 8 EQ Sliders & Badges
    for (let b = 1; b <= 8; b++) {
      const slider = document.getElementById(`slider-eq-band${b}`);
      const badge = document.getElementById(`val-eq-band${b}`);
      const val = Number(micFxConfig[`eqBand${b}`]) || 0;
      if (slider) slider.value = val;
      if (badge) badge.textContent = (val > 0 ? '+' : '') + val + ' dB';
    }

    // Sync Voice Character
    const curChar = micFxConfig.character || 'clean';
    const charBadge = document.getElementById('val-voice-character');
    const charNames = { clean: 'Clean Studio', radio: 'Deep Radio', anime: 'High Pitch', robot: 'Cyber Robot', phone: 'Vintage Phone', megaphone: 'Megaphone' };
    if (charBadge) charBadge.textContent = charNames[curChar] || 'Clean Studio';
    document.querySelectorAll('.btn-voice-char').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-character') === curChar);
    });

    // Sync Delay Controls
    const sliderDelayTime = document.getElementById('slider-delay-time');
    const valDelayTime = document.getElementById('val-delay-time');
    const sliderDelayFb = document.getElementById('slider-delay-feedback');
    const valDelayFb = document.getElementById('val-delay-feedback');
    const sliderDelayMix = document.getElementById('slider-delay-mix');
    const valDelayMix = document.getElementById('val-delay-mix');
    const valDelayWet = document.getElementById('val-delay-wet');

    if (sliderDelayTime) sliderDelayTime.value = micFxConfig.delayTime || 220;
    if (valDelayTime) valDelayTime.textContent = `${micFxConfig.delayTime || 220} ms`;
    if (sliderDelayFb) sliderDelayFb.value = micFxConfig.delayFeedback || 35;
    if (valDelayFb) valDelayFb.textContent = `${micFxConfig.delayFeedback || 35}%`;
    if (sliderDelayMix) sliderDelayMix.value = micFxConfig.delayMix || 0;
    const dMix = micFxConfig.delayMix || 0;
    if (valDelayMix) valDelayMix.textContent = dMix === 0 ? '0% (Dry)' : `${dMix}%`;
    if (valDelayWet) valDelayWet.textContent = dMix === 0 ? '0% (Off)' : `${dMix}%`;

    // Sync Reverb Controls
    const sliderReverb = document.getElementById('slider-reverb-mix');
    const valReverb = document.getElementById('val-reverb-mix');
    if (sliderReverb) sliderReverb.value = micFxConfig.reverbMix || 0;
    if (valReverb) valReverb.textContent = (micFxConfig.reverbMix === 0) ? '0% (Dry)' : `${micFxConfig.reverbMix}%`;

    document.querySelectorAll('.btn-reverb-room').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-room') === (micFxConfig.reverbRoom || 'booth'));
    });

    // Sync Dynamics & Makeup Gain
    const sliderComp = document.getElementById('slider-compressor-punch');
    const valComp = document.getElementById('val-compressor-punch');
    if (sliderComp) sliderComp.value = micFxConfig.compressorPunch || 0;
    if (valComp) valComp.textContent = (micFxConfig.compressorPunch === 0) ? '0% (Off)' : `${micFxConfig.compressorPunch}%`;

    const sliderGate = document.getElementById('slider-noise-gate');
    const valGate = document.getElementById('val-noise-gate');
    if (sliderGate) sliderGate.value = micFxConfig.noiseGate || 0;
    if (valGate) valGate.textContent = (micFxConfig.noiseGate === 0) ? 'Off' : `${micFxConfig.noiseGate}%`;

    const sliderMakeup = document.getElementById('slider-makeup-gain');
    const valMakeup = document.getElementById('val-makeup-gain');
    const mg = Number(micFxConfig.makeupGain) || 0;
    if (sliderMakeup) sliderMakeup.value = mg;
    if (valMakeup) valMakeup.textContent = (mg > 0 ? '+' : '') + mg + ' dB';

    const checkMonitor = document.getElementById('check-mic-monitor');
    if (checkMonitor) checkMonitor.checked = Boolean(micFxConfig.monitor);

    updateDockMicFxButtonState();
  }

  function setupMicFxUIEvents() {
    if (isMicFxUIWired) return;
    isMicFxUIWired = true;

    const checkEnable = document.getElementById('check-mic-fx-enable');
    const selectPreset = document.getElementById('select-eq-preset');
    const checkLowCut = document.getElementById('check-mic-lowcut');
    const btnResetEq = document.getElementById('btn-reset-eq');
    const sliderDelayTime = document.getElementById('slider-delay-time');
    const sliderDelayFb = document.getElementById('slider-delay-feedback');
    const sliderDelayMix = document.getElementById('slider-delay-mix');
    const sliderReverb = document.getElementById('slider-reverb-mix');
    const sliderComp = document.getElementById('slider-compressor-punch');
    const sliderGate = document.getElementById('slider-noise-gate');
    const sliderMakeup = document.getElementById('slider-makeup-gain');
    const checkMonitor = document.getElementById('check-mic-monitor');

    if (checkEnable) {
      checkEnable.addEventListener('change', async () => {
        micFxConfig.enabled = checkEnable.checked;
        saveMicFxConfig();
        syncMicFxUI();
        if (isCurrentUserSpeaker && agoraClient) {
          await publishLocalMicrophone(false);
        }
      });
    }

    if (checkLowCut) {
      checkLowCut.addEventListener('change', () => {
        micFxConfig.lowCut = checkLowCut.checked;
        updateLowCutFilter();
        saveMicFxConfig();
      });
    }

    if (btnResetEq) {
      btnResetEq.addEventListener('click', () => {
        for (let b = 1; b <= 8; b++) {
          micFxConfig[`eqBand${b}`] = 0;
          const node = [null, micFxFilterBand1, micFxFilterBand2, micFxFilterBand3, micFxFilterBand4, micFxFilterBand5, micFxFilterBand6, micFxFilterBand7, micFxFilterBand8][b];
          if (node) node.gain.value = 0;
        }
        micFxConfig.preset = 'flat';
        saveMicFxConfig();
        syncMicFxUI();
      });
    }

    // Voice Character Modulator Pills
    document.querySelectorAll('.btn-voice-char').forEach(btn => {
      btn.addEventListener('click', () => {
        const charKey = btn.getAttribute('data-character') || 'clean';
        micFxConfig.character = charKey;
        updateVoiceCharacterDSP();
        saveMicFxConfig();
        syncMicFxUI();
      });
    });

    if (selectPreset) {
      selectPreset.addEventListener('change', () => {
        const val = selectPreset.value;
        const p = MIC_FX_PRESETS[val];
        if (p) {
          micFxConfig.preset = val;
          micFxConfig.lowCut = p.lowCut !== false;
          micFxConfig.character = p.character || 'clean';
          for (let b = 1; b <= 8; b++) {
            const bVal = p[`band${b}`] || 0;
            micFxConfig[`eqBand${b}`] = bVal;
            const node = [null, micFxFilterBand1, micFxFilterBand2, micFxFilterBand3, micFxFilterBand4, micFxFilterBand5, micFxFilterBand6, micFxFilterBand7, micFxFilterBand8][b];
            if (node) node.gain.value = bVal;
          }
          micFxConfig.reverbMix = p.reverb || 0;
          micFxConfig.reverbRoom = p.room || 'booth';
          micFxConfig.compressorPunch = p.comp || 0;
          micFxConfig.noiseGate = p.gate || 0;
          micFxConfig.delayMix = p.delayMix || 0;
          micFxConfig.delayTime = p.delayTime || 220;
          micFxConfig.delayFeedback = p.delayFeedback || 35;
          micFxConfig.makeupGain = p.makeupGain || 0;

          updateLowCutFilter();
          updateVoiceCharacterDSP();
          if (micFxReverbConvolver && micFxAudioContext) {
            micFxReverbConvolver.buffer = createReverbImpulse(micFxAudioContext, p.room || 'booth');
          }
          updateReverbGains();
          updateDelayGains();
          updateCompressorPunch();
          updateMasterMakeupGain();

          saveMicFxConfig();
          syncMicFxUI();
        }
      });
    }

    // Wire 8-Band Equalizer Sliders
    const bandNodes = [null, () => micFxFilterBand1, () => micFxFilterBand2, () => micFxFilterBand3, () => micFxFilterBand4, () => micFxFilterBand5, () => micFxFilterBand6, () => micFxFilterBand7, () => micFxFilterBand8];
    for (let b = 1; b <= 8; b++) {
      const slider = document.getElementById(`slider-eq-band${b}`);
      if (!slider) continue;
      slider.addEventListener('input', (e) => {
        const val = Number(e.target.value) || 0;
        micFxConfig[`eqBand${b}`] = val;
        micFxConfig.preset = 'custom';
        const nodeGetter = bandNodes[b];
        const node = nodeGetter ? nodeGetter() : null;
        if (node) node.gain.value = val;
        const badge = document.getElementById(`val-eq-band${b}`);
        if (badge) badge.textContent = (val > 0 ? '+' : '') + val + ' dB';
        if (selectPreset) selectPreset.value = 'custom';
        saveMicFxConfig();
      });
    }

    // Wire Delay Sliders
    if (sliderDelayTime) {
      sliderDelayTime.addEventListener('input', (e) => {
        micFxConfig.delayTime = Number(e.target.value) || 220;
        updateDelayGains();
        const badge = document.getElementById('val-delay-time');
        if (badge) badge.textContent = `${micFxConfig.delayTime} ms`;
        saveMicFxConfig();
      });
    }

    if (sliderDelayFb) {
      sliderDelayFb.addEventListener('input', (e) => {
        micFxConfig.delayFeedback = Number(e.target.value) || 35;
        updateDelayGains();
        const badge = document.getElementById('val-delay-feedback');
        if (badge) badge.textContent = `${micFxConfig.delayFeedback}%`;
        saveMicFxConfig();
      });
    }

    if (sliderDelayMix) {
      sliderDelayMix.addEventListener('input', (e) => {
        const val = Number(e.target.value) || 0;
        micFxConfig.delayMix = val;
        updateDelayGains();
        const badge = document.getElementById('val-delay-mix');
        if (badge) badge.textContent = val === 0 ? '0% (Dry)' : `${val}%`;
        const wetBadge = document.getElementById('val-delay-wet');
        if (wetBadge) wetBadge.textContent = val === 0 ? '0% (Off)' : `${val}%`;
        saveMicFxConfig();
      });
    }

    // Wire Reverb Mix Slider
    if (sliderReverb) {
      sliderReverb.addEventListener('input', (e) => {
        const val = Number(e.target.value) || 0;
        micFxConfig.reverbMix = val;
        micFxConfig.preset = 'custom';
        updateReverbGains();
        const badge = document.getElementById('val-reverb-mix');
        if (badge) badge.textContent = (val === 0) ? '0% (Dry)' : `${val}%`;
        if (selectPreset) selectPreset.value = 'custom';
        saveMicFxConfig();
      });
    }

    // Wire Reverb Room Buttons (6 Rooms)
    document.querySelectorAll('.btn-reverb-room').forEach(btn => {
      btn.addEventListener('click', () => {
        const room = btn.getAttribute('data-room') || 'booth';
        micFxConfig.reverbRoom = room;
        micFxConfig.preset = 'custom';
        if (micFxReverbConvolver && micFxAudioContext) {
          micFxReverbConvolver.buffer = createReverbImpulse(micFxAudioContext, room);
        }
        document.querySelectorAll('.btn-reverb-room').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (selectPreset) selectPreset.value = 'custom';
        saveMicFxConfig();
      });
    });

    // Wire Compressor & Noise Gate
    if (sliderComp) {
      sliderComp.addEventListener('input', (e) => {
        const val = Number(e.target.value) || 0;
        micFxConfig.compressorPunch = val;
        micFxConfig.preset = 'custom';
        updateCompressorPunch();
        const badge = document.getElementById('val-compressor-punch');
        if (badge) badge.textContent = (val === 0) ? '0% (Off)' : `${val}%`;
        if (selectPreset) selectPreset.value = 'custom';
        saveMicFxConfig();
      });
    }

    if (sliderGate) {
      sliderGate.addEventListener('input', (e) => {
        const val = Number(e.target.value) || 0;
        micFxConfig.noiseGate = val;
        micFxConfig.preset = 'custom';
        const badge = document.getElementById('val-noise-gate');
        if (badge) badge.textContent = (val === 0) ? 'Off' : `${val}%`;
        if (selectPreset) selectPreset.value = 'custom';
        saveMicFxConfig();
      });
    }

    // Wire Master Makeup Gain
    if (sliderMakeup) {
      sliderMakeup.addEventListener('input', (e) => {
        const val = Number(e.target.value) || 0;
        micFxConfig.makeupGain = val;
        updateMasterMakeupGain();
        const badge = document.getElementById('val-makeup-gain');
        if (badge) badge.textContent = (val > 0 ? '+' : '') + val + ' dB';
        saveMicFxConfig();
      });
    }

    if (checkMonitor) {
      checkMonitor.addEventListener('change', () => {
        micFxConfig.monitor = checkMonitor.checked;
        if (micFxMonitorGain) {
          micFxMonitorGain.gain.value = micFxConfig.monitor ? 1.0 : 0.0;
        }
        saveMicFxConfig();
      });
    }
  }

  async function openAudioSettingsModal() {
    const modalAudioSettings = document.getElementById('modal-audio-settings');
    const selectAudioInput = document.getElementById('select-audio-input');
    const selectAudioOutput = document.getElementById('select-audio-output');
    const checkSpatialAudio = document.getElementById('check-spatial-audio');
    const sliderAudioVolume = document.getElementById('slider-audio-volume');
    const sliderMicVolume = document.getElementById('slider-mic-volume');
    if (!modalAudioSettings) return;

    modalAudioSettings.style.display = 'flex';
    bringModalToFront(modalAudioSettings);
    modalAudioSettings.scrollTop = 0;

    const btnClose = document.getElementById('btn-close-audio-modal');
    if (btnClose) btnClose.onclick = closeAudioSettingsModal;
    const btnCancel = document.getElementById('btn-audio-cancel');
    if (btnCancel) btnCancel.onclick = closeAudioSettingsModal;
    modalAudioSettings.onclick = (e) => {
      if (e.target === modalAudioSettings) {
        closeAudioSettingsModal();
      }
    };

    // Populate immediate fallbacks so options are never blank
    if (selectAudioInput && (!selectAudioInput.children || selectAudioInput.children.length === 0)) {
      selectAudioInput.innerHTML = '<option value="default">Default Microphone</option>';
    }
    if (selectAudioOutput && (!selectAudioOutput.children || selectAudioOutput.children.length === 0)) {
      selectAudioOutput.innerHTML = '<option value="default">Default Speaker / Output</option>';
    }

    let currentPrefs = {
      inputDeviceId: 'default',
      outputDeviceId: 'default',
      audioQuality: 'Music Mode',
      spatialAudio: false,
      volume: currentAgoraVolume,
      micVolume: currentAgoraMicVolume
    };
    try {
      if (window.powerdeckAPI && window.powerdeckAPI.getAudioPrefs) {
        const res = await window.powerdeckAPI.getAudioPrefs();
        if (res && res.success && res.prefs) {
          currentPrefs = res.prefs;
          if (typeof currentPrefs.volume === 'number') {
            currentAgoraVolume = currentPrefs.volume;
          }
          if (typeof currentPrefs.micVolume === 'number') {
            currentAgoraMicVolume = currentPrefs.micVolume;
          }
        }
      }
    } catch (e) {
      console.warn("Could not read audio prefs:", e);
    }

    const checkMuteRemote = document.getElementById('check-mute-remote-audio');
    if (checkMuteRemote) {
      checkMuteRemote.checked = isRemoteAudioMuted;
      checkMuteRemote.onchange = () => {
        toggleMuteRemoteAudio(checkMuteRemote.checked);
      };
    }

    if (sliderMicVolume) {
      sliderMicVolume.value = currentAgoraMicVolume;
      updateMicVolumeBadgeUI(currentAgoraMicVolume);
      sliderMicVolume.oninput = (e) => {
        const val = Number(e.target.value) || 0;
        currentAgoraMicVolume = val;
        updateMicVolumeBadgeUI(val);
        applyAgoraMicVolume(val);
        persistAudioPrefsDebounced();
      };
    }

    if (sliderAudioVolume) {
      sliderAudioVolume.value = currentAgoraVolume;
      updateVolumeBadgeUI(currentAgoraVolume);
      sliderAudioVolume.oninput = (e) => {
        const val = Number(e.target.value) || 0;
        currentAgoraVolume = val;
        updateVolumeBadgeUI(val);
        applyAgoraVolume(val);
        persistAudioPrefsDebounced();
      };
    }

    if (checkSpatialAudio) {
      checkSpatialAudio.checked = !!currentPrefs.spatialAudio;
      checkSpatialAudio.onchange = () => {
        persistAudioPrefsDebounced();
      };
    }


    try {
      if (navigator && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (selectAudioInput) {
          const inputs = devices.filter(d => d.kind === 'audioinput');
          if (inputs.length > 0) {
            selectAudioInput.innerHTML = inputs.map((d, idx) => `
              <option value="${d.deviceId}" ${d.deviceId === currentPrefs.inputDeviceId ? 'selected' : ''}>
                ${d.label || `Microphone ${idx + 1}`}
              </option>
            `).join('');
          }
        }

        if (selectAudioOutput) {
          const outputs = devices.filter(d => d.kind === 'audiooutput');
          if (outputs.length > 0) {
            selectAudioOutput.innerHTML = outputs.map((d, idx) => `
              <option value="${d.deviceId}" ${d.deviceId === currentPrefs.outputDeviceId ? 'selected' : ''}>
                ${d.label || `Speaker / Headphones ${idx + 1}`}
              </option>
            `).join('');
          }
        }
      }
    } catch (err) {
      console.warn("Device enumeration error:", err);
    }

    setupMicFxUIEvents();
    syncMicFxUI();
  }

  window.openAudioSettingsModal = openAudioSettingsModal;
  window.triggerOpenAudioSettingsModal = openAudioSettingsModal;

  async function saveAudioSettings() {
    const modalAudioSettings = document.getElementById('modal-audio-settings');
    const selectAudioInput = document.getElementById('select-audio-input');
    const selectAudioOutput = document.getElementById('select-audio-output');
    const checkSpatialAudio = document.getElementById('check-spatial-audio');
    const sliderAudioVolume = document.getElementById('slider-audio-volume');
    const sliderMicVolume = document.getElementById('slider-mic-volume');

    const volumeVal = (sliderAudioVolume && sliderAudioVolume.value !== '' && !isNaN(Number(sliderAudioVolume.value))) ? Number(sliderAudioVolume.value) : currentAgoraVolume;
    const micVolumeVal = (sliderMicVolume && sliderMicVolume.value !== '' && !isNaN(Number(sliderMicVolume.value))) ? Number(sliderMicVolume.value) : currentAgoraMicVolume;
    currentAgoraVolume = volumeVal;
    currentAgoraMicVolume = micVolumeVal;

    const prefs = {
      inputDeviceId: selectAudioInput ? selectAudioInput.value : 'default',
      outputDeviceId: selectAudioOutput ? selectAudioOutput.value : 'default',
      audioQuality: 'Music Mode',
      spatialAudio: checkSpatialAudio ? checkSpatialAudio.checked : false,
      volume: volumeVal,
      micVolume: micVolumeVal
    };

    try {
      saveMicFxConfig();
      const res = await window.powerdeckAPI.saveAudioPrefs(prefs);
      if (res && res.success) {
        showAlert('success', 'Audio preferences saved to audio_pref.json!');
        setAppStatus(`Audio setup: Music Mode • Mic: ${prefs.micVolume}% • Room: ${prefs.volume}% • Spatial: ${prefs.spatialAudio ? 'ON' : 'OFF'}`);

        // Dynamically apply input device to active microphone
        if (agoraLocalAudioTrack && prefs.inputDeviceId && prefs.inputDeviceId !== 'default' && typeof agoraLocalAudioTrack.setDevice === 'function') {
          agoraLocalAudioTrack.setDevice(prefs.inputDeviceId).catch(err => {
            console.warn("[Agora] Failed to switch microphone device:", err);
          });
        }

        // Apply mic volume & boost level to active local microphone track
        applyAgoraMicVolume(micVolumeVal);

        // Dynamically apply output device to remote speaker tracks
        if (agoraClient && Array.isArray(agoraClient.remoteUsers)) {
          agoraClient.remoteUsers.forEach(u => {
            if (u.audioTrack && typeof u.audioTrack.setPlaybackDevice === 'function') {
              u.audioTrack.setPlaybackDevice(prefs.outputDeviceId).catch(err => {
                console.warn("[Agora] Failed to switch output playback device:", err);
              });
            }
          });
        }

        // Dynamically apply audio volume & boost level to remote speaker tracks
        applyAgoraVolume(volumeVal);
      } else {
        showAlert('warning', res.error || 'Failed to save audio preferences');
      }
    } catch (e) {
      showAlert('error', e.message);
    } finally {
      closeAudioSettingsModal();
    }
  }

  window.saveAudioSettings = saveAudioSettings;

  // Realtime 3-second get_channel polling loop
  function startChannelPolling(channelId) {
    stopChannelPolling();
    refreshActiveChannelState();
    channelPollTimer = setInterval(() => {
      refreshActiveChannelState();
    }, 3000);
  }

  function stopChannelPolling() {
    if (channelPollTimer) {
      clearInterval(channelPollTimer);
      channelPollTimer = null;
    }
  }

  // Realtime 20-second active_ping presence loop
  function startActivePing(channelId) {
    stopActivePing();
    activePingTimer = setInterval(async () => {
      if (!currentActiveRoom) return;
      try {
        const pingRes = await window.powerdeckAPI.activePing(currentActiveRoom.channel);
        if (pingRes && pingRes.data && pingRes.data.should_leave) {
          console.warn("[Clubhouse] activePing returned should_leave");
          const roomTitle = currentActiveRoom.title || currentActiveRoom.channel || 'Room';
          leaveActiveRoom(`Room "${roomTitle}" has ended. Left quietly.`);
          return;
        }
      } catch (e) {
        console.warn("[Clubhouse] activePing error:", e);
      }
    }, 20000);
  }

  function stopActivePing() {
    if (activePingTimer) {
      clearInterval(activePingTimer);
      activePingTimer = null;
    }
  }

  // Refresh active channel state from /api/get_channel
  let isRefreshingActiveChannel = false;
  async function refreshActiveChannelState() {
    if (!currentActiveRoom || isRefreshingActiveChannel) return;
    const chId = typeof currentActiveRoom.channel === 'string'
      ? currentActiveRoom.channel
      : (currentActiveRoom.id || (currentActiveRoom.channel && (currentActiveRoom.channel.channel || currentActiveRoom.channel.id)));
    if (!chId) return;

    isRefreshingActiveChannel = true;
    try {
      const res = await window.powerdeckAPI.getChannel(chId);
      if (res && res.success && res.data) {
        // Clubhouse API get_channel returns { channel: { ... } } or root properties
        const data = (res.data && (res.data.channel || res.data.room)) ? (res.data.channel || res.data.room) : res.data;
        const rawUsers = Array.isArray(data.users) ? data.users : (Array.isArray(res.data.users) ? res.data.users : []);
        const creatorId = data.creator_user_profile_id;
        const myUserId = String(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '');

        // Check our user state
        const meInUsers = rawUsers.find(u => String(u.user_id) === myUserId);
        if (meInUsers) {
          isCurrentUserModerator = !!meInUsers.is_moderator || String(meInUsers.user_id) === String(creatorId);
          updateEndRoomButtonVisibility();
          const wasSpeaker = isCurrentUserSpeaker;
          isCurrentUserSpeaker = !!meInUsers.is_speaker;

          if (!wasSpeaker && isCurrentUserSpeaker) {
            promoteToSpeakerInAgora();
          } else if (wasSpeaker && !isCurrentUserSpeaker) {
            demoteToAudienceInAgora();
          }

          // Update dock controls: hides mute button and shows Join button when in audience
          updateMicUI();
        }

        // Update emoji reactions if provided (checking reactions.channel_reactions, channel_reactions, or emoji_reaction_options)
        let refreshedReactions = null;
        if (data.reactions && Array.isArray(data.reactions.channel_reactions)) {
          refreshedReactions = data.reactions.channel_reactions;
        } else if (Array.isArray(data.channel_reactions)) {
          refreshedReactions = data.channel_reactions;
        } else if (Array.isArray(data.emoji_reaction_options)) {
          refreshedReactions = data.emoji_reaction_options;
        }
        if (refreshedReactions && refreshedReactions.length > 0) {
          updateEmojiOptions(refreshedReactions);
        }

        // Sync phone call presence from rawUsers
        rawUsers.forEach(u => {
          const uidStr = String(u.user_id);
          const calling = Boolean(u.is_on_phone_call || u.is_on_call || u.phone_call_status || u.is_calling);
          if (calling) {
            speakerCallStatusMap.set(uidStr, true);
          } else if (u.is_on_phone_call === false || u.is_on_call === false) {
            speakerCallStatusMap.delete(uidStr);
          }
        });

        // STRICT SEPARATION:
        // Speakers: strictly users who are currently speakers on stage (is_speaker === true)
        const speakers = rawUsers
          .filter(u => Boolean(u.is_speaker))
          .map(u => {
            const uidStr = String(u.user_id);
            const isSelf = uidStr === String(myUserId);
            const isMuted = isSelf ? isMicMuted : Boolean(u.is_muted || u.is_speaker_muted || u.is_self_muted);
            if (isSelf) {
              if (isMicMuted) {
                unmutedSpeakerUids.delete(uidStr);
                agoraMutedUids.add(uidStr);
              } else {
                unmutedSpeakerUids.add(uidStr);
                agoraMutedUids.delete(uidStr);
              }
            } else if (isMuted) {
              unmutedSpeakerUids.delete(uidStr);
              agoraMutedUids.add(uidStr);
            }
            const isAnon = isAnonymousUser(u);
            const isOnCall = Boolean(u.is_on_phone_call || u.is_on_call || u.phone_call_status || speakerCallStatusMap.get(uidStr));
            return {
              userId: u.user_id,
              name: u.name || u.first_name || (isAnon ? 'anon' : "Speaker"),
              handle: u.username ? `@${u.username}` : "",
              photo: u.photo_url || u.photo || null,
              isModerator: !!u.is_moderator || (String(u.user_id) === String(creatorId)),
              isSpeaker: true,
              speaking: false,
              isMuted: isMuted,
              isOnCall: isOnCall,
              badge: (u.is_moderator || String(u.user_id) === String(creatorId)) ? "★ Moderator" : "Speaker",
              channelEmoji: u.channel_emoji || null,
              isPaidUser: !!u.is_paid_user,
              isInvitedAsSpeaker: !!u.is_invited_as_speaker,
              isAnonymousUser: isAnon,
              anonymousUserEmoji: isAnon ? getAnonymousUserEmoji(u) : null
            };
          });

        const speakerIdSet = new Set(speakers.map(s => String(s.userId || s.user_id)));

        // Listeners: users who are NOT speakers on stage
        const listeners = rawUsers
          .filter(u => !speakerIdSet.has(String(u.user_id)))
          .map(u => {
            const isAnon = isAnonymousUser(u);
            const uidStr = String(u.user_id);
            const isOnCall = Boolean(u.is_on_phone_call || u.is_on_call || u.phone_call_status || speakerCallStatusMap.get(uidStr));
            return {
              userId: u.user_id,
              name: u.name || u.first_name || (isAnon ? 'anon' : "Listener"),
              handle: u.username ? `@${u.username}` : "",
              photo: u.photo_url || u.photo || null,
              channelEmoji: u.channel_emoji || null,
              isPaidUser: !!u.is_paid_user,
              isModerator: !!u.is_moderator,
              isOnCall: isOnCall,
              isAnonymousUser: isAnon,
              anonymousUserEmoji: isAnon ? getAnonymousUserEmoji(u) : null
            };
          });

        currentActiveRoom.channel = chId;
        currentActiveRoom.users = rawUsers;
        currentActiveRoom.speakers = speakers;
        currentActiveRoom.listeners = listeners;
        currentActiveRoom.listenersCount = listeners.length > 0 ? listeners.length : Math.max(0, (data.num_all || 0) - speakers.length);
        if (data.social_club || (res.data && res.data.social_club)) {
          currentActiveRoom.socialClub = data.social_club || res.data.social_club;
        }
        if (data.social_club_id || (res.data && res.data.social_club_id)) {
          currentActiveRoom.social_club_id = data.social_club_id || res.data.social_club_id;
        }
        currentActiveRoom.rawChannel = Object.assign({}, currentActiveRoom.rawChannel || {}, data);
        if (data.topic) currentActiveRoom.title = data.topic;
        const extractedLinks = extractChannelLinks(data, res.data);
        if (extractedLinks !== null) {
          currentActiveRoom.links = extractedLinks;
        }
        if (typeof data.is_chat_enabled !== 'undefined') {
          currentActiveRoom.isChatEnabled = Boolean(data.is_chat_enabled);
        }
        const replayEnabled = typeof data.is_replay_enabled !== 'undefined'
          ? Boolean(data.is_replay_enabled)
          : (res.data && typeof res.data.is_replay_enabled !== 'undefined' ? Boolean(res.data.is_replay_enabled) : false);
        const canDisable = typeof data.can_disable_replay !== 'undefined'
          ? Boolean(data.can_disable_replay)
          : (res.data && typeof res.data.can_disable_replay !== 'undefined' ? Boolean(res.data.can_disable_replay) : false);
        currentActiveRoom.isReplayEnabled = replayEnabled;
        currentActiveRoom.canDisableReplay = canDisable;

        updateChannelPreview(currentActiveRoom);
        renderStageController(currentActiveRoom);
      } else if (res && res.success === false) {
        const errMsg = String(res.error_message || res.message || res.error || '').toLowerCase();
        if (errMsg.includes('ended') || errMsg.includes('closed') || errMsg.includes('not found') || errMsg.includes('expired')) {
          console.warn("[Clubhouse] Channel no longer active according to getChannel:", res.error_message || res.error);
          const roomTitle = currentActiveRoom.title || chId;
          leaveActiveRoom(`Room "${roomTitle}" was ended. Left quietly.`);
          return;
        }
      }
    } catch (e) {
      console.warn("refreshActiveChannelState error:", e);
    } finally {
      isRefreshingActiveChannel = false;
    }
  }

  function initHallwayEngine(currentUser) {
    renderRoomsFeed();
    if (currentActiveRoom) {
      updateChannelPreview(currentActiveRoom);
      renderStageController(currentActiveRoom);
    } else {
      renderChannelStandby();
      renderStageController(null);
    }
    try {
      setupHallwayEvents();
    } catch (err) {
      console.warn("setupHallwayEvents error:", err);
    }

    // Immediately fetch live feed from Clubhouse API get_feed_v3
    loadFeedV3(1, false);

    // Auto-refresh feed_v3 every 10 seconds
    startFeedAutoRefresh();
  }

  function renderRoomsFeed() {
    const stream = document.getElementById('rooms-stream');
    if (!stream) return;

    const filtered = liveRooms.filter(room => {
      const matchesFilter = currentFilter === 'all' || room.category === currentFilter;
      const matchesSearch = !currentSearchQuery ||
        (room.title && room.title.toLowerCase().includes(currentSearchQuery.toLowerCase())) ||
        (room.club && room.club.toLowerCase().includes(currentSearchQuery.toLowerCase())) ||
        (room.desc && room.desc.toLowerCase().includes(currentSearchQuery.toLowerCase())) ||
        (room.channel && room.channel.toLowerCase().includes(currentSearchQuery.toLowerCase()));
      return matchesFilter && matchesSearch;
    });

    if (filtered.length === 0) {
      if (isLoadingFeed) {
        stream.innerHTML = `
          <div class="card" style="text-align: center; padding: 36px 18px;">
            <div style="font-size: 28px; margin-bottom: 8px;">⏳</div>
            <div style="font-size: 14px; font-weight: 700; color: var(--text);">Loading live channels...</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Fetching live audio channels via get_feed_v3</div>
          </div>
        `;
      } else {
        stream.innerHTML = `
          <div class="card" style="text-align: center; padding: 30px 18px;">
            <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
            <div style="font-size: 14px; font-weight: 700; color: var(--text);">No live channels found</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Click Refresh or paste a room link.</div>
          </div>
        `;
      }
      return;
    }

    stream.innerHTML = filtered.map(room => {
      const isCurrent = currentActiveRoom && currentActiveRoom.id === room.id;
      const speakersAvatars = (room.speakers || []).slice(0, 3).map((s) => {
        const initial = s.name ? s.name.charAt(0).toUpperCase() : '👤';
        if (s.photo) {
          return `<img src="${s.photo}" class="stack-avatar" alt="${escapeHtml(s.name)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'stack-avatar-fallback\\'>${initial}</div>';">`;
        }
        return `<div class="stack-avatar-fallback">${initial}</div>`;
      }).join('');

      const speakerNames = (room.speakers || []).map(s => {
        const modStar = s.isModerator ? '★ ' : '';
        return `${modStar}${s.name}`;
      }).join(', ');

      const hasClub = room.club && room.club.trim().length > 0;

      const roomUrl = room.url || `https://www.clubhouse.com/room/${room.channel || room.id}`;

      return `
        <div class="room-card ${isCurrent ? 'is-active-room' : ''}" data-room-id="${room.id}">
          <div class="room-card-head">
            <div class="room-card-head-left" style="display: flex; align-items: center; gap: 4px; min-width: 0; flex: 1;">
              ${hasClub ? `
                <span class="room-club-tag ${room.socialClub ? 'clickable-club-tag' : ''}" data-room-id="${room.id}" title="${room.socialClub ? 'Click to view house overview' : ''}">${escapeHtml(room.club)}</span>
              ` : ''}
              <button class="btn-copy-room-link" data-url="${escapeHtml(roomUrl)}" title="Copy room link">🔗</button>
            </div>
            <span class="room-badge-live">
              <span class="room-live-dot"></span> LIVE
            </span>
          </div>

          <div class="room-card-title">${escapeHtml(room.title || 'Live Room')}</div>
          <div class="room-card-desc">${escapeHtml(room.desc || '')}</div>

          <div class="room-speakers-preview">
            <div class="speaker-avatars-stack">
              ${speakersAvatars}
            </div>
            <div class="speakers-names-list">
              🎙️ ${escapeHtml(speakerNames || 'Live Speakers')}
            </div>
          </div>

          <div class="room-card-footer">
            <div class="room-stats-row">
              <span class="stat-item">🎙️ ${(room.speakers || []).length}</span>
              <span class="stat-item">👥 ${room.listenersCount || (room.listeners || []).length}</span>
            </div>
            <div class="room-actions-group">
              ${isCurrent ? `
                <span class="badge-connected">🟢 Connected</span>
              ` : `
                <button class="btn btn-primary btn-xs btn-join-room" data-room-id="${room.id}">
                  ⚡ Join
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to room cards
    stream.querySelectorAll('.room-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.room-club-tag') || e.target.closest('.btn') || e.target.closest('.btn-copy-room-link')) return;
        const roomId = card.getAttribute('data-room-id');
        const targetRoom = liveRooms.find(r => r.id === roomId);
        if (targetRoom) {
          joinChannelById(targetRoom.channel || targetRoom.id);
        }
      });
    });

    // Attach click listeners to room link copy buttons
    stream.querySelectorAll('.btn-copy-room-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (url && window.powerdeckAPI && window.powerdeckAPI.copyToClipboard) {
          window.powerdeckAPI.copyToClipboard(url);
          btn.textContent = '✓';
          btn.classList.add('copied');
          showAlert('info', 'Copied room link to clipboard! 🔗');
          setTimeout(() => {
            btn.textContent = '🔗';
            btn.classList.remove('copied');
          }, 1800);
        }
      });
    });

    // Attach click listeners to Join Channel buttons
    stream.querySelectorAll('.btn-join-room').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const roomId = btn.getAttribute('data-room-id');
        const targetRoom = liveRooms.find(r => r.id === roomId);
        if (targetRoom) {
          joinChannelById(targetRoom.channel || targetRoom.id);
        }
      });
    });

    // Attach click listeners to house club tags
    stream.querySelectorAll('.room-club-tag').forEach(tag => {
      tag.addEventListener('click', (e) => {
        const roomId = tag.getAttribute('data-room-id');
        const targetRoom = liveRooms.find(r => r.id === roomId);
        if (targetRoom && targetRoom.socialClub) {
          e.stopPropagation();
          openClubModal(targetRoom.socialClub);
        }
      });
    });
  }

  // Extract and normalize live channels from Clubhouse API get_feed_v3
  function normalizeFeedChannels(apiResponse) {
    if (!apiResponse) return [];
    let rawList = [];
    if (Array.isArray(apiResponse.items)) {
      rawList = apiResponse.items;
    } else if (Array.isArray(apiResponse.channels)) {
      rawList = apiResponse.channels;
    } else if (apiResponse.data && Array.isArray(apiResponse.data.items)) {
      rawList = apiResponse.data.items;
    } else if (apiResponse.data && Array.isArray(apiResponse.data.channels)) {
      rawList = apiResponse.data.channels;
    }

    const normalized = [];
    for (const item of rawList) {
      const ch = item.channel || (item.channel_id ? item : null);
      if (!ch) continue;

      const channelId = ch.channel || ch.channel_id;
      if (!channelId) continue;

      const topic = ch.topic || ch.title || "Untitled Clubhouse Room";
      const club = (ch.club && ch.club.name) || ch.club_name || (ch.social_club && ch.social_club.name) || (ch.privacy_settings && ch.privacy_settings.display_text) || "";
      const rawUsers = Array.isArray(ch.users) ? ch.users : [];
      const creatorId = ch.creator_user_profile_id;

      // Extract speakers on stage
      const speakers = rawUsers
        .filter(u => Boolean(u.is_speaker))
        .map(u => ({
          userId: u.user_id,
          name: u.name || u.first_name || "Speaker",
          handle: u.username ? `@${u.username}` : "",
          photo: u.photo_url || u.photo || null,
          isModerator: !!u.is_moderator || (String(u.user_id) === String(creatorId)),
          isSpeaker: true,
          speaking: false,
          badge: (u.is_moderator || String(u.user_id) === String(creatorId)) ? "★ Moderator" : "Speaker"
        }));

      // Fallback speaker if none specified in feed payload
      if (speakers.length === 0 && rawUsers.length > 0) {
        rawUsers.slice(0, 1).forEach((u, idx) => {
          speakers.push({
            userId: u.user_id,
            name: u.name || "Speaker",
            handle: u.username ? `@${u.username}` : "",
            photo: u.photo_url || u.photo || null,
            isModerator: idx === 0,
            isSpeaker: true,
            speaking: false,
            badge: idx === 0 ? "★ Moderator" : "Speaker"
          });
        });
      }

      const feedSpeakerIdSet = new Set(speakers.map(s => String(s.userId || s.user_id)));

      // Extract listeners ("Others in the room")
      const listeners = rawUsers
        .filter(u => !feedSpeakerIdSet.has(String(u.user_id)))
        .map(u => ({
          userId: u.user_id,
          name: u.name || u.first_name || "Listener",
          handle: u.username ? `@${u.username}` : "",
          photo: u.photo_url || u.photo || null
        }));

      const rawSocialClub = ch.social_club || (item.logging_context && item.logging_context.social_club_id ? { social_club_id: item.logging_context.social_club_id, name: club } : null);
      if (rawSocialClub && ch.photo_url && !rawSocialClub.photo_url) {
        rawSocialClub.photo_url = ch.photo_url;
      }

      normalized.push({
        id: channelId,
        channel: channelId,
        category: "agora",
        club: club ? club.toUpperCase() : "",
        title: topic,
        url: ch.url || `https://www.clubhouse.com/room/${channelId}`,
        desc: ch.description || `Live Clubhouse Channel • Channel ID: ${channelId}`,
        speakers: speakers.length > 0 ? speakers : [
          { name: "Host", handle: "", isModerator: true, isSpeaker: true, speaking: false, badge: "★ Moderator" }
        ],
        listeners: listeners,
        listenersCount: ch.num_all || (speakers.length + listeners.length) || 1,
        rawChannel: ch,
        socialClub: rawSocialClub
      });
    }

    return normalized;
  }

  // Fetch live channels from Clubhouse API get_feed_v3
  async function loadFeedV3(page = 1, isAppend = false) {
    if (isLoadingFeed) return;
    isLoadingFeed = true;

    const refreshIcon = document.getElementById('refresh-feed-icon');
    const refreshLabel = document.getElementById('refresh-feed-label');
    const loadMoreBtn = document.getElementById('btn-load-more-rooms');
    const swipeBanner = document.getElementById('swipe-refresh-banner');

    if (refreshIcon) refreshIcon.classList.add('rotating');
    if (refreshLabel) refreshLabel.textContent = isAppend ? 'Loading...' : 'Refreshing...';
    if (loadMoreBtn && isAppend) loadMoreBtn.innerHTML = '<span>⏳ Fetching more channels...</span>';
    if (swipeBanner && !isAppend) swipeBanner.classList.add('is-refreshing');

    setAppStatus(`Fetching live Clubhouse feed (page ${page}) via get_feed_v3...`);

    try {
      const res = await window.powerdeckAPI.getFeedV3(page);
      if (res && res.success && res.data) {
        const fetchedRooms = normalizeFeedChannels(res.data);
        if (fetchedRooms.length > 0) {
          currentFeedPage = page;
          if (isAppend) {
            const existingIds = new Set(liveRooms.map(r => r.channel));
            const newRooms = fetchedRooms.filter(r => !existingIds.has(r.channel));
            liveRooms = liveRooms.concat(newRooms);
          } else {
            if (currentActiveRoom && !fetchedRooms.some(r => r.channel === currentActiveRoom.channel)) {
              liveRooms = [currentActiveRoom, ...fetchedRooms];
            } else {
              liveRooms = fetchedRooms;
            }
          }
          renderRoomsFeed();
          setAppStatus(`Feed updated: ${liveRooms.length} live rooms active • get_feed_v3`);
        } else {
          setAppStatus(isAppend ? "No more rooms available on feed" : "No live channels currently active in feed");
        }
      } else {
        console.warn("get_feed_v3 returned notice:", res);
        setAppStatus(`get_feed_v3: ${res ? res.error || 'Channels loaded' : 'Offline stream'}`);
      }
    } catch (err) {
      console.error("Error calling getFeedV3:", err);
      setAppStatus(`get_feed_v3 error: ${err.message}`);
    } finally {
      isLoadingFeed = false;
      if (refreshIcon) refreshIcon.classList.remove('rotating');
      if (refreshLabel) refreshLabel.textContent = 'Refresh Feed';
      if (loadMoreBtn) loadMoreBtn.innerHTML = '<span>⚡ Load More Channels</span>';
      if (swipeBanner) swipeBanner.classList.remove('is-refreshing');
    }
  }

  const fetchFeedChannels = () => loadFeedV3(1, false);

  // 10-Second Auto Feed Refresh Timer
  let feedAutoRefreshTimer = null;
  function startFeedAutoRefresh() {
    if (feedAutoRefreshTimer) clearInterval(feedAutoRefreshTimer);
    feedAutoRefreshTimer = setInterval(() => {
      // Refresh feed_v3 every 10 seconds
      if (!isLoadingFeed) {
        loadFeedV3(1, false);
      }
    }, 10000);
  }

  // Resolve room link matched from feed_v3 rather than get_channel
  async function getFeedRoomLink(channelId) {
    const cleanId = String(channelId || '').trim();
    if (!cleanId) return '';

    // 1. Try to match the active channel with feed items already loaded in liveRooms
    let matched = liveRooms.find(r => {
      const rCh = String(r.channel || r.id || '').trim();
      const rawCh = r.rawChannel ? String(r.rawChannel.channel || r.rawChannel.channel_id || '').trim() : '';
      return (rCh && rCh.toLowerCase() === cleanId.toLowerCase()) ||
             (rawCh && rawCh.toLowerCase() === cleanId.toLowerCase());
    });

    // 2. If not matched in liveRooms cache, query get_feed_v3 and match
    if (!matched && window.powerdeckAPI && window.powerdeckAPI.getFeedV3) {
      try {
        const res = await window.powerdeckAPI.getFeedV3(1);
        if (res && res.success && res.data) {
          const rawItems = Array.isArray(res.data.items) ? res.data.items :
            (Array.isArray(res.data.channels) ? res.data.channels :
            (res.data.data && Array.isArray(res.data.data.items) ? res.data.data.items : []));

          // Check raw feed objects directly
          for (const item of rawItems) {
            const ch = item.channel || (item.channel_id ? item : null);
            if (ch) {
              const chCode = String(ch.channel || ch.channel_id || '').trim();
              if (chCode && chCode.toLowerCase() === cleanId.toLowerCase()) {
                return ch.url || item.url || item.channel_url || `https://www.clubhouse.com/room/${cleanId}`;
              }
            }
          }

          // Check normalized feed channels
          const fetchedRooms = normalizeFeedChannels(res.data);
          matched = fetchedRooms.find(r => {
            const rCh = String(r.channel || r.id || '').trim();
            const rawCh = r.rawChannel ? String(r.rawChannel.channel || r.rawChannel.channel_id || '').trim() : '';
            return (rCh && rCh.toLowerCase() === cleanId.toLowerCase()) ||
                   (rawCh && rawCh.toLowerCase() === cleanId.toLowerCase());
          });
        }
      } catch (err) {
        console.warn("[getFeedRoomLink] feed_v3 fetch match error:", err);
      }
    }

    // 3. Return the exact link that feed_v3 provides
    if (matched) {
      return matched.url ||
             (matched.rawChannel && matched.rawChannel.url) ||
             `https://www.clubhouse.com/room/${cleanId}`;
    }

    // 4. Default exact feed_v3 format
    return `https://www.clubhouse.com/room/${cleanId}`;
  }

  // Copy Room Link matched strictly with feed_v3 (not from get_channel)
  async function copyStageRoomLink(channelId, buttonEl = null) {
    const cleanId = String(channelId || '').trim();
    if (!cleanId) {
      showAlert('warning', 'No active channel selected to copy link.');
      return;
    }

    const origHtml = buttonEl ? buttonEl.innerHTML : null;
    if (buttonEl) {
      buttonEl.textContent = '⏳ Copying...';
      buttonEl.disabled = true;
    }

    try {
      const feedUrl = await getFeedRoomLink(cleanId);
      if (feedUrl) {
        if (window.powerdeckAPI && window.powerdeckAPI.copyToClipboard) {
          await window.powerdeckAPI.copyToClipboard(feedUrl);
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(feedUrl);
        }

        showAlert('info', `Copied room link from feed! 🔗 (${feedUrl})`);

        if (buttonEl) {
          buttonEl.textContent = '✓ Copied!';
          buttonEl.classList.add('copied');
          setTimeout(() => {
            if (origHtml) buttonEl.innerHTML = origHtml;
            else buttonEl.textContent = '🔗 Copy Link';
            buttonEl.classList.remove('copied');
            buttonEl.disabled = false;
          }, 1800);
        }
      }
    } catch (err) {
      console.error("[Clubhouse] copyStageRoomLink error:", err);
      showAlert('error', `Copy link error: ${err.message}`);
      if (buttonEl) {
        if (origHtml) buttonEl.innerHTML = origHtml;
        else buttonEl.textContent = '🔗 Copy Link';
        buttonEl.disabled = false;
      }
    }
  }

  // Clubhouse: Unified Invite Link (/api/get_unified_invite_link) for Stage Room
  async function shareUnifiedRoomLink(channelId, buttonEl = null) {
    const cleanId = String(channelId || '').trim();
    if (!cleanId) {
      showAlert('warning', 'No active channel selected to share.');
      return null;
    }

    const origHtml = buttonEl ? buttonEl.innerHTML : null;
    if (buttonEl) {
      buttonEl.textContent = '⏳ Sharing...';
      buttonEl.disabled = true;
    }

    try {
      const res = await window.powerdeckAPI.getUnifiedInviteLink(cleanId, false);
      console.log("[Clubhouse] get_unified_invite_link response:", res);

      const inviteUrl = res?.url ||
        (res?.data && res.data.url) ||
        (res?.invite_code ? `https://www.clubhouse.com/i/test/${res.invite_code}` : null) ||
        (res?.data && res.data.invite_code ? `https://www.clubhouse.com/i/test/${res.data.invite_code}` : null);

      if (inviteUrl) {
        if (window.powerdeckAPI && window.powerdeckAPI.copyToClipboard) {
          await window.powerdeckAPI.copyToClipboard(inviteUrl);
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(inviteUrl);
        }

        showAlert('success', `Copied room invite link! 📤 ${inviteUrl}`);

        if (buttonEl) {
          buttonEl.textContent = '✓ Copied!';
          buttonEl.classList.add('copied');
          setTimeout(() => {
            if (origHtml) buttonEl.innerHTML = origHtml;
            else buttonEl.textContent = '📤 Share';
            buttonEl.classList.remove('copied');
            buttonEl.disabled = false;
          }, 1800);
        }

        return inviteUrl;
      } else {
        const errMsg = (res && (res.error || (res.data && (res.data.error_message || res.data.message)))) || 'Failed to generate unified invite link';
        showAlert('error', errMsg);
        if (buttonEl) {
          if (origHtml) buttonEl.innerHTML = origHtml;
          else buttonEl.textContent = '📤 Share';
          buttonEl.disabled = false;
        }
        return null;
      }
    } catch (err) {
      console.error("[Clubhouse] get_unified_invite_link error:", err);
      showAlert('error', `Share link error: ${err.message}`);
      if (buttonEl) {
        if (origHtml) buttonEl.innerHTML = origHtml;
        else buttonEl.textContent = '📤 Share';
        buttonEl.disabled = false;
      }
      return null;
    }
  }

  // Update visibility of Disable Replay buttons across UI
  function updateDisableReplayButtonsVisibility(isReplayEnabled, canDisableReplay) {
    const show = Boolean(isReplayEnabled && canDisableReplay);
    const btnTop = document.getElementById('btn-disable-replay-top');
    const btnDock = document.getElementById('btn-dock-disable-replay');
    const btnModal = document.getElementById('btn-stage-modal-disable-replay');

    if (btnTop) {
      btnTop.style.display = show ? 'inline-flex' : 'none';
    }
    if (btnDock) {
      btnDock.style.display = show ? 'inline-flex' : 'none';
    }
    if (btnModal) {
      btnModal.style.display = show ? 'inline-flex' : 'none';
    }
  }

  // Clubhouse: Disable Replay Action (/api/disable_replay)
  async function handleDisableReplay() {
    if (!currentActiveRoom) return;
    const channelId = currentActiveRoom.channel || currentActiveRoom.id;
    if (!channelId) return;

    const btnTop = document.getElementById('btn-disable-replay-top');
    const btnDock = document.getElementById('btn-dock-disable-replay');
    const btnModal = document.getElementById('btn-stage-modal-disable-replay');

    if (btnTop) { btnTop.textContent = '⏳ Disabling...'; btnTop.disabled = true; }
    if (btnDock) { btnDock.textContent = '⏳ Disabling...'; btnDock.disabled = true; }
    if (btnModal) { btnModal.disabled = true; }

    try {
      const res = await window.powerdeckAPI.disableReplay(channelId);
      console.log("[Clubhouse] disable_replay response:", res);

      if (res && res.success !== false) {
        currentActiveRoom.isReplayEnabled = false;
        currentActiveRoom.canDisableReplay = false;
        if (currentActiveRoom.rawChannel) {
          currentActiveRoom.rawChannel.is_replay_enabled = false;
          currentActiveRoom.rawChannel.can_disable_replay = false;
        }
        showAlert('success', 'Room replay has been disabled! 📼');
        updateDisableReplayButtonsVisibility(false, false);
        // Refresh channel state
        setTimeout(() => refreshActiveChannelState(), 600);
      } else {
        const errMsg = (res && (res.error || (res.data && (res.data.error_message || res.data.message)))) || 'Failed to disable replay';
        showAlert('error', errMsg);
      }
    } catch (err) {
      console.error("[Clubhouse] disableReplay error:", err);
      showAlert('error', `Error disabling replay: ${err.message}`);
    } finally {
      if (btnTop) {
        btnTop.innerHTML = '<span>📼 Disable Replay</span>';
        btnTop.disabled = false;
      }
      if (btnDock) {
        btnDock.innerHTML = '<span>📼 Disable Replay</span>';
        btnDock.disabled = false;
      }
      if (btnModal) {
        btnModal.disabled = false;
      }
    }
  }

  // Join Channel by ID or Custom Payload (Authenticates with Clubhouse API, Agora & PubNub)
  async function joinChannelById(channelArg, preloadedData = null) {
    let cleanId = '';
    let joinParam = channelArg;
    if (typeof channelArg === 'string') {
      cleanId = channelArg.trim();
      joinParam = cleanId;
    } else if (channelArg && typeof channelArg === 'object') {
      cleanId = String(channelArg.channel || channelArg.channelId || '').trim();
      joinParam = channelArg;
    }
    if (!cleanId) return;

    if (currentActiveRoom && (currentActiveRoom.channel === cleanId || currentActiveRoom.id === cleanId)) {
      showAlert('info', `Already connected to "${currentActiveRoom.title || cleanId}"`);
      return;
    }

    if (currentActiveRoom) {
      await leaveActiveRoom();
    }
    // Always join stages with local mic muted
    isMicMuted = true;
    updateMicUI();
    hasFetchedInitialChannelMessages = false;
    channelMessagesStore.clear();
    chatNextCursor = null;
    isLoadingOlderChatMessages = false;
    totalRoomMessagesCount = 0;
    updateChatCountPill(0);
    const chatMsgList = document.getElementById('chat-messages-list');
    if (chatMsgList) chatMsgList.innerHTML = '';

    // Check if cleanId or channelArg contains an invite code or invite link
    const detectedInviteCode = extractInviteCode(cleanId);
    if (detectedInviteCode && (!channelArg || typeof channelArg !== 'object' || !channelArg.channel || channelArg.channel === detectedInviteCode)) {
      try {
        console.log(`[Clubhouse] Resolving invite code before joinChannelById: ${detectedInviteCode}`);
        const invRes = await window.powerdeckAPI.getContentInviteInfo(detectedInviteCode);
        if (invRes && invRes.success && invRes.data && invRes.data.channel) {
          const ch = invRes.data.channel;
          const targetHash = ch.presigned_channel_hash || ch.channel;
          if (targetHash) {
            joinParam = {
              channel: targetHash,
              source: 17,
              invite_code: detectedInviteCode
            };
            cleanId = ch.channel || cleanId;
          }
        }
      } catch (invErr) {
        console.warn("[Clubhouse] Notice resolving invite code in joinChannelById:", invErr);
      }
    }

    const displayChannelId = cleanId.length > 20 ? cleanId.slice(0, 16) + '...' : cleanId;
    setAppStatus(`Connecting to Clubhouse channel ${displayChannelId}...`);
    showAlert('info', `Connecting to channel ${displayChannelId}...`);

    try {
      let data = preloadedData;
      let joinRes = null;
      if (!data) {
        const res = await window.powerdeckAPI.joinChannel(joinParam);
        joinRes = res;
        console.log("[Clubhouse] joinChannel response:", JSON.stringify(res, null, 2));

        if (!res || res.success === false) {
          showAlert('error', (res && res.error) || `Could not join channel ${displayChannelId}`);
          setAppStatus(`Join failed: ${(res && res.error) || 'Channel unreachable'}`);
          return;
        }

        data = res.data || res;
      }

      // CRITICAL: Extract actual active channel identifier (e.g. "MO8GY5V4" if cleanId was an invite code or presigned hash)
      const targetChannelId = (data && data.channel) ? String(data.channel).trim() : cleanId;

      const myUserId = (data && data.user_profile_id) || getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '577813458';
      const rawUsers = Array.isArray(data.users) ? data.users : [];
      const creatorId = data.creator_user_profile_id;
      const meInUsers = rawUsers.find(u => String(u.user_id) === String(myUserId));

      if (meInUsers) {
        isCurrentUserSpeaker = !!meInUsers.is_speaker;
        isCurrentUserModerator = !!meInUsers.is_moderator || meInUsers.user_id === creatorId;
      } else {
        isCurrentUserSpeaker = !!data.is_speaker;
        isCurrentUserModerator = !!data.is_moderator || creatorId === Number(myUserId);
      }

      const existingRoom = liveRooms.find(r => r.channel === targetChannelId || r.id === targetChannelId || r.channel === cleanId);
      const topic = data.topic || data.title || (existingRoom && existingRoom.title) || `Channel ${targetChannelId}`;
      const clubName = (data.club && data.club.name) || data.club_name || (data.social_club && data.social_club.name) || (data.privacy_settings && data.privacy_settings.display_text) || (existingRoom && existingRoom.club) || '';

      const speakers = rawUsers
        .filter(u => Boolean(u.is_speaker))
        .map(u => {
          const uidStr = String(u.user_id);
          const isSelf = uidStr === String(myUserId);
          const isMuted = isSelf ? isMicMuted : Boolean(u.is_muted || u.is_speaker_muted || u.is_self_muted);
          if (isSelf) {
            if (isMicMuted) {
              unmutedSpeakerUids.delete(uidStr);
              agoraMutedUids.add(uidStr);
            } else {
              unmutedSpeakerUids.add(uidStr);
              agoraMutedUids.delete(uidStr);
            }
          } else if (isMuted) {
            unmutedSpeakerUids.delete(uidStr);
            agoraMutedUids.add(uidStr);
          }
          const isAnon = isAnonymousUser(u);
          return {
            userId: u.user_id,
            name: u.name || u.first_name || (isAnon ? 'anon' : "Speaker"),
            handle: u.username ? `@${u.username}` : "",
            photo: u.photo_url || u.photo || null,
            isModerator: !!u.is_moderator || (String(u.user_id) === String(creatorId)),
            isSpeaker: true,
            speaking: false,
            isMuted: isMuted,
            badge: (u.is_moderator || String(u.user_id) === String(creatorId)) ? "★ Moderator" : "Speaker",
            channelEmoji: u.channel_emoji || null,
            isPaidUser: !!u.is_paid_user,
            isInvitedAsSpeaker: !!u.is_invited_as_speaker,
            isAnonymousUser: isAnon,
            anonymousUserEmoji: isAnon ? getAnonymousUserEmoji(u) : null
          };
        });

      const speakerIdSet = new Set(speakers.map(s => String(s.userId || s.user_id)));

      const listeners = rawUsers
        .filter(u => !speakerIdSet.has(String(u.user_id)))
        .map(u => {
          const isAnon = isAnonymousUser(u);
          return {
            userId: u.user_id,
            name: u.name || u.first_name || (isAnon ? 'anon' : "Listener"),
            handle: u.username ? `@${u.username}` : "",
            photo: u.photo_url || u.photo || null,
            channelEmoji: u.channel_emoji || null,
            isPaidUser: !!u.is_paid_user,
            isModerator: !!u.is_moderator,
            isAnonymousUser: isAnon,
            anonymousUserEmoji: isAnon ? getAnonymousUserEmoji(u) : null
          };
        });

      const roomObj = {
        id: targetChannelId,
        channel: targetChannelId,
        category: "agora",
        club: clubName ? clubName.toUpperCase() : "",
        title: topic,
        url: data.url || `https://www.clubhouse.com/room/${targetChannelId}`,
        desc: data.description || `Live Clubhouse Channel • Channel ID: ${targetChannelId}`,
        speakers: speakers.length > 0 ? speakers : (existingRoom ? existingRoom.speakers : [
          { name: "Host", handle: "", isModerator: true, isSpeaker: true, speaking: false, badge: "★ Moderator" }
        ]),
        listeners: listeners,
        listenersCount: listeners.length > 0 ? listeners.length : Math.max(0, (data.num_all || 0) - speakers.length),
        users: rawUsers,
        rawChannel: data,
        socialClub: data.social_club || (existingRoom ? existingRoom.socialClub : null),
        token: data.token,
        rtm_token: data.rtm_token,
        pubnub_token: data.pubnub_token,
        links: extractChannelLinks(data, joinRes ? joinRes.data : null) || [],
        isChatEnabled: typeof data.is_chat_enabled !== 'undefined' ? Boolean(data.is_chat_enabled) : true,
        isReplayEnabled: typeof data.is_replay_enabled !== 'undefined' ? Boolean(data.is_replay_enabled) : false,
        canDisableReplay: typeof data.can_disable_replay !== 'undefined' ? Boolean(data.can_disable_replay) : false
      };

      // Ensure room is placed at top of liveRooms
      if (!liveRooms.some(r => r.channel === targetChannelId)) {
        liveRooms.unshift(roomObj);
      }

      // Activate room state & UI
      joinRoom(roomObj);

      // Ensure live Stage Viewer modal remains closed while joining
      if (modalStageViewer) {
        modalStageViewer.style.display = 'none';
      }

      // Connect Agora Audio using real channel ID (e.g. "m7KdZ5rR")
      await connectAgoraAudio(targetChannelId, data);

      // Enforce muted mic state upon connecting to stage
      await setMicMuted(true);

      // Connect PubNub live stream
      connectPubNub(targetChannelId, data);

      // Fetch initial channel messages once on join and update the room chat
      fetchInitialChannelMessages(false);

      // Start presence & get_channel polling
      startChannelPolling(targetChannelId);
      startActivePing(targetChannelId);
      updateEndRoomButtonVisibility();
      updateHandUI();

      try {
        localStorage.setItem('powerdeck_active_channel', targetChannelId);
      } catch (_) {}

      showAlert('success', `Joined channel "${topic}"! ⚡`);
      setAppStatus(`Joined "${topic}" • Connected via Agora & PubNub`);
    } catch (err) {
      console.error("[Clubhouse] Error in joinChannelById:", err);
      showAlert('error', `Failed to join channel: ${err.message}`);
      setAppStatus(`Join error: ${err.message}`);
    }
  }

  function joinRoom(room) {
    currentActiveRoom = room;
    isMicMuted = true;
    updateMicUI();
    unmutedSpeakerUids.clear();
    agoraMutedUids.clear();
    speakerMuteVisualCache.clear();
    hasFetchedInitialChannelMessages = false;
    channelMessagesStore.clear();
    chatNextCursor = null;
    isLoadingOlderChatMessages = false;
    const speakersGrid = document.getElementById('channel-speakers-grid');
    const listenersGrid = document.getElementById('channel-listeners-grid');
    const msgList = document.getElementById('chat-messages-list');
    const pinnedLinkBar = document.getElementById('channel-pinned-link-bar');
    if (speakersGrid) speakersGrid.removeAttribute('data-speaker-sig');
    if (listenersGrid) listenersGrid.removeAttribute('data-listener-sig');
    if (msgList) msgList.removeAttribute('data-chat-fingerprint');
    if (pinnedLinkBar) pinnedLinkBar.removeAttribute('data-link-sig');
    isFirstChatLoad = true;
    renderRoomsFeed();
    updateChannelPreview(room);
    renderStageController(room);
    startChannelPolling(room.channel || room.id);
    setAppStatus(`Joined "${room.title}" • Connected via Agora Voice (Channel: ${room.channel})`);
  }

  // Show target user floating emoji reaction palette
  function showTargetReactionPalette(anchorBtn, targetUserId, targetUserName = null) {
    if (!anchorBtn || !targetUserId) return;
    const existing = document.getElementById('target-reaction-floating-palette');
    if (existing) {
      const prevTarget = existing.getAttribute('data-target-user-id');
      existing.remove();
      if (prevTarget === String(targetUserId)) return;
    }

    const palette = document.createElement('div');
    palette.id = 'target-reaction-floating-palette';
    palette.className = 'target-react-palette';
    palette.setAttribute('data-target-user-id', String(targetUserId));

    const emojis = (Array.isArray(currentEmojiReactionOptions) && currentEmojiReactionOptions.length > 0)
      ? currentEmojiReactionOptions.slice(0, 8)
      : [
        { id: 34, emoji: "❤️" },
        { id: 1, emoji: "👏" },
        { id: 2, emoji: "🔥" },
        { id: 3, emoji: "😂" },
        { id: 4, emoji: "🎉" },
        { id: 5, emoji: "😮" },
        { id: 6, emoji: "🙏" },
        { id: 7, emoji: "💯" }
      ];

    palette.innerHTML = emojis.map(em => `
      <span class="target-react-item" data-emoji="${escapeHtml(em.emoji)}" data-reaction-id="${em.id}" title="${escapeHtml(em.emoji)} (ID: ${em.id})">${escapeHtml(em.emoji)}</span>
    `).join('') + `
      <span class="target-react-item target-react-gif" title="React with GIF (Round Profile Preview)">🎬 GIF</span>
      <span class="target-react-item target-react-more" title="More Windows Emojis (Win + .)">➕</span>
    `;

    document.body.appendChild(palette);

    // Anchor to the user card (speaker or listener tile), or dock button
    const targetTile = anchorBtn.closest('.speaker-tile, .listener-tile') || anchorBtn;
    const tileRect = targetTile.getBoundingClientRect();
    const tileCenterX = tileRect.left + (tileRect.width / 2);

    const paletteW = palette.offsetWidth || 320;
    const paletteH = palette.offsetHeight || 38;

    // Position directly on TOP of the user tile, centered above avatar
    let left = tileCenterX - (paletteW / 2);
    left = Math.max(10, Math.min(window.innerWidth - paletteW - 10, left));
    let top = tileRect.top - paletteH - 8;
    if (top < 10) {
      top = Math.max(8, tileRect.top - paletteH - 4);
    }
    palette.style.position = 'fixed';
    palette.style.zIndex = '3900';
    palette.style.transform = 'none';
    palette.style.top = `${Math.round(top)}px`;
    palette.style.left = `${Math.round(left)}px`;

    const gifBtn = palette.querySelector('.target-react-gif');
    if (gifBtn) {
      gifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        palette.remove();
        activeGifTargetUserId = String(targetUserId);
        activeGifTargetUserName = targetUserName || (targetUserId === 'ALL_SPEAKERS' ? 'Channel Speakers' : 'Speaker');
        openGiphyStudioModal();
      });
    }

    palette.querySelectorAll('.target-react-item:not(.target-react-more):not(.target-react-gif)').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const emoji = b.getAttribute('data-emoji');
        const reactionId = Number(b.getAttribute('data-reaction-id') || EMOJI_TO_REACTION_ID[emoji] || 34);
        palette.remove();

        if (targetUserId === 'ALL_USERS' || targetUserId === 'ALL_SPEAKERS') {
          const speakerIds = await getFreshSpeakerUserIds(true);
          const myId = Number(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))));
          console.log(`[Clubhouse] React to stage speakers: fetched get_channel -> sending reaction_id=${reactionId} ("${emoji}") to ${speakerIds.length} speakers (excluding self):`, speakerIds);
          if (speakerIds.length > 0) {
            let staggerDelay = 0;
            speakerIds.forEach(uId => {
              setTimeout(() => {
                triggerStageReactionAnimation(myId, uId, emoji);
              }, staggerDelay);
              staggerDelay += 40;
            });
          } else if (myId) {
            triggerTargetEmojiAnimation(myId, emoji);
          }
          if (currentActiveRoom && currentActiveRoom.channel && speakerIds.length > 0) {
            window.powerdeckAPI.sendChannelReaction(
              currentActiveRoom.channel,
              speakerIds,
              reactionId,
              false,
              emoji,
              false // Standard React uses send_channel_reaction with reaction_id
            ).then(res => handleReactionApiResponse(res, speakerIds)).catch(console.warn);
          } else if (speakerIds.length === 0) {
            console.log(`[Clubhouse] React to stage speakers: No other speakers on stage besides self. Skipped API reaction to avoid overusage.`);
          }
        } else {
          const myId = Number(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))));
          if (!isNaN(Number(targetUserId)) && Number(targetUserId) === myId) {
            console.log(`[Clubhouse] Skipping reaction to own user ID (${myId}) to avoid overusage.`);
            triggerTargetEmojiAnimation(myId, emoji);
          } else {
            dispatchSendReaction(emoji, reactionId, targetUserId, false);
          }
        }
      });
    });

    const moreBtn = palette.querySelector('.target-react-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        palette.remove();
        showExtraReactionPalette(anchorBtn, targetUserId, targetUserName || (targetUserId === 'ALL_USERS' || targetUserId === 'ALL_SPEAKERS' ? 'Channel Speakers' : 'Speaker'));
      });
    }

    const closeHandler = (e) => {
      if (!palette.contains(e.target) && !anchorBtn.contains(e.target)) {
        palette.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  function attachSpeakerGridEvents(speakersGrid, myUserId) {
    speakersGrid.querySelectorAll('.speaker-tile').forEach(tile => {
      tile.addEventListener('click', (e) => {
        if (e.target.closest('.speaker-inline-actions') || e.target.closest('.target-react-palette')) {
          return;
        }
        const uId = tile.getAttribute('data-user-id');
        const myId = getLoggedInUserId();
        const myUser = getLoggedInUser();
        const myUsername = myUser && (myUser.username || (activeProfile && activeProfile.user && activeProfile.user.username));

        // Self-check: if this tile is the logged-in user, redirect to profile customization
        const isSelf = tile.classList.contains('is-self') ||
                       (myId && String(uId) === String(myId)) ||
                       (myUserId && String(uId) === String(myUserId));

        if (isSelf) {
          openProfileStudioModal();
          return;
        }

        if (uId && uId !== '1') {
          openUserProfileModal(uId, 'channel_speaker', null, true);
        }
      });
    });

    // Self mute button
    speakersGrid.querySelectorAll('.act-self-mute').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleMicMuted();
      });
    });

    // Mute inline button for other users
    speakersGrid.querySelectorAll('.act-mute').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uId = btn.getAttribute('data-user-id');
        const uName = btn.getAttribute('data-name');
        if (String(uId) === String(myUserId)) {
          await toggleMicMuted();
        } else {
          unmutedSpeakerUids.delete(String(uId));
          agoraMutedUids.add(String(uId));
          updateSpeakerMuteVisuals(uId, true, true);
          updateUserSpeakingIndicator(uId, false);
          try {
            const res = await window.powerdeckAPI.muteSpeaker(currentActiveRoom.channel, uId);
            if (res && res.success !== false) {
              showAlert('success', `Muted ${uName}`);
              await refreshActiveChannelState();
            } else {
              showAlert('warning', res.error || `Failed to mute ${uName}`);
            }
          } catch (err) {
            showAlert('error', err.message);
          }
        }
      });
    });

    // Move to audience inline button (for both self and other speakers)
    speakersGrid.querySelectorAll('.act-move').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uId = btn.getAttribute('data-user-id');
        const uName = btn.getAttribute('data-name');
        const isMe = String(uId) === String(myUserId);
        try {
          const res = await window.powerdeckAPI.uninviteSpeaker(currentActiveRoom.channel, uId);
          if (res && res.success !== false) {
            showAlert('success', isMe ? 'Moved yourself to audience' : `Moved ${uName} to audience`);
            if (isMe) {
              await demoteToAudienceInAgora();
              isCurrentUserSpeaker = false;
              updateHandUI();
            }
            await refreshActiveChannelState();
          } else {
            showAlert('warning', res.error || `Failed to move ${uName} to audience`);
          }
        } catch (err) {
          showAlert('error', err.message);
        }
      });
    });

    // Make moderator inline button (for other speakers who are not moderators)
    speakersGrid.querySelectorAll('.act-mod').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uId = btn.getAttribute('data-user-id');
        const uName = btn.getAttribute('data-name');
        if (!currentActiveRoom || !currentActiveRoom.channel) return;
        try {
          const res = await window.powerdeckAPI.makeModerator(currentActiveRoom.channel, uId);
          if (res && res.success !== false) {
            showAlert('success', `Made ${uName} a moderator ⭐`);
            await refreshActiveChannelState();
          } else {
            showAlert('warning', res.error || `Failed to make ${uName} a moderator`);
          }
        } catch (err) {
          showAlert('error', err.message);
        }
      });
    });

    // React inline button
    speakersGrid.querySelectorAll('.act-react').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uId = btn.getAttribute('data-user-id');
        showTargetReactionPalette(btn, uId);
      });
    });

    // Extra React button (Manual & all Windows/iOS emojis)
    speakersGrid.querySelectorAll('.act-extra-react').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uId = btn.getAttribute('data-user-id');
        const uName = btn.getAttribute('data-name') || 'Speaker';
        showExtraReactionPalette(btn, uId, uName);
      });
    });

    // Moderator remove speaker from room
    speakersGrid.querySelectorAll('.act-remove-from-room').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uId = btn.getAttribute('data-user-id');
        const uName = btn.getAttribute('data-name') || 'speaker';
        if (!uId || !currentActiveRoom || !currentActiveRoom.channel) return;
        if (!confirm(`Are you sure you want to remove ${uName} from this room?`)) return;

        btn.disabled = true;
        try {
          const res = await window.powerdeckAPI.blockFromChannel(currentActiveRoom.channel, Number(uId));
          if (res && res.success !== false) {
            showAlert('success', `Removed ${uName} from room`);
            await refreshActiveChannelState();
          } else {
            showAlert('warning', (res && res.error) || `Failed to remove ${uName} from room`);
          }
        } catch (err) {
          showAlert('error', err.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function attachListenerGridEvents(listenersGrid) {
    listenersGrid.querySelectorAll('.listener-tile').forEach(tile => {
      tile.addEventListener('click', (e) => {
        if (e.target.closest('.listener-inline-actions') || e.target.closest('.target-react-palette')) {
          return;
        }
        if (tile.classList.contains('is-anon') || tile.getAttribute('data-is-anon') === 'true') {
          showAlert('info', 'Anonymous listener (profile not available) 🕶️');
          return;
        }
        const uId = tile.getAttribute('data-user-id');
        const myId = getLoggedInUserId();
        const myUser = getLoggedInUser();
        const myUsername = myUser && (myUser.username || (activeProfile && activeProfile.user && activeProfile.user.username));

        const isSelf = tile.classList.contains('is-self') ||
                       (myId && String(uId) === String(myId));

        if (isSelf) {
          openProfileStudioModal();
          return;
        }

        if (uId) {
          openUserProfileModal(uId, 'channel_listener', null, true);
        }
      });
    });

    // Invite Speaker button (when user is Speaker + Moderator)
    listenersGrid.querySelectorAll('.act-invite-speaker').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uId = btn.getAttribute('data-user-id');
        const uName = btn.getAttribute('data-name') || 'listener';
        if (!uId || !currentActiveRoom || !currentActiveRoom.channel) return;

        btn.disabled = true;
        const prevText = btn.textContent;
        btn.textContent = '...';

        try {
          const res = await window.powerdeckAPI.inviteSpeaker(currentActiveRoom.channel, uId);
          if (res && res.success !== false) {
            showAlert('success', `Invited ${uName} to speak!`);
            btn.textContent = '✓ Invited';
            btn.classList.add('is-invited');
          } else {
            btn.disabled = false;
            btn.textContent = prevText || '🎙️ Invite';
            showAlert('warning', (res && res.error) || 'Failed to invite speaker');
          }
        } catch (err) {
          btn.disabled = false;
          btn.textContent = prevText || '🎙️ Invite';
          showAlert('error', `Invite error: ${err.message}`);
        }
      });
    });
  }

  function scheduleChannelPreviewUpdate(room) {
    if (!room) return;
    if (channelPreviewUpdateTimer) return;
    channelPreviewUpdateTimer = setTimeout(() => {
      channelPreviewUpdateTimer = null;
      if (currentActiveRoom) {
        updateChannelPreview(currentActiveRoom);
      }
    }, 120);
  }

  // Update whole channel preview elements with exact channel details
  function updateChannelPreview(room) {
    if (channelPreviewUpdateTimer) {
      clearTimeout(channelPreviewUpdateTimer);
      channelPreviewUpdateTimer = null;
    }
    if (!room) {
      renderChannelStandby();
      return;
    }
    updateTopAnonButtonVisibility();

    // Expand the channel viewport box and switch to split layout
    const splitContainer = document.getElementById('hallway-split-container');
    const channelViewport = document.getElementById('hallway-channel-viewport');
    if (splitContainer) {
      splitContainer.classList.remove('no-active-room');
      splitContainer.classList.add('has-active-room');
    }
    if (channelViewport) {
      channelViewport.style.display = 'flex';
    }
    const startRoomBar = document.getElementById('start-room-bar-row');
    if (startRoomBar) startRoomBar.style.display = 'none';

    const liveTitle = document.getElementById('channel-live-title');
    const viewId = document.getElementById('channel-view-id');
    const housePill = document.getElementById('channel-house-pill');
    const houseName = document.getElementById('channel-house-name');
    const spkBadge = document.getElementById('ch-speakers-badge');
    const lisBadge = document.getElementById('ch-listeners-badge');
    const speakersGrid = document.getElementById('channel-speakers-grid');
    const listenersGrid = document.getElementById('channel-listeners-grid');
    const statusDot = document.getElementById('channel-status-dot');
    const statusBadge = document.getElementById('channel-status-badge');
    const btnLeave = document.getElementById('btn-leave-channel-view');

    if (statusDot) statusDot.textContent = '🟢';
    if (statusBadge) {
      statusBadge.textContent = 'CONNECTED';
      statusBadge.style.color = 'var(--success)';
    }
    if (viewId && viewId.textContent !== (room.channel || room.id)) viewId.textContent = room.channel || room.id;
    if (btnLeave) btnLeave.style.display = 'inline-flex';

    // Account role: check if user is a speaker or in listening mode
    const myUserId = String(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '').trim();
    const speakers = room.speakers || [];
    const amISpeaker = speakers.some(s => String(s.userId || s.user_id) === String(myUserId));
    isCurrentUserSpeaker = amISpeaker;
    const isListeningMode = !isCurrentUserSpeaker;

    // Moderator check: only moderators can see the End Room button
    const amIMod = Boolean(
      isCurrentUserModerator ||
      room.isModerator ||
      speakers.some(s => String(s.userId || s.user_id) === String(myUserId) && (s.isModerator || s.is_moderator))
    );
    isCurrentUserModerator = amIMod;
    updateEndRoomButtonVisibility();
    updateHandUI();
    updateMicUI();

    // Never change name to "Stage" or "Live Stage" - always use clicked channel's exact topic
    if (liveTitle && liveTitle.textContent !== (room.title || 'Untitled Channel')) {
      liveTitle.textContent = room.title || 'Untitled Channel';
    }

    // In listening mode: do NOT show the channel title edit button
    const btnEditTitle = document.getElementById('btn-edit-channel-title');
    if (btnEditTitle) {
      btnEditTitle.style.display = isListeningMode ? 'none' : 'inline-flex';
    }

    const activeChannelId = (room && (room.channel || room.id)) || (currentActiveRoom && (currentActiveRoom.channel || currentActiveRoom.id));

    const btnCopyStageLink = document.getElementById('btn-copy-stage-link');
    if (btnCopyStageLink) {
      btnCopyStageLink.style.display = 'inline-flex';
      btnCopyStageLink.onclick = (e) => {
        e.stopPropagation();
        copyStageRoomLink(activeChannelId, btnCopyStageLink);
      };
    }

    const btnShareStageLink = document.getElementById('btn-share-stage-link');
    if (btnShareStageLink) {
      btnShareStageLink.style.display = 'inline-flex';
      btnShareStageLink.onclick = (e) => {
        e.stopPropagation();
        shareUnifiedRoomLink(activeChannelId, btnShareStageLink);
      };
    }

    const btnPingStage = document.getElementById('btn-ping-stage');
    if (btnPingStage) {
      btnPingStage.style.display = 'inline-flex';
      btnPingStage.onclick = (e) => {
        e.stopPropagation();
        openPingModal();
      };
    }

    // Disable Replay Button Visibility (is_replay_enabled && can_disable_replay)
    const isReplayEnabled = Boolean(room.isReplayEnabled ?? (room.rawChannel && room.rawChannel.is_replay_enabled));
    const canDisableReplay = Boolean(room.canDisableReplay ?? (room.rawChannel && room.rawChannel.can_disable_replay));
    updateDisableReplayButtonsVisibility(isReplayEnabled, canDisableReplay);

    // Room Chat Enable / Disable Tick Checkbox
    const chkChat = document.getElementById('chk-channel-chat');
    const chatToggle = document.getElementById('chat-tick-toggle');
    const btnTopRoomChat = document.getElementById('btn-top-room-chat');
    const isChatEnabled = room.isChatEnabled !== false;

    if (chkChat) {
      chkChat.checked = isChatEnabled;
    }
    if (chatToggle) {
      chatToggle.style.display = 'inline-flex';
      chatToggle.title = isChatEnabled
        ? 'Room Chat is ENABLED (Click to disable)'
        : 'Room Chat is DISABLED (Click to enable)';
    }
    if (btnTopRoomChat) {
      btnTopRoomChat.style.display = isChatEnabled ? 'inline-flex' : 'none';
    }
    if (!isChatEnabled) {
      closeRoomChat();
    }

    // Pinned Channel Link (Positioned directly above the house name)
    const pinnedLinkBar = document.getElementById('channel-pinned-link-bar');
    const pinnedLinkContent = document.getElementById('pinned-link-content');
    const pinnedLinkThumb = document.getElementById('pinned-link-thumb');
    const pinnedLinkFallbackIcon = document.getElementById('pinned-link-fallback-icon');
    const pinnedLinkAnchor = document.getElementById('pinned-link-anchor');
    const pinnedLinkFrom = document.getElementById('pinned-link-from');
    const pinnedLinkDomainSep = document.getElementById('pinned-link-domain-sep');
    const pinnedLinkDomain = document.getElementById('pinned-link-domain');
    const btnEditLink = document.getElementById('btn-edit-channel-link');
    const btnRemoveLink = document.getElementById('btn-remove-channel-link');
    const btnAddLink = document.getElementById('btn-add-channel-link');

    if (pinnedLinkBar) {
      const rawLinks = room.links || [];
      const activeLink = Array.isArray(rawLinks) && rawLinks.length > 0 ? rawLinks[0] : null;
      const linkId = activeLink ? String(activeLink.link_id || activeLink.id || activeLink.target_link || '') : 'none';
      const targetUrl = activeLink ? (activeLink.display_link || activeLink.target_link || activeLink.link || activeLink.url || '#') : '';

      let fromName = activeLink ? (
        activeLink.from_name ||
        activeLink.added_by_name ||
        activeLink.added_by_display_name ||
        activeLink.user_name ||
        activeLink.creator_name ||
        activeLink.created_by_name ||
        (activeLink.user && (activeLink.user.name || activeLink.user.displayname || activeLink.user.first_name || activeLink.user.username)) ||
        (activeLink.user_profile && (activeLink.user_profile.name || activeLink.user_profile.displayname || activeLink.user_profile.first_name || activeLink.user_profile.username)) ||
        (activeLink.creator && (activeLink.creator.name || activeLink.creator.first_name)) ||
        (activeLink.added_by && (activeLink.added_by.name || activeLink.added_by.first_name)) ||
        ''
      ) : '';

      let fromPhoto = activeLink ? (
        activeLink.from_photo_url ||
        activeLink.photo_url ||
        activeLink.from_photo ||
        (activeLink.user && activeLink.user.photo_url) ||
        (activeLink.user_profile && activeLink.user_profile.photo_url) ||
        (activeLink.creator && activeLink.creator.photo_url) ||
        (activeLink.added_by && activeLink.added_by.photo_url) ||
        null
      ) : null;

      const authorId = activeLink ? (
        activeLink.from_user_id ||
        activeLink.added_by_id ||
        activeLink.added_by_user_id ||
        activeLink.user_id ||
        activeLink.creator_user_id ||
        activeLink.creator_user_profile_id ||
        (activeLink.user && activeLink.user.user_id) ||
        (activeLink.user_profile && activeLink.user_profile.user_id) ||
        null
      ) : null;

      if (!fromName && authorId) {
        const allUsers = [
          ...(room.users || []),
          ...(currentActiveRoom && currentActiveRoom.users ? currentActiveRoom.users : []),
          ...(room.speakers || []),
          ...(room.listeners || [])
        ];
        const matched = allUsers.find(u => String(u.user_id || u.userId) === String(authorId));
        if (matched) {
          fromName = matched.name || matched.first_name || (matched.username ? `@${matched.username}` : '');
          if (!fromPhoto) fromPhoto = matched.photo_url || matched.photo || null;
          if (activeLink) {
            activeLink.from_name = fromName;
            if (fromPhoto) activeLink.from_photo_url = fromPhoto;
          }
        } else if (profileCache && profileCache.has(String(authorId))) {
          const cp = profileCache.get(String(authorId));
          if (cp && cp.name) {
            fromName = cp.name;
            if (!fromPhoto) fromPhoto = cp.photo_url || null;
            if (activeLink) {
              activeLink.from_name = fromName;
              if (fromPhoto) activeLink.from_photo_url = fromPhoto;
            }
          }
        }
      }

      const linkSig = `${linkId}_${targetUrl}_${fromName}_${fromPhoto || ''}_${isListeningMode}`;
      const prevLinkSig = pinnedLinkBar.getAttribute('data-link-sig');

      if (prevLinkSig !== linkSig) {
        pinnedLinkBar.setAttribute('data-link-sig', linkSig);
        if (activeLink) {
          pinnedLinkBar.classList.remove('no-link');
          pinnedLinkBar.style.display = 'inline-flex';
          if (pinnedLinkContent) pinnedLinkContent.style.display = 'flex';

          // Extract link properties matching Clubhouse get_channel schema
          const linkIdVal = String(activeLink.link_id || activeLink.id || '');
          const linkTitle = activeLink.link_title || activeLink.title || activeLink.display_link || activeLink.link || 'Pinned Link';
          const previewUrl = activeLink.link_preview_url || activeLink.preview_url || activeLink.thumbnail || null;
          const linkDesc = activeLink.link_description || '';

          // Left thumbnail preview image
          if (pinnedLinkThumb && pinnedLinkFallbackIcon) {
            if (previewUrl) {
              pinnedLinkThumb.src = previewUrl;
              pinnedLinkThumb.style.display = 'block';
              pinnedLinkFallbackIcon.style.display = 'none';
              pinnedLinkThumb.onerror = () => {
                pinnedLinkThumb.style.display = 'none';
                pinnedLinkFallbackIcon.style.display = 'block';
              };
            } else {
              pinnedLinkThumb.style.display = 'none';
              pinnedLinkFallbackIcon.style.display = 'block';
            }
          }

          // Title and clickable link anchor
          if (pinnedLinkAnchor) {
            pinnedLinkAnchor.href = targetUrl;
            pinnedLinkAnchor.textContent = linkTitle;
            pinnedLinkAnchor.title = `${linkTitle}\n${targetUrl}`;
            pinnedLinkAnchor.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (targetUrl && targetUrl !== '#') {
                if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
                  window.powerdeckAPI.openExternal(targetUrl);
                } else {
                  window.open(targetUrl, '_blank');
                }
              }
            };
          }

          if (pinnedLinkContent) {
            pinnedLinkContent.onclick = () => {
              if (targetUrl && targetUrl !== '#') {
                if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
                  window.powerdeckAPI.openExternal(targetUrl);
                } else {
                  window.open(targetUrl, '_blank');
                }
              }
            };
          }

          // Domain / description
          let domainStr = '';
          try {
            const u = new URL(activeLink.display_link || activeLink.target_link || activeLink.link || '');
            domainStr = u.hostname.replace(/^www\./, '');
          } catch (_) {
            domainStr = linkDesc || '';
          }

          if (pinnedLinkDomain) {
            if (domainStr) {
              pinnedLinkDomain.style.display = 'inline';
              pinnedLinkDomain.textContent = domainStr;
            } else {
              pinnedLinkDomain.style.display = 'none';
            }
          }

          // Under link: who added it
          if (pinnedLinkFrom) {
            if (fromName) {
              pinnedLinkFrom.style.display = 'inline-flex';
              const displayName = fromName.toLowerCase().startsWith('added by') || fromName.toLowerCase().startsWith('pinned by')
                ? fromName
                : `Added by ${fromName}`;
              const avatarHtml = fromPhoto ? `<img src="${fromPhoto}" class="pinned-link-from-avatar" alt="${escapeHtml(fromName)}" onerror="this.style.display='none';">` : '';
              pinnedLinkFrom.innerHTML = `📌 ${avatarHtml}<span>${escapeHtml(displayName)}</span>`;
              if (pinnedLinkDomainSep) pinnedLinkDomainSep.style.display = domainStr ? 'inline' : 'none';
            } else {
              pinnedLinkFrom.style.display = 'none';
              if (pinnedLinkDomainSep) pinnedLinkDomainSep.style.display = 'none';
            }
          }

          // If fromName is still missing, asynchronously fetch profile and populate
          if (!fromName && authorId) {
            getProfileCached(authorId).then(prof => {
              if (prof && prof.name && pinnedLinkFrom && pinnedLinkBar && pinnedLinkBar.style.display !== 'none') {
                if (activeLink) {
                  activeLink.from_name = prof.name;
                  if (prof.photo_url) activeLink.from_photo_url = prof.photo_url;
                }
                const displayName = prof.name.toLowerCase().startsWith('added by') || prof.name.toLowerCase().startsWith('pinned by')
                  ? prof.name
                  : `Added by ${prof.name}`;
                const avHtml = prof.photo_url ? `<img src="${prof.photo_url}" class="pinned-link-from-avatar" alt="${escapeHtml(prof.name)}" onerror="this.style.display='none';">` : '';
                pinnedLinkFrom.style.display = 'inline-flex';
                pinnedLinkFrom.innerHTML = `📌 ${avHtml}<span>${escapeHtml(displayName)}</span>`;
                if (pinnedLinkDomainSep && domainStr) pinnedLinkDomainSep.style.display = 'inline';
                const newSig = `${linkId}_${targetUrl}_${prof.name}_${prof.photo_url || ''}_${isListeningMode}`;
                pinnedLinkBar.setAttribute('data-link-sig', newSig);
              }
            }).catch(() => {});
          }

          if (btnEditLink) {
            btnEditLink.style.display = isListeningMode ? 'none' : 'inline-flex';
            btnEditLink.setAttribute('data-link-id', linkIdVal);
            btnEditLink.setAttribute('data-link-url', activeLink.display_link || activeLink.link || targetUrl);
          }
          if (btnRemoveLink) {
            btnRemoveLink.style.display = isListeningMode ? 'none' : 'inline-flex';
            btnRemoveLink.setAttribute('data-link-id', linkIdVal);
          }
          if (btnAddLink) btnAddLink.style.display = 'none';
        } else {
          // In listening mode: if no link is pinned, do NOT show the pin link button or container
          if (isListeningMode) {
            pinnedLinkBar.style.display = 'none';
            if (pinnedLinkContent) pinnedLinkContent.style.display = 'none';
            if (btnEditLink) btnEditLink.style.display = 'none';
            if (btnRemoveLink) btnRemoveLink.style.display = 'none';
            if (btnAddLink) btnAddLink.style.display = 'none';
          } else {
            pinnedLinkBar.classList.add('no-link');
            pinnedLinkBar.style.display = 'inline-flex';
            if (pinnedLinkContent) pinnedLinkContent.style.display = 'none';
            if (btnEditLink) btnEditLink.style.display = 'none';
            if (btnRemoveLink) btnRemoveLink.style.display = 'none';
            if (btnAddLink) btnAddLink.style.display = 'inline-flex';
          }
        }
      }
    }

    // Show house pill only if room belongs to a real house
    if (housePill && houseName) {
      if (room.club && room.club.trim().length > 0) {
        housePill.style.display = 'inline-flex';
        houseName.textContent = room.club;
        housePill.onclick = () => {
          if (room.socialClub) openClubModal(room.socialClub);
        };
      } else {
        housePill.style.display = 'none';
      }
    }

    const listeners = room.listeners || [];
    const listenersTotal = listeners.length > 0 ? listeners.length : (room.listenersCount || 0);

    const statsText = document.getElementById('channel-stats-text');
    if (statsText) {
      const cumulativeCount = room.cumulative_count || room.num_ever || room.num_all || (currentActiveRoom && currentActiveRoom.cumulative_count) || 0;
      const cumulativeHtml = cumulativeCount > 0
        ? `<span id="ch-cumulative-container">• 👥 <span id="val-cumulative-count">${Number(cumulativeCount).toLocaleString()}</span> total visitors</span>`
        : `<span id="ch-cumulative-container" style="display: none;">• 👥 <span id="val-cumulative-count">0</span> total visitors</span>`;
      const newStatsHtml = `🎙️ <span id="ch-speakers-count">${speakers.length}</span> in channel • 👥 <span id="ch-listeners-count">${listenersTotal}</span> listening ${cumulativeHtml}`;
      if (statsText.innerHTML !== newStatsHtml) {
        statsText.innerHTML = newStatsHtml;
      }
    }

    if (spkBadge && spkBadge.textContent !== String(speakers.length)) spkBadge.textContent = speakers.length;
    if (lisBadge && lisBadge.textContent !== String(listenersTotal)) lisBadge.textContent = listenersTotal;

    const tabSpkBadge = document.getElementById('ch-tab-speakers-badge');
    const tabLisBadge = document.getElementById('ch-tab-listeners-badge');
    if (tabSpkBadge && tabSpkBadge.textContent !== String(speakers.length)) tabSpkBadge.textContent = speakers.length;
    if (tabLisBadge && tabLisBadge.textContent !== String(listenersTotal)) tabLisBadge.textContent = listenersTotal;

    // Render speakers with green star ★ for moderators, yellow + for paid users, and Clubdeck inline actions
    if (speakersGrid) {
      const currentRole = isCurrentUserSpeaker ? 'speaker' : 'listener';
      const speakerSig = speakers.map(s => {
        const sUid = String(s.userId || s.user_id || s.id || '').trim();
        const sGif = userActiveGifMap.get(sUid)?.gifUrl || '';
        const sCall = Boolean(s.isOnCall || s.is_on_call || s.is_on_phone_call || s.phone_call_status || speakerCallStatusMap.get(sUid));
        return `${sUid}_${s.isModerator}_${s.name}_${s.photo || ''}_${s.channelEmoji || ''}_call:${sCall}_gif:${sGif}`;
      }).join('|') + `_role:${currentRole}_mod:${isCurrentUserModerator}`;
      const prevSpeakerSig = speakersGrid.getAttribute('data-speaker-sig');

      if (prevSpeakerSig === speakerSig) {
        // Membership, order, and profiles are unchanged!
        // Smoothly update mute and speaking states in-place without rebuilding DOM or reloading avatar images!
        speakers.forEach(s => {
          const sUid = String(s.userId || s.user_id || s.id || '').trim();
          const userIsMuted = isSpeakerMuted(sUid);
          updateSpeakerMuteVisuals(sUid, userIsMuted);
          updateUserSpeakingIndicator(sUid, s.speaking && !userIsMuted);
        });
      } else {
        speakersGrid.setAttribute('data-speaker-sig', speakerSig);
        speakersGrid.innerHTML = speakers.map(s => {
          const sUid = String(s.userId || s.user_id || s.id || '').trim();
          const isSelf = String(sUid) === String(myUserId);
          const userIsMuted = isSpeakerMuted(sUid);
          const isSpeaking = s.speaking && !userIsMuted;
          const isAnon = Boolean(s.is_anon || s.is_anonymous || s.name === 'anon');
          const displayName = s.name || s.first_name || (isAnon ? 'anon' : (s.handle || 'Speaker'));
          const initial = (displayName.charAt(0) || 'U').toUpperCase();

          const activeGif = userActiveGifMap.get(sUid);
          const isGifActive = Boolean(activeGif && Date.now() < activeGif.expiresAt && activeGif.gifUrl);
          const photoToUse = isGifActive ? activeGif.gifUrl : (s.photo || s.photo_url);
          const gifHaloHtml = isGifActive ? '<div class="gif-reaction-halo"></div>' : '';

          const origPhoto = escapeHtml(s.photo || s.photo_url || '');
          const avatarContent = photoToUse
            ? `<img src="${photoToUse}" class="speaker-tile-avatar" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;if('${origPhoto}'&&this.src!=='${origPhoto}'){this.src='${origPhoto}';}else{const d=document.createElement('div');d.className='speaker-tile-avatar avatar-fallback-circ';d.textContent='${initial}';this.replaceWith(d);}">`
            : `<div class="speaker-tile-avatar avatar-fallback-circ">${initial}</div>`;

          const modStarHtml = s.isModerator
            ? `<span class="mod-star" title="Moderator">★</span>`
            : '';

          const channelEmojiHtml = (s.channelEmoji || s.channel_emoji)
            ? `<span class="avatar-channel-emoji" title="Channel Emoji">${escapeHtml(s.channelEmoji || s.channel_emoji)}</span>`
            : '';

          const isOnCall = Boolean(
            s.isOnCall || s.is_on_call || s.is_on_phone_call || s.phone_call_status ||
            speakerCallStatusMap.get(String(sUid))
          );
          const phoneCallHtml = isOnCall
            ? '<div class="avatar-phone-call-badge" title="On a phone call">📞</div>'
            : '';

          const paidPlusHtml = (s.isPaidUser || s.is_paid_user)
            ? `<span class="badge-yellow-plus" title="Clubhouse Plus Member">+</span>`
            : '';

          const badgeText = s.isModerator ? '★ Moderator' : (s.badge || 'Speaker');

          let actionHtml = '';
          if (isSelf) {
            // MINE on stage: only "Move to audience" (mute and react buttons removed near profile as requested)
            actionHtml = `
              <div class="speaker-inline-actions self-actions">
                <button class="inline-act-btn act-move" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Move to audience">👥 Move to audience</button>
              </div>
            `;
          } else if (!isCurrentUserSpeaker) {
            // While in listening mode (user is audience member, not on stage): ONLY show react text for speaker users!
            actionHtml = `
              <div class="speaker-inline-actions other-actions">
                <button class="inline-act-btn act-react" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="React to this user">😊 React</button>
                <span class="inline-act-sep">•</span>
                <button class="inline-act-btn act-extra-react" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Extra Windows & iOS Emojis">✨ Extra React</button>
              </div>
            `;
          } else {
            // USER IS ON STAGE (Speaker / Moderator):
            const canMute = isCurrentUserModerator && !userIsMuted;
            actionHtml = `
              <div class="speaker-inline-actions other-actions">
                <button class="inline-act-btn act-mute" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Mute speaker" style="display: ${canMute ? 'inline-flex' : 'none'};">🔇 Mute</button>
                <span class="inline-act-sep act-mute-sep" style="display: none;">•</span>
                <button class="inline-act-btn act-move" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Move to audience">👥 Move to audience</button>
                ${!s.isModerator && isCurrentUserModerator ? `
                  <span class="inline-act-sep">•</span>
                  <button class="inline-act-btn act-mod" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Make moderator">⭐ Make moderator</button>
                  <span class="inline-act-sep">•</span>
                  <button class="inline-act-btn act-remove-from-room" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Remove user from room">🚫 Remove</button>
                ` : ''}
                <span class="inline-act-sep">•</span>
                <button class="inline-act-btn act-react" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="React to this user">😊 React</button>
                <span class="inline-act-sep">•</span>
                <button class="inline-act-btn act-extra-react" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Extra Windows & iOS Emojis">✨ Extra React</button>
              </div>
            `;
          }

          const isHandRaised = raisedHandUserIds.has(String(sUid));
          const handBadgeHtml = isHandRaised ? '<span class="hand-raised-badge" title="Raised Hand ✋">✋</span>' : '';

          return `
            <div class="speaker-tile ${s.isModerator ? 'is-mod' : ''} ${isSelf ? 'is-self' : ''}" data-user-id="${sUid}">
              <div class="speaker-avatar-wrap">
                ${avatarContent}
                ${gifHaloHtml}
                ${channelEmojiHtml}
                ${phoneCallHtml}
                ${handBadgeHtml}
                ${isSpeaking ? '<div class="speaking-halo"></div>' : ''}
                ${!userIsMuted ? '<div class="avatar-unmuted-badge" title="Microphone Active"><span class="avatar-unmuted-icon">🎙️</span></div>' : ''}
              </div>
              <div class="speaker-tile-name" title="${escapeHtml(displayName)}">
                ${modStarHtml}<span class="speaker-name-text">${escapeHtml(displayName)}</span>${paidPlusHtml}
              </div>
              <span class="speaker-tile-badge ${s.isModerator ? 'mod-badge' : ''}">${escapeHtml(badgeText)}</span>
              ${actionHtml}
            </div>
          `;
        }).join('');

        speakers.forEach(s => {
          const sUid = String(s.userId || s.user_id || s.id || '').trim();
          speakerMuteVisualCache.set(sUid, isSpeakerMuted(sUid));
        });

        attachSpeakerGridEvents(speakersGrid, myUserId);
      }
    }

    // Render listeners with inline target reaction button or invite speaker button
    if (listenersGrid) {
      if (listeners.length > 0) {
        const canInviteSpeaker = isCurrentUserSpeaker && isCurrentUserModerator;
        const totalLis = listeners.length;
        const MAX_INITIAL_LISTENERS = 120;
        const renderList = isShowingAllListeners ? listeners : listeners.slice(0, MAX_INITIAL_LISTENERS);
        const hasHiddenListeners = totalLis > MAX_INITIAL_LISTENERS && !isShowingAllListeners;

        const listenerSig = renderList.map(l => {
          const lUid = String(l.userId || l.user_id || l.id || '').trim();
          const isAnon = isAnonymousUser(l);
          const anonEmoji = getAnonymousUserEmoji(l);
          const lGif = userActiveGifMap.get(lUid)?.gifUrl || '';
          const lCall = Boolean(l.isOnCall || l.is_on_call || l.is_on_phone_call || l.phone_call_status || speakerCallStatusMap.get(lUid));
          return `${lUid}_${l.name}_${l.photo || ''}_${l.channelEmoji || ''}_hr:${raisedHandUserIds.has(lUid)}_anon:${isAnon}_${anonEmoji}_call:${lCall}_gif:${lGif}`;
        }).join('|') + `_canInvite:${canInviteSpeaker}_all:${isShowingAllListeners}`;
        const prevListenerSig = listenersGrid.getAttribute('data-listener-sig');

        if (prevListenerSig === listenerSig) {
          // Listeners unchanged! Do not touch DOM or reload avatar images!
        } else {
          listenersGrid.setAttribute('data-listener-sig', listenerSig);
          let lisHtml = renderList.map(l => {
            const lUid = String(l.userId || l.user_id || l.id || '').trim();
            const isSelf = String(lUid) === String(myUserId);
            const isAnon = isAnonymousUser(l);
            const anonEmoji = getAnonymousUserEmoji(l);
            const displayName = isAnon ? 'anon' : (l.name || l.first_name || l.handle || 'Listener');
            const initial = (displayName.charAt(0) || 'U').toUpperCase();

            const activeLisGif = userActiveGifMap.get(lUid);
            const isLisGifActive = Boolean(activeLisGif && Date.now() < activeLisGif.expiresAt && activeLisGif.gifUrl);
            const lisPhotoToUse = isLisGifActive ? activeLisGif.gifUrl : (l.photo || l.photo_url);
            const lisGifHaloHtml = isLisGifActive ? '<div class="gif-reaction-halo"></div>' : '';

            const origLisPhoto = escapeHtml(l.photo || l.photo_url || '');
            let avatarHtml = '';
            if (lisPhotoToUse) {
              avatarHtml = `<img src="${lisPhotoToUse}" class="listener-tile-avatar" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;if('${origLisPhoto}'&&this.src!=='${origLisPhoto}'){this.src='${origLisPhoto}';}else{const d=document.createElement('div');d.className='listener-tile-avatar avatar-fallback-circ';d.textContent='${initial}';this.replaceWith(d);}">`;
            } else if (isAnon) {
              avatarHtml = `<div class="listener-tile-avatar avatar-anon-circ" title="Anonymous Listener">${escapeHtml(anonEmoji)}</div>`;
            } else {
              avatarHtml = `<div class="listener-tile-avatar avatar-fallback-circ">${initial}</div>`;
            }

            const channelEmojiHtml = (!isAnon && (l.channelEmoji || l.channel_emoji))
              ? `<span class="avatar-channel-emoji" title="Channel Emoji">${escapeHtml(l.channelEmoji || l.channel_emoji)}</span>`
              : '';

            const isHandRaised = raisedHandUserIds.has(String(lUid));
            const handRaisedBadgeHtml = isHandRaised ? '<span class="hand-raised-badge" title="Raised Hand to Speak ✋">✋</span>' : '';

            const isLisOnCall = Boolean(
              l.isOnCall || l.is_on_call || l.is_on_phone_call || l.phone_call_status ||
              speakerCallStatusMap.get(String(lUid))
            );
            const lisPhoneCallHtml = isLisOnCall
              ? '<div class="avatar-phone-call-badge" title="On a phone call">📞</div>'
              : '';

            const paidPlusHtml = (!isAnon && (l.isPaidUser || l.is_paid_user))
              ? `<span class="badge-yellow-plus" title="Clubhouse Plus Member">+</span>`
              : '';

            const actionButtonHtml = (!isAnon && !isSelf && canInviteSpeaker) ? `
              <div class="listener-inline-actions">
                <button class="inline-act-btn act-invite-speaker" data-user-id="${lUid}" data-name="${escapeHtml(displayName)}" title="Invite ${escapeHtml(displayName)} to channel">🎙️ Invite</button>
              </div>
            ` : '';

            return `
              <div class="listener-tile ${isAnon ? 'is-anon' : ''} ${isSelf ? 'is-self' : ''}" data-user-id="${lUid}" data-is-anon="${isAnon ? 'true' : 'false'}" title="${isAnon ? 'Anonymous Listener' : escapeHtml(displayName)}">
                <div class="listener-avatar-wrap">
                  ${avatarHtml}
                  ${lisGifHaloHtml}
                  ${channelEmojiHtml}
                  ${lisPhoneCallHtml}
                  ${handRaisedBadgeHtml}
                </div>
                <div class="listener-tile-name" title="${isAnon ? 'Anonymous' : escapeHtml(displayName)}">
                  <span class="listener-name-text">${escapeHtml(displayName)}</span>${paidPlusHtml}
                </div>
                ${actionButtonHtml}
              </div>
            `;
          }).join('');

          if (hasHiddenListeners) {
            lisHtml += `
              <div class="listener-load-more-card" id="btn-show-all-listeners" style="grid-column: 1 / -1; text-align: center; padding: 12px; margin: 10px 0; background: rgba(255, 255, 255, 0.04); border: 1px dashed rgba(255, 255, 255, 0.18); border-radius: 8px; cursor: pointer; color: var(--text-secondary); font-size: 13px; font-weight: 500;">
                <span>+ Show all ${totalLis} listeners (${totalLis - MAX_INITIAL_LISTENERS} more)</span>
              </div>
            `;
          }

          listenersGrid.innerHTML = lisHtml;

          const btnMoreLis = listenersGrid.querySelector('#btn-show-all-listeners');
          if (btnMoreLis) {
            btnMoreLis.addEventListener('click', (e) => {
              e.stopPropagation();
              isShowingAllListeners = true;
              updateChannelPreview(currentActiveRoom);
            });
          }

          attachListenerGridEvents(listenersGrid);
        }
      } else {
        if (listenersGrid.getAttribute('data-listener-sig') !== 'empty') {
          listenersGrid.setAttribute('data-listener-sig', 'empty');
          listenersGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 14px; color: var(--text-muted); font-size: 12px;">
              ${listenersTotal > 0 ? `👥 ${listenersTotal} other listener(s) in channel` : 'No audience listeners currently in this channel.'}
            </div>
          `;
        }
      }
      updateDockHandraiseCount();
    }
  }

  function updateEndRoomButtonVisibility() {
    const isMod = Boolean(isCurrentUserModerator && currentActiveRoom);
    const btnEndView = document.getElementById('btn-end-channel-view');
    if (btnEndView) btnEndView.style.display = isMod ? 'inline-flex' : 'none';
    const btnStageEnd = document.getElementById('btn-stage-end-room');
    if (btnStageEnd) btnStageEnd.style.display = isMod ? 'inline-flex' : 'none';
    const btnFloatEnd = document.getElementById('btn-floating-end-room');
    if (btnFloatEnd) btnFloatEnd.style.display = isMod ? 'inline-flex' : 'none';
  }

  // Auto Mute feature removed
  function updateAutoMuteButtonVisibility() {}
  function updateAutoMuteStatsUI() {}
  async function handleAutoMuteTrigger() {}
  function openAutoMuteSettingsModal() {}

  // End Room for Everyone (Moderator only - calls Clubhouse API end_channel)
  async function endActiveChannel() {
    if (!currentActiveRoom || !currentActiveRoom.channel) {
      showAlert('warning', 'No active room to end.');
      return;
    }
    const channelId = currentActiveRoom.channel;
    const channelTitle = currentActiveRoom.title || channelId;

    if (!confirm(`Are you sure you want to end "${channelTitle}" for everyone?`)) {
      return;
    }

    try {
      showAlert('info', `Ending room "${channelTitle}"...`);
      let res = null;
      if (window.powerdeckAPI && window.powerdeckAPI.end_channel) {
        res = await window.powerdeckAPI.end_channel(channelId);
      } else if (window.powerdeckAPI && window.powerdeckAPI.endChannel) {
        res = await window.powerdeckAPI.endChannel(channelId);
      }
      console.log("[Clubhouse API] end_channel response:", res);
      if (res && res.success === false && res.error) {
        showAlert('warning', res.error);
      } else {
        showAlert('success', `Room "${channelTitle}" ended successfully.`);
      }
    } catch (err) {
      console.warn("end_channel error:", err);
      showAlert('error', `Failed to end room: ${err.message}`);
    } finally {
      await leaveActiveRoom();
    }
  }

  window.end_channel = endActiveChannel;

  let isLeavingActiveRoom = false;

  // Leave Room (Instant UI teardown, asynchronously calls leave_channel & Agora disconnect)
  async function leaveActiveRoom(reason = null) {
    if (!currentActiveRoom || isLeavingActiveRoom) return;
    isLeavingActiveRoom = true;
    try {
      const roomName = (currentActiveRoom && (currentActiveRoom.title || currentActiveRoom.channel)) || 'channel';
      const channelId = currentActiveRoom ? (currentActiveRoom.channel || currentActiveRoom.id) : null;

      // 1. Immediately detach active room and reset UI (instant leave quietly, zero wait)
      currentActiveRoom = null;

      stopChannelPolling();
      stopActivePing();
      closeRoomChat();
      isHandRaised = false;
      isCurrentUserSpeaker = false;
      isCurrentUserModerator = false;
      updateEndRoomButtonVisibility();
      updateHandUI();

      const btnAcceptSpeaker = document.getElementById('btn-dock-accept-speaker');
      if (btnAcceptSpeaker) btnAcceptSpeaker.style.display = 'none';
      const reactionsPopover = document.getElementById('channel-reactions-popover');
      if (reactionsPopover) reactionsPopover.style.display = 'none';
      closeModActionMenu();
      speakerCallStatusMap.clear();
      userActiveGifMap.clear();

      hasFetchedInitialChannelMessages = false;
      channelMessagesStore.clear();
      totalRoomMessagesCount = 0;
      updateChatCountPill(0);
      const chatMsgList = document.getElementById('chat-messages-list');
      if (chatMsgList) chatMsgList.innerHTML = '';
      if (activeRoomFloatingBar) activeRoomFloatingBar.style.display = 'none';
      if (modalStageViewer) modalStageViewer.style.display = 'none';

      renderRoomsFeed();
      renderChannelStandby();
      renderStageController(null);

      const doneMsg = reason || `Left "${roomName}" quietly`;
      setAppStatus(doneMsg);
      showAlert(reason ? 'warning' : 'info', doneMsg);

      // 2. Disconnect PubNub, Agora audio & call leave_channel asynchronously in background
      disconnectPubNub();
      disconnectAgoraAudio(true).catch(e => console.warn("disconnectAgoraAudio error:", e));
      try {
        localStorage.removeItem('powerdeck_active_channel');
      } catch (_) {}

      if (channelId) {
        window.powerdeckAPI.leaveChannel(channelId).then(res => {
          console.log("leaveChannel response:", res);
        }).catch(e => {
          console.warn("leaveChannel API call:", e);
        });
      }
    } finally {
      isLeavingActiveRoom = false;
    }
  }

  window.leaveActiveRoom = leaveActiveRoom;

  // Render Standby state for the full-height channel box
  function renderChannelStandby() {
    isShowingAllListeners = false;
    unmutedSpeakerUids.clear();
    agoraMutedUids.clear();
    speakingStateCache.clear();
    speakerMuteVisualCache.clear();
    hasFetchedInitialChannelMessages = false;
    channelMessagesStore.clear();
    chatNextCursor = null;
    isLoadingOlderChatMessages = false;
    const chatMsgList = document.getElementById('chat-messages-list');
    if (chatMsgList) chatMsgList.innerHTML = '';
    if (channelPreviewUpdateTimer) {
      clearTimeout(channelPreviewUpdateTimer);
      channelPreviewUpdateTimer = null;
    }

    const splitContainer = document.getElementById('hallway-split-container');
    const channelViewport = document.getElementById('hallway-channel-viewport');
    if (splitContainer) {
      splitContainer.classList.add('no-active-room');
      splitContainer.classList.remove('has-active-room');
    }
    if (channelViewport) {
      channelViewport.style.display = 'none';
    }
    const startRoomBar = document.getElementById('start-room-bar-row');
    if (startRoomBar) startRoomBar.style.display = 'flex';
    updateTopAnonButtonVisibility();

    const liveTitle = document.getElementById('channel-live-title');
    const viewId = document.getElementById('channel-view-id');
    const housePill = document.getElementById('channel-house-pill');
    const spkBadge = document.getElementById('ch-speakers-badge');
    const lisBadge = document.getElementById('ch-listeners-badge');
    const speakersGrid = document.getElementById('channel-speakers-grid');
    const listenersGrid = document.getElementById('channel-listeners-grid');
    const statusDot = document.getElementById('channel-status-dot');
    const statusBadge = document.getElementById('channel-status-badge');
    const btnLeave = document.getElementById('btn-leave-channel-view');
    const statsText = document.getElementById('channel-stats-text');
    const pinnedLinkBar = document.getElementById('channel-pinned-link-bar');

    if (speakersGrid) speakersGrid.removeAttribute('data-speaker-sig');
    if (listenersGrid) listenersGrid.removeAttribute('data-listener-sig');
    if (pinnedLinkBar) pinnedLinkBar.removeAttribute('data-link-sig');

    if (statusDot) statusDot.textContent = '⚪';
    if (statusBadge) {
      statusBadge.textContent = 'STANDBY';
      statusBadge.style.color = 'var(--text-muted)';
    }
    if (viewId) viewId.textContent = '-------';
    if (btnLeave) btnLeave.style.display = 'none';
    updateEndRoomButtonVisibility();

    if (liveTitle) liveTitle.textContent = 'Select a Channel';
    const btnEditTitle = document.getElementById('btn-edit-channel-title');
    if (btnEditTitle) btnEditTitle.style.display = 'none';
    const chatToggle = document.getElementById('chat-tick-toggle');
    if (chatToggle) chatToggle.style.display = 'none';
    const btnTopRoomChat = document.getElementById('btn-top-room-chat');
    if (btnTopRoomChat) btnTopRoomChat.style.display = 'none';
    const btnCopyStageLink = document.getElementById('btn-copy-stage-link');
    if (btnCopyStageLink) btnCopyStageLink.style.display = 'none';
    const btnShareStageLink = document.getElementById('btn-share-stage-link');
    if (btnShareStageLink) btnShareStageLink.style.display = 'none';
    const btnPingStage = document.getElementById('btn-ping-stage');
    if (btnPingStage) btnPingStage.style.display = 'none';
    updateDisableReplayButtonsVisibility(false, false);
    if (pinnedLinkBar) {
      pinnedLinkBar.style.display = 'none';
      pinnedLinkBar.classList.remove('no-link');
      const pinnedLinkThumb = document.getElementById('pinned-link-thumb');
      if (pinnedLinkThumb) {
        pinnedLinkThumb.src = '';
        pinnedLinkThumb.style.display = 'none';
      }
    }
    if (housePill) housePill.style.display = 'none';
    if (statsText) statsText.textContent = 'Pick any live channel from the left feed or search above to join audio.';

    if (spkBadge) spkBadge.textContent = '0';
    if (lisBadge) lisBadge.textContent = '0';

    const tabSpkBadge = document.getElementById('ch-tab-speakers-badge');
    const tabLisBadge = document.getElementById('ch-tab-listeners-badge');
    if (tabSpkBadge) tabSpkBadge.textContent = '0';
    if (tabLisBadge) tabLisBadge.textContent = '0';

    if (speakersGrid) {
      speakersGrid.innerHTML = `
        <div class="channel-standby-placeholder" style="grid-column: 1 / -1;">
          <div class="standby-icon">🎧</div>
          <div class="standby-title">No Channel Active</div>
          <div class="standby-desc">Tap <strong>⚡ Join</strong> on any channel on the left to connect and listen with Agora audio.</div>
        </div>
      `;
    }

    if (listenersGrid) {
      listenersGrid.innerHTML = '';
    }
  }

  // Swipable Stage Tabs & Slide Controller
  function initChannelSwipeTabs() {
    const tabSpeakers = document.getElementById('tab-btn-speakers');
    const tabListeners = document.getElementById('tab-btn-listeners');
    const tabAll = document.getElementById('tab-btn-all');
    const track = document.getElementById('channel-swipe-track');
    const slideSpeakers = document.getElementById('slide-speakers');
    const slideListeners = document.getElementById('slide-listeners');

    if (!track) return;

    function setTab(tabName) {
      if (tabSpeakers) tabSpeakers.classList.toggle('active', tabName === 'speakers');
      if (tabListeners) tabListeners.classList.toggle('active', tabName === 'listeners');
      if (tabAll) tabAll.classList.toggle('active', tabName === 'all');

      if (tabName === 'all') {
        track.classList.add('show-all');
      } else {
        track.classList.remove('show-all');
        if (tabName === 'speakers') {
          track.scrollTo({ left: 0, behavior: 'smooth' });
        } else if (tabName === 'listeners' && slideListeners) {
          track.scrollTo({ left: slideListeners.offsetLeft, behavior: 'smooth' });
        }
      }
    }

    if (tabSpeakers) tabSpeakers.addEventListener('click', () => setTab('speakers'));
    if (tabListeners) tabListeners.addEventListener('click', () => setTab('listeners'));
    if (tabAll) tabAll.addEventListener('click', () => setTab('all'));

    // Sync tab indicator on horizontal swipe/scroll
    track.addEventListener('scroll', () => {
      if (track.classList.contains('show-all')) return;
      const scrollLeft = track.scrollLeft;
      const width = track.clientWidth;
      if (scrollLeft > width * 0.4) {
        if (tabListeners && !tabListeners.classList.contains('active')) {
          if (tabSpeakers) tabSpeakers.classList.remove('active');
          tabListeners.classList.add('active');
          if (tabAll) tabAll.classList.remove('active');
        }
      } else {
        if (tabSpeakers && !tabSpeakers.classList.contains('active')) {
          tabSpeakers.classList.add('active');
          if (tabListeners) tabListeners.classList.remove('active');
          if (tabAll) tabAll.classList.remove('active');
        }
      }
    }, { passive: true });

    // Drag-to-swipe mouse support
    let isDown = false;
    let startX = 0;
    let scrollLeftStart = 0;

    track.addEventListener('mousedown', (e) => {
      if (track.classList.contains('show-all')) return;
      if (e.target.closest('button') || e.target.closest('.speaker-tile') || e.target.closest('.listener-tile')) return;
      isDown = true;
      startX = e.pageX - track.offsetLeft;
      scrollLeftStart = track.scrollLeft;
    });

    track.addEventListener('mouseleave', () => { isDown = false; });
    track.addEventListener('mouseup', () => { isDown = false; });

    track.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - track.offsetLeft;
      const walk = (x - startX) * 1.5;
      track.scrollLeft = scrollLeftStart - walk;
    });
  }

  function renderStageController(room) {
    const stageTitle = document.getElementById('stage-room-title');
    const stageChannel = document.getElementById('stage-room-channel');
    const stageGrid = document.getElementById('stage-speakers-grid');
    const listenersGrid = document.getElementById('stage-listeners-grid');
    const stageStatus = document.getElementById('stage-status-badge');
    const speakersCount = document.getElementById('speakers-count-badge');
    const listenersCount = document.getElementById('listeners-count-badge');

    if (!room) {
      if (stageTitle) stageTitle.textContent = "Standby (No Room Selected)";
      if (stageChannel) stageChannel.textContent = "Select a room from the hallway or paste a link to connect";
      if (stageStatus) stageStatus.textContent = "⚪ STANDBY";
      if (speakersCount) speakersCount.textContent = "0";
      if (listenersCount) listenersCount.textContent = "0";
      if (stageGrid) {
        stageGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">
            🎧 Pick any live room on the left or paste a link to join the channel.
          </div>
        `;
      }
      if (listenersGrid) {
        listenersGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 18px; color: var(--text-muted); font-size: 12px;">
            No active listeners
          </div>
        `;
      }
      const btnModalCopy = document.getElementById('btn-stage-modal-copy-link');
      if (btnModalCopy) btnModalCopy.style.display = 'none';
      const btnModalShare = document.getElementById('btn-stage-modal-share-link');
      if (btnModalShare) btnModalShare.style.display = 'none';
      const btnModalPing = document.getElementById('btn-stage-modal-ping');
      if (btnModalPing) btnModalPing.style.display = 'none';
      return;
    }

    const btnModalCopy = document.getElementById('btn-stage-modal-copy-link');
    if (btnModalCopy) {
      btnModalCopy.style.display = 'inline-flex';
      btnModalCopy.onclick = (e) => {
        e.stopPropagation();
        copyStageRoomLink(room.channel || room.id, btnModalCopy);
      };
    }
    const btnModalShare = document.getElementById('btn-stage-modal-share-link');
    if (btnModalShare) {
      btnModalShare.style.display = 'inline-flex';
      btnModalShare.onclick = (e) => {
        e.stopPropagation();
        shareUnifiedRoomLink(room.channel || room.id, btnModalShare);
      };
    }
    const btnModalPing = document.getElementById('btn-stage-modal-ping');
    if (btnModalPing) {
      btnModalPing.style.display = 'inline-flex';
      btnModalPing.onclick = (e) => {
        e.stopPropagation();
        openPingModal();
      };
    }

    if (stageTitle) stageTitle.textContent = room.title;
    if (stageChannel) stageChannel.textContent = `Channel: ${room.channel}`;
    if (stageStatus) stageStatus.textContent = "🟢 AGORA VOICE CHANNEL";

    const speakers = room.speakers || [];
    const listeners = room.listeners || [];

    if (speakersCount) speakersCount.textContent = speakers.length;
    if (listenersCount) listenersCount.textContent = listeners.length > 0 ? listeners.length : (room.listenersCount || 0);

    // Render Speakers & Moderators Grid with Green Star Icon and inline actions
    if (stageGrid) {
      const myUserId = String(getLoggedInUserId() || (activeProfile && (activeProfile.userId || (activeProfile.user && activeProfile.user.user_id))) || '').trim();

      stageGrid.innerHTML = speakers.map(s => {
        const sUid = String(s.userId || s.user_id || s.id || '').trim();
        const isSelf = String(sUid) === String(myUserId);
        const userIsMuted = isSpeakerMuted(sUid);
        const isSpeaking = s.speaking && !userIsMuted;
        const isAnon = Boolean(s.is_anon || s.is_anonymous || s.name === 'anon');
        const displayName = s.name || s.first_name || (isAnon ? 'anon' : (s.handle || 'Speaker'));
        const initial = (displayName.charAt(0) || 'U').toUpperCase();

        const activeGif = userActiveGifMap.get(sUid);
        const isGifActive = Boolean(activeGif && Date.now() < activeGif.expiresAt && activeGif.gifUrl);
        const photoToUse = isGifActive ? activeGif.gifUrl : (s.photo || s.photo_url);
        const gifHaloHtml = isGifActive ? '<div class="gif-reaction-halo"></div>' : '';

        const origPhoto = escapeHtml(s.photo || s.photo_url || '');
        const avatarContent = photoToUse
          ? `<img src="${photoToUse}" class="speaker-tile-avatar" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;if('${origPhoto}'&&this.src!=='${origPhoto}'){this.src='${origPhoto}';}else{const d=document.createElement('div');d.className='speaker-tile-avatar avatar-fallback-circ';d.textContent='${initial}';this.replaceWith(d);}">`
          : `<div class="speaker-tile-avatar avatar-fallback-circ">${initial}</div>`;

        // Green star icon for moderators
        const modStarHtml = s.isModerator
          ? `<span class="mod-star" title="Moderator">★</span>`
          : '';

        const channelEmojiHtml = (s.channelEmoji || s.channel_emoji)
          ? `<span class="avatar-channel-emoji" title="Channel Emoji">${escapeHtml(s.channelEmoji || s.channel_emoji)}</span>`
          : '';

        const paidPlusHtml = (s.isPaidUser || s.is_paid_user)
          ? `<span class="badge-yellow-plus" title="Clubhouse Plus Member">+</span>`
          : '';

        const badgeText = s.isModerator ? '★ Moderator' : (s.badge || 'Speaker');

        let actionHtml = '';
        if (isSelf) {
          actionHtml = `
            <div class="speaker-inline-actions self-actions">
              <button class="inline-act-btn act-move" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Move to audience">👥 Move to audience</button>
            </div>
          `;
        } else if (!isCurrentUserSpeaker) {
          actionHtml = `
            <div class="speaker-inline-actions other-actions">
              <button class="inline-act-btn act-react" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="React to this user">😊 React</button>
              <span class="inline-act-sep">•</span>
              <button class="inline-act-btn act-extra-react" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Extra Windows & iOS Emojis">✨ Extra React</button>
            </div>
          `;
        } else {
          const canMute = isCurrentUserModerator && !userIsMuted;
          actionHtml = `
            <div class="speaker-inline-actions other-actions">
              <button class="inline-act-btn act-mute" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Mute speaker" style="display: ${canMute ? 'inline-flex' : 'none'};">🔇 Mute</button>
              <span class="inline-act-sep act-mute-sep" style="display: none;">•</span>
              <button class="inline-act-btn act-move" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Move to audience">👥 Move to audience</button>
              ${!s.isModerator && isCurrentUserModerator ? `
                <span class="inline-act-sep">•</span>
                <button class="inline-act-btn act-remove-from-room" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Remove user from room">🚫 Remove</button>
              ` : ''}
              <span class="inline-act-sep">•</span>
              <button class="inline-act-btn act-react" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="React to this user">😊 React</button>
              <span class="inline-act-sep">•</span>
              <button class="inline-act-btn act-extra-react" data-user-id="${sUid}" data-name="${escapeHtml(displayName)}" title="Extra Windows & iOS Emojis">✨ Extra React</button>
            </div>
          `;
        }

        const isOnCall = Boolean(s.isOnCall || s.is_on_call || s.is_on_phone_call || s.phone_call_status || speakerCallStatusMap.get(String(sUid)));
        const phoneCallHtml = isOnCall
          ? '<div class="avatar-phone-call-badge" title="On a phone call">📞</div>'
          : '';

        return `
          <div class="speaker-tile ${s.isModerator ? 'is-mod' : ''} ${isSelf ? 'is-self' : ''}" data-user-id="${sUid}">
            <div class="speaker-avatar-wrap">
              ${avatarContent}
              ${gifHaloHtml}
              ${channelEmojiHtml}
              ${phoneCallHtml}
              ${isSpeaking ? '<div class="speaking-halo"></div>' : ''}
              ${!userIsMuted ? '<div class="avatar-unmuted-badge" title="Microphone Active"><span class="avatar-unmuted-icon">🎙️</span></div>' : ''}
            </div>
            <div class="speaker-tile-name" title="${escapeHtml(displayName)}">
              ${modStarHtml}<span class="speaker-name-text">${escapeHtml(displayName)}</span>${paidPlusHtml}
            </div>
            <span class="speaker-tile-badge ${s.isModerator ? 'mod-badge' : ''}">${badgeText}</span>
            ${actionHtml}
          </div>
        `;
      }).join('');

      speakers.forEach(s => {
        const sUid = String(s.userId || s.user_id || s.id || '').trim();
        speakerMuteVisualCache.set(sUid, isSpeakerMuted(sUid));
      });

      stageGrid.querySelectorAll('.speaker-tile').forEach(tile => {
        tile.addEventListener('click', (e) => {
          if (e.target.closest('.speaker-inline-actions') || e.target.closest('.target-react-palette')) {
            return;
          }
          const uId = tile.getAttribute('data-user-id');
          const myId = getLoggedInUserId();
          const isSelf = tile.classList.contains('is-self') ||
                         (myId && String(uId) === String(myId)) ||
                         (myUserId && String(uId) === String(myUserId));
          if (isSelf) {
            openProfileStudioModal();
            return;
          }
          if (uId && uId !== '1') {
            openUserProfileModal(uId, 'stage_controller', null, true);
          }
        });
      });

      stageGrid.querySelectorAll('.act-self-mute').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await toggleMicMuted();
        });
      });

      stageGrid.querySelectorAll('.act-mute').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uId = btn.getAttribute('data-user-id');
          const uName = btn.getAttribute('data-name');
          if (String(uId) === String(myUserId)) {
            await toggleMicMuted();
          } else {
            unmutedSpeakerUids.delete(String(uId));
            agoraMutedUids.add(String(uId));
            updateSpeakerMuteVisuals(uId, true, true);
            updateUserSpeakingIndicator(uId, false);
            try {
              const res = await window.powerdeckAPI.muteSpeaker(currentActiveRoom.channel, uId);
              if (res && res.success !== false) {
                showAlert('success', `Muted ${uName}`);
                await refreshActiveChannelState();
              }
            } catch (err) {
              showAlert('error', err.message);
            }
          }
        });
      });

      stageGrid.querySelectorAll('.act-move').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uId = btn.getAttribute('data-user-id');
          const uName = btn.getAttribute('data-name');
          const isMe = String(uId) === String(myUserId);
          try {
            const res = await window.powerdeckAPI.uninviteSpeaker(currentActiveRoom.channel, uId);
            if (res && res.success !== false) {
              showAlert('success', isMe ? 'Moved yourself to audience' : `Moved ${uName} to audience`);
              if (isMe) {
                await demoteToAudienceInAgora();
                isCurrentUserSpeaker = false;
                updateHandUI();
              }
              await refreshActiveChannelState();
            }
          } catch (err) {
            showAlert('error', err.message);
          }
        });
      });

      stageGrid.querySelectorAll('.act-react').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const uId = btn.getAttribute('data-user-id');
          showTargetReactionPalette(btn, uId);
        });
      });

      stageGrid.querySelectorAll('.act-extra-react').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const uId = btn.getAttribute('data-user-id');
          const uName = btn.getAttribute('data-name') || 'Speaker';
          showExtraReactionPalette(btn, uId, uName);
        });
      });

      stageGrid.querySelectorAll('.act-remove-from-room').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uId = btn.getAttribute('data-user-id');
          const uName = btn.getAttribute('data-name') || 'speaker';
          if (!uId || !currentActiveRoom || !currentActiveRoom.channel) return;
          if (!confirm(`Are you sure you want to remove ${uName} from this room?`)) return;

          btn.disabled = true;
          try {
            const res = await window.powerdeckAPI.blockFromChannel(currentActiveRoom.channel, Number(uId));
            if (res && res.success !== false) {
              showAlert('success', `Removed ${uName} from room`);
              await refreshActiveChannelState();
            } else {
              showAlert('warning', (res && res.error) || `Failed to remove ${uName} from room`);
            }
          } catch (err) {
            showAlert('error', err.message);
          } finally {
            btn.disabled = false;
          }
        });
      });
    }

    // Render Listeners Grid ("Others in the room")
    if (listenersGrid) {
      if (listeners.length > 0) {
        listenersGrid.innerHTML = listeners.map(l => {
          const lUid = String(l.userId || l.user_id || l.id || '').trim();
          const isAnon = isAnonymousUser(l);
          const anonEmoji = getAnonymousUserEmoji(l);
          const displayName = isAnon ? 'anon' : (l.name || l.first_name || l.handle || 'Listener');
          const initial = (displayName.charAt(0) || 'U').toUpperCase();

          const activeLisGif = userActiveGifMap.get(lUid);
          const isLisGifActive = Boolean(activeLisGif && Date.now() < activeLisGif.expiresAt && activeLisGif.gifUrl);
          const lisPhotoToUse = isLisGifActive ? activeLisGif.gifUrl : (l.photo || l.photo_url);
          const lisGifHaloHtml = isLisGifActive ? '<div class="gif-reaction-halo"></div>' : '';

          const origLisPhoto = escapeHtml(l.photo || l.photo_url || '');
          let avatarHtml = '';
          if (lisPhotoToUse) {
            avatarHtml = `<img src="${lisPhotoToUse}" class="listener-tile-avatar" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;if('${origLisPhoto}'&&this.src!=='${origLisPhoto}'){this.src='${origLisPhoto}';}else{const d=document.createElement('div');d.className='listener-tile-avatar avatar-fallback-circ';d.textContent='${initial}';this.replaceWith(d);}">`;
          } else if (isAnon) {
            avatarHtml = `<div class="listener-tile-avatar avatar-anon-circ" title="Anonymous Listener">${escapeHtml(anonEmoji)}</div>`;
          } else {
            avatarHtml = `<div class="listener-tile-avatar avatar-fallback-circ">${initial}</div>`;
          }

          const paidPlusHtml = (!isAnon && (l.isPaidUser || l.is_paid_user))
            ? `<span class="badge-yellow-plus" title="Clubhouse Plus Member">+</span>`
            : '';

          const isLisOnCall = Boolean(
            l.isOnCall || l.is_on_call || l.is_on_phone_call || l.phone_call_status ||
            speakerCallStatusMap.get(String(lUid))
          );
          const lisPhoneCallHtml = isLisOnCall
            ? '<div class="avatar-phone-call-badge" title="On a phone call">📞</div>'
            : '';

          return `
            <div class="listener-tile ${isAnon ? 'is-anon' : ''}" data-user-id="${lUid}" data-is-anon="${isAnon ? 'true' : 'false'}" title="${isAnon ? 'Anonymous Listener' : `${escapeHtml(displayName)} (${escapeHtml(l.handle || '')})`}">
              <div class="listener-avatar-wrap">
                ${avatarHtml}
                ${lisGifHaloHtml}
                ${lisPhoneCallHtml}
              </div>
              <div class="listener-tile-name"><span class="listener-name-text">${escapeHtml(displayName)}</span>${paidPlusHtml}</div>
            </div>
          `;
        }).join('');
      } else {
        const lisCount = (room.listeners || []).length > 0 ? (room.listeners || []).length : (room.listenersCount || 0);
        listenersGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 14px; color: var(--text-muted); font-size: 12px;">
            ${lisCount > 0 ? `👥 ${lisCount} other listener(s) in channel` : 'No audience listeners currently in this channel.'}
          </div>
        `;
      }
    }
  }

  // ============================================================
  // STEP 3: SEARCH (HOUSES & PEOPLE), PROFILES & ACTIONS
  // ============================================================

  async function performSearch(query) {
    if (!query || query.trim().length < 2) {
      if (searchResultsOverlay) searchResultsOverlay.style.display = 'none';
      return;
    }

    const cleanQuery = query.trim();
    setAppStatus(`Searching for "${cleanQuery}"...`);

    if (searchResultsOverlay) searchResultsOverlay.style.display = 'flex';
    if (searchResultsBody) {
      searchResultsBody.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">
          ⏳ Searching Clubhouse houses & people...
        </div>
      `;
    }

    try {
      const res = await window.powerdeckAPI.search(cleanQuery);
      if (res && res.success && res.data && Array.isArray(res.data.items)) {
        currentSearchResults = res.data.items;
        updateSearchCounts();
        renderSearchResults();
        setAppStatus(`Found ${currentSearchResults.length} search results`);

        // Check if a live room was detected in search results
        const detectedChannelItem = currentSearchResults.find(i => !!i.channel);
        const detBanner = document.getElementById('detected-channel-banner');
        const detIdEl = document.getElementById('detected-channel-id');
        const detIcon = detBanner ? detBanner.querySelector('.det-icon') : null;
        const detLabel = detBanner ? detBanner.querySelector('.det-text') : null;
        const detActiveBadge = document.getElementById('det-active-badge');
        const btnQuickJoinDet = document.getElementById('btn-quick-join-detected');
        if (detectedChannelItem && detectedChannelItem.channel) {
          const ch = detectedChannelItem.channel;
          detectedDirectChannelId = ch.channel || ch.channel_id;
          if (detBanner && detIdEl) {
            detBanner.classList.add('is-active-room');
            if (detIcon) detIcon.textContent = '🔴';
            if (detLabel) detLabel.textContent = 'Live Room Detected:';
            detIdEl.textContent = ch.topic || ch.channel || String(ch.channel_id);
            if (detActiveBadge) detActiveBadge.style.display = 'inline-block';
            if (btnQuickJoinDet) btnQuickJoinDet.textContent = 'Join Channel';
            detBanner.style.display = 'flex';
          }
        }
      } else {
        currentSearchResults = [];
        updateSearchCounts();
        if (searchResultsBody) {
          searchResultsBody.innerHTML = `
            <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">
              🔍 No houses or members found matching "${escapeHtml(cleanQuery)}".
            </div>
          `;
        }
        setAppStatus(`No results found for "${cleanQuery}"`);
      }
    } catch (err) {
      console.error("Search error:", err);
      if (searchResultsBody) {
        searchResultsBody.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--error); font-size: 13px;">
            ⚠️ Search failed: ${escapeHtml(err.message)}
          </div>
        `;
      }
      setAppStatus(`Search error`);
    }
  }

  function updateSearchCounts() {
    const channels = currentSearchResults.filter(i => !!i.channel);
    const clubs = currentSearchResults.filter(i => !!i.social_club);
    const users = currentSearchResults.filter(i => !!i.user);
    if (countSearchAll) countSearchAll.textContent = currentSearchResults.length;
    if (countSearchRooms) countSearchRooms.textContent = channels.length;
    if (countSearchClubs) countSearchClubs.textContent = clubs.length;
    if (countSearchUsers) countSearchUsers.textContent = users.length;
  }

  function renderSearchResults() {
    if (!searchResultsBody) return;

    let items = currentSearchResults;
    if (activeSearchTab === 'rooms') {
      items = currentSearchResults.filter(i => !!i.channel);
    } else if (activeSearchTab === 'clubs') {
      items = currentSearchResults.filter(i => !!i.social_club);
    } else if (activeSearchTab === 'users') {
      // In People tab: If a live room was detected for this query, show it at the top!
      const roomItems = currentSearchResults.filter(i => !!i.channel);
      const userItems = currentSearchResults.filter(i => !!i.user);
      items = [...roomItems, ...userItems];
    } else {
      // In All tab: Channels (Live Rooms) at the top, then Users, then Clubs
      const roomItems = currentSearchResults.filter(i => !!i.channel);
      const userItems = currentSearchResults.filter(i => !!i.user);
      const clubItems = currentSearchResults.filter(i => !!i.social_club);
      const otherItems = currentSearchResults.filter(i => !i.channel && !i.user && !i.social_club);
      items = [...roomItems, ...userItems, ...clubItems, ...otherItems];
    }

    if (items.length === 0) {
      searchResultsBody.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12.5px;">
          No matching items in this tab.
        </div>
      `;
      return;
    }

    searchResultsBody.innerHTML = items.map((item, idx) => {
      if (item.channel) {
        const ch = item.channel;
        const topic = ch.topic || `Live Room: ${ch.channel || ch.channel_id || ''}`;
        const channelCode = ch.channel || '';
        const channelId = ch.channel_id || '';
        const numSpeakers = ch.num_speakers != null ? ch.num_speakers : (Array.isArray(ch.users) ? ch.users.filter(u => u.is_speaker).length : 0);
        const numAll = ch.num_all != null ? ch.num_all : (Array.isArray(ch.users) ? ch.users.length : numSpeakers);
        const isLocked = Boolean(ch.show_lock || ch.is_private);
        const users = Array.isArray(ch.users) ? ch.users : [];

        // Compact preview of speaker names and circular avatars
        const usersPreviewHtml = users.map(u => {
          const uInitial = (u.name || 'U').charAt(0).toUpperCase();
          const uPhoto = u.photo_url
            ? `<img src="${u.photo_url}" class="search-room-user-avatar clickable-profile-avatar" data-user-id="${u.user_id}" alt="${escapeHtml(u.name)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'search-room-user-avatar fallback clickable-profile-avatar\\' data-user-id=\\'${u.user_id}\\'>${uInitial}</div>';">`
            : `<div class="search-room-user-avatar fallback clickable-profile-avatar" data-user-id="${u.user_id}">${uInitial}</div>`;
          const modBadge = u.is_moderator ? `<span class="mod-star-badge" title="Moderator">✳️</span>` : '';
          return `
            <div class="search-room-user-chip clickable-speaker-chip" data-user-id="${u.user_id}" title="Click to view @${escapeHtml(u.username || u.name)}'s profile">
              ${uPhoto}
              <span class="search-room-user-name">${escapeHtml(u.name)} ${modBadge}</span>
            </div>
          `;
        }).join('');

        return `
          <div class="search-item-card search-item-channel-card" data-type="channel" data-index="${idx}" data-channel="${channelCode}" data-channel-id="${channelId}">
            <div class="search-item-left" style="flex: 1; min-width: 0;">
              <div class="search-item-info" style="width: 100%;">
                <div class="search-item-name-row" style="align-items: center; justify-content: space-between; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    <span class="search-live-pulse-dot" title="Live audio room"></span>
                    <span class="search-item-name search-item-topic" style="font-weight: 700; font-size: 13.5px;">${escapeHtml(topic)}</span>
                    ${isLocked ? `<span class="search-lock-icon" title="Private room" style="font-size: 11px;">🔒</span>` : ''}
                  </div>
                  <span class="search-item-type-badge badge-room">ROOM</span>
                </div>
                <div class="search-item-sub" style="margin-top: 3px; display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--text-muted);">
                  <span>🎙️ ${numSpeakers} speaker${numSpeakers === 1 ? '' : 's'}</span>
                  <span>•</span>
                  <span>👥 ${numAll} in room</span>
                  ${channelCode ? `<span>•</span><span>Code: <strong>${escapeHtml(channelCode)}</strong></span>` : ''}
                </div>
                ${users.length > 0 ? `
                  <div class="search-room-users-preview">
                    ${usersPreviewHtml}
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="search-item-action" style="margin-left: 10px; align-self: center;">
              <button class="btn btn-primary btn-xs btn-search-join-room" data-channel="${channelCode || channelId}" title="Join this live room">
                🎙️ Join
              </button>
            </div>
          </div>
        `;
      } else if (item.social_club) {
        const sc = item.social_club;
        const initial = (sc.name || 'H').charAt(0).toUpperCase();
        const photoHtml = sc.photo_url
          ? `<img src="${sc.photo_url}" class="search-item-photo" alt="${escapeHtml(sc.name)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'search-item-photo-fallback\\'>${initial}</div>';">`
          : `<div class="search-item-photo-fallback">${initial}</div>`;

        // Determine action button based on membership status
        // 3 -> Visit, 4 -> Leave, 5 -> Join
        let actionBtnHtml = '';
        const status = sc.social_club_membership_status;
        if (status === 3) {
          actionBtnHtml = `<button class="btn btn-secondary btn-xs btn-club-action" data-club-id="${sc.social_club_id}" data-action="visit">Visit</button>`;
        } else if (status === 4) {
          actionBtnHtml = `<button class="btn btn-danger btn-xs btn-club-action" data-club-id="${sc.social_club_id}" data-action="leave">Leave</button>`;
        } else {
          actionBtnHtml = `<button class="btn btn-primary btn-xs btn-club-action" data-club-id="${sc.social_club_id}" data-action="join">Join</button>`;
        }

        const subtitle = sc.subtitle || (sc.num_members ? `${Number(sc.num_members).toLocaleString()} Members` : 'Clubhouse House');

        return `
          <div class="search-item-card" data-type="club" data-index="${idx}" data-club-id="${sc.social_club_id}">
            <div class="search-item-left">
              ${photoHtml}
              <div class="search-item-info">
                <div class="search-item-name-row">
                  <span class="search-item-name">${escapeHtml(sc.name)}</span>
                  <span class="search-item-type-badge badge-house">HOUSE</span>
                </div>
                <div class="search-item-sub">👥 ${escapeHtml(subtitle)}</div>
              </div>
            </div>
            <div class="search-item-action">
              ${actionBtnHtml}
            </div>
          </div>
        `;
      } else if (item.user) {
        const u = item.user;
        const initial = (u.name || 'U').charAt(0).toUpperCase();
        const photoHtml = u.photo_url
          ? `<img src="${u.photo_url}" class="search-item-photo user-photo clickable-profile-avatar" data-user-id="${u.user_id}" alt="${escapeHtml(u.name)}" title="View ${escapeHtml(u.name)}'s profile" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'search-item-photo-fallback user-photo clickable-profile-avatar\\' data-user-id=\\'${u.user_id}\\'>${initial}</div>';">`
          : `<div class="search-item-photo-fallback user-photo clickable-profile-avatar" data-user-id="${u.user_id}" title="View ${escapeHtml(u.name)}'s profile">${initial}</div>`;

        const bioSnippet = u.bio ? `<div class="search-item-bio">${escapeHtml(u.bio.substring(0, 90))}</div>` : '';

        return `
          <div class="search-item-card" data-type="user" data-index="${idx}" data-user-id="${u.user_id}">
            <div class="search-item-left">
              ${photoHtml}
              <div class="search-item-info">
                <div class="search-item-name-row">
                  <span class="search-item-name">${escapeHtml(u.name)}</span>
                  <span class="search-item-type-badge badge-user">PERSON</span>
                </div>
                <div class="search-item-sub">@${escapeHtml(u.username || '')} • ID: ${u.user_id}</div>
                ${bioSnippet}
              </div>
            </div>
            <div class="search-item-action">
              ${(() => {
                const isFollowing = cachedFollowingUserIds.has(Number(u.user_id));
                const btnClass = isFollowing ? 'btn btn-outline-danger btn-xs btn-user-card-follow is-following' : 'btn btn-primary btn-xs btn-user-card-follow';
                const btnLabel = isFollowing ? '✕ Unfollow' : '+ Follow';
                return `<button class="${btnClass}" data-user-id="${u.user_id}">${btnLabel}</button>`;
              })()}
            </div>
          </div>
        `;
      }
      return '';
    }).join('');

    // Clicking speaker chips or avatars inside live room cards directly opens that member's profile popup on top
    searchResultsBody.querySelectorAll('.search-room-user-chip, .clickable-speaker-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = chip.getAttribute('data-user-id') || chip.closest('[data-user-id]')?.getAttribute('data-user-id');
        if (uid) {
          openUserProfileModal(uid, 'search', null, false);
        }
      });
    });

    // Clicking user avatars in search cards directly opens their profile popup on top
    searchResultsBody.querySelectorAll('.clickable-profile-avatar').forEach(avatar => {
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = avatar.getAttribute('data-user-id') || avatar.closest('[data-user-id]')?.getAttribute('data-user-id');
        if (uid) {
          openUserProfileModal(uid, 'search', null, false);
        }
      });
    });

    // Attach listeners to cards
    searchResultsBody.querySelectorAll('.search-item-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('.search-room-user-chip') || e.target.closest('.clickable-profile-avatar')) return;

        const idx = Number(card.getAttribute('data-index'));
        const item = items[idx];
        if (!item) return;

        if (item.channel) {
          openRoomDetailsModal(item.channel, item.logging_context);
        } else if (item.social_club) {
          openClubModal(item.social_club, item.logging_context);
        } else if (item.user) {
          openUserProfileModal(item.user.user_id, item.logging_context, null, false);
        }
      });
    });

    // Attach listeners to room join buttons in search cards
    searchResultsBody.querySelectorAll('.btn-search-join-room').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ch = btn.getAttribute('data-channel');
        if (ch) {
          if (searchResultsOverlay) searchResultsOverlay.style.display = 'none';
          await joinChannelById(ch);
        }
      });
    });

    // Attach listeners to club action buttons
    searchResultsBody.querySelectorAll('.btn-club-action').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const clubId = btn.getAttribute('data-club-id');
        const action = btn.getAttribute('data-action');
        await performClubAction(clubId, action, btn);
      });
    });

    // Attach listeners to user follow buttons on search cards
    searchResultsBody.querySelectorAll('.btn-user-card-follow').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uid = Number(btn.getAttribute('data-user-id'));
        btn.disabled = true;
        try {
          if (btn.classList.contains('is-following')) {
            await window.powerdeckAPI.unfollowUser(uid);
            btn.classList.remove('is-following', 'btn-outline-danger');
            btn.classList.add('btn-primary');
            btn.textContent = '+ Follow';
            if (uid) cachedFollowingUserIds.delete(Number(uid));
            setAppStatus(`Unfollowed user ID ${uid}`);
          } else {
            await window.powerdeckAPI.followUser(uid, null);
            btn.classList.add('is-following', 'btn-outline-danger');
            btn.classList.remove('btn-primary');
            btn.textContent = '✕ Unfollow';
            if (uid) cachedFollowingUserIds.add(Number(uid));
            setAppStatus(`Following user ID ${uid}`);
          }
        } catch (err) {
          showAlert('error', `Follow error: ${err.message}`);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // Format speaker joined time into 12-hour AM/PM format and calculate live duration on stage
  function formatJoinedSpeakerInfo(isoTimestamp) {
    if (!isoTimestamp) {
      return { timeAmPm: 'N/A', durationText: 'Active' };
    }
    try {
      const d = new Date(isoTimestamp);
      if (isNaN(d.getTime())) {
        return { timeAmPm: String(isoTimestamp), durationText: 'Active' };
      }

      // Format in 12-hour AM/PM format (e.g. "06:07:44 PM")
      const timeAmPm = d.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      // Duration: difference between current time and joined time
      const now = Date.now();
      const diffMs = Math.max(0, now - d.getTime());
      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      let durationText = '';
      if (hours > 0) {
        durationText = `${hours}h ${mins}m`;
      } else if (mins > 0) {
        durationText = `${mins}m ${secs}s`;
      } else {
        durationText = `${secs}s`;
      }

      return { timeAmPm, durationText };
    } catch (_) {
      return { timeAmPm: String(isoTimestamp), durationText: 'Active' };
    }
  }

  // Open Room Details Modal (Speakers, Moderator status, Joined AM/PM, Duration on stage, URL)
  function openRoomDetailsModal(channelData, loggingContext) {
    if (!channelData) return;
    activeViewingRoomChannel = channelData;

    const modal = document.getElementById('modal-room-details');
    const topicEl = document.getElementById('room-details-topic');
    const lockEl = document.getElementById('room-details-lock-status');
    const spkCountEl = document.getElementById('room-details-speakers-count');
    const lstCountEl = document.getElementById('room-details-listeners-count');
    const codeEl = document.getElementById('room-details-channel-code');
    const idEl = document.getElementById('room-details-channel-id');
    const usersListEl = document.getElementById('room-details-users-list');
    const urlInput = document.getElementById('room-details-url-input');
    const btnJoin = document.getElementById('btn-join-room-from-details');

    const topic = channelData.topic || `Live Room: ${channelData.channel || channelData.channel_id || ''}`;
    const channelCode = channelData.channel || '';
    const channelId = channelData.channel_id || '';
    const isLocked = Boolean(channelData.show_lock || channelData.is_private);
    const roomUrl = channelData.url || (channelCode ? `https://www.clubhouse.com/room/${channelCode}` : '');
    const users = Array.isArray(channelData.users) ? channelData.users : [];
    const numSpeakers = channelData.num_speakers != null ? channelData.num_speakers : users.filter(u => u.is_speaker).length;
    const numAll = channelData.num_all != null ? channelData.num_all : (users.length || numSpeakers);

    if (topicEl) topicEl.textContent = topic;
    if (lockEl) lockEl.textContent = isLocked ? '🔒 Private Room' : '🌐 Public Room';
    if (spkCountEl) spkCountEl.textContent = `🎙️ ${numSpeakers} Speaker${numSpeakers === 1 ? '' : 's'}`;
    if (lstCountEl) lstCountEl.textContent = `👥 ${numAll} in Room`;
    if (codeEl) codeEl.innerHTML = channelCode ? `Code: <strong>${escapeHtml(channelCode)}</strong>` : '';
    if (idEl) idEl.innerHTML = channelId ? `ID: <strong>${escapeHtml(String(channelId))}</strong>` : '';
    if (urlInput) urlInput.value = roomUrl;

    function renderRoomSpeakers() {
      if (!usersListEl) return;
      if (users.length === 0) {
        usersListEl.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">
            No speakers currently listed in channel for this room.
          </div>
        `;
        return;
      }

      usersListEl.innerHTML = users.map(u => {
        const initial = (u.name || 'U').charAt(0).toUpperCase();
        const photoHtml = u.photo_url
          ? `<img src="${u.photo_url}" class="room-speaker-avatar" alt="${escapeHtml(u.name)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'room-speaker-avatar-fallback\\'>${initial}</div>';">`
          : `<div class="room-speaker-avatar-fallback">${initial}</div>`;

        const { timeAmPm, durationText } = formatJoinedSpeakerInfo(u.time_joined_as_speaker);

        return `
          <div class="room-speaker-row" data-user-id="${u.user_id}">
            <div class="room-speaker-avatar-wrap clickable-user-profile" data-user-id="${u.user_id}" title="View @${escapeHtml(u.username || u.name)}'s profile">
              ${photoHtml}
            </div>
            <div class="room-speaker-info" style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span class="room-speaker-name clickable-user-profile" data-user-id="${u.user_id}" style="font-weight: 700; font-size: 13.5px; color: var(--text); cursor: pointer;" title="View profile">
                  ${escapeHtml(u.name)}
                </span>
                ${u.is_moderator ? '<span class="badge-mod-pill" style="font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.16); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">✳️ MOD</span>' : ''}
                ${u.is_speaker ? '<span style="font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: rgba(99, 102, 241, 0.16); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3);">🎙️ Speaker</span>' : ''}
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                <span>ID: <strong style="color: var(--text);">${u.user_id}</strong></span>
                <span>•</span>
                <span>🕒 Joined: <strong style="color: var(--text);">${timeAmPm}</strong></span>
                <span>•</span>
                <span style="color: #10b981;">⏱️ Duration: <strong>${durationText}</strong></span>
              </div>
            </div>
            <button class="btn btn-secondary btn-xs btn-inspect-speaker-profile" data-user-id="${u.user_id}" title="Open member profile">
              👤 Profile
            </button>
          </div>
        `;
      }).join('');

      // Wire profile clicks
      usersListEl.querySelectorAll('.clickable-user-profile, .btn-inspect-speaker-profile').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const uid = el.getAttribute('data-user-id');
          if (uid) {
            openUserProfileModal(uid, loggingContext);
          }
        });
      });
    }

    renderRoomSpeakers();

    // Start interval to keep live duration on stage updated every second while modal is open
    if (roomDetailsTimer) clearInterval(roomDetailsTimer);
    roomDetailsTimer = setInterval(() => {
      if (!modal || modal.style.display === 'none') {
        clearInterval(roomDetailsTimer);
        roomDetailsTimer = null;
        return;
      }
      renderRoomSpeakers();
    }, 1000);

    if (btnJoin) {
      btnJoin.onclick = () => {
        closeRoomDetailsModal();
        if (searchResultsOverlay) searchResultsOverlay.style.display = 'none';
        joinChannelById(channelCode || channelId);
      };
    }

    if (modal) {
      modal.style.display = 'flex';
      bringModalToFront(modal);
      modal.scrollTop = 0;
      modal.scrollTop = 0;
    }
  }

  function closeRoomDetailsModal() {
    const modal = document.getElementById('modal-room-details');
    if (modal) modal.style.display = 'none';
    if (roomDetailsTimer) {
      clearInterval(roomDetailsTimer);
      roomDetailsTimer = null;
    }
    activeViewingRoomChannel = null;
  }

  // Perform Join / Leave / Visit for a Social Club
  async function performClubAction(clubId, action, btnElement) {
    if (!clubId) return;

    if (action === 'visit') {
      setAppStatus(`Viewing house #${clubId}`);
      const item = currentSearchResults.find(i => i.social_club && String(i.social_club.social_club_id) === String(clubId));
      if (item && item.social_club) {
        openClubModal(item.social_club, item.logging_context);
      }
      return;
    }

    if (btnElement) {
      btnElement.disabled = true;
      btnElement.textContent = '...';
    }

    try {
      if (action === 'join') {
        const res = await window.powerdeckAPI.joinSocialClub(clubId);
        if (res && res.success) {
          showAlert('success', 'Joined house successfully!');
          setAppStatus(`Joined house #${clubId}`);
          viewingClubStatus = 4;
          if (btnElement) {
            btnElement.textContent = 'Leave House';
            btnElement.className = 'btn btn-danger btn-sm btn-club-action';
            btnElement.setAttribute('data-action', 'leave');
          }
        } else {
          showAlert('error', (res && res.error) || 'Failed to join house');
        }
      } else if (action === 'leave') {
        const res = await window.powerdeckAPI.leaveSocialClub(clubId);
        if (res && res.success) {
          showAlert('info', 'Left house.');
          setAppStatus(`Left house #${clubId}`);
          viewingClubStatus = 1;
          if (btnElement) {
            btnElement.textContent = 'Join House';
            btnElement.className = 'btn btn-primary btn-sm btn-club-action';
            btnElement.setAttribute('data-action', 'join');
          }
        } else {
          showAlert('error', (res && res.error) || 'Failed to leave house');
        }
      }
    } catch (err) {
      showAlert('error', `House action error: ${err.message}`);
    } finally {
      if (btnElement) btnElement.disabled = false;
    }
  }

  // Helper: Update Member Profile Block / Unblock Button State
  function updateProfileBlockButtonState(isBlocked) {
    const btnPmBlock = document.getElementById('btn-pm-block');
    if (!btnPmBlock) return;
    if (isBlocked) {
      btnPmBlock.innerHTML = '<span>🔓 Unblock</span>';
      btnPmBlock.title = 'Unblock this user';
      btnPmBlock.classList.remove('btn-outline-danger');
      btnPmBlock.classList.add('btn-unblock-state', 'btn-outline-warning');
    } else {
      btnPmBlock.innerHTML = '<span>🚫 Block</span>';
      btnPmBlock.title = 'Block this user';
      btnPmBlock.classList.remove('btn-unblock-state', 'btn-outline-warning');
      btnPmBlock.classList.add('btn-outline-danger');
    }
  }

  // Update Profile Modal Follow / Unfollow button UI
  function updateFollowButtonUI(isFollowing) {
    if (!btnPmFollow) return;
    if (isFollowing) {
      btnPmFollow.classList.add('is-following');
      btnPmFollow.classList.remove('btn-primary');
      if (pmFollowLabel) pmFollowLabel.textContent = '✕ Unfollow';
      btnPmFollow.setAttribute('title', 'Click to unfollow this user');
    } else {
      btnPmFollow.classList.remove('is-following');
      btnPmFollow.classList.add('btn-primary');
      if (pmFollowLabel) pmFollowLabel.textContent = '+ Follow';
      btnPmFollow.setAttribute('title', 'Click to follow this user');
    }
  }

  // Pre-fetch following users to populate following IDs cache
  async function preloadMyFollowingIds() {
    try {
      const myId = getLoggedInUserId();
      if (!myId || !window.powerdeckAPI || !window.powerdeckAPI.getUserSocialGraph) return;
      const res = await window.powerdeckAPI.getUserSocialGraph(myId, 'following', 100);
      if (res && res.success && res.data && Array.isArray(res.data.users)) {
        res.data.users.forEach(u => {
          const id = Number(u.user_profile_id || u.user_id);
          if (id) cachedFollowingUserIds.add(id);
        });
      }
    } catch (err) {
      console.warn("preloadMyFollowingIds error:", err);
    }
  }

  // Open Full Member Profile Modal
  async function openUserProfileModal(userId, loggingContext, targetUsername, isChannelContext = null) {
    if (!userId && !targetUsername) return;

    let uId = userId;
    let uName = targetUsername;
    if (typeof uId === 'string' && !/^\d+$/.test(uId.trim())) {
      uName = uId.replace(/^@/, '').trim();
      uId = null;
    }

    viewingProfileUserId = uId || '';
    viewingProfileLoggingContext = loggingContext;

    // Check if viewed user is the logged-in user -> redirect directly to Your Profile
    const myId = getLoggedInUserId();
    const myUser = getLoggedInUser();
    const myUsername = myUser && (myUser.username || (activeProfile && activeProfile.user && activeProfile.user.username));
    const isSelfInitial = ((myId != null && myId !== '') && uId && (String(uId) === String(myId))) ||
                          (uName && myUsername && (uName.toLowerCase().replace(/^@/, '') === myUsername.toLowerCase().replace(/^@/, '')));
    if (isSelfInitial) {
      openProfileStudioModal();
      return;
    }

    // Reset fields to loading state
    if (pmName) pmName.textContent = uName ? `Loading @${uName}...` : 'Loading profile...';
    if (pmPaidPlus) pmPaidPlus.style.display = 'none';
    if (pmKarmaBadge) pmKarmaBadge.style.display = 'none';
    if (pmUsername) pmUsername.textContent = uName ? `@${uName}` : '@...';
    if (pmUserId) pmUserId.textContent = uId ? `ID: ${uId}` : (uName ? `@${uName}` : 'ID: ...');
    if (pmFollowersCount) pmFollowersCount.textContent = '...';
    if (pmFollowingCount) pmFollowingCount.textContent = '...';
    if (pmFriendsCount) pmFriendsCount.textContent = '0';
    if (pmClubsCount) pmClubsCount.textContent = '0';
    if (pmBio) pmBio.textContent = 'Loading bio...';
    if (pmCreatedDate) pmCreatedDate.textContent = '...';
    if (pmAvatar) pmAvatar.style.display = 'none';
    if (pmAvatarFallback) {
      pmAvatarFallback.style.display = 'flex';
      pmAvatarFallback.textContent = uName ? uName.charAt(0).toUpperCase() : '👤';
    }

    const pmActionWrap = btnPmFollow ? btnPmFollow.closest('.profile-card-action-wrap') : null;
    const btnPmBlock = document.getElementById('btn-pm-block');
    const btnPmRemove = document.getElementById('btn-pm-remove-from-room');
    const btnPmReact = document.getElementById('btn-pm-react');
    if (btnPmRemove) btnPmRemove.style.display = 'none';
    if (btnPmReact) btnPmReact.style.display = 'none';
    const isInitialBlocked = uId ? cachedBlockedUserIds.has(Number(uId)) : false;
    if (btnPmBlock) {
      updateProfileBlockButtonState(isInitialBlocked);
    }
    if (btnPmFollow) {
      if (isSelfInitial) {
        btnPmFollow.style.display = 'none';
        if (btnPmBlock) btnPmBlock.style.display = 'none';
        if (pmActionWrap) pmActionWrap.style.display = 'none';
      } else {
        btnPmFollow.style.display = isInitialBlocked ? 'none' : 'inline-flex';
        if (btnPmBlock) btnPmBlock.style.display = 'inline-flex';
        if (pmActionWrap) pmActionWrap.style.display = '';
        btnPmFollow.disabled = true;
        const isFollowCached = Boolean(uId && cachedFollowingUserIds.has(Number(uId)));
        updateFollowButtonUI(isFollowCached);
      }
    }
    if (pmInviterRow) pmInviterRow.style.display = 'none';
    const pmInviterNoneReset = document.getElementById('pm-inviter-none');
    if (pmInviterNoneReset) pmInviterNoneReset.style.display = 'none';
    const pmRoomInviterBannerReset = document.getElementById('pm-room-inviter-banner');
    if (pmRoomInviterBannerReset) pmRoomInviterBannerReset.style.display = 'none';
    if (pmClubsSection) pmClubsSection.style.display = 'none';

    if (modalUserProfile) {
      modalUserProfile.style.display = 'flex';
      bringModalToFront(modalUserProfile);
      modalUserProfile.scrollTop = 0;
      const profileBody = modalUserProfile.querySelector('.profile-modal-body');
      if (profileBody) profileBody.scrollTop = 0;
    }
    setAppStatus(uName ? `Loading profile for @${uName}...` : `Loading profile for member...`);

    try {
      // Check if viewing profile while strictly inside an active stage / channel (and not in outside search)
      const isInChannel = Boolean(currentActiveRoom && (currentActiveRoom.channel || currentActiveRoom.id));
      let isChannelView = false;

      if (isInChannel) {
        if (isChannelContext === true) {
          isChannelView = true;
        } else if (isChannelContext === false) {
          isChannelView = false;
        } else {
          // Automatic inference: verify whether loggingContext indicates an outside search / modal
          const outsideContexts = ['search', 'hallway_search', 'global_search', 'blocked_users_modal', 'profile_viewers_modal', 'activity_notification', 'social_club_members', 'hallway'];
          const isOutside = typeof loggingContext === 'string' && outsideContexts.includes(loggingContext);
          isChannelView = !isOutside;
        }
      }

      let profileParam;
      if (isChannelView) {
        const activeChannel = (currentActiveRoom && (currentActiveRoom.channel || currentActiveRoom.id)) || '';

        // If username wasn't passed directly, look it up from active room users list if available
        if (!uName && currentActiveRoom) {
          const allRoomUsers = [
            ...(Array.isArray(currentActiveRoom.users) ? currentActiveRoom.users : []),
            ...(Array.isArray(currentActiveRoom.speakers) ? currentActiveRoom.speakers : []),
            ...(Array.isArray(currentActiveRoom.listeners) ? currentActiveRoom.listeners : [])
          ];
          const matchU = allRoomUsers.find(ru => String(ru.user_id || ru.userId) === String(uId));
          if (matchU && (matchU.username || matchU.handle)) {
            uName = String(matchU.username || matchU.handle).replace(/^@/, '').trim();
          }
        }

        // Check if social club id found on channel using get_channel or join_channel
        let activeSocialClubId = null;
        if (currentActiveRoom) {
          const sc = currentActiveRoom.socialClub || (currentActiveRoom.rawChannel && currentActiveRoom.rawChannel.social_club);
          if (sc && (sc.social_club_id || sc.id || sc.club_id)) {
            activeSocialClubId = sc.social_club_id || sc.id || sc.club_id;
          } else if (currentActiveRoom.social_club_id) {
            activeSocialClubId = currentActiveRoom.social_club_id;
          } else if (currentActiveRoom.rawChannel && (currentActiveRoom.rawChannel.social_club_id || currentActiveRoom.rawChannel.club_id)) {
            activeSocialClubId = currentActiveRoom.rawChannel.social_club_id || currentActiveRoom.rawChannel.club_id;
          }
        }

        // Case 1 & Case 2: In-stage profile payloads
        if (activeSocialClubId) {
          // If stage belongs to a social club
          profileParam = {
            channel: activeChannel,
            user_id: Number(uId),
            username: uName ? String(uName).replace(/^@/, '').trim() : '',
            social_club_id: activeSocialClubId,
            source: 5
          };
        } else {
          // If stage is a public room without social club
          profileParam = {
            channel: activeChannel,
            user_id: Number(uId),
            username: uName ? String(uName).replace(/^@/, '').trim() : '',
            source: 5
          };
        }
      } else {
        // Case 3: If not in stage (or outside search)
        profileParam = {
          user_id: (uId && !isNaN(Number(uId))) ? Number(uId) : undefined,
          username: uName ? String(uName).replace(/^@/, '').trim() : undefined,
          source: 14
        };
      }

      const res = await window.powerdeckAPI.getProfile(profileParam);
      if (res && res.success && res.data && res.data.user_profile) {
        const up = res.data.user_profile;
        viewingProfileUserId = up.user_id;
        currentViewingProfile = up;

        // Room Inviter (channel_invited_by_user_profile)
        const pmRoomInviterBanner = document.getElementById('pm-room-inviter-banner');
        const pmRoomInviterName = document.getElementById('pm-room-inviter-name');
        const pmRoomInviterHandle = document.getElementById('pm-room-inviter-handle');
        const pmRoomInviterAvatar = document.getElementById('pm-room-inviter-avatar');
        const pmRoomInviterFallback = document.getElementById('pm-room-inviter-fallback');
        const pmRoomInviterCard = document.getElementById('pm-room-inviter-card');

        const roomInviter = (res.data && res.data.channel_invited_by_user_profile) ||
                            (up && up.channel_invited_by_user_profile) ||
                            (res.channel_invited_by_user_profile);

        if (roomInviter && (roomInviter.name || roomInviter.user_id || roomInviter.username)) {
          if (pmRoomInviterName) pmRoomInviterName.textContent = roomInviter.name || 'Member';
          if (pmRoomInviterHandle) pmRoomInviterHandle.textContent = roomInviter.username ? `@${roomInviter.username}` : '';
          if (roomInviter.photo_url) {
            if (pmRoomInviterAvatar) {
              pmRoomInviterAvatar.src = roomInviter.photo_url;
              pmRoomInviterAvatar.style.display = 'block';
            }
            if (pmRoomInviterFallback) pmRoomInviterFallback.style.display = 'none';
          } else {
            if (pmRoomInviterAvatar) pmRoomInviterAvatar.style.display = 'none';
            if (pmRoomInviterFallback) {
              pmRoomInviterFallback.style.display = 'flex';
              pmRoomInviterFallback.textContent = (roomInviter.name || 'U').charAt(0).toUpperCase();
            }
          }
          if (pmRoomInviterCard) {
            pmRoomInviterCard.onclick = () => {
              if (roomInviter.user_id) {
                openUserProfileModal(roomInviter.user_id, null, roomInviter.username);
              }
            };
          }
          if (pmRoomInviterBanner) pmRoomInviterBanner.style.display = 'flex';
        } else {
          if (pmRoomInviterBanner) pmRoomInviterBanner.style.display = 'none';
        }

        const pmAvatarWrap = document.getElementById('pm-avatar-wrap');
        if (pmAvatarWrap) {
          pmAvatarWrap.onclick = () => {
            openPhotoLightbox(up.user_id, up.displayname || up.name, up.username, up.photo_url);
          };
        }

        if (pmName) pmName.textContent = up.displayname || up.name || 'Member';
        if (pmUsername) pmUsername.textContent = `@${up.username || ''}`;
        if (pmUserId) pmUserId.textContent = `ID: ${up.user_id}`;

        const isSelf = Boolean((myId && (String(uId) === String(myId) || String(up.user_id) === String(myId))) ||
                               (myUsername && up.username && up.username.toLowerCase() === myUsername.toLowerCase()));
        if (isSelf) {
          if (modalUserProfile) modalUserProfile.style.display = 'none';
          openProfileStudioModal();
          return;
        }

        // Clubhouse Plus Badge (➕)
        const isPaid = !!(
          up.is_paid_user === true ||
          up.is_paid === true ||
          up.is_subscribed === true ||
          up.is_plus === true ||
          up.has_plus === true ||
          up.is_paid_member === true ||
          up.plus_expiration_time ||
          up.subscription ||
          (isSelf && activeProfile && (activeProfile.is_paid_user || activeProfile.is_paid || (activeProfile.user && (activeProfile.user.is_paid_user || activeProfile.user.is_paid))))
        );
        if (pmPaidPlus) {
          pmPaidPlus.style.display = isPaid ? 'inline-flex' : 'none';
        }

        // Karma band badge (🏅)
        if (pmKarmaBadge) {
          if (up.karma_band && up.karma_band.display_text) {
            const hasMedal = up.karma_band.show_medal === true;
            pmKarmaBadge.textContent = hasMedal ? `🏅 ${up.karma_band.display_text}` : up.karma_band.display_text;
            pmKarmaBadge.style.display = 'inline-flex';
          } else {
            pmKarmaBadge.style.display = 'none';
          }
        }

        if (up.photo_url) {
          if (pmAvatar) {
            pmAvatar.src = up.photo_url;
            pmAvatar.style.display = 'block';
          }
          if (pmAvatarFallback) pmAvatarFallback.style.display = 'none';
        } else {
          if (pmAvatar) pmAvatar.style.display = 'none';
          if (pmAvatarFallback) {
            pmAvatarFallback.style.display = 'flex';
            pmAvatarFallback.textContent = (up.name || 'U').charAt(0).toUpperCase();
          }
        }

        // Stats
        if (pmFollowersCount) pmFollowersCount.textContent = Number(up.num_followers || 0).toLocaleString();
        if (pmFollowingCount) pmFollowingCount.textContent = Number(up.num_following || 0).toLocaleString();
        if (pmFriendsCount) pmFriendsCount.textContent = Number(up.mutual_follows_count || up.num_cofollows || 0).toLocaleString();
        if (pmClubsCount) pmClubsCount.textContent = Number(up.social_clubs_count || (up.clubs && up.clubs.length) || 0).toLocaleString();

        // Bio
        if (pmBio) {
          pmBio.textContent = up.bio || 'No bio provided.';
        }

        // Created Date
        if (pmCreatedDate) {
          if (up.time_created) {
            try {
              const d = new Date(up.time_created);
              pmCreatedDate.textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            } catch (_) {
              pmCreatedDate.textContent = up.time_created;
            }
          } else {
            pmCreatedDate.textContent = 'Active Member';
          }
        }

        // Nominated / Invited by
        const pmInviterNone = document.getElementById('pm-inviter-none');
        if (up.invited_by_user_profile) {
          const inv = up.invited_by_user_profile;
          if (pmInviterName) pmInviterName.textContent = inv.name || 'Member';
          if (pmInviterHandle) pmInviterHandle.textContent = inv.username ? `@${inv.username}` : '';
          if (inv.photo_url) {
            if (pmInviterAvatar) {
              pmInviterAvatar.src = inv.photo_url;
              pmInviterAvatar.style.display = 'block';
            }
            if (pmInviterFallback) pmInviterFallback.style.display = 'none';
          } else {
            if (pmInviterAvatar) pmInviterAvatar.style.display = 'none';
            if (pmInviterFallback) {
              pmInviterFallback.style.display = 'flex';
              pmInviterFallback.textContent = (inv.name || 'U').charAt(0).toUpperCase();
            }
          }
          if (pmInviterRow) {
            pmInviterRow.style.display = 'flex';
            pmInviterRow.style.cursor = 'pointer';
            pmInviterRow.onclick = () => {
              if (inv.user_id) openUserProfileModal(inv.user_id);
            };
          }
          if (pmInviterNone) pmInviterNone.style.display = 'none';
        } else {
          if (pmInviterRow) pmInviterRow.style.display = 'none';
          if (pmInviterNone) pmInviterNone.style.display = 'block';
        }

        // Render Followed Houses & Clubs List
        if (pmClubsSection && pmClubsList) {
          const clubs = (Array.isArray(up.social_clubs) && up.social_clubs.length > 0) ? up.social_clubs : (Array.isArray(up.clubs) ? up.clubs : []);
          if (pmClubsCount) pmClubsCount.textContent = clubs.length;
          if (clubs.length > 0) {
            pmClubsSection.style.display = 'block';
            pmClubsList.innerHTML = clubs.map(c => {
              const cId = c.social_club_id || c.club_id || c.id;
              const cName = c.name || 'House';
              const cPhoto = c.photo_url || '';
              const cMembers = c.num_members ? `${Number(c.num_members).toLocaleString()} members` : (c.subtitle || '');
              const initial = (cName || 'H').charAt(0).toUpperCase();

              const photoHtml = cPhoto
                ? `<img src="${cPhoto}" class="pm-club-avatar" alt="${escapeHtml(cName)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'pm-club-avatar fallback\\'>${initial}</div>';">`
                : `<div class="pm-club-avatar fallback">${initial}</div>`;

              return `
                <div class="pm-club-item" data-club-id="${cId}" title="Click to view house overview">
                  ${photoHtml}
                  <div class="pm-club-info">
                    <div class="pm-club-name">${escapeHtml(cName)}</div>
                    <div class="pm-club-members">${escapeHtml(cMembers)}</div>
                  </div>
                </div>
              `;
            }).join('');

            pmClubsList.querySelectorAll('.pm-club-item').forEach(item => {
              item.addEventListener('click', () => {
                const cId = item.getAttribute('data-club-id');
                if (cId) {
                  if (modalUserProfile) modalUserProfile.style.display = 'none';
                  openClubModal(cId);
                }
              });
            });
          } else {
            pmClubsSection.style.display = 'none';
          }
        }

        // Follow Status & Blocked Status: Hide completely if viewing own profile
        const followStatusRaw = String(up.follow_status || '').toLowerCase().trim();
        const isExplicitFollowing = (
          followStatusRaw === 'following' ||
          followStatusRaw === '2' ||
          up.follow_status === 2 ||
          up.viewer_follow_status === 'following' ||
          up.is_following === true
        );
        const numericProfileId = Number(up.user_id);

        if (isExplicitFollowing) {
          isViewingProfileFollowed = true;
          if (numericProfileId) cachedFollowingUserIds.add(numericProfileId);
        } else if (followStatusRaw === 'not_following') {
          isViewingProfileFollowed = false;
          if (numericProfileId) cachedFollowingUserIds.delete(numericProfileId);
        } else {
          isViewingProfileFollowed = Boolean(numericProfileId && cachedFollowingUserIds.has(numericProfileId));
        }

        const isUserBlocked = Boolean(up.is_blocked === true || cachedBlockedUserIds.has(Number(up.user_id)));
        if (isUserBlocked) {
          cachedBlockedUserIds.add(Number(up.user_id));
        }

        if (btnPmFollow) {
          if (isSelf) {
            btnPmFollow.style.display = 'none';
            if (btnPmBlock) btnPmBlock.style.display = 'none';
            if (btnPmRemove) btnPmRemove.style.display = 'none';
            if (pmActionWrap) pmActionWrap.style.display = 'none';
          } else {
            if (btnPmBlock) {
              btnPmBlock.style.display = 'inline-flex';
              updateProfileBlockButtonState(isUserBlocked);
            }
            if (btnPmRemove) {
              btnPmRemove.style.display = 'none';
            }
            if (btnPmReact) {
              btnPmReact.style.display = 'none';
            }
            if (isUserBlocked) {
              btnPmFollow.style.display = 'none';
            } else {
              btnPmFollow.style.display = 'inline-flex';
              btnPmFollow.disabled = false;
              updateFollowButtonUI(isViewingProfileFollowed);
            }
            if (pmActionWrap) pmActionWrap.style.display = '';
          }
        }

        setAppStatus(`Profile loaded for @${up.username || 'user'}`);
      } else {
        if (pmBio) pmBio.textContent = 'Could not load profile details: ' + (res.error || 'User not found');
        if (isSelfInitial && btnPmFollow) {
          btnPmFollow.style.display = 'none';
          if (pmActionWrap) pmActionWrap.style.display = 'none';
        }
      }
    } catch (err) {
      console.error("getProfile error:", err);
      if (pmBio) pmBio.textContent = 'Error loading profile: ' + err.message;
      if (isSelfInitial && btnPmFollow) {
        btnPmFollow.style.display = 'none';
        if (pmActionWrap) pmActionWrap.style.display = 'none';
      }
    }
  }

  // Toggle Follow / Unfollow for currently viewed user profile
  async function toggleFollowUser() {
    if (!viewingProfileUserId || !btnPmFollow) return;
    const myId = getLoggedInUserId();
    if (myId && String(viewingProfileUserId) === String(myId)) {
      btnPmFollow.style.display = 'none';
      return;
    }

    btnPmFollow.disabled = true;
    const originalText = pmFollowLabel ? pmFollowLabel.textContent : '';
    if (pmFollowLabel) pmFollowLabel.textContent = '...';

    const targetNumericId = Number(viewingProfileUserId);

    try {
      if (isViewingProfileFollowed) {
        // Unfollow
        const res = await window.powerdeckAPI.unfollowUser(viewingProfileUserId);
        if (res && res.success) {
          isViewingProfileFollowed = false;
          if (targetNumericId) cachedFollowingUserIds.delete(targetNumericId);
          updateFollowButtonUI(false);
          const curCount = parseInt((pmFollowersCount.textContent || '0').replace(/,/g, '')) || 0;
          if (curCount > 0) pmFollowersCount.textContent = (curCount - 1).toLocaleString();
          setAppStatus(`Unfollowed member`);
        } else {
          if (pmFollowLabel) pmFollowLabel.textContent = originalText;
          showAlert('error', (res && res.error) || 'Failed to unfollow user');
        }
      } else {
        // Follow
        const contextObj = (viewingProfileLoggingContext && typeof viewingProfileLoggingContext === 'object' && !Array.isArray(viewingProfileLoggingContext))
          ? viewingProfileLoggingContext
          : null;
        const res = await window.powerdeckAPI.followUser(viewingProfileUserId, contextObj);
        if (res && res.success) {
          isViewingProfileFollowed = true;
          if (targetNumericId) cachedFollowingUserIds.add(targetNumericId);
          updateFollowButtonUI(true);
          const curCount = parseInt((pmFollowersCount.textContent || '0').replace(/,/g, '')) || 0;
          pmFollowersCount.textContent = (curCount + 1).toLocaleString();
          setAppStatus(`Now following member!`);
        } else {
          if (pmFollowLabel) pmFollowLabel.textContent = originalText;
          showAlert('error', (res && res.error) || 'Failed to follow user');
        }
      }
    } catch (err) {
      if (pmFollowLabel) pmFollowLabel.textContent = originalText;
      showAlert('error', `Follow error: ${err.message}`);
    } finally {
      btnPmFollow.disabled = false;
    }
  }

  // ============================================================
  // CURRENT LOGGED IN USER HELPERS
  // ============================================================
  function getLoggedInUser() {
    if (!activeProfile) return {};
    const user = activeProfile.user || {};
    const debug = activeProfile._debug || {};
    return debug.user_profile || user;
  }

  function getLoggedInUserId() {
    const u = getLoggedInUser();
    let id = (u && u.user_id) || (activeProfile && (activeProfile.userId || activeProfile.user_id || (activeProfile.user && activeProfile.user.user_id))) || (currentActiveRoom && (currentActiveRoom.user_profile_id || (currentActiveRoom.rawChannel && currentActiveRoom.rawChannel.user_profile_id)));
    if (!id && homeUserId && homeUserId.textContent && homeUserId.textContent !== 'N/A' && homeUserId.textContent !== '000000') {
      id = homeUserId.textContent.trim();
    }
    return id ? String(id) : null;
  }

  function getLoggedInUsername() {
    const u = getLoggedInUser();
    let uname = (u && u.username) || (activeProfile && (activeProfile.username || (activeProfile.user && activeProfile.user.username) || (activeProfile.user_profile && activeProfile.user_profile.username)));
    if (!uname && homeUserHandle && homeUserHandle.textContent) {
      const handle = homeUserHandle.textContent.replace(/^@/, '').trim();
      if (handle && handle !== 'username') uname = handle;
    }
    if (!uname) {
      const uid = getLoggedInUserId();
      uname = uid ? `user_${uid}` : 'user';
    }
    return String(uname).trim();
  }

  // ============================================================
  // USER PROFILE PHOTO HISTORY LIGHTBOX & VIEWER
  // ============================================================
  let currentViewingProfile = null;
  let currentPlbPhotos = [];
  let currentPlbIndex = 0;

  const modalPhotoLightbox = document.getElementById('modal-photo-lightbox');
  const btnClosePhotoLightbox = document.getElementById('btn-close-photo-lightbox');
  const plbUserName = document.getElementById('plb-user-name');
  const plbUserHandle = document.getElementById('plb-user-handle');
  const plbLoading = document.getElementById('plb-loading');
  const plbLocked = document.getElementById('plb-locked');
  const plbLockedDesc = document.getElementById('plb-locked-desc');
  const plbImageContainer = document.getElementById('plb-image-container');
  const plbMainImg = document.getElementById('plb-main-img');
  const btnPlbPrev = document.getElementById('btn-plb-prev');
  const btnPlbNext = document.getElementById('btn-plb-next');
  const plbFooter = document.getElementById('plb-footer');
  const plbCounter = document.getElementById('plb-counter');
  const btnPlbCopyUrl = document.getElementById('btn-plb-copy-url');
  const btnPlbDownloadPhoto = document.getElementById('btn-plb-download-photo');
  const btnPlbSetAvatar = document.getElementById('btn-plb-set-avatar');
  const btnPlbDelete = document.getElementById('btn-plb-delete');
  const plbThumbsRow = document.getElementById('plb-thumbs-row');
  const plbUploadSlide = document.getElementById('plb-upload-slide');
  const btnPlbLaunchCrop = document.getElementById('btn-plb-launch-crop');

  let currentPlbIsSelf = false;
  let currentPlbUserId = null;

  async function openPhotoLightbox(userId, displayName, handle, fallbackPhotoUrl) {
    if (!modalPhotoLightbox) return;

    modalPhotoLightbox.style.display = 'flex';
    bringModalToFront(modalPhotoLightbox);
    modalPhotoLightbox.scrollTop = 0;

    if (plbUserName) plbUserName.textContent = displayName || 'User Photos';
    if (plbUserHandle) plbUserHandle.textContent = handle ? `@${handle.replace(/^@/, '')}` : '';

    if (plbLoading) plbLoading.style.display = 'flex';
    if (plbLocked) plbLocked.style.display = 'none';
    if (plbImageContainer) plbImageContainer.style.display = 'none';
    if (plbUploadSlide) plbUploadSlide.style.display = 'none';
    if (plbFooter) plbFooter.style.display = 'none';

    currentPlbPhotos = [];
    currentPlbIndex = 0;

    const myId = String(getLoggedInUserId() || '');
    currentPlbUserId = userId;
    currentPlbIsSelf = !String(userId).startsWith('house_') && Boolean(myId && (String(userId) === myId || (activeProfile && String(activeProfile.userId) === String(userId))));

    // If viewing a House photo, display photo directly without querying user photo history
    if (String(userId).startsWith('house_')) {
      if (plbLoading) plbLoading.style.display = 'none';
      if (fallbackPhotoUrl) {
        currentPlbPhotos = [{
          url: fallbackPhotoUrl,
          thumb: fallbackPhotoUrl,
          key: ''
        }];
        currentPlbIndex = 0;
        renderPlbPhoto();
      } else {
        if (plbLocked) {
          plbLocked.style.display = 'flex';
          if (plbLockedDesc) plbLockedDesc.textContent = "This house has not set a photo yet.";
        }
      }
      return;
    }

    try {
      const res = await window.powerdeckAPI.getPhotoHistory(userId);
      console.log("[PhotoHistory] response:", res);

      if (plbLoading) plbLoading.style.display = 'none';

      if (res && res.success && res.data) {
        const d = res.data;
        const rawList = d.photo_history || d.photos || d.items || [];

        if (Array.isArray(rawList) && rawList.length > 0) {
          currentPlbPhotos = rawList.map((item, idx) => {
            if (typeof item === 'string') {
              return { url: item, thumb: item, key: '' };
            }
            const url = item.full_photo_url || item.photo_url || item.url || item.thumbnail_url;
            const thumb = item.thumbnail_url || item.photo_url || url;
            const key = item.photo_key || item.key || '';
            return {
              url,
              thumb,
              key,
              time: item.time_created || item.created_at || null
            };
          }).filter(p => p.url);
        }

        // If list is empty but user had a fallback avatar URL
        if (currentPlbPhotos.length === 0) {
          if (fallbackPhotoUrl) {
            currentPlbPhotos = [{
              url: fallbackPhotoUrl,
              thumb: fallbackPhotoUrl,
              key: ''
            }];
          } else if (currentPlbIsSelf) {
            currentPlbPhotos = [];
          } else {
            if (plbLocked) {
              plbLocked.style.display = 'flex';
              if (plbLockedDesc) plbLockedDesc.textContent = "This member has no public photos available or photo history is locked.";
            }
            return;
          }
        }

        currentPlbIndex = 0;
        renderPlbPhoto();

      } else {
        if (plbLocked) {
          plbLocked.style.display = 'flex';
          const errMsg = (res && (res.error || (res.data && res.data.error_message))) || "This member's photo history is locked or private.";
          if (plbLockedDesc) plbLockedDesc.textContent = errMsg;
        }
      }
    } catch (err) {
      console.error("[PhotoHistory] error:", err);
      if (plbLoading) plbLoading.style.display = 'none';
      if (plbLocked) {
        plbLocked.style.display = 'flex';
        if (plbLockedDesc) plbLockedDesc.textContent = err.message || "Failed to load photo history: Photos are locked or private.";
      }
    }
  }

  function navigatePlb(dir) {
    const totalSlides = currentPlbPhotos.length + (currentPlbIsSelf ? 1 : 0);
    if (totalSlides <= 1) return;
    currentPlbIndex = (currentPlbIndex + dir + totalSlides) % totalSlides;
    renderPlbPhoto();
  }

  function renderPlbPhoto() {
    const totalSlides = currentPlbPhotos.length + (currentPlbIsSelf ? 1 : 0);
    if (totalSlides === 0) {
      if (plbImageContainer) plbImageContainer.style.display = 'none';
      if (plbUploadSlide) plbUploadSlide.style.display = 'flex';
      if (plbFooter) plbFooter.style.display = 'none';
      return;
    }

    if (currentPlbIndex < 0) currentPlbIndex = 0;
    if (currentPlbIndex >= totalSlides) currentPlbIndex = totalSlides - 1;

    if (plbFooter) plbFooter.style.display = 'flex';

    const isUploadSlide = (currentPlbIsSelf && currentPlbIndex === currentPlbPhotos.length);

    if (isUploadSlide) {
      // Show upload slide card
      if (plbImageContainer) plbImageContainer.style.display = 'none';
      if (plbUploadSlide) plbUploadSlide.style.display = 'flex';

      if (plbCounter) {
        plbCounter.textContent = `Upload New Photo (${currentPlbIndex + 1} of ${totalSlides})`;
      }
      if (btnPlbSetAvatar) btnPlbSetAvatar.style.display = 'none';
      if (btnPlbDelete) btnPlbDelete.style.display = 'none';
      if (btnPlbCopyUrl) btnPlbCopyUrl.style.display = 'none';
      if (btnPlbDownloadPhoto) btnPlbDownloadPhoto.style.display = 'none';

    } else {
      // Show active photo
      const item = currentPlbPhotos[currentPlbIndex];
      if (plbImageContainer) plbImageContainer.style.display = 'flex';
      if (plbUploadSlide) plbUploadSlide.style.display = 'none';

      if (plbMainImg && item) {
        plbMainImg.src = item.url;
      }
      if (plbCounter) {
        plbCounter.textContent = `Photo ${currentPlbIndex + 1} of ${totalSlides}`;
      }

      if (btnPlbCopyUrl) btnPlbCopyUrl.style.display = 'inline-flex';
      if (btnPlbDownloadPhoto) btnPlbDownloadPhoto.style.display = 'inline-flex';

      if (currentPlbIsSelf && item && item.key) {
        if (btnPlbSetAvatar) {
          btnPlbSetAvatar.style.display = 'inline-flex';
          btnPlbSetAvatar.disabled = false;
        }
        if (btnPlbDelete) {
          btnPlbDelete.style.display = 'inline-flex';
          btnPlbDelete.disabled = false;
        }
      } else {
        if (btnPlbSetAvatar) btnPlbSetAvatar.style.display = 'none';
        if (btnPlbDelete) btnPlbDelete.style.display = 'none';
      }
    }

    if (btnPlbPrev) btnPlbPrev.style.display = totalSlides > 1 ? 'flex' : 'none';
    if (btnPlbNext) btnPlbNext.style.display = totalSlides > 1 ? 'flex' : 'none';

    if (plbThumbsRow) {
      if (totalSlides > 1) {
        plbThumbsRow.style.display = 'flex';
        let thumbsHtml = currentPlbPhotos.map((p, idx) => `
          <div class="plb-thumb-item ${idx === currentPlbIndex ? 'active' : ''}" data-idx="${idx}">
            <img src="${escapeHtml(p.thumb || p.url)}" alt="Thumb">
          </div>
        `).join('');

        if (currentPlbIsSelf) {
          thumbsHtml += `
            <div class="plb-thumb-item plb-thumb-upload ${currentPlbIndex === currentPlbPhotos.length ? 'active' : ''}" data-idx="${currentPlbPhotos.length}" title="Upload new photo">
              ➕
            </div>
          `;
        }

        plbThumbsRow.innerHTML = thumbsHtml;

        plbThumbsRow.querySelectorAll('.plb-thumb-item').forEach(th => {
          th.onclick = () => {
            const i = parseInt(th.getAttribute('data-idx'));
            if (!isNaN(i)) {
              currentPlbIndex = i;
              renderPlbPhoto();
            }
          };
        });
      } else {
        plbThumbsRow.style.display = 'none';
      }
    }
  }

  // Lightbox Events
  if (btnClosePhotoLightbox) {
    btnClosePhotoLightbox.onclick = () => {
      if (modalPhotoLightbox) modalPhotoLightbox.style.display = 'none';
    };
  }
  if (modalPhotoLightbox) {
    modalPhotoLightbox.onclick = (e) => {
      if (e.target === modalPhotoLightbox) {
        modalPhotoLightbox.style.display = 'none';
      }
    };
  }
  if (btnPlbPrev) {
    btnPlbPrev.onclick = () => navigatePlb(-1);
  }
  if (btnPlbNext) {
    btnPlbNext.onclick = () => navigatePlb(1);
  }

  // Touch & Mouse Drag Swiping on Photo Viewport
  let plbTouchStartX = 0;
  let plbTouchStartY = 0;
  let plbMouseStartX = 0;
  let plbIsMouseDown = false;

  const plbViewport = document.getElementById('plb-viewport');
  if (plbViewport) {
    plbViewport.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        plbTouchStartX = e.touches[0].clientX;
        plbTouchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    plbViewport.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches[0]) {
        const diffX = e.changedTouches[0].clientX - plbTouchStartX;
        const diffY = e.changedTouches[0].clientY - plbTouchStartY;
        if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX < 0) {
            navigatePlb(1);
          } else {
            navigatePlb(-1);
          }
        }
      }
    }, { passive: true });

    plbViewport.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !e.target.closest('button')) {
        plbIsMouseDown = true;
        plbMouseStartX = e.clientX;
      }
    });

    plbViewport.addEventListener('mouseup', (e) => {
      if (plbIsMouseDown) {
        plbIsMouseDown = false;
        const diffX = e.clientX - plbMouseStartX;
        if (Math.abs(diffX) > 50) {
          if (diffX < 0) {
            navigatePlb(1);
          } else {
            navigatePlb(-1);
          }
        }
      }
    });
  }

  if (btnPlbLaunchCrop) {
    btnPlbLaunchCrop.onclick = () => {
      if (modalPhotoLightbox) modalPhotoLightbox.style.display = 'none';
      openPhotoCropperModal();
    };
  }

  if (btnPlbSetAvatar) {
    btnPlbSetAvatar.onclick = async () => {
      if (currentPlbIndex >= currentPlbPhotos.length) return;
      const photo = currentPlbPhotos[currentPlbIndex];
      if (!photo || !photo.key) {
        showAlert('warning', 'This photo does not have a valid photo key.');
        return;
      }
      btnPlbSetAvatar.disabled = true;
      const prevText = btnPlbSetAvatar.textContent;
      btnPlbSetAvatar.textContent = 'Setting...';
      try {
        const res = await window.powerdeckAPI.setProfilePhoto(photo.key);
        if (res && res.success) {
          showAlert('success', 'Profile picture updated successfully!');
          const myUser = getLoggedInUser();
          if (myUser) myUser.photo_url = photo.url;
          if (activeProfile) {
            activeProfile.photo_url = photo.url;
            if (activeProfile.user) activeProfile.user.photo_url = photo.url;
          }
          if (homeAvatar) {
            homeAvatar.src = photo.url;
            homeAvatar.style.display = 'block';
          }
          const studioImg = document.getElementById('studio-avatar-img');
          if (studioImg) {
            studioImg.src = photo.url;
            studioImg.style.display = 'block';
          }
          // Refresh studio photo list if open
          const myId = getLoggedInUserId();
          if (myId) loadUserPhotoHistory(myId).catch(() => {});
        } else {
          showAlert('warning', (res && res.error) || 'Failed to set profile picture.');
        }
      } catch (err) {
        showAlert('error', err.message || 'Failed to set profile picture');
      } finally {
        btnPlbSetAvatar.disabled = false;
        btnPlbSetAvatar.textContent = prevText;
      }
    };
  }

  if (btnPlbDelete) {
    btnPlbDelete.onclick = async () => {
      if (currentPlbIndex >= currentPlbPhotos.length) return;
      const photo = currentPlbPhotos[currentPlbIndex];
      if (!photo || !photo.key) {
        showAlert('warning', 'This photo cannot be deleted.');
        return;
      }
      btnPlbDelete.disabled = true;
      const prevText = btnPlbDelete.textContent;
      btnPlbDelete.textContent = 'Deleting...';
      try {
        const res = await window.powerdeckAPI.removePhoto(photo.key);
        if (res && res.success) {
          showAlert('success', 'Photo deleted from your history!');
          currentPlbPhotos.splice(currentPlbIndex, 1);
          if (currentPlbIndex >= currentPlbPhotos.length && currentPlbPhotos.length > 0) {
            currentPlbIndex = currentPlbPhotos.length - 1;
          }
          renderPlbPhoto();
          // Refresh studio photo list if open
          const myId = getLoggedInUserId();
          if (myId) loadUserPhotoHistory(myId).catch(() => {});
        } else {
          showAlert('warning', (res && res.error) || 'Failed to remove photo.');
        }
      } catch (err) {
        showAlert('error', err.message || 'Failed to remove photo');
      } finally {
        btnPlbDelete.disabled = false;
        btnPlbDelete.textContent = prevText;
      }
    };
  }

  if (btnPlbCopyUrl) {
    btnPlbCopyUrl.onclick = async () => {
      if (currentPlbPhotos[currentPlbIndex] && currentPlbPhotos[currentPlbIndex].url) {
        try {
          await navigator.clipboard.writeText(currentPlbPhotos[currentPlbIndex].url);
          showAlert('success', 'Photo URL copied to clipboard!');
        } catch (e) {
          showAlert('info', 'Photo URL: ' + currentPlbPhotos[currentPlbIndex].url);
        }
      }
    };
  }

  if (btnPlbDownloadPhoto) {
    btnPlbDownloadPhoto.onclick = async () => {
      const cur = currentPlbPhotos[currentPlbIndex];
      if (!cur || !cur.url) return;
      try {
        const response = await fetch(cur.url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        const filename = (currentPlbUserId ? `photo_${currentPlbUserId}_${Date.now()}.jpg` : `photo_${Date.now()}.jpg`);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        showAlert('success', 'Photo downloaded successfully!');
      } catch (err) {
        console.warn('Download via fetch failed, opening URL in browser:', err);
        window.open(cur.url, '_blank');
      }
    };
  }

  // Keyboard Shortcuts (Lightbox Arrows & Global Hotkeys: Ctrl+M Mic Mute & Ctrl+X Room Audio Deafen)
  window.addEventListener('keydown', async (e) => {
    // 1. Photo Lightbox navigation
    if (modalPhotoLightbox && modalPhotoLightbox.style.display === 'flex') {
      if (e.key === 'Escape') {
        modalPhotoLightbox.style.display = 'none';
        return;
      }
      if (e.key === 'ArrowLeft') {
        navigatePlb(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        navigatePlb(1);
        return;
      }
    }

    // 2. Global Hotkey: Ctrl + M (or Cmd + M) to mute/unmute mic in channel
    if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M' || e.code === 'KeyM')) {
      if (currentActiveRoom) {
        e.preventDefault();
        await toggleMicMuted();
        const stateText = isMicMuted ? 'Muted 🔴' : 'Unmuted 🟢';
        showAlert('info', `Microphone ${stateText} (Ctrl+M)`);
      }
    }

    // 3. Global Hotkey: Ctrl + X (or Cmd + X) to mute/unmute remote room audio (Deafen)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X' || e.code === 'KeyX')) {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable
      );
      // If user selected text to cut in a text field, let standard cut happen
      if (isInput && activeEl.selectionStart !== activeEl.selectionEnd) {
        return;
      }
      e.preventDefault();
      toggleMuteRemoteAudio();
    }
  });

  // Profile Viewers & Anonymous Mode features removed
  async function openProfileViewersModal() {}
  function updateTopAnonButtonVisibility() {}
  function openAnonEmojiPickerModal() {}
  async function saveAnonSettings() {}

  // ============================================================
  // BLOCKED USERS LIST & UNBLOCK ACTION
  // ============================================================
  async function openBlockedUsersModal() {
    const modal = document.getElementById('modal-blocked-users');
    const listEl = document.getElementById('blocked-users-list');
    if (!modal) return;
    modal.style.display = 'flex';
    bringModalToFront(modal);
    modal.scrollTop = 0;
    if (listEl) listEl.innerHTML = '<div class="blocked-loading-state">Loading blocked users...</div>';

    try {
      const res = await window.powerdeckAPI.getBlockedUsers();
      if (res && res.success !== false) {
        const raw = (res && res.data) ? res.data : res;
        const users = (res && Array.isArray(res.users)) ? res.users :
                      (raw && Array.isArray(raw.users)) ? raw.users :
                      (raw && Array.isArray(raw.blocked_users)) ? raw.blocked_users :
                      (Array.isArray(raw) ? raw : []);

        // Cache blocked IDs
        users.forEach(u => {
          if (u && u.user_id) cachedBlockedUserIds.add(Number(u.user_id));
        });

        // Also incorporate any locally known blocked IDs using get_profile
        if (cachedBlockedUserIds.size > 0) {
          const userIdsInList = new Set(users.map(u => Number(u.user_id)));
          for (const bid of cachedBlockedUserIds) {
            if (!userIdsInList.has(bid)) {
              try {
                const prof = await getProfileCached(bid);
                if (prof) {
                  users.push({
                    user_id: bid,
                    name: prof.name || prof.displayname || 'Blocked User',
                    username: prof.username || '',
                    photo_url: prof.photo_url || null
                  });
                }
              } catch (_) {}
            }
          }
        }

        if (!Array.isArray(users) || users.length === 0) {
          listEl.innerHTML = '<div class="empty-state-notice">You have not blocked any users.</div>';
          return;
        }
        listEl.innerHTML = users.map(u => {
          const initial = (u.name || 'U').charAt(0).toUpperCase();
          const avatarHtml = u.photo_url
            ? `<img src="${escapeHtml(u.photo_url)}" class="blocked-avatar" alt="${escapeHtml(u.name)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'blocked-fallback\\'>${initial}</div>';">`
            : `<div class="blocked-fallback">${initial}</div>`;
          return `
            <div class="blocked-user-card" id="blocked-card-${u.user_id}">
              <div class="blocked-user-main" data-user-id="${u.user_id}" data-username="${escapeHtml(u.username || '')}" style="cursor: pointer;" title="Click to view full profile">
                ${avatarHtml}
                <div class="blocked-info">
                  <span class="blocked-name">${escapeHtml(u.name || 'User')}</span>
                  <span class="blocked-username">@${escapeHtml(u.username || '')}</span>
                </div>
              </div>
              <button class="btn btn-outline-warning btn-xs btn-unblock-state btn-unblock-user" data-user-id="${u.user_id}" data-name="${escapeHtml(u.name || 'user')}">🔓 Unblock</button>
            </div>
          `;
        }).join('');

        // Wire click to view member profile
        listEl.querySelectorAll('.blocked-user-main').forEach(el => {
          el.addEventListener('click', () => {
            const uId = el.getAttribute('data-user-id');
            const uName = el.getAttribute('data-username');
            if (uId) {
              openUserProfileModal(uId, 'blocked_users_modal', uName);
            }
          });
        });

        listEl.querySelectorAll('.btn-unblock-user').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const uId = btn.getAttribute('data-user-id');
            const uName = btn.getAttribute('data-name');
            btn.disabled = true;
            btn.textContent = '...';
            try {
              const unres = await window.powerdeckAPI.unblockUser(uId);
              if (unres && unres.success !== false) {
                showAlert('success', `Unblocked ${uName}`);
                cachedBlockedUserIds.delete(Number(uId));
                if (currentViewingProfile && String(currentViewingProfile.user_id) === String(uId)) {
                  currentViewingProfile.is_blocked = false;
                  updateProfileBlockButtonState(false);
                  if (btnPmFollow) {
                    btnPmFollow.style.display = 'inline-flex';
                    btnPmFollow.disabled = false;
                    pmFollowLabel.textContent = '+ Follow';
                    btnPmFollow.classList.remove('is-following');
                  }
                }
                const card = document.getElementById(`blocked-card-${uId}`);
                if (card) card.remove();
                if (listEl.children.length === 0) {
                  listEl.innerHTML = '<div class="empty-state-notice">You have not blocked any users.</div>';
                }
              } else {
                showAlert('error', (unres && unres.error) || 'Failed to unblock user');
                btn.disabled = false;
                btn.textContent = '🔓 Unblock';
              }
            } catch (err) {
              showAlert('error', err.message);
              btn.disabled = false;
              btn.textContent = '🔓 Unblock';
            }
          });
        });
      } else {
        if (listEl) listEl.innerHTML = `<div class="empty-state-notice">${escapeHtml((res && res.error) || 'Failed to load blocked users')}</div>`;
      }
    } catch (err) {
      if (listEl) listEl.innerHTML = `<div class="empty-state-notice">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ============================================================
  // SOCIAL GRAPH: FOLLOWERS & FOLLOWING
  // ============================================================
  let activeSocialGraphUserId = null;
  let activeSocialGraphType = 'followers';
  let activeSocialGraphUsers = [];
  let socialGraphPage = 1;
  let socialGraphNextCursor = null;
  let socialGraphHasMore = true;
  let socialGraphIsLoadingMore = false;
  let socialGraphTotalCount = 0;
  let socialGraphReturnState = null;
  let parentProfileUserId = null;

  function closeUserProfileModal() {
    if (modalUserProfile) modalUserProfile.style.display = 'none';
    const modalBlocked = document.getElementById('modal-blocked-users');
    const modalStudio = document.getElementById('modal-profile-studio');
    if (modalBlocked && modalBlocked.style.display !== 'none') {
      bringModalToFront(modalBlocked);
    } else if (modalSocialGraph && modalSocialGraph.style.display !== 'none') {
      bringModalToFront(modalSocialGraph);
    } else if (modalStudio && modalStudio.style.display !== 'none') {
      bringModalToFront(modalStudio);
    } else {
      parentProfileUserId = null;
    }
  }

  function closeSocialGraphModal() {
    if (modalSocialGraph) modalSocialGraph.style.display = 'none';
    if (parentProfileUserId) {
      const pid = parentProfileUserId;
      parentProfileUserId = null;
      const myId = getLoggedInUserId();
      if (pid && String(pid) !== String(myId)) {
        if (!modalUserProfile || modalUserProfile.style.display === 'none' || String(viewingProfileUserId) !== String(pid)) {
          openUserProfileModal(pid);
        } else {
          bringModalToFront(modalUserProfile);
        }
      }
    }
  }

  async function openSocialGraphModal(userId, requestType = 'followers') {
    if (!userId) return;
    activeSocialGraphUserId = userId;
    activeSocialGraphType = requestType;

    const modal = document.getElementById('modal-social-graph') || modalSocialGraph;
    const searchEl = document.getElementById('social-graph-search');

    if (!modal) return;
    modal.style.display = 'flex';
    bringModalToFront(modal);
    modal.scrollTop = 0;
    if (searchEl) searchEl.value = '';

    await loadSocialGraphData(userId, requestType, false);
  }

  async function loadSocialGraphData(userId, requestType, isAppend = false) {
    let cleanType = requestType || 'followers';
    if (cleanType === 'friends' || cleanType === 'mutuals') cleanType = 'cofollows';
    activeSocialGraphType = cleanType;

    const title = document.getElementById('social-graph-title');
    const tabF = document.getElementById('tab-followers');
    const tabG = document.getElementById('tab-following');
    const tabM = document.getElementById('tab-friends');
    const listEl = document.getElementById('social-graph-list');

    if (tabF) tabF.classList.toggle('active', cleanType === 'followers');
    if (tabG) tabG.classList.toggle('active', cleanType === 'following');
    if (tabM) tabM.classList.toggle('active', cleanType === 'cofollows');

    if (title) {
      if (cleanType === 'followers') title.textContent = '👥 Followers';
      else if (cleanType === 'following') title.textContent = '👥 Following';
      else if (cleanType === 'cofollows') title.textContent = '🤝 Friends (Mutuals)';
    }

    const typeLabel = cleanType === 'cofollows' ? 'friends' : cleanType;

    if (!isAppend) {
      socialGraphPage = 1;
      socialGraphNextCursor = null;
      socialGraphHasMore = true;
      socialGraphIsLoadingMore = false;
      socialGraphTotalCount = 0;
      activeSocialGraphUsers = [];
      if (listEl) {
        listEl.innerHTML = `<div class="social-graph-loading" style="text-align: center; padding: 30px; color: var(--text-secondary);">Loading ${typeLabel}...</div>`;
      }
    }

    try {
      const pageToFetch = isAppend ? (socialGraphPage + 1) : 1;
      const cursorToFetch = isAppend ? socialGraphNextCursor : null;
      const res = await window.powerdeckAPI.getUserSocialGraph(userId, cleanType, 50, pageToFetch, cursorToFetch);

      if (res && res.success && res.data) {
        const users = res.data.users || res.data.profiles || res.data.user_profiles || res.data.social_graph || (Array.isArray(res.data) ? res.data : []);

        const countFromData = Number(res.data.count || res.data.total || 0);
        if (countFromData > 0) {
          socialGraphTotalCount = countFromData;
        }

        const fCount = document.getElementById('sg-tab-followers-count');
        const gCount = document.getElementById('sg-tab-following-count');
        const mCount = document.getElementById('sg-tab-friends-count');
        if (cleanType === 'followers' && fCount) {
          fCount.textContent = (socialGraphTotalCount > 0 ? socialGraphTotalCount : users.length).toLocaleString();
        } else if (cleanType === 'following' && gCount) {
          gCount.textContent = (socialGraphTotalCount > 0 ? socialGraphTotalCount : users.length).toLocaleString();
        } else if (cleanType === 'cofollows' && mCount) {
          mCount.textContent = (socialGraphTotalCount > 0 ? socialGraphTotalCount : users.length).toLocaleString();
        }

        const nextVal = res.data.next_cursor || res.data.cursor || res.data.next || null;
        socialGraphNextCursor = nextVal;
        socialGraphPage = pageToFetch;

        if (isAppend) {
          const existingIds = new Set(activeSocialGraphUsers.map(u => {
            const prof = u.user_profile || u.profile || u.user || u;
            return String(prof.user_profile_id || prof.user_id || prof.id || u.user_profile_id || u.user_id || u.id);
          }));
          const uniqueNewUsers = users.filter(u => {
            const prof = u.user_profile || u.profile || u.user || u;
            const id = String(prof.user_profile_id || prof.user_id || prof.id || u.user_profile_id || u.user_id || u.id);
            return !existingIds.has(id);
          });
          activeSocialGraphUsers = [...activeSocialGraphUsers, ...uniqueNewUsers];
        } else {
          activeSocialGraphUsers = users;
        }

        if (nextVal != null && typeof nextVal === 'string' && nextVal.trim().length > 0) {
          socialGraphHasMore = true;
        } else if (users.length >= 50 && (socialGraphTotalCount === 0 || activeSocialGraphUsers.length < socialGraphTotalCount)) {
          socialGraphHasMore = true;
        } else {
          socialGraphHasMore = false;
        }

        renderSocialGraphUsers(activeSocialGraphUsers);
      } else {
        if (!isAppend && listEl) {
          listEl.innerHTML = `<div class="social-graph-loading" style="text-align: center; padding: 30px; color: var(--danger);">Failed to load ${typeLabel}: ${(res && res.error) || 'Unknown error'}</div>`;
        }
        socialGraphHasMore = false;
      }
    } catch (err) {
      if (!isAppend && listEl) {
        listEl.innerHTML = `<div class="social-graph-loading" style="text-align: center; padding: 30px; color: var(--danger);">Error: ${err.message}</div>`;
      }
      socialGraphHasMore = false;
    }
  }

  async function loadNextSocialGraphPage() {
    if (!socialGraphHasMore || socialGraphIsLoadingMore || !activeSocialGraphUserId) return;
    socialGraphIsLoadingMore = true;

    const listEl = document.getElementById('social-graph-list');
    let loadingIndicator = document.getElementById('sg-loading-more-indicator');
    if (!loadingIndicator && listEl) {
      loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'sg-loading-more-indicator';
      loadingIndicator.style.cssText = 'text-align: center; padding: 14px; color: var(--text-muted); font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;';
      const label = activeSocialGraphType === 'cofollows' ? 'friends' : activeSocialGraphType;
      loadingIndicator.innerHTML = `
        <span style="display: inline-block; width: 14px; height: 14px; border: 2px solid var(--primary); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
        <span>Loading more ${label}...</span>
      `;
      listEl.appendChild(loadingIndicator);
    }

    try {
      const pageToFetch = socialGraphPage + 1;
      const cursorToFetch = socialGraphNextCursor;
      const res = await window.powerdeckAPI.getUserSocialGraph(
        activeSocialGraphUserId,
        activeSocialGraphType,
        50,
        pageToFetch,
        cursorToFetch
      );

      if (loadingIndicator && loadingIndicator.parentNode) {
        loadingIndicator.parentNode.removeChild(loadingIndicator);
      }

      if (res && res.success && res.data) {
        const users = res.data.users || res.data.profiles || res.data.user_profiles || res.data.social_graph || (Array.isArray(res.data) ? res.data : []);
        if (users.length > 0) {
          const existingIds = new Set(activeSocialGraphUsers.map(u => {
            const prof = u.user_profile || u.profile || u.user || u;
            return String(prof.user_profile_id || prof.user_id || prof.id || u.user_profile_id || u.user_id || u.id);
          }));
          const uniqueNewUsers = users.filter(u => {
            const prof = u.user_profile || u.profile || u.user || u;
            const id = String(prof.user_profile_id || prof.user_id || prof.id || u.user_profile_id || u.user_id || u.id);
            return !existingIds.has(id);
          });

          if (uniqueNewUsers.length > 0) {
            socialGraphPage = pageToFetch;
            activeSocialGraphUsers = [...activeSocialGraphUsers, ...uniqueNewUsers];

            const nextVal = res.data.next_cursor || res.data.cursor || res.data.next || null;
            socialGraphNextCursor = nextVal;
            if (nextVal != null && typeof nextVal === 'string' && nextVal.trim().length > 0) {
              socialGraphHasMore = true;
            } else if (users.length >= 50 && (socialGraphTotalCount === 0 || activeSocialGraphUsers.length < socialGraphTotalCount)) {
              socialGraphHasMore = true;
            } else {
              socialGraphHasMore = false;
            }

            // Re-render and maintain current scroll position for smooth infinite swipe
            const prevScrollTop = listEl ? listEl.scrollTop : 0;
            const searchInput = document.getElementById('social-graph-search');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
            if (query) {
              const filtered = activeSocialGraphUsers.filter(u => {
                const prof = u.user_profile || u.profile || u.user || u;
                const name = prof.name || u.name || '';
                const uname = prof.username || u.username || '';
                const bio = prof.bio || u.bio || '';
                return name.toLowerCase().includes(query) ||
                  uname.toLowerCase().includes(query) ||
                  bio.toLowerCase().includes(query);
              });
              renderSocialGraphUsers(filtered);
            } else {
              renderSocialGraphUsers(activeSocialGraphUsers);
            }
            if (listEl) listEl.scrollTop = prevScrollTop;
          } else {
            socialGraphHasMore = false;
          }
        } else {
          socialGraphHasMore = false;
        }
      } else {
        socialGraphHasMore = false;
      }
    } catch (err) {
      console.error("Error loading next social graph page:", err);
      if (loadingIndicator && loadingIndicator.parentNode) {
        loadingIndicator.parentNode.removeChild(loadingIndicator);
      }
      socialGraphHasMore = false;
    } finally {
      socialGraphIsLoadingMore = false;
    }
  }

  function renderSocialGraphUsers(users) {
    const listEl = document.getElementById('social-graph-list');
    if (!listEl) return;

    if (!users || users.length === 0) {
      const typeLabel = activeSocialGraphType === 'cofollows' ? 'friends' : activeSocialGraphType;
      listEl.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No ${typeLabel} found in this list.</div>`;
      return;
    }

    const isFollowingTab = (activeSocialGraphType === 'following');
    const myId = getLoggedInUserId();
    const isMyGraph = (myId != null && myId !== '') && (String(activeSocialGraphUserId) === String(myId));

    listEl.innerHTML = users.map(u => {
      const prof = u.user_profile || u.profile || u.user || u;
      const uId = prof.user_profile_id || prof.user_id || prof.id || u.user_profile_id || u.user_id || u.id;
      const name = prof.name || prof.first_name || u.name || 'Member';
      const rawHandle = prof.username || u.username || '';
      const username = rawHandle ? `@${rawHandle.replace(/^@/, '')}` : '';
      const bio = prof.bio || u.bio || '';
      const initial = (name || 'M').charAt(0).toUpperCase();
      const photoUrl = prof.photo_url || u.photo_url || '';
      const photoHtml = photoUrl
        ? `<img src="${photoUrl}" class="social-user-avatar" alt="${escapeHtml(name)}" onerror="this.onerror=null;const d=document.createElement('div');d.className='social-user-fallback';d.textContent='${initial}';this.replaceWith(d);">`
        : `<div class="social-user-fallback">${initial}</div>`;

      const isSelf = (myId != null && myId !== '') && (String(uId) === String(myId));

      const isPaid = !!(
        prof.is_paid_user === true ||
        prof.is_paid === true ||
        prof.is_subscribed === true ||
        prof.is_plus === true ||
        prof.has_plus === true ||
        prof.is_paid_member === true ||
        u.is_paid_user === true ||
        u.is_paid === true
      );
      const paidPlusHtml = isPaid
        ? `<span class="badge-yellow-plus" title="Clubhouse Plus Member">+</span>`
        : '';

      let btnActionHtml = '';
      if (isSelf) {
        btnActionHtml = `<span class="badge-self-user" style="font-size: 11px; color: var(--text-muted); font-weight: 600; padding: 2px 6px;">(You)</span>`;
      } else if (uId) {
        const viewerStatus = prof.viewer_follow_status || u.viewer_follow_status;
        const isFollowing = (viewerStatus === 'following') ||
          (isMyGraph && isFollowingTab) ||
          prof.is_following === true ||
          prof.follow_status === 'following' ||
          u.is_following === true ||
          u.follow_status === 'following';

        const followsMe = (prof.follows_me_status === 'following' || u.follows_me_status === 'following' || prof.follows_me === true);
        const followsMeBadge = followsMe ? `<span class="badge badge-muted" style="font-size: 10px; margin-right: 6px;">Follows you</span>` : '';

        btnActionHtml = `
          ${followsMeBadge}
          ${isFollowing
            ? `<button class="btn btn-sg-unfollow btn-xs" data-user-id="${uId}" data-username="${escapeHtml(username || name)}" title="Click to unfollow member">Following</button>`
            : `<button class="btn btn-primary btn-xs btn-sg-follow" data-user-id="${uId}" data-username="${escapeHtml(username || name)}" title="Click to follow member">+ Follow</button>`
          }
        `;
      }

      const canMessageHtml = (prof.can_message || u.can_message)
        ? `<span title="Direct messages available" style="font-size: 11px; margin-left: 4px; cursor: default;">💬</span>`
        : '';

      return `
        <div class="social-user-card" data-user-id="${uId || ''}">
          <div class="social-user-main clickable-profile-row" data-user-id="${uId || ''}" title="Click to view @${escapeHtml(rawHandle || '')}'s full profile">
            ${photoHtml}
            <div class="social-user-info">
              <div class="social-user-name">${escapeHtml(name)} ${paidPlusHtml} ${canMessageHtml}</div>
              <div class="social-user-handle">${escapeHtml(username)}</div>
              ${bio ? `<div class="social-user-bio">${escapeHtml(bio)}</div>` : ''}
            </div>
          </div>
          ${btnActionHtml ? `
            <div class="social-user-action">
              ${btnActionHtml}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Delegated click handler for robust Unfollow / Follow / Profile clicks
    listEl.onclick = async (e) => {
      const btnUnfollow = e.target.closest('.btn-sg-unfollow');
      const btnFollow = e.target.closest('.btn-sg-follow');
      const row = e.target.closest('.clickable-profile-row') || e.target.closest('.social-user-card');

      // Unfollow Action using exact user id
      if (btnUnfollow) {
        e.stopPropagation();
        const uid = btnUnfollow.getAttribute('data-user-id');
        const uName = btnUnfollow.getAttribute('data-username') || 'member';
        if (!uid || uid === 'undefined') {
          showAlert('error', 'Cannot unfollow: missing user ID');
          return;
        }

        btnUnfollow.disabled = true;
        const prevText = btnUnfollow.textContent;
        btnUnfollow.textContent = '...';

        try {
          const res = await window.powerdeckAPI.unfollowUser(Number(uid));
          if (res && res.success) {
            cachedFollowingUserIds.delete(Number(uid));
            showAlert('info', `Unfollowed ${uName}`);
            btnUnfollow.className = 'btn btn-primary btn-xs btn-sg-follow';
            btnUnfollow.textContent = '+ Follow';
            btnUnfollow.title = 'Click to follow member';
            btnUnfollow.disabled = false;

            // Decrement following counts if this is my own following list
            const myId = getLoggedInUserId();
            const isMyGraph = (myId != null && myId !== '') && (String(activeSocialGraphUserId) === String(myId));
            if (isMyGraph && isFollowingTab) {
              const gCount = document.getElementById('sg-tab-following-count');
              if (gCount) {
                const cur = parseInt(gCount.textContent.replace(/,/g, '')) || 0;
                if (cur > 0) gCount.textContent = (cur - 1).toLocaleString();
              }
              if (homeUserFollowing) {
                const cur = parseInt(homeUserFollowing.textContent.replace(/,/g, '')) || 0;
                if (cur > 0) homeUserFollowing.textContent = (cur - 1).toLocaleString();
              }
              const studioFollowing = document.getElementById('studio-following-btn-count');
              if (studioFollowing) {
                const cur = parseInt(studioFollowing.textContent.replace(/,/g, '')) || 0;
                if (cur > 0) studioFollowing.textContent = (cur - 1).toLocaleString();
              }
              if (pmFollowingCount) {
                const cur = parseInt(pmFollowingCount.textContent.replace(/,/g, '')) || 0;
                if (cur > 0) pmFollowingCount.textContent = (cur - 1).toLocaleString();
              }
            }
          } else {
            btnUnfollow.disabled = false;
            btnUnfollow.textContent = prevText || 'Unfollow';
            showAlert('error', (res && res.error) || 'Failed to unfollow user');
          }
        } catch (err) {
          btnUnfollow.disabled = false;
          btnUnfollow.textContent = prevText || 'Unfollow';
          showAlert('error', `Unfollow error: ${err.message}`);
        }
        return;
      }

      // Follow Action using exact user id
      if (btnFollow) {
        e.stopPropagation();
        const uid = btnFollow.getAttribute('data-user-id');
        const uName = btnFollow.getAttribute('data-username') || 'member';
        if (!uid || uid === 'undefined') {
          showAlert('error', 'Cannot follow: missing user ID');
          return;
        }

        btnFollow.disabled = true;
        const prevText = btnFollow.textContent;
        btnFollow.textContent = '...';

        try {
          const res = await window.powerdeckAPI.followUser(Number(uid));
          if (res && res.success) {
            cachedFollowingUserIds.add(Number(uid));
            showAlert('success', `Now following ${uName}!`);
            btnFollow.className = 'btn btn-sg-unfollow btn-xs';
            btnFollow.textContent = 'Unfollow';
            btnFollow.title = 'Click to unfollow member';
            btnFollow.disabled = false;

            const myId = getLoggedInUserId();
            const isMyGraph = (myId != null && myId !== '') && (String(activeSocialGraphUserId) === String(myId));
            if (isMyGraph) {
              const gCount = document.getElementById('sg-tab-following-count');
              if (gCount) {
                const cur = parseInt(gCount.textContent.replace(/,/g, '')) || 0;
                gCount.textContent = (cur + 1).toLocaleString();
              }
              if (homeUserFollowing) {
                const cur = parseInt(homeUserFollowing.textContent.replace(/,/g, '')) || 0;
                homeUserFollowing.textContent = (cur + 1).toLocaleString();
              }
              const studioFollowing = document.getElementById('studio-following-btn-count');
              if (studioFollowing) {
                const cur = parseInt(studioFollowing.textContent.replace(/,/g, '')) || 0;
                studioFollowing.textContent = (cur + 1).toLocaleString();
              }
              if (pmFollowingCount) {
                const cur = parseInt(pmFollowingCount.textContent.replace(/,/g, '')) || 0;
                pmFollowingCount.textContent = (cur + 1).toLocaleString();
              }
            }
          } else {
            btnFollow.disabled = false;
            btnFollow.textContent = prevText || '+ Follow';
            showAlert('error', (res && res.error) || 'Failed to follow user');
          }
        } catch (err) {
          btnFollow.disabled = false;
          btnFollow.textContent = prevText || '+ Follow';
          showAlert('error', `Follow error: ${err.message}`);
        }
        return;
      }

      // Profile Row click opens Member Profile popup directly in front
      if (row) {
        const uid = row.getAttribute('data-user-id');
        if (uid && uid !== 'undefined') {
          // Keep activeSocialGraphUserId as parent profile so returning closes back cleanly
          if (!parentProfileUserId && activeSocialGraphUserId) {
            parentProfileUserId = activeSocialGraphUserId;
          }
          // Do NOT hide modalSocialGraph - let it remain underneath so it doesn't "go down"!
          openUserProfileModal(uid);
        }
      }
    };
  }

  // ============================================================
  // PROFILE STUDIO & EDITING ACTIONS
  // ============================================================
  let currentPhotoHistoryList = [];
  let currentAccountSettings = null;

  async function openProfileStudioModal() {
    const modal = document.getElementById('modal-profile-studio');
    if (!modal) return;
    modal.style.display = 'flex';
    bringModalToFront(modal);
    modal.scrollTop = 0;

    const studioBody = modal.querySelector('.studio-modal-body');
    if (studioBody) studioBody.scrollTop = 0;

    const myUser = getLoggedInUser();
    const myId = getLoggedInUserId();

    // Populate immediate known values
    updateProfileStudioUI(myUser);

    // Fetch fresh profile from Clubhouse API
    if (myId) {
      try {
        const res = await window.powerdeckAPI.getProfile(myId);
        if (res && res.success && res.data && res.data.user_profile) {
          const up = res.data.user_profile;
          if (activeProfile) {
            if (!activeProfile.user) activeProfile.user = {};
            Object.assign(activeProfile.user, up);
            if (activeProfile._debug && activeProfile._debug.user_profile) {
              Object.assign(activeProfile._debug.user_profile, up);
            }
            if (up.share_url) {
              activeProfile.user.share_url = up.share_url;
              if (activeProfile._debug && activeProfile._debug.user_profile) {
                activeProfile._debug.user_profile.share_url = up.share_url;
              }
            }
            const inv = up.invited_by_user_profile || (res.data && res.data.invited_by_user_profile);
            if (inv) {
              if (!activeProfile._debug) activeProfile._debug = {};
              activeProfile._debug.invited_by_user_profile = inv;
              if (activeProfile._debug.user_profile) {
                activeProfile._debug.user_profile.invited_by_user_profile = inv;
              }
            }
          }
          updateProfileStudioUI(up, res.data);
        }
      } catch (err) {
        console.warn("Could not fetch fresh user profile:", err);
      }
    }

    // Call get_account_settings immediately after getting profile
    await loadAccountSettings();
  }

  async function loadAccountSettings() {
    try {
      const res = await window.powerdeckAPI.getAccountSettings();
      if (res && res.success && res.data) {
        currentAccountSettings = res.data;
        updateAccountSettingsUI(currentAccountSettings);
      }
    } catch (err) {
      console.warn("Could not fetch account settings:", err);
    }
  }

  function updateAccountSettingsUI(settings) {
    if (!settings) return;

    // 1. Name edit capability: can_change_name
    const btnEditName = document.getElementById('btn-studio-edit-name');
    const badgeNameLocked = document.getElementById('badge-studio-name-locked');
    if (settings.can_change_name === false) {
      if (btnEditName) btnEditName.style.display = 'none';
      if (badgeNameLocked) badgeNameLocked.style.display = 'inline-flex';
    } else {
      if (btnEditName) btnEditName.style.display = 'inline-flex';
      if (badgeNameLocked) badgeNameLocked.style.display = 'none';
    }

    // 2. Username edit capability: can_change_username
    const btnEditUsername = document.getElementById('btn-studio-edit-username');
    const badgeUsernameLocked = document.getElementById('badge-studio-username-locked');
    if (settings.can_change_username === false) {
      if (btnEditUsername) btnEditUsername.style.display = 'none';
      if (badgeUsernameLocked) badgeUsernameLocked.style.display = 'inline-flex';
    } else {
      if (btnEditUsername) btnEditUsername.style.display = 'inline-flex';
      if (badgeUsernameLocked) badgeUsernameLocked.style.display = 'none';
    }

    // 3. Display name edit capability: can_change_displayname
    const badgeAliasLocked = document.getElementById('badge-studio-alias-locked');
    const btnAddAlias = document.getElementById('btn-studio-add-alias');
    const btnEditAlias = document.getElementById('btn-studio-edit-alias');
    const btnRemoveAlias = document.getElementById('btn-studio-remove-alias');
    if (settings.can_change_displayname === false) {
      if (btnAddAlias) btnAddAlias.style.display = 'none';
      if (btnEditAlias) btnEditAlias.style.display = 'none';
      if (btnRemoveAlias) btnRemoveAlias.style.display = 'none';
      if (badgeAliasLocked) badgeAliasLocked.style.display = 'inline-flex';
    } else {
      if (badgeAliasLocked) badgeAliasLocked.style.display = 'none';
      const hasAlias = Boolean(settings.displayname || (activeProfile && activeProfile.user && activeProfile.user.displayname));
      if (hasAlias) {
        if (btnAddAlias) btnAddAlias.style.display = 'none';
        if (btnEditAlias) btnEditAlias.style.display = 'inline-flex';
        if (btnRemoveAlias) btnRemoveAlias.style.display = 'inline-flex';
      } else {
        if (btnAddAlias) btnAddAlias.style.display = 'inline-flex';
        if (btnEditAlias) btnEditAlias.style.display = 'none';
        if (btnRemoveAlias) btnRemoveAlias.style.display = 'none';
      }
    }

    // 4. Email address
    const valEmail = document.getElementById('studio-val-email');
    const btnEditEmail = document.getElementById('btn-studio-edit-email');
    if (valEmail) valEmail.textContent = settings.email || 'None set';
    if (btnEditEmail) btnEditEmail.textContent = settings.email ? '✏️ Edit' : '➕ Add Email';

    // 5. Phone number
    const valPhone = document.getElementById('studio-val-phone');
    if (valPhone) valPhone.textContent = settings.phone_number || 'None set';

    // 6. Private profile: has_protected_profile
    const isPrivate = Boolean(settings.has_protected_profile);
    const btnTogglePrivate = document.getElementById('btn-studio-toggle-private-profile');
    const txtPrivate = document.getElementById('studio-private-profile-text');
    const badgePrivacy = document.getElementById('badge-studio-privacy');
    const pillProtected = document.getElementById('pill-studio-protected');

    if (btnTogglePrivate && txtPrivate) {
      if (isPrivate) {
        txtPrivate.textContent = 'Private Profile (On)';
        btnTogglePrivate.className = 'btn btn-primary btn-xs';
        btnTogglePrivate.title = 'Private Profile is ON (Follower requests required). Click to make public.';
      } else {
        txtPrivate.textContent = 'Public Profile';
        btnTogglePrivate.className = 'btn btn-secondary btn-xs';
        btnTogglePrivate.title = 'Private Profile is OFF. Click to make private.';
      }
    }

    if (badgePrivacy) {
      badgePrivacy.style.display = 'inline-flex';
      if (isPrivate) {
        badgePrivacy.className = 'badge badge-warning';
        badgePrivacy.textContent = '🔒 Private';
      } else {
        badgePrivacy.className = 'badge badge-success';
        badgePrivacy.textContent = '🌐 Public';
      }
    }

    if (pillProtected) {
      if (isPrivate) {
        pillProtected.className = 'badge badge-warning';
        pillProtected.textContent = '🔒 Private Profile: Active';
      } else {
        pillProtected.className = 'badge badge-muted';
        pillProtected.textContent = '🌐 Private Profile: Off';
      }
    }

    // 7. Hide recently chatting: has_private_conversations_enabled
    const isRecentChatsHidden = Boolean(settings.has_private_conversations_enabled);
    const btnToggleConvos = document.getElementById('btn-studio-toggle-private-convos');
    const txtConvos = document.getElementById('studio-private-convos-text');
    const badgeConvos = document.getElementById('badge-studio-convos');
    const pillConvos = document.getElementById('pill-studio-private-convos');

    if (btnToggleConvos && txtConvos) {
      if (isRecentChatsHidden) {
        txtConvos.textContent = 'Recent Chats (Hidden)';
        btnToggleConvos.className = 'btn btn-primary btn-xs';
        btnToggleConvos.title = 'Recently chatting is HIDDEN from profile. Click to make visible.';
      } else {
        txtConvos.textContent = 'Recent Chats (Visible)';
        btnToggleConvos.className = 'btn btn-secondary btn-xs';
        btnToggleConvos.title = 'Recently chatting is VISIBLE on profile. Click to hide.';
      }
    }

    if (badgeConvos) {
      badgeConvos.style.display = 'inline-flex';
      if (isRecentChatsHidden) {
        badgeConvos.className = 'badge badge-warning';
        badgeConvos.textContent = '💬 Chats Hidden';
      } else {
        badgeConvos.className = 'badge badge-muted';
        badgeConvos.textContent = '💬 Chats Visible';
      }
    }

    if (pillConvos) {
      if (isRecentChatsHidden) {
        pillConvos.className = 'badge badge-warning';
        pillConvos.textContent = '💬 Recent Chats: Hidden';
      } else {
        pillConvos.className = 'badge badge-muted';
        pillConvos.textContent = '💬 Recent Chats: Visible';
      }
    }

    // 8. NSFW: has_enabled_nsfw
    const pillNsfw = document.getElementById('pill-studio-nsfw');
    if (pillNsfw) {
      if (settings.has_enabled_nsfw) {
        pillNsfw.className = 'badge badge-warning';
        pillNsfw.textContent = '🔞 NSFW: Enabled';
      } else {
        pillNsfw.className = 'badge badge-muted';
        pillNsfw.textContent = '🔞 NSFW: Disabled';
      }
    }

    // 9. Highlights: is_opted_out_of_highlights
    const pillHighlights = document.getElementById('pill-studio-highlights');
    if (pillHighlights) {
      if (settings.is_opted_out_of_highlights) {
        pillHighlights.className = 'badge badge-muted';
        pillHighlights.textContent = '✨ Highlights: Opted Out';
      } else {
        pillHighlights.className = 'badge badge-info';
        pillHighlights.textContent = '✨ Highlights: Active';
      }
    }
  }

  function updateProfileStudioUI(up, extraData = null) {
    if (!up) return;
    const nameEl = document.getElementById('studio-main-name');
    const userEl = document.getElementById('studio-main-username');
    const idEl = document.getElementById('studio-main-userid');
    const avatarImg = document.getElementById('studio-avatar-img');
    const avatarFallback = document.getElementById('studio-avatar-fallback');
    const valName = document.getElementById('studio-val-name');
    const valAlias = document.getElementById('studio-val-alias');
    const btnAddAlias = document.getElementById('btn-studio-add-alias');
    const btnEditAlias = document.getElementById('btn-studio-edit-alias');
    const btnRemoveAlias = document.getElementById('btn-studio-remove-alias');
    const valUsername = document.getElementById('studio-val-username');
    const valBio = document.getElementById('studio-val-bio');
    const followersCount = document.getElementById('studio-followers-btn-count');
    const followingCount = document.getElementById('studio-following-btn-count');

    const fullName = up.name || 'Member';
    const alias = up.displayname || '';
    const username = up.username ? `@${up.username}` : '@username';

    if (nameEl) nameEl.textContent = alias || fullName;
    if (userEl) userEl.textContent = username;
    if (idEl) idEl.textContent = `ID: ${up.user_id || '000000'}`;

    const isPaid = !!(
      up.is_paid_user === true ||
      up.is_paid_user === 1 ||
      up.is_paid_user === 'true' ||
      up.is_paid === true ||
      up.is_paid === 1 ||
      up.is_subscribed === true ||
      up.is_plus === true ||
      up.has_plus === true ||
      up.is_paid_member === true ||
      up.plus_expiration_time ||
      up.subscription
    );
    const studioPaidPlus = document.getElementById('studio-paid-plus');
    if (studioPaidPlus) studioPaidPlus.style.display = isPaid ? 'inline-flex' : 'none';

    if (valName) valName.textContent = fullName;
    if (valUsername) valUsername.textContent = username;
    if (valBio) valBio.textContent = up.bio || 'No bio set.';

    // Alias / Display Name UI
    if (alias) {
      if (valAlias) valAlias.textContent = alias;
      if (btnAddAlias) btnAddAlias.style.display = 'none';
      if (btnEditAlias) btnEditAlias.style.display = 'inline-flex';
      if (btnRemoveAlias) btnRemoveAlias.style.display = 'inline-flex';
    } else {
      if (valAlias) valAlias.textContent = 'None set';
      if (btnAddAlias) btnAddAlias.style.display = 'inline-flex';
      if (btnEditAlias) btnEditAlias.style.display = 'none';
      if (btnRemoveAlias) btnRemoveAlias.style.display = 'none';
    }

    // Avatar
    if (up.photo_url) {
      if (avatarImg) {
        avatarImg.src = up.photo_url;
        avatarImg.style.display = 'block';
      }
      if (avatarFallback) avatarFallback.style.display = 'none';
    } else {
      if (avatarImg) avatarImg.style.display = 'none';
      if (avatarFallback) {
        avatarFallback.style.display = 'flex';
        avatarFallback.textContent = fullName.charAt(0).toUpperCase();
      }
    }

    // Stats
    if (followersCount) followersCount.textContent = Number(up.num_followers || 0).toLocaleString();
    if (followingCount) followingCount.textContent = Number(up.num_following || 0).toLocaleString();

    // Time of Created (Member Since)
    const studioCreatedDate = document.getElementById('studio-created-date');
    const timeCreated = up.time_created ||
      (activeProfile && activeProfile._debug && activeProfile._debug.user_profile && activeProfile._debug.user_profile.time_created) ||
      (activeProfile && activeProfile.user && activeProfile.user.time_created) ||
      (activeProfile && activeProfile.time_created);

    if (studioCreatedDate) {
      if (timeCreated) {
        try {
          const d = new Date(timeCreated);
          if (!isNaN(d.getTime())) {
            const datePart = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            studioCreatedDate.textContent = `${datePart} • ${timePart}`;
            studioCreatedDate.title = `Joined Clubhouse: ${timeCreated}`;
          } else {
            studioCreatedDate.textContent = String(timeCreated);
          }
        } catch (_) {
          studioCreatedDate.textContent = String(timeCreated);
        }
      } else {
        studioCreatedDate.textContent = 'Active Member';
      }
    }

    // Nominated By / Invited by
    const studioInviterRow = document.getElementById('studio-inviter-row');
    const studioInviterAvatar = document.getElementById('studio-inviter-avatar');
    const studioInviterFallback = document.getElementById('studio-inviter-fallback');
    const studioInviterName = document.getElementById('studio-inviter-name');
    const studioInviterHandle = document.getElementById('studio-inviter-handle');
    const studioInviterNone = document.getElementById('studio-inviter-none');

    const inv = up.invited_by_user_profile ||
      (extraData && extraData.invited_by_user_profile) ||
      (activeProfile && activeProfile._debug && activeProfile._debug.invited_by_user_profile) ||
      (activeProfile && activeProfile._debug && activeProfile._debug.user_profile && activeProfile._debug.user_profile.invited_by_user_profile);

    if (inv && (inv.user_id || inv.name || inv.username)) {
      if (studioInviterName) studioInviterName.textContent = inv.name || 'Member';
      if (studioInviterHandle) studioInviterHandle.textContent = inv.username ? `@${inv.username}` : '';
      if (inv.photo_url) {
        if (studioInviterAvatar) {
          studioInviterAvatar.src = inv.photo_url;
          studioInviterAvatar.style.display = 'block';
        }
        if (studioInviterFallback) studioInviterFallback.style.display = 'none';
      } else {
        if (studioInviterAvatar) studioInviterAvatar.style.display = 'none';
        if (studioInviterFallback) {
          studioInviterFallback.style.display = 'flex';
          studioInviterFallback.textContent = (inv.name || 'U').charAt(0).toUpperCase();
        }
      }
      if (studioInviterRow) {
        studioInviterRow.style.display = 'flex';
        studioInviterRow.style.cursor = 'pointer';
        studioInviterRow.title = `Click to view @${inv.username || 'user'}'s profile`;
        studioInviterRow.onclick = () => {
          if (inv.user_id) openUserProfileModal(inv.user_id);
        };
      }
      if (studioInviterNone) studioInviterNone.style.display = 'none';
    } else {
      if (studioInviterRow) studioInviterRow.style.display = 'none';
      if (studioInviterNone) studioInviterNone.style.display = 'block';
    }

    // Joined Houses / Social Clubs in Profile Studio (at the bottom)
    const studioHousesSection = document.getElementById('studio-houses-section');
    const studioHousesGrid = document.getElementById('studio-houses-grid');
    const studioHousesCount = document.getElementById('studio-houses-count');
    if (studioHousesSection && studioHousesGrid) {
      const clubs = (Array.isArray(up.social_clubs) && up.social_clubs.length > 0)
        ? up.social_clubs
        : ((Array.isArray(up.clubs) && up.clubs.length > 0) ? up.clubs : []);

      if (studioHousesCount) {
        studioHousesCount.textContent = `${clubs.length} house${clubs.length === 1 ? '' : 's'}`;
      }

      if (clubs.length > 0) {
        studioHousesSection.style.display = 'flex';
        studioHousesGrid.innerHTML = clubs.map(c => {
          const cId = c.social_club_id || c.club_id || c.id;
          const cName = c.name || 'House';
          const cPhoto = c.photo_url || '';
          const cMembers = c.num_members ? `${Number(c.num_members).toLocaleString()} members` : (c.subtitle || '');
          const initial = (cName || 'H').charAt(0).toUpperCase();

          const avatarHtml = cPhoto
            ? `<img src="${escapeHtml(cPhoto)}" class="studio-house-avatar" alt="${escapeHtml(cName)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'studio-house-avatar fallback\\'>${initial}</div>';">`
            : `<div class="studio-house-avatar fallback">${initial}</div>`;

          return `
            <div class="studio-house-card" data-club-id="${cId}" title="Click to view house overview">
              ${avatarHtml}
              <div class="studio-house-meta">
                <div class="studio-house-name">${escapeHtml(cName)}</div>
                <div class="studio-house-members">${escapeHtml(cMembers)}</div>
              </div>
            </div>
          `;
        }).join('');

        studioHousesGrid.querySelectorAll('.studio-house-card').forEach(card => {
          card.onclick = () => {
            const cId = card.getAttribute('data-club-id');
            if (cId) {
              openClubModal(cId);
            }
          };
        });
      } else {
        studioHousesGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 8px 0;">Not a member of any houses yet.</div>';
      }
    }

    // Also update outside home header in real-time
    if (homeUserName) homeUserName.textContent = alias || fullName;
    if (homeUserHandle) homeUserHandle.textContent = username;
    if (homeAvatar && up.photo_url) {
      homeAvatar.src = up.photo_url;
      homeAvatar.style.display = 'block';
      if (homeAvatarFallback) homeAvatarFallback.style.display = 'none';
    }
  }

  async function loadUserPhotoHistory(userId) {
    const gridEl = document.getElementById('studio-photos-grid');
    const countEl = document.getElementById('studio-history-count');
    if (!gridEl) return;

    gridEl.innerHTML = `<div class="studio-loading-state" style="text-align: center; padding: 24px; color: var(--text-secondary); grid-column: 1/-1;">Loading photo history...</div>`;

    try {
      const res = await window.powerdeckAPI.getUserPhotoHistory(userId);
      if (res && res.success && res.data) {
        const photos = res.data.photo_history || res.data.photos || [];
        currentPhotoHistoryList = photos;
        if (countEl) countEl.textContent = `${photos.length} photos`;

        if (photos.length === 0) {
          gridEl.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-secondary); grid-column: 1/-1;">No photos in history yet. Upload one below!</div>`;
          return;
        }

        const myUser = getLoggedInUser();
        const currentPhotoKey = myUser.photo_key || '';
        const currentPhotoUrl = myUser.photo_url || '';

        gridEl.innerHTML = photos.map((p, idx) => {
          const pKey = p.photo_key || p.key || String(idx);
          const pUrl = p.photo_url || p.url || p.thumbnail_url || '';
          const isCurrent = (pKey && pKey === currentPhotoKey) || (pUrl && currentPhotoUrl && currentPhotoUrl.includes(pUrl));

          return `
            <div class="studio-photo-card ${isCurrent ? 'is-current' : ''}" data-photo-key="${escapeHtml(pKey)}" data-photo-url="${escapeHtml(pUrl)}">
              <div class="studio-photo-thumb-wrap">
                <img src="${pUrl}" class="studio-photo-img" alt="Photo" loading="lazy" />
                ${isCurrent ? '<div class="studio-photo-current-badge">✓ Active</div>' : ''}
              </div>
              <div class="studio-photo-card-actions">
                ${!isCurrent ? `<button class="btn btn-secondary btn-xs btn-set-photo" title="Set as profile picture">Set Active</button>` : '<span style="font-size: 11px; color: var(--success); font-weight: 700; padding: 2px 4px;">Active</span>'}
                <button class="btn btn-danger btn-xs btn-del-photo" title="Delete from history">🗑️</button>
              </div>
            </div>
          `;
        }).join('');

        // Wire set active button
        gridEl.querySelectorAll('.btn-set-photo').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const card = btn.closest('.studio-photo-card');
            const pKey = card.getAttribute('data-photo-key');
            const pUrl = card.getAttribute('data-photo-url');
            if (!pKey) return;
            btn.disabled = true;
            btn.textContent = '...';
            const setRes = await window.powerdeckAPI.setProfilePhoto(pKey);
            if (setRes && setRes.success) {
              showAlert('success', 'Profile photo updated successfully!');
              const u = getLoggedInUser();
              u.photo_url = pUrl;
              u.photo_key = pKey;
              updateProfileStudioUI(u);
              await loadUserPhotoHistory(userId);
            } else {
              btn.disabled = false;
              btn.textContent = 'Set Active';
              showAlert('error', setRes.error || 'Failed to set profile photo');
            }
          });
        });

        // Wire delete button
        gridEl.querySelectorAll('.btn-del-photo').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const card = btn.closest('.studio-photo-card');
            const pKey = card.getAttribute('data-photo-key');
            if (!pKey) return;
            if (!confirm('Remove this photo from your history?')) return;
            btn.disabled = true;
            const delRes = await window.powerdeckAPI.removePhoto(pKey);
            if (delRes && delRes.success) {
              showAlert('info', 'Photo removed from history.');
              await loadUserPhotoHistory(userId);
            } else {
              btn.disabled = false;
              showAlert('error', delRes.error || 'Failed to remove photo');
            }
          });
        });

      } else {
        gridEl.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--danger); grid-column: 1/-1;">Could not load history: ${res.error || 'Unknown error'}</div>`;
      }
    } catch (err) {
      gridEl.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--danger); grid-column: 1/-1;">Error: ${err.message}</div>`;
    }
  }

  // Profile Edit In-Place Handlers
  async function editProfileName() {
    const up = getLoggedInUser();
    const currentName = up.name || '';
    const newName = await showInputPrompt({
      title: 'Edit Full Name',
      label: 'Enter your new full name:',
      defaultValue: currentName,
      confirmText: 'Update Name'
    });
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      showAlert('error', 'Name cannot be empty.');
      return;
    }
    const res = await window.powerdeckAPI.updateName(trimmed);
    if (res && res.success) {
      showSuccessFloatPopup(`Full name updated successfully to "${trimmed}"!`);
      showAlert('success', 'Name updated successfully!');
      up.name = trimmed;
      updateProfileStudioUI(up);
      await loadAccountSettings();
    } else {
      showAlert('error', res.error || 'Failed to update name');
    }
  }

  async function editProfileAlias() {
    const up = getLoggedInUser();
    const currentAlias = up.displayname || '';
    const newAlias = await showInputPrompt({
      title: 'Display Name (Alias)',
      label: 'Enter alias / display name (shown alongside your real name):',
      defaultValue: currentAlias,
      placeholder: 'e.g. Alex (Speaker)',
      confirmText: 'Save Display Name'
    });
    if (newAlias === null) return;
    const trimmed = newAlias.trim();
    const res = await window.powerdeckAPI.updateDisplayName(trimmed);
    if (res && res.success) {
      showSuccessFloatPopup(trimmed ? `Display name alias updated to "${trimmed}"!` : 'Display name alias removed successfully!');
      showAlert('success', trimmed ? 'Display name updated!' : 'Display name removed!');
      up.displayname = trimmed;
      updateProfileStudioUI(up);
      await loadAccountSettings();
    } else {
      showAlert('error', res.error || 'Failed to update display name');
    }
  }

  async function removeProfileAlias() {
    if (!confirm('Remove your display name / alias?')) return;
    const res = await window.powerdeckAPI.updateDisplayName('');
    if (res && res.success) {
      showSuccessFloatPopup('Display name alias removed successfully!');
      showAlert('info', 'Display name removed.');
      const up = getLoggedInUser();
      up.displayname = '';
      updateProfileStudioUI(up);
      await loadAccountSettings();
    } else {
      showAlert('error', res.error || 'Failed to remove display name');
    }
  }

  async function editProfileUsername() {
    const up = getLoggedInUser();
    const currentHandle = up.username || '';
    const newHandle = await showInputPrompt({
      title: 'Edit Username',
      label: 'Enter new @username (letters, numbers, underscores):',
      defaultValue: currentHandle,
      confirmText: 'Update Handle'
    });
    if (newHandle === null) return;
    const clean = newHandle.replace(/^@/, '').trim();
    if (!clean) {
      showAlert('error', 'Username cannot be empty.');
      return;
    }
    const res = await window.powerdeckAPI.updateUsername(clean);
    if (res && res.success) {
      showSuccessFloatPopup(`Username updated successfully to @${clean}!`);
      showAlert('success', `Username updated to @${clean}!`);
      up.username = clean;
      updateProfileStudioUI(up);
      await loadAccountSettings();
    } else {
      showAlert('error', res.error || 'Failed to update username');
    }
  }

  // Profile Privacy: Toggle Follower Requests (Private Profile)
  async function togglePrivateProfile() {
    const isPrivate = Boolean(currentAccountSettings && currentAccountSettings.has_protected_profile);
    const btn = document.getElementById('btn-studio-toggle-private-profile');
    if (btn) btn.disabled = true;

    try {
      if (isPrivate) {
        setAppStatus('Disabling follower requests (making profile public)...');
        const res = await window.powerdeckAPI.disableFollowerRequests();
        if (res && res.success !== false) {
          showAlert('success', 'Profile is now Public! Follower requests disabled.');
          setAppStatus('Profile is now Public');
          if (currentAccountSettings) currentAccountSettings.has_protected_profile = false;
        } else {
          showAlert('error', res.error || 'Failed to make profile public');
        }
      } else {
        setAppStatus('Enabling follower requests (making profile private)...');
        const res = await window.powerdeckAPI.enableFollowerRequests();
        if (res && res.success !== false) {
          showAlert('success', 'Profile is now Private! Follower requests required to view your profile.');
          setAppStatus('Profile is now Private');
          if (currentAccountSettings) currentAccountSettings.has_protected_profile = true;
        } else {
          showAlert('error', res.error || 'Failed to make profile private');
        }
      }
      await loadAccountSettings();
    } catch (err) {
      showAlert('error', err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Profile Privacy: Toggle Recently Chatting (Private Conversations)
  async function togglePrivateConversations() {
    const isHidden = Boolean(currentAccountSettings && currentAccountSettings.has_private_conversations_enabled);
    const btn = document.getElementById('btn-studio-toggle-private-convos');
    if (btn) btn.disabled = true;

    try {
      if (isHidden) {
        setAppStatus('Making recently chatting visible on profile...');
        const res = await window.powerdeckAPI.disablePrivateConversations();
        if (res && res.success !== false) {
          showAlert('success', 'Recently chatting is now visible on your profile!');
          setAppStatus('Recently chatting visible');
          if (currentAccountSettings) currentAccountSettings.has_private_conversations_enabled = false;
        } else {
          showAlert('error', res.error || 'Failed to show recent conversations');
        }
      } else {
        setAppStatus('Hiding recently chatting from profile...');
        const res = await window.powerdeckAPI.enablePrivateConversations();
        if (res && res.success !== false) {
          showAlert('success', 'Recently chatting is now hidden from your profile!');
          setAppStatus('Recently chatting hidden');
          if (currentAccountSettings) currentAccountSettings.has_private_conversations_enabled = true;
        } else {
          showAlert('error', res.error || 'Failed to hide recent conversations');
        }
      }
      await loadAccountSettings();
    } catch (err) {
      showAlert('error', err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Profile: Add / Edit Email Address
  async function editProfileEmail() {
    const currentEmail = (currentAccountSettings && currentAccountSettings.email) || '';
    const newEmail = await showInputPrompt({
      title: 'Email Address',
      label: 'Enter your email address:',
      defaultValue: currentEmail,
      placeholder: 'name@example.com',
      confirmText: 'Save Email'
    });
    if (newEmail === null) return;
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes('@')) {
      showAlert('error', 'Please enter a valid email address.');
      return;
    }

    setAppStatus('Saving email address...');
    try {
      const res = await window.powerdeckAPI.addEmail(trimmed);
      if (res && res.success !== false) {
        showAlert('success', 'Email updated successfully!');
        setAppStatus('Email address updated');
        if (currentAccountSettings) currentAccountSettings.email = trimmed;
        const valEmail = document.getElementById('studio-val-email');
        if (valEmail) valEmail.textContent = trimmed;
        await loadAccountSettings();
      } else {
        showAlert('error', res.error || (res.data && res.data.error_message) || 'Failed to update email');
      }
    } catch (err) {
      showAlert('error', err.message);
    }
  }

  // Profile: Change Phone Number with OTP Verification
  async function changeProfilePhoneNumber() {
    const currentPhone = (currentAccountSettings && currentAccountSettings.phone_number) || '';
    const newPhone = await showInputPrompt({
      title: 'Change Phone Number',
      label: 'Enter new phone number (include country code, e.g. +48732078298):',
      defaultValue: currentPhone,
      placeholder: '+1234567890',
      confirmText: 'Send Verification Code'
    });
    if (newPhone === null) return;
    const cleanPhone = newPhone.trim();
    if (!cleanPhone || cleanPhone.length < 6) {
      showAlert('error', 'Please enter a valid phone number with country code.');
      return;
    }

    setAppStatus(`Sending verification code to ${cleanPhone}...`);
    try {
      const startRes = await window.powerdeckAPI.startChangePhoneNumber(cleanPhone);
      if (!startRes || startRes.success === false) {
        showAlert('error', startRes.error || (startRes.data && startRes.data.error_message) || 'Failed to request verification code');
        setAppStatus('Phone number change failed');
        return;
      }

      const sessionId = startRes.session_id || (startRes.data && startRes.data.session_id);
      const numDigits = startRes.num_digits || (startRes.data && startRes.data.num_digits) || 6;
      if (!sessionId) {
        showAlert('error', 'Could not obtain session ID from Clubhouse server.');
        return;
      }

      showAlert('info', `Verification code sent to ${cleanPhone}. Please check your phone.`);

      // Prompt for OTP
      const otpCode = await showInputPrompt({
        title: 'Verify Phone Number',
        label: `Enter the ${numDigits}-digit verification code sent to ${cleanPhone}:`,
        placeholder: '123456',
        confirmText: 'Verify & Update Phone'
      });

      if (otpCode === null) {
        setAppStatus('Phone change cancelled');
        return;
      }

      const cleanCode = otpCode.trim();
      if (!cleanCode) {
        showAlert('error', 'Verification code cannot be empty.');
        return;
      }

      setAppStatus('Verifying OTP code...');
      const verifyRes = await window.powerdeckAPI.verifyChangePhoneCode(cleanCode, sessionId);
      if (verifyRes && verifyRes.success !== false) {
        showSuccessFloatPopup(`Phone number successfully changed to ${cleanPhone}!`);
        showAlert('success', `Phone number successfully changed to ${cleanPhone}! 🎉`);
        setAppStatus(`Phone number updated to ${cleanPhone}`);
        if (currentAccountSettings) currentAccountSettings.phone_number = cleanPhone;
        const valPhone = document.getElementById('studio-val-phone');
        if (valPhone) valPhone.textContent = cleanPhone;
        await loadAccountSettings();
      } else {
        showAlert('error', verifyRes.error || (verifyRes.data && verifyRes.data.error_message) || 'Invalid verification code or session expired.');
        setAppStatus('Phone verification failed');
      }
    } catch (err) {
      showAlert('error', err.message);
      setAppStatus(`Phone error: ${err.message}`);
    }
  }

  function openBioEditModal() {
    const modal = document.getElementById('modal-bio-edit');
    const textarea = document.getElementById('bio-edit-textarea');
    const countEl = document.getElementById('bio-char-count');
    if (!modal || !textarea) return;

    const up = getLoggedInUser();
    textarea.value = up.bio || '';
    if (countEl) countEl.textContent = `${textarea.value.length} / 2500 characters`;

    modal.style.display = 'flex';
    bringModalToFront(modal);
    modal.scrollTop = 0;
    setTimeout(() => textarea.focus(), 50);
  }

  async function saveBioEdit() {
    const modal = document.getElementById('modal-bio-edit');
    const textarea = document.getElementById('bio-edit-textarea');
    const btnSave = document.getElementById('btn-save-bio-edit');
    if (!textarea) return;

    const newBio = textarea.value;
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = 'Saving...';
    }

    try {
      const res = await window.powerdeckAPI.updateBio(newBio);
      if (res && res.success) {
        showAlert('success', 'Biography updated successfully!');
        if (modal) modal.style.display = 'none';
        const up = getLoggedInUser();
        up.bio = newBio;
        updateProfileStudioUI(up);
      } else {
        showAlert('error', res.error || 'Failed to update bio');
      }
    } catch (err) {
      showAlert('error', `Error updating bio: ${err.message}`);
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.textContent = '💾 Update Bio';
      }
    }
  }

  // ============================================================
  // PING SUGGESTED SPEAKERS & FOLLOWERS (/api/get_suggested_speakers & /api/invite_to_existing_channel)
  // ============================================================
  let cachedSuggestedSpeakers = [];
  let alreadyPingedUserIds = new Set();
  let isBatchPinging = false;
  let cancelBatchPing = false;

  function openPingModal() {
    const channelId = currentActiveRoom?.channel || currentActiveRoom?.id;
    if (!channelId) {
      showAlert('warning', 'Please join or select a live room first to ping people.');
      return;
    }

    const modal = document.getElementById('modal-ping-speakers');
    if (!modal) return;
    modal.style.display = 'flex';
    bringModalToFront(modal);
    modal.scrollTop = 0;

    const searchInput = document.getElementById('ping-search-input');
    if (searchInput) searchInput.value = '';

    const rateBanner = document.getElementById('ping-rate-limit-banner');
    if (rateBanner) rateBanner.style.display = 'none';

    const progContainer = document.getElementById('ping-progress-container');
    if (progContainer) progContainer.style.display = 'none';

    loadSuggestedSpeakers(channelId);
  }

  function closePingModal() {
    const modal = document.getElementById('modal-ping-speakers');
    if (modal) modal.style.display = 'none';
  }

  async function loadSuggestedSpeakers(channelId) {
    const listEl = document.getElementById('ping-speakers-list');
    const totalCountEl = document.getElementById('ping-total-count');
    const onlineCountEl = document.getElementById('ping-online-count');
    const allOnlineBadge = document.getElementById('ping-all-online-badge');

    if (listEl) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 36px 18px; color: var(--text-muted); font-size: 13px;">
          <div style="font-size: 26px; margin-bottom: 8px;">⏳</div>
          <div>Loading suggested people from Clubhouse...</div>
        </div>
      `;
    }

    try {
      const res = await window.powerdeckAPI.getSuggestedSpeakers(channelId, 5);
      console.log("[Clubhouse] get_suggested_speakers response:", res);

      const users = (res && Array.isArray(res.users)) ? res.users : [];
      cachedSuggestedSpeakers = users;

      // Filter online count (last_active_minutes === 0 or <= 15)
      const onlineUsers = users.filter(u => u.last_active_minutes === 0 || (typeof u.last_active_minutes === 'number' && u.last_active_minutes <= 15));

      if (totalCountEl) totalCountEl.textContent = users.length;
      if (onlineCountEl) onlineCountEl.textContent = onlineUsers.length;
      if (allOnlineBadge) allOnlineBadge.textContent = onlineUsers.length;

      renderPingSpeakersList(users);
    } catch (err) {
      console.error("[Clubhouse] loadSuggestedSpeakers error:", err);
      if (listEl) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 30px; color: var(--error); font-size: 13px;">
            ⚠️ Failed to load suggested speakers: ${escapeHtml(err.message)}
          </div>
        `;
      }
    }
  }

  function renderPingSpeakersList(users) {
    const listEl = document.getElementById('ping-speakers-list');
    if (!listEl) return;

    if (!Array.isArray(users) || users.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 32px 18px; color: var(--text-muted); font-size: 13px;">
          <div style="font-size: 24px; margin-bottom: 6px;">👥</div>
          <div>No suggested people found for this channel right now.</div>
        </div>
      `;
      return;
    }

    const channelId = currentActiveRoom?.channel || currentActiveRoom?.id;

    listEl.innerHTML = users.map(u => {
      const uId = String(u.user_id || u.id || '');
      const name = u.name || 'User';
      const username = u.username ? `@${u.username}` : '';
      const photo = u.photo_url || '';
      const bio = u.bio ? u.bio.replace(/[\r\n]+/g, ' ') : '';
      const initial = (name.charAt(0) || 'U').toUpperCase();

      const isOnline = (u.last_active_minutes === 0 || (typeof u.last_active_minutes === 'number' && u.last_active_minutes <= 15));
      const onlineDot = isOnline ? `<span class="ping-online-dot" title="Active now"></span>` : '';

      let activeBadgeHtml = '';
      if (u.last_active_minutes === 0) {
        activeBadgeHtml = `<span class="ping-active-badge active-now">🟢 Active now</span>`;
      } else if (typeof u.last_active_minutes === 'number') {
        if (u.last_active_minutes < 60) {
          activeBadgeHtml = `<span class="ping-active-badge">Active ${u.last_active_minutes}m ago</span>`;
        } else {
          activeBadgeHtml = `<span class="ping-active-badge">Active ${Math.round(u.last_active_minutes / 60)}h ago</span>`;
        }
      }

      const isPinged = alreadyPingedUserIds.has(uId);
      const pingBtnHtml = isPinged
        ? `<button class="btn btn-secondary btn-xs btn-ping-user pinged" disabled data-user-id="${uId}">✓ Pinged</button>`
        : `<button class="btn btn-primary btn-xs btn-ping-user" data-user-id="${uId}">🔔 Ping</button>`;

      const photoHtml = photo
        ? `<img src="${photo}" class="ping-user-avatar" alt="${escapeHtml(name)}" onerror="this.onerror=null;const d=document.createElement('div');d.className='ping-user-avatar avatar-fallback-circ';d.textContent='${initial}';this.replaceWith(d);">`
        : `<div class="ping-user-avatar avatar-fallback-circ">${initial}</div>`;

      return `
        <div class="ping-user-card" data-user-id="${uId}">
          <div class="ping-user-avatar-wrap" data-user-id="${uId}" title="Click to view @${escapeHtml(u.username || '')}'s profile">
            ${photoHtml}
            ${onlineDot}
          </div>
          <div class="ping-user-info">
            <div class="ping-user-name-row">
              <span class="ping-user-name" data-user-id="${uId}" title="Click to view profile">${escapeHtml(name)}</span>
              ${activeBadgeHtml}
            </div>
            <div class="ping-user-handle">${escapeHtml(username)}</div>
            ${bio ? `<div class="ping-user-bio">${escapeHtml(bio)}</div>` : ''}
          </div>
          ${pingBtnHtml}
        </div>
      `;
    }).join('');

    // Attach individual Ping button events
    listEl.querySelectorAll('.btn-ping-user:not(.pinged)').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uId = btn.getAttribute('data-user-id');
        const user = users.find(u => String(u.user_id || u.id) === String(uId));
        if (user && channelId) {
          await pingSingleUser(channelId, user, btn);
        }
      });
    });

    // Attach profile click events (avatar and name)
    listEl.querySelectorAll('.ping-user-avatar-wrap, .ping-user-name').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const uId = el.getAttribute('data-user-id');
        if (uId && typeof openUserProfileModal === 'function') {
          openUserProfileModal(uId);
        }
      });
    });
  }

  // Ping Single User via /api/invite_to_existing_channel
  async function pingSingleUser(channelId, user, buttonEl = null) {
    const uId = String(user.user_id || user.id || '');
    if (!uId || !channelId) return;

    if (buttonEl) {
      buttonEl.textContent = '⏳ Pinging...';
      buttonEl.disabled = true;
    }

    try {
      const res = await window.powerdeckAPI.inviteToExistingChannel(channelId, uId);
      console.log(`[Clubhouse] invite_to_existing_channel user=${uId} response:`, res);

      const is429 = res && (res.status === 429 || res.isRateLimited || (res.error && res.error.includes('429')));
      if (is429) {
        showAlert('warning', `Rate limit 429: Clubhouse cooldown active. Please wait a moment before pinging ${user.name}.`);
        if (buttonEl) {
          buttonEl.textContent = '⏳ Rate Limited';
          buttonEl.disabled = false;
        }
        return false;
      }

      if (res && res.success !== false) {
        alreadyPingedUserIds.add(uId);
        if (buttonEl) {
          buttonEl.textContent = '✓ Pinged';
          buttonEl.classList.add('pinged');
          buttonEl.disabled = true;
        }
        showAlert('success', `Pinged ${user.name || 'user'} to the channel! 🔔`);
        return true;
      } else {
        const errMsg = (res && (res.error || (res.data && (res.data.error_message || res.data.message)))) || 'Failed to ping user';
        showAlert('error', errMsg);
        if (buttonEl) {
          buttonEl.textContent = '🔔 Ping';
          buttonEl.disabled = false;
        }
        return false;
      }
    } catch (err) {
      console.error(`[Clubhouse] pingSingleUser ${uId} error:`, err);
      showAlert('error', `Ping error: ${err.message}`);
      if (buttonEl) {
        buttonEl.textContent = '🔔 Ping';
        buttonEl.disabled = false;
      }
      return false;
    }
  }

  // 60-Second Countdown Timer for Rate Limit (HTTP 429)
  function showRateLimitCountdown(seconds, remainingUsersCount) {
    return new Promise((resolve) => {
      const banner = document.getElementById('ping-rate-limit-banner');
      const timerEl = document.getElementById('ping-rate-limit-timer');
      const descEl = document.getElementById('ping-rate-limit-desc');
      if (banner) banner.style.display = 'flex';
      if (descEl) descEl.textContent = `Rate limit reached (429). Pausing for 60 seconds before continuing with remaining ${remainingUsersCount} users...`;

      let remaining = seconds;
      if (timerEl) timerEl.textContent = `${remaining}s`;

      const interval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = `${remaining}s`;
        if (remaining <= 0) {
          clearInterval(interval);
          if (banner) banner.style.display = 'none';
          resolve();
        }
      }, 1000);
    });
  }

  // Ping All Online Users with One-by-One Loop & 429 Retry
  async function pingAllOnlineUsers() {
    if (isBatchPinging) return;
    const channelId = currentActiveRoom?.channel || currentActiveRoom?.id;
    if (!channelId) {
      showAlert('warning', 'Please join a live channel first.');
      return;
    }

    // Filter online users (last_active_minutes === 0 or <= 15) who haven't been pinged yet
    const onlineUsers = cachedSuggestedSpeakers.filter(u => {
      const uId = String(u.user_id || u.id);
      const isOnline = (u.last_active_minutes === 0 || (typeof u.last_active_minutes === 'number' && u.last_active_minutes <= 15));
      return isOnline && !alreadyPingedUserIds.has(uId);
    });

    if (onlineUsers.length === 0) {
      showAlert('info', 'No un-pinged online users found to invite.');
      return;
    }

    isBatchPinging = true;
    cancelBatchPing = false;
    let successCount = 0;
    const queue = [...onlineUsers];
    const totalToPing = queue.length;

    const btnPingAll = document.getElementById('btn-ping-all-online');
    const progContainer = document.getElementById('ping-progress-container');
    const progBar = document.getElementById('ping-progress-bar');
    const progCount = document.getElementById('ping-progress-count');
    const progLabel = document.getElementById('ping-progress-label');

    if (btnPingAll) {
      btnPingAll.disabled = true;
      btnPingAll.innerHTML = `<span>⏳ Pinging (0/${totalToPing})...</span>`;
    }
    if (progContainer) progContainer.style.display = 'block';
    if (progBar) progBar.style.width = '0%';
    if (progCount) progCount.textContent = `0 / ${totalToPing}`;

    while (queue.length > 0 && !cancelBatchPing) {
      const user = queue[0];
      const uId = String(user.user_id || user.id);

      // Find user card and update its button to loading
      const userBtn = document.querySelector(`.btn-ping-user[data-user-id="${uId}"]`);
      if (userBtn) {
        userBtn.textContent = '⏳ Pinging...';
        userBtn.disabled = true;
      }

      let res;
      try {
        res = await window.powerdeckAPI.inviteToExistingChannel(channelId, uId);
      } catch (err) {
        res = { success: false, error: err.message };
      }

      // Check if Rate Limit (HTTP 429) occurred!
      const is429 = res && (
        res.status === 429 ||
        res.isRateLimited ||
        (res.error && res.error.includes('429'))
      );

      if (is429) {
        console.warn(`[Clubhouse] Rate limit 429 hit while pinging user ${uId}. Waiting 60 seconds...`);
        if (progLabel) progLabel.textContent = `Rate limited (429) • Pausing for 60s...`;
        await showRateLimitCountdown(60, queue.length);
        if (progLabel) progLabel.textContent = `Resuming invites (${successCount}/${totalToPing})...`;
        // Do not shift from queue - retry this user and remaining users!
        continue;
      }

      // Process invite result
      if (res && res.success !== false) {
        successCount++;
        alreadyPingedUserIds.add(uId);
        if (userBtn) {
          userBtn.textContent = '✓ Pinged';
          userBtn.classList.add('pinged');
          userBtn.disabled = true;
        }
      } else {
        console.warn(`[Clubhouse] Could not ping user ${uId}:`, res?.error);
        if (userBtn) {
          userBtn.textContent = '🔔 Ping';
          userBtn.disabled = false;
        }
      }

      // Pop processed user from queue
      queue.shift();

      // Update progress UI
      const percent = Math.round((successCount / totalToPing) * 100);
      if (progBar) progBar.style.width = `${percent}%`;
      if (progCount) progCount.textContent = `${successCount} / ${totalToPing}`;
      if (btnPingAll) btnPingAll.innerHTML = `<span>⏳ Pinging (${successCount}/${totalToPing})...</span>`;

      // Polite delay between individual invite API requests (600ms)
      await new Promise(r => setTimeout(r, 600));
    }

    if (progContainer) {
      setTimeout(() => { progContainer.style.display = 'none'; }, 2000);
    }
    if (btnPingAll) {
      btnPingAll.disabled = false;
      btnPingAll.innerHTML = `<span>⚡ Ping All Online Users</span><span class="badge" id="ping-all-online-badge">${Math.max(0, totalToPing - successCount)}</span>`;
    }
    isBatchPinging = false;

    // After all completed give a popup message like notifi total pinged users count success!
    showAlert('success', `🎉 Successfully pinged ${successCount} online user${successCount === 1 ? '' : 's'} to the channel!`);
  }

  // Live search inside Ping Modal
  function setupPingModalEvents() {
    const searchInput = document.getElementById('ping-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
          renderPingSpeakersList(cachedSuggestedSpeakers);
          return;
        }
        const filtered = cachedSuggestedSpeakers.filter(u => {
          const name = (u.name || '').toLowerCase();
          const uname = (u.username || '').toLowerCase();
          const bio = (u.bio || '').toLowerCase();
          return name.includes(query) || uname.includes(query) || bio.includes(query);
        });
        renderPingSpeakersList(filtered);
      });
    }

    const btnPingAll = document.getElementById('btn-ping-all-online');
    if (btnPingAll) {
      btnPingAll.addEventListener('click', (e) => {
        e.stopPropagation();
        pingAllOnlineUsers();
      });
    }

    const btnClose = document.getElementById('btn-close-ping-modal');
    const btnDismiss = document.getElementById('btn-dismiss-ping-modal');
    if (btnClose) btnClose.addEventListener('click', closePingModal);
    if (btnDismiss) btnDismiss.addEventListener('click', closePingModal);

    const modal = document.getElementById('modal-ping-speakers');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closePingModal();
      });
    }
  }

  // ============================================================
  // INTERACTIVE PHOTO CROPPER
  // ============================================================
  let cropperImage = null;
  let cropperImgX = 0;
  let cropperImgY = 0;
  let cropperScale = 1;
  let cropperMinScale = 1;
  let cropperRotation = 0;
  let cropperIsDragging = false;
  let cropperDragStartX = 0;
  let cropperDragStartY = 0;

  function openPhotoCropperModal() {
    const modal = document.getElementById('modal-photo-cropper');
    const selectArea = document.getElementById('cropper-select-area');
    const workspace = document.getElementById('cropper-workspace');
    const btnApply = document.getElementById('btn-apply-crop');
    const fileInput = document.getElementById('cropper-file-input');

    if (!modal) return;
    modal.style.display = 'flex';
    bringModalToFront(modal);
    modal.scrollTop = 0;
    if (selectArea) selectArea.style.display = 'flex';
    if (workspace) workspace.style.display = 'none';
    if (btnApply) {
      btnApply.disabled = true;
      btnApply.textContent = '✂️ Crop & Upload Profile Photo';
    }
    if (fileInput) fileInput.value = '';
  }

  function handleCropperFileSelect(file) {
    if (!file || !file.type.startsWith('image/')) {
      showAlert('error', 'Please choose a valid image file (PNG, JPG, WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        cropperImage = img;
        initCropperCanvas();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function initCropperCanvas() {
    const selectArea = document.getElementById('cropper-select-area');
    const workspace = document.getElementById('cropper-workspace');
    const btnApply = document.getElementById('btn-apply-crop');
    const canvas = document.getElementById('cropper-canvas');
    const slider = document.getElementById('cropper-zoom-slider');

    if (selectArea) selectArea.style.display = 'none';
    if (workspace) workspace.style.display = 'flex';
    if (btnApply) btnApply.disabled = false;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = cropperImage.width;
    const ih = cropperImage.height;

    // Fit image inside crop circle (radius 170, diam 340)
    const targetDiam = 340;
    cropperMinScale = Math.max(targetDiam / iw, targetDiam / ih);
    cropperScale = cropperMinScale;
    cropperRotation = 0;
    cropperImgX = cw / 2;
    cropperImgY = ch / 2;

    if (slider) {
      slider.min = cropperMinScale;
      slider.max = cropperMinScale * 3.5;
      slider.step = (cropperMinScale * 2.5) / 100;
      slider.value = cropperScale;
    }

    drawCropperCanvas();
  }

  function drawCropperCanvas() {
    const canvas = document.getElementById('cropper-canvas');
    if (!canvas || !cropperImage) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    // 1. Draw transformed image
    ctx.save();
    ctx.translate(cropperImgX, cropperImgY);
    ctx.rotate((cropperRotation * Math.PI) / 180);
    ctx.scale(cropperScale, cropperScale);
    ctx.drawImage(cropperImage, -cropperImage.width / 2, -cropperImage.height / 2);
    ctx.restore();

    // 2. Draw dark mask with circular cutout
    const cx = cw / 2;
    const cy = ch / 2;
    const r = 170; // 340px circle

    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 16, 0.72)';
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fill();

    // 3. Circular ring border
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 8;
    ctx.stroke();

    // 4. Rule-of-thirds dashed guidelines inside circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    const third = (r * 2) / 3;
    // Verticals
    ctx.beginPath();
    ctx.moveTo(cx - r + third, cy - r);
    ctx.lineTo(cx - r + third, cy + r);
    ctx.moveTo(cx - r + third * 2, cy - r);
    ctx.lineTo(cx - r + third * 2, cy + r);
    // Horizontals
    ctx.moveTo(cx - r, cy - r + third);
    ctx.lineTo(cx + r, cy - r + third);
    ctx.moveTo(cx - r, cy - r + third * 2);
    ctx.lineTo(cx + r, cy - r + third * 2);
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  function getCroppedBase64Data() {
    if (!cropperImage) return null;
    const canvas = document.getElementById('cropper-canvas');
    const cw = canvas.width;
    const ch = canvas.height;
    const cx = cw / 2;
    const cy = ch / 2;
    const r = 170;

    // Create high-res 512x512 export canvas
    const outCanvas = document.createElement('canvas');
    outCanvas.width = 512;
    outCanvas.height = 512;
    const outCtx = outCanvas.getContext('2d');

    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, 512, 512);

    // Map from canvas circle (diameter 340) to 512x512 output
    const factor = 512 / (r * 2);

    outCtx.save();
    outCtx.translate(512 / 2, 512 / 2);
    outCtx.scale(factor, factor);
    outCtx.translate(-cx, -cy);

    // Draw image exactly as positioned
    outCtx.translate(cropperImgX, cropperImgY);
    outCtx.rotate((cropperRotation * Math.PI) / 180);
    outCtx.scale(cropperScale, cropperScale);
    outCtx.drawImage(cropperImage, -cropperImage.width / 2, -cropperImage.height / 2);
    outCtx.restore();

    return outCanvas.toDataURL('image/jpeg', 0.95);
  }

  // ============================================================
  // GIPHY GIF STUDIO: EXPANDED SINGLE-PAGE SEPARATED PREVIEW CONTROLLER
  // ============================================================
  const GIPHY_API_KEY = 'omgKVj9HV95WdRo8pbPvznWw0UqLPbdf';
  let currentGiphyTab = 'all'; // 'all' | 'selected' | 'uploaded' | 'trending'
  let trendingGifsList = [];
  let uploadedGifsList = [];
  let searchGifsList = [];
  let selectedGifsList = []; // User-selected GIF items for multi-looping
  let currentGifIntervalSec = 20; // Default 20s, swipeable/scrollable: 5s, 10s, 15s, 20s, 25s, 30s, etc.
  let isGiphyLoading = false;
  let originalProfileAvatarSrc = null;
  let activeGifReactionTimer = null;
  let activeGifReactionCountdownTimer = null;
  let isGifReactionRunning = false;
  let isGifLoopActive = false;
  let gifLoopList = [];
  let gifLoopIndex = 0;
  let currentRunningGifItem = null;
  let activeGifTargetUserId = null;
  let activeGifTargetUserName = null;

  function isGifSelected(item) {
    if (!item) return false;
    const gId = extractGiphyId(item);
    return selectedGifsList.some(s => {
      const sgId = extractGiphyId(s);
      if (gId && sgId && gId === sgId) return true;
      if (item.url && s.url && item.url === s.url) return true;
      if (item.id && s.id && item.id === s.id) return true;
      if (item.fileName && s.fileName && item.fileName === s.fileName) return true;
      return false;
    });
  }

  function toggleSelectGif(item) {
    if (!item) return;
    const gId = extractGiphyId(item);
    const existsIdx = selectedGifsList.findIndex(s => {
      const sgId = extractGiphyId(s);
      if (gId && sgId && gId === sgId) return true;
      if (item.url && s.url && item.url === s.url) return true;
      if (item.id && s.id && item.id === s.id) return true;
      if (item.fileName && s.fileName && item.fileName === s.fileName) return true;
      return false;
    });

    if (existsIdx >= 0) {
      selectedGifsList.splice(existsIdx, 1);
      showAlert('info', `Deselected "${item.title || item.fileName || 'GIF'}"`);
    } else {
      selectedGifsList.push(item);
      showAlert('success', `Added to Selected Loop: "${item.title || item.fileName || 'GIF'}" (${selectedGifsList.length} total)`);
    }

    renderAllGiphySections();
  }

  function clearAllSelectedGifs() {
    selectedGifsList = [];
    renderAllGiphySections();
    showAlert('info', 'Cleared all selected GIFs from loop queue.');
  }

  function setGifReactionInterval(sec) {
    currentGifIntervalSec = Math.max(3, Math.min(120, Number(sec) || 20));
    const display = document.getElementById('giphy-interval-display');
    const badgeSec = document.getElementById('giphy-loop-badge-interval');
    if (display) display.textContent = `${currentGifIntervalSec}s`;
    if (badgeSec) badgeSec.textContent = `${currentGifIntervalSec}`;

    document.querySelectorAll('.giphy-interval-pill').forEach(pill => {
      const pSec = Number(pill.getAttribute('data-sec'));
      if (pSec === currentGifIntervalSec) {
        pill.classList.add('active');
        try { pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch (_) {}
      } else {
        pill.classList.remove('active');
      }
    });

    showAlert('info', `Loop & Reaction interval set to ${currentGifIntervalSec} seconds!`);
  }

  // Render Section 1: Selected Loop Queue Shelf
  function renderSelectedShelf() {
    const listEl = document.getElementById('giphy-selected-shelf-list');
    const emptyEl = document.getElementById('giphy-selected-empty');
    const badgeEl = document.getElementById('giphy-shelf-count-badge');

    if (badgeEl) {
      badgeEl.textContent = `${selectedGifsList.length} ${selectedGifsList.length === 1 ? 'GIF' : 'GIFs'} in Sequence`;
    }

    if (!listEl) return;

    if (selectedGifsList.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = selectedGifsList.map((item, idx) => {
      const isLoopCurrent = isGifLoopActive && gifLoopList === selectedGifsList && gifLoopIndex === idx;
      const media = item.isVideo
        ? `<video src="${item.thumbUrl || item.url}" autoplay loop muted playsinline></video>`
        : `<img src="${item.thumbUrl || item.url}" alt="${escapeHtml(item.title || '')}" />`;

      return `
        <div class="giphy-shelf-item ${isLoopCurrent ? 'is-loop-active' : ''}" data-shelf-idx="${idx}" title="${escapeHtml(item.title || '')} (Click to react)">
          ${media}
          <span class="giphy-shelf-idx-badge">#${idx + 1}</span>
          <button class="btn-shelf-remove-item" data-shelf-idx="${idx}" title="Remove from selected sequence">✕</button>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.btn-shelf-remove-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-shelf-idx'));
        if (!isNaN(idx) && selectedGifsList[idx]) {
          selectedGifsList.splice(idx, 1);
          renderAllGiphySections();
        }
      });
    });

    listEl.querySelectorAll('.giphy-shelf-item').forEach(tile => {
      tile.addEventListener('click', (e) => {
        if (e.target.closest('.btn-shelf-remove-item')) return;
        const idx = Number(tile.getAttribute('data-shelf-idx'));
        if (!isNaN(idx) && selectedGifsList[idx]) {
          gif_reaction(selectedGifsList[idx], { duration: currentGifIntervalSec });
        }
      });
    });
  }

  // Render Section 2: Uploaded GIFs & Videos
  function renderUploadedSection() {
    const gridEl = document.getElementById('giphy-uploaded-grid');
    const emptyEl = document.getElementById('giphy-uploaded-empty');
    const badgeEl = document.getElementById('giphy-uploaded-count-badge');

    if (badgeEl) {
      badgeEl.textContent = `${uploadedGifsList.length} ${uploadedGifsList.length === 1 ? 'File' : 'Files'}`;
    }

    if (!gridEl) return;

    if (uploadedGifsList.length === 0) {
      gridEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    gridEl.innerHTML = uploadedGifsList.map((item, idx) => {
      const isRunning = currentRunningGifItem && ((item.giphy_id && currentRunningGifItem.giphy_id === item.giphy_id) || currentRunningGifItem.id === item.id || currentRunningGifItem.url === item.url);
      const isSelected = isGifSelected(item);

      const mediaHtml = item.isVideo
        ? `<video src="${item.thumbUrl || item.url}" autoplay loop muted playsinline></video>`
        : `<img src="${item.thumbUrl || item.url}" alt="${escapeHtml(item.title || '')}" loading="lazy" decoding="async" />`;

      const typeBadge = item.isVideo ? '<span class="giphy-card-badge">VIDEO</span>' : '<span class="giphy-card-badge">GIF</span>';
      const delBtnHtml = `<button class="btn-del-uploaded-gif" data-filename="${escapeHtml(item.fileName || '')}" data-giphyid="${escapeHtml(item.giphy_id || item.id || '')}" title="Delete file">🗑️</button>`;

      return `
        <div class="giphy-card ${isRunning ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}" data-uploaded-idx="${idx}" title="${escapeHtml(item.title || '')}">
          <button class="btn-card-select-toggle ${isSelected ? 'is-selected' : ''}" data-uploaded-idx="${idx}" title="${isSelected ? 'Deselect from loop sequence' : 'Select for loop sequence'}">✓</button>
          ${mediaHtml}
          ${typeBadge}
          <div class="giphy-card-action-overlay">
            <span class="giphy-card-title">${escapeHtml(item.title || '')}</span>
            ${delBtnHtml}
          </div>
        </div>
      `;
    }).join('');

    gridEl.querySelectorAll('.btn-card-select-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-uploaded-idx'));
        const item = uploadedGifsList[idx];
        if (item) toggleSelectGif(item);
      });
    });

    gridEl.querySelectorAll('.giphy-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-del-uploaded-gif') || e.target.closest('.btn-card-select-toggle')) return;
        const idx = Number(card.getAttribute('data-uploaded-idx'));
        const item = uploadedGifsList[idx];
        if (item) gif_reaction(item, { duration: currentGifIntervalSec });
      });
    });

    gridEl.querySelectorAll('.btn-del-uploaded-gif').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fName = btn.getAttribute('data-filename');
        const gId = btn.getAttribute('data-giphyid') || '';
        if (!fName && !gId) return;
        const username = getLoggedInUsername();
        const res = await window.powerdeckAPI.deleteUploadedGif(username, fName, gId);
        if (res && res.success) {
          showAlert('info', `Removed ${fName || gId}`);
          selectedGifsList = selectedGifsList.filter(s => s.fileName !== fName && (!gId || s.giphy_id !== gId));
          await loadUploadedGifs();
          renderAllGiphySections();
        }
      });
    });
  }

  // Render Section 3: Trending & Search Results
  function renderTrendingSection(items) {
    const gridEl = document.getElementById('giphy-grid');
    const emptyEl = document.getElementById('giphy-empty');
    const badgeEl = document.getElementById('giphy-trending-count-badge');
    const titleEl = document.getElementById('giphy-trending-section-title');

    const searchInput = document.getElementById('giphy-search-input');
    const q = searchInput ? searchInput.value.trim() : '';

    if (titleEl) {
      titleEl.textContent = q ? `Search Results: "${q}"` : 'Trending GIFs';
    }
    if (badgeEl) {
      badgeEl.textContent = `${items ? items.length : 0} GIFs`;
    }

    if (!gridEl) return;

    if (!items || items.length === 0) {
      gridEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    gridEl.innerHTML = items.map((item, idx) => {
      const isRunning = currentRunningGifItem && ((item.giphy_id && currentRunningGifItem.giphy_id === item.giphy_id) || currentRunningGifItem.id === item.id || currentRunningGifItem.url === item.url);
      const isSelected = isGifSelected(item);

      const mediaHtml = item.isVideo
        ? `<video src="${item.thumbUrl || item.url}" autoplay loop muted playsinline></video>`
        : `<img src="${item.thumbUrl || item.url}" alt="${escapeHtml(item.title || '')}" loading="lazy" decoding="async" />`;

      const typeBadge = item.isVideo ? '<span class="giphy-card-badge">VIDEO</span>' : '<span class="giphy-card-badge">GIF</span>';

      return `
        <div class="giphy-card ${isRunning ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}" data-trending-idx="${idx}" title="${escapeHtml(item.title || '')}">
          <button class="btn-card-select-toggle ${isSelected ? 'is-selected' : ''}" data-trending-idx="${idx}" title="${isSelected ? 'Deselect from loop sequence' : 'Select for loop sequence'}">✓</button>
          ${mediaHtml}
          ${typeBadge}
          <div class="giphy-card-action-overlay">
            <span class="giphy-card-title">${escapeHtml(item.title || '')}</span>
          </div>
        </div>
      `;
    }).join('');

    gridEl.querySelectorAll('.btn-card-select-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-trending-idx'));
        const item = items[idx];
        if (item) toggleSelectGif(item);
      });
    });

    gridEl.querySelectorAll('.giphy-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-card-select-toggle')) return;
        const idx = Number(card.getAttribute('data-trending-idx'));
        const item = items[idx];
        if (item) gif_reaction(item, { duration: currentGifIntervalSec });
      });
    });
  }

  // Unified Single-Page Renderer: Updates all separated sections simultaneously
  function renderAllGiphySections() {
    // 1. Render Section 1: Selected Loop Queue
    renderSelectedShelf();

    // 2. Render Section 2: Uploaded GIFs & Videos
    renderUploadedSection();

    // 3. Render Section 3: Trending / Search GIFs
    renderTrendingSection(searchGifsList.length > 0 ? searchGifsList : trendingGifsList);

    // 4. Update Header Badges
    const selCountEl = document.getElementById('giphy-selected-count');
    const uplCountEl = document.getElementById('giphy-uploaded-count');
    const btnLoopCount = document.getElementById('btn-loop-count-text');

    if (selCountEl) selCountEl.textContent = String(selectedGifsList.length);
    if (uplCountEl) uplCountEl.textContent = String(uploadedGifsList.length);
    if (btnLoopCount) {
      btnLoopCount.textContent = selectedGifsList.length > 0
        ? String(selectedGifsList.length)
        : String(trendingGifsList.length);
    }

    // 5. Section Visibility: All-in-One Single Page View
    const secSelected = document.getElementById('section-giphy-selected');
    const secUploaded = document.getElementById('section-giphy-uploaded');
    const secTrending = document.getElementById('section-giphy-trending');

    if (secSelected) secSelected.style.display = 'flex';
    if (secUploaded) secUploaded.style.display = 'flex';
    if (secTrending) secTrending.style.display = 'flex';
  }

  async function openGiphyStudioModal() {
    const modal = document.getElementById('modal-giphy-studio');
    if (!modal) return;
    modal.style.display = 'flex';
    bringModalToFront(modal);
    modal.scrollTop = 0;

    // Refresh uploaded list
    await loadUploadedGifs();

    // Fetch trending if not yet loaded
    if (trendingGifsList.length === 0) {
      await fetchGiphyTrending();
    } else {
      renderAllGiphySections();
    }
  }

  function closeGiphyStudioModal() {
    const modal = document.getElementById('modal-giphy-studio');
    if (!modal) return;
    modal.style.display = 'none';
    activeGifTargetUserId = null;
    activeGifTargetUserName = null;
  }

  async function fetchGiphyTrending() {
    isGiphyLoading = true;
    showGiphyLoading(true);
    try {
      const url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        trendingGifsList = data.data.map(item => ({
          id: item.id,
          giphy_id: item.id,
          title: item.title || 'Trending GIF',
          url: (item.images && (item.images.downsized?.url || item.images.fixed_height?.url || item.images.original?.url)) || '',
          mp4Url: item.images?.original?.mp4 || '',
          thumbUrl: (item.images && (item.images.fixed_height_downsampled?.url || item.images.preview_gif?.url || item.images.fixed_height_small?.url || item.images.downsized?.url)) || '',
          isVideo: false,
          isUploaded: false
        })).filter(g => Boolean(g.url));
      }
    } catch (err) {
      console.warn("Giphy trending error:", err);
      showAlert('warning', 'Could not load trending GIFs from Giphy. Check internet connection.');
    } finally {
      isGiphyLoading = false;
      showGiphyLoading(false);
      renderAllGiphySections();
    }
  }

  async function searchGiphy(query) {
    if (!query || query.trim().length === 0) {
      searchGifsList = [];
      renderAllGiphySections();
      return;
    }
    const cleanQ = query.trim();
    isGiphyLoading = true;
    showGiphyLoading(true);
    try {
      const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(cleanQ)}&limit=24&rating=g`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        searchGifsList = data.data.map(item => ({
          id: item.id,
          giphy_id: item.id,
          title: item.title || cleanQ,
          url: (item.images && (item.images.downsized?.url || item.images.fixed_height?.url || item.images.original?.url)) || '',
          mp4Url: item.images?.original?.mp4 || '',
          thumbUrl: (item.images && (item.images.fixed_height_downsampled?.url || item.images.preview_gif?.url || item.images.fixed_height_small?.url || item.images.downsized?.url)) || '',
          isVideo: false,
          isUploaded: false
        })).filter(g => Boolean(g.url));
      }
    } catch (err) {
      console.warn("Giphy search error:", err);
      showAlert('warning', 'Giphy search failed.');
    } finally {
      isGiphyLoading = false;
      showGiphyLoading(false);
      renderAllGiphySections();
    }
  }

  async function loadUploadedGifs() {
    const username = getLoggedInUsername();
    try {
      const res = await window.powerdeckAPI.getUploadedGifs(username);
      if (res && res.success && Array.isArray(res.files)) {
        uploadedGifsList = res.files.map(f => ({
          id: f.id || f.giphy_id,
          giphy_id: f.giphy_id || f.id,
          fileName: f.fileName,
          title: f.originalName || f.fileName || 'Uploaded GIF',
          url: f.url || f.dataUrl,
          mp4Url: f.mp4Url || '',
          thumbUrl: f.dataUrl || f.url,
          isVideo: Boolean(f.isVideo),
          isUploaded: true
        }));
      }
    } catch (err) {
      console.warn("Error loading uploaded GIFs:", err);
    }

    renderAllGiphySections();
  }

  function showGiphyLoading(show) {
    const loadEl = document.getElementById('giphy-loading');
    const emptyEl = document.getElementById('giphy-empty');
    const gridEl = document.getElementById('giphy-grid');
    if (loadEl) loadEl.style.display = show ? 'block' : 'none';
    if (show && emptyEl) emptyEl.style.display = 'none';
    if (show && gridEl) gridEl.style.display = 'none';
    else if (gridEl) gridEl.style.display = 'grid';
  }

  // Extract Giphy ID from object, item, or URL
  function extractGiphyId(itemOrUrl) {
    if (!itemOrUrl) return '';
    if (typeof itemOrUrl === 'object') {
      if (itemOrUrl.giphy_id) return String(itemOrUrl.giphy_id);
      if (itemOrUrl.giphyId) return String(itemOrUrl.giphyId);
      if (itemOrUrl.id && typeof itemOrUrl.id === 'string' && !itemOrUrl.id.includes('/') && !itemOrUrl.id.includes('.') && itemOrUrl.id.length < 50) {
        return itemOrUrl.id;
      }
    }
    const url = typeof itemOrUrl === 'string' ? itemOrUrl : (itemOrUrl.url || itemOrUrl.dataUrl || itemOrUrl.images?.original?.url || itemOrUrl.images?.fixed_height?.url || '');
    if (!url) return '';

    // Match media*.giphy.com/media/<id>/... or i.giphy.com/media/<id>/...
    const m1 = url.match(/(?:media[0-9]*\.giphy\.com\/media\/|i\.giphy\.com\/media\/)([a-zA-Z0-9_-]+)/i);
    if (m1 && m1[1] && m1[1] !== 'media') return m1[1];

    // Match giphy.com/gifs/<slug>-<id> or giphy.com/gifs/<id>
    const m2 = url.match(/giphy\.com\/gifs\/(?:[a-zA-Z0-9_-]*-)?([a-zA-Z0-9_-]+)/i);
    if (m2 && m2[1]) return m2[1];

    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const mIdx = parts.indexOf('media');
      if (mIdx !== -1 && parts[mIdx + 1] && parts[mIdx + 1] !== 'media') {
        return parts[mIdx + 1];
      }
      const lastPart = parts.pop()?.replace(/\.[a-zA-Z0-9]+$/, '');
      if (lastPart && /^[a-zA-Z0-9_-]+$/.test(lastPart) && lastPart.length >= 6) {
        return lastPart;
      }
    } catch (_) {}

    return '';
  }

  // Core GIF Reaction function (runs for dynamic durationSec, previews in profile display picture space)
  async function gif_reaction(gifItemOrUrl, options = {}) {
    if (!gifItemOrUrl) return;

    const durationSec = Number(options.duration) || currentGifIntervalSec || 20;

    // 1. Extract GIPHY ID from URL or object
    const giphyId = extractGiphyId(gifItemOrUrl);

    let gifUrl = '';
    let isVideo = false;
    let title = 'GIF Reaction';
    let itemObj = null;

    if (typeof gifItemOrUrl === 'string') {
      gifUrl = gifItemOrUrl;
      isVideo = gifUrl.includes('video') || gifUrl.endsWith('.mp4') || gifUrl.endsWith('.webm') || gifUrl.startsWith('data:video');
      itemObj = { id: giphyId || gifUrl, giphy_id: giphyId, url: gifUrl, title: 'GIF Reaction', isVideo };
    } else if (typeof gifItemOrUrl === 'object') {
      itemObj = gifItemOrUrl;
      gifUrl = gifItemOrUrl.url || gifItemOrUrl.dataUrl || (gifItemOrUrl.images && (gifItemOrUrl.images.downsized?.url || gifItemOrUrl.images.fixed_height?.url || gifItemOrUrl.images.original?.url)) || '';
      isVideo = Boolean(gifItemOrUrl.isVideo) || (gifItemOrUrl.mimeType && gifItemOrUrl.mimeType.startsWith('video/')) || (typeof gifUrl === 'string' && (gifUrl.startsWith('data:video') || gifUrl.endsWith('.mp4')));
      title = gifItemOrUrl.title || gifItemOrUrl.originalName || gifItemOrUrl.fileName || 'GIF Reaction';
    }

    if (!gifUrl && giphyId) {
      gifUrl = `https://media.giphy.com/media/${giphyId}/giphy.gif`;
    }
    if (!gifUrl) return;
    currentRunningGifItem = itemObj;

    // Cache original profile picture to restore later
    if (!originalProfileAvatarSrc) {
      if (homeAvatar && homeAvatar.src && !homeAvatar.src.startsWith('data:image/svg')) {
        originalProfileAvatarSrc = homeAvatar.src;
      } else if (activeProfile && (activeProfile.photo_url || (activeProfile.user && activeProfile.user.photo_url))) {
        originalProfileAvatarSrc = activeProfile.photo_url || activeProfile.user.photo_url;
      }
    }

    isGifReactionRunning = true;

    const targetUid = options.targetUserId || activeGifTargetUserId || null;
    const isTargetAll = targetUid === 'ALL_USERS' || targetUid === 'ALL_SPEAKERS';
    const myId = String(getLoggedInUserId() || '');

    // 2. Preview the GIF in the round profile picture space
    if (isTargetAll) {
      if (currentActiveRoom && Array.isArray(currentActiveRoom.speakers)) {
        currentActiveRoom.speakers.forEach(spk => {
          const sId = String(spk.userId || spk.user_id || spk.id || '');
          if (sId) setUserProfileGifReaction(sId, gifUrl, durationSec, spk, isVideo);
        });
      }
    } else if (targetUid && String(targetUid) !== myId) {
      setUserProfileGifReaction(String(targetUid), gifUrl, durationSec, null, isVideo);
    } else {
      if (myId) {
        setUserProfileGifReaction(myId, gifUrl, durationSec, null, isVideo);
      }
      updateMyProfileDisplayPictureWithGif(gifUrl, isVideo);
    }

    // 3. Update active preview bar in modal
    updateGiphyActiveBar(gifUrl, title, durationSec, isVideo);

    // 4. Highlight active card in grid and shelf
    document.querySelectorAll('.giphy-card').forEach(c => c.classList.remove('is-active'));
    document.querySelectorAll('.giphy-card').forEach(card => {
      const cardGId = card.querySelector('.btn-del-uploaded-gif')?.getAttribute('data-giphyid') || '';
      if (giphyId && cardGId === giphyId) {
        card.classList.add('is-active');
      }
    });

    // 5. Reset timers
    if (activeGifReactionTimer) clearTimeout(activeGifReactionTimer);
    if (activeGifReactionCountdownTimer) clearInterval(activeGifReactionCountdownTimer);

    let remainingSec = durationSec;
    const timerTextEl = document.getElementById('giphy-active-timer-text');
    const fillEl = document.getElementById('giphy-timer-bar-fill');
    if (timerTextEl) timerTextEl.textContent = `⏱️ ${remainingSec} seconds remaining`;
    if (fillEl) fillEl.style.width = '100%';

    activeGifReactionCountdownTimer = setInterval(() => {
      remainingSec--;
      if (remainingSec >= 0) {
        if (timerTextEl) timerTextEl.textContent = `⏱️ ${remainingSec} seconds remaining`;
        if (fillEl) fillEl.style.width = `${(remainingSec / durationSec) * 100}%`;
      }
    }, 1000);

    // 6. Fire Clubhouse gif_reaction function with data: { channel: channel_id, giphy_id: giphy_id }
    if (currentActiveRoom && currentActiveRoom.channel) {
      const channelId = currentActiveRoom.channel;
      console.log(`[Renderer] Calling gif_reaction with channel: ${channelId}, giphy_id: ${giphyId || 'N/A'}`);
      if (giphyId && window.powerdeckAPI?.sendGifReaction) {
        try {
          window.powerdeckAPI.sendGifReaction(channelId, giphyId);
        } catch (apiErr) {
          console.warn('[Renderer] sendGifReaction error:', apiErr);
        }
      } else {
        if (myId && window.powerdeckAPI?.sendReaction) {
          try {
            window.powerdeckAPI.sendReaction(channelId, myId, 34);
          } catch (_) {}
        }
      }
    }

    setAppStatus(`GIF Reaction active (${durationSec}s) ${giphyId ? `[Giphy ID: ${giphyId}]` : ''}`);
    showAlert('success', `Reacting with GIF: "${title}" for ${durationSec} seconds!`);

    // 7. Dynamic duration runner timer
    activeGifReactionTimer = setTimeout(() => {
      if (activeGifReactionCountdownTimer) clearInterval(activeGifReactionCountdownTimer);
      activeGifReactionCountdownTimer = null;
      activeGifReactionTimer = null;

      if (isGifLoopActive) {
        executeNextGifInLoop();
      } else {
        stopGifReaction();
        showAlert('info', `${durationSec}-second GIF reaction finished. Profile photo restored.`);
      }
    }, durationSec * 1000);
  }

  function updateGiphyActiveBar(gifUrl, title, durationSec, isVideo) {
    const activeBar = document.getElementById('giphy-active-bar');
    const thumbImg = document.getElementById('giphy-active-thumb');
    const thumbVid = document.getElementById('giphy-active-video');
    const titleEl = document.getElementById('giphy-active-title');

    if (activeBar) activeBar.style.display = 'flex';
    const targetText = activeGifTargetUserName ? ` to ${activeGifTargetUserName}` : '';
    if (titleEl) titleEl.textContent = `Reacting${targetText}: ${title}`;

    if (isVideo) {
      if (thumbImg) thumbImg.style.display = 'none';
      if (thumbVid) {
        thumbVid.src = gifUrl;
        thumbVid.style.display = 'block';
      }
    } else {
      if (thumbVid) thumbVid.style.display = 'none';
      if (thumbImg) {
        thumbImg.src = gifUrl;
        thumbImg.style.display = 'block';
      }
    }
  }

  function updateMyProfileDisplayPictureWithGif(gifUrl, isVideo) {
    if (homeAvatar) {
      homeAvatar.src = gifUrl;
      homeAvatar.style.display = 'block';
    }
    if (homeAvatarFallback) homeAvatarFallback.style.display = 'none';

    const myId = getLoggedInUserId();
    const selfTiles = document.querySelectorAll(`.speaker-tile.is-self, .listener-tile.is-self, #channel-speakers-grid .speaker-tile[data-user-id="${myId}"], #channel-listeners-grid .listener-tile[data-user-id="${myId}"]`);
    selfTiles.forEach(tile => {
      if (tile.closest('#channel-chat-panel, .room-chat-drawer, .chat-panel, .chat-message-item, .chat-msg-avatar-col, .room-chat-box')) return;
      const wrap = tile.querySelector('.speaker-avatar-wrap, .listener-avatar-wrap');
      if (wrap) {
        let halo = wrap.querySelector('.gif-reaction-halo');
        if (!halo) {
          halo = document.createElement('div');
          halo.className = 'gif-reaction-halo';
          wrap.appendChild(halo);
        }

        if (isVideo) {
          let vid = wrap.querySelector('.gif-avatar-video');
          if (!vid) {
            vid = document.createElement('video');
            vid.className = 'speaker-tile-avatar gif-avatar-video';
            vid.autoplay = true;
            vid.loop = true;
            vid.muted = true;
            vid.playsInline = true;
            wrap.appendChild(vid);
          }
          vid.src = gifUrl;
          vid.style.display = 'block';
          const img = wrap.querySelector('img.speaker-tile-avatar, img.listener-tile-avatar');
          if (img) img.style.display = 'none';
        } else {
          const img = wrap.querySelector('img.speaker-tile-avatar, img.listener-tile-avatar');
          if (img) {
            img.src = gifUrl;
            img.style.display = 'block';
          }
          const vid = wrap.querySelector('.gif-avatar-video');
          if (vid) vid.style.display = 'none';
        }
      }
    });
  }

  function restoreOriginalProfileDisplayPicture() {
    if (originalProfileAvatarSrc && homeAvatar) {
      homeAvatar.src = originalProfileAvatarSrc;
      homeAvatar.style.display = 'block';
      if (homeAvatarFallback) homeAvatarFallback.style.display = 'none';
    }

    const myId = getLoggedInUserId();
    const selfTiles = document.querySelectorAll(`.speaker-tile.is-self, .listener-tile.is-self, #channel-speakers-grid .speaker-tile[data-user-id="${myId}"], #channel-listeners-grid .listener-tile[data-user-id="${myId}"]`);
    selfTiles.forEach(tile => {
      if (tile.closest('#channel-chat-panel, .room-chat-drawer, .chat-panel, .chat-message-item, .chat-msg-avatar-col, .room-chat-box')) return;
      const wrap = tile.querySelector('.speaker-avatar-wrap, .listener-avatar-wrap');
      if (wrap) {
        const halo = wrap.querySelector('.gif-reaction-halo');
        if (halo) halo.remove();

        const vid = wrap.querySelector('.gif-avatar-video');
        if (vid) {
          vid.style.display = 'none';
          vid.src = '';
        }

        const img = wrap.querySelector('img.speaker-tile-avatar, img.listener-tile-avatar');
        if (img) {
          if (originalProfileAvatarSrc) img.src = originalProfileAvatarSrc;
          img.style.display = 'block';
        }
      }
    });
  }

  function stopGifReaction() {
    if (activeGifReactionTimer) clearTimeout(activeGifReactionTimer);
    if (activeGifReactionCountdownTimer) clearInterval(activeGifReactionCountdownTimer);
    activeGifReactionTimer = null;
    activeGifReactionCountdownTimer = null;
    isGifReactionRunning = false;
    currentRunningGifItem = null;

    restoreOriginalProfileDisplayPicture();

    const myId = String(getLoggedInUserId() || '');
    if (myId) clearUserProfileGifReaction(myId);
    if (activeGifTargetUserId) {
      clearUserProfileGifReaction(activeGifTargetUserId);
      activeGifTargetUserId = null;
      activeGifTargetUserName = null;
    }

    const activeBar = document.getElementById('giphy-active-bar');
    if (activeBar) activeBar.style.display = 'none';

    document.querySelectorAll('.giphy-card').forEach(c => c.classList.remove('is-active'));
    setAppStatus('Profile photo restored');
  }

  function startGifLoop() {
    let listToLoop = [];
    if (selectedGifsList.length > 0) {
      listToLoop = [...selectedGifsList];
      showAlert('success', `Started loop with ${listToLoop.length} selected GIFs (${currentGifIntervalSec}s interval)!`);
    } else {
      listToLoop = uploadedGifsList.length > 0 ? uploadedGifsList : (searchGifsList.length > 0 ? searchGifsList : trendingGifsList);
      if (!listToLoop || listToLoop.length === 0) {
        showAlert('warning', 'No GIFs available to loop. Select some GIFs or load trending first.');
        return;
      }
      showAlert('info', `No specific GIFs selected; looping ${listToLoop.length} GIFs (${currentGifIntervalSec}s interval).`);
    }

    gifLoopList = listToLoop;
    gifLoopIndex = 0;
    isGifLoopActive = true;

    const loopBtn = document.getElementById('btn-giphy-loop-toggle');
    const loopBadge = document.getElementById('giphy-loop-badge');
    if (loopBtn) {
      loopBtn.textContent = '⏹️ Stop Loop';
      loopBtn.className = 'btn btn-danger btn-xs';
    }
    if (loopBadge) {
      const badgeSec = document.getElementById('giphy-loop-badge-interval');
      if (badgeSec) badgeSec.textContent = String(currentGifIntervalSec);
      loopBadge.style.display = 'inline-flex';
    }

    renderAllGiphySections();
    gif_reaction(gifLoopList[gifLoopIndex], { isLoop: true, duration: currentGifIntervalSec });
  }

  function stopGifLoop() {
    isGifLoopActive = false;
    stopGifReaction();

    const loopBtn = document.getElementById('btn-giphy-loop-toggle');
    const loopBadge = document.getElementById('giphy-loop-badge');
    if (loopBtn) {
      const cnt = selectedGifsList.length > 0 ? selectedGifsList.length : 0;
      loopBtn.innerHTML = `🔁 Start Loop (<span id="btn-loop-count-text">${cnt}</span>)`;
      loopBtn.className = 'btn btn-highlight btn-xs';
    }
    if (loopBadge) loopBadge.style.display = 'none';

    renderAllGiphySections();
    showAlert('info', 'GIF loop stopped. Profile photo restored.');
  }

  function executeNextGifInLoop() {
    if (!isGifLoopActive || !gifLoopList || gifLoopList.length === 0) {
      stopGifLoop();
      return;
    }
    gifLoopIndex = (gifLoopIndex + 1) % gifLoopList.length;
    renderAllGiphySections();
    gif_reaction(gifLoopList[gifLoopIndex], { isLoop: true, duration: currentGifIntervalSec });
  }

  let giphyUploadProgressInterval = null;

  function showGiphyUploadLoading(file, isVideo) {
    const overlay = document.getElementById('giphy-upload-overlay');
    const titleEl = document.getElementById('giphy-upload-loading-title');
    const pillEl = document.getElementById('giphy-upload-filename-pill');
    const descEl = document.getElementById('giphy-upload-loading-desc');
    const iconEl = document.getElementById('giphy-upload-center-icon');
    const statusTextEl = document.getElementById('giphy-upload-status-text');
    const progressBar = document.getElementById('giphy-upload-progress-bar');

    const fileName = (file && file.name) || (isVideo ? 'video.mp4' : 'animation.gif');
    const sizeStr = (file && file.size) ? ` (${(file.size / (1024 * 1024)).toFixed(1)} MB)` : '';

    if (titleEl) {
      titleEl.textContent = isVideo ? 'Processing & Uploading Video...' : 'Uploading GIF Reaction...';
    }
    if (iconEl) {
      iconEl.textContent = isVideo ? '🎬' : '✨';
    }
    if (pillEl) {
      pillEl.textContent = `${fileName}${sizeStr}`;
    }
    if (descEl) {
      descEl.textContent = isVideo
        ? 'Optimizing video stream for high-definition stage preview...'
        : 'Registering animation frames for profile display stream...';
    }
    if (statusTextEl) {
      const username = getLoggedInUsername();
      statusTextEl.textContent = `Saving to @${username || 'user'} reaction library...`;
    }

    if (progressBar) {
      progressBar.style.width = '15%';
    }

    if (overlay) {
      overlay.style.display = 'flex';
    }

    // Dynamic animated progress bar stages
    if (giphyUploadProgressInterval) clearInterval(giphyUploadProgressInterval);
    let curPercent = 15;
    const stages = [
      { p: 35, text: 'Analyzing frames & dimensions...' },
      { p: 60, text: 'Compressing and optimizing stream...' },
      { p: 85, text: `Encoding into @${getLoggedInUsername() || 'user'} collection...` },
      { p: 95, text: 'Finalizing upload & generating preview...' }
    ];
    let stageIdx = 0;
    giphyUploadProgressInterval = setInterval(() => {
      if (stageIdx < stages.length) {
        const target = stages[stageIdx];
        if (curPercent < target.p) {
          curPercent += 5;
          if (progressBar) progressBar.style.width = `${curPercent}%`;
        } else {
          if (statusTextEl) statusTextEl.textContent = target.text;
          stageIdx++;
        }
      }
    }, 120);

    // Update upload action buttons to show rounded spinner
    const btnUpload = document.getElementById('btn-giphy-upload');
    const btnSectionUpload = document.getElementById('btn-section-upload');
    if (btnUpload) {
      btnUpload.disabled = true;
      btnUpload.dataset.origHtml = btnUpload.innerHTML;
      btnUpload.innerHTML = '<span class="inline-rounded-spinner"></span> Uploading...';
    }
    if (btnSectionUpload) {
      btnSectionUpload.disabled = true;
      btnSectionUpload.dataset.origHtml = btnSectionUpload.innerHTML;
      btnSectionUpload.innerHTML = '<span class="inline-rounded-spinner"></span> Uploading...';
    }

    // Prepend placeholder card in uploaded collection
    const grid = document.getElementById('giphy-uploaded-grid');
    if (grid) {
      let placeholder = document.getElementById('giphy-uploading-placeholder-card');
      if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.id = 'giphy-uploading-placeholder-card';
        placeholder.className = 'giphy-item-card is-uploading-card';
        placeholder.innerHTML = `
          <div class="giphy-uploading-placeholder-inner">
            <div class="giphy-upload-mini-spinner"></div>
            <span class="giphy-upload-mini-text">${isVideo ? 'Uploading Video...' : 'Uploading...'}</span>
          </div>
        `;
        grid.prepend(placeholder);
      }
    }
  }

  function hideGiphyUploadLoading() {
    if (giphyUploadProgressInterval) {
      clearInterval(giphyUploadProgressInterval);
      giphyUploadProgressInterval = null;
    }
    const progressBar = document.getElementById('giphy-upload-progress-bar');
    if (progressBar) progressBar.style.width = '100%';

    setTimeout(() => {
      const overlay = document.getElementById('giphy-upload-overlay');
      if (overlay) {
        overlay.style.display = 'none';
      }

      // Restore buttons
      const btnUpload = document.getElementById('btn-giphy-upload');
      const btnSectionUpload = document.getElementById('btn-section-upload');
      if (btnUpload) {
        btnUpload.disabled = false;
        if (btnUpload.dataset.origHtml) {
          btnUpload.innerHTML = btnUpload.dataset.origHtml;
        } else {
          btnUpload.innerHTML = '📤 Upload';
        }
      }
      if (btnSectionUpload) {
        btnSectionUpload.disabled = false;
        if (btnSectionUpload.dataset.origHtml) {
          btnSectionUpload.innerHTML = btnSectionUpload.dataset.origHtml;
        } else {
          btnSectionUpload.innerHTML = '📤 Upload GIF / Video';
        }
      }

      // Remove placeholder card
      const placeholder = document.getElementById('giphy-uploading-placeholder-card');
      if (placeholder) {
        placeholder.remove();
      }
    }, 350);
  }

  async function handleGiphyUploadFile(file) {
    if (!file) return;
    const isVideo = (file.type && file.type.startsWith('video/')) || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name);
    const username = getLoggedInUsername();

    showGiphyUploadLoading(file, isVideo);
    showAlert('info', `Uploading ${file.name} to reaction library...`);

    const uploadStartTime = Date.now();
    const reader = new FileReader();
    reader.onerror = () => {
      hideGiphyUploadLoading();
      showAlert('error', 'Could not read selected file from computer.');
    };

    reader.onload = async (e) => {
      const base64Data = e.target.result;
      try {
        const res = await window.powerdeckAPI.saveUploadedGif(username, file.name, base64Data, file.type);
        // Ensure smooth visible animation for at least 1.2s
        const elapsed = Date.now() - uploadStartTime;
        if (elapsed < 1200) {
          await new Promise(r => setTimeout(r, 1200 - elapsed));
        }

        if (res && res.success && res.file) {
          const gId = res.file.giphy_id || res.file.id || '';
          showAlert('success', `✓ Uploaded to reaction library! (ID: ${gId})`);
          await loadUploadedGifs();
          // Preview and react immediately!
          gif_reaction(res.file, { duration: currentGifIntervalSec });
        } else {
          showAlert('error', (res && res.error) || 'Failed to upload media');
        }
      } catch (err) {
        showAlert('error', `Upload error: ${err.message}`);
      } finally {
        hideGiphyUploadLoading();
      }
    };
    reader.readAsDataURL(file);
  }

  function setupGiphyStudioEvents() {
    const btnDockGif = document.getElementById('btn-dock-gif');
    if (btnDockGif) {
      btnDockGif.addEventListener('click', (e) => {
        e.stopPropagation();
        openGiphyStudioModal();
      });
    }

    const btnTopGiphy = document.getElementById('btn-top-giphy');
    if (btnTopGiphy) {
      btnTopGiphy.addEventListener('click', () => {
        openGiphyStudioModal();
      });
    }

    const btnCloseGiphy = document.getElementById('btn-close-giphy-studio');
    const btnDismissGiphy = document.getElementById('btn-dismiss-giphy-studio');
    if (btnCloseGiphy) btnCloseGiphy.addEventListener('click', closeGiphyStudioModal);
    if (btnDismissGiphy) btnDismissGiphy.addEventListener('click', closeGiphyStudioModal);

    // Quick Filter Tabs
    // Quick Filter Tabs (Safely guarded for All-in-One single page view)
    const tabAll = document.getElementById('tab-giphy-all');
    const tabSelected = document.getElementById('tab-giphy-selected');
    const tabUploaded = document.getElementById('tab-giphy-uploaded');
    const tabTrending = document.getElementById('tab-giphy-trending');

    const filterTabs = [tabAll, tabSelected, tabUploaded, tabTrending].filter(Boolean);

    function activateTab(activeEl, tabName) {
      currentGiphyTab = tabName;
      filterTabs.forEach(t => t.classList.remove('active'));
      if (activeEl) activeEl.classList.add('active');
      renderAllGiphySections();
    }

    if (tabAll) tabAll.addEventListener('click', () => activateTab(tabAll, 'all'));
    if (tabSelected) tabSelected.addEventListener('click', () => activateTab(tabSelected, 'selected'));
    if (tabUploaded) tabUploaded.addEventListener('click', () => activateTab(tabUploaded, 'uploaded'));
    if (tabTrending) tabTrending.addEventListener('click', () => activateTab(tabTrending, 'trending'));

    // Clear Selected Shelf button
    const btnClearShelf = document.getElementById('btn-clear-selected-shelf');
    if (btnClearShelf) {
      btnClearShelf.addEventListener('click', () => {
        clearAllSelectedGifs();
      });
    }

    // Interval Pills Click Listeners
    document.querySelectorAll('.giphy-interval-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const sec = Number(pill.getAttribute('data-sec')) || 20;
        setGifReactionInterval(sec);
      });
    });

    // Horizontal Mouse Wheel / Swipe Listener on Interval Pills
    const pillsContainer = document.getElementById('giphy-interval-pills');
    if (pillsContainer) {
      pillsContainer.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          pillsContainer.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }

    // Reload Trending Button
    const btnRefreshTrending = document.getElementById('btn-refresh-trending');
    if (btnRefreshTrending) {
      btnRefreshTrending.addEventListener('click', async () => {
        const searchInput = document.getElementById('giphy-search-input');
        if (searchInput) searchInput.value = '';
        const btnClearSearch = document.getElementById('btn-clear-giphy-search');
        if (btnClearSearch) btnClearSearch.style.display = 'none';
        searchGifsList = [];
        await fetchGiphyTrending();
      });
    }

    // Search Input and Buttons
    const searchInput = document.getElementById('giphy-search-input');
    const btnSearch = document.getElementById('btn-giphy-search');
    const btnClearSearch = document.getElementById('btn-clear-giphy-search');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (btnClearSearch) btnClearSearch.style.display = val ? 'block' : 'none';
        if (val.length === 0) {
          searchGifsList = [];
          renderTrendingSection(trendingGifsList);
        }
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = searchInput.value.trim();
          searchGiphy(val);
        }
      });
    }
    if (btnSearch) {
      btnSearch.addEventListener('click', () => {
        const val = searchInput ? searchInput.value.trim() : '';
        searchGiphy(val);
      });
    }
    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        btnClearSearch.style.display = 'none';
        searchGifsList = [];
        renderTrendingSection(trendingGifsList);
      });
    }

    // Upload Buttons
    const btnUpload = document.getElementById('btn-giphy-upload');
    const btnSectionUpload = document.getElementById('btn-section-upload');
    const fileUploadInput = document.getElementById('giphy-file-upload-input');

    if (btnUpload && fileUploadInput) {
      btnUpload.addEventListener('click', () => {
        fileUploadInput.click();
      });
    }
    if (btnSectionUpload && fileUploadInput) {
      btnSectionUpload.addEventListener('click', () => {
        fileUploadInput.click();
      });
    }
    if (fileUploadInput) {
      fileUploadInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          handleGiphyUploadFile(file);
          fileUploadInput.value = '';
        }
      });
    }

    // Loop Toggle Button
    const btnLoopToggle = document.getElementById('btn-giphy-loop-toggle');
    if (btnLoopToggle) {
      btnLoopToggle.addEventListener('click', () => {
        if (isGifLoopActive) {
          stopGifLoop();
        } else {
          startGifLoop();
        }
      });
    }

    // Stop Active Reaction Button in Active Bar
    const btnStopActive = document.getElementById('btn-giphy-stop-active');
    if (btnStopActive) {
      btnStopActive.addEventListener('click', () => {
        if (isGifLoopActive) {
          stopGifLoop();
        } else {
          stopGifReaction();
        }
      });
    }
  }

  // ============================================================
  // MODERATOR ACTION HISTORY ENGINE
  // ============================================================
  let currentModHistoryChannel = null;
  let currentModHistoryCursor = null;
  let isLoadingModHistory = false;

  function logSessionModAction(type, actor, target, desc) {
    const actorObj = (typeof actor === 'object' && actor) ? actor : { name: String(actor || 'Moderator') };
    const targetObj = (typeof target === 'object' && target) ? target : (target ? { name: String(target) } : null);
    logRoomActivity({
      type: type,
      title: 'Moderator Action',
      icon: '🛡️',
      actor_id: actorObj.user_id || actorObj.id || null,
      actor_name: actorObj.name || actorObj.displayname || 'Moderator',
      actor_photo: actorObj.photo_url || null,
      target_id: targetObj ? (targetObj.user_id || targetObj.id || null) : null,
      target_name: targetObj ? (targetObj.name || targetObj.displayname || '') : '',
      target_photo: targetObj ? (targetObj.photo_url || null) : null,
      detail: desc || `${type} action executed`,
      timestamp: Date.now()
    });
  }

  async function openModeratorHistoryModal(channelId) {
    const modal = document.getElementById('modal-moderator-history');
    if (!modal) return;

    currentModHistoryChannel = channelId || (currentActiveRoom && (currentActiveRoom.channel || currentActiveRoom.channel_id || currentActiveRoom.id));
    if (!currentModHistoryChannel && liveRooms.length > 0) {
      currentModHistoryChannel = liveRooms[0].channel || liveRooms[0].id;
    }
    if (!currentModHistoryChannel) {
      showAlert('info', 'Join or select a room to view moderator action history.');
      return;
    }

    const channelBadge = document.getElementById('mod-history-channel-badge');
    if (channelBadge) {
      channelBadge.textContent = (currentActiveRoom && (currentActiveRoom.title || currentActiveRoom.channel)) || currentModHistoryChannel;
    }

    modal.style.display = 'flex';
    bringModalToFront(modal);
    modal.scrollTop = 0;
    currentModHistoryCursor = null;
    await loadModeratorHistory(false);
  }

  function closeModeratorHistoryModal() {
    const modal = document.getElementById('modal-moderator-history');
    if (modal) modal.style.display = 'none';
  }

  function formatModActionDetails(item) {
    const rawType = item.action_type || item.action_code || item.action;
    const actionCode = Number(rawType);
    let icon = '📝';
    let title = 'Moderator Action';
    let badgeColor = '#6366f1';

    if (actionCode === 200) {
      icon = '🎙️';
      title = 'Invited Speaker';
      badgeColor = '#10b981';
    } else if (actionCode === 210) {
      icon = '✅';
      title = 'Approved Speaker';
      badgeColor = '#10b981';
    } else if (actionCode === 220) {
      icon = '👥';
      title = 'Moved to Audience';
      badgeColor = '#64748b';
    } else if (actionCode === 230) {
      icon = '🔇';
      title = 'Muted Speaker';
      badgeColor = '#f59e0b';
    } else if (actionCode === 300) {
      icon = '⭐';
      title = 'Made Moderator';
      badgeColor = '#eab308';
    } else if (actionCode === 700) {
      icon = '🚫';
      title = 'Removed from Room';
      badgeColor = '#ef4444';
    } else {
      const actionStr = String(item.action || item.action_type || item.type || item.event || '').toLowerCase();
      if (actionStr.includes('invite_speaker') || actionStr.includes('invited_to_speak') || actionStr.includes('become_speaker')) {
        icon = '🎙️';
        title = 'Invited Speaker';
        badgeColor = '#10b981';
      } else if (actionStr.includes('approved') || actionStr.includes('accept')) {
        icon = '✅';
        title = 'Approved Speaker';
        badgeColor = '#10b981';
      } else if (actionStr.includes('make_mod') || actionStr.includes('moderator')) {
        icon = '⭐';
        title = 'Made Moderator';
        badgeColor = '#eab308';
      } else if (actionStr.includes('uninvite') || actionStr.includes('audience') || actionStr.includes('move_to_audience')) {
        icon = '👥';
        title = 'Moved to Audience';
        badgeColor = '#64748b';
      } else if (actionStr.includes('mute')) {
        icon = '🔇';
        title = 'Muted Speaker';
        badgeColor = '#f59e0b';
      } else if (actionStr.includes('remove') || actionStr.includes('block') || actionStr.includes('kick')) {
        icon = '🚫';
        title = 'Removed from Room';
        badgeColor = '#ef4444';
      } else if (actionStr.includes('title') || actionStr.includes('topic') || actionStr.includes('banner')) {
        icon = '✏️';
        title = 'Changed Topic';
        badgeColor = '#3b82f6';
      } else if (actionStr.includes('link')) {
        icon = '🔗';
        title = 'Pinned Room Link';
        badgeColor = '#8b5cf6';
      } else if (actionStr.includes('chat') || actionStr.includes('message_settings')) {
        icon = '💬';
        title = 'Chat Settings';
        badgeColor = '#06b6d4';
      } else if (actionStr.includes('delete_channel_message') || actionStr.includes('delete_message')) {
        icon = '🗑️';
        title = 'Deleted Message';
        badgeColor = '#f43f5e';
      } else if (actionStr.includes('hand') || actionStr.includes('raise')) {
        icon = '✋';
        title = 'Handraise Settings';
        badgeColor = '#ec4899';
      }
    }

    return { icon, title, badgeColor };
  }

  function getModActionFullText(item, actorName, targetName) {
    if (item.title) {
      return item.title;
    }
    const act = (item.action || item.action_type || item.type || item.event || '').toLowerCase();
    if (item.description && item.description.length > 5) {
      return item.description;
    }
    if (item.full_message || item.message || item.text) {
      return item.full_message || item.message || item.text;
    }
    if (act.includes('invite_speaker') || act.includes('invited_to_speak') || act.includes('become_speaker')) {
      return targetName ? `${actorName} invited ${targetName} to speak in channel.` : `${actorName} invited a member to speak in channel.`;
    }
    if (act.includes('uninvite') || act.includes('move_to_audience') || act.includes('demote')) {
      return targetName ? `${actorName} moved ${targetName} to the audience.` : `${actorName} moved a speaker to the audience.`;
    }
    if (act.includes('mute')) {
      return targetName ? `${actorName} muted ${targetName}.` : `${actorName} muted a speaker.`;
    }
    if (act.includes('make_mod') || act.includes('moderator')) {
      return targetName ? `${actorName} promoted ${targetName} to moderator.` : `${actorName} promoted member to moderator.`;
    }
    if (act.includes('remove') || act.includes('block') || act.includes('kick')) {
      return targetName ? `${actorName} removed ${targetName} from the room.` : `${actorName} removed user from the room.`;
    }
    if (act.includes('title') || act.includes('topic') || act.includes('banner')) {
      const topic = item.topic || item.title || item.new_topic || '';
      return topic ? `${actorName} changed room topic to "${topic}".` : `${actorName} updated the room topic.`;
    }
    if (act.includes('link')) {
      const link = item.url || item.link || item.display_link || '';
      return link ? `${actorName} pinned link: ${link}` : `${actorName} updated pinned room links.`;
    }
    if (act.includes('hand') || act.includes('raise')) {
      const isHr = item.is_handraise_enabled !== false;
      return `${actorName} ${isHr ? 'enabled' : 'disabled'} hand raising.`;
    }
    if (act.includes('delete_channel_message') || act.includes('delete_message') || act.includes('message_delete')) {
      const msg = item.message_body || item.message_text || item.text || '';
      return msg ? `${actorName} deleted message: "${msg}"` : `${actorName} deleted a channel message.`;
    }
    if (act.includes('chat')) {
      return `${actorName} updated channel chat settings.`;
    }
    return item.description || item.note || `${actorName} performed moderator action.`;
  }

  function renderModActionItem(item, idx) {
    const meta = formatModActionDetails(item);
    const actor = item.actor_user || item.actor_user_profile || item.actor || item.user_profile || item.user || {};
    const target = item.target_user || item.target_user_profile || item.target || {};

    const actorId = actor.user_id || actor.id || item.action_user_id || item.user_id || '';
    const targetId = target.user_id || target.id || item.target_user_id || '';

    let actorName = actor.name || actor.first_name || actor.displayname || '';
    if (!actorName && actorId && profileCache.has(String(actorId))) {
      actorName = profileCache.get(String(actorId)).name;
    }
    if (!actorName) actorName = 'Moderator';
    const actorPhoto = actor.photo_url || actor.photo || (actorId && profileCache.has(String(actorId)) && profileCache.get(String(actorId)).photo_url);
    const actorInitial = actorName.charAt(0).toUpperCase();

    let targetName = target.name || target.first_name || target.displayname || '';
    if (!targetName && targetId && profileCache.has(String(targetId))) {
      targetName = profileCache.get(String(targetId)).name;
    }
    const targetPhoto = target.photo_url || target.photo || (targetId && profileCache.has(String(targetId)) && profileCache.get(String(targetId)).photo_url);
    const targetInitial = targetName ? targetName.charAt(0).toUpperCase() : '';

    const timeStr = item.time_created || item.created_at || item.timestamp;
    let formattedTime = '';
    if (timeStr) {
      try {
        const d = new Date(timeStr);
        formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (_) {
        formattedTime = String(timeStr);
      }
    }

    const fullMessage = getModActionFullText(item, actorName, targetName);

    const actorChip = `
      <span class="mod-history-actor-chip" data-user-id="${actorId}" title="View ${escapeHtml(actorName)}'s profile">
        ${actorPhoto ? `<img src="${actorPhoto}" class="mod-history-actor-avatar" alt="${escapeHtml(actorName)}" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\'mod-history-actor-avatar-fallback\'>${actorInitial}</span>';">` : `<span class="mod-history-actor-avatar-fallback">${actorInitial}</span>`}
        <span class="actor-chip-text">${escapeHtml(actorName)}</span>
      </span>
    `;

    let targetChip = '';
    if (targetName || targetId) {
      const displayTarget = targetName || 'Member';
      targetChip = `
        <span class="mod-history-arrow-sep">➔</span>
        <span class="mod-history-actor-chip" data-user-id="${targetId}" title="View ${escapeHtml(displayTarget)}'s profile">
          ${targetPhoto ? `<img src="${targetPhoto}" class="mod-history-actor-avatar" alt="${escapeHtml(displayTarget)}" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\'mod-history-actor-avatar-fallback\'>${targetInitial}</span>';">` : `<span class="mod-history-actor-avatar-fallback">${targetInitial || 'M'}</span>`}
          <span class="target-chip-text">${escapeHtml(displayTarget)}</span>
        </span>
      `;
    }

    return `
      <div class="mod-history-item mod-item-${idx}" data-idx="${idx}" data-actor-id="${actorId}" data-target-id="${targetId}">
        <div class="mod-history-icon-badge" style="border-color: ${meta.badgeColor}40; background: ${meta.badgeColor}18;">
          ${meta.icon}
        </div>
        <div class="mod-history-details">
          <div class="mod-history-header-row">
            <span class="mod-history-action-title">${escapeHtml(meta.title)}</span>
            <span class="mod-history-time">${escapeHtml(formattedTime)}</span>
          </div>
          <div class="mod-history-actors-row">
            ${actorChip}
            ${targetChip}
          </div>
          <div class="mod-history-desc">${escapeHtml(fullMessage)}</div>
        </div>
      </div>
    `;
  }

  async function loadModeratorHistory(isAppend = false) {
    if (isLoadingModHistory) return;
    isLoadingModHistory = true;

    const listEl = document.getElementById('mod-history-list');
    const loadingEl = document.getElementById('mod-history-loading');
    const emptyEl = document.getElementById('mod-history-empty');
    const moreBtnContainer = document.getElementById('mod-history-load-more');
    const moreBtn = document.getElementById('btn-mod-history-more');

    if (!isAppend) {
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'none';
      if (loadingEl) loadingEl.style.display = 'flex';
      if (moreBtnContainer) moreBtnContainer.style.display = 'none';
    } else {
      if (moreBtn) {
        moreBtn.disabled = true;
        moreBtn.textContent = 'Loading earlier actions...';
      }
    }

    try {
      const res = await window.powerdeckAPI.getModeratorActionHistory(
        currentModHistoryChannel,
        50,
        currentModHistoryCursor
      );

      console.log('[Moderator History] response:', res);
      const data = (res && res.data) || res || {};
      const serverActions = Array.isArray(data.actions) ? data.actions : (Array.isArray(data.history) ? data.history : (Array.isArray(data.items) ? data.items : []));
      currentModHistoryCursor = data.next_cursor || data.cursor || null;

      // Bottom dock History button strictly displays Clubhouse official server actions from /api/get_moderator_action_history
      const actions = serverActions;

      if (!isAppend && actions.length === 0) {
        if (emptyEl) {
          const p = emptyEl.querySelector('p');
          if (p) p.textContent = 'No official moderator actions recorded for this room by Clubhouse.';
          emptyEl.style.display = 'flex';
        }
      } else if (listEl && Array.isArray(actions) && actions.length > 0) {
        if (emptyEl) emptyEl.style.display = 'none';
        const html = actions.map((act, idx) => renderModActionItem(act, idx)).join('');
        if (isAppend) {
          listEl.insertAdjacentHTML('beforeend', html);
        } else {
          listEl.innerHTML = html;
        }

        listEl.querySelectorAll('.mod-history-actor-chip').forEach(chip => {
          if (chip.hasAttribute('data-wired')) return;
          chip.setAttribute('data-wired', 'true');
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            const uId = chip.getAttribute('data-user-id');
            if (uId && uId !== '0') openMemberProfileModal(uId);
          });
        });

        // Asynchronously resolve authentic profiles for any user IDs missing complete name/photo
        actions.forEach((act, idx) => {
          const aId = act.actor_user_id || (act.actor_user && act.actor_user.user_id) || (act.action_user_profile && act.action_user_profile.user_id) || (act.user_profile && act.user_profile.user_id) || act.user_id;
          const tId = act.target_user_id || (act.target_user && act.target_user.user_id) || (act.target_user_profile && act.target_user_profile.user_id);

          if (aId) {
            getProfileCached(aId).then(p => {
              if (p && p.name) {
                const itemEl = listEl.querySelector(`.mod-item-${idx}`);
                if (!itemEl) return;
                const actorTextEl = itemEl.querySelector('.actor-chip-text');
                if (actorTextEl && (actorTextEl.textContent === 'Moderator' || !actorTextEl.textContent)) {
                  actorTextEl.textContent = p.name;
                }
                const descEl = itemEl.querySelector('.mod-history-desc');
                if (descEl && descEl.textContent.startsWith('Moderator ')) {
                  descEl.textContent = descEl.textContent.replace('Moderator ', `${p.name} `);
                }
                const avatarWrap = itemEl.querySelector(`.mod-history-actor-chip[data-user-id="${aId}"]`);
                if (avatarWrap && p.photo_url && !avatarWrap.querySelector('img')) {
                  avatarWrap.innerHTML = `<img src="${p.photo_url}" class="mod-history-actor-avatar" alt="${escapeHtml(p.name)}"><span class="actor-chip-text">${escapeHtml(p.name)}</span>`;
                }
              }
            });
          }

          if (tId) {
            getProfileCached(tId).then(p => {
              if (p && p.name) {
                const itemEl = listEl.querySelector(`.mod-item-${idx}`);
                if (!itemEl) return;
                const targetTextEl = itemEl.querySelector('.target-chip-text');
                if (targetTextEl && (targetTextEl.textContent === 'Member' || !targetTextEl.textContent)) {
                  targetTextEl.textContent = p.name;
                }
                const descEl = itemEl.querySelector('.mod-history-desc');
                if (descEl && descEl.textContent && descEl.textContent.includes(' a member ')) {
                  descEl.textContent = descEl.textContent.replace(' a member ', ` ${p.name} `);
                }
                const avatarWrap = itemEl.querySelector(`.mod-history-actor-chip[data-user-id="${tId}"]`);
                if (avatarWrap && p.photo_url && !avatarWrap.querySelector('img')) {
                  avatarWrap.innerHTML = `<img src="${p.photo_url}" class="mod-history-actor-avatar" alt="${escapeHtml(p.name)}"><span class="target-chip-text">${escapeHtml(p.name)}</span>`;
                }
              }
            });
          }
        });

        // Wire click to expand full action details on card
        listEl.querySelectorAll('.mod-history-item').forEach(itemCard => {
          if (itemCard.hasAttribute('data-card-wired')) return;
          itemCard.setAttribute('data-card-wired', 'true');
          itemCard.style.cursor = 'pointer';
          itemCard.addEventListener('click', (e) => {
            if (e.target.closest('.mod-history-actor-chip')) return;
            itemCard.classList.toggle('mod-item-expanded');
          });
        });
      }

      if (moreBtnContainer) {
        moreBtnContainer.style.display = currentModHistoryCursor ? 'flex' : 'none';
      }
    } catch (err) {
      console.error('[Moderator History] Error:', err);
      if (!isAppend && listEl) {
        if (emptyEl) {
          const p = emptyEl.querySelector('p');
          if (p) p.textContent = 'Could not load official moderator history from Clubhouse server.';
          emptyEl.style.display = 'flex';
        }
      }
    } finally {
      isLoadingModHistory = false;
      if (loadingEl) loadingEl.style.display = 'none';
      if (moreBtn) {
        moreBtn.disabled = false;
        moreBtn.textContent = 'Load earlier actions';
      }
    }
  }

  function setupModeratorHistoryEvents() {
    const btnDockModHistory = document.getElementById('btn-dock-mod-history');
    if (btnDockModHistory) {
      btnDockModHistory.addEventListener('click', (e) => {
        openModeratorHistoryModal();
      });
    }

    const btnCloseModHistory = document.getElementById('btn-close-mod-history');
    const btnDismissModHistory = document.getElementById('btn-dismiss-mod-history');
    if (btnCloseModHistory) btnCloseModHistory.addEventListener('click', closeModeratorHistoryModal);
    if (btnDismissModHistory) btnDismissModHistory.addEventListener('click', closeModeratorHistoryModal);

    const btnMore = document.getElementById('btn-mod-history-more');
    if (btnMore) {
      btnMore.addEventListener('click', () => {
        loadModeratorHistory(true);
      });
    }

    const modalModHistory = document.getElementById('modal-moderator-history');
    if (modalModHistory) {
      modalModHistory.addEventListener('click', (e) => {
        if (e.target === modalModHistory) {
          closeModeratorHistoryModal();
        }
      });
    }
  }

  function setupAutoMuteEvents() {}

  // ============================================================
  // ROOM ACTIVITY & PUBNUB HISTORY CONTROLLER
  // ============================================================
  function logRoomActivity(entry) {
    if (!entry) return;
    // Do not show moderator and accept speaker in Room Activity Log per user requirement
    const t = String(entry.type || '').toLowerCase();
    const title = String(entry.title || '').toLowerCase();
    if (t === 'make_moderator' || t === 'add_speaker' || t === 'accept_speaker' || t.includes('invite_speaker') ||
        t.includes('speaker') || title.includes('moderator') || title.includes('speaker')) {
      return;
    }
    if (!entry.timeStr) {
      try {
        entry.timeStr = new Date(entry.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (_) {
        entry.timeStr = '';
      }
    }
    roomActivityHistory.unshift(entry);
    if (roomActivityHistory.length > 200) {
      roomActivityHistory.pop();
    }

    const badge = document.getElementById('activity-history-count-badge');
    if (badge) {
      badge.textContent = `${roomActivityHistory.length} Event${roomActivityHistory.length === 1 ? '' : 's'}`;
    }

    const modal = document.getElementById('modal-room-activity-history');
    if (modal && modal.style.display !== 'none') {
      renderActivityHistoryList();
    }
  }

  function renderActivityHistoryList() {
    const listEl = document.getElementById('activity-history-list');
    const emptyEl = document.getElementById('activity-history-empty');
    const badge = document.getElementById('activity-history-count-badge');

    if (badge) {
      badge.textContent = `${roomActivityHistory.length} Event${roomActivityHistory.length === 1 ? '' : 's'}`;
    }

    if (!listEl) return;

    if (roomActivityHistory.length === 0) {
      if (emptyEl) emptyEl.style.display = 'flex';
      listEl.innerHTML = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const itemsHtml = roomActivityHistory.map((item, idx) => {
      const initial = (item.actor_name || 'M').charAt(0).toUpperCase();
      const actorAvatarHtml = item.actor_photo
        ? `<img src="${escapeHtml(item.actor_photo)}" class="mod-history-actor-avatar" alt="${escapeHtml(item.actor_name)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'chat-msg-avatar-fallback\\' style=\\'width:22px;height:22px;font-size:11px;\\'>${initial}</div>';">`
        : `<div class="chat-msg-avatar-fallback" style="width:22px;height:22px;font-size:11px;">${initial}</div>`;

      let targetChipHtml = '';
      if (item.target_name) {
        const tInitial = (item.target_name || 'M').charAt(0).toUpperCase();
        const targetAvatarHtml = item.target_photo
          ? `<img src="${escapeHtml(item.target_photo)}" class="mod-history-actor-avatar" alt="${escapeHtml(item.target_name)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'chat-msg-avatar-fallback\\' style=\\'width:22px;height:22px;font-size:11px;\\'>${tInitial}</div>';">`
          : `<div class="chat-msg-avatar-fallback" style="width:22px;height:22px;font-size:11px;">${tInitial}</div>`;

        targetChipHtml = `
          <div class="mod-history-actor-chip activity-target-chip" data-user-id="${escapeHtml(String(item.target_id || ''))}" title="Click to view target member profile" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 12px; background: rgba(255,255,255,0.06);">
            ${targetAvatarHtml}
            <span class="target-chip-text" style="font-weight: 600; color: #60a5fa;">${escapeHtml(item.target_name)}</span>
          </div>
        `;
      }

      const snippetHtml = item.snippet
        ? `<div class="activity-msg-snippet" style="margin-top: 6px; padding: 6px 10px; background: rgba(239, 68, 68, 0.12); border-left: 3px solid #ef4444; border-radius: 4px; font-size: 12px; color: #fca5a5; font-style: italic; word-break: break-word;">“${escapeHtml(item.snippet)}”</div>`
        : '';

      return `
        <div class="mod-history-item" style="padding: 10px 14px; margin-bottom: 8px; border-radius: 10px; background: var(--surface-2, #1e293b); border: 1px solid rgba(255,255,255,0.07);">
          <div class="mod-history-item-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">${item.icon || '📋'}</span>
              <span class="mod-history-title" style="font-size: 12px; font-weight: 700; color: #e2e8f0;">${escapeHtml(item.title || 'Room Event')}</span>
              <span class="badge" style="background: rgba(99, 102, 241, 0.18); color: #818cf8; font-size: 10px; padding: 2px 6px;">${escapeHtml(item.type || 'pubnub')}</span>
            </div>
            <span class="mod-history-time" style="font-size: 11px; color: var(--text-muted, #94a3b8);">${escapeHtml(item.timeStr || '')}</span>
          </div>
          <div class="mod-history-desc" style="font-size: 13px; color: #cbd5e1; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; line-height: 1.4;">
            <div class="mod-history-actor-chip activity-actor-chip" data-user-id="${escapeHtml(String(item.actor_id || ''))}" title="Click to view actor profile" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 12px; background: rgba(255,255,255,0.06);">
              ${actorAvatarHtml}
              <span class="actor-chip-text" style="font-weight: 600; color: #f8fafc;">${escapeHtml(item.actor_name || 'Moderator')}</span>
            </div>
            <span>${escapeHtml(item.detail || '')}</span>
            ${targetChipHtml}
          </div>
          ${snippetHtml}
        </div>
      `;
    }).join('');

    listEl.innerHTML = itemsHtml;

    listEl.querySelectorAll('.mod-history-actor-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const uId = chip.getAttribute('data-user-id');
        if (uId && uId !== '0' && uId !== 'null' && uId !== 'undefined') {
          openMemberProfileModal(uId);
        }
      });
    });
  }

  function openRoomActivityModal() {
    const modal = document.getElementById('modal-room-activity-history');
    if (!modal) return;
    modal.style.display = 'flex';
    bringModalToFront(modal);
    modal.scrollTop = 0;
    renderActivityHistoryList();
  }

  function closeRoomActivityModal() {
    const modal = document.getElementById('modal-room-activity-history');
    if (modal) modal.style.display = 'none';
  }

  function setupRoomActivityEvents() {
    const btnActivity = document.getElementById('btn-activity-history');
    if (btnActivity) {
      btnActivity.addEventListener('click', (e) => {
        e.stopPropagation();
        openRoomActivityModal();
      });
    }

    const btnClose = document.getElementById('btn-close-activity-history');
    const btnDismiss = document.getElementById('btn-dismiss-activity-history');
    if (btnClose) btnClose.addEventListener('click', closeRoomActivityModal);
    if (btnDismiss) btnDismiss.addEventListener('click', closeRoomActivityModal);

    const btnClear = document.getElementById('btn-clear-activity-history');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        roomActivityHistory.length = 0;
        renderActivityHistoryList();
      });
    }

    const modal = document.getElementById('modal-room-activity-history');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeRoomActivityModal();
        }
      });
    }
  }

  // License System & Slideshow features removed - All features permanently unlocked
  function syncPremiumUIStatus() {
    syncMicFxUI();
    updateDockMicFxButtonState();
  }
  async function checkAppLicenseStatus() {
    isPowerDeckPremium = true;
  }
  function startLicenseAutoCheck() {}
  function openLockedFeaturesCatalogModal() {}
  function promptLicenseActivation() {}
  async function openPremiumDetailsModal() {}
  function setupLicenseManager() {}

  function openSlideshowSetupModal() {}
  function stopSlideshow() {}
  function startSlideshow() {}

  // ============================================================
  // NOTIFICATIONS & ACTIVITIES ENGINE
  // ============================================================
  let allActivities = [];
  let currentNotifFilter = 'all';
  let activitiesNextCursor = null;
  let isLoadingOlderActivities = false;

  function formatActivityTitle(rawTitle) {
    if (!rawTitle) return '';
    let escaped = escapeHtml(rawTitle);
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return escaped;
  }

  function formatRelativeTime(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffSec = Math.floor((now - d) / 1000);
      if (diffSec < 60) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_) {
      return isoStr;
    }
  }

  function formatNotificationTimestamp(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const relative = formatRelativeTime(isoStr);
      const clockTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${relative} • ${clockTime}`;
    } catch (_) {
      return formatRelativeTime(isoStr) || isoStr;
    }
  }

  // Persistent tracking for accepted/declined house invitations
  let handledHouseInvites = new Map();
  try {
    const saved = localStorage.getItem('powerdeck_handled_house_invites');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        handledHouseInvites = new Map(Object.entries(parsed));
      }
    }
  } catch (_) {}

  function saveHandledHouseInvites() {
    try {
      const obj = Object.fromEntries(handledHouseInvites);
      localStorage.setItem('powerdeck_handled_house_invites', JSON.stringify(obj));
    } catch (_) {}
  }

  // Persistent tracking for last time activities were opened / seen
  let lastSeenActivitiesTime = 0;
  try {
    lastSeenActivitiesTime = Number(localStorage.getItem('powerdeck_last_seen_activities_time') || 0);
    if (!lastSeenActivitiesTime) {
      lastSeenActivitiesTime = Date.now();
      localStorage.setItem('powerdeck_last_seen_activities_time', String(lastSeenActivitiesTime));
    }
  } catch (_) {}

  // Deep recursive parser for Clubhouse activity notifications
  function parseActivityItem(item) {
    if (!item) return { isPing: false, actionTarget: '', inviteCode: null, roomSlug: null };

    let inviteCode = null;
    let roomSlug = null;
    let roomTarget = null;
    let houseTarget = null;
    let userTarget = null;
    let friendRequestsTarget = null;
    let hasRoomAction = false;

    function scanCandidate(val, actionType = 0) {
      if (!val || typeof val !== 'string') return;
      const s = val.trim();
      if (!s) return;

      if (actionType === 7) hasRoomAction = true;

      // Extract invite_code if present anywhere in URL or string
      const inviteMatch = s.match(/[?&]invite_code=([^&]+)/i) ||
                          s.match(/(?:clubhouse:\/\/(?:i\/room|i|invite)\/|clubhouse\.com\/i\/)(?:[a-zA-Z0-9_\-]+\/)?([a-zA-Z0-9_\-]+)/i);
      if (inviteMatch && inviteMatch[1] && !inviteCode) {
        let codeVal = inviteMatch[1].trim();
        try { codeVal = decodeURIComponent(codeVal); } catch (_) {}
        inviteCode = codeVal;
      }

      // Check room target (e.g. clubhouse://room/xq4vq6E9)
      const rMatch = s.match(/clubhouse:\/\/(?:room|channel)\/([a-zA-Z0-9]+)/i) ||
                     s.match(/(?:https?:\/\/)?(?:www\.)?clubhouse\.com\/(?:room|channel)\/([a-zA-Z0-9]+)/i);
      if (rMatch && rMatch[1] && !rMatch[1].startsWith('user') && !rMatch[1].startsWith('house')) {
        if (!roomSlug) roomSlug = rMatch[1].trim();
        if (!roomTarget) roomTarget = s;
        hasRoomAction = true;
      }

      // Check house target
      const hMatch = s.match(/clubhouse:\/\/house\/(\d+)/i) ||
                     s.match(/(?:https?:\/\/)?(?:www\.)?clubhouse\.com\/house\/([a-zA-Z0-9_\-]+)/i);
      if (hMatch && hMatch[1] && !houseTarget) {
        houseTarget = s;
      }

      // Check user target
      const uMatch = s.match(/clubhouse:\/\/user\/(\d+)/i) ||
                     s.match(/(?:https?:\/\/)?(?:www\.)?clubhouse\.com\/@([a-zA-Z0-9_\-]+)/i);
      if (uMatch && uMatch[1] && !userTarget) {
        userTarget = s;
      }

      // Check friend requests
      if (s.includes('friend_requests') && !friendRequestsTarget) {
        friendRequestsTarget = s;
      }
    }

    // Deep search for all actions, targets, and urls
    function deepScan(obj, depth = 0) {
      if (!obj || depth > 6) return;
      if (typeof obj === 'object') {
        if (obj.action && typeof obj.action === 'object') {
          if (obj.action.target) scanCandidate(obj.action.target, obj.action.action_type);
          if (obj.action.url) scanCandidate(obj.action.url, obj.action.action_type);
          if (obj.action.uri) scanCandidate(obj.action.uri, obj.action.action_type);
        }
        if (obj.target && typeof obj.target === 'string') {
          scanCandidate(obj.target, obj.action_type);
        }
        if (obj.url && typeof obj.url === 'string') {
          scanCandidate(obj.url, obj.action_type);
        }
        if (Array.isArray(obj)) {
          for (const el of obj) deepScan(el, depth + 1);
        } else {
          for (const [k, v] of Object.entries(obj)) {
            if (v && typeof v === 'object') deepScan(v, depth + 1);
          }
        }
      }
    }

    deepScan(item);

    // Prioritize room target, then house target, then friend requests, then user target
    const actionTarget = roomTarget || houseTarget || friendRequestsTarget || userTarget || '';

    // Determine if ping notification
    const isPing = Boolean(
      hasRoomAction ||
      roomTarget ||
      inviteCode ||
      (isPingNotification(item) && !houseTarget)
    );

    // Inviter info
    let inviter = null;
    const inviterThumb = (item.avatar && item.avatar.thumbnails && item.avatar.thumbnails[0]) ||
                         (item.details && item.details[0] && item.details[0].avatar && item.details[0].avatar.thumbnails && item.details[0].avatar.thumbnails[0]);
    if (inviterThumb) {
      const inviterName = inviterThumb.alternative || item.title?.replace(/\*\*(.*?)\*\*.*/, '$1') || 'Member';
      inviter = {
        name: inviterName,
        photo: inviterThumb.url || '',
        userId: (item.avatar && item.avatar.action && item.avatar.action.target?.match(/clubhouse:\/\/user\/(\d+)/)?.[1]) || ''
      };
    }

    // Room topic & details
    let roomTopic = '';
    let roomClubName = '';
    let roomSubText = '';
    let listenersCountText = '';
    if (item.details && item.details[0]) {
      const d = item.details[0];
      roomTopic = d.title ? d.title.replace(/\*\*/g, '').trim() : '';
      if (d.details && d.details[0] && d.details[0].title) {
        roomSubText = d.details[0].title.replace(/\*\*/g, '').trim();
        listenersCountText = roomSubText;
      }
    }
    if (!roomTopic && item.title) {
      const tMatch = item.title.match(/pinged you into (.*?)(?:, happening now|\.|$)/i);
      if (tMatch && tMatch[1]) roomTopic = tMatch[1].replace(/\*\*/g, '').trim();
    }

    // Extract club name if present in title
    if (item.title) {
      const cMatch = item.title.match(/from (.*?), happening now/i) ||
                     item.title.match(/invited you to \*\*(.*?)\*\*/i) ||
                     item.title.match(/invited you to (.*?)(?:\.|$)/i);
      if (cMatch && cMatch[1]) roomClubName = cMatch[1].replace(/\*\*/g, '').trim();
    }

    // Check if House Invite notification
    let isHouseInvite = false;
    let houseId = null;
    if (houseTarget) {
      const match = houseTarget.match(/(?:house\/)(\d+)/i) || houseTarget.match(/(\d+)/);
      if (match) houseId = match[1];
    }
    const fullItemText = ((item.title || '') + ' ' + (item.details && item.details[0] && item.details[0].title ? item.details[0].title : '')).toLowerCase();
    if (houseId && (fullItemText.includes('invited you to') || fullItemText.includes('invite') || item.logging_context?.type === 20 || (item.avatar?.action?.action_type === 20))) {
      isHouseInvite = true;
    }

    return {
      isPing,
      isHouseInvite,
      houseId,
      actionTarget,
      inviteCode,
      roomSlug,
      roomTarget,
      houseTarget,
      userTarget,
      friendRequestsTarget,
      inviter,
      roomTopic: roomTopic || 'Live Clubhouse Channel',
      roomClubName: roomClubName || (item.logging_context?.feed_title || ''),
      roomSubText: roomSubText || 'Happening now',
      listenersCountText: listenersCountText || roomSubText || ''
    };
  }

  // Join a pinged stage using authentic Clubhouse invite payload (source: 17, LeaveExisting: "NO")
  async function joinPingedStage(parsedInfo) {
    if (!parsedInfo) return;
    const modal = document.getElementById('modal-notifications');
    if (modal) modal.style.display = 'none';
    const pingInfoModal = document.getElementById('modal-ping-stage-info');
    if (pingInfoModal) pingInfoModal.style.display = 'none';
    if (modalStageViewer) modalStageViewer.style.display = 'none';

    // Directly use the exact ping invite code as the channel string for activities join
    const inviteCode = String(parsedInfo.inviteCode || '').trim();
    const roomSlug = String(parsedInfo.roomSlug || '').trim();
    const channelToJoin = inviteCode || roomSlug;

    if (!channelToJoin) {
      showAlert('warning', 'Could not locate active channel ID or invite code.');
      return;
    }

    // Construct exact authentic payload for pinged room matching official Clubhouse request
    const pingJoinPayload = {
      is_first_room_survey_candidate: true,
      channel: channelToJoin,
      source: 17,
      is_preview: false,
      is_muted: true,
      logging_context: {
        AudioInputDeviceType: "MicrophoneBuiltIn",
        LeaveExisting: "NO",
        CurrentLocale: "en_IN",
        AudioOutputDeviceType: "Speaker",
        IsCaptioningEnabled: false,
        IsSpatialAudioEnabled: true,
        source: 17
      }
    };
    if (inviteCode) {
      pingJoinPayload.invite_code = inviteCode;
    }

    showAlert('info', `Connecting to channel "${parsedInfo.roomTopic || 'Live Channel'}"...`);
    await joinChannelById(pingJoinPayload);
  }

  // Show detailed Stage Info & preview modal for a pinged room
  let activePingInfoData = null;
  async function showPingStageInfo(parsedInfo) {
    if (!parsedInfo) return;
    activePingInfoData = parsedInfo;
    const modal = document.getElementById('modal-ping-stage-info');
    if (!modal) return;

    const inviterNameEl = document.getElementById('ping-info-inviter-name');
    const inviterPhotoEl = document.getElementById('ping-info-inviter-photo');
    const inviterFallbackEl = document.getElementById('ping-info-inviter-fallback');
    const roomTopicEl = document.getElementById('ping-info-room-topic');
    const clubNameEl = document.getElementById('ping-info-club-name');
    const listenersCountEl = document.getElementById('ping-info-listeners-count');
    const channelCodeEl = document.getElementById('ping-info-channel-code');

    const inviter = parsedInfo.inviter || {};
    if (inviterNameEl) inviterNameEl.textContent = inviter.name || 'Clubhouse Member';
    if (inviterPhotoEl && inviterFallbackEl) {
      if (inviter.photo) {
        inviterPhotoEl.src = inviter.photo;
        inviterPhotoEl.style.display = 'block';
        inviterFallbackEl.style.display = 'none';
      } else {
        inviterPhotoEl.style.display = 'none';
        inviterFallbackEl.style.display = 'flex';
        inviterFallbackEl.textContent = (inviter.name || 'M').charAt(0).toUpperCase();
      }
    }

    if (roomTopicEl) roomTopicEl.textContent = parsedInfo.roomTopic || 'Live Channel';
    if (clubNameEl) clubNameEl.textContent = parsedInfo.roomClubName ? parsedInfo.roomClubName.toUpperCase() : 'CLUB CHANNEL';
    if (listenersCountEl) {
      listenersCountEl.innerHTML = `<span>👥 ${escapeHtml(parsedInfo.roomSubText || 'Happening now')}</span>`;
    }
    if (channelCodeEl) {
      const codeStr = parsedInfo.inviteCode ? `Invite: ${parsedInfo.inviteCode}` : (parsedInfo.roomSlug ? `Channel: ${parsedInfo.roomSlug}` : 'Channel');
      channelCodeEl.textContent = codeStr;
    }

    modal.style.display = 'flex';
    bringModalToFront(modal);
    modal.scrollTop = 0;

    // Asynchronously enrich with get_content_invite_info if invite code is present
    if (parsedInfo.inviteCode && window.powerdeckAPI && window.powerdeckAPI.getContentInviteInfo) {
      try {
        const extra = await window.powerdeckAPI.getContentInviteInfo(parsedInfo.inviteCode);
        if (extra && extra.success && extra.data && activePingInfoData === parsedInfo) {
          const ch = extra.data.channel || {};
          const sc = extra.data.social_club || {};
          const inv = extra.data.inviter || {};
          if (ch.topic && roomTopicEl) roomTopicEl.textContent = ch.topic;
          if (sc.name && clubNameEl) clubNameEl.textContent = sc.name.toUpperCase();
          if (inv.name && inviterNameEl && (!inviter.name || inviter.name === 'Member')) inviterNameEl.textContent = inv.name;
          if (inv.photo_url && inviterPhotoEl && !inviter.photo) {
            inviterPhotoEl.src = inv.photo_url;
            inviterPhotoEl.style.display = 'block';
            if (inviterFallbackEl) inviterFallbackEl.style.display = 'none';
          }
        }
      } catch (_) {}
    }
  }

  function hidePingStageInfo() {
    const modal = document.getElementById('modal-ping-stage-info');
    if (modal) modal.style.display = 'none';
    activePingInfoData = null;
  }

  const btnClosePingInfo = document.getElementById('btn-close-ping-info');
  const btnPingInfoJoinNow = document.getElementById('btn-ping-info-join-now');
  const btnPingInfoCopyLink = document.getElementById('btn-ping-info-copy-link');
  const modalPingStageInfo = document.getElementById('modal-ping-stage-info');

  if (btnClosePingInfo) {
    btnClosePingInfo.addEventListener('click', hidePingStageInfo);
  }
  if (modalPingStageInfo) {
    modalPingStageInfo.addEventListener('click', (e) => {
      if (e.target === modalPingStageInfo) hidePingStageInfo();
    });
  }
  if (btnPingInfoJoinNow) {
    btnPingInfoJoinNow.addEventListener('click', () => {
      if (activePingInfoData) {
        joinPingedStage(activePingInfoData);
      }
    });
  }
  if (btnPingInfoCopyLink) {
    btnPingInfoCopyLink.addEventListener('click', async () => {
      if (activePingInfoData) {
        const link = activePingInfoData.roomTarget || (activePingInfoData.roomSlug ? `https://www.clubhouse.com/room/${activePingInfoData.roomSlug}` : '');
        if (link) {
          try {
            if (window.powerdeckAPI && window.powerdeckAPI.copyToClipboard) {
              await window.powerdeckAPI.copyToClipboard(link);
            } else if (navigator.clipboard) {
              await navigator.clipboard.writeText(link);
            }
            btnPingInfoCopyLink.innerHTML = '<span>✓ Copied!</span>';
            setTimeout(() => {
              btnPingInfoCopyLink.innerHTML = '<span>📋 Copy Link</span>';
            }, 1500);
          } catch (_) {}
        }
      }
    });
  }

  async function fetchNotifications(nextCursor = null) {
    try {
      if (nextCursor) {
        isLoadingOlderActivities = true;
        const btnMore = document.getElementById('btn-load-more-activities');
        if (btnMore) btnMore.innerHTML = '<span>⏳ Loading older activities...</span>';
      }
      const res = await window.powerdeckAPI.getActivities(nextCursor);
      if (res && res.success && res.data) {
        activitiesNextCursor = res.data.next_cursor || null;
        const newActs = Array.isArray(res.data.activities) ? res.data.activities : [];
        if (nextCursor) {
          allActivities = allActivities.concat(newActs);
        } else {
          allActivities = newActs;
        }

        // If activities modal is currently open, mark all current activities as seen
        const modalNotifications = document.getElementById('modal-notifications');
        if (modalNotifications && modalNotifications.style.display !== 'none') {
          allActivities.forEach(a => { a.is_unread = false; });
          lastSeenActivitiesTime = Date.now();
          try {
            localStorage.setItem('powerdeck_last_seen_activities_time', String(lastSeenActivitiesTime));
          } catch (_) {}
        }

        updateUnreadNotificationBadge();
        renderNotificationsList();
      }
    } catch (err) {
      console.warn("fetchNotifications error:", err);
    } finally {
      isLoadingOlderActivities = false;
      const btnMore = document.getElementById('btn-load-more-activities');
      if (btnMore) btnMore.innerHTML = '<span>📜 Load older activities</span>';
    }
  }

  function updateUnreadNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    const modalNotifications = document.getElementById('modal-notifications');

    // If modal is currently open, do not show any badge/count outside
    if (modalNotifications && modalNotifications.style.display !== 'none') {
      if (badge) {
        badge.style.display = 'none';
        badge.textContent = '';
      }
      return;
    }

    const unreadCount = allActivities.filter(a => {
      if (a.is_unread !== true) return false;
      if (a.timestamp) {
        const t = new Date(a.timestamp).getTime();
        if (!isNaN(t) && t <= lastSeenActivitiesTime) return false;
      }
      const parsed = parseActivityItem(a);
      if (parsed.isHouseInvite && parsed.houseId && handledHouseInvites.has(String(parsed.houseId).trim())) {
        return false;
      }
      return true;
    }).length;

    if (badge) {
      // Don't show any count outside - if unread and not yet opened, only an uncounted indicator dot
      badge.textContent = '';
      if (unreadCount > 0) {
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  function renderNotificationsList() {
    const container = document.getElementById('notif-list-container');
    if (!container) return;

    const activitiesToShow = allActivities;

    const loadOlderWrap = document.getElementById('notif-load-older-wrap');
    if (loadOlderWrap) {
      loadOlderWrap.style.display = activitiesNextCursor ? 'block' : 'none';
    }

    const btnLoadMore = document.getElementById('btn-load-more-activities');
    if (btnLoadMore && !btnLoadMore.hasAttribute('data-wired')) {
      btnLoadMore.setAttribute('data-wired', 'true');
      btnLoadMore.addEventListener('click', () => {
        if (activitiesNextCursor && !isLoadingOlderActivities) {
          fetchNotifications(activitiesNextCursor);
        }
      });
    }

    if (activitiesToShow.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 48px; color: var(--text-secondary);">No notifications yet.</div>`;
      return;
    }

    container.innerHTML = activitiesToShow.map((item, idx) => {
      const parsedInfo = parseActivityItem(item);
      const title = item.title || (item.details && item.details[0] && item.details[0].title) || 'Notification';
      const cleanHouseId = parsedInfo.isHouseInvite && parsedInfo.houseId ? String(parsedInfo.houseId).trim() : null;
      const handledStatus = cleanHouseId ? handledHouseInvites.get(cleanHouseId) : null;
      const timeFormatted = formatNotificationTimestamp(item.timestamp);

      // Collect avatars / thumbnails (including nested details for friend requests / multiple users)
      let thumbs = [];
      if (item.avatar && Array.isArray(item.avatar.thumbnails) && item.avatar.thumbnails.length > 0) {
        thumbs = item.avatar.thumbnails;
      } else if (item.details && item.details[0] && item.details[0].avatar && Array.isArray(item.details[0].avatar.thumbnails) && item.details[0].avatar.thumbnails.some(t => t.url)) {
        thumbs = item.details[0].avatar.thumbnails;
      } else if (item.details && item.details[0] && item.details[0].details && item.details[0].details[0] && item.details[0].details[0].avatar) {
        thumbs = item.details[0].details[0].avatar.thumbnails || [];
      } else if (item.details && item.details[0] && item.details[0].avatar && Array.isArray(item.details[0].avatar.thumbnails)) {
        thumbs = item.details[0].avatar.thumbnails;
      }

      let avatarHtml = '';
      const validThumbs = thumbs.filter(t => t && t.url);
      if (validThumbs.length >= 2) {
        avatarHtml = `
          <div class="notif-avatar-stack">
            <img src="${validThumbs[0].url}" class="notif-avatar-multi-1" alt="Avatar" onerror="this.style.display='none';">
            <img src="${validThumbs[1].url}" class="notif-avatar-multi-2" alt="Avatar" onerror="this.style.display='none';">
          </div>
        `;
      } else if (validThumbs.length === 1) {
        avatarHtml = `
          <div class="notif-avatar-stack">
            <img src="${validThumbs[0].url}" class="notif-avatar-single" alt="Avatar" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'notif-avatar-fallback\\'>👤</div>';">
          </div>
        `;
      } else {
        const glyph = (thumbs[0] && thumbs[0].glyph) || (item.details && item.details[0] && item.details[0].avatar && item.details[0].avatar.thumbnails && item.details[0].avatar.thumbnails[0] && item.details[0].avatar.thumbnails[0].glyph);
        const icon = glyph === 7 ? '👥' : (parsedInfo.isPing ? '🎙️' : '🔔');
        avatarHtml = `
          <div class="notif-avatar-stack">
            <div class="notif-avatar-fallback">${icon}</div>
          </div>
        `;
      }

      // Subdetails (e.g. stage topic + listener count or house name)
      let subdetailsHtml = '';
      if (parsedInfo.isPing) {
        const topicText = parsedInfo.roomTopic ? formatActivityTitle(parsedInfo.roomTopic) : '';
        const countText = parsedInfo.listenersCountText || parsedInfo.roomSubText || '';
        subdetailsHtml = `
          <div class="notif-subdetails notif-stage-subdetails">
            ${topicText ? `<span class="notif-room-topic">🎙️ ${topicText}</span>` : ''}
            ${countText ? `<span class="notif-listeners-chip">👥 ${escapeHtml(countText)}</span>` : ''}
          </div>
        `;
      } else if (item.details && item.details[0]) {
        const d = item.details[0];
        const subTitle = d.title || (d.details && d.details[0] && d.details[0].title);
        const subThumb = d.avatar && d.avatar.thumbnails && d.avatar.thumbnails[0] && d.avatar.thumbnails[0].url;
        if (subTitle && subTitle !== title) {
          subdetailsHtml = `
            <div class="notif-subdetails">
              ${subThumb ? `<img src="${subThumb}" class="notif-sub-thumb" alt="">` : ''}
              <span>${formatActivityTitle(subTitle)}</span>
            </div>
          `;
        }
      }

      // Action buttons for Ping or House Invite
      let pingSectionHtml = '';
      if (parsedInfo.isPing) {
        pingSectionHtml = `
          <div class="notif-ping-actions">
            <button type="button" class="notif-btn-join-ping" data-idx="${idx}" title="Join channel now">
              <span>🚀 Join Channel</span>
            </button>
            <button type="button" class="notif-btn-info-ping" data-idx="${idx}" title="View channel info & details">
              <span>ℹ️ Channel Info</span>
            </button>
          </div>
        `;
      } else if (parsedInfo.isHouseInvite && parsedInfo.houseId) {
        const cleanHouseId = String(parsedInfo.houseId).trim();
        const handledStatus = handledHouseInvites.get(cleanHouseId);
        if (!handledStatus) {
          pingSectionHtml = `
            <div class="notif-house-actions">
              <button type="button" class="notif-btn-accept-house" data-idx="${idx}" data-house-id="${cleanHouseId}" title="Accept House Invitation">
                <span>✓ Accept</span>
              </button>
              <button type="button" class="notif-btn-decline-house" data-idx="${idx}" data-house-id="${cleanHouseId}" title="Decline House Invitation">
                <span>✕ Decline</span>
              </button>
            </div>
          `;
        } else if (handledStatus) {
          pingSectionHtml = `
            <div class="notif-house-actions">
              <span style="font-size: 11px; font-weight: 600; color: ${handledStatus === 'accepted' ? '#4ade80' : 'var(--text-muted)'};">
                ${handledStatus === 'accepted' ? '✓ Accepted' : '✕ Declined'}
              </span>
            </div>
          `;
        }
      }

      return `
        <div class="notif-item-card" data-index="${idx}" data-house-id="${parsedInfo.houseId || ''}" data-target="${escapeHtml(parsedInfo.actionTarget || '')}">
          ${avatarHtml}
          <div class="notif-content-wrap">
            <div class="notif-title">${formatActivityTitle(title)}</div>
            ${subdetailsHtml}
            ${pingSectionHtml}
            ${timeFormatted ? `<div class="notif-time" title="${escapeHtml(item.timestamp || '')}">🕒 ${timeFormatted}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Wire individual join button
    container.querySelectorAll('.notif-btn-join-ping').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-idx'));
        const item = (!isNaN(idx) && activitiesToShow[idx]) ? activitiesToShow[idx] : null;
        if (item) {
          const parsed = parseActivityItem(item);
          joinPingedStage(parsed);
        }
      });
    });

    // Wire individual info button
    container.querySelectorAll('.notif-btn-info-ping').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-idx'));
        const item = (!isNaN(idx) && activitiesToShow[idx]) ? activitiesToShow[idx] : null;
        if (item) {
          const parsed = parseActivityItem(item);
          showPingStageInfo(parsed);
        }
      });
    });

    // Wire accept house invitation button
    container.querySelectorAll('.notif-btn-accept-house').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const houseId = btn.getAttribute('data-house-id');
        const idx = parseInt(btn.getAttribute('data-idx'));
        if (houseId) {
          btn.disabled = true;
          btn.innerHTML = '<span>⏳ Joining...</span>';
          await acceptHouseInvitation(houseId, (!isNaN(idx) && activitiesToShow[idx]) ? activitiesToShow[idx] : null);
        }
      });
    });

    // Wire decline house invitation button
    container.querySelectorAll('.notif-btn-decline-house').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const houseId = btn.getAttribute('data-house-id');
        const idx = parseInt(btn.getAttribute('data-idx'));
        if (houseId) {
          btn.disabled = true;
          btn.innerHTML = '<span>⏳ Declining...</span>';
          await declineHouseInvitation(houseId, (!isNaN(idx) && activitiesToShow[idx]) ? activitiesToShow[idx] : null);
        }
      });
    });

    // Wire item card clicks
    container.querySelectorAll('.notif-item-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.notif-btn-join-ping, .notif-btn-info-ping, .notif-btn-accept-house, .notif-btn-decline-house')) return;

        const idx = parseInt(card.getAttribute('data-index'));
        const item = (!isNaN(idx) && activitiesToShow[idx]) ? activitiesToShow[idx] : null;

        if (!item) return;
        const parsedInfo = parseActivityItem(item);

        // 1. If it is a ping notification, join the stage with payload
        if (parsedInfo.isPing) {
          await joinPingedStage(parsedInfo);
          return;
        }

        // 2. If it is a house invite notification: redirect to that house get social club well
        if (parsedInfo.isHouseInvite && parsedInfo.houseId) {
          const cleanHouseId = String(parsedInfo.houseId).trim();
          openClubModal(cleanHouseId);
          return;
        }

        // 3. Non-ping notifications: Profile, House, or Follows
        const target = parsedInfo.actionTarget;
        if (target) {
          const userMatch = target.match(/clubhouse:\/\/user\/(\d+)/);
          const houseMatch = target.match(/clubhouse:\/\/house\/(\d+)/);
          if (userMatch && userMatch[1]) {
            openUserProfileModal(userMatch[1]);
          } else if (houseMatch && houseMatch[1]) {
            openClubModal(houseMatch[1]);
          } else if (target.includes('friend_requests')) {
            const myId = getLoggedInUserId();
            if (myId) openSocialGraphModal(myId, 'followers');
          }
        }
      });
    });
  }

  // Check if an activity notification is a room ping or invite
  function isPingNotification(item) {
    if (!item) return false;
    const str = [
      item.title,
      item.message,
      item.type,
      item.action_type,
      item.details && item.details[0] && item.details[0].title,
      item.details && item.details[0] && item.details[0].message
    ].filter(Boolean).join(' ').toLowerCase();

    return str.includes('pinged') ||
           str.includes('invited you to join') ||
           str.includes('invite') ||
           (item.action && /room|channel|join/i.test(item.action.target || ''));
  }

  // Extract channel ID from an activity notification object or action target
  function extractChannelIdFromActivity(item, target) {
    if (!item && !target) return null;

    function parseCandidate(val) {
      if (!val) return null;
      if (typeof val === 'object') {
        if (val.channel && typeof val.channel === 'string' && val.channel !== '[object Object]') {
          return val.channel.trim();
        }
        if (val.channel_id && typeof val.channel_id === 'string' && val.channel_id !== '[object Object]') {
          return val.channel_id.trim();
        }
        if (val.room_id && typeof val.room_id === 'string' && val.room_id !== '[object Object]') {
          return val.room_id.trim();
        }
        if (val.slug && typeof val.slug === 'string' && val.slug.length >= 6) {
          return val.slug.trim();
        }
        return null;
      }
      if (typeof val === 'string') {
        const s = val.trim();
        if (!s || s === '[object Object]') return null;

        const uriMatch = s.match(/clubhouse:\/\/(?:room|channel|join_room|join_channel|join|r|i)\/([a-zA-Z0-9_\-]+)/i);
        if (uriMatch && uriMatch[1] && !uriMatch[1].startsWith('user') && !uriMatch[1].startsWith('house')) {
          return uriMatch[1];
        }

        const urlMatch = s.match(/(?:https?:\/\/)?(?:www\.)?clubhouse\.com\/(?:room|channel|i|event)\/([a-zA-Z0-9_\-]+)/i);
        if (urlMatch && urlMatch[1] && !urlMatch[1].startsWith('user') && !urlMatch[1].startsWith('house') && !urlMatch[1].startsWith('@')) {
          return urlMatch[1];
        }

        const qMatch = s.match(/[?&](?:channel|channel_id|room_id|room)=([a-zA-Z0-9_\-]+)/i);
        if (qMatch && qMatch[1] && !qMatch[1].startsWith('user')) {
          return qMatch[1];
        }

        if (/^[a-zA-Z0-9]{8}$/.test(s) && /[0-9]/.test(s) && /[a-zA-Z]/.test(s)) {
          return s;
        }
      }
      return null;
    }

    // 1. Direct candidates
    const directCandidates = [
      item && item.channel,
      item && item.channel_id,
      item && item.room_id,
      item && item.room,
      item && item.channel_slug,
      item && item.action && item.action.channel,
      item && item.action && item.action.channel_id,
      item && item.action && item.action.room_id,
      item && item.action && item.action.room,
      item && item.action && item.action.target,
      item && item.action && item.action.url,
      item && item.action && item.action.uri,
      target
    ];

    for (const c of directCandidates) {
      const res = parseCandidate(c);
      if (res) return res;
    }

    // 2. Scan details array
    if (item && Array.isArray(item.details)) {
      for (const d of item.details) {
        if (!d) continue;
        const dCandidates = [
          d.channel,
          d.channel_id,
          d.room_id,
          d.room,
          d.action && d.action.channel,
          d.action && d.action.channel_id,
          d.action && d.action.room_id,
          d.action && d.action.target,
          d.action && d.action.url
        ];
        for (const dc of dCandidates) {
          const res = parseCandidate(dc);
          if (res) return res;
        }

        if (Array.isArray(d.details)) {
          for (const sub of d.details) {
            if (!sub) continue;
            const subCandidates = [
              sub.channel,
              sub.channel_id,
              sub.room_id,
              sub.room,
              sub.action && sub.action.channel,
              sub.action && sub.action.channel_id,
              sub.action && sub.action.target
            ];
            for (const sc of subCandidates) {
              const res = parseCandidate(sc);
              if (res) return res;
            }
          }
        }
      }
    }

    // 3. Deep scan
    function deepScan(obj, depth = 0) {
      if (!obj || depth > 4) return null;
      if (typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          if (/channel|room/i.test(k)) {
            const res = parseCandidate(v);
            if (res) return res;
          }
        }
        for (const v of Object.values(obj)) {
          if (typeof v === 'object' && v !== null) {
            const res = deepScan(v, depth + 1);
            if (res) return res;
          } else if (typeof v === 'string') {
            const res = parseCandidate(v);
            if (res) return res;
          }
        }
      }
      return null;
    }

    return deepScan(item);
  }

  // Extract Exact Club ID helper
  function extractExactClubId(socialClub) {
    if (!socialClub) return null;
    if (typeof socialClub === 'number' || typeof socialClub === 'string') {
      return String(socialClub).trim();
    }
    return String(socialClub.social_club_id || socialClub.club_id || socialClub.id || socialClub.slug || '').trim() || null;
  }

  // Extract room invite code from ?invite_code=..., /i/room/<code], /i/<slug>/<code], /i/<code], or clubhouse://i/room/<code]
  function extractInviteCode(val) {
    if (!val || typeof val !== 'string') return null;
    const str = val.trim();
    const qMatch = str.match(/[?&]invite_code=([^&]+)/i);
    if (qMatch && qMatch[1]) {
      return qMatch[1].trim();
    }
    const match = str.match(/(?:(?:https?:\/\/)?(?:www\.)?clubhouse\.com\/i\/|clubhouse:\/\/(?:i\/room|i|invite)\/)(?:[a-zA-Z0-9_\-]+\/)?([a-zA-Z0-9_\-]+)/i);
    if (match && match[1]) {
      const code = match[1].trim();
      if (code && code !== 'room' && code !== 'channel' && code !== 'user' && code !== 'house') {
        return code;
      }
    }
    return null;
  }

  // Extract Channel ID from pasted URL or exact 8-character ID
  function extractChannelId(val) {
    if (!val || typeof val !== 'string') return null;
    const str = val.trim();
    const roomMatch = str.match(/(?:clubhouse\.com\/(?:room|channels|channel)\/|clubhouse:\/\/room\/)([a-zA-Z0-9_\-]+)/i);
    if (roomMatch && roomMatch[1]) return roomMatch[1].trim();
    const iMatch = str.match(/(?:(?:https?:\/\/)?(?:www\.)?clubhouse\.com\/i\/|clubhouse:\/\/(?:i\/room|i|invite)\/)(?:[a-zA-Z0-9_\-]+\/)?([a-zA-Z0-9_\-]+)/i);
    if (iMatch && iMatch[1]) {
      const code = iMatch[1].trim();
      if (code && code !== 'room' && code !== 'channel' && code !== 'user' && code !== 'house') {
        return code;
      }
    }
    if (/^[a-zA-Z0-9]{8}$/.test(str)) return str;
    return null;
  }

  // Extract profile username from @handle or clubhouse.com/@username
  function extractProfileUsername(val) {
    if (!val || typeof val !== 'string') return null;
    const str = val.trim();
    const urlMatch = str.match(/clubhouse\.com\/@([a-zA-Z0-9_.-]+)/i);
    if (urlMatch) return urlMatch[1];
    if (str.startsWith('@') && str.length > 1) return str.slice(1).trim();
    return null;
  }

  // Extract house slug from clubhouse.com/house/slug or /c/slug
  function extractHouseSlug(val) {
    if (!val || typeof val !== 'string') return null;
    const str = val.trim();
    const houseMatch = str.match(/clubhouse\.com\/(?:house|c|club)\/([a-zA-Z0-9_.-]+)/i);
    if (houseMatch) return houseMatch[1];
    return null;
  }

  const openMemberProfileModal = (uId) => openUserProfileModal(uId);

  // Open Social Club (House) Modal
  async function openClubModal(socialClub, loggingContext) {
    if (!socialClub) return;
    currentViewingClub = socialClub;
    viewingClubId = extractExactClubId(socialClub);
    viewingClubStatus = socialClub.social_club_membership_status;
    activeClubMembersId = viewingClubId;
    activeClubMembersName = socialClub.name || 'House';

    if (cmName) cmName.textContent = socialClub.name || 'Clubhouse House';
    const initialCount = socialClub.num_members ? Number(socialClub.num_members).toLocaleString() : '0';
    if (cmMembersCount) cmMembersCount.textContent = initialCount;
    if (cmSubtitle) cmSubtitle.textContent = socialClub.subtitle || `${initialCount} Members`;
    if (cmDesc) cmDesc.textContent = 'Loading house details and live rooms...';
    if (cmLiveRoomsBadge) cmLiveRoomsBadge.style.display = 'none';
    if (cmLiveRoomsSection) cmLiveRoomsSection.style.display = 'none';

    const initial = (socialClub.name || 'H').charAt(0).toUpperCase();
    if (socialClub.photo_url) {
      if (cmAvatar) {
        cmAvatar.src = socialClub.photo_url;
        cmAvatar.style.display = 'block';
      }
      if (cmAvatarFallback) cmAvatarFallback.style.display = 'none';
    } else {
      if (cmAvatar) cmAvatar.style.display = 'none';
      if (cmAvatarFallback) {
        cmAvatarFallback.style.display = 'flex';
        cmAvatarFallback.textContent = initial;
      }
    }

    const btnCmSettings = document.getElementById('btn-cm-settings');
    if (btnCmSettings) btnCmSettings.style.display = 'none';
    const cmAvatarEditBadge = document.getElementById('cm-avatar-edit-badge');
    if (cmAvatarEditBadge) cmAvatarEditBadge.style.display = 'none';

    // Configure action button
    if (btnCmAction) {
      if (viewingClubStatus === 4) {
        btnCmAction.textContent = 'Leave House';
        btnCmAction.className = 'btn btn-danger btn-sm';
      } else if (viewingClubStatus === 3) {
        btnCmAction.textContent = 'Visit House';
        btnCmAction.className = 'btn btn-secondary btn-sm';
      } else {
        btnCmAction.textContent = 'Join House';
        btnCmAction.className = 'btn btn-primary btn-sm';
      }
    }

    if (modalSocialClub) {
      modalSocialClub.style.display = 'flex';
      bringModalToFront(modalSocialClub);
    }

    const btnCmOpenInviteModal = document.getElementById('btn-cm-open-invite-modal');
    if (btnCmOpenInviteModal) {
      btnCmOpenInviteModal.style.display = 'inline-flex';
      btnCmOpenInviteModal.onclick = (e) => {
        e.stopPropagation();
        openClubInviteModal(viewingClubId, currentViewingClub);
      };
    }

    try {
      const res = await window.powerdeckAPI.getSocialClub(viewingClubId, loggingContext);
      if (res && res.success && res.data && res.data.social_club) {
        const sc = res.data.social_club;
        const perms = res.data.permissions || {};
        currentViewingClub = sc;
        currentViewingClubPerms = perms;
        activeClubCreatorProfileId = sc.creator_profile_id;

        if (sc.social_club_id) {
          viewingClubId = String(sc.social_club_id);
          activeClubMembersId = viewingClubId;
        }

        const isMember = (typeof perms.is_club_member === 'boolean')
          ? perms.is_club_member
          : Boolean(
              sc.is_member === true ||
              sc.is_club_member === true ||
              sc.social_club_membership_status === 4 ||
              sc.membership_status === 4
            );
        viewingClubStatus = isMember ? 4 : 1;

        if (btnCmAction) {
          if (isMember) {
            btnCmAction.textContent = 'Leave House';
            btnCmAction.className = 'btn btn-danger btn-sm';
            btnCmAction.setAttribute('data-action', 'leave');
          } else {
            btnCmAction.textContent = 'Join House';
            btnCmAction.className = 'btn btn-primary btn-sm';
            btnCmAction.setAttribute('data-action', 'join');
          }
          btnCmAction.style.display = 'inline-block';
        }

        const isClubAdmin = Boolean(
          perms.is_club_admin === true ||
          perms.is_admin === true ||
          sc.is_admin === true ||
          (sc.creator_profile_id && String(sc.creator_profile_id) === String(getLoggedInUserId()))
        );

        if (btnCmSettings) {
          btnCmSettings.style.display = isClubAdmin ? 'inline-flex' : 'none';
          btnCmSettings.onclick = (e) => {
            if (e) e.preventDefault();
            openHouseSettingsModal(sc, perms);
          };
        }

        if (cmAvatarEditBadge) {
          cmAvatarEditBadge.style.display = isClubAdmin ? 'flex' : 'none';
          cmAvatarEditBadge.onclick = (e) => {
            e.stopPropagation();
            const fileInput = document.getElementById('input-cm-photo-file');
            if (fileInput) fileInput.click();
          };
        }

        const cmAvatarWrap = document.getElementById('cm-avatar-wrap');
        if (cmAvatarWrap) {
          cmAvatarWrap.onclick = (e) => {
            if (e.target && e.target.id === 'cm-avatar-edit-badge') return;
            if (sc.photo_url) {
              openPhotoLightbox('house_' + viewingClubId, sc.name || 'House', sc.slug || 'house', sc.photo_url);
            } else if (isClubAdmin) {
              const fileInput = document.getElementById('input-cm-photo-file');
              if (fileInput) fileInput.click();
            }
          };
        }

        const inputCmPhotoFile = document.getElementById('input-cm-photo-file');
        if (inputCmPhotoFile && !inputCmPhotoFile._hasListener) {
          inputCmPhotoFile._hasListener = true;
          inputCmPhotoFile.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const clubId = viewingClubId || (currentViewingClub && currentViewingClub.social_club_id);
            if (!clubId) return;

            showAlert('info', `Uploading new photo for "${(currentViewingClub && currentViewingClub.name) || 'House'}"...`);
            const reader = new FileReader();
            reader.onload = async () => {
              const base64Data = reader.result;
              try {
                const upRes = await window.powerdeckAPI.updateSocialClubPhoto(String(clubId), base64Data);
                if (upRes && upRes.success) {
                  showSuccessFloatPopup('House photo updated successfully!');
                  showAlert('success', 'House photo updated successfully!');
                  if (cmAvatar) {
                    cmAvatar.src = base64Data;
                    cmAvatar.style.display = 'block';
                  }
                  if (cmAvatarFallback) cmAvatarFallback.style.display = 'none';
                  const hsImg = document.getElementById('hs-avatar-img');
                  if (hsImg) {
                    hsImg.src = base64Data;
                    hsImg.style.display = 'block';
                  }
                  const hsFallback = document.getElementById('hs-avatar-fallback');
                  if (hsFallback) hsFallback.style.display = 'none';
                  if (currentViewingClub) currentViewingClub.photo_url = base64Data;
                } else {
                  showAlert('error', (upRes && upRes.error) || 'Failed to update house photo');
                }
              } catch (err) {
                showAlert('error', `Error updating photo: ${err.message}`);
              }
            };
            reader.readAsDataURL(file);
            inputCmPhotoFile.value = '';
          });
        }

        const canCreateRooms = Boolean(
          perms.can_create_rooms ||
          perms.is_admin ||
          perms.is_leader ||
          sc.can_create_rooms ||
          sc.is_admin
        );
        const btnCmStartRoom = document.getElementById('btn-cm-start-room');
        if (btnCmStartRoom) {
          btnCmStartRoom.style.display = canCreateRooms ? 'inline-flex' : 'none';
          btnCmStartRoom.onclick = (e) => {
            if (e) e.preventDefault();
            const clubIdToUse = String((sc && sc.social_club_id) || viewingClubId || '');
            if (!clubIdToUse) return;
            if (typeof openCreateRoomModal === 'function') {
              openCreateRoomModal({
                socialClubId: clubIdToUse,
                socialClubName: (sc && sc.name) || (cmName ? cmName.textContent : 'House'),
                photoUrl: (sc && sc.photo_url) || ''
              });
            }
          };
        }

        if (sc.name && cmName) cmName.textContent = sc.name;
        if (sc.photo_url && cmAvatar) {
          cmAvatar.src = sc.photo_url;
          cmAvatar.style.display = 'block';
          if (cmAvatarFallback) cmAvatarFallback.style.display = 'none';
        }

        // Slug Badge
        const cmSlugBadge = document.getElementById('cm-slug-badge');
        if (cmSlugBadge) {
          cmSlugBadge.textContent = sc.slug ? `@${sc.slug}` : (sc.name || 'house');
        }

        // 1. Description formatting with links and whitespace preservation
        if (cmDesc) {
          const rawDesc = sc.description || (sc.name ? `Welcome to ${sc.name}. Active community house on Clubhouse.` : 'Welcome to this Clubhouse house.');
          cmDesc.innerHTML = formatRichTextWithLinks(rawDesc);
        }

        // 2. Founder tag formatting with star
        const founderTag = document.getElementById('cm-founder-tag');
        const founderNameEl = document.getElementById('cm-founder-name');
        if (sc.founder_name && founderTag && founderNameEl) {
          founderNameEl.textContent = sc.founder_name;
          founderTag.style.display = 'inline-flex';
          if (sc.creator_profile_id) {
            founderTag.onclick = () => openUserProfileModal(sc.creator_profile_id);
          }
        } else if (founderTag) {
          founderTag.style.display = 'none';
        }

        // 3. Stats Grid (4 columns like Profile)
        const cmStatLive = document.getElementById('cm-stat-live');
        if (cmStatLive) cmStatLive.textContent = String(sc.num_live_channels || 0);

        const cmStatPolicy = document.getElementById('cm-stat-policy');
        if (cmStatPolicy) {
          cmStatPolicy.textContent = sc.is_membership_open === true ? 'Open' : (sc.waitlist_enabled === true ? 'Waitlist' : 'Invite-Only');
        }

        const cmStatChat = document.getElementById('cm-stat-chat');
        if (cmStatChat) {
          const chVal = sc.conversation_permission;
          cmStatChat.textContent = chVal === 1 ? 'All' : (chVal === 3 ? 'Trusted' : 'Admins');
        }

        // 4. Share Link Bar (Clean, readable URL without messy tokens)
        const cmShareUrlText = document.getElementById('cm-share-url-text');
        const cleanHouseUrl = sc.slug ? `https://www.clubhouse.com/house/${sc.slug}` : (viewingClubId ? `https://www.clubhouse.com/club/${viewingClubId}` : (sc.share_url || sc.url || ''));
        if (cmShareUrlText && cleanHouseUrl) {
          cmShareUrlText.textContent = cleanHouseUrl;
          cmShareUrlText.title = "Click to copy: " + cleanHouseUrl;
          cmShareUrlText.onclick = async () => {
            await window.powerdeckAPI.copyToClipboard(cleanHouseUrl);
            showAlert('success', 'House share link copied to clipboard!');
          };
        }

        // 5. Permission & Policy Badges
        const badgePolicy = document.getElementById('cm-badge-policy');
        const badgeCreate = document.getElementById('cm-badge-create-rooms');
        const badgeSpeak = document.getElementById('cm-badge-speaking');
        const badgeChat = document.getElementById('cm-badge-chat');

        if (badgePolicy) {
          let pText = '🌐 Open for All';
          if (sc.is_membership_open === true) pText = '🌐 Open for All';
          else if (sc.waitlist_enabled === true) pText = '📋 Waitlist';
          else pText = '🔒 Invite-Only';
          badgePolicy.textContent = pText;
          badgePolicy.style.display = 'inline-block';
        }

        if (badgeCreate) {
          const cVal = sc.create_rooms_permission;
          badgeCreate.textContent = cVal === 1 ? '🎙️ Rooms: All Members' : '🎙️ Rooms: Admins & Leaders';
          badgeCreate.style.display = 'inline-block';
        }

        if (badgeSpeak) {
          const sVal = sc.speaking_permission;
          badgeSpeak.textContent = sVal === 1 ? '🗣️ Speak: Everyone' : '🗣️ Speak: Mod Chooses';
          badgeSpeak.style.display = 'inline-block';
        }

        if (badgeChat) {
          const chVal = sc.conversation_permission;
          let chText = '💬 Chat: Admins & Leaders';
          if (chVal === 1) chText = '💬 Chat: All Members';
          else if (chVal === 3) chText = '💬 Chat: Trusted Members';
          badgeChat.textContent = chText;
          badgeChat.style.display = 'inline-block';
        }
        if (sc.num_members && cmMembersCount) {
          cmMembersCount.textContent = Number(sc.num_members).toLocaleString();
        }
        if (sc.num_live_channels && sc.num_live_channels > 0) {
          if (cmLiveRoomsCount) cmLiveRoomsCount.textContent = sc.num_live_channels;
          if (cmLiveRoomsBadge) cmLiveRoomsBadge.style.display = 'inline-flex';
        }

        // Render live channels in this house
        const liveItems = (res.data.items || []).filter(item => item && item.channel);
        if (liveItems.length > 0 && cmLiveRoomsList && cmLiveRoomsSection) {
          cmLiveRoomsList.innerHTML = liveItems.map(item => {
            const ch = item.channel;
            const chSpeakers = (ch.users || []).filter(u => u.is_speaker).slice(0, 3);
            const speakerNames = chSpeakers.map(u => (u.is_moderator ? '★ ' : '') + u.name).join(', ') || 'Live Channel';
            return `
              <div class="cm-live-room-item">
                <div class="cm-live-room-head">
                  <span class="cm-live-room-title">${escapeHtml(ch.topic || 'Live House Channel')}</span>
                  <span class="room-badge-live"><span class="room-live-dot"></span> LIVE</span>
                </div>
                <div class="cm-live-room-speakers">🎙️ ${escapeHtml(speakerNames)}</div>
                <div class="cm-live-room-footer">
                  <span style="font-size: 11.5px; color: var(--text-muted);">👥 ${ch.num_all || 0} in room</span>
                  <button class="btn btn-primary btn-xs btn-join-house-channel" data-channel="${escapeHtml(ch.channel || '')}">
                    🎧 Join Room
                  </button>
                </div>
              </div>
            `;
          }).join('');
          cmLiveRoomsSection.style.display = 'flex';

          cmLiveRoomsList.querySelectorAll('.btn-join-house-channel').forEach(btn => {
            btn.addEventListener('click', () => {
              const chId = btn.getAttribute('data-channel');
              if (modalSocialClub) modalSocialClub.style.display = 'none';
              joinChannelById(chId);
            });
          });
        }
      } else {
        if (cmDesc) {
          cmDesc.textContent = (socialClub.name ? `Welcome to ${socialClub.name}. Active community house on Clubhouse.` : 'House overview active.');
        }
      }
    } catch (e) {
      if (cmDesc) cmDesc.textContent = (socialClub.name ? `Welcome to ${socialClub.name}.` : 'House overview ready.');
    }
  }

  // Open Social Club (House) Members Modal
  async function openClubMembersModal(socialClubId, clubName) {
    const exactId = extractExactClubId(socialClubId);
    if (!exactId) return;
    activeClubMembersId = exactId;
    activeClubMembersName = clubName || 'House';
    clubMembersList = [];
    clubMembersCursor = null;
    isLoadingClubMembers = false;

    if (cmMembersModalTitle) cmMembersModalTitle.textContent = `${activeClubMembersName} • Members`;
    if (clubMembersStream) clubMembersStream.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">Loading members...</div>';
    if (membersLoadMore) membersLoadMore.style.display = 'none';
    if (rateLimitOverlay) rateLimitOverlay.style.display = 'none';

    if (modalClubMembers) {
      modalClubMembers.style.display = 'flex';
      bringModalToFront(modalClubMembers);
    }
    await fetchClubMembersPage(null);
  }

  async function fetchClubMembersPage(cursor) {
    if (isLoadingClubMembers || !activeClubMembersId) return;
    isLoadingClubMembers = true;

    if (cursor && btnLoadMoreMembers) {
      btnLoadMoreMembers.disabled = true;
      btnLoadMoreMembers.textContent = '⏳ Loading...';
    }

    try {
      const res = await window.powerdeckAPI.getSocialClubMembers(activeClubMembersId, cursor);
      if (res && (res.status === 429 || res.isRateLimited)) {
        if (rateLimitOverlay) rateLimitOverlay.style.display = 'flex';
        setAppStatus('Rate limited by Clubhouse API. Cooling down...');
        setTimeout(() => {
          if (rateLimitOverlay) rateLimitOverlay.style.display = 'none';
          isLoadingClubMembers = false;
        }, 4000);
        return;
      }

      if (res && res.success && res.data) {
        const users = Array.isArray(res.data.users) ? res.data.users : [];
        const nextCursor = res.data.next_cursor || res.data.next || res.data.cursor || null;

        // Deduplicate members by user_id
        if (cursor) {
          const existingIds = new Set(clubMembersList.map(u => String(u.user_id || u.id)));
          const freshUsers = users.filter(u => !existingIds.has(String(u.user_id || u.id)));
          clubMembersList = clubMembersList.concat(freshUsers);
        } else {
          clubMembersList = users;
        }

        // Determine if more members exist
        if (!nextCursor || users.length === 0) {
          clubMembersCursor = null;
        } else {
          clubMembersCursor = nextCursor;
        }

        renderClubMembersList();

        // Update modal title with dynamic member count
        if (cmMembersModalTitle) {
          cmMembersModalTitle.textContent = `${activeClubMembersName} • ${clubMembersList.length} Members${clubMembersCursor ? '' : ' (All Loaded)'}`;
        }

        // Always show pagination container, marking when complete
        if (membersLoadMore) {
          membersLoadMore.style.display = 'flex';
        }
        if (btnLoadMoreMembers) {
          if (clubMembersCursor) {
            btnLoadMoreMembers.disabled = false;
            btnLoadMoreMembers.textContent = '⬇️ Load More Members';
          } else {
            btnLoadMoreMembers.disabled = true;
            btnLoadMoreMembers.textContent = `✓ All ${clubMembersList.length} Members Loaded`;
          }
        }
      } else {
        if (!cursor && clubMembersStream) {
          clubMembersStream.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">${(res && res.error) || 'No members available'}</div>`;
        }
      }
    } catch (err) {
      console.error("fetchClubMembersPage error:", err);
      if (!cursor && clubMembersStream) {
        clubMembersStream.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--error);">Error loading members: ${err.message}</div>`;
      }
    } finally {
      isLoadingClubMembers = false;
      if (btnLoadMoreMembers && clubMembersCursor) {
        btnLoadMoreMembers.disabled = false;
        btnLoadMoreMembers.textContent = '⬇️ Load More Members';
      }
    }
  }

  function renderClubMembersList() {
    if (!clubMembersStream) return;
    if (clubMembersList.length === 0) {
      clubMembersStream.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">No members found in this house.</div>';
      return;
    }

    clubMembersStream.innerHTML = clubMembersList.map(u => {
      const initial = (u.name || 'U').charAt(0).toUpperCase();
      const avatarHtml = u.photo_url
        ? `<img src="${u.photo_url}" class="cmi-avatar" alt="${escapeHtml(u.name || '')}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'cmi-fallback\\'>${initial}</div>';">`
        : `<div class="cmi-fallback">${initial}</div>`;

      let roleBadgesHtml = '';
      const isFounder = Boolean(
        u.is_founder ||
        (activeClubCreatorProfileId && String(u.user_id) === String(activeClubCreatorProfileId))
      );

      if (isFounder) {
        roleBadgesHtml += `<span class="cmi-role-badge badge-founder">⭐ Founder</span>`;
      }
      if (u.is_leader) {
        roleBadgesHtml += `<span class="cmi-role-badge badge-leader">⭐ Leader</span>`;
      }
      if (u.is_admin && !isFounder) {
        roleBadgesHtml += `<span class="cmi-role-badge badge-admin">🛡️ Admin</span>`;
      }

      return `
        <div class="club-member-item" data-user-id="${u.user_id}">
          <div class="cmi-avatar-wrap">
            ${avatarHtml}
          </div>
          <div class="cmi-info">
            <div class="cmi-name-row">
              <span class="cmi-name">${escapeHtml(u.name || 'Member')}</span>
            </div>
            <span class="cmi-username">@${escapeHtml(u.username || '')}</span>
          </div>
          <div class="cmi-roles-row">
            ${roleBadgesHtml}
          </div>
        </div>
      `;
    }).join('');

    // Clicking a member in the house list opens their profile
    clubMembersStream.querySelectorAll('.club-member-item').forEach(item => {
      item.addEventListener('click', () => {
        const uid = item.getAttribute('data-user-id');
        if (uid) {
          openUserProfileModal(uid, {
            entity: 'social_club',
            entity_id: activeClubMembersId,
            social_club_id: activeClubMembersId
          });
        }
      });
    });
  }

  // ============================================================
  // HOUSE (SOCIAL CLUB) SETTINGS & WAITLIST CONTROLLER
  // ============================================================
  const modalHouseSettings = document.getElementById('modal-house-settings');
  const modalHouseWaitlist = document.getElementById('modal-house-waitlist');
  const btnCloseHouseSettings = document.getElementById('btn-close-house-settings');
  const btnDismissHouseSettings = document.getElementById('btn-dismiss-house-settings');
  const btnCloseHouseWaitlist = document.getElementById('btn-close-house-waitlist');
  const btnDismissHouseWaitlist = document.getElementById('btn-dismiss-house-waitlist');

  if (btnCloseHouseSettings) {
    btnCloseHouseSettings.addEventListener('click', () => {
      if (modalHouseSettings) modalHouseSettings.style.display = 'none';
    });
  }
  if (btnDismissHouseSettings) {
    btnDismissHouseSettings.addEventListener('click', () => {
      if (modalHouseSettings) modalHouseSettings.style.display = 'none';
    });
  }
  if (btnCloseHouseWaitlist) {
    btnCloseHouseWaitlist.addEventListener('click', () => {
      if (modalHouseWaitlist) modalHouseWaitlist.style.display = 'none';
    });
  }
  if (btnDismissHouseWaitlist) {
    btnDismissHouseWaitlist.addEventListener('click', () => {
      if (modalHouseWaitlist) modalHouseWaitlist.style.display = 'none';
    });
  }

  function showHouseSettingsStatus(msg, type = 'info') {
    const box = document.getElementById('hs-status-box');
    const txt = document.getElementById('hs-status-text');
    if (!box || !txt) return;
    box.style.display = 'block';
    if (type === 'success') {
      box.style.background = 'rgba(34, 197, 94, 0.15)';
      box.style.border = '1px solid rgba(34, 197, 94, 0.35)';
      box.style.color = '#22c55e';
    } else if (type === 'error') {
      box.style.background = 'rgba(239, 68, 68, 0.15)';
      box.style.border = '1px solid rgba(239, 68, 68, 0.35)';
      box.style.color = '#ef4444';
    } else {
      box.style.background = 'rgba(88, 101, 242, 0.15)';
      box.style.border = '1px solid rgba(88, 101, 242, 0.35)';
      box.style.color = '#5865f2';
    }
    txt.textContent = msg;
    setTimeout(() => {
      if (box) box.style.display = 'none';
    }, 4500);
  }

  function openHouseSettingsModal(sc, perms) {
    if (!modalHouseSettings || !sc) return;
    const clubId = String(sc.social_club_id || viewingClubId || '');
    if (!clubId) return;

    // Title
    const titleEl = document.getElementById('modal-hs-title');
    if (titleEl) titleEl.textContent = `${sc.name || 'House'} • Settings`;

    // Status box
    const statusBox = document.getElementById('hs-status-box');
    if (statusBox) statusBox.style.display = 'none';

    // Avatar
    const hsImg = document.getElementById('hs-avatar-img');
    const hsFallback = document.getElementById('hs-avatar-fallback');
    const initial = (sc.name || 'H').charAt(0).toUpperCase();
    if (sc.photo_url && hsImg) {
      hsImg.src = sc.photo_url;
      hsImg.style.display = 'block';
      if (hsFallback) hsFallback.style.display = 'none';
    } else {
      if (hsImg) hsImg.style.display = 'none';
      if (hsFallback) {
        hsFallback.textContent = initial;
        hsFallback.style.display = 'flex';
      }
    }

    const hsAvatarWrap = document.getElementById('hs-avatar-wrap');
    const btnHsBrowsePhoto = document.getElementById('btn-hs-browse-photo');
    const triggerPhotoPick = () => {
      const fileInput = document.getElementById('input-cm-photo-file');
      if (fileInput) fileInput.click();
    };
    if (hsAvatarWrap) hsAvatarWrap.onclick = triggerPhotoPick;
    if (btnHsBrowsePhoto) btnHsBrowsePhoto.onclick = triggerPhotoPick;

    // Name
    const inputName = document.getElementById('input-hs-name');
    if (inputName) inputName.value = sc.name || '';
    const btnSaveName = document.getElementById('btn-hs-save-name');
    if (btnSaveName) {
      btnSaveName.onclick = async () => {
        const newName = (inputName ? inputName.value : '').trim();
        if (!newName) {
          showAlert('warning', 'Please enter a house name.');
          return;
        }
        btnSaveName.disabled = true;
        btnSaveName.textContent = 'Saving...';
        try {
          const res = await window.powerdeckAPI.updateSocialClubName(clubId, newName);
          if (res && res.success) {
            sc.name = newName;
            if (cmName) cmName.textContent = newName;
            if (titleEl) titleEl.textContent = `${newName} • Settings`;
            showSuccessFloatPopup(`House name updated successfully to "${newName}"!`);
            showHouseSettingsStatus('House name updated successfully!', 'success');
            showAlert('success', `House name updated to "${newName}"`);
          } else {
            const err = (res && res.error) || 'Failed to update house name';
            showHouseSettingsStatus(err, 'error');
            showAlert('error', err);
          }
        } catch (e) {
          showHouseSettingsStatus(e.message, 'error');
        } finally {
          btnSaveName.disabled = false;
          btnSaveName.textContent = 'Save Name';
        }
      };
    }

    // Description
    const inputDesc = document.getElementById('input-hs-description');
    if (inputDesc) inputDesc.value = sc.description || '';
    const btnSaveDesc = document.getElementById('btn-hs-save-desc');
    if (btnSaveDesc) {
      btnSaveDesc.onclick = async () => {
        const newDesc = (inputDesc ? inputDesc.value : '').trim();
        btnSaveDesc.disabled = true;
        btnSaveDesc.textContent = 'Saving...';
        try {
          const res = await window.powerdeckAPI.updateSocialClubDescription(clubId, newDesc);
          if (res && res.success) {
            sc.description = newDesc;
            if (cmDesc) cmDesc.textContent = newDesc || `Welcome to ${sc.name || 'this house'}.`;
            showHouseSettingsStatus('House description updated successfully!', 'success');
            showAlert('success', 'House description updated successfully!');
          } else {
            const err = (res && res.error) || 'Failed to update description';
            showHouseSettingsStatus(err, 'error');
            showAlert('error', err);
          }
        } catch (e) {
          showHouseSettingsStatus(e.message, 'error');
        } finally {
          btnSaveDesc.disabled = false;
          btnSaveDesc.textContent = 'Save Description';
        }
      };
    }

    // Who Can Join: Radio Buttons & Cards
    const radioOpen = document.getElementById('radio-hs-join-open');
    const radioWaitlist = document.getElementById('radio-hs-join-waitlist');
    const radioInvite = document.getElementById('radio-hs-join-invite');
    const cardOpen = document.getElementById('card-hs-join-open');
    const cardWaitlist = document.getElementById('card-hs-join-waitlist');
    const cardInvite = document.getElementById('card-hs-join-invite');
    const btnViewWaitlist = document.getElementById('btn-hs-view-waitlist');
    const waitlistSubBox = document.getElementById('hs-waitlist-sub-box');
    const checkWaitlistQuestion = document.getElementById('check-hs-waitlist-question');
    const waitlistQuestionWrap = document.getElementById('hs-waitlist-question-wrap');
    const inputWaitlistQuestion = document.getElementById('input-hs-waitlist-question');
    const btnSaveWaitlistQuestion = document.getElementById('btn-hs-save-waitlist-question');

    function updateJoinRadiosUI(policy) {
      if (cardOpen) cardOpen.classList.toggle('is-selected', policy === 'open');
      if (cardWaitlist) cardWaitlist.classList.toggle('is-selected', policy === 'waitlist');
      if (cardInvite) cardInvite.classList.toggle('is-selected', policy === 'invite');
      if (radioOpen) radioOpen.checked = (policy === 'open');
      if (radioWaitlist) radioWaitlist.checked = (policy === 'waitlist');
      if (radioInvite) radioInvite.checked = (policy === 'invite');

      const isWait = (policy === 'waitlist');
      if (btnViewWaitlist) btnViewWaitlist.style.display = isWait ? 'inline-flex' : 'none';
      if (waitlistSubBox) waitlistSubBox.style.display = isWait ? 'flex' : 'none';

      // If open for all selected, don't show the hide members list and let member give invites
      const togglesSection = document.getElementById('hs-toggles-section');
      if (togglesSection) {
        togglesSection.style.display = (policy === 'open') ? 'none' : 'flex';
      }
    }

    // Determine current policy
    let currentPolicy = 'invite';
    if (sc.is_membership_open === true) {
      currentPolicy = 'open';
    } else if (sc.waitlist_enabled === true) {
      currentPolicy = 'waitlist';
    }
    updateJoinRadiosUI(currentPolicy);

    // Card click handlers for Join options
    if (cardOpen) {
      cardOpen.onclick = (e) => {
        if (e.target !== radioOpen && radioOpen) {
          radioOpen.checked = true;
          radioOpen.dispatchEvent(new Event('change'));
        }
      };
    }
    if (cardWaitlist) {
      cardWaitlist.onclick = (e) => {
        if (e.target !== radioWaitlist && radioWaitlist) {
          radioWaitlist.checked = true;
          radioWaitlist.dispatchEvent(new Event('change'));
        }
      };
    }
    if (cardInvite) {
      cardInvite.onclick = (e) => {
        if (e.target !== radioInvite && radioInvite) {
          radioInvite.checked = true;
          radioInvite.dispatchEvent(new Event('change'));
        }
      };
    }

    // Waitlist sub-settings setup
    const isQuestionEnabled = Boolean(sc.waitlist_question_enabled || (sc.waitlist_question && sc.waitlist_question.trim().length > 0));
    if (checkWaitlistQuestion) checkWaitlistQuestion.checked = isQuestionEnabled;
    if (waitlistQuestionWrap) waitlistQuestionWrap.style.display = isQuestionEnabled ? 'flex' : 'none';
    if (inputWaitlistQuestion) inputWaitlistQuestion.value = sc.waitlist_question || '';

    // Click handlers for Join options
    if (radioOpen) {
      radioOpen.onchange = async () => {
        if (!radioOpen.checked) return;
        updateJoinRadiosUI('open');
        try {
          const res = await window.powerdeckAPI.updateSocialClubIsMembershipOpen(clubId, true);
          if (res && res.success) {
            sc.is_membership_open = true;
            sc.waitlist_enabled = false;
            showHouseSettingsStatus('House entry policy updated: Open for All 🌐', 'success');
            showAlert('success', 'House is now Open for All!');
          } else {
            showHouseSettingsStatus((res && res.error) || 'Failed to update policy', 'error');
          }
        } catch (e) {
          showHouseSettingsStatus(e.message, 'error');
        }
      };
    }

    if (radioWaitlist) {
      radioWaitlist.onchange = async () => {
        if (!radioWaitlist.checked) return;
        updateJoinRadiosUI('waitlist');
        try {
          const res = await window.powerdeckAPI.updateSocialClubWaitlist(clubId, {
            waitlistEnabled: true,
            isWaitlistAnswerRequired: false,
            waitlistQuestionEnabled: Boolean(checkWaitlistQuestion && checkWaitlistQuestion.checked)
          });
          if (res && res.success) {
            sc.waitlist_enabled = true;
            sc.is_membership_open = false;
            showHouseSettingsStatus('House entry policy updated: Waitlist 📋', 'success');
            showAlert('success', 'House is now set to Waitlist!');
          } else {
            showHouseSettingsStatus((res && res.error) || 'Failed to enable waitlist', 'error');
          }
        } catch (e) {
          showHouseSettingsStatus(e.message, 'error');
        }
      };
    }

    if (radioInvite) {
      radioInvite.onchange = async () => {
        if (!radioInvite.checked) return;
        updateJoinRadiosUI('invite');
        try {
          const res = await window.powerdeckAPI.updateSocialClubIsMembershipOpen(clubId, false);
          if (res && res.success) {
            sc.is_membership_open = false;
            sc.waitlist_enabled = false;
            showHouseSettingsStatus('House entry policy updated: Invite-Only 🔒', 'success');
            showAlert('success', 'House is now Invite-Only!');
          } else {
            showHouseSettingsStatus((res && res.error) || 'Failed to update policy', 'error');
          }
        } catch (e) {
          showHouseSettingsStatus(e.message, 'error');
        }
      };
    }

    // Toggle: Waitlist question enabled
    if (checkWaitlistQuestion) {
      checkWaitlistQuestion.onchange = async () => {
        const enabled = checkWaitlistQuestion.checked;
        if (waitlistQuestionWrap) waitlistQuestionWrap.style.display = enabled ? 'flex' : 'none';
        try {
          const res = await window.powerdeckAPI.updateSocialClubWaitlist(clubId, {
            waitlistEnabled: true,
            isWaitlistAnswerRequired: false,
            waitlistQuestionEnabled: enabled
          });
          if (res && res.success) {
            sc.waitlist_question_enabled = enabled;
            showHouseSettingsStatus(enabled ? 'Waitlist question enabled' : 'Waitlist question disabled', 'success');
          } else {
            showHouseSettingsStatus((res && res.error) || 'Failed to update question toggle', 'error');
          }
        } catch (e) {
          showHouseSettingsStatus(e.message, 'error');
        }
      };
    }

    // Save Waitlist Question
    if (btnSaveWaitlistQuestion) {
      btnSaveWaitlistQuestion.onclick = async () => {
        const qText = (inputWaitlistQuestion ? inputWaitlistQuestion.value : '').trim();
        btnSaveWaitlistQuestion.disabled = true;
        btnSaveWaitlistQuestion.textContent = 'Saving...';
        try {
          const res = await window.powerdeckAPI.updateSocialClubWaitlistQuestion(clubId, qText);
          if (res && res.success) {
            sc.waitlist_question = qText;
            showHouseSettingsStatus('Waitlist question saved successfully!', 'success');
            showAlert('success', 'Waitlist question updated!');
          } else {
            const err = (res && res.error) || 'Failed to update waitlist question';
            showHouseSettingsStatus(err, 'error');
            showAlert('error', err);
          }
        } catch (e) {
          showHouseSettingsStatus(e.message, 'error');
        } finally {
          btnSaveWaitlistQuestion.disabled = false;
          btnSaveWaitlistQuestion.textContent = 'Save Question';
        }
      };
    }

    // View Waitlist
    if (btnViewWaitlist) {
      btnViewWaitlist.onclick = (e) => {
        if (e) e.preventDefault();
        openHouseWaitlistModal(clubId);
      };
    }

    // Toggle: Hide Members List
    const checkHidden = document.getElementById('check-hs-membership-hidden');
    if (checkHidden) {
      checkHidden.checked = Boolean(sc.is_membership_hidden);
      checkHidden.onchange = async () => {
        const isHidden = checkHidden.checked;
        try {
          const res = await window.powerdeckAPI.updateSocialClubIsMembershipHidden(clubId, isHidden);
          if (res && res.success) {
            sc.is_membership_hidden = isHidden;
            const msg = isHidden ? 'Members list is now hidden from non-members 🔒' : 'Members list is now visible to all 👁️';
            showHouseSettingsStatus(msg, 'success');
            showAlert('success', msg);
          } else {
            showHouseSettingsStatus((res && res.error) || 'Failed to update members visibility', 'error');
            checkHidden.checked = !isHidden;
          }
        } catch (e) {
          showHouseSettingsStatus(e.message, 'error');
          checkHidden.checked = !isHidden;
        }
      };
    }

    // Toggle: Let Members Give Invites
    const checkInvites = document.getElementById('check-hs-automatic-invites');
    if (checkInvites) {
      checkInvites.checked = Boolean(sc.is_automatic_invites_enabled);
      checkInvites.onchange = async () => {
        const isInvitesEnabled = checkInvites.checked;
        try {
          const res = await window.powerdeckAPI.updateSocialClubInviteSettings(clubId, isInvitesEnabled);
          if (res && res.success) {
            sc.is_automatic_invites_enabled = isInvitesEnabled;
            const msg = isInvitesEnabled ? 'Members are now allowed to invite friends 🎉' : 'Member invites disabled ❌';
            showHouseSettingsStatus(msg, 'success');
            showAlert('success', msg);
          } else {
            showHouseSettingsStatus((res && res.error) || 'Failed to update invite settings', 'error');
            checkInvites.checked = !isInvitesEnabled;
          }
        } catch (e) {
          showHouseSettingsStatus(e.message, 'error');
          checkInvites.checked = !isInvitesEnabled;
        }
      };
    }

    // Row click listeners for Section 5 toggles
    const rowHidden = document.getElementById('hs-toggle-hidden-row');
    if (rowHidden) {
      rowHidden.onclick = (e) => {
        if (e.target !== checkHidden && !e.target.closest('.switch')) {
          if (checkHidden) {
            checkHidden.checked = !checkHidden.checked;
            checkHidden.dispatchEvent(new Event('change'));
          }
        }
      };
    }

    const rowInvites = document.getElementById('hs-toggle-invites-row');
    if (rowInvites) {
      rowInvites.onclick = (e) => {
        if (e.target !== checkInvites && !e.target.closest('.switch')) {
          if (checkInvites) {
            checkInvites.checked = !checkInvites.checked;
            checkInvites.dispatchEvent(new Event('change'));
          }
        }
      };
    }

    // Selects: Member Permissions (Room & Chat Settings)
    const selectCreateRooms = document.getElementById('select-hs-create-rooms-perm');
    const selectSpeaking = document.getElementById('select-hs-speaking-perm');
    const selectConversation = document.getElementById('select-hs-conversation-perm');
    const btnSavePerms = document.getElementById('btn-hs-save-permissions');

    if (selectCreateRooms) selectCreateRooms.value = String(sc.create_rooms_permission || 1);
    if (selectSpeaking) selectSpeaking.value = String(sc.speaking_permission || 2);
    if (selectConversation) selectConversation.value = String(sc.conversation_permission || 2);

    async function saveMemberPermissions() {
      const createRoomsPermission = Number(selectCreateRooms ? selectCreateRooms.value : 1);
      const speakingPermission = Number(selectSpeaking ? selectSpeaking.value : 2);
      const conversationPermission = Number(selectConversation ? selectConversation.value : 2);

      if (btnSavePerms) {
        btnSavePerms.disabled = true;
        btnSavePerms.textContent = 'Saving...';
      }

      try {
        const res = await window.powerdeckAPI.updateSocialClubSettings(clubId, {
          createRoomsPermission,
          speakingPermission,
          conversationPermission
        });

        if (res && res.success) {
          sc.create_rooms_permission = createRoomsPermission;
          sc.speaking_permission = speakingPermission;
          sc.conversation_permission = conversationPermission;

          // Update badges in House overview
          const badgeCreate = document.getElementById('cm-badge-create-rooms');
          const badgeSpeak = document.getElementById('cm-badge-speaking');
          const badgeChat = document.getElementById('cm-badge-chat');
          if (badgeCreate) badgeCreate.textContent = createRoomsPermission === 1 ? '🎙️ Rooms: All Members' : '🎙️ Rooms: Admins & Leaders';
          if (badgeSpeak) badgeSpeak.textContent = speakingPermission === 1 ? '🗣️ Speak: Everyone' : '🗣️ Speak: Mod Chooses';
          if (badgeChat) {
            let chText = '💬 Chat: Admins & Leaders';
            if (conversationPermission === 1) chText = '💬 Chat: All Members';
            else if (conversationPermission === 3) chText = '💬 Chat: Trusted Members';
            badgeChat.textContent = chText;
          }

          showHouseSettingsStatus('Member permissions updated successfully!', 'success');
          showAlert('success', 'Member permissions updated successfully!');
        } else {
          const err = (res && res.error) || 'Failed to update member permissions';
          showHouseSettingsStatus(err, 'error');
          showAlert('error', err);
        }
      } catch (err) {
        showHouseSettingsStatus(err.message, 'error');
      } finally {
        if (btnSavePerms) {
          btnSavePerms.disabled = false;
          btnSavePerms.textContent = 'Save Permissions';
        }
      }
    }

    if (btnSavePerms) btnSavePerms.onclick = saveMemberPermissions;

    // Danger Zone: Delete House
    const btnDeleteHouse = document.getElementById('btn-hs-delete-house');
    const canDeleteHouse = Boolean(
      perms.can_delete_club === true ||
      perms.is_club_admin === true ||
      (sc.creator_profile_id && String(sc.creator_profile_id) === String(getLoggedInUserId()))
    );

    const dangerZone = document.getElementById('hs-danger-zone');
    if (dangerZone) dangerZone.style.display = canDeleteHouse ? 'flex' : 'none';

    if (btnDeleteHouse) {
      btnDeleteHouse.onclick = async () => {
        const houseName = sc.name || 'this house';
        const confirmed = confirm(`⚠️ Are you sure you want to permanently delete "${houseName}"?\n\nThis will remove all members and delete all house history. This cannot be undone.`);
        if (!confirmed) return;

        btnDeleteHouse.disabled = true;
        btnDeleteHouse.textContent = 'Deleting...';

        try {
          const res = await window.powerdeckAPI.deleteSocialClub(clubId);
          if (res && res.success) {
            showAlert('success', `House "${houseName}" deleted successfully.`);
            if (modalHouseSettings) modalHouseSettings.style.display = 'none';
            if (modalSocialClub) modalSocialClub.style.display = 'none';

            // Refresh Profile Studio houses & create channel targets
            const myId = getLoggedInUserId();
            if (myId) {
              try {
                const pRes = await window.powerdeckAPI.getProfile(myId);
                if (pRes && pRes.success && pRes.data && pRes.data.user_profile) {
                  updateProfileStudioUI(pRes.data.user_profile);
                }
              } catch (_) {}
            }
            loadCreateChannelTargets(true).catch(() => {});
          } else {
            const err = (res && res.error) || 'Failed to delete house';
            showHouseSettingsStatus(err, 'error');
            showAlert('error', err);
            btnDeleteHouse.disabled = false;
            btnDeleteHouse.textContent = '🗑️ Delete House';
          }
        } catch (e) {
          showHouseSettingsStatus(e.message, 'error');
          showAlert('error', e.message);
          btnDeleteHouse.disabled = false;
          btnDeleteHouse.textContent = '🗑️ Delete House';
        }
      };
    }

    modalHouseSettings.style.display = 'flex';
    bringModalToFront(modalHouseSettings);
  }

  // Open House Waitlist Modal
  async function openHouseWaitlistModal(clubId) {
    if (!modalHouseWaitlist) return;
    const cleanId = String(clubId || viewingClubId || '');
    if (!cleanId) return;

    modalHouseWaitlist.style.display = 'flex';
    bringModalToFront(modalHouseWaitlist);

    const titleEl = document.getElementById('modal-hw-title');
    const listEl = document.getElementById('hw-applicants-list');
    const countEl = document.getElementById('hw-count-text');

    if (titleEl) titleEl.textContent = `${(currentViewingClub && currentViewingClub.name) || 'House'} • Waitlist`;
    if (listEl) listEl.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">Loading applicants...</div>';
    if (countEl) countEl.textContent = '0 applicants';

    try {
      const res = await window.powerdeckAPI.getSocialClubWaitlist(cleanId);
      if (res && res.success && res.data) {
        const users = res.data.users || res.data.waitlist || res.data.items || [];
        if (countEl) countEl.textContent = `${users.length} applicant${users.length === 1 ? '' : 's'}`;

        if (users.length === 0) {
          if (listEl) listEl.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">No pending waitlist applicants.</div>';
          return;
        }

        if (listEl) {
          listEl.innerHTML = users.map(u => {
            const initial = (u.name || 'U').charAt(0).toUpperCase();
            const avatarHtml = u.photo_url
              ? `<img src="${u.photo_url}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover;">`
              : `<div style="width: 42px; height: 42px; border-radius: 50%; background: var(--surface-3); display: flex; align-items: center; justify-content: center; font-weight: bold;">${initial}</div>`;

            const answerHtml = u.waitlist_answer || u.answer
              ? `<div style="font-size: 12px; color: var(--text-muted); background: var(--surface-2); padding: 6px 10px; border-radius: 6px; margin-top: 4px;">💬 "${escapeHtml(u.waitlist_answer || u.answer)}"</div>`
              : '';

            return `
              <div style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;">
                ${avatarHtml}
                <div style="display: flex; flex-direction: column; flex: 1;">
                  <span style="font-size: 13.5px; font-weight: 600; color: var(--text-primary);">${escapeHtml(u.name || 'Applicant')}</span>
                  <span style="font-size: 12px; color: var(--text-muted);">@${escapeHtml(u.username || '')}</span>
                  ${answerHtml}
                </div>
              </div>
            `;
          }).join('');
        }
      } else {
        if (listEl) listEl.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">${(res && res.error) || 'Failed to load waitlist'}</div>`;
      }
    } catch (e) {
      if (listEl) listEl.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--error);">Error: ${e.message}</div>`;
    }
  }

  // ============================================================
  // SOCIAL CLUB (HOUSE) INVITATION PROMPT & ACCEPT/DECLINE
  // ============================================================

  async function acceptHouseInvitation(houseId, activityItem = null) {
    if (!houseId) return;
    const cleanHouseId = String(houseId).trim();
    try {
      // Join house with official Clubhouse payload (source: 49, has_finished_onboarding_flow: true, is_for_social_club_open: false)
      const res = await window.powerdeckAPI.joinSocialClub(cleanHouseId, {
        source: 49,
        logging_context: {},
        has_finished_onboarding_flow: true,
        is_for_social_club_open: false
      });
      if (res && res.success) {
        showAlert('success', 'Joined House successfully!');
        handledHouseInvites.set(cleanHouseId, 'accepted');
        saveHandledHouseInvites();

        if (activityItem) activityItem.is_unread = false;

        // Mark DOM card as read and remove action buttons
        const cards = document.querySelectorAll(`.notif-item-card[data-house-id="${cleanHouseId}"]`);
        cards.forEach(card => {
          card.classList.remove('is-unread');
          const dot = card.querySelector('.notif-unread-dot');
          if (dot) dot.remove();
          const actWrap = card.querySelector('.notif-house-actions');
          if (actWrap) {
            actWrap.innerHTML = '<span style="font-size: 11px; color: #4ade80; font-weight: 600;">✓ Accepted</span>';
          }
        });
        updateUnreadNotificationBadge();

        const promptModal = document.getElementById('modal-house-invite-prompt');
        if (promptModal) promptModal.style.display = 'none';

        // Refresh and open the newly joined house modal
        await openClubModal(cleanHouseId);
      } else {
        const err = (res && res.error) || 'Failed to join house';
        showAlert('error', err);
      }
    } catch (err) {
      showAlert('error', `Error joining house: ${err.message}`);
    }
  }

  async function declineHouseInvitation(houseId, activityItem = null) {
    if (!houseId) return;
    const cleanHouseId = String(houseId).trim();
    try {
      const res = await window.powerdeckAPI.leaveSocialClub(cleanHouseId);
      if (res && res.success) {
        showAlert('info', 'House invitation declined.');
        handledHouseInvites.set(cleanHouseId, 'declined');
        saveHandledHouseInvites();

        if (activityItem) activityItem.is_unread = false;

        // Mark DOM card as read and remove action buttons
        const cards = document.querySelectorAll(`.notif-item-card[data-house-id="${cleanHouseId}"]`);
        cards.forEach(card => {
          card.classList.remove('is-unread');
          const dot = card.querySelector('.notif-unread-dot');
          if (dot) dot.remove();
          const actWrap = card.querySelector('.notif-house-actions');
          if (actWrap) {
            actWrap.innerHTML = '<span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">✕ Declined</span>';
          }
        });
        updateUnreadNotificationBadge();

        const promptModal = document.getElementById('modal-house-invite-prompt');
        if (promptModal) promptModal.style.display = 'none';
      } else {
        const err = (res && res.error) || 'Failed to decline house invitation';
        showAlert('error', err);
      }
    } catch (err) {
      showAlert('error', `Error: ${err.message}`);
    }
  }

  async function showHouseInvitePromptModal(houseId, parsedInfo = null) {
    const modal = document.getElementById('modal-house-invite-prompt');
    if (!modal || !houseId) return;

    const imgEl = document.getElementById('house-prompt-avatar');
    const fallbackEl = document.getElementById('house-prompt-avatar-fallback');
    const nameEl = document.getElementById('house-prompt-name');
    const inviterEl = document.getElementById('house-prompt-inviter-text');
    const memberCountEl = document.getElementById('house-prompt-member-count');
    const policyTextEl = document.getElementById('house-prompt-policy-text');
    const btnAccept = document.getElementById('btn-house-prompt-accept');
    const btnDecline = document.getElementById('btn-house-prompt-decline');

    if (nameEl) nameEl.textContent = (parsedInfo && parsedInfo.roomClubName) || 'Loading House...';
    if (inviterEl) {
      const inviterName = parsedInfo && parsedInfo.inviter && parsedInfo.inviter.name ? parsedInfo.inviter.name : 'Someone';
      inviterEl.textContent = `${inviterName} invited you to join this House.`;
    }
    if (imgEl) imgEl.style.display = 'none';
    if (fallbackEl) {
      fallbackEl.style.display = 'flex';
      fallbackEl.textContent = '🏰';
    }
    if (memberCountEl) memberCountEl.textContent = '...';
    if (policyTextEl) policyTextEl.textContent = '...';

    modal.style.display = 'flex';
    bringModalToFront(modal);

    try {
      const res = await window.powerdeckAPI.getSocialClub(houseId, {});
      if (res && res.success && res.data && res.data.social_club) {
        const sc = res.data.social_club;
        if (nameEl) nameEl.textContent = sc.name || 'House';
        if (sc.photo_url && imgEl) {
          imgEl.src = sc.photo_url;
          imgEl.style.display = 'block';
          if (fallbackEl) fallbackEl.style.display = 'none';
        } else if (fallbackEl) {
          fallbackEl.textContent = (sc.name || 'H').charAt(0).toUpperCase();
        }
        if (memberCountEl) memberCountEl.textContent = sc.num_members ? Number(sc.num_members).toLocaleString() : '0';
        if (policyTextEl) policyTextEl.textContent = sc.is_membership_open ? 'Open' : (sc.waitlist_enabled ? 'Waitlist' : 'Invite-Only');
      }
    } catch (_) {}

    if (btnAccept) {
      btnAccept.disabled = false;
      btnAccept.innerHTML = '<span>✓ Accept Invitation</span>';
      btnAccept.onclick = async () => {
        btnAccept.disabled = true;
        btnAccept.innerHTML = '<span>⏳ Joining...</span>';
        await acceptHouseInvitation(houseId);
      };
    }

    if (btnDecline) {
      btnDecline.disabled = false;
      btnDecline.innerHTML = '<span>✕ Decline</span>';
      btnDecline.onclick = async () => {
        btnDecline.disabled = true;
        btnDecline.innerHTML = '<span>⏳ Declining...</span>';
        await declineHouseInvitation(houseId);
      };
    }
  }

  // ============================================================
  // SOCIAL CLUB (HOUSE) INVITE DIALOG & MEMBER INVITER SYSTEM
  // ============================================================

  let currentInviteClubId = null;
  let currentInviteClubInfo = null;
  let currentInviteLink = '';
  let currentInviteUsers = [];
  let currentInviteTab = 'available'; // 'available' | 'pending'
  let currentInviteFilter = '';
  let isAutoAddingInvites = false;
  let autoAddStopRequested = false;

  function updateHomeAutoAddNotification() {}

  async function openClubInviteModal(socialClubId, clubInfo = null) {
    const modal = document.getElementById('modal-club-invite-dialog');
    if (!modal) return;

    const targetClubId = String(socialClubId || viewingClubId || '').trim();
    if (!targetClubId) return;

    currentInviteClubId = targetClubId;
    currentInviteClubInfo = clubInfo || currentViewingClub || {};
    currentInviteTab = 'available';
    currentInviteFilter = '';
    currentInviteUsers = [];
    isAutoAddingInvites = false;
    autoAddStopRequested = false;

    // Reset UI
    const titleEl = document.getElementById('club-invite-modal-title');
    if (titleEl) titleEl.textContent = `Invite to ${currentInviteClubInfo.name || 'House'}`;

    const linkInput = document.getElementById('club-invite-link-input');
    if (linkInput) linkInput.value = 'Fetching invite link...';

    const numBadge = document.getElementById('club-invite-num-badge');
    if (numBadge) numBadge.textContent = 'Active Link';

    const searchInput = document.getElementById('club-invite-search-filter');
    if (searchInput) searchInput.value = '';

    const statusBanner = document.getElementById('club-invite-status-banner');
    if (statusBanner) statusBanner.style.display = 'none';

    updateInviteTabButtons();

    const listEl = document.getElementById('club-invite-users-list');
    if (listEl) {
      listEl.innerHTML = '<div style="text-align: center; padding: 32px; color: var(--text-muted);">⏳ Loading contacts and users for invite...</div>';
    }

    modal.style.display = 'flex';
    bringModalToFront(modal);

    // 1. Fetch Invite Link (/api/get_social_club_link)
    (async () => {
      try {
        const linkRes = await window.powerdeckAPI.getSocialClubLink(currentInviteClubId, 4);
        if (linkRes && linkRes.success && linkRes.url) {
          currentInviteLink = linkRes.url;
          if (linkInput) linkInput.value = currentInviteLink;
          if (numBadge) {
            numBadge.textContent = (linkRes.num_invites !== undefined && linkRes.num_invites !== null)
              ? `${linkRes.num_invites} invite${linkRes.num_invites === 1 ? '' : 's'} left`
              : 'Active Link';
          }
        } else {
          if (linkInput) {
            linkInput.value = currentInviteClubInfo.slug
              ? `https://www.clubhouse.com/house/${currentInviteClubInfo.slug}`
              : 'Unable to generate unique link';
          }
        }
      } catch (err) {
        if (linkInput) linkInput.value = 'Error fetching link';
      }
    })();

    // 2. Fetch Users & Contacts for Invites (/api/get_social_club_users_and_contacts_for_invites)
    try {
      const usersRes = await window.powerdeckAPI.getSocialClubUsersForInvites(currentInviteClubId, []);
      if (usersRes && usersRes.success && usersRes.data) {
        const rawList = usersRes.data.invites || usersRes.data.users || usersRes.data.contacts || usersRes.data.suggested_users || (Array.isArray(usersRes.data) ? usersRes.data : []);
        currentInviteUsers = rawList.map(item => {
          const u = item.user || item;
          const uId = u.user_id || item.user_id;
          const uName = u.name || item.name || 'Member';
          const uUsername = u.username || item.username || '';
          const uPhoto = u.photo_url || item.photo_url || '';
          const hasBeenInvited = Boolean(item.has_been_invited || u.has_been_invited || item.is_pending);
          return {
            user_id: uId,
            name: uName,
            username: uUsername,
            photo_url: uPhoto,
            has_been_invited: hasBeenInvited,
            raw: item
          };
        }).filter(u => u.user_id);

        updateInviteCounts();
        renderInviteUsersList();
      } else {
        const errMsg = (usersRes && usersRes.error) || 'Failed to load invite users';
        if (listEl) {
          listEl.innerHTML = `<div style="text-align: center; padding: 32px; color: var(--error);">${escapeHtml(errMsg)}</div>`;
        }
      }
    } catch (err) {
      if (listEl) {
        listEl.innerHTML = `<div style="text-align: center; padding: 32px; color: var(--error);">Error: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function updateInviteCounts() {
    const availCount = currentInviteUsers.filter(u => !u.has_been_invited).length;
    const pendingCount = currentInviteUsers.filter(u => u.has_been_invited).length;

    const bAvail = document.getElementById('badge-club-invite-avail-count');
    const bPending = document.getElementById('badge-club-invite-pending-count');
    if (bAvail) bAvail.textContent = availCount;
    if (bPending) bPending.textContent = pendingCount;
  }

  function updateInviteTabButtons() {
    const tabAvail = document.getElementById('tab-club-invite-available');
    const tabPending = document.getElementById('tab-club-invite-pending');
    if (tabAvail && tabPending) {
      if (currentInviteTab === 'available') {
        tabAvail.classList.add('active');
        tabPending.classList.remove('active');
      } else {
        tabAvail.classList.remove('active');
        tabPending.classList.add('active');
      }
    }
  }

  function renderInviteUsersList() {
    const listEl = document.getElementById('club-invite-users-list');
    if (!listEl) return;

    let users = currentInviteUsers.filter(u => {
      if (currentInviteTab === 'available') return !u.has_been_invited;
      return u.has_been_invited;
    });

    if (currentInviteFilter) {
      const q = currentInviteFilter.toLowerCase();
      users = users.filter(u =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.username && u.username.toLowerCase().includes(q))
      );
    }

    if (users.length === 0) {
      const emptyMsg = currentInviteFilter
        ? 'No matching users found.'
        : (currentInviteTab === 'available' ? 'No available contacts to invite right now.' : 'No pending invitations.');
      listEl.innerHTML = `<div style="text-align: center; padding: 36px 12px; color: var(--text-muted); font-size: 13px;">${emptyMsg}</div>`;
      return;
    }

    listEl.innerHTML = users.map(u => {
      const initial = (u.name || 'U').charAt(0).toUpperCase();
      const actionHtml = currentInviteTab === 'available'
        ? `<button type="button" class="btn btn-sm btn-user-invite-action" data-user-id="${u.user_id}">
             <span>+</span> <span>Invite</span>
           </button>`
        : `<span class="badge-invite-pending">
             <span>⏳</span> <span>Invited</span>
           </span>`;

      return `
        <div class="club-invite-user-row" id="club-invite-row-${u.user_id}">
          <div class="club-invite-avatar-wrap">
            ${u.photo_url
              ? `<img src="${escapeHtml(u.photo_url)}" alt="${escapeHtml(u.name)}" class="club-invite-avatar" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                 <div class="club-invite-avatar-fallback" style="display: none;">${initial}</div>`
              : `<div class="club-invite-avatar-fallback">${initial}</div>`}
          </div>
          <div class="club-invite-user-info">
            <div class="club-invite-user-name">${escapeHtml(u.name)}</div>
            <div class="club-invite-user-sub">${u.username ? '@' + escapeHtml(u.username) : 'Clubhouse Member'}</div>
          </div>
          <div class="club-invite-action-area">
            ${actionHtml}
          </div>
        </div>
      `;
    }).join('');

    // Wire single invite buttons
    listEl.querySelectorAll('.btn-user-invite-action').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const userId = btn.getAttribute('data-user-id');
        const user = currentInviteUsers.find(u => String(u.user_id) === String(userId));
        if (!user || !currentInviteClubId) return;

        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> <span>Inviting...</span>';

        try {
          const res = await window.powerdeckAPI.addSocialClubMember(currentInviteClubId, user.user_id, false, 4);
          if (res && res.success) {
            user.has_been_invited = true;
            updateInviteCounts();
            btn.className = 'badge-invite-pending';
            btn.innerHTML = '<span>✓</span> <span>Invited</span>';
            showAlert('success', `Invited ${user.name} to house!`);
          } else if (res && (res.status === 429 || res.isRateLimited)) {
            btn.disabled = false;
            btn.innerHTML = '<span>+</span> <span>Invite</span>';
            showInviteStatusBanner('⚠️ Rate limited by Clubhouse (HTTP 429). Please wait a moment before trying again.', 'warning');
          } else {
            btn.disabled = false;
            btn.innerHTML = '<span>+</span> <span>Invite</span>';
            showAlert('error', (res && res.error) || 'Failed to send invite');
          }
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = '<span>+</span> <span>Invite</span>';
          showAlert('error', `Error: ${err.message}`);
        }
      });
    });
  }

  function showInviteStatusBanner(text, type = 'warning', showStop = false) {
    const banner = document.getElementById('club-invite-status-banner');
    const txtEl = document.getElementById('club-invite-status-text');
    const iconEl = document.getElementById('club-invite-status-icon');
    const stopBtn = document.getElementById('btn-club-invite-status-stop');
    if (!banner || !txtEl) return;

    banner.style.display = 'block';
    txtEl.textContent = text;
    if (iconEl) iconEl.textContent = type === 'warning' ? '⏳' : (type === 'error' ? '❌' : '⚡');
    if (stopBtn) stopBtn.style.display = showStop ? 'inline-block' : 'none';
  }

  function hideInviteStatusBanner() {
    const banner = document.getElementById('club-invite-status-banner');
    if (banner) banner.style.display = 'none';
  }

  function stopAutoAddClubMembers() {}
  async function startAutoAddClubMembers() {}

  function setupClubInviteDialogEvents() {
    const modal = document.getElementById('modal-club-invite-dialog');
    const btnCloseHeader = document.getElementById('btn-close-club-invite-modal');
    const btnCloseFooter = document.getElementById('btn-close-club-invite-footer');
    const btnCopyLink = document.getElementById('btn-club-invite-copy-link');
    const linkInput = document.getElementById('club-invite-link-input');
    const tabAvail = document.getElementById('tab-club-invite-available');
    const tabPending = document.getElementById('tab-club-invite-pending');
    const searchInput = document.getElementById('club-invite-search-filter');

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    if (btnCloseHeader) btnCloseHeader.onclick = closeModal;
    if (btnCloseFooter) btnCloseFooter.onclick = closeModal;

    const copyInviteLink = async () => {
      if (!currentInviteLink && linkInput) currentInviteLink = linkInput.value;
      if (currentInviteLink && currentInviteLink.startsWith('http')) {
        await window.powerdeckAPI.copyToClipboard(currentInviteLink);
        const copyTxt = document.getElementById('club-invite-copy-btn-text');
        if (copyTxt) {
          copyTxt.textContent = '✓ Copied!';
          setTimeout(() => { if (copyTxt) copyTxt.textContent = 'Copy Link'; }, 2000);
        }
        showAlert('success', 'House invite link copied to clipboard!');
      }
    };

    if (btnCopyLink) btnCopyLink.onclick = copyInviteLink;
    if (linkInput) linkInput.onclick = copyInviteLink;

    if (tabAvail) {
      tabAvail.onclick = () => {
        currentInviteTab = 'available';
        updateInviteTabButtons();
        renderInviteUsersList();
      };
    }

    if (tabPending) {
      tabPending.onclick = () => {
        currentInviteTab = 'pending';
        updateInviteTabButtons();
        renderInviteUsersList();
      };
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentInviteFilter = e.target.value.trim();
        renderInviteUsersList();
      });
    }

    // Modal House Invite Prompt close
    const promptModal = document.getElementById('modal-house-invite-prompt');
    const btnClosePrompt = document.getElementById('btn-close-house-invite-prompt');
    if (btnClosePrompt) {
      btnClosePrompt.onclick = () => {
        if (promptModal) promptModal.style.display = 'none';
      };
    }
  }

  function setupHallwayEvents() {
    // Search & Direct Channel Link Join Bar
    const searchInput = document.getElementById('hallway-search-input');
    const detBanner = document.getElementById('detected-channel-banner');
    const detIdEl = document.getElementById('detected-channel-id');
    const detActiveBadge = document.getElementById('det-active-badge');
    const btnQuickJoinDet = document.getElementById('btn-quick-join-detected');

    // Room Invite Preview Box
    const invitePreviewBox = document.getElementById('room-invite-preview-box');
    const inviteInviterPhoto = document.getElementById('invite-inviter-photo');
    const inviteInviterFallback = document.getElementById('invite-inviter-fallback');
    const inviteInviterName = document.getElementById('invite-inviter-name');
    const inviteRoomTopic = document.getElementById('invite-room-topic');
    const inviteClubRow = document.getElementById('invite-club-row');
    const inviteClubPhoto = document.getElementById('invite-club-photo');
    const inviteClubName = document.getElementById('invite-club-name');
    const inviteStatePill = document.getElementById('invite-state-pill');
    const inviteChannelPill = document.getElementById('invite-channel-pill');
    const btnJoinInviteStage = document.getElementById('btn-join-invite-stage');
    const btnCloseInviteBox = document.getElementById('btn-close-invite-box');

    let currentActiveInviteData = null;

    async function showRoomInvitePreview(inviteCode) {
      if (!inviteCode) return;
      if (detBanner) detBanner.style.display = 'none';
      if (searchResultsOverlay) searchResultsOverlay.style.display = 'none';

      currentActiveInviteData = null;

      if (invitePreviewBox) {
        invitePreviewBox.style.display = 'flex';
        if (inviteInviterName) inviteInviterName.textContent = 'Resolving invite...';
        if (inviteRoomTopic) inviteRoomTopic.textContent = 'Fetching channel details from Clubhouse...';
        if (inviteChannelPill) inviteChannelPill.textContent = `Invite: ${inviteCode}`;
        if (inviteStatePill) {
          inviteStatePill.textContent = '⏳ Loading...';
          inviteStatePill.style.background = 'rgba(56, 189, 248, 0.2)';
          inviteStatePill.style.color = '#38bdf8';
        }
        if (btnJoinInviteStage) {
          btnJoinInviteStage.disabled = true;
          btnJoinInviteStage.innerHTML = '<span>⏳ Resolving...</span>';
        }
      }

      try {
        const res = await window.powerdeckAPI.getContentInviteInfo(inviteCode);
        console.log('[Clubhouse] get_content_invite_info response:', res);

        if (!res || !res.success || !res.data) {
          const err = (res && res.error) || 'Could not resolve channel invite info';
          showAlert('warning', err);
          if (invitePreviewBox) invitePreviewBox.style.display = 'none';
          return;
        }

        const data = res.data;
        currentActiveInviteData = data;

        const inviter = data.inviter || {};
        const channel = data.channel || {};
        const socialClub = data.social_club || {};

        if (inviteInviterName) {
          inviteInviterName.textContent = inviter.name || 'Clubhouse Member';
        }
        if (inviteInviterPhoto) {
          if (inviter.photo_url) {
            inviteInviterPhoto.src = inviter.photo_url;
            inviteInviterPhoto.style.display = 'block';
            if (inviteInviterFallback) inviteInviterFallback.style.display = 'none';
          } else {
            inviteInviterPhoto.style.display = 'none';
            if (inviteInviterFallback) {
              inviteInviterFallback.style.display = 'flex';
              inviteInviterFallback.textContent = (inviter.name || 'M').charAt(0).toUpperCase();
            }
          }
        }

        if (inviteRoomTopic) {
          inviteRoomTopic.textContent = channel.topic || 'Live Clubhouse Channel';
        }

        if (inviteClubRow && inviteClubName) {
          if (socialClub && socialClub.name) {
            inviteClubName.textContent = socialClub.name;
            if (inviteClubPhoto) {
              if (socialClub.photo_url) {
                inviteClubPhoto.src = socialClub.photo_url;
                inviteClubPhoto.style.display = 'inline-block';
              } else {
                inviteClubPhoto.style.display = 'none';
              }
            }
            inviteClubRow.style.display = 'flex';
          } else {
            inviteClubRow.style.display = 'none';
          }
        }

        const isLive = data.state === 'live' || channel.is_live;
        if (inviteStatePill) {
          inviteStatePill.textContent = isLive ? '🟢 Live Channel' : `State: ${data.state || 'Ended'}`;
          inviteStatePill.style.background = isLive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
          inviteStatePill.style.color = isLive ? '#10b981' : '#ef4444';
        }

        if (inviteChannelPill) {
          inviteChannelPill.textContent = `Channel: ${channel.channel || inviteCode}`;
        }

        if (btnJoinInviteStage) {
          btnJoinInviteStage.disabled = false;
          btnJoinInviteStage.innerHTML = '<span>🚀 Join Channel</span>';
        }

      } catch (err) {
        console.error('Failed to get invite info:', err);
        showAlert('error', `Invite error: ${err.message}`);
        if (invitePreviewBox) invitePreviewBox.style.display = 'none';
      }
    }

    function joinFromActiveInvite() {
      if (!currentActiveInviteData) return;
      const channel = currentActiveInviteData.channel || {};
      const targetToJoin = channel.presigned_channel_hash || channel.channel || currentActiveInviteData.invite_code;
      if (!targetToJoin) {
        showAlert('error', 'No channel target found in invite response');
        return;
      }
      if (invitePreviewBox) invitePreviewBox.style.display = 'none';
      joinChannelById({
        channel: targetToJoin,
        source: 17,
        invite_code: currentActiveInviteData.invite_code || (typeof targetToJoin === 'string' ? extractInviteCode(targetToJoin) : '')
      });
    }

    if (btnJoinInviteStage) {
      btnJoinInviteStage.addEventListener('click', joinFromActiveInvite);
    }

    if (btnCloseInviteBox) {
      btnCloseInviteBox.addEventListener('click', () => {
        currentActiveInviteData = null;
        if (invitePreviewBox) invitePreviewBox.style.display = 'none';
      });
    }

    async function executeSearchAction() {
      const val = searchInput ? searchInput.value.trim() : '';

      // 0. Invite Link or Invite Code
      const inviteCode = extractInviteCode(val) || (currentActiveInviteData && currentActiveInviteData.invite_code);
      if (inviteCode) {
        if (currentActiveInviteData && (
          currentActiveInviteData.invite_code === inviteCode ||
          (currentActiveInviteData.channel && (currentActiveInviteData.channel.channel === inviteCode || currentActiveInviteData.channel.presigned_channel_hash === inviteCode))
        )) {
          joinFromActiveInvite();
          return;
        }
        showAlert('info', `Resolving Clubhouse invite ${inviteCode}...`);
        try {
          const res = await window.powerdeckAPI.getContentInviteInfo(inviteCode);
          if (res && res.success && res.data && res.data.channel) {
            currentActiveInviteData = res.data;
            joinFromActiveInvite();
            return;
          }
        } catch (err) {
          console.warn("Direct invite resolve notice:", err);
        }
      }

      // 1. Direct Channel Link or ID
      if (detectedDirectChannelId) {
        const isAlreadyActive = Boolean(currentActiveRoom && (
          currentActiveRoom.channel === detectedDirectChannelId ||
          currentActiveRoom.id === detectedDirectChannelId
        ));
        if (isAlreadyActive) {
          const splitCont = document.getElementById('hallway-split-container');
          if (splitCont) splitCont.classList.remove('no-active-room');
          const channelViewport = document.getElementById('channel-viewport');
          if (channelViewport) {
            channelViewport.scrollIntoView({ behavior: 'smooth' });
            channelViewport.classList.add('viewport-highlight');
            setTimeout(() => channelViewport.classList.remove('viewport-highlight'), 1200);
          }
          showAlert('info', `Active Channel: You are already live in "${currentActiveRoom.title || detectedDirectChannelId}"!`);
          return;
        }
        joinChannelById(detectedDirectChannelId);
        return;
      }

      // 2. Profile Link or Username
      if (detectedProfileUsername) {
        openUserProfileModal(null, 'search', detectedProfileUsername, false);
        return;
      }

      // 3. House Link or Slug
      if (detectedHouseSlug) {
        openClubModal(detectedSocialClubObj || detectedHouseSlug);
        return;
      }

      // Immediate extract fallbacks in case user pasted and pressed Enter without typing
      const chId = extractChannelId(val);
      if (chId) {
        const isAlreadyActive = Boolean(currentActiveRoom && (
          currentActiveRoom.channel === chId ||
          currentActiveRoom.id === chId
        ));
        if (isAlreadyActive) {
          const splitCont = document.getElementById('hallway-split-container');
          if (splitCont) splitCont.classList.remove('no-active-room');
          const channelViewport = document.getElementById('channel-viewport');
          if (channelViewport) {
            channelViewport.scrollIntoView({ behavior: 'smooth' });
            channelViewport.classList.add('viewport-highlight');
            setTimeout(() => channelViewport.classList.remove('viewport-highlight'), 1200);
          }
          showAlert('info', `Active Channel: Already connected to "${currentActiveRoom.title || chId}"!`);
          return;
        }
        joinChannelById(chId);
        return;
      }

      const profU = extractProfileUsername(val);
      if (profU) {
        openUserProfileModal(null, 'search', profU, false);
        return;
      }

      const hSlug = extractHouseSlug(val);
      if (hSlug) {
        openClubModal(hSlug);
        return;
      }

      // 4. Keyword Search
      if (val.length >= 2) {
        performSearch(val);
      } else {
        showAlert('warning', 'Type a search keyword, username, or paste a link and press Enter ↵');
      }
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        currentSearchQuery = val;

        if (btnClearSearch) {
          btnClearSearch.style.display = val ? 'flex' : 'none';
        }

        const inviteCode = extractInviteCode(val);
        const profileUsername = extractProfileUsername(val);
        const houseSlug = extractHouseSlug(val);
        const detectedId = extractChannelId(val);

        if (inviteCode) {
          detectedDirectChannelId = null;
          detectedProfileUsername = null;
          detectedHouseSlug = null;
          detectedSocialClubObj = null;
          if (detBanner) {
            detBanner.classList.remove('is-active-room');
            detBanner.style.display = 'none';
          }
          if (searchResultsOverlay) searchResultsOverlay.style.display = 'none';
          showRoomInvitePreview(inviteCode);
          renderRoomsFeed();
          return;
        }

        if (invitePreviewBox) {
          invitePreviewBox.style.display = 'none';
        }

        const detIcon = detBanner ? detBanner.querySelector('.det-icon') : null;
        const detLabel = detBanner ? detBanner.querySelector('.det-text') : null;

        if (profileUsername) {
          detectedProfileUsername = profileUsername;
          detectedHouseSlug = null;
          detectedSocialClubObj = null;
          detectedDirectChannelId = null;

          if (detBanner && detIdEl) {
            detBanner.classList.remove('is-active-room');
            if (detIcon) detIcon.textContent = '👤';
            if (detLabel) detLabel.textContent = 'Profile Link:';
            detIdEl.textContent = '@' + profileUsername;
            if (detActiveBadge) detActiveBadge.style.display = 'none';
            if (btnQuickJoinDet) btnQuickJoinDet.textContent = 'View Profile';
            detBanner.style.display = 'flex';
          }

          // If a full URL was pasted, automatically clean the search input to the username
          if (val.includes('clubhouse.com') || val.includes('http')) {
            searchInput.value = profileUsername;
            currentSearchQuery = profileUsername;
          }

          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = setTimeout(() => {
            performSearch(profileUsername);
          }, 250);

        } else if (houseSlug) {
          detectedHouseSlug = houseSlug;
          detectedProfileUsername = null;
          detectedDirectChannelId = null;
          detectedSocialClubObj = null;

          if (detBanner && detIdEl) {
            detBanner.classList.remove('is-active-room');
            if (detIcon) detIcon.textContent = '🏰';
            if (detLabel) detLabel.textContent = 'House Link:';
            detIdEl.textContent = houseSlug;
            if (detActiveBadge) detActiveBadge.style.display = 'none';
            if (btnQuickJoinDet) btnQuickJoinDet.textContent = 'View House';
            detBanner.style.display = 'flex';
          }

          // Fetch the social club details from Clubhouse API using the slug reference
          (async () => {
            try {
              const res = await window.powerdeckAPI.getSocialClub(null, null, houseSlug);
              if (res && res.success && res.data && res.data.social_club) {
                const sc = res.data.social_club;
                detectedSocialClubObj = sc;
                if (detIdEl && detectedHouseSlug === houseSlug) {
                  const countStr = sc.num_members ? ` (${Number(sc.num_members).toLocaleString()} members)` : '';
                  detIdEl.textContent = `${sc.name}${countStr}`;
                  if (detLabel) detLabel.textContent = 'House:';
                }
                if (sc.name) {
                  if (val.includes('clubhouse.com') || val.includes('http')) {
                    searchInput.value = sc.name;
                    currentSearchQuery = sc.name;
                  }
                  performSearch(sc.name);
                }
              }
            } catch (err) {
              console.warn("Failed to fetch social club info from slug:", err);
            }
          })();

        } else if (detectedId) {
          detectedDirectChannelId = detectedId;
          detectedProfileUsername = null;
          detectedHouseSlug = null;
          detectedSocialClubObj = null;

          const isActiveChannel = Boolean(currentActiveRoom && (
            currentActiveRoom.channel === detectedId || currentActiveRoom.id === detectedId
          ));

          if (detBanner && detIdEl) {
            if (isActiveChannel) {
              detBanner.classList.add('is-active-room');
              if (detIcon) detIcon.textContent = '🟢';
              if (detLabel) detLabel.textContent = 'Active Channel:';
              detIdEl.textContent = `${currentActiveRoom.title || detectedId} (Already Live)`;
              if (detActiveBadge) detActiveBadge.style.display = 'inline-block';
              if (btnQuickJoinDet) btnQuickJoinDet.textContent = 'View Channel';
            } else {
              detBanner.classList.remove('is-active-room');
              if (detIcon) detIcon.textContent = '🎙️';
              if (detLabel) detLabel.textContent = 'Clubhouse Room:';
              detIdEl.textContent = detectedId;
              if (detActiveBadge) detActiveBadge.style.display = 'none';
              if (btnQuickJoinDet) btnQuickJoinDet.textContent = 'Join Channel';
            }
            detBanner.style.display = 'flex';
          }
          if (searchResultsOverlay) searchResultsOverlay.style.display = 'none';

        } else {
          detectedDirectChannelId = null;
          detectedProfileUsername = null;
          detectedHouseSlug = null;
          detectedSocialClubObj = null;

          if (detBanner) {
            detBanner.classList.remove('is-active-room');
            detBanner.style.display = 'none';
          }

          if (val.length >= 2) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
              performSearch(val);
            }, 300);
          } else {
            if (searchResultsOverlay) searchResultsOverlay.style.display = 'none';
          }
        }

        renderRoomsFeed();
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          executeSearchAction();
        }
      });
    }

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        currentSearchQuery = '';
        detectedDirectChannelId = null;
        detectedProfileUsername = null;
        detectedHouseSlug = null;
        detectedSocialClubObj = null;
        currentActiveInviteData = null;
        if (invitePreviewBox) invitePreviewBox.style.display = 'none';
        if (detBanner) {
          detBanner.classList.remove('is-active-room');
          detBanner.style.display = 'none';
        }
        if (searchResultsOverlay) searchResultsOverlay.style.display = 'none';
        btnClearSearch.style.display = 'none';
        renderRoomsFeed();
      });
    }

    if (btnQuickJoinDet) {
      btnQuickJoinDet.addEventListener('click', executeSearchAction);
    }

    // Search Tabs Navigation
    const sTabs = [tabSearchAll, tabSearchUsers, tabSearchClubs, tabSearchRooms];
    sTabs.forEach(tab => {
      if (tab) {
        tab.addEventListener('click', () => {
          sTabs.forEach(t => t && t.classList.remove('active'));
          tab.classList.add('active');
          activeSearchTab = tab.getAttribute('data-tab') || 'all';
          renderSearchResults();
        });
      }
    });

    // Close Search Results Overlay
    if (btnCloseSearchResults) {
      btnCloseSearchResults.addEventListener('click', () => {
        if (searchResultsOverlay) searchResultsOverlay.style.display = 'none';
      });
    }

    // Room Details Modal Close & Action Listeners
    if (btnCloseRoomDetailsModal) {
      btnCloseRoomDetailsModal.addEventListener('click', closeRoomDetailsModal);
    }
    if (btnDismissRoomDetails) {
      btnDismissRoomDetails.addEventListener('click', closeRoomDetailsModal);
    }
    if (modalRoomDetails) {
      modalRoomDetails.addEventListener('click', (e) => {
        if (e.target === modalRoomDetails) closeRoomDetailsModal();
      });
    }
    if (btnCopyRoomDetailsUrl) {
      btnCopyRoomDetailsUrl.addEventListener('click', () => {
        const urlInput = document.getElementById('room-details-url-input');
        if (urlInput && urlInput.value) {
          window.powerdeckAPI.copyToClipboard(urlInput.value);
          btnCopyRoomDetailsUrl.textContent = '✓ Copied!';
          showAlert('info', 'Room link copied to clipboard!');
          setTimeout(() => { btnCopyRoomDetailsUrl.textContent = '📋 Copy'; }, 1800);
        }
      });
    }
    if (btnOpenRoomDetailsUrl) {
      btnOpenRoomDetailsUrl.addEventListener('click', () => {
        const urlInput = document.getElementById('room-details-url-input');
        if (urlInput && urlInput.value && window.powerdeckAPI?.openExternal) {
          window.powerdeckAPI.openExternal(urlInput.value);
        }
      });
    }

    // Person Profile Modal Close & Follow Action
    if (modalUserProfile) {
      modalUserProfile.addEventListener('click', (e) => {
        if (e.target === modalUserProfile) {
          closeUserProfileModal();
        }
      });
    }
    if (btnCloseProfileModal) {
      btnCloseProfileModal.addEventListener('click', () => {
        closeUserProfileModal();
      });
    }
    if (btnPmClose) {
      btnPmClose.addEventListener('click', () => {
        closeUserProfileModal();
      });
    }
    if (btnPmFollow) {
      btnPmFollow.addEventListener('click', async () => {
        await toggleFollowUser();
      });
    }

    const btnPmReact = document.getElementById('btn-pm-react');
    if (btnPmReact) {
      btnPmReact.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = (currentViewingProfile && currentViewingProfile.user_id) || viewingProfileUserId;
        if (uid) {
          showTargetReactionPalette(btnPmReact, uid);
        }
      });
    }

    const btnPmCopyLink = document.getElementById('btn-pm-copy-link');
    if (btnPmCopyLink) {
      btnPmCopyLink.addEventListener('click', async () => {
        const up = currentViewingProfile || {};
        const username = up.username || (pmUsername ? pmUsername.textContent.replace(/^@/, '') : '');
        const link = up.url || (username ? `https://www.clubhouse.com/@${username}` : (viewingProfileUserId ? `https://www.clubhouse.com/@${viewingProfileUserId}` : ''));
        if (link) {
          await window.powerdeckAPI.copyToClipboard(link);
          showAlert('info', `Profile link copied: ${link}`);
          const origHtml = btnPmCopyLink.innerHTML;
          btnPmCopyLink.innerHTML = '<span>✓ Copied!</span>';
          setTimeout(() => { btnPmCopyLink.innerHTML = origHtml; }, 2000);
        }
      });
    }

    const btnPmRemove = document.getElementById('btn-pm-remove-from-room');
    if (btnPmRemove) {
      btnPmRemove.addEventListener('click', async () => {
        if (!currentActiveRoom || !currentActiveRoom.channel || !viewingProfileUserId) return;
        const uName = (currentViewingProfile && (currentViewingProfile.name || currentViewingProfile.username)) || (pmName ? pmName.textContent : 'member');
        btnPmRemove.disabled = true;
        try {
          const res = await window.powerdeckAPI.blockFromChannel(currentActiveRoom.channel, Number(viewingProfileUserId));
          if (res && res.success !== false) {
            showAlert('success', `Removed ${uName} from room`);
            if (modalUserProfile) modalUserProfile.style.display = 'none';
            await refreshActiveChannelState();
          } else {
            showAlert('warning', (res && res.error) || `Failed to remove ${uName} from room`);
          }
        } catch (err) {
          showAlert('error', err.message);
        } finally {
          btnPmRemove.disabled = false;
        }
      });
    }

    // Avatar Click -> View Photo History in Lightbox
    const pmAvatarWrap = document.getElementById('pm-avatar-wrap');
    if (pmAvatarWrap) {
      pmAvatarWrap.addEventListener('click', () => {
        const uid = (currentViewingProfile && currentViewingProfile.user_id) || viewingProfileUserId;
        const name = (currentViewingProfile && (currentViewingProfile.displayname || currentViewingProfile.name)) || (pmName ? pmName.textContent : 'Member');
        const handle = (currentViewingProfile && currentViewingProfile.username) || (pmUsername ? pmUsername.textContent.replace(/^@/, '') : '');
        const photo = (currentViewingProfile && currentViewingProfile.photo_url) || (pmAvatar ? pmAvatar.src : null);
        if (uid) {
          openPhotoLightbox(uid, name, handle, photo);
        }
      });
    }

    // Followers & Following stats inside member profile modal
    const pmFollowersStatBtn = document.getElementById('pm-followers-stat-btn');
    if (pmFollowersStatBtn) {
      pmFollowersStatBtn.addEventListener('click', () => {
        if (viewingProfileUserId) {
          parentProfileUserId = viewingProfileUserId;
          openSocialGraphModal(viewingProfileUserId, 'followers');
        }
      });
    }
    const pmFollowingStatBtn = document.getElementById('pm-following-stat-btn');
    if (pmFollowingStatBtn) {
      pmFollowingStatBtn.addEventListener('click', () => {
        if (viewingProfileUserId) {
          parentProfileUserId = viewingProfileUserId;
          openSocialGraphModal(viewingProfileUserId, 'following');
        }
      });
    }
    const pmFriendsStatBtn = document.getElementById('pm-friends-stat-btn');
    if (pmFriendsStatBtn) {
      pmFriendsStatBtn.addEventListener('click', () => {
        if (viewingProfileUserId) {
          parentProfileUserId = viewingProfileUserId;
          openSocialGraphModal(viewingProfileUserId, 'cofollows');
        }
      });
    }

    // Top Bar Profile & Slideshow Actions
    if (homeProfileSummary) {
      homeProfileSummary.addEventListener('click', (e) => {
        if (e.target.closest('#btn-notifications') || e.target.closest('.btn-notification-bell') || e.target.closest('.clickable-stat') || e.target.closest('#home-auto-add-pill')) {
          return;
        }
        // If profile avatar or avatar container clicked directly -> open Photo Lightbox!
        if (e.target.closest('.avatar-container') || e.target.closest('#home-avatar') || e.target.closest('#home-avatar-fallback') || e.target.closest('.avatar-hover-edit-badge')) {
          const myId = getLoggedInUserId();
          const myUser = getLoggedInUser() || {};
          const dispName = myUser.displayname || myUser.name || 'Your Photos';
          const handle = myUser.username || '';
          const photo = myUser.photo_url || (homeAvatar ? homeAvatar.src : null);
          if (myId) {
            openPhotoLightbox(myId, dispName, handle, photo);
          }
          return;
        }
        openProfileStudioModal();
      });
    }
    const btnTopGiphy = document.getElementById('btn-top-giphy');
    if (btnTopGiphy) {
      btnTopGiphy.addEventListener('click', () => {
        openGiphyStudioModal();
      });
    }

    // Initialize Giphy studio & GIF reaction events
    setupGiphyStudioEvents();
    // Initialize Moderator Action History events
    setupModeratorHistoryEvents();
    // Initialize Room Activity & PubNub History events
    setupRoomActivityEvents();
    if (homeUserFollowingTag) {
      homeUserFollowingTag.addEventListener('click', (e) => {
        e.stopPropagation();
        const myId = getLoggedInUserId();
        if (myId) openSocialGraphModal(myId, 'following');
      });
    }

    // Social Graph Modal Listeners
    const btnCloseSocialGraph = document.getElementById('btn-close-social-graph');
    const btnDismissSocialGraph = document.getElementById('btn-dismiss-social-graph');
    if (btnCloseSocialGraph) {
      btnCloseSocialGraph.addEventListener('click', () => {
        closeSocialGraphModal();
      });
    }
    if (btnDismissSocialGraph) {
      btnDismissSocialGraph.addEventListener('click', () => {
        closeSocialGraphModal();
      });
    }
    if (modalSocialGraph) {
      modalSocialGraph.addEventListener('click', (e) => {
        if (e.target === modalSocialGraph) {
          closeSocialGraphModal();
        }
      });
    }
    const tabF = document.getElementById('tab-followers');
    if (tabF) {
      tabF.addEventListener('click', () => {
        if (activeSocialGraphUserId) loadSocialGraphData(activeSocialGraphUserId, 'followers');
      });
    }
    const tabG = document.getElementById('tab-following');
    if (tabG) {
      tabG.addEventListener('click', () => {
        if (activeSocialGraphUserId) loadSocialGraphData(activeSocialGraphUserId, 'following');
      });
    }
    const tabM = document.getElementById('tab-friends');
    if (tabM) {
      tabM.addEventListener('click', () => {
        if (activeSocialGraphUserId) loadSocialGraphData(activeSocialGraphUserId, 'cofollows');
      });
    }

    const listSg = document.getElementById('social-graph-list');
    if (listSg) {
      // Auto-load next page / cursor when scrolled near bottom (Infinite Scroll / Swipe)
      listSg.addEventListener('scroll', () => {
        if (listSg.scrollTop + listSg.clientHeight >= listSg.scrollHeight - 120) {
          if (socialGraphHasMore && !socialGraphIsLoadingMore) {
            loadNextSocialGraphPage();
          }
        }
      });

      // Touch / mouse swipe gesture detection
      let touchStartX = 0;
      let touchStartY = 0;
      listSg.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      listSg.addEventListener('touchend', (e) => {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        const diffX = e.changedTouches[0].clientX - touchStartX;
        const diffY = e.changedTouches[0].clientY - touchStartY;

        // Pull down at top -> Refresh current tab
        if (diffY > 70 && Math.abs(diffY) > Math.abs(diffX) && listSg.scrollTop <= 5) {
          if (activeSocialGraphUserId) {
            loadSocialGraphData(activeSocialGraphUserId, activeSocialGraphType, false);
          }
          return;
        }

        // Swipe up near bottom -> Load next page
        if (diffY < -40 && Math.abs(diffY) > Math.abs(diffX)) {
          if (listSg.scrollTop + listSg.clientHeight >= listSg.scrollHeight - 140) {
            if (socialGraphHasMore && !socialGraphIsLoadingMore) {
              loadNextSocialGraphPage();
            }
          }
          return;
        }

        // Horizontal swipe -> Switch between Followers, Following, and Friends
        if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX < 0) {
            // Swiped left
            if (activeSocialGraphType === 'followers') {
              if (activeSocialGraphUserId) loadSocialGraphData(activeSocialGraphUserId, 'following');
            } else if (activeSocialGraphType === 'following') {
              if (activeSocialGraphUserId) loadSocialGraphData(activeSocialGraphUserId, 'cofollows');
            }
          } else if (diffX > 0) {
            // Swiped right
            if (activeSocialGraphType === 'cofollows') {
              if (activeSocialGraphUserId) loadSocialGraphData(activeSocialGraphUserId, 'following');
            } else if (activeSocialGraphType === 'following') {
              if (activeSocialGraphUserId) loadSocialGraphData(activeSocialGraphUserId, 'followers');
            }
          }
        }
      }, { passive: true });
    }
    const searchSg = document.getElementById('social-graph-search');
    if (searchSg) {
      searchSg.addEventListener('input', () => {
        const query = searchSg.value.toLowerCase().trim();
        if (!query) {
          renderSocialGraphUsers(activeSocialGraphUsers);
        } else {
          const filtered = activeSocialGraphUsers.filter(u => {
            const prof = u.user_profile || u.profile || u.user || u;
            const name = prof.name || u.name || '';
            const uname = prof.username || u.username || '';
            const bio = prof.bio || u.bio || '';
            return name.toLowerCase().includes(query) ||
              uname.toLowerCase().includes(query) ||
              bio.toLowerCase().includes(query);
          });
          renderSocialGraphUsers(filtered);
        }
      });
    }

    // Profile Studio Modal Listeners
    const modalProfileStudio = document.getElementById('modal-profile-studio');
    const btnCloseProfileStudio = document.getElementById('btn-close-profile-studio');
    const btnDismissProfileStudio = document.getElementById('btn-dismiss-profile-studio');
    if (btnCloseProfileStudio) {
      btnCloseProfileStudio.addEventListener('click', () => {
        if (modalProfileStudio) modalProfileStudio.style.display = 'none';
      });
    }
    if (btnDismissProfileStudio) {
      btnDismissProfileStudio.addEventListener('click', () => {
        if (modalProfileStudio) modalProfileStudio.style.display = 'none';
      });
    }

    const studioAvatarWrap = document.getElementById('studio-avatar-wrap');
    if (studioAvatarWrap) {
      studioAvatarWrap.addEventListener('click', () => {
        const myId = getLoggedInUserId();
        const myUser = getLoggedInUser() || {};
        const dispName = myUser.displayname || myUser.name || 'Your Photos';
        const handle = myUser.username || '';
        const photo = myUser.photo_url || (document.getElementById('studio-avatar-img') ? document.getElementById('studio-avatar-img').src : null);
        if (myId) {
          openPhotoLightbox(myId, dispName, handle, photo);
        }
      });
    }

    const btnStudioCopyLink = document.getElementById('btn-studio-copy-link');
    if (btnStudioCopyLink) {
      btnStudioCopyLink.addEventListener('click', async () => {
        const u = getLoggedInUser() || {};
        const uname = (u.username || (activeProfile && activeProfile.user && activeProfile.user.username) || '').replace(/^@/, '');
        const link = u.share_url || (activeProfile && activeProfile.user && activeProfile.user.share_url) || (activeProfile && activeProfile._debug && activeProfile._debug.user_profile && activeProfile._debug.user_profile.share_url) || u.url || (uname ? `https://www.clubhouse.com/@${uname}` : '');
        if (link) {
          await window.powerdeckAPI.copyToClipboard(link);
          showAlert('info', `Your profile link copied: ${link}`);
          const origHtml = btnStudioCopyLink.innerHTML;
          btnStudioCopyLink.innerHTML = '<span>✓ Copied!</span>';
          setTimeout(() => { btnStudioCopyLink.innerHTML = origHtml; }, 2000);
        }
      });
    }

    const btnStudioEditName = document.getElementById('btn-studio-edit-name');
    if (btnStudioEditName) btnStudioEditName.addEventListener('click', () => editProfileName());

    const btnStudioEditEmail = document.getElementById('btn-studio-edit-email');
    if (btnStudioEditEmail) btnStudioEditEmail.addEventListener('click', () => editProfileEmail());

    const btnStudioChangePhone = document.getElementById('btn-studio-change-phone');
    if (btnStudioChangePhone) btnStudioChangePhone.addEventListener('click', () => changeProfilePhoneNumber());

    const btnStudioTogglePrivateProfile = document.getElementById('btn-studio-toggle-private-profile');
    if (btnStudioTogglePrivateProfile) btnStudioTogglePrivateProfile.addEventListener('click', () => togglePrivateProfile());

    const btnStudioTogglePrivateConvos = document.getElementById('btn-studio-toggle-private-convos');
    if (btnStudioTogglePrivateConvos) btnStudioTogglePrivateConvos.addEventListener('click', () => togglePrivateConversations());

    const btnStudioAddAlias = document.getElementById('btn-studio-add-alias');
    if (btnStudioAddAlias) btnStudioAddAlias.addEventListener('click', () => editProfileAlias());

    const btnStudioEditAlias = document.getElementById('btn-studio-edit-alias');
    if (btnStudioEditAlias) btnStudioEditAlias.addEventListener('click', () => editProfileAlias());

    const btnStudioRemoveAlias = document.getElementById('btn-studio-remove-alias');
    if (btnStudioRemoveAlias) btnStudioRemoveAlias.addEventListener('click', () => removeProfileAlias());

    const btnStudioEditUsername = document.getElementById('btn-studio-edit-username');
    if (btnStudioEditUsername) btnStudioEditUsername.addEventListener('click', () => editProfileUsername());

    const btnStudioEditBio = document.getElementById('btn-studio-edit-bio');
    if (btnStudioEditBio) btnStudioEditBio.addEventListener('click', () => openBioEditModal());

    const btnStudioRefreshHistory = document.getElementById('btn-studio-refresh-history');
    if (btnStudioRefreshHistory) {
      btnStudioRefreshHistory.addEventListener('click', async () => {
        const myId = getLoggedInUserId();
        if (myId) await loadUserPhotoHistory(myId);
      });
    }

    const btnStudioUploadNew = document.getElementById('btn-studio-upload-new');
    if (btnStudioUploadNew) btnStudioUploadNew.addEventListener('click', () => openPhotoCropperModal());

    const btnStudioChangePhoto = document.getElementById('btn-studio-change-photo');
    if (btnStudioChangePhoto) btnStudioChangePhoto.addEventListener('click', () => openPhotoCropperModal());

    const btnStudioOpenFollowers = document.getElementById('btn-studio-open-followers');
    if (btnStudioOpenFollowers) {
      btnStudioOpenFollowers.addEventListener('click', () => {
        const myId = getLoggedInUserId();
        if (myId) openSocialGraphModal(myId, 'followers');
      });
    }

    const btnStudioOpenFollowing = document.getElementById('btn-studio-open-following');
    if (btnStudioOpenFollowing) {
      btnStudioOpenFollowing.addEventListener('click', () => {
        const myId = getLoggedInUserId();
        if (myId) openSocialGraphModal(myId, 'following');
      });
    }

    const btnStudioOpenFriends = document.getElementById('btn-studio-open-friends');
    if (btnStudioOpenFriends) {
      btnStudioOpenFriends.addEventListener('click', () => {
        const myId = getLoggedInUserId();
        if (myId) openSocialGraphModal(myId, 'cofollows');
      });
    }

    // ============================================================
    // CREATE HOUSE (SOCIAL CLUB) MODAL LISTENERS
    // ============================================================
    const modalCreateHouse = document.getElementById('modal-create-house');
    const btnStudioCreateHouse = document.getElementById('btn-studio-create-house');
    const btnCloseCreateHouse = document.getElementById('btn-close-create-house');
    const btnCancelCreateHouse = document.getElementById('btn-cancel-create-house');
    const btnSubmitCreateHouse = document.getElementById('btn-submit-create-house');
    const inputHouseName = document.getElementById('input-create-house-name');
    const checkAddFollowers = document.getElementById('check-create-house-add-followers');
    const createHouseStatusBox = document.getElementById('create-house-status-box');
    const createHouseStatusText = document.getElementById('create-house-status-text');

    function openCreateHouseModal() {
      if (!modalCreateHouse) return;
      if (inputHouseName) inputHouseName.value = '';
      if (checkAddFollowers) checkAddFollowers.checked = true;
      if (createHouseStatusBox) {
        createHouseStatusBox.style.display = 'none';
        createHouseStatusBox.style.background = 'transparent';
      }
      if (btnSubmitCreateHouse) {
        btnSubmitCreateHouse.disabled = false;
        btnSubmitCreateHouse.innerHTML = '<span>🏰 Create House</span>';
      }
      modalCreateHouse.style.display = 'flex';
      bringModalToFront(modalCreateHouse);
      setTimeout(() => {
        if (inputHouseName) inputHouseName.focus();
      }, 80);
    }

    function closeCreateHouseModal() {
      if (modalCreateHouse) modalCreateHouse.style.display = 'none';
    }

    if (btnStudioCreateHouse) {
      btnStudioCreateHouse.addEventListener('click', () => {
        openCreateHouseModal();
      });
    }

    if (btnCloseCreateHouse) {
      btnCloseCreateHouse.addEventListener('click', closeCreateHouseModal);
    }

    if (btnCancelCreateHouse) {
      btnCancelCreateHouse.addEventListener('click', closeCreateHouseModal);
    }

    if (inputHouseName) {
      inputHouseName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (btnSubmitCreateHouse && !btnSubmitCreateHouse.disabled) {
            btnSubmitCreateHouse.click();
          }
        }
      });
    }

    if (btnSubmitCreateHouse) {
      btnSubmitCreateHouse.addEventListener('click', async () => {
        const houseName = (inputHouseName ? inputHouseName.value : '').trim();
        if (!houseName) {
          showAlert('warning', 'Please enter a name for the house.');
          if (inputHouseName) inputHouseName.focus();
          return;
        }

        const shouldAddFollowers = Boolean(checkAddFollowers && checkAddFollowers.checked);

        // Show "Please wait..."
        btnSubmitCreateHouse.disabled = true;
        btnSubmitCreateHouse.innerHTML = '<span>⏳ Please wait...</span>';
        if (createHouseStatusBox) {
          createHouseStatusBox.style.display = 'block';
          createHouseStatusBox.style.background = 'rgba(88, 101, 242, 0.12)';
          createHouseStatusBox.style.border = '1px solid rgba(88, 101, 242, 0.3)';
          createHouseStatusBox.style.color = '#5865f2';
        }
        if (createHouseStatusText) {
          createHouseStatusText.textContent = 'Please wait... Creating house...';
        }

        try {
          // 1. Create Social Club
          const createRes = await window.powerdeckAPI.createSocialClub({
            name: houseName,
            isPublicFigure: false,
            userIds: []
          });

          if (!createRes || !createRes.success) {
            const errMsg = (createRes && createRes.error) || 'Failed to create house';
            showAlert('error', errMsg);
            if (createHouseStatusBox) {
              createHouseStatusBox.style.background = 'rgba(235, 69, 158, 0.12)';
              createHouseStatusBox.style.border = '1px solid rgba(235, 69, 158, 0.3)';
              createHouseStatusBox.style.color = '#eb459e';
            }
            if (createHouseStatusText) {
              createHouseStatusText.textContent = `Error: ${errMsg}`;
            }
            btnSubmitCreateHouse.disabled = false;
            btnSubmitCreateHouse.innerHTML = '<span>🏰 Create House</span>';
            return;
          }

          // House created successfully!
          const sc = (createRes.data && createRes.data.social_club) || {};
          const socialClubId = sc.social_club_id || (createRes.data && createRes.data.social_club_id);

          // 2. Add followers to social club if requested
          if (shouldAddFollowers && socialClubId) {
            if (createHouseStatusText) {
              createHouseStatusText.textContent = 'Please wait... Inviting followers to house...';
            }
            try {
              const addRes = await window.powerdeckAPI.addFollowersToSocialClub(String(socialClubId));
              if (addRes && addRes.success) {
                showAlert('success', 'House created successfully with followers added!');
              } else {
                const addErrMsg = (addRes && addRes.error) || 'Once per day limit';
                showAlert('warning', `House created, but not invited followers to that house: ${addErrMsg}`);
              }
            } catch (addErr) {
              showAlert('warning', `House created, but not invited followers to that house: ${addErr.message || 'Once per day limit'}`);
            }
          } else {
            showAlert('success', 'House created successfully!');
          }

          closeCreateHouseModal();

          // 3. Refresh Profile Studio houses & create-channel targets
          const myId = getLoggedInUserId();
          if (myId) {
            try {
              const pRes = await window.powerdeckAPI.getProfile(myId);
              if (pRes && pRes.success && pRes.data && pRes.data.user_profile) {
                updateProfileStudioUI(pRes.data.user_profile);
              }
            } catch (pErr) {
              console.warn("Could not reload studio houses:", pErr);
            }
          }
          loadCreateChannelTargets(true).catch(() => {});

        } catch (err) {
          showAlert('error', `House creation error: ${err.message || 'Unknown error'}`);
          if (createHouseStatusBox) {
            createHouseStatusBox.style.background = 'rgba(235, 69, 158, 0.12)';
            createHouseStatusBox.style.border = '1px solid rgba(235, 69, 158, 0.3)';
            createHouseStatusBox.style.color = '#eb459e';
          }
          if (createHouseStatusText) {
            createHouseStatusText.textContent = `Error: ${err.message || 'Failed'}`;
          }
          btnSubmitCreateHouse.disabled = false;
          btnSubmitCreateHouse.innerHTML = '<span>🏰 Create House</span>';
        }
      });
    }

    // Ping Suggested Speakers Modal Listeners
    setupPingModalEvents();

    // Cropper Listeners
    const modalCropper = document.getElementById('modal-photo-cropper');
    const btnCloseCropper = document.getElementById('btn-close-photo-cropper');
    const btnCancelCropper = document.getElementById('btn-cancel-cropper');
    if (btnCloseCropper) {
      btnCloseCropper.addEventListener('click', () => {
        if (modalCropper) modalCropper.style.display = 'none';
      });
    }
    if (btnCancelCropper) {
      btnCancelCropper.addEventListener('click', () => {
        if (modalCropper) modalCropper.style.display = 'none';
      });
    }

    const cropperFileInput = document.getElementById('cropper-file-input');
    const btnCropperBrowse = document.getElementById('btn-cropper-browse');
    const cropperSelectArea = document.getElementById('cropper-select-area');
    const btnCropperChangeFile = document.getElementById('btn-cropper-change-file');

    if (btnCropperBrowse && cropperFileInput) {
      btnCropperBrowse.addEventListener('click', (e) => {
        e.stopPropagation();
        cropperFileInput.click();
      });
    }
    if (cropperSelectArea && cropperFileInput) {
      cropperSelectArea.addEventListener('click', () => {
        cropperFileInput.click();
      });
      cropperSelectArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        cropperSelectArea.style.borderColor = 'var(--primary)';
      });
      cropperSelectArea.addEventListener('dragleave', () => {
        cropperSelectArea.style.borderColor = 'var(--border)';
      });
      cropperSelectArea.addEventListener('drop', (e) => {
        e.preventDefault();
        cropperSelectArea.style.borderColor = 'var(--border)';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleCropperFileSelect(e.dataTransfer.files[0]);
        }
      });
    }
    if (btnCropperChangeFile && cropperFileInput) {
      btnCropperChangeFile.addEventListener('click', () => {
        cropperFileInput.click();
      });
    }
    if (cropperFileInput) {
      cropperFileInput.addEventListener('change', () => {
        if (cropperFileInput.files && cropperFileInput.files[0]) {
          handleCropperFileSelect(cropperFileInput.files[0]);
        }
      });
    }

    const cropperCanvas = document.getElementById('cropper-canvas');
    if (cropperCanvas) {
      cropperCanvas.addEventListener('mousedown', (e) => {
        cropperIsDragging = true;
        cropperDragStartX = e.clientX - cropperImgX;
        cropperDragStartY = e.clientY - cropperImgY;
      });
      window.addEventListener('mousemove', (e) => {
        if (!cropperIsDragging) return;
        cropperImgX = e.clientX - cropperDragStartX;
        cropperImgY = e.clientY - cropperDragStartY;
        drawCropperCanvas();
      });
      window.addEventListener('mouseup', () => {
        cropperIsDragging = false;
      });
      cropperCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
        cropperScale = Math.max(cropperMinScale * 0.8, Math.min(cropperMinScale * 4, cropperScale * zoomFactor));
        const slider = document.getElementById('cropper-zoom-slider');
        if (slider) slider.value = cropperScale;
        drawCropperCanvas();
      });
    }

    const cropperZoomSlider = document.getElementById('cropper-zoom-slider');
    if (cropperZoomSlider) {
      cropperZoomSlider.addEventListener('input', () => {
        cropperScale = parseFloat(cropperZoomSlider.value);
        drawCropperCanvas();
      });
    }

    const btnCropperRotate = document.getElementById('btn-cropper-rotate');
    if (btnCropperRotate) {
      btnCropperRotate.addEventListener('click', () => {
        cropperRotation = (cropperRotation + 90) % 360;
        drawCropperCanvas();
      });
    }

    const btnCropperReset = document.getElementById('btn-cropper-reset');
    if (btnCropperReset) {
      btnCropperReset.addEventListener('click', () => {
        initCropperCanvas();
      });
    }

    const btnApplyCrop = document.getElementById('btn-apply-crop');
    if (btnApplyCrop) {
      btnApplyCrop.addEventListener('click', async () => {
        const base64 = getCroppedBase64Data();
        if (!base64) return;
        btnApplyCrop.disabled = true;
        btnApplyCrop.textContent = '⏳ Uploading profile photo...';

        try {
          const res = await window.powerdeckAPI.uploadProfilePhoto(base64);
          if (res && res.success) {
            showSuccessFloatPopup('Profile photo updated successfully!');
            showAlert('success', 'Profile photo uploaded successfully!');
            if (modalCropper) modalCropper.style.display = 'none';
            const myId = getLoggedInUserId();
            if (myId) {
              const pRes = await window.powerdeckAPI.getProfile(myId);
              if (pRes && pRes.success && pRes.data && pRes.data.user_profile) {
                updateProfileStudioUI(pRes.data.user_profile);
              }
              await loadUserPhotoHistory(myId);
            }
          } else {
            showAlert('error', res.error || 'Failed to upload photo');
          }
        } catch (err) {
          showAlert('error', `Upload error: ${err.message}`);
        } finally {
          btnApplyCrop.disabled = false;
          btnApplyCrop.textContent = '✂️ Crop & Upload Profile Photo';
        }
      });
    }

    // Bio Modal Listeners
    const modalBioEdit = document.getElementById('modal-bio-edit');
    const btnCloseBioEdit = document.getElementById('btn-close-bio-edit');
    const btnCancelBioEdit = document.getElementById('btn-cancel-bio-edit');
    const btnSaveBioEdit = document.getElementById('btn-save-bio-edit');
    const bioEditTextarea = document.getElementById('bio-edit-textarea');
    const bioCharCount = document.getElementById('bio-char-count');

    if (btnCloseBioEdit) {
      btnCloseBioEdit.addEventListener('click', () => {
        if (modalBioEdit) modalBioEdit.style.display = 'none';
      });
    }
    if (btnCancelBioEdit) {
      btnCancelBioEdit.addEventListener('click', () => {
        if (modalBioEdit) modalBioEdit.style.display = 'none';
      });
    }
    if (bioEditTextarea && bioCharCount) {
      bioEditTextarea.addEventListener('input', () => {
        bioCharCount.textContent = `${bioEditTextarea.value.length} / 2500 characters`;
      });
    }
    if (btnSaveBioEdit) {
      btnSaveBioEdit.addEventListener('click', () => {
        saveBioEdit();
      });
    }

    // Member Profile: Block / Unblock User Button
    const btnPmBlock = document.getElementById('btn-pm-block');
    if (btnPmBlock) {
      btnPmBlock.addEventListener('click', async () => {
        if (!viewingProfileUserId) return;
        const name = (currentViewingProfile && (currentViewingProfile.displayname || currentViewingProfile.name)) || (pmName ? pmName.textContent : 'this user');
        const isCurrentlyBlocked = Boolean(
          (currentViewingProfile && currentViewingProfile.is_blocked) ||
          cachedBlockedUserIds.has(Number(viewingProfileUserId))
        );

        if (isCurrentlyBlocked) {
          // UNBLOCK FLOW
          if (!confirm(`Are you sure you want to unblock ${name}?`)) return;
          btnPmBlock.disabled = true;
          btnPmBlock.textContent = '...';
          try {
            const res = await window.powerdeckAPI.unblockUser(viewingProfileUserId);
            if (res && res.success !== false) {
              showAlert('success', `Unblocked ${name}`);
              cachedBlockedUserIds.delete(Number(viewingProfileUserId));
              if (currentViewingProfile) currentViewingProfile.is_blocked = false;
              updateProfileBlockButtonState(false);
              if (btnPmFollow) {
                btnPmFollow.style.display = 'inline-flex';
                btnPmFollow.disabled = false;
                pmFollowLabel.textContent = '+ Follow';
                btnPmFollow.classList.remove('is-following');
              }
              // Remove card from blocked modal list if present
              const card = document.getElementById(`blocked-card-${viewingProfileUserId}`);
              if (card) {
                card.remove();
                const listEl = document.getElementById('blocked-users-list');
                if (listEl && listEl.children.length === 0) {
                  listEl.innerHTML = '<div class="empty-state-notice">You have not blocked any users.</div>';
                }
              }
            } else {
              showAlert('error', (res && res.error) || 'Failed to unblock user');
              updateProfileBlockButtonState(true);
            }
          } catch (err) {
            showAlert('error', err.message);
            updateProfileBlockButtonState(true);
          } finally {
            btnPmBlock.disabled = false;
          }
        } else {
          // BLOCK FLOW
          if (!confirm(`Are you sure you want to block ${name}?`)) return;
          btnPmBlock.disabled = true;
          btnPmBlock.textContent = '...';
          try {
            const res = await window.powerdeckAPI.blockUser(viewingProfileUserId);
            if (res && res.success !== false) {
              showAlert('success', `Blocked ${name}`);
              cachedBlockedUserIds.add(Number(viewingProfileUserId));
              if (currentViewingProfile) currentViewingProfile.is_blocked = true;
              updateProfileBlockButtonState(true);
              if (btnPmFollow) {
                btnPmFollow.style.display = 'none';
              }
            } else {
              showAlert('error', (res && res.error) || 'Failed to block user');
              updateProfileBlockButtonState(false);
            }
          } catch (err) {
            showAlert('error', err.message);
            updateProfileBlockButtonState(false);
          } finally {
            btnPmBlock.disabled = false;
          }
        }
      });
    }

    // Blocked Users Modal Listeners
    const btnStudioOpenBlocklist = document.getElementById('btn-studio-open-blocklist');
    const modalBlockedUsers = document.getElementById('modal-blocked-users');
    const btnCloseBlockedModal = document.getElementById('btn-close-blocked-modal');
    const btnDismissBlockedModal = document.getElementById('btn-dismiss-blocked-modal');
    if (btnStudioOpenBlocklist) {
      btnStudioOpenBlocklist.addEventListener('click', () => {
        openBlockedUsersModal();
      });
    }
    if (btnCloseBlockedModal) {
      btnCloseBlockedModal.addEventListener('click', () => {
        if (modalBlockedUsers) modalBlockedUsers.style.display = 'none';
        const modalStudio = document.getElementById('modal-profile-studio');
        if (modalStudio && modalStudio.style.display !== 'none') {
          bringModalToFront(modalStudio);
        }
      });
    }
    if (btnDismissBlockedModal) {
      btnDismissBlockedModal.addEventListener('click', () => {
        if (modalBlockedUsers) modalBlockedUsers.style.display = 'none';
        const modalStudio = document.getElementById('modal-profile-studio');
        if (modalStudio && modalStudio.style.display !== 'none') {
          bringModalToFront(modalStudio);
        }
      });
    }

    // Notifications Modal & Bell Listeners
    const btnNotifications = document.getElementById('btn-notifications');
    const modalNotifications = document.getElementById('modal-notifications');
    const btnCloseNotifications = document.getElementById('btn-close-notifications');
    const btnDismissNotifications = document.getElementById('btn-dismiss-notifications');
    const btnRefreshNotifications = document.getElementById('btn-refresh-notifications');

    if (btnNotifications) {
      btnNotifications.addEventListener('click', async (e) => {
        if (e) {
          e.stopPropagation();
          e.preventDefault();
        }

        // Just opened: immediately clear outside badge dot & record last seen time
        const badge = document.getElementById('notification-badge');
        if (badge) {
          badge.style.display = 'none';
          badge.textContent = '';
        }
        lastSeenActivitiesTime = Date.now();
        try {
          localStorage.setItem('powerdeck_last_seen_activities_time', String(lastSeenActivitiesTime));
        } catch (_) {}
        allActivities.forEach(a => { a.is_unread = false; });

        if (modalNotifications) {
          modalNotifications.style.display = 'flex';
          bringModalToFront(modalNotifications);
          modalNotifications.scrollTop = 0;
        }
        await fetchNotifications();
      });
    }
    if (btnCloseNotifications) {
      btnCloseNotifications.addEventListener('click', () => {
        if (modalNotifications) modalNotifications.style.display = 'none';
        updateUnreadNotificationBadge();
      });
    }
    if (btnDismissNotifications) {
      btnDismissNotifications.addEventListener('click', () => {
        if (modalNotifications) modalNotifications.style.display = 'none';
        updateUnreadNotificationBadge();
      });
    }
    if (btnRefreshNotifications) {
      btnRefreshNotifications.addEventListener('click', async () => {
        btnRefreshNotifications.disabled = true;
        btnRefreshNotifications.textContent = '...';
        await fetchNotifications();
        btnRefreshNotifications.disabled = false;
        btnRefreshNotifications.textContent = '🔄 Refresh';
      });
    }

    // Initial notifications fetch and background polling
    fetchNotifications();
    setInterval(fetchNotifications, 60000);

    // Social Club Modal Close & Join/Leave Action
    if (btnCloseClubModal) {
      btnCloseClubModal.addEventListener('click', () => {
        if (modalSocialClub) modalSocialClub.style.display = 'none';
      });
    }
    if (btnCmClose) {
      btnCmClose.addEventListener('click', () => {
        if (modalSocialClub) modalSocialClub.style.display = 'none';
      });
    }
    const btnCmCopyLink = document.getElementById('btn-cm-copy-link');
    if (btnCmCopyLink) {
      btnCmCopyLink.addEventListener('click', async () => {
        const sc = currentViewingClub || {};
        const link = sc.slug ? `https://www.clubhouse.com/house/${sc.slug}` : (viewingClubId ? `https://www.clubhouse.com/club/${viewingClubId}` : (sc.share_url || sc.url || ''));
        if (link) {
          await window.powerdeckAPI.copyToClipboard(link);
          showAlert('info', `House link copied: ${link}`);
          const origHtml = btnCmCopyLink.innerHTML;
          btnCmCopyLink.innerHTML = '<span>✓ Copied!</span>';
          setTimeout(() => { btnCmCopyLink.innerHTML = origHtml; }, 2000);
        }
      });
    }

    const btnCmCopyUrlBar = document.getElementById('btn-cm-copy-url-bar');
    if (btnCmCopyUrlBar) {
      btnCmCopyUrlBar.addEventListener('click', async () => {
        const urlText = document.getElementById('cm-share-url-text');
        const link = (urlText && urlText.textContent) || '';
        if (link && link.startsWith('http')) {
          await window.powerdeckAPI.copyToClipboard(link);
          showAlert('success', 'House share URL copied to clipboard!');
          const orig = btnCmCopyUrlBar.textContent;
          btnCmCopyUrlBar.textContent = '✓ Copied';
          setTimeout(() => { btnCmCopyUrlBar.textContent = orig; }, 2000);
        }
      });
    }

    const btnCmJumpLive = document.getElementById('btn-cm-jump-live');
    if (btnCmJumpLive) {
      btnCmJumpLive.addEventListener('click', () => {
        const liveSec = document.getElementById('cm-live-rooms-section');
        if (liveSec && liveSec.style.display !== 'none') {
          liveSec.scrollIntoView({ behavior: 'smooth' });
        } else {
          showAlert('info', 'No active live channels in this house right now.');
        }
      });
    }
    if (btnCmAction) {
      btnCmAction.addEventListener('click', async (e) => {
        if (e) e.preventDefault();
        const clubIdToUse = String((currentViewingClub && currentViewingClub.social_club_id) || viewingClubId || '');
        if (!clubIdToUse) return;
        const act = viewingClubStatus === 4 ? 'leave' : 'join';
        await performClubAction(clubIdToUse, act, btnCmAction);
        // Immediately refresh house modal data, counts, and permissions on the spot
        await openClubModal({
          social_club_id: clubIdToUse,
          name: currentViewingClub ? currentViewingClub.name : '',
          photo_url: currentViewingClub ? currentViewingClub.photo_url : ''
        });
      });
    }

    // House Members Button -> Open House Members Modal
    if (btnCmOpenMembers) {
      btnCmOpenMembers.addEventListener('click', () => {
        if (modalSocialClub) modalSocialClub.style.display = 'none';
        openClubMembersModal(viewingClubId, activeClubMembersName);
      });
    }

    // Setup Social Club Invite Dialog & Prompt Events
    setupClubInviteDialogEvents();

    // House Members Modal Close Buttons & Pagination
    if (btnCloseMembersModal) {
      btnCloseMembersModal.addEventListener('click', () => {
        if (modalClubMembers) modalClubMembers.style.display = 'none';
      });
    }
    if (btnCloseMembers) {
      btnCloseMembers.addEventListener('click', () => {
        if (modalClubMembers) modalClubMembers.style.display = 'none';
      });
    }
    if (btnLoadMoreMembers) {
      btnLoadMoreMembers.addEventListener('click', () => {
        if (clubMembersCursor && !isLoadingClubMembers) {
          fetchClubMembersPage(clubMembersCursor);
        }
      });
    }
    if (cmMembersScrollArea) {
      cmMembersScrollArea.addEventListener('scroll', () => {
        if (cmMembersScrollArea.scrollHeight - cmMembersScrollArea.scrollTop - cmMembersScrollArea.clientHeight < 180) {
          if (clubMembersCursor && !isLoadingClubMembers) {
            fetchClubMembersPage(clubMembersCursor);
          }
        }
      });

      // Swipe gesture support for touchscreen and touchpad
      let touchStartY = 0;
      cmMembersScrollArea.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) touchStartY = e.touches[0].clientY;
      }, { passive: true });

      cmMembersScrollArea.addEventListener('touchmove', (e) => {
        if (!e.touches || !e.touches[0]) return;
        const diffY = touchStartY - e.touches[0].clientY;
        if (diffY > 40 && (cmMembersScrollArea.scrollHeight - cmMembersScrollArea.scrollTop - cmMembersScrollArea.clientHeight < 220)) {
          if (clubMembersCursor && !isLoadingClubMembers) {
            fetchClubMembersPage(clubMembersCursor);
          }
        }
      }, { passive: true });
    }

    // Refresh Feed Button & Pull-to-Refresh Banner
    const btnRefreshFeed = document.getElementById('btn-refresh-feed');
    if (btnRefreshFeed) {
      btnRefreshFeed.addEventListener('click', () => {
        loadFeedV3(1, false);
      });
    }

    const swipeBanner = document.getElementById('swipe-refresh-banner');
    if (swipeBanner) {
      swipeBanner.addEventListener('click', () => {
        loadFeedV3(1, false);
      });
    }

    // Load More Rooms Pagination Button
    const btnLoadMore = document.getElementById('btn-load-more-rooms');
    if (btnLoadMore) {
      btnLoadMore.addEventListener('click', () => {
        loadFeedV3(currentFeedPage + 1, true);
      });
    }

    // Swipe-down / Pull-to-refresh interaction on rooms stream container
    const streamContainer = document.getElementById('rooms-stream-container') || document.getElementById('rooms-stream');
    if (streamContainer) {
      let touchStartY = 0;
      let touchEndY = 0;

      streamContainer.addEventListener('touchstart', (e) => {
        if (streamContainer.scrollTop === 0) {
          touchStartY = e.touches[0].clientY;
        } else {
          touchStartY = 0;
        }
      }, { passive: true });

      streamContainer.addEventListener('touchmove', (e) => {
        if (touchStartY > 0) {
          touchEndY = e.touches[0].clientY;
          const diff = touchEndY - touchStartY;
          if (diff > 50 && swipeBanner) {
            swipeBanner.style.opacity = '1';
            swipeBanner.style.maxHeight = '50px';
          }
        }
      }, { passive: true });

      streamContainer.addEventListener('touchend', () => {
        if (touchStartY > 0 && touchEndY - touchStartY > 60) {
          loadFeedV3(1, false);
        }
        touchStartY = 0;
        touchEndY = 0;
      });

      // Continuous scroll-down pagination
      streamContainer.addEventListener('scroll', () => {
        if (streamContainer.scrollHeight - streamContainer.scrollTop - streamContainer.clientHeight < 40) {
          if (!isLoadingFeed) {
            loadFeedV3(currentFeedPage + 1, true);
          }
        }
      });
    }

    // Leave Channel from Main Channel View (Leave Quietly)
    const btnLeaveChannelView = document.getElementById('btn-leave-channel-view');
    if (btnLeaveChannelView) {
      btnLeaveChannelView.addEventListener('click', async () => {
        await leaveActiveRoom();
      });
    }

    // Disable Replay (Top bar, bottom dock, modal stage)
    const btnDisableReplayTop = document.getElementById('btn-disable-replay-top');
    if (btnDisableReplayTop) {
      btnDisableReplayTop.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDisableReplay();
      });
    }

    const btnDockDisableReplay = document.getElementById('btn-dock-disable-replay');
    if (btnDockDisableReplay) {
      btnDockDisableReplay.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDisableReplay();
      });
    }

    const btnModalDisableReplay = document.getElementById('btn-stage-modal-disable-replay');
    if (btnModalDisableReplay) {
      btnModalDisableReplay.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDisableReplay();
      });
    }

    // End Channel from Main Channel View (Moderators only - calls end_channel)
    const btnEndChannelView = document.getElementById('btn-end-channel-view');
    if (btnEndChannelView) {
      btnEndChannelView.addEventListener('click', async () => {
        await endActiveChannel();
      });
    }

    // Channel Dock Mic Toggle
    const btnDockMic = document.getElementById('btn-dock-mic');
    if (btnDockMic) {
      btnDockMic.addEventListener('click', async () => {
        await toggleMicMuted();
      });
    }

    // Channel Dock Hand Toggle (Audience reply)
    const btnDockHand = document.getElementById('btn-dock-hand');
    if (btnDockHand) {
      btnDockHand.addEventListener('click', async () => {
        if (!currentActiveRoom) return;
        if (isCurrentUserModerator) {
          await refreshHandraiseQueue(currentActiveRoom.channel || currentActiveRoom.id);
          const queueCount = raisedHandUserIds.size;
          showChannelToast('moderator', { name: 'Handraise Queue' }, `${queueCount} member${queueCount === 1 ? '' : 's'} raised hand to speak ✋`, '✋');
          return;
        }
        const willRaise = !isHandRaised;
        btnDockHand.disabled = true;
        try {
          const res = await window.powerdeckAPI.audienceReply(currentActiveRoom.channel, willRaise);
          if (res && res.success !== false) {
            isHandRaised = willRaise;
            updateHandUI();
            setAppStatus(isHandRaised ? "Hand raised in audience." : "Hand lowered.");
          } else {
            showAlert('warning', res.error || "Could not update hand status");
          }
        } catch (e) {
          showAlert('error', e.message);
        } finally {
          btnDockHand.disabled = false;
        }
      });
    }

    // Join / Accept Speaker Button in Mic Position (Audience Mode)
    const btnAcceptSpeaker = document.getElementById('btn-dock-accept-speaker');
    if (btnAcceptSpeaker) {
      btnAcceptSpeaker.addEventListener('click', async () => {
        if (!currentActiveRoom) return;
        btnAcceptSpeaker.disabled = true;
        const joinLabel = document.getElementById('dock-join-label');
        if (joinLabel) joinLabel.textContent = "Joining...";
        try {
          const res = await window.powerdeckAPI.becomeSpeaker(currentActiveRoom.channel);
          if (res && res.success !== false) {
            showAlert('success', 'Joined channel as speaker!');
            isCurrentUserSpeaker = true;
            updateMicUI();
            const agoraToken = (res.data && (res.data.token || res.data.agora_token)) || res.token;
            await promoteToSpeakerInAgora(agoraToken);
            await refreshActiveChannelState();
          } else {
            const errMsg = (res && (res.error || (res.data && res.data.error_message))) || "Failed to join channel as speaker";
            if (errMsg.toLowerCase().includes('not been invited') || errMsg.toLowerCase().includes('invite')) {
              showAlert('info', 'Not invited to speak yet. Raising hand for you...');
              const dockHand = document.getElementById('btn-dock-hand');
              if (dockHand && !isHandRaised) dockHand.click();
            } else {
              showAlert('warning', errMsg);
            }
          }
        } catch (e) {
          showAlert('error', e.message);
        } finally {
          btnAcceptSpeaker.disabled = false;
          updateMicUI();
        }
      });
    }

    // Mute Other Speakers Dock Button
    const btnDockMuteOthers = document.getElementById('btn-dock-mute-others');
    if (btnDockMuteOthers) {
      btnDockMuteOthers.addEventListener('click', async () => {
        if (!currentActiveRoom || !currentActiveRoom.channel) {
          showAlert('warning', 'No active channel');
          return;
        }
        btnDockMuteOthers.disabled = true;
        try {
          const res = await window.powerdeckAPI.muteOtherSpeakers(currentActiveRoom.channel);
          if (res && res.success !== false) {
            showAlert('success', 'Muted all other speakers in channel');
            await refreshActiveChannelState();
          } else {
            showAlert('warning', res.error || 'Failed to mute other speakers');
          }
        } catch (err) {
          showAlert('error', err.message);
        } finally {
          btnDockMuteOthers.disabled = false;
        }
      });
    }

    // Edit Channel Title Button
    const btnEditChannelTitle = document.getElementById('btn-edit-channel-title');
    if (btnEditChannelTitle) {
      btnEditChannelTitle.addEventListener('click', async () => {
        if (!currentActiveRoom || !currentActiveRoom.channel) return;
        const currentTitle = currentActiveRoom.title || '';
        const newTitle = await showInputPrompt({
          title: '✏️ Edit Channel Title',
          label: 'Enter new channel title / topic:',
          defaultValue: currentTitle,
          placeholder: 'Channel title...',
          confirmText: 'Update'
        });
        if (newTitle !== null && newTitle.trim().length > 0 && newTitle.trim() !== currentTitle) {
          try {
            const res = await window.powerdeckAPI.setChannelTitle(currentActiveRoom.channel, newTitle.trim());
            if (res && res.success !== false) {
              showAlert('success', 'Channel title updated');
              currentActiveRoom.title = newTitle.trim();
              const liveTitle = document.getElementById('channel-live-title');
              if (liveTitle) liveTitle.textContent = newTitle.trim();
              await refreshActiveChannelState();
            } else {
              showAlert('warning', res.error || 'Failed to update channel title');
            }
          } catch (err) {
            showAlert('error', err.message);
          }
        }
      });
    }

    // Pinned Channel Link Actions
    const btnAddChannelLink = document.getElementById('btn-add-channel-link');
    if (btnAddChannelLink) {
      btnAddChannelLink.addEventListener('click', async () => {
        if (!currentActiveRoom || !currentActiveRoom.channel) return;
        const linkUrl = await showInputPrompt({
          title: '🔗 Pin Channel Link',
          label: 'Enter link URL to pin:',
          defaultValue: 'https://',
          placeholder: 'https://...',
          confirmText: 'Pin Link'
        });
        if (linkUrl && linkUrl.trim().length > 0) {
          try {
            const res = await window.powerdeckAPI.addChannelLink(currentActiveRoom.channel, linkUrl.trim());
            if (res && res.success !== false) {
              showAlert('success', 'Pinned link added');
              await refreshActiveChannelState();
            } else {
              showAlert('warning', res.error || 'Failed to add link');
            }
          } catch (err) {
            showAlert('error', err.message);
          }
        }
      });
    }

    const btnEditChannelLink = document.getElementById('btn-edit-channel-link');
    if (btnEditChannelLink) {
      btnEditChannelLink.addEventListener('click', async () => {
        if (!currentActiveRoom || !currentActiveRoom.channel) return;
        const dataUrl = btnEditChannelLink.getAttribute('data-link-url');
        const currentAnchor = document.getElementById('pinned-link-anchor');
        const currentUrl = dataUrl || (currentAnchor && (currentAnchor.href || currentAnchor.textContent)) || '';
        const newUrl = await showInputPrompt({
          title: '✏️ Edit Pinned Link',
          label: 'Enter new link URL to pin:',
          defaultValue: currentUrl,
          placeholder: 'https://...',
          confirmText: 'Update'
        });
        if (newUrl && newUrl.trim().length > 0 && newUrl.trim() !== currentUrl) {
          try {
            const res = await window.powerdeckAPI.addChannelLink(currentActiveRoom.channel, newUrl.trim());
            if (res && res.success !== false) {
              showAlert('success', 'Pinned link updated');
              await refreshActiveChannelState();
            } else {
              showAlert('warning', res.error || 'Failed to update link');
            }
          } catch (err) {
            showAlert('error', err.message);
          }
        }
      });
    }

    const btnRemoveChannelLink = document.getElementById('btn-remove-channel-link');
    if (btnRemoveChannelLink) {
      btnRemoveChannelLink.addEventListener('click', async () => {
        if (!currentActiveRoom || !currentActiveRoom.channel) return;
        const linkId = btnRemoveChannelLink.getAttribute('data-link-id') || '';
        if (!confirm('Are you sure you want to remove the pinned link?')) return;
        try {
          const res = await window.powerdeckAPI.removeChannelLink(currentActiveRoom.channel, linkId);
          if (res && res.success !== false) {
            showAlert('success', 'Pinned link removed');
            if (currentActiveRoom) currentActiveRoom.links = [];
            await refreshActiveChannelState();
          } else {
            showAlert('warning', res.error || 'Failed to remove link');
          }
        } catch (err) {
          showAlert('error', err.message);
        }
      });
    }

    // Room Chat Enable / Disable Toggle Checkbox (Tick for enable, click again to disable)
    const chkChannelChat = document.getElementById('chk-channel-chat');
    const chatTickToggle = document.getElementById('chat-tick-toggle');
    if (chkChannelChat) {
      chkChannelChat.addEventListener('change', async () => {
        if (!currentActiveRoom || !currentActiveRoom.channel) {
          chkChannelChat.checked = !chkChannelChat.checked;
          return;
        }
        const willEnable = chkChannelChat.checked;
        chkChannelChat.disabled = true;
        try {
          const res = willEnable
            ? await window.powerdeckAPI.enableChannelMessages(currentActiveRoom.channel)
            : await window.powerdeckAPI.disableChannelMessages(currentActiveRoom.channel);
          if (res && res.success !== false) {
            currentActiveRoom.isChatEnabled = willEnable;
            showAlert('success', willEnable ? 'Room chat enabled ✓' : 'Room chat disabled ✕');
            if (chatTickToggle) {
              chatTickToggle.title = willEnable
                ? 'Room Chat is ENABLED (Click to disable)'
                : 'Room Chat is DISABLED (Click to enable)';
            }
            const btnChat = document.getElementById('btn-top-room-chat');
            if (btnChat) {
              btnChat.style.display = willEnable ? 'inline-flex' : 'none';
            }
            if (!willEnable) {
              closeRoomChat();
            }
            await refreshActiveChannelState();
          } else {
            chkChannelChat.checked = !willEnable;
            showAlert('warning', res.error || `Failed to ${willEnable ? 'enable' : 'disable'} room chat`);
          }
        } catch (err) {
          chkChannelChat.checked = !willEnable;
          showAlert('error', err.message);
        } finally {
          chkChannelChat.disabled = false;
        }
      });
    }

    // Room Chat Drawer (Top Bar button near Leave Quietly)
    const btnTopRoomChat = document.getElementById('btn-top-room-chat');
    const chatPanel = document.getElementById('channel-chat-panel');
    const btnCloseChat = document.getElementById('btn-close-chat');
    const btnRefreshChat = document.getElementById('btn-refresh-chat');
    const btnCancelReply = document.getElementById('btn-cancel-reply');
    const chatSendForm = document.getElementById('chat-send-form');
    const chatInput = document.getElementById('chat-input-text');

    function toggleChatDrawer() {
      if (!chatPanel) return;
      if (chatPanel.style.display === 'none' || !chatPanel.style.display) {
        openRoomChat();
      } else {
        closeRoomChat();
      }
    }

    if (btnTopRoomChat) {
      btnTopRoomChat.addEventListener('click', toggleChatDrawer);
    }

    if (btnCloseChat) {
      btnCloseChat.addEventListener('click', closeRoomChat);
    }

    if (btnRefreshChat) {
      btnRefreshChat.addEventListener('click', () => {
        loadRoomMessages();
      });
    }

    if (btnCancelReply) {
      btnCancelReply.addEventListener('click', cancelChatReply);
    }

    if (chatSendForm) {
      chatSendForm.addEventListener('submit', sendChatMessage);
    }

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });
    }

    // Emoji Reactions Popover & Floating Animations
    const btnDockReact = document.getElementById('btn-dock-react');
    const reactionsPopover = document.getElementById('channel-reactions-popover');
    const reactionsGrid = document.getElementById('reactions-emoji-grid');

    if (btnDockReact) {
      btnDockReact.addEventListener('click', (e) => {
        e.stopPropagation();
        if (reactionsPopover) reactionsPopover.style.display = 'none';

        // Every time bottom react button is pressed, fetch get_channel immediately in background
        if (currentActiveRoom && currentActiveRoom.channel) {
          refreshActiveChannelState().catch(() => {});
        }

        showTargetReactionPalette(btnDockReact, 'ALL_SPEAKERS', 'Channel Speakers');
      });
    }

    document.addEventListener('click', (e) => {
      if (reactionsPopover && !reactionsPopover.contains(e.target) && !btnDockReact.contains(e.target)) {
        reactionsPopover.style.display = 'none';
      }
      const targetPalette = document.getElementById('target-reaction-floating-palette');
      if (targetPalette && !targetPalette.contains(e.target) && !btnDockReact.contains(e.target) && !e.target.closest('.act-react')) {
        targetPalette.remove();
      }
      const extraPopover = document.getElementById('extra-reactions-popover');
      if (extraPopover && !extraPopover.contains(e.target) && !e.target.closest('.act-extra-react') && !e.target.closest('.target-react-more')) {
        extraPopover.style.display = 'none';
        activeExtraTargetUserId = null;
      }
    });

    if (reactionsGrid) {
      updateEmojiOptions();
    }

    // Audio Settings Modal & Persistence
    const btnAudioSettings = document.getElementById('btn-audio-settings');
    const modalAudioSettings = document.getElementById('modal-audio-settings');
    const btnCloseAudioModal = document.getElementById('btn-close-audio-modal');
    const btnAudioCancel = document.getElementById('btn-audio-cancel');
    const btnAudioSave = document.getElementById('btn-audio-save');

    if (btnAudioSettings) {
      btnAudioSettings.addEventListener('click', openAudioSettingsModal);
    }
    if (btnCloseAudioModal) {
      btnCloseAudioModal.addEventListener('click', closeAudioSettingsModal);
    }
    if (btnAudioCancel) {
      btnAudioCancel.addEventListener('click', closeAudioSettingsModal);
    }
    if (modalAudioSettings) {
      modalAudioSettings.addEventListener('click', (e) => {
        if (e.target === modalAudioSettings) {
          closeAudioSettingsModal();
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const m = document.getElementById('modal-audio-settings');
        if (m && m.style.display !== 'none') {
          closeAudioSettingsModal();
        }
        if (modalRoomDetails && modalRoomDetails.style.display !== 'none') {
          closeRoomDetailsModal();
        }
      }
    });
    if (btnAudioSave) {
      btnAudioSave.addEventListener('click', saveAudioSettings);
    }

    const sliderMicVolume = document.getElementById('slider-mic-volume');
    if (sliderMicVolume) {
      const onMicVolChange = (e) => {
        const val = (e.target.value !== '' && !isNaN(Number(e.target.value))) ? Number(e.target.value) : 100;
        currentAgoraMicVolume = val;
        updateMicVolumeBadgeUI(val);
        applyAgoraMicVolume(val);
        persistAudioPrefsDebounced();
      };
      sliderMicVolume.addEventListener('input', onMicVolChange);
      sliderMicVolume.addEventListener('change', onMicVolChange);
    }

    const sliderAudioVolume = document.getElementById('slider-audio-volume');
    if (sliderAudioVolume) {
      const onAudioVolChange = (e) => {
        const val = (e.target.value !== '' && !isNaN(Number(e.target.value))) ? Number(e.target.value) : 100;
        currentAgoraVolume = val;
        updateVolumeBadgeUI(val);
        applyAgoraVolume(val);
        persistAudioPrefsDebounced();
      };
      sliderAudioVolume.addEventListener('input', onAudioVolChange);
      sliderAudioVolume.addEventListener('change', onAudioVolChange);
    }

    // Initial load of saved audio volume preferences
    window.powerdeckAPI.getAudioPrefs().then(res => {
      if (res && res.success && res.prefs) {
        if (typeof res.prefs.volume === 'number') {
          currentAgoraVolume = res.prefs.volume;
          if (sliderAudioVolume) {
            sliderAudioVolume.value = currentAgoraVolume;
            updateVolumeBadgeUI(currentAgoraVolume);
          }
        }
        if (typeof res.prefs.micVolume === 'number') {
          currentAgoraMicVolume = res.prefs.micVolume;
          if (sliderMicVolume) {
            sliderMicVolume.value = currentAgoraMicVolume;
            updateMicVolumeBadgeUI(currentAgoraMicVolume);
          }
        }
      }
    }).catch(e => console.warn("Initial audio prefs load:", e));

    // Floating Active Room Audio Bar & Stage Modal Controls
    if (btnOpenStageModal) {
      btnOpenStageModal.addEventListener('click', () => {
        if (modalStageViewer) {
          modalStageViewer.style.display = 'flex';
          bringModalToFront(modalStageViewer);
          modalStageViewer.scrollTop = 0;
        }
      });
    }
    if (btnCloseStageModal) {
      btnCloseStageModal.addEventListener('click', () => {
        if (modalStageViewer) modalStageViewer.style.display = 'none';
      });
    }
    if (btnDismissStageModal) {
      btnDismissStageModal.addEventListener('click', () => {
        if (modalStageViewer) modalStageViewer.style.display = 'none';
      });
    }
    if (btnFloatingMic) {
      btnFloatingMic.addEventListener('click', async () => {
        await toggleMicMuted();
      });
    }
    if (btnFloatingLeave) {
      btnFloatingLeave.addEventListener('click', async () => {
        await leaveActiveRoom();
      });
    }
    const btnFloatingEndRoom = document.getElementById('btn-floating-end-room');
    if (btnFloatingEndRoom) {
      btnFloatingEndRoom.addEventListener('click', async () => {
        await endActiveChannel();
      });
    }

    // Mic Mute Toggle
    const btnMic = document.getElementById('btn-mic-toggle');
    if (btnMic) {
      btnMic.onclick = async () => {
        await toggleMicMuted();
      };
    }

    // Raise Hand Toggle
    const btnHand = document.getElementById('btn-raise-hand');
    if (btnHand) {
      btnHand.onclick = () => {
        isHandRaised = !isHandRaised;
        updateHandUI();
      };
    }

    const btnLeave = document.getElementById('btn-leave-room');
    if (btnLeave) {
      btnLeave.onclick = leaveActiveRoom;
    }
    const btnStageEnd = document.getElementById('btn-stage-end-room');
    if (btnStageEnd) {
      btnStageEnd.onclick = endActiveChannel;
    }

    // Volume Slider
    const volSlider = document.getElementById('stage-volume-slider');
    const volPct = document.getElementById('stage-volume-pct');
    const stageVolIcon = document.getElementById('stage-vol-icon');
    if (stageVolIcon) {
      stageVolIcon.style.cursor = 'pointer';
      stageVolIcon.onclick = () => toggleMuteRemoteAudio();
    }
    if (volSlider && volPct) {
      volSlider.oninput = (e) => {
        const val = Number(e.target.value);
        volPct.textContent = `${val}%`;
        applyAgoraVolume(val);
        persistAudioPrefsDebounced();
      };
    }

    // Start Room Modals (Clubhouse create_channel API)
    const btnQuickCreate = document.getElementById('btn-quick-create-room');
    const createModal = document.getElementById('create-room-modal');
    const btnCloseCreate = document.getElementById('btn-close-create-modal');
    const btnCancelCreate = document.getElementById('btn-cancel-create-room');
    const btnLaunch = document.getElementById('btn-create-room-start') || document.getElementById('btn-launch-room');
    const createTopicInput = document.getElementById('create-room-topic');
    const housePickerGroup = document.getElementById('create-house-picker-group');
    const housePickerContainer = document.getElementById('create-house-picker-container');
    const checkReplays = document.getElementById('check-create-replays');
    const checkChat = document.getElementById('check-create-chat');
    const privacySelector = document.getElementById('create-privacy-selector');

    let currentCreatePrivacy = 'public'; // 'public' | 'house' | 'friend_of_friend'
    let selectedCreateHouseId = null;
    let availableCreateHouses = [];

    function updateSelectedHouseUI() {
      const selectedHouse = availableCreateHouses.find(c => String(c.social_club_id || c.id || c.club_id) === String(selectedCreateHouseId));
      const hintEl = document.getElementById('house-picker-selected-hint');
      if (hintEl) {
        if (selectedHouse && currentCreatePrivacy === 'house') {
          hintEl.textContent = `Selected: ${selectedHouse.name || 'House'}`;
          hintEl.style.display = 'inline-block';
        } else {
          hintEl.textContent = '';
          hintEl.style.display = 'none';
        }
      }
      if (btnLaunch) {
        if (currentCreatePrivacy === 'house') {
          const hName = selectedHouse ? selectedHouse.name : 'House';
          btnLaunch.innerHTML = `<span>🎙️ Start Room in ${escapeHtml(hName)}</span>`;
        } else {
          btnLaunch.innerHTML = '<span>🎙️ Start Room</span>';
        }
      }
    }

    // Privacy type pills selection
    if (privacySelector) {
      privacySelector.querySelectorAll('.privacy-type-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          privacySelector.querySelectorAll('.privacy-type-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          currentCreatePrivacy = pill.getAttribute('data-privacy');

          if (currentCreatePrivacy === 'house') {
            if (housePickerGroup) housePickerGroup.style.display = 'block';
            loadCreateChannelTargets(true);
          } else {
            if (housePickerGroup) housePickerGroup.style.display = 'none';
          }
          updateSelectedHouseUI();
        });
      });
    }

    async function loadCreateChannelTargets(force = false) {
      if (!housePickerContainer) return;
      if (!force && availableCreateHouses.length > 0) {
        renderHousePickerList(availableCreateHouses);
        return;
      }
      housePickerContainer.innerHTML = '<div class="house-picker-loading" style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;">⏳ Loading your houses...</div>';
      try {
        const res = await window.powerdeckAPI.getCreateChannelTargets();
        console.log("[CreateChannelTargets] response:", res);
        if (res && res.success !== false) {
          const raw = res.data || res;
          let clubs = [];
          if (Array.isArray(raw.targets)) {
            clubs = raw.targets
              .filter(t => !t.target_type || t.target_type === 'social_club' || t.target_type === 'club')
              .map(t => {
                const sc = t.social_club || t.club || t;
                if (!sc) return null;
                return {
                  social_club_id: String(sc.social_club_id || sc.id || sc.club_id || ''),
                  name: sc.name || 'House',
                  photo_url: sc.photo_url || '',
                  num_members: sc.num_members != null ? sc.num_members : 0,
                  num_live_channels: sc.num_live_channels || 0,
                  description: sc.description || '',
                  slug: sc.slug || '',
                  target_capabilities: t.target_capabilities || {}
                };
              })
              .filter(Boolean);
          } else if (Array.isArray(raw.social_clubs)) {
            clubs = raw.social_clubs.map(sc => ({
              social_club_id: String(sc.social_club_id || sc.id || sc.club_id || ''),
              name: sc.name || 'House',
              photo_url: sc.photo_url || '',
              num_members: sc.num_members != null ? sc.num_members : 0,
              num_live_channels: sc.num_live_channels || 0,
              description: sc.description || '',
              slug: sc.slug || ''
            }));
          } else if (Array.isArray(raw.clubs)) {
            clubs = raw.clubs.map(sc => ({
              social_club_id: String(sc.social_club_id || sc.id || sc.club_id || ''),
              name: sc.name || 'House',
              photo_url: sc.photo_url || '',
              num_members: sc.num_members != null ? sc.num_members : 0,
              num_live_channels: sc.num_live_channels || 0,
              description: sc.description || '',
              slug: sc.slug || ''
            }));
          } else if (Array.isArray(raw)) {
            clubs = raw.map(sc => ({
              social_club_id: String(sc.social_club_id || sc.id || sc.club_id || ''),
              name: sc.name || 'House',
              photo_url: sc.photo_url || '',
              num_members: sc.num_members != null ? sc.num_members : 0,
              num_live_channels: sc.num_live_channels || 0,
              description: sc.description || '',
              slug: sc.slug || ''
            }));
          }

          availableCreateHouses = clubs;

          // Preserve selected house or pick first available
          if (selectedCreateHouseId) {
            const match = clubs.find(c => String(c.social_club_id) === String(selectedCreateHouseId));
            if (!match && clubs.length > 0) {
              selectedCreateHouseId = clubs[0].social_club_id;
            }
          } else if (clubs.length > 0) {
            selectedCreateHouseId = clubs[0].social_club_id;
          }

          renderHousePickerList(clubs);
        } else {
          housePickerContainer.innerHTML = `<div class="empty-state-notice" style="padding: 12px; font-size: 12px;">${escapeHtml((res && res.error) || 'Could not load houses')}</div>`;
        }
      } catch (err) {
        housePickerContainer.innerHTML = `<div class="empty-state-notice" style="padding: 12px; font-size: 12px;">Error: ${escapeHtml(err.message)}</div>`;
      }
    }

    function renderHousePickerList(clubs) {
      if (!housePickerContainer) return;
      if (!clubs || clubs.length === 0) {
        housePickerContainer.innerHTML = '<div class="empty-state-notice" style="padding: 16px; font-size: 13px;">You are not a member of any houses yet. Select Public or Social instead.</div>';
        selectedCreateHouseId = null;
        updateSelectedHouseUI();
        return;
      }
      if (!selectedCreateHouseId && clubs.length > 0) {
        selectedCreateHouseId = String(clubs[0].social_club_id);
      }

      housePickerContainer.innerHTML = clubs.map(c => {
        const cId = String(c.social_club_id || c.id || c.club_id || '');
        const cName = c.name || 'House';
        const isSel = String(cId) === String(selectedCreateHouseId);
        const initial = (cName || 'H').charAt(0).toUpperCase();
        const membersFormatted = c.num_members ? Number(c.num_members).toLocaleString() : '0';
        const liveBadge = (c.num_live_channels && c.num_live_channels > 0)
          ? `<span class="house-picker-live-badge">🟢 ${c.num_live_channels} Live</span>`
          : '';

        const imgHtml = c.photo_url
          ? `<img src="${escapeHtml(c.photo_url)}" class="house-picker-img" alt="${escapeHtml(cName)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'house-picker-fallback\\'>${initial}</div>';">`
          : `<div class="house-picker-fallback">${initial}</div>`;

        return `
          <div class="house-picker-item ${isSel ? 'selected' : ''}" data-house-id="${escapeHtml(cId)}">
            <div class="house-picker-avatar-wrap">
              ${imgHtml}
            </div>
            <div class="house-picker-info">
              <div class="house-picker-title-row">
                <span class="house-picker-name" title="${escapeHtml(cName)}">${escapeHtml(cName)}</span>
                ${liveBadge}
              </div>
              <div class="house-picker-meta-row">
                <span class="house-picker-members">👥 ${membersFormatted} members</span>
                <span class="house-picker-id">ID: ${escapeHtml(cId)}</span>
              </div>
            </div>
            <div class="house-picker-radio ${isSel ? 'selected' : ''}">
              <span class="house-picker-check">${isSel ? '✓' : ''}</span>
            </div>
          </div>
        `;
      }).join('');

      housePickerContainer.querySelectorAll('.house-picker-item').forEach(item => {
        item.addEventListener('click', () => {
          const cId = item.getAttribute('data-house-id');
          selectedCreateHouseId = cId;
          housePickerContainer.querySelectorAll('.house-picker-item').forEach(i => {
            const isMatch = i.getAttribute('data-house-id') === String(cId);
            i.classList.toggle('selected', isMatch);
            const radio = i.querySelector('.house-picker-radio');
            if (radio) {
              radio.classList.toggle('selected', isMatch);
              const check = radio.querySelector('.house-picker-check');
              if (check) check.textContent = isMatch ? '✓' : '';
            }
          });
          updateSelectedHouseUI();
        });
      });

      updateSelectedHouseUI();
    }

    openCreateRoomModal = function(prefill = {}) {
      if (!createModal) return;
      createModal.style.display = 'flex';
      bringModalToFront(createModal);
      createModal.scrollTop = 0;
      if (createTopicInput) {
        createTopicInput.value = prefill.topic || '';
        createTopicInput.focus();
      }

      if (prefill.socialClubId || prefill.privacy === 'house') {
        currentCreatePrivacy = 'house';
        if (prefill.socialClubId) {
          selectedCreateHouseId = String(prefill.socialClubId);
        }
        if (privacySelector) {
          privacySelector.querySelectorAll('.privacy-type-pill').forEach(p => {
            p.classList.toggle('active', p.getAttribute('data-privacy') === 'house');
          });
        }
        if (housePickerGroup) housePickerGroup.style.display = 'block';

        if (prefill.socialClubId) {
          const exists = availableCreateHouses.some(c => String(c.social_club_id || c.id) === String(prefill.socialClubId));
          if (!exists) {
            availableCreateHouses.unshift({
              social_club_id: String(prefill.socialClubId),
              id: String(prefill.socialClubId),
              name: prefill.socialClubName || 'House',
              photo_url: prefill.photoUrl || ''
            });
          }
        }
        renderHousePickerList(availableCreateHouses);
        loadCreateChannelTargets(true).catch(() => {});
      } else {
        currentCreatePrivacy = 'public';
        selectedCreateHouseId = null;
        if (privacySelector) {
          privacySelector.querySelectorAll('.privacy-type-pill').forEach(p => {
            p.classList.toggle('active', p.getAttribute('data-privacy') === 'public');
          });
        }
        if (housePickerGroup) housePickerGroup.style.display = 'none';
        updateSelectedHouseUI();
        loadCreateChannelTargets(false).catch(() => {});
      }
    };
    window.openCreateRoomModal = openCreateRoomModal;
    window.triggerOpenCreateRoomModal = openCreateRoomModal;

    if (btnQuickCreate) {
      btnQuickCreate.onclick = (e) => {
        if (e) e.preventDefault();
        openCreateRoomModal();
      };
    }

    if (createTopicInput) {
      createTopicInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (btnLaunch && !btnLaunch.disabled) {
            btnLaunch.click();
          }
        }
      });
    }

    if (btnCloseCreate && createModal) {
      btnCloseCreate.onclick = () => { createModal.style.display = 'none'; };
    }
    if (btnCancelCreate && createModal) {
      btnCancelCreate.onclick = () => { createModal.style.display = 'none'; };
    }

    let isCreatingRoom = false;
    if (btnLaunch && createModal) {
      const handleLaunchRoom = async (e) => {
        if (e) e.preventDefault();
        if (isCreatingRoom) return;

        const topic = (createTopicInput && createTopicInput.value.trim()) || '';
        const isReplays = checkReplays ? checkReplays.checked : true;
        const isChat = checkChat ? checkChat.checked : true;

        if (currentCreatePrivacy === 'house' && !selectedCreateHouseId) {
          showAlert('warning', 'Please select a House to host the room in.');
          return;
        }

        isCreatingRoom = true;
        btnLaunch.disabled = true;
        const prevText = btnLaunch.innerHTML;
        btnLaunch.innerHTML = '<span>Creating Room...</span>';

        try {
          const isHouse = (currentCreatePrivacy === 'house' && Boolean(selectedCreateHouseId));
          const createOpts = {
            topic: topic || undefined,
            privacyLevel: isHouse ? 'house' : currentCreatePrivacy,
            isChatEnabled: isChat,
            isReplayEnabled: isReplays,
            socialClubId: isHouse ? selectedCreateHouseId : null,
            chatPermission: 1,
            source: isHouse ? 49 : 14
          };

          console.log("[CreateChannel] Submitting options:", createOpts);
          const res = await window.powerdeckAPI.createChannel(createOpts);
          console.log("[CreateChannel] response:", res);

          if (res && res.success !== false) {
            const chData = (res && res.data) || res.channel_data || res || {};
            const channelId = chData.channel || chData.channel_id || (chData.rawChannel && (chData.rawChannel.channel || chData.rawChannel.channel_id));

            const selectedHouse = availableCreateHouses.find(c => String(c.social_club_id) === String(selectedCreateHouseId));
            const houseSuffix = isHouse && selectedHouse ? ` in ${selectedHouse.name}` : '';
            showAlert('success', `Created room "${topic || 'Clubhouse Room'}"${houseSuffix}! Joining...`);
            createModal.style.display = 'none';

            if (channelId) {
              await joinChannelById(channelId, chData);
            } else {
              await fetchFeedChannels();
            }
          } else {
            showAlert('error', (res && res.error) || 'Failed to create channel');
          }
        } catch (err) {
          showAlert('error', `Error creating room: ${err.message}`);
        } finally {
          isCreatingRoom = false;
          if (btnLaunch) {
            btnLaunch.disabled = false;
            updateSelectedHouseUI();
          }
        }
      };

      btnLaunch.onclick = handleLaunchRoom;
    }
  }

  btnOpenFolder.addEventListener('click', async () => {
    await window.powerdeckAPI.openProfileFolder();
  });

  if (btnViewJson) {
    btnViewJson.addEventListener('click', () => {
      if (activeProfile) {
        modalJsonText.value = JSON.stringify(activeProfile, null, 2);
        jsonModal.style.display = 'flex';
      }
    });
  }

  btnCloseModal.addEventListener('click', () => { jsonModal.style.display = 'none'; });
  btnModalDismiss.addEventListener('click', () => { jsonModal.style.display = 'none'; });

  btnCopyModalJson.addEventListener('click', async () => {
    await window.powerdeckAPI.copyToClipboard(modalJsonText.value);
    btnCopyModalJson.textContent = '✓ Copied!';
    setTimeout(() => { btnCopyModalJson.textContent = '📋 Copy JSON'; }, 1500);
  });

  // Unlink profile.json from AppData\powerdeckpro
  if (btnUnlinkProfile) {
    btnUnlinkProfile.addEventListener('click', async () => {
      try {
        if (window.powerdeckAPI && window.powerdeckAPI.logout) {
          await window.powerdeckAPI.logout();
        } else if (window.powerdeckAPI && window.powerdeckAPI.deleteProfile) {
          await window.powerdeckAPI.deleteProfile();
        }
      } catch (err) {
        console.warn("[Unlink] Error clearing profile.json:", err);
      }
      activeProfile = null;
      activeToken = '';
      if (tokenPreviewInput) tokenPreviewInput.value = '';
      if (tokenPreviewCard) tokenPreviewCard.classList.remove('has-token');
      if (tokenStatusBadge) {
        tokenStatusBadge.textContent = 'Standby';
        tokenStatusBadge.classList.remove('active');
      }

      viewHome.classList.remove('active');
      viewLogin.classList.add('active');
      resetPhoneOtpFlow();
      if (inputPassPassword) inputPassPassword.value = '';
      if (inputTokenDirect) inputTokenDirect.value = '';
      showAlert('info', 'Session unlinked.');
      setAppStatus('Ready to authenticate.');
    });
  }

  // Sign Out Modal: Yes / No Confirmation & 5-Second Animated Progress
  const signoutModal = document.getElementById('signout-confirm-modal');
  const signoutConfirmState = document.getElementById('signout-confirm-state');
  const signoutProgressState = document.getElementById('signout-progress-state');
  const btnSignoutNo = document.getElementById('btn-signout-no');
  const btnSignoutYes = document.getElementById('btn-signout-yes');
  const signoutTitle = document.getElementById('signout-title');
  const signoutSubtitle = document.getElementById('signout-subtitle');
  const signoutLogoIcon = document.getElementById('signout-logo-icon');
  const signoutLoaderBar = document.getElementById('signout-loader-bar');
  const signoutCountdownDisplay = document.getElementById('signout-countdown-display');
  const signoutStatusText = document.getElementById('signout-status-text');

  let isSigningOutProgress = false;

  function closeSignoutModal() {
    if (isSigningOutProgress) return;
    if (signoutModal) {
      signoutModal.classList.remove('active');
      setTimeout(() => {
        signoutModal.style.display = 'none';
      }, 300);
    }
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (isSigningOutProgress) return;
      if (signoutModal && signoutConfirmState && signoutProgressState) {
        signoutConfirmState.style.display = 'flex';
        signoutProgressState.style.display = 'none';
        if (signoutTitle) signoutTitle.textContent = 'SIGN OUT';
        if (signoutSubtitle) signoutSubtitle.textContent = 'PowerDeck Pro Session';
        if (signoutLogoIcon) signoutLogoIcon.textContent = '🚪';
        signoutModal.style.display = 'flex';
        requestAnimationFrame(() => {
          signoutModal.classList.add('active');
        });
      }
    });
  }

  if (btnSignoutNo) {
    btnSignoutNo.addEventListener('click', () => {
      closeSignoutModal();
    });
  }

  if (signoutModal) {
    signoutModal.addEventListener('click', (e) => {
      if (e.target === signoutModal && !isSigningOutProgress) {
        closeSignoutModal();
      }
    });
  }

  if (btnSignoutYes) {
    btnSignoutYes.addEventListener('click', async () => {
      if (isSigningOutProgress) return;
      isSigningOutProgress = true;

      // Switch to animated loading state (loading only)
      if (signoutConfirmState) signoutConfirmState.style.display = 'none';
      if (signoutProgressState) signoutProgressState.style.display = 'flex';
      if (signoutTitle) signoutTitle.textContent = 'SIGNING OUT';
      if (signoutSubtitle) signoutSubtitle.style.display = 'none';
      if (signoutLogoIcon) signoutLogoIcon.textContent = '⚡';

      // Immediately initiate profile unlinking & session teardown
      try {
        if (currentActiveRoom) {
          try { leaveActiveRoom(); } catch (_) {}
        }
        if (window.powerdeckAPI && window.powerdeckAPI.logout) {
          window.powerdeckAPI.logout();
        }
        if (window.powerdeckAPI && window.powerdeckAPI.deleteProfile) {
          window.powerdeckAPI.deleteProfile();
        }
      } catch (err) {
        console.warn("[Logout] Error clearing session:", err);
      }

      if (feedAutoRefreshTimer) {
        clearInterval(feedAutoRefreshTimer);
        feedAutoRefreshTimer = null;
      }

      // 5-second animated progress (loading only)
      const signoutDuration = 5000;
      const signoutStartTime = Date.now();

      const signoutInterval = setInterval(() => {
        const elapsed = Date.now() - signoutStartTime;
        const progress = Math.min(100, (elapsed / signoutDuration) * 100);

        if (signoutLoaderBar) {
          signoutLoaderBar.style.width = `${progress}%`;
        }
        if (signoutStatusText) {
          const dotCount = (Math.floor(elapsed / 450) % 3) + 1;
          signoutStatusText.textContent = `Signing out${'.'.repeat(dotCount)}`;
        }

        if (elapsed >= signoutDuration) {
          clearInterval(signoutInterval);
          if (signoutLoaderBar) signoutLoaderBar.style.width = '100%';
          if (signoutStatusText) signoutStatusText.textContent = 'Signing out...';

          setTimeout(() => {
            if (signoutModal) {
              signoutModal.classList.remove('active');
              setTimeout(() => {
                signoutModal.style.display = 'none';
                if (signoutSubtitle) signoutSubtitle.style.display = '';
                isSigningOutProgress = false;
              }, 300);
            }

            activeProfile = null;
            activeToken = '';
            if (tokenPreviewInput) tokenPreviewInput.value = '';
            if (tokenPreviewCard) tokenPreviewCard.classList.remove('has-token');
            if (tokenStatusBadge) {
              tokenStatusBadge.textContent = 'Standby';
              tokenStatusBadge.classList.remove('active');
            }

            viewHome.classList.remove('active');
            viewLogin.classList.add('active');
            resetPhoneOtpFlow();
            if (inputPassPassword) inputPassPassword.value = '';
            if (inputTokenDirect) inputTokenDirect.value = '';
            hideAlert();
            setAppStatus('Signed out successfully.');
            showAlert('info', 'Signed out successfully.');
          }, 200);
        }
      }, 50);
    });
  }

  // ============================================================
  // ABOUT US & HELP MODAL CONTROLLERS
  // ============================================================
  const aboutUsModal = document.getElementById('about-us-modal');
  const btnCloseAboutModal = document.getElementById('btn-close-about-modal');
  const btnTopAbout = document.getElementById('btn-top-about');
  const btnHomeAbout = document.getElementById('btn-home-about');
  const btnOpenBuymeacoffee = document.getElementById('btn-open-buymeacoffee');
  const btnCopyBuymeacoffee = document.getElementById('btn-copy-buymeacoffee');
  const linkBuymeacoffee = document.getElementById('link-buymeacoffee');
  const btnOpenTelegram = document.getElementById('btn-open-telegram');
  const btnCopyTelegram = document.getElementById('btn-copy-telegram');
  const linkTelegramContact = document.getElementById('link-telegram-contact');

  function openAboutUsModal() {
    if (aboutUsModal) {
      aboutUsModal.style.display = 'flex';
      requestAnimationFrame(() => {
        aboutUsModal.classList.add('active');
      });
    }
  }

  function closeAboutUsModal() {
    if (aboutUsModal) {
      aboutUsModal.classList.remove('active');
      setTimeout(() => {
        aboutUsModal.style.display = 'none';
      }, 300);
    }
  }

  if (btnTopAbout) btnTopAbout.addEventListener('click', openAboutUsModal);
  if (btnHomeAbout) btnHomeAbout.addEventListener('click', openAboutUsModal);
  if (btnCloseAboutModal) btnCloseAboutModal.addEventListener('click', closeAboutUsModal);
  if (aboutUsModal) {
    aboutUsModal.addEventListener('click', (e) => {
      if (e.target === aboutUsModal) closeAboutUsModal();
    });
  }

  const BUYMEACOFFEE_URL = 'https://buymeacoffee.com/powerdeckpro';
  const TELEGRAM_URL = 'https://t.me/worldofmathan';
  const TELEGRAM_GROUP_URL = 'https://t.me/clubhousecodes';

  const btnOpenTelegramGroup = document.getElementById('btn-open-telegram-group');
  const btnCopyTelegramGroup = document.getElementById('btn-copy-telegram-group');
  const linkTelegramGroup = document.getElementById('link-telegram-group');

  if (btnOpenBuymeacoffee) {
    btnOpenBuymeacoffee.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
        window.powerdeckAPI.openExternal(BUYMEACOFFEE_URL);
      }
    });
  }
  if (linkBuymeacoffee) {
    linkBuymeacoffee.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
        window.powerdeckAPI.openExternal(BUYMEACOFFEE_URL);
      }
    });
  }
  if (btnCopyBuymeacoffee) {
    btnCopyBuymeacoffee.addEventListener('click', async () => {
      if (window.powerdeckAPI && window.powerdeckAPI.copyToClipboard) {
        await window.powerdeckAPI.copyToClipboard(BUYMEACOFFEE_URL);
      }
      btnCopyBuymeacoffee.textContent = '✓ Copied!';
      setTimeout(() => { btnCopyBuymeacoffee.textContent = '📋 Copy Link'; }, 1800);
    });
  }

  if (btnOpenTelegram) {
    btnOpenTelegram.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
        window.powerdeckAPI.openExternal(TELEGRAM_URL);
      }
    });
  }
  if (linkTelegramContact) {
    linkTelegramContact.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
        window.powerdeckAPI.openExternal(TELEGRAM_URL);
      }
    });
  }
  if (btnCopyTelegram) {
    btnCopyTelegram.addEventListener('click', async () => {
      if (window.powerdeckAPI && window.powerdeckAPI.copyToClipboard) {
        await window.powerdeckAPI.copyToClipboard(TELEGRAM_URL);
      }
      btnCopyTelegram.textContent = '✓ Copied!';
      setTimeout(() => { btnCopyTelegram.textContent = '📋 Copy Telegram'; }, 1800);
    });
  }

  if (btnOpenTelegramGroup) {
    btnOpenTelegramGroup.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
        window.powerdeckAPI.openExternal(TELEGRAM_GROUP_URL);
      }
    });
  }
  if (linkTelegramGroup) {
    linkTelegramGroup.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
        window.powerdeckAPI.openExternal(TELEGRAM_GROUP_URL);
      }
    });
  }
  if (btnCopyTelegramGroup) {
    btnCopyTelegramGroup.addEventListener('click', async () => {
      if (window.powerdeckAPI && window.powerdeckAPI.copyToClipboard) {
        await window.powerdeckAPI.copyToClipboard(TELEGRAM_GROUP_URL);
      }
      btnCopyTelegramGroup.textContent = '✓ Copied!';
      setTimeout(() => { btnCopyTelegramGroup.textContent = '📋 Copy Group Link'; }, 1800);
    });
  }

  // Help Modal Controllers
  const helpModal = document.getElementById('help-modal');
  const btnCloseHelpModal = document.getElementById('btn-close-help-modal');
  const btnHelpDismiss = document.getElementById('btn-help-dismiss');
  const btnTopHelp = document.getElementById('btn-top-help');
  const btnHomeHelp = document.getElementById('btn-home-help');
  const helpLinkTelegram = document.getElementById('help-link-telegram');
  const helpLinkTelegramGroup = document.getElementById('help-link-telegram-group');

  function openHelpModal() {
    if (helpModal) {
      helpModal.style.display = 'flex';
      requestAnimationFrame(() => {
        helpModal.classList.add('active');
      });
    }
  }

  function closeHelpModal() {
    if (helpModal) {
      helpModal.classList.remove('active');
      setTimeout(() => {
        helpModal.style.display = 'none';
      }, 300);
    }
  }

  if (btnTopHelp) btnTopHelp.addEventListener('click', openHelpModal);
  if (btnHomeHelp) btnHomeHelp.addEventListener('click', openHelpModal);
  if (btnCloseHelpModal) btnCloseHelpModal.addEventListener('click', closeHelpModal);
  if (btnHelpDismiss) btnHelpDismiss.addEventListener('click', closeHelpModal);
  if (helpModal) {
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) closeHelpModal();
    });
  }
  if (helpLinkTelegram) {
    helpLinkTelegram.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
        window.powerdeckAPI.openExternal(TELEGRAM_URL);
      }
    });
  }
  if (helpLinkTelegramGroup) {
    helpLinkTelegramGroup.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.powerdeckAPI && window.powerdeckAPI.openExternal) {
        window.powerdeckAPI.openExternal(TELEGRAM_GROUP_URL);
      }
    });
  }

  // ============================================================
  // AUTO-UPDATE SYSTEM CONTROLLER
  // ============================================================
  const btnTopCheckUpdates = document.getElementById('btn-top-check-updates');
  const updateBtnText = document.getElementById('update-btn-text');
  const updateIconSpin = document.getElementById('update-icon-spin');
  const updateBadgeDot = document.getElementById('update-badge-dot');

  const updateModal = document.getElementById('modal-update-dialog');
  const btnCloseUpdateModal = document.getElementById('btn-close-update-modal');
  const btnUpdateRemindLater = document.getElementById('btn-update-remind-later');
  const btnUpdateDownloadNow = document.getElementById('btn-update-download-now');

  const updateCurrentVerVal = document.getElementById('update-current-ver-val');
  const updateLatestVerVal = document.getElementById('update-latest-ver-val');
  const updateNotesBody = document.getElementById('update-notes-body');
  const updateModalTitle = document.getElementById('update-modal-title');
  const updateModalSubtitle = document.getElementById('update-modal-subtitle');

  const updatePromptView = document.getElementById('update-prompt-view');
  const updateDownloadingView = document.getElementById('update-downloading-view');
  const updateLiveStatusText = document.getElementById('update-live-status-text');
  const updateProgressBarFill = document.getElementById('update-progress-bar-fill');
  const updateProgressPercent = document.getElementById('update-progress-percent');
  const updateProgressBytes = document.getElementById('update-progress-bytes');

  let activeUpdateInfo = null;
  let isUpdatingNow = false;

  function openUpdateModal(updateInfo) {
    if (!updateModal) return;
    activeUpdateInfo = updateInfo;
    isUpdatingNow = false;

    if (updatePromptView) updatePromptView.style.display = 'block';
    if (updateDownloadingView) updateDownloadingView.style.display = 'none';
    if (btnCloseUpdateModal) btnCloseUpdateModal.style.display = 'block';

    const statusPill = document.getElementById('update-status-pill');
    if (statusPill) {
      statusPill.innerHTML = '<span class="update-badge-dot"></span> PowerDeck Pro Auto-Update';
    }

    if (updateCurrentVerVal) updateCurrentVerVal.textContent = `v${updateInfo.currentVersion || '2.0.0'}`;
    if (updateLatestVerVal) updateLatestVerVal.textContent = `v${updateInfo.latestVersion || '2.0.0'}`;
    if (updateNotesBody) {
      updateNotesBody.textContent = updateInfo.releaseNotes || 'New enhancements, bug fixes, and stability improvements available.';
    }
    if (updateModalSubtitle) {
      updateModalSubtitle.textContent = `PowerDeck Pro v${updateInfo.latestVersion || '2.0.0'} is available. Do you want to update now?`;
    }

    // Hide startup splash screen immediately so update prompt is front and center
    const startupSplash = document.getElementById('startup-splash-screen');
    if (startupSplash) {
      startupSplash.style.display = 'none';
    }

    updateModal.style.display = 'flex';
  }

  function closeUpdateModal() {
    if (isUpdatingNow) return; // Prevent closing while actively downloading update
    if (updateModal) updateModal.style.display = 'none';
    if (updatePromptView) updatePromptView.style.display = 'block';
    if (updateDownloadingView) updateDownloadingView.style.display = 'none';
    if (btnCloseUpdateModal) btnCloseUpdateModal.style.display = 'block';
  }

  if (btnCloseUpdateModal) btnCloseUpdateModal.addEventListener('click', closeUpdateModal);
  if (btnUpdateRemindLater) btnUpdateRemindLater.addEventListener('click', closeUpdateModal);
  if (updateModal) {
    updateModal.addEventListener('click', (e) => {
      if (e.target === updateModal && !isUpdatingNow) closeUpdateModal();
    });
  }

  if (btnUpdateDownloadNow) {
    btnUpdateDownloadNow.addEventListener('click', async () => {
      if (!activeUpdateInfo) {
        closeUpdateModal();
        return;
      }

      isUpdatingNow = true;

      if (updatePromptView) updatePromptView.style.display = 'none';
      if (updateDownloadingView) updateDownloadingView.style.display = 'block';
      if (btnCloseUpdateModal) btnCloseUpdateModal.style.display = 'none';

      if (updateLiveStatusText) updateLiveStatusText.textContent = 'Connecting to PowerDeck Pro update server...';
      if (updateProgressBarFill) updateProgressBarFill.style.width = '0%';
      if (updateProgressPercent) updateProgressPercent.textContent = '0%';
      if (updateProgressBytes) updateProgressBytes.textContent = 'Starting download...';

      // Register live IPC download progress listener
      let unlistenProgress = null;
      if (window.powerdeckAPI && window.powerdeckAPI.onUpdateProgress) {
        unlistenProgress = window.powerdeckAPI.onUpdateProgress((prog) => {
          const percent = Math.min(100, Math.max(0, prog.percent || 0));
          if (updateProgressBarFill) updateProgressBarFill.style.width = `${percent}%`;
          if (updateProgressPercent) updateProgressPercent.textContent = `${percent}%`;

          const transferred = prog.downloadedBytes || prog.transferred || 0;
          const total = prog.totalBytes || prog.total || 0;
          if (updateProgressBytes) {
            const mbTransferred = (transferred / (1024 * 1024)).toFixed(1);
            const mbTotal = total > 0 ? (total / (1024 * 1024)).toFixed(1) + ' MB' : '...';
            updateProgressBytes.textContent = `${mbTransferred} MB / ${mbTotal}`;
          }
          if (updateLiveStatusText) {
            updateLiveStatusText.textContent = `Downloading update: ${percent}% complete`;
          }
        });
      }

      try {
        if (!window.powerdeckAPI || !window.powerdeckAPI.downloadAndInstallUpdate) {
          throw new Error('In-app updater API is unavailable');
        }

        const res = await window.powerdeckAPI.downloadAndInstallUpdate({
          downloadUrl: activeUpdateInfo.downloadUrl,
          assetApiUrl: activeUpdateInfo.assetApiUrl,
          fileName: activeUpdateInfo.fileName
        });

        if (res && res.success) {
          if (updateLiveStatusText) updateLiveStatusText.textContent = '✓ Download complete! Launching installer and restarting...';
          if (updateProgressBarFill) updateProgressBarFill.style.width = '100%';
          if (updateProgressPercent) updateProgressPercent.textContent = '100%';
          if (updateProgressBytes) updateProgressBytes.textContent = 'Restarting application...';
        } else {
          isUpdatingNow = false;
          const errMsg = res?.error || 'Download failed';
          if (updateLiveStatusText) updateLiveStatusText.textContent = `❌ Update failed: ${errMsg}`;
          if (btnCloseUpdateModal) btnCloseUpdateModal.style.display = 'block';
          showAlert('danger', `Update installation failed: ${errMsg}`);
        }
      } catch (err) {
        isUpdatingNow = false;
        if (updateLiveStatusText) updateLiveStatusText.textContent = `❌ Update error: ${err.message || 'Network error'}`;
        if (btnCloseUpdateModal) btnCloseUpdateModal.style.display = 'block';
        showAlert('danger', `Update error: ${err.message || 'Network error'}`);
      } finally {
        if (typeof unlistenProgress === 'function') {
          unlistenProgress();
        }
      }
    });
  }

  async function performUpdateCheck(isManual = false) {
    if (isManual) {
      if (updateBtnText) updateBtnText.textContent = 'Checking...';
      if (updateIconSpin) updateIconSpin.style.animation = 'spin 0.8s linear infinite';
    }

    try {
      if (window.powerdeckAPI && window.powerdeckAPI.checkForUpdates) {
        const result = await window.powerdeckAPI.checkForUpdates();
        if (result && result.hasUpdate) {
          if (updateBadgeDot) updateBadgeDot.style.display = 'block';
          if (btnTopCheckUpdates) btnTopCheckUpdates.classList.add('has-update-pending');
          openUpdateModal(result);
        } else if (isManual) {
          if (updateBtnText) updateBtnText.textContent = 'Up to date';
          setTimeout(() => {
            if (updateBtnText) updateBtnText.textContent = 'Updates';
          }, 3000);
          showAlert('success', `PowerDeck Pro is up to date (v${result.currentVersion || '2.0.0'})`);
        }
      }
    } catch (err) {
      if (isManual) {
        showAlert('warning', `Update check failed: ${err.message || 'Offline'}`);
      }
    } finally {
      if (isManual) {
        if (updateIconSpin) updateIconSpin.style.animation = 'none';
        if (updateBtnText && updateBtnText.textContent === 'Checking...') {
          updateBtnText.textContent = 'Updates';
        }
      }
    }
  }

  if (btnTopCheckUpdates) {
    btnTopCheckUpdates.addEventListener('click', () => {
      performUpdateCheck(true);
    });
  }

  // Clear Application Cache & Preferences Controller
  const btnTopClearCache = document.getElementById('btn-top-clear-cache');
  const clearCacheBtnText = document.getElementById('clear-cache-btn-text');
  const clearCacheIcon = document.getElementById('clear-cache-icon');

  if (btnTopClearCache) {
    btnTopClearCache.addEventListener('click', async () => {
      const confirmed = confirm('Clear all cached files and preferences from PowerDeck Pro AppData? This will clean local session caches.');
      if (!confirmed) return;

      if (clearCacheBtnText) clearCacheBtnText.textContent = 'Clearing...';
      if (clearCacheIcon) clearCacheIcon.style.transform = 'rotate(180deg)';

      try {
        if (window.powerdeckAPI && window.powerdeckAPI.clearCacheAndPreferences) {
          const res = await window.powerdeckAPI.clearCacheAndPreferences();
          if (res && res.success) {
            if (clearCacheBtnText) clearCacheBtnText.textContent = '✓ Cleared';
            showAlert('success', `✓ AppData cache and preferences cleared successfully (${res.clearedCount || 0} items cleaned).`);
          } else {
            showAlert('warning', `Cache cleared with notices: ${res?.errors?.join(', ') || 'Partial'}`);
          }
        }
      } catch (err) {
        showAlert('danger', `Failed to clear cache: ${err.message || 'Error'}`);
      } finally {
        if (clearCacheIcon) clearCacheIcon.style.transform = 'none';
        setTimeout(() => {
          if (clearCacheBtnText) clearCacheBtnText.textContent = 'Clear Cache';
        }, 3000);
      }
    });
  }

  // Automatic in-app update check while starting PowerDeck Pro
  setTimeout(() => {
    performUpdateCheck(false);
  }, 1000);

  // Initialize swipable stage & audience tabs
  initChannelSwipeTabs();

  // Initialize Mic FX controls & dock button
  setupMicFxUIEvents();
  syncMicFxUI();

  // Register background PubNub event listener from Electron main process
  if (window.powerdeckAPI && window.powerdeckAPI.onPubNubEvent) {
    window.powerdeckAPI.onPubNubEvent((eventData) => {
      try {
        handleIncomingPubNubEvent(eventData);
      } catch (err) {
        console.warn("[PubNub Event Listener Error]", err);
      }
    });
  }

  // Initialize Windows VPS Non-Stop RTC Watchdog & Audio Keep-Alive
  initVpsRtcWatchdog();

  // Check existing session & auto-boot to Home page
  await checkExistingProfile();
});
