const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('powerdeckAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onWindowStateChanged: (callback) => {
    ipcRenderer.on('window-state-changed', (event, data) => callback(data));
  },

  // Device ID
  getDeviceId: () => ipcRenderer.invoke('device:get-id'),
  generateNewDeviceId: () => ipcRenderer.invoke('device:new-id'),

  // Profile operations
  checkExistingProfile: () => ipcRenderer.invoke('profile:check-existing'),
  openProfileFolder: () => ipcRenderer.invoke('profile:open-folder'),
  getProfilePath: () => ipcRenderer.invoke('profile:get-path'),
  deleteProfile: () => ipcRenderer.invoke('profile:delete'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Auth operations
  startPhoneAuth: (phoneNumber, deviceId) =>
    ipcRenderer.invoke('auth:start-phone', { phoneNumber, deviceId }),
  verifyOtp: (phoneNumber, verificationCode, deviceId) =>
    ipcRenderer.invoke('auth:verify-otp', { phoneNumber, verificationCode, deviceId }),
  passwordAuth: (phoneNumber, password, deviceId) =>
    ipcRenderer.invoke('auth:password', { phoneNumber, password, deviceId }),
  tokenAuth: (token, deviceId) =>
    ipcRenderer.invoke('auth:token', { token, deviceId }),

  // Clipboard & System
  copyToClipboard: (text) => ipcRenderer.invoke('system:copy', text),
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),

  // Clubhouse Feed & Channel API
  getFeedV3: (page) => ipcRenderer.invoke('ch:get-feed', { page }),
  joinChannel: (channelArg) =>
    ipcRenderer.invoke('ch:join-channel', (channelArg && typeof channelArg === 'object') ? channelArg : { channelId: channelArg }),
  getContentInviteInfo: (inviteCode) => ipcRenderer.invoke('ch:get-content-invite-info', inviteCode),
  getChannel: (channelId) => ipcRenderer.invoke('ch:get-channel', { channelId }),
  leaveChannel: (channelId) => ipcRenderer.invoke('ch:leave-channel', { channelId }),
  endChannel: (channelId) => ipcRenderer.invoke('ch:end-channel', { channelId }),
  end_channel: (channelId) => ipcRenderer.invoke('ch:end-channel', { channelId }),
  getUnifiedInviteLink: (channel, isInstantInvite = false) =>
    ipcRenderer.invoke('ch:get-unified-invite-link', { channel, isInstantInvite }),
  disableReplay: (channel) => ipcRenderer.invoke('ch:disable-replay', { channel }),
  getSuggestedSpeakers: (channel, source = 5) =>
    ipcRenderer.invoke('ch:get-suggested-speakers', { channel, source }),
  inviteToExistingChannel: (channel, userId) =>
    ipcRenderer.invoke('ch:invite-to-existing-channel', { channel, userId }),
  getChannelMessages: (channelId, isChronological = false, nextCursor = null) =>
    ipcRenderer.invoke('ch:get-channel-messages', { channelId, isChronological, nextCursor }),
  sendChannelMessage: (channelId, message, replyToMessageId) =>
    ipcRenderer.invoke('ch:send-channel-message', { channelId, message, replyToMessageId }),
  activePing: (channelId) =>
    ipcRenderer.invoke('ch:active-ping', { channelId }),
  becomeSpeaker: (channelId) =>
    ipcRenderer.invoke('ch:become-speaker', { channelId }),
  audienceReply: (channelId, raiseHands) =>
    ipcRenderer.invoke('ch:audience-reply', { channelId, raiseHands }),
  muteSpeaker: (channelId, targetUserId) =>
    ipcRenderer.invoke('ch:mute-speaker', { channelId, targetUserId }),
  inviteSpeaker: (channelId, targetUserId) =>
    ipcRenderer.invoke('ch:invite-speaker', { channelId, targetUserId }),
  uninviteSpeaker: (channelId, targetUserId) =>
    ipcRenderer.invoke('ch:uninvite-speaker', { channelId, targetUserId }),
  sendChannelReaction: (channelId, targetUserId, reactionId, isAudioReaction, emoji, isExtra) =>
    ipcRenderer.invoke('ch:send-reaction', { channelId, targetUserId, reactionId, isAudioReaction, emoji, isExtra }),
  sendReaction: (channelId, targetUserId, reactionId, isAudioReaction, emoji, isExtra) =>
    ipcRenderer.invoke('ch:send-reaction', { channelId, targetUserId, reactionId, isAudioReaction, emoji, isExtra }),
  startPubNubLoop: (channelId, pubnubToken) =>
    ipcRenderer.invoke('ch:start-pubnub-loop', { channelId, pubnubToken }),
  stopPubNubLoop: () =>
    ipcRenderer.invoke('ch:stop-pubnub-loop'),
  onPubNubEvent: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('ch:pubnub-event', handler);
    return () => ipcRenderer.removeListener('ch:pubnub-event', handler);
  },
  sendGifReaction: (channelId, giphyId) =>
    ipcRenderer.invoke('ch:send-gif-reaction', { channelId, giphyId }),
  makeModerator: (channelId, targetUserId) =>
    ipcRenderer.invoke('ch:make-moderator', { channelId, targetUserId }),
  setChannelTitle: (channelId, title) =>
    ipcRenderer.invoke('ch:set-channel-title', { channelId, title }),
  muteOtherSpeakers: (channelId) =>
    ipcRenderer.invoke('ch:mute-other-speakers', { channelId }),
  addChannelLink: (channelId, link) =>
    ipcRenderer.invoke('ch:add-channel-link', { channelId, link }),
  removeChannelLink: (channelId, linkId) =>
    ipcRenderer.invoke('ch:remove-channel-link', { channelId, linkId }),
  enableChannelMessages: (channelId) =>
    ipcRenderer.invoke('ch:enable-channel-messages', { channelId }),
  disableChannelMessages: (channelId) =>
    ipcRenderer.invoke('ch:disable-channel-messages', { channelId }),
  getModeratorActionHistory: (channel, limit, cursor) =>
    ipcRenderer.invoke('ch:get-moderator-action-history', { channel, limit, cursor }),
  getHandraiseQueue: (channelId) =>
    ipcRenderer.invoke('ch:get-handraise-queue', { channelId }),

  // Audio Preferences
  getAudioPrefs: () => ipcRenderer.invoke('audio:get-prefs'),
  saveAudioPrefs: (prefs) => ipcRenderer.invoke('audio:save-prefs', prefs),

  // Clubhouse Search & Social Clubs & Profiles
  search: (query) => ipcRenderer.invoke('ch:search', { query }),
  getSocialClub: (socialClubId, loggingContext, socialClubSlug) => {
    if (typeof socialClubId === 'object' && socialClubId !== null) {
      return ipcRenderer.invoke('ch:get-social-club', socialClubId);
    }
    return ipcRenderer.invoke('ch:get-social-club', { socialClubId, loggingContext, socialClubSlug });
  },
  getSocialClubMembers: (socialClubId, cursor) =>
    ipcRenderer.invoke('ch:get-social-club-members', { socialClubId, cursor }),
  joinSocialClub: (socialClubId, options = null) =>
    ipcRenderer.invoke('ch:join-social-club', { socialClubId, options }),
  leaveSocialClub: (socialClubId) =>
    ipcRenderer.invoke('ch:leave-social-club', { socialClubId }),
  getSocialClubLink: (socialClubId, source = 4) =>
    ipcRenderer.invoke('ch:get-social-club-link', { socialClubId, source }),
  getSocialClubUsersForInvites: (socialClubId, contacts = []) =>
    ipcRenderer.invoke('ch:get-social-club-users-for-invites', { socialClubId, contacts }),
  addSocialClubMember: (socialClubId, userId, isFoundingMember = false, source = 4) =>
    ipcRenderer.invoke('ch:add-social-club-member', { socialClubId, userId, isFoundingMember, source }),
  getProfile: (userId, loggingContext, username) => {
    if (typeof userId === 'object' && userId !== null) {
      return ipcRenderer.invoke('ch:get-profile', userId);
    }
    return ipcRenderer.invoke('ch:get-profile', { userId, loggingContext, username });
  },
  followUser: (userId, loggingContext) => {
    const safeContext = (loggingContext && typeof loggingContext === 'object' && !Array.isArray(loggingContext))
      ? loggingContext
      : null;
    return ipcRenderer.invoke('ch:follow', { userId, loggingContext: safeContext });
  },
  unfollowUser: (userId) =>
    ipcRenderer.invoke('ch:unfollow', { userId }),

  // Clubhouse Social Graph & Profile Customization
  getUserSocialGraph: (userId, requestType, limit, page, cursor) => {
    if (typeof userId === 'object' && userId !== null) {
      return ipcRenderer.invoke('ch:get-user-social-graph', userId);
    }
    return ipcRenderer.invoke('ch:get-user-social-graph', { userId, requestType, limit, page, cursor });
  },
  updateName: (name) =>
    ipcRenderer.invoke('ch:update-name', { name }),
  updateDisplayName: (name) =>
    ipcRenderer.invoke('ch:update-display-name', { name }),
  updateUsername: (username) =>
    ipcRenderer.invoke('ch:update-username', { username }),
  updateBio: (bio) =>
    ipcRenderer.invoke('ch:update-bio', { bio }),
  getAccountSettings: () =>
    ipcRenderer.invoke('ch:get-account-settings'),
  enableFollowerRequests: () =>
    ipcRenderer.invoke('ch:enable-follower-requests'),
  disableFollowerRequests: () =>
    ipcRenderer.invoke('ch:disable-follower-requests'),
  enablePrivateConversations: () =>
    ipcRenderer.invoke('ch:enable-private-conversations'),
  disablePrivateConversations: () =>
    ipcRenderer.invoke('ch:disable-private-conversations'),
  addEmail: (email) =>
    ipcRenderer.invoke('ch:add-email', { email }),
  startChangePhoneNumber: (phoneNumber) =>
    ipcRenderer.invoke('ch:start-change-phone-number', { phoneNumber }),
  verifyChangePhoneCode: (code, sessionId) =>
    ipcRenderer.invoke('ch:verify-change-phone-code', { code, sessionId }),
  getUserPhotoHistory: (userId) =>
    ipcRenderer.invoke('ch:get-photo-history', { userId }),
  getPhotoHistory: (userId) =>
    ipcRenderer.invoke('ch:get-photo-history', { userId }),
  setProfilePhoto: (photoKey) =>
    ipcRenderer.invoke('ch:set-profile-photo', { photoKey }),
  removePhoto: (photoKey) =>
    ipcRenderer.invoke('ch:remove-photo', { photoKey }),
  uploadProfilePhoto: (base64Data) =>
    ipcRenderer.invoke('ch:update-photo', { base64Data }),

  // Clubhouse Activities & Notifications
  getActivities: (nextCursor = null) =>
    ipcRenderer.invoke('ch:get-activities', nextCursor),

  // Clubhouse Profile Viewers & Anonymous Mode & Blocking
  getProfilesWhoViewedYou: async () => ({ success: true, data: { viewed_by_profiles: [], count: 0 } }),
  setAnonymousStatus: async () => ({ success: true }),
  blockUser: (userId) =>
    ipcRenderer.invoke('ch:block-user', { userId }),
  unblockUser: (userId) =>
    ipcRenderer.invoke('ch:unblock-user', { userId }),
  getBlockedUsers: () =>
    ipcRenderer.invoke('ch:get-blocked-users'),
  blockFromChannel: (channel, userId) =>
    ipcRenderer.invoke('ch:block-from-channel', { channel, userId }),
  me: () =>
    ipcRenderer.invoke('ch:me'),
  getCreateChannelTargets: () =>
    ipcRenderer.invoke('ch:get-create-channel-targets'),
  createChannel: (options) =>
    ipcRenderer.invoke('ch:create-channel', options),
  createSocialClub: (options) =>
    ipcRenderer.invoke('ch:create-social-club', options),
  addFollowersToSocialClub: (socialClubId) =>
    ipcRenderer.invoke('ch:add-followers-to-social-club', { socialClubId }),
  updateSocialClubName: (socialClubId, name) =>
    ipcRenderer.invoke('ch:update-social-club-name', { socialClubId, name }),
  updateSocialClubDescription: (socialClubId, description) =>
    ipcRenderer.invoke('ch:update-social-club-description', { socialClubId, description }),
  updateSocialClubPhoto: (socialClubId, base64Data) =>
    ipcRenderer.invoke('ch:update-social-club-photo', { socialClubId, base64Data }),
  updateSocialClubIsMembershipOpen: (socialClubId, isMembershipOpen) =>
    ipcRenderer.invoke('ch:update-social-club-is-membership-open', { socialClubId, isMembershipOpen }),
  updateSocialClubWaitlist: (socialClubId, options) =>
    ipcRenderer.invoke('ch:update-social-club-waitlist', { socialClubId, ...(options || {}) }),
  getSocialClubWaitlist: (socialClubId) =>
    ipcRenderer.invoke('ch:get-social-club-waitlist', { socialClubId }),
  updateSocialClubWaitlistQuestion: (socialClubId, waitlistQuestion) =>
    ipcRenderer.invoke('ch:update-social-club-waitlist-question', { socialClubId, waitlistQuestion }),
  updateSocialClubIsMembershipHidden: (socialClubId, isMembershipHidden) =>
    ipcRenderer.invoke('ch:update-social-club-is-membership-hidden', { socialClubId, isMembershipHidden }),
  updateSocialClubInviteSettings: (socialClubId, isAutomaticInvitesEnabled) =>
    ipcRenderer.invoke('ch:update-social-club-invite-settings', { socialClubId, isAutomaticInvitesEnabled }),
  updateSocialClubSettings: (socialClubId, permissions) =>
    ipcRenderer.invoke('ch:update-social-club-settings', { socialClubId, ...(permissions || {}) }),
  deleteSocialClub: (socialClubId) =>
    ipcRenderer.invoke('ch:delete-social-club', { socialClubId }),

  // Giphy & Uploaded GIF / Video Storage
  saveUploadedGif: (usernameOrUserId, fileName, base64Data, mimeType) =>
    ipcRenderer.invoke('giphy:save-uploaded-file', {
      username: typeof usernameOrUserId === 'string' && isNaN(Number(usernameOrUserId)) ? usernameOrUserId : undefined,
      userId: typeof usernameOrUserId === 'number' || !isNaN(Number(usernameOrUserId)) ? usernameOrUserId : undefined,
      fileName,
      base64Data,
      mimeType
    }),
  getUploadedGifs: (usernameOrUserId) =>
    ipcRenderer.invoke('giphy:get-uploaded-files', {
      username: typeof usernameOrUserId === 'string' && isNaN(Number(usernameOrUserId)) ? usernameOrUserId : undefined,
      userId: typeof usernameOrUserId === 'number' || !isNaN(Number(usernameOrUserId)) ? usernameOrUserId : undefined
    }),
  deleteUploadedGif: (usernameOrUserId, fileName, giphyId) =>
    ipcRenderer.invoke('giphy:delete-uploaded-file', {
      username: typeof usernameOrUserId === 'string' && isNaN(Number(usernameOrUserId)) ? usernameOrUserId : undefined,
      userId: typeof usernameOrUserId === 'number' || !isNaN(Number(usernameOrUserId)) ? usernameOrUserId : undefined,
      fileName,
      giphyId
    }),

  // Security Integrity & Remote Maintenance API
  checkStartupIntegrity: async () => ({ detected: false }),
  checkMaintenanceStatus: async () => ({ ok: true, maintenance: false }),

  // Application Version & Auto-Update API
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  getGitHubApiToken: async () => null,
  downloadAndInstallUpdate: (updateInfo) => ipcRenderer.invoke('app:download-and-install-update', updateInfo),
  onUpdateProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('app:update-progress', handler);
    return () => ipcRenderer.removeListener('app:update-progress', handler);
  },
  // Application Cache & Preferences Cleanup
  clearCacheAndPreferences: () => ipcRenderer.invoke('app:clear-cache-and-preferences'),

  // PowerDeck Pro Unlocked System
  checkLicenseStatus: async () => ({ success: true, is_paid: true, license: { key: 'UNLOCKED', status: 'active', days_left: 9999 } }),
  activateLicense: async () => ({ success: true, is_paid: true }),
  revokeLicense: async () => ({ success: true }),
  clearLicenseCache: async () => ({ success: true }),
  getLicenseDetails: async () => ({ success: true, has_license: true, license: { key: 'UNLOCKED', status: 'active' } }),
  searchBotProfile: async () => ({ success: true, results: [] }),
  generateAndSaveLicense: async () => ({ success: true }),
  listAllLicenses: async () => ({ success: true, licenses: [] })
});
