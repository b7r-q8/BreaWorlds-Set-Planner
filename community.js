// ============================================================
// COMMUNITY.JS — localStorage-only, no Firebase
// ============================================================

// ---- GLOBALS ----
let cmCurrentUser = null;
let cmCurrentPage = 'home';
let cmCurrentCommentPostId = null;
let cmCurrentLoadPostId = null;
let cmCloudTabType = 'world';
let cmSelectedAvatar = null;

const CM_AVATARS = [
    'display/spr_wa_black_rocker_hair.png',
    'display/spr_hat_fedora.png',
    'display/spr_hat_crown.png',
    'display/spr_hat_party.png',
    'display/spr_hat_top_hat.png'
];

const CM_XP_PER_LEVEL = 100;
const CM_XP_POST = 25;
const CM_XP_COMMENT = 10;
const CM_XP_VOTE = 5;

const CM_BANNED_WORDS = ['fuck', 'shit', 'damn', 'bitch', 'ass', 'dick', 'porn', 'sex', 'nazi', 'kill', 'die', 'rape', 'n1g', 'nig', 'fag', 'cunt', 'whore', 'slut'];

// ---- DATA HELPERS (localStorage) ----
function cmGenId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }

function cmGetStore(key, fallback) {
    try { const d = localStorage.getItem('cm_' + key); return d ? JSON.parse(d) : fallback; }
    catch { return fallback; }
}
function cmSetStore(key, val) {
    try {
        localStorage.setItem('cm_' + key, JSON.stringify(val));
    } catch (error) {
        console.error('Failed to save community store:', error);
        alert('Storage cache is full! Please delete some other slots (character/world/thumbnails) to free up space.');
    }
}

function cmGetUsers() { return cmGetStore('users', []); }
function cmSetUsers(u) { cmSetStore('users', u); }
function cmGetPosts() { return cmGetStore('posts', []); }
function cmSetPosts(p) { cmSetStore('posts', p); }
function cmGetComments() { return cmGetStore('comments', []); }
function cmSetComments(c) { cmSetStore('comments', c); }
function cmGetVotes() { return cmGetStore('votes', []); }
function cmSetVotes(v) { cmSetStore('votes', v); }
function cmGetCloudSaves() { return cmGetStore('cloudSaves', []); }
function cmSetCloudSaves(s) { cmSetStore('cloudSaves', s); }

function cmFindUser(username) { return cmGetUsers().find(u => u.usernameLower === username.toLowerCase()); }
function cmFindUserById(id) { return cmGetUsers().find(u => u.id === id); }
function cmUpdateUser(id, updates) {
    const users = cmGetUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx >= 0) { Object.assign(users[idx], updates); cmSetUsers(users); }
}

// ---- UTILITY FUNCTIONS ----
function cmEscapeHTML(str) {
    const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML;
}
function cmTimeAgo(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(ts).toLocaleDateString();
}
function cmGetLevelFromXP(xp) { return Math.max(1, Math.floor((xp || 0) / CM_XP_PER_LEVEL) + 1); }
function cmGetXPForNextLevel(xp, level) {
    const needed = level * CM_XP_PER_LEVEL;
    const current = (xp || 0) - (level - 1) * CM_XP_PER_LEVEL;
    return { current: Math.max(0, current), needed: CM_XP_PER_LEVEL };
}
function cmGetBadge(level) {
    if (level >= 20) return 'worldplanner/Blocks/spr_fg_diamond_block.png';
    if (level >= 10) return 'worldplanner/Blocks/spr_fg_gold_block.png';
    if (level >= 5) return 'worldplanner/Blocks/spr_fg_iron_block.png';
    return 'worldplanner/Blocks/spr_fg_stone.png';
}
function cmIsEnglishOnly(str) { return /^[\x20-\x7E\n\r\t]*$/.test(str); }
function cmContainsBannedWords(str) {
    const lower = str.toLowerCase();
    return CM_BANNED_WORDS.some(w => lower.includes(w));
}
function cmShowToast(msg, type) {
    let t = document.getElementById('cm-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cm-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cm-toast ' + (type || 'info') + ' show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}
function cmAwardXP(userId, amount) {
    const users = cmGetUsers();
    const u = users.find(x => x.id === userId);
    if (!u) return;
    u.xp = (u.xp || 0) + amount;
    u.level = cmGetLevelFromXP(u.xp);
    cmSetUsers(users);
    if (cmCurrentUser && cmCurrentUser.id === userId) {
        cmCurrentUser.xp = u.xp;
        cmCurrentUser.level = u.level;
    }
}

// ---- INITIALIZATION ----
document.addEventListener('DOMContentLoaded', () => {
    // Restore session
    const sessionUser = cmGetStore('session', null);
    if (sessionUser) {
        const u = cmFindUserById(sessionUser);
        if (u && !u.banned) { cmCurrentUser = u; cmUpdateAuthUI(true); }
        else { cmSetStore('session', null); cmUpdateAuthUI(false); }
    } else { cmUpdateAuthUI(false); }

    // Check URL tab param
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['home', 'recent', 'worlds', 'sets'].includes(tab)) cmSwitchPage(tab);
    else cmSwitchPage('home');

    // Admin trigger: type ///admin
    let adminBuffer = '';
    document.addEventListener('keydown', e => {
        adminBuffer += e.key;
        if (adminBuffer.length > 10) adminBuffer = adminBuffer.slice(-10);
        if (adminBuffer.includes('///admin')) { adminBuffer = ''; cmTryOpenAdmin(); }
    });

    // Char counter for description
    const descInput = document.getElementById('cm-post-desc');
    const descCount = document.getElementById('cm-desc-count');
    if (descInput && descCount) {
        descInput.addEventListener('input', () => { descCount.textContent = descInput.value.length; });
    }
});

// ---- AUTH ----
function cmShowAuthModal() { document.getElementById('cm-auth-modal').style.display = 'flex'; }
function cmCloseAuthModal() { document.getElementById('cm-auth-modal').style.display = 'none'; }
function cmDismissWarning() {
    document.getElementById('cm-auth-warning').style.display = 'none';
    document.getElementById('cm-auth-forms').style.display = 'block';
}
function cmSwitchAuthTab(tab) {
    document.querySelectorAll('.cm-auth-tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase().includes(tab)));
    document.getElementById('cm-login-form').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('cm-signup-form').style.display = tab === 'signup' ? 'block' : 'none';
}
function cmToggleUserMenu() {
    document.getElementById('cm-user-dropdown').classList.toggle('show');
}

function cmLogin(e) {
    e.preventDefault();
    const username = document.getElementById('cm-login-username').value.trim();
    const pass = document.getElementById('cm-login-password').value;
    const err = document.getElementById('cm-login-error');
    err.textContent = '';

    const user = cmFindUser(username);
    if (!user) { err.textContent = 'Username not found.'; return; }
    if (user.password !== pass) { err.textContent = 'Wrong password.'; return; }
    if (user.banned) {
        if (user.banExpiry && Date.now() > user.banExpiry) {
            cmUpdateUser(user.id, { banned: false, banExpiry: null });
        } else { err.textContent = 'This account has been banned.'; return; }
    }

    cmCurrentUser = user;
    cmSetStore('session', user.id);
    cmUpdateAuthUI(true);
    cmCloseAuthModal();
    cmShowToast('Welcome back, ' + user.username + '!', 'success');
    cmSwitchPage(cmCurrentPage);
}

function cmSignup(e) {
    e.preventDefault();
    const username = document.getElementById('cm-signup-username').value.trim();
    const pass = document.getElementById('cm-signup-password').value;
    const err = document.getElementById('cm-signup-error');
    err.textContent = '';

    if (username.length < 3) { err.textContent = 'Username must be at least 3 characters.'; return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { err.textContent = 'Letters, numbers, underscores only.'; return; }
    if (!cmIsEnglishOnly(username)) { err.textContent = 'Username must use English characters only.'; return; }
    if (cmContainsBannedWords(username)) { err.textContent = 'That username is not allowed.'; return; }
    if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
    if (cmFindUser(username)) { err.textContent = 'Username already taken.'; return; }

    const newUser = {
        id: cmGenId(), username, usernameLower: username.toLowerCase(), password: pass,
        avatar: CM_AVATARS[0], bio: '', xp: 0, level: 1,
        banned: false, banExpiry: null, admin: false, createdAt: Date.now()
    };
    const users = cmGetUsers();
    users.push(newUser);
    cmSetUsers(users);

    cmCurrentUser = newUser;
    cmSetStore('session', newUser.id);
    cmUpdateAuthUI(true);
    cmCloseAuthModal();
    cmShowToast('Account created! Welcome, ' + username + '!', 'success');
    cmSwitchPage(cmCurrentPage);
}

function cmLogout() {
    cmCurrentUser = null;
    cmSetStore('session', null);
    cmUpdateAuthUI(false);
    cmShowToast('Logged out', 'info');
    document.getElementById('cm-user-dropdown').classList.remove('show');
}

function cmUpdateAuthUI(loggedIn) {
    document.getElementById('cm-login-btn').style.display = loggedIn ? 'none' : 'flex';
    document.getElementById('cm-user-info').style.display = loggedIn ? 'flex' : 'none';
    if (loggedIn && cmCurrentUser) {
        document.getElementById('cm-user-avatar').src = cmCurrentUser.avatar || CM_AVATARS[0];
        document.getElementById('cm-username-display').textContent = cmCurrentUser.username;
        const badge = cmGetBadge(cmCurrentUser.level || 1);
        const badgeEl = document.getElementById('cm-user-level-badge');
        if (badgeEl) { badgeEl.innerHTML = '<img src="' + badge + '" style="width:18px;height:18px;image-rendering:pixelated;">'; }
    }
}

// ---- PAGE NAVIGATION ----
function cmSwitchPage(page) {
    cmCurrentPage = page;
    document.querySelectorAll('.cm-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.cm-nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
    const el = document.getElementById('cm-page-' + page);
    if (el) el.classList.add('active');
    if (page === 'home') cmLoadPosts('home');
    else if (page === 'recent') cmLoadPosts('recent');
    else if (page === 'worlds') cmLoadPosts('worlds');
    else if (page === 'sets') cmLoadPosts('sets');
}

// ---- POST RENDERING ----
function cmLoadPosts(page) {
    let posts = cmGetPosts().filter(p => p.status === 'approved');
    let containerId, emptyId;

    if (page === 'home') {
        containerId = 'cm-hot-posts'; emptyId = 'cm-hot-empty';
        posts.sort((a, b) => ((b.upvotes || 0) - (b.downvotes || 0)) - ((a.upvotes || 0) - (a.downvotes || 0)));
    } else if (page === 'recent') {
        containerId = 'cm-recent-posts'; emptyId = 'cm-recent-empty';
        posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (page === 'worlds') {
        containerId = 'cm-world-posts'; emptyId = 'cm-worlds-empty';
        posts = posts.filter(p => p.type === 'world');
        posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (page === 'sets') {
        containerId = 'cm-set-posts'; emptyId = 'cm-sets-empty';
        posts = posts.filter(p => p.type === 'set');
        posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    const container = document.getElementById(containerId);
    const empty = document.getElementById(emptyId);
    if (!container) return;

    if (posts.length === 0) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    // Get current user votes
    const votes = cmGetVotes();

    container.innerHTML = posts.map(p => {
        const userVote = cmCurrentUser ? votes.find(v => v.postId === p.id && v.userId === cmCurrentUser.id) : null;
        const voteVal = userVote ? userVote.value : 0;
        const score = (p.upvotes || 0) - (p.downvotes || 0);
        const comments = cmGetComments().filter(c => c.postId === p.id);
        const creator = cmFindUserById(p.creatorId);
        const level = creator ? cmGetLevelFromXP(creator.xp || 0) : 1;
        const badge = cmGetBadge(level);

        return `<div class="cm-post-card" data-id="${p.id}">
      <div class="cm-post-header">
        <div class="cm-post-creator" onclick="cmOpenProfile('${p.creatorId}')">
          <img src="${cmEscapeHTML(creator?.avatar || CM_AVATARS[0])}" class="cm-post-avatar" onerror="this.src='${CM_AVATARS[0]}'">
          <img src="${badge}" class="cm-post-badge">
          <span>${cmEscapeHTML(p.creatorName)}</span>
        </div>
        <span class="cm-post-time">${cmTimeAgo(p.createdAt)}</span>
      </div>
      ${p.preview ? '<div class="cm-post-preview"><img src="' + p.preview + '" onerror="this.style.display=\'none\'"></div>' : ''}
      <div class="cm-post-body">
        <h3 class="cm-post-title">${cmEscapeHTML(p.buildName)}</h3>
        ${p.description ? '<p class="cm-post-desc">' + cmEscapeHTML(p.description) + '</p>' : ''}
        <span class="cm-post-type-tag ${p.type}">${p.type === 'world' ? '🌍 World' : '👗 Set'}</span>
      </div>
      ${p.blocks && p.blocks.length ? '<div class="cm-post-blocks"><strong>Blocks:</strong> ' + p.blocks.slice(0, 8).map(b => '<span class="cm-block-tag">' + cmEscapeHTML(b) + '</span>').join('') + (p.blocks.length > 8 ? '<span class="cm-block-more">+' + (p.blocks.length - 8) + '</span>' : '') + '</div>' : ''}
      <div class="cm-post-actions">
        <div class="cm-vote-group">
          <button class="cm-vote-btn up ${voteVal === 1 ? 'active' : ''}" onclick="cmVote('${p.id}',1)">\u25B2 ${p.upvotes || 0}</button>
          <span class="cm-vote-score">${score}</span>
          <button class="cm-vote-btn down ${voteVal === -1 ? 'active' : ''}" onclick="cmVote('${p.id}',-1)">\u25BC ${p.downvotes || 0}</button>
        </div>
        <button class="cm-action-btn" onclick="cmOpenComments('${p.id}')">💬 ${comments.length}</button>
        <button class="cm-action-btn" onclick="cmShowLoadModal('${p.id}')">📥 Load</button>
      </div>
    </div>`;
    }).join('');
}

// ---- VOTING ----
function cmVote(postId, value) {
    if (!cmCurrentUser) { cmShowAuthModal(); return; }
    const votes = cmGetVotes();
    const posts = cmGetPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const existing = votes.find(v => v.postId === postId && v.userId === cmCurrentUser.id);
    if (existing) {
        if (existing.value === value) {
            // Remove vote
            if (value === 1) post.upvotes = Math.max(0, (post.upvotes || 0) - 1);
            else post.downvotes = Math.max(0, (post.downvotes || 0) - 1);
            const idx = votes.indexOf(existing);
            votes.splice(idx, 1);
        } else {
            // Switch vote
            if (existing.value === 1) { post.upvotes = Math.max(0, (post.upvotes || 0) - 1); post.downvotes = (post.downvotes || 0) + 1; }
            else { post.downvotes = Math.max(0, (post.downvotes || 0) - 1); post.upvotes = (post.upvotes || 0) + 1; }
            existing.value = value;
        }
    } else {
        // New vote
        if (value === 1) post.upvotes = (post.upvotes || 0) + 1;
        else post.downvotes = (post.downvotes || 0) + 1;
        votes.push({ id: cmGenId(), postId, userId: cmCurrentUser.id, value });
        cmAwardXP(cmCurrentUser.id, CM_XP_VOTE);
    }
    cmSetVotes(votes);
    cmSetPosts(posts);
    cmLoadPosts(cmCurrentPage);
}

// ---- COMMENTS ----
function cmOpenComments(postId) {
    cmCurrentCommentPostId = postId;
    document.getElementById('cm-comments-modal').style.display = 'flex';
    cmRenderComments(postId);
}
function cmCloseComments() {
    document.getElementById('cm-comments-modal').style.display = 'none';
    cmCurrentCommentPostId = null;
}

function cmRenderComments(postId) {
    const comments = cmGetComments().filter(c => c.postId === postId && !c.parentId);
    const allComments = cmGetComments().filter(c => c.postId === postId);
    const list = document.getElementById('cm-comments-list');

    if (comments.length === 0) {
        list.innerHTML = '<div class="cm-empty-state"><p>No comments yet. Be the first!</p></div>';
        return;
    }

    list.innerHTML = comments.sort((a, b) => a.createdAt - b.createdAt).map(c => {
        const replies = allComments.filter(r => r.parentId === c.id).sort((a, b) => a.createdAt - b.createdAt);
        return cmRenderSingleComment(c) + (replies.length ? '<div class="cm-replies">' + replies.map(r => cmRenderSingleComment(r, true)).join('') + '</div>' : '');
    }).join('');
}

function cmRenderSingleComment(c, isReply) {
    const isOwn = cmCurrentUser && cmCurrentUser.id === c.userId;
    const creator = cmFindUserById(c.userId);
    return `<div class="cm-comment ${isReply ? 'reply' : ''}">
    <div class="cm-comment-header">
      <span class="cm-comment-user" onclick="cmOpenProfile('${c.userId}')">${cmEscapeHTML(creator?.username || c.username)}</span>
      <span class="cm-comment-time">${cmTimeAgo(c.createdAt)}</span>
    </div>
    <p class="cm-comment-text">${cmEscapeHTML(c.text)}</p>
    <div class="cm-comment-actions">
      ${!isReply ? '<button onclick="cmReplyTo(\'' + c.id + '\')">Reply</button>' : ''}
      ${isOwn ? '<button onclick="cmEditComment(\'' + c.id + '\')">Edit</button><button onclick="cmDeleteComment(\'' + c.id + '\')">Delete</button>' : ''}
    </div>
  </div>`;
}

function cmSubmitComment(e) {
    e.preventDefault();
    if (!cmCurrentUser) { cmShowAuthModal(); return; }
    const input = document.getElementById('cm-comment-input');
    const text = input.value.trim();
    if (!text) return;
    if (!cmIsEnglishOnly(text)) { cmShowToast('Comments must be in English only', 'error'); return; }
    if (cmContainsBannedWords(text)) { cmShowToast('Comment contains inappropriate language', 'error'); return; }

    const comments = cmGetComments();
    const parentId = input.dataset.replyTo || null;
    comments.push({
        id: cmGenId(), postId: cmCurrentCommentPostId, userId: cmCurrentUser.id,
        username: cmCurrentUser.username, text, parentId,
        createdAt: Date.now()
    });
    cmSetComments(comments);
    cmAwardXP(cmCurrentUser.id, CM_XP_COMMENT);
    input.value = '';
    input.placeholder = 'Write a comment...';
    delete input.dataset.replyTo;
    cmRenderComments(cmCurrentCommentPostId);
    cmLoadPosts(cmCurrentPage);
}

function cmReplyTo(commentId) {
    const input = document.getElementById('cm-comment-input');
    const c = cmGetComments().find(x => x.id === commentId);
    input.dataset.replyTo = commentId;
    input.placeholder = 'Replying to ' + (c?.username || 'user') + '...';
    input.focus();
}

function cmEditComment(commentId) {
    const comments = cmGetComments();
    const c = comments.find(x => x.id === commentId);
    if (!c || !cmCurrentUser || c.userId !== cmCurrentUser.id) return;
    const newText = prompt('Edit your comment:', c.text);
    if (!newText || !newText.trim()) return;
    if (!cmIsEnglishOnly(newText)) { cmShowToast('English only', 'error'); return; }
    if (cmContainsBannedWords(newText)) { cmShowToast('Inappropriate language', 'error'); return; }
    c.text = newText.trim();
    cmSetComments(comments);
    cmRenderComments(cmCurrentCommentPostId);
}

function cmDeleteComment(commentId) {
    if (!confirm('Delete this comment?')) return;
    let comments = cmGetComments();
    comments = comments.filter(c => c.id !== commentId && c.parentId !== commentId);
    cmSetComments(comments);
    cmRenderComments(cmCurrentCommentPostId);
    cmLoadPosts(cmCurrentPage);
}

// ---- POST CREATION ----
let cmPostType = 'world';
let cmSelectedSlotData = null;

function cmShowCreatePost() {
    if (!cmCurrentUser) { cmShowAuthModal(); return; }
    document.getElementById('cm-create-modal').style.display = 'flex';
    document.getElementById('cm-post-creator').value = cmCurrentUser.username;
    cmSelectPostType('world');
}
function cmCloseCreatePost() { document.getElementById('cm-create-modal').style.display = 'none'; cmSelectedSlotData = null; }

function cmSelectPostType(type) {
    cmPostType = type;
    document.querySelectorAll('.cm-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    cmLoadSlotPicker(type);
}

function cmLoadSlotPicker(type) {
    const picker = document.getElementById('cm-slot-picker');
    let slots = [];

    if (type === 'world') {
        const slotsList = localStorage.getItem('wpSaveSlotsList');
        if (slotsList) {
            try {
                const parsed = JSON.parse(slotsList);
                parsed.forEach(s => {
                    const data = localStorage.getItem('wpSaveSlot_' + s);
                    if (data) slots.push({ num: s, data: JSON.parse(data) });
                });
            } catch { }
        }
        // Also check numbered slots
        for (let i = 1; i <= 20; i++) {
            const data = localStorage.getItem('wpSaveSlot_' + i);
            if (data && !slots.find(s => s.num == i)) {
                try { slots.push({ num: i, data: JSON.parse(data) }); } catch { }
            }
        }
    } else {
        const slotsList = localStorage.getItem('saveSlotsList');
        if (slotsList) {
            try {
                const parsed = JSON.parse(slotsList);
                parsed.forEach(s => {
                    const data = localStorage.getItem('saveSlot' + s);
                    if (data) slots.push({ num: s, data: JSON.parse(data) });
                });
            } catch { }
        }
        for (let i = 1; i <= 20; i++) {
            const data = localStorage.getItem('saveSlot' + i);
            if (data && !slots.find(s => s.num == i)) {
                try { slots.push({ num: i, data: JSON.parse(data) }); } catch { }
            }
        }
    }

    if (slots.length === 0) {
        picker.innerHTML = '<div class="cm-slot-empty">No saved slots found. Save a creation in the planner first!</div>';
        return;
    }

    picker.innerHTML = slots.map(s => {
        const preview = s.data.preview || s.data.previewImage || '';
        return `<div class="cm-slot-option" onclick="cmPickSlot(this, ${s.num}, '${type}')">
      ${preview ? '<img src="' + preview + '" class="cm-slot-preview">' : '<div class="cm-slot-no-preview">Slot ' + s.num + '</div>'}
      <span>Slot ${s.num}</span>
    </div>`;
    }).join('');
}

function cmPickSlot(el, num, type) {
    document.querySelectorAll('.cm-slot-option').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    const key = type === 'world' ? 'wpSaveSlot_' + num : 'saveSlot' + num;
    try { cmSelectedSlotData = JSON.parse(localStorage.getItem(key)); } catch { cmSelectedSlotData = null; }
}

function cmExtractBlocks(slotData, type) {
    const blocks = [];
    if (type === 'world' && slotData.grid) {
        const seen = new Set();
        slotData.grid.forEach(row => {
            if (!Array.isArray(row)) return;
            row.forEach(cell => {
                if (!cell) return;
                const id = typeof cell === 'object' ? cell.id : cell;
                if (id && !seen.has(id) && id !== 'spr_fg_bedrock') { seen.add(id); blocks.push(id.replace(/^spr_fg_/, '').replace(/_/g, ' ')); }
            });
        });
    } else if (type === 'set' && slotData.overlayState) {
        try {
            const state = JSON.parse(slotData.overlayState);
            if (state.equippedItems) {
                Object.values(state.equippedItems).forEach(item => {
                    if (item && item.name) blocks.push(item.name);
                });
            }
        } catch { }
    }
    return blocks;
}

function cmSubmitPost(e) {
    e.preventDefault();
    if (!cmCurrentUser) { cmShowAuthModal(); return; }
    const name = document.getElementById('cm-post-name').value.trim();
    const creator = document.getElementById('cm-post-creator').value.trim();
    const desc = document.getElementById('cm-post-desc').value.trim();
    const err = document.getElementById('cm-create-error');
    err.textContent = '';

    if (!name) { err.textContent = 'Build name is required.'; return; }
    if (!creator) { err.textContent = 'Creator name is required.'; return; }
    if (!cmSelectedSlotData) { err.textContent = 'Please select a saved slot.'; return; }
    if (!cmIsEnglishOnly(name + desc)) { err.textContent = 'English only please.'; return; }
    if (cmContainsBannedWords(name + ' ' + desc + ' ' + creator)) { err.textContent = 'Inappropriate language detected.'; return; }

    const blocks = cmExtractBlocks(cmSelectedSlotData, cmPostType);
    const post = {
        id: cmGenId(), type: cmPostType, buildName: name, creatorName: creator,
        creatorId: cmCurrentUser.id, description: desc,
        slotData: JSON.stringify(cmSelectedSlotData),
        preview: cmSelectedSlotData.preview || cmSelectedSlotData.previewImage || '',
        blocks, upvotes: 0, downvotes: 0, status: 'approved',
        createdAt: Date.now()
    };

    const posts = cmGetPosts();
    posts.push(post);
    cmSetPosts(posts);
    cmAwardXP(cmCurrentUser.id, CM_XP_POST);

    cmCloseCreatePost();
    cmShowToast('Post published!', 'success');
    document.getElementById('cm-create-form').reset();
    cmSelectedSlotData = null;
    cmSwitchPage(cmPostType === 'world' ? 'worlds' : 'sets');
}

// ---- LOAD TO SLOT ----
function cmShowLoadModal(postId) {
    cmCurrentLoadPostId = postId;
    document.getElementById('cm-load-modal').style.display = 'flex';
    const post = cmGetPosts().find(p => p.id === postId);
    if (!post) return;
    const slotsEl = document.getElementById('cm-load-slots');
    slotsEl.innerHTML = '';

    for (let i = 1; i <= 10; i++) {
        const key = post.type === 'world' ? 'wpSaveSlot_' + i : 'saveSlot' + i;
        const existing = localStorage.getItem(key);
        let preview = '';
        if (existing) {
            try { const d = JSON.parse(existing); preview = d.preview || d.previewImage || ''; } catch { }
        }
        slotsEl.innerHTML += `<div class="cm-load-slot" onclick="cmLoadToSlot(${i})">
      ${preview ? '<img src="' + preview + '">' : '<div class="cm-slot-empty-icon">' + i + '</div>'}
      <span>Slot ${i} ${existing ? '(overwrite)' : '(empty)'}</span>
    </div>`;
    }
}

function cmCloseLoadModal() {
    document.getElementById('cm-load-modal').style.display = 'none';
    cmCurrentLoadPostId = null;
}

function cmLoadToSlot(slotNum) {
    const post = cmGetPosts().find(p => p.id === cmCurrentLoadPostId);
    if (!post) return;

    try {
        const slotData = JSON.parse(post.slotData);
        const key = post.type === 'world' ? 'wpSaveSlot_' + slotNum : 'saveSlot' + slotNum;
        localStorage.setItem(key, JSON.stringify(slotData));

        // Update slots list
        if (post.type === 'world') {
            let list = [];
            try { list = JSON.parse(localStorage.getItem('wpSaveSlotsList') || '[]'); } catch { }
            if (!list.includes(slotNum)) { list.push(slotNum); localStorage.setItem('wpSaveSlotsList', JSON.stringify(list)); }
        } else {
            let list = [];
            try { list = JSON.parse(localStorage.getItem('saveSlotsList') || '[]'); } catch { }
            if (!list.includes(slotNum)) { list.push(slotNum); localStorage.setItem('saveSlotsList', JSON.stringify(list)); }
        }

        cmCloseLoadModal();
        cmShowToast('Loaded to Slot ' + slotNum + '! Go to the ' + (post.type === 'world' ? 'World' : 'Set') + ' Planner to use it.', 'success');
    } catch (err) {
        console.error('Failed to load community slot:', err);
        if (err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || (err.message && err.message.toLowerCase().includes('quota')))) {
            alert('Storage cache is full! Please delete some other slots (character/world/thumbnails) to free up space.');
        } else {
            cmShowToast('Failed to load', 'error');
        }
    }
}

function cmLoadToNewSlot() {
    const post = cmGetPosts().find(p => p.id === cmCurrentLoadPostId);
    if (!post) return;
    // Find next empty slot
    for (let i = 1; i <= 50; i++) {
        const key = post.type === 'world' ? 'wpSaveSlot_' + i : 'saveSlot' + i;
        if (!localStorage.getItem(key)) { cmLoadToSlot(i); return; }
    }
    cmShowToast('No empty slots available', 'error');
}

// ---- USER PROFILES ----
function cmOpenProfile(userId) {
    cmSwitchPage('profile');
    const container = document.getElementById('cm-profile-container');
    const user = cmFindUserById(userId);
    if (!user) { container.innerHTML = '<div class="cm-empty-state"><p>User not found.</p></div>'; return; }

    const level = cmGetLevelFromXP(user.xp || 0);
    const badge = cmGetBadge(level);
    const xpInfo = cmGetXPForNextLevel(user.xp || 0, level);
    const isOwn = cmCurrentUser && cmCurrentUser.id === userId;
    const posts = cmGetPosts().filter(p => p.creatorId === userId && p.status === 'approved');

    container.innerHTML = `
    <div class="cm-profile-header">
      <img src="${cmEscapeHTML(user.avatar || CM_AVATARS[0])}" class="cm-profile-avatar" onerror="this.src='${CM_AVATARS[0]}'">
      <div class="cm-profile-info">
        <div class="cm-profile-name">
          <img src="${badge}" class="cm-profile-level-badge">
          ${cmEscapeHTML(user.username)}
        </div>
        <span class="cm-profile-level-text">Level ${level}</span>
        <div class="cm-xp-bar"><div class="cm-xp-fill" style="width: ${Math.min(100, (xpInfo.current / xpInfo.needed) * 100)}%"></div></div>
        ${user.bio ? '<div class="cm-profile-bio">' + cmEscapeHTML(user.bio) + '</div>' : ''}
        <div class="cm-profile-stats">
          <span class="cm-profile-stat"><strong>${posts.length}</strong> posts</span>
          <span class="cm-profile-stat"><strong>${user.xp || 0}</strong> XP</span>
        </div>
      </div>
      ${isOwn ? '<button class="cm-profile-edit-btn" onclick="cmShowEditProfile()">Edit Profile</button>' : ''}
    </div>
    <div class="cm-profile-content" id="cm-profile-posts"></div>`;

    const postsEl = document.getElementById('cm-profile-posts');
    if (posts.length === 0) {
        postsEl.innerHTML = '<div class="cm-empty-state"><p>No posts yet.</p></div>';
    } else {
        // Reuse post rendering
        const votes = cmGetVotes();
        postsEl.innerHTML = posts.map(p => {
            const userVote = cmCurrentUser ? votes.find(v => v.postId === p.id && v.userId === cmCurrentUser.id) : null;
            const voteVal = userVote ? userVote.value : 0;
            const score = (p.upvotes || 0) - (p.downvotes || 0);
            const comments = cmGetComments().filter(c => c.postId === p.id);
            return `<div class="cm-post-card" data-id="${p.id}">
        <div class="cm-post-body">
          <h3 class="cm-post-title">${cmEscapeHTML(p.buildName)}</h3>
          ${p.description ? '<p class="cm-post-desc">' + cmEscapeHTML(p.description) + '</p>' : ''}
          <span class="cm-post-type-tag ${p.type}">${p.type === 'world' ? '🌍 World' : '👗 Set'}</span>
        </div>
        <div class="cm-post-actions">
          <div class="cm-vote-group">
            <button class="cm-vote-btn up ${voteVal === 1 ? 'active' : ''}" onclick="cmVote('${p.id}',1)">\u25B2 ${p.upvotes || 0}</button>
            <span class="cm-vote-score">${score}</span>
            <button class="cm-vote-btn down ${voteVal === -1 ? 'active' : ''}" onclick="cmVote('${p.id}',-1)">\u25BC ${p.downvotes || 0}</button>
          </div>
          <button class="cm-action-btn" onclick="cmOpenComments('${p.id}')">💬 ${comments.length}</button>
          <button class="cm-action-btn" onclick="cmShowLoadModal('${p.id}')">📥 Load</button>
        </div>
      </div>`;
        }).join('');
    }
}

function cmShowEditProfile() {
    if (!cmCurrentUser) return;
    document.getElementById('cm-edit-profile-modal').style.display = 'flex';
    document.getElementById('cm-edit-bio').value = cmCurrentUser.bio || '';
    const picker = document.getElementById('cm-avatar-picker');
    picker.innerHTML = CM_AVATARS.map(a =>
        '<div class="cm-avatar-option ' + (cmCurrentUser.avatar === a ? 'selected' : '') + '" onclick="cmSelectAvatar(this, \'' + a + '\')">' +
        '<img src="' + a + '" onerror="this.style.display=\'none\'">' +
        '</div>'
    ).join('');
}
function cmCloseEditProfile() { document.getElementById('cm-edit-profile-modal').style.display = 'none'; }

function cmSelectAvatar(el, src) {
    document.querySelectorAll('.cm-avatar-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    cmSelectedAvatar = src;
}

function cmSaveProfile(e) {
    e.preventDefault();
    if (!cmCurrentUser) return;
    const bio = document.getElementById('cm-edit-bio').value.trim();
    if (bio && !cmIsEnglishOnly(bio)) { cmShowToast('Bio must be in English only', 'error'); return; }
    if (bio && cmContainsBannedWords(bio)) { cmShowToast('Bio contains inappropriate language', 'error'); return; }

    const updates = { bio };
    if (cmSelectedAvatar) updates.avatar = cmSelectedAvatar;
    cmUpdateUser(cmCurrentUser.id, updates);
    cmCurrentUser.bio = bio;
    if (cmSelectedAvatar) cmCurrentUser.avatar = cmSelectedAvatar;
    cmUpdateAuthUI(true);
    cmCloseEditProfile();
    cmShowToast('Profile updated!', 'success');
    cmOpenProfile(cmCurrentUser.id);
}

// ---- CLOUD SAVES ----
function cmShowCloudSaves() {
    if (!cmCurrentUser) { cmShowAuthModal(); return; }
    cmSwitchPage('cloud-saves');
    cmSwitchCloudTab('world');
}

function cmSwitchCloudTab(type) {
    cmCloudTabType = type;
    document.querySelectorAll('.cm-cloud-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
    cmLoadCloudSavesList(type);
}

function cmLoadCloudSavesList(type) {
    const list = document.getElementById('cm-cloud-saves-list');
    const saves = cmGetCloudSaves().filter(s => s.userId === cmCurrentUser.id && s.type === type);
    saves.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

    if (saves.length === 0) {
        list.innerHTML = '<div class="cm-cloud-empty"><p style="color:var(--cm-text-muted)">No cloud saves yet. Upload your creations!</p></div>';
        return;
    }

    list.innerHTML = saves.map(s =>
        '<div class="cm-cloud-save-card">' +
        '<div class="cm-cloud-save-info">' +
        '<div class="cm-cloud-save-name">' + cmEscapeHTML(s.name) + '</div>' +
        '<div class="cm-cloud-save-date">' + cmTimeAgo(s.savedAt) + '</div>' +
        '</div>' +
        '<div class="cm-cloud-save-actions">' +
        '<button class="cm-load-btn" onclick="cmDownloadCloudSave(\'' + s.id + '\',\'' + type + '\')">Load</button>' +
        '<button class="cm-delete-btn" onclick="cmDeleteCloudSave(\'' + s.id + '\')">Delete</button>' +
        '</div></div>'
    ).join('');
}

function cmUploadCloudSave() {
    if (!cmCurrentUser) return;
    const type = cmCloudTabType;
    const name = prompt('Name for this ' + type + ' cloud save:');
    if (!name) return;

    let slotData;
    if (type === 'world') {
        const grid = localStorage.getItem('wp_active_grid_exclusive');
        if (!grid) { cmShowToast('No active world to save', 'error'); return; }
        slotData = JSON.stringify({ grid: JSON.parse(grid), bgGrid: JSON.parse(localStorage.getItem('wp_background_grid_exclusive') || 'null') });
    } else {
        const overlay = localStorage.getItem('overlayState');
        if (!overlay) { cmShowToast('No set data to save', 'error'); return; }
        slotData = JSON.stringify({ overlayState: overlay });
    }

    const saves = cmGetCloudSaves();
    saves.push({ id: cmGenId(), userId: cmCurrentUser.id, type, name, slotData, savedAt: Date.now() });
    cmSetCloudSaves(saves);
    cmShowToast('Saved!', 'success');
    cmLoadCloudSavesList(type);
}

function cmDownloadCloudSave(saveId, type) {
    const save = cmGetCloudSaves().find(s => s.id === saveId);
    if (!save) { cmShowToast('Save not found', 'error'); return; }
    try {
        const data = JSON.parse(save.slotData);
        if (type === 'world') {
            if (data.grid) localStorage.setItem('wp_active_grid_exclusive', JSON.stringify(data.grid));
            if (data.bgGrid) localStorage.setItem('wp_background_grid_exclusive', JSON.stringify(data.bgGrid));
            cmShowToast('World loaded! Open World Planner to see it.', 'success');
        } else {
            if (data.overlayState) localStorage.setItem('overlayState', data.overlayState);
            cmShowToast('Set loaded! Open Set Planner to see it.', 'success');
        }
    } catch (err) {
        console.error('Failed to download cloud save:', err);
        if (err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || (err.message && err.message.toLowerCase().includes('quota')))) {
            alert('Storage cache is full! Please delete some other slots (character/world/thumbnails) to free up space.');
        } else {
            cmShowToast('Failed to load', 'error');
        }
    }
}

function cmDeleteCloudSave(saveId) {
    if (!confirm('Delete this cloud save?')) return;
    let saves = cmGetCloudSaves().filter(s => s.id !== saveId);
    cmSetCloudSaves(saves);
    cmShowToast('Deleted', 'success');
    cmLoadCloudSavesList(cmCloudTabType);
}

// ---- ADMIN PANEL ----
function cmTryOpenAdmin() {
    if (!cmCurrentUser) { cmShowToast('Login required', 'error'); return; }
    if (cmCurrentUser.admin) { cmOpenAdminPanel(); }
    else { cmShowToast('Access denied', 'error'); }
}
function cmOpenAdminPanel() { document.getElementById('cm-admin-panel').style.display = 'block'; cmSwitchAdminTab('pending'); }
function cmCloseAdminPanel() { document.getElementById('cm-admin-panel').style.display = 'none'; }

function cmSwitchAdminTab(tab) {
    document.querySelectorAll('.cm-admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    if (tab === 'pending') cmLoadAdminPending();
    else if (tab === 'posts') cmLoadAdminPosts();
    else if (tab === 'comments') cmLoadAdminComments();
    else if (tab === 'users') cmLoadAdminUsers();
}

function cmLoadAdminPending() {
    const content = document.getElementById('cm-admin-content');
    const pending = cmGetPosts().filter(p => p.status === 'pending');
    if (!pending.length) { content.innerHTML = '<div class="cm-empty-state"><h3>All clear!</h3><p>No pending posts.</p></div>'; return; }
    content.innerHTML = '<h3>Pending (' + pending.length + ')</h3>' + pending.map(p =>
        '<div class="cm-admin-card"><strong>' + cmEscapeHTML(p.buildName) + '</strong> by ' + cmEscapeHTML(p.creatorName) +
        '<div class="cm-admin-actions">' +
        '<button class="cm-admin-btn approve" onclick="cmAdminAction(\'' + p.id + '\',\'approve\')">Approve</button>' +
        '<button class="cm-admin-btn delete" onclick="cmAdminAction(\'' + p.id + '\',\'delete\')">Delete</button>' +
        '</div></div>'
    ).join('');
}

function cmLoadAdminPosts() {
    const content = document.getElementById('cm-admin-content');
    const posts = cmGetPosts().filter(p => p.status === 'approved');
    content.innerHTML = '<h3>Posts (' + posts.length + ')</h3>' + posts.map(p =>
        '<div class="cm-admin-card"><strong>' + cmEscapeHTML(p.buildName) + '</strong> — ' + (p.upvotes || 0) + ' up / ' + (p.downvotes || 0) + ' down' +
        '<div class="cm-admin-actions"><button class="cm-admin-btn delete" onclick="cmAdminAction(\'' + p.id + '\',\'delete\')">Delete</button></div></div>'
    ).join('');
}

function cmLoadAdminComments() {
    const content = document.getElementById('cm-admin-content');
    const comments = cmGetComments().sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    content.innerHTML = '<h3>Comments (' + comments.length + ')</h3>' + comments.map(c =>
        '<div class="cm-admin-card"><strong>' + cmEscapeHTML(c.username) + '</strong>: ' + cmEscapeHTML(c.text) +
        '<div class="cm-admin-actions"><button class="cm-admin-btn delete" onclick="cmAdminDeleteComment(\'' + c.id + '\')">Delete</button></div></div>'
    ).join('');
}

function cmLoadAdminUsers() {
    const content = document.getElementById('cm-admin-content');
    const users = cmGetUsers();
    content.innerHTML = '<h3>Users (' + users.length + ')</h3>' + users.map(u => {
        const lv = cmGetLevelFromXP(u.xp || 0);
        return '<div class="cm-admin-card"><strong>' + cmEscapeHTML(u.username) + '</strong> (Lv.' + lv + ') — ' + (u.xp || 0) + ' XP' +
            (u.banned ? ' <span style="color:#ff4444">[BANNED]</span>' : '') +
            (u.admin ? ' <span style="color:gold">[ADMIN]</span>' : '') +
            '<div class="cm-admin-actions">' +
            (!u.admin ? '<button class="cm-admin-btn" onclick="cmAdminBan(\'' + u.id + '\',' + !u.banned + ')">' + (u.banned ? 'Unban' : 'Ban') + '</button>' : '') +
            '</div></div>';
    }).join('');
}

function cmAdminAction(postId, action) {
    let posts = cmGetPosts();
    if (action === 'approve') {
        const p = posts.find(x => x.id === postId);
        if (p) p.status = 'approved';
    } else if (action === 'delete') {
        posts = posts.filter(x => x.id !== postId);
    }
    cmSetPosts(posts);
    cmSwitchAdminTab('pending');
}

function cmAdminDeleteComment(commentId) {
    let comments = cmGetComments().filter(c => c.id !== commentId && c.parentId !== commentId);
    cmSetComments(comments);
    cmLoadAdminComments();
}

function cmAdminBan(userId, ban) {
    cmUpdateUser(userId, { banned: ban, banExpiry: null });
    cmLoadAdminUsers();
    cmShowToast(ban ? 'User banned' : 'User unbanned', 'success');
}

// ---- CLOSE MODALS ON OVERLAY CLICK ----
document.addEventListener('click', e => {
    if (e.target.classList.contains('cm-modal-overlay')) e.target.style.display = 'none';
});
