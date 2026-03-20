// js/main.js

// [新增] 在檔案最頂端宣告全域變數，用來儲存使用者的 Telegram ID
window.tgUserId = null; 

/**
 * 初始化 Telegram WebApp 使用者資料
 */
function initTelegramUser() {
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        try { tg.expand(); } catch(e) {}
        const user = tg.initDataUnsafe?.user;
        if (user) {
            window.tgUserId = user.id; // [新增] 儲存使用者的 User ID
            document.getElementById('tg-username').textContent = user.username ? `@${user.username}` : user.first_name;
            document.getElementById('tg-userid').textContent = `ID: ${user.id}`;
        } else {
            document.getElementById('tg-username').textContent = "冒險者 (Web)";
            document.getElementById('tg-userid').textContent = "非 TG 環境";
        }
    }
}

/**
 * 載入玩家基礎資料 (閃卡餘額、VIP狀態、冷卻時間)
 */
async function loadGame() {
    try {
        const res = await fetch(`${API_URL_GACHA}/api/user`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error("無法連接至伺服器");
        const data = await res.json();
        
        gameState.totalFlashCards = data.balance;
        gameState.lastDrawTime = data.last_draw_time;
        if (data.vip) {
            gameState.vipState.level = data.vip.level === 0 ? 'premium' : 'standard';
            gameState.vipState.expiry = new Date(data.vip.vip_expiry_date).getTime();
        } else {
            gameState.vipState.level = 'none';
            gameState.vipState.expiry = 0;
        }
        
        updateStatsUI(); 
        if (typeof checkCooldown === 'function') checkCooldown();

        const grid = document.getElementById('card-grid');
        grid.innerHTML = `<div class="text-slate-500 col-span-full text-center py-20 bg-slate-800/30 rounded-lg border border-slate-700/50"><i data-lucide="sparkles" class="mx-auto mb-2 opacity-50"></i>每天登入，測試你的運氣</div>`;
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        console.error("載入失敗:", error);
        document.getElementById('card-grid').innerHTML = `<div class="text-red-400 col-span-full text-center py-20 bg-red-900/20 rounded-lg border border-red-700/50"><i data-lucide="alert-circle" class="mx-auto mb-2 opacity-80"></i>連線伺服器失敗。</div>`;
        if (window.lucide) lucide.createIcons();
    }
}

/**
 * 更新頂部狀態列 UI
 */
function updateStatsUI() {
    const balanceEl = document.getElementById('balance-display');
    if (parseInt(balanceEl.innerText) !== gameState.totalFlashCards) {
        balanceEl.innerText = gameState.totalFlashCards;
        balanceEl.classList.add('scale-125', 'text-yellow-400');
        setTimeout(() => balanceEl.classList.remove('scale-125', 'text-yellow-400'), 200);
    }

    const now = Date.now();
    const vipNameEl = document.getElementById('vip-name');
    const vipIconContainer = document.getElementById('vip-icon');
    document.body.classList.remove('vip-standard', 'vip-premium');
    
    if (gameState.vipState.expiry > now) {
        const timeLeft = Math.ceil((gameState.vipState.expiry - now) / (1000 * 60 * 60 * 24));
        if (gameState.vipState.level === 'premium') {
            vipNameEl.innerHTML = `<span class="text-yellow-400">高級VIP</span> 剩餘${timeLeft}天`;
            vipIconContainer.className = 'w-5 h-5 rounded-full flex items-center justify-center transition-all bg-yellow-600 shadow-[0_0_5px_rgba(234,179,8,0.5)]';
            vipIconContainer.innerHTML = `<i data-lucide="crown" size="12" class="text-white"></i>`;
            document.body.classList.add('vip-premium');
        } else {
            vipNameEl.innerHTML = `<span class="text-slate-200">標準VIP</span> 剩餘${timeLeft}天`;
            vipIconContainer.className = 'w-5 h-5 rounded-full flex items-center justify-center transition-all bg-slate-500';
            vipIconContainer.innerHTML = `<i data-lucide="shield" size="12" class="text-white"></i>`;
            document.body.classList.add('vip-standard');
        }
    } else {
        vipNameEl.innerText = '無 VIP';
        vipIconContainer.className = 'w-5 h-5 rounded-full flex items-center justify-center transition-all bg-slate-700';
        vipIconContainer.innerHTML = `<i data-lucide="user" size="12" class="text-slate-400"></i>`;
    }
    if (window.lucide) lucide.createIcons();
    
    // 如果停留在 Userbot 分頁，同步更新權限畫面
    if (document.getElementById('tab-userbot').classList.contains('active') && typeof initUserbotView === 'function') {
        initUserbotView();
    }
}

/**
 * 底部導航分頁切換
 */
function switchTab(tabName) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    const slider = document.getElementById('slider-container');
    document.querySelectorAll('.slide-page').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${tabName}`).classList.add('active');

    if (tabName === 'gacha') {
        slider.style.transform = 'translateX(0%)';
    } else if (tabName === 'userbot') {
        slider.style.transform = 'translateX(-25%)';
        if (typeof initUserbotView === 'function') initUserbotView();
    } else if (tabName === 'groups') {
        slider.style.transform = 'translateX(-50%)';
        renderGroupsView();
    } else if (tabName === 'announcements') {
        slider.style.transform = 'translateX(-75%)';
        if (!window.announcementsLoaded) {
            loadAnnouncements();
            window.announcementsLoaded = true;
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

/**
 * 其他 UI 輔助函數 (群組、公告、展開摺疊)
 */
async function renderGroupsView() {
    const container = document.getElementById('groups-content');
    const now = Date.now();
    
    if (gameState.vipState.level === 'premium' && gameState.vipState.expiry > now) {
        if (!window.groupsLoaded) {
            container.innerHTML = `<div class="text-slate-500 flex flex-col items-center gap-2"><i data-lucide="loader-2" class="animate-spin w-8 h-8"></i>讀取連結中...</div>`;
            if (window.lucide) lucide.createIcons();
            await loadInviteLinks();
            window.groupsLoaded = true;
        }
    } else {
        container.innerHTML = `
            <div class="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 text-center shadow-xl max-w-sm w-full mx-auto">
                <div class="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-slate-600 shadow-inner">
                    <i data-lucide="lock" class="w-8 h-8 text-slate-400"></i>
                </div>
                <h3 class="text-xl font-bold text-white mb-2">高級 VIP 專屬功能</h3>
                <p class="text-slate-400 text-sm mb-6 leading-relaxed">此區域僅限高級 VIP 使用。<br>前往 Bot 升級以解鎖並加入所有精選討論群組！</p>
                <button onclick="goToBotToUpgrade()" class="w-full btn-glow bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all">
                    <i data-lucide="zap" class="w-5 h-5"></i>
                    前往 Bot 升級
                </button>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    }
}

async function loadInviteLinks() {
    const container = document.getElementById('groups-content');
    try {
        const res = await fetch(`${API_URL_GACHA}/api/invite_links`, { headers: getAuthHeaders() });
        if (!res.ok) {
            if(res.status === 403) throw new Error("權限不足，請確認您的 VIP 狀態");
            throw new Error("無法讀取邀請連結");
        }
        const data = await res.json();
        
        if (data.data && data.data.length > 0) {
            const groupsByCategory = {};
            data.data.forEach(group => {
                if (!group.is_active) return;
                const cat = group.category || '未分類';
                if (!groupsByCategory[cat]) groupsByCategory[cat] = [];
                groupsByCategory[cat].push(group);
            });
            
            const lastUpdated = data.meta?.last_updated ? new Date(data.meta.last_updated).toLocaleString('zh-TW', { hour12: false }) : new Date().toLocaleString('zh-TW');
            
            let html = `<div class="text-xs text-slate-400 text-center mb-4"><i data-lucide="clock" class="inline w-3 h-3 mr-1"></i>最後更新時間: ${lastUpdated}</div><div class="w-full space-y-3 flex flex-col items-stretch">`;
            
            Object.keys(groupsByCategory).forEach(cat => {
                const items = groupsByCategory[cat];
                html += `
                    <div class="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden shadow-sm">
                        <button onclick="toggleCategory(this)" class="w-full p-4 flex items-center justify-between text-slate-200 hover:bg-slate-700/60 transition-colors">
                            <div class="flex items-center gap-2 font-bold text-lg">
                                <i data-lucide="folder-open" class="w-5 h-5 text-yellow-500"></i> ${cat} 
                                <span class="text-[10px] bg-slate-700/80 text-slate-300 px-2 py-0.5 rounded-full font-mono">${items.length}</span>
                            </div>
                            <i data-lucide="chevron-down" class="transition-transform duration-300 w-5 h-5 text-slate-400 chevron-icon"></i>
                        </button>
                        <div class="max-h-0 opacity-0 overflow-hidden transition-all duration-300 bg-slate-800/30 category-content">
                            <div class="p-3 space-y-2 border-t border-slate-700/50">
                `;
                items.forEach(group => {
                    html += `
                                <div class="bg-slate-800/80 border border-yellow-500/20 rounded-lg p-3 flex items-center justify-between hover:border-yellow-500/50 transition-colors">
                                    <h3 class="text-md font-bold text-slate-200 truncate pr-2 flex items-center gap-2">
                                        <i data-lucide="message-circle" class="w-4 h-4 text-slate-400"></i>${group.name}
                                    </h3>
                                    <button onclick="joinGroup('${group.invite_link}')" class="bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-bold px-3 py-1.5 rounded-md text-sm flex-shrink-0 flex items-center gap-1 transition-colors">
                                        加入 <i data-lucide="external-link" class="w-3 h-3"></i>
                                    </button>
                                </div>
                    `;
                });
                html += `</div></div></div>`;
            });
            html += `</div><div class="mt-6 p-4 rounded-xl bg-blue-900/20 border border-blue-800/50 text-xs text-blue-300/80 text-center leading-relaxed shadow-inner"><i data-lucide="info" class="inline w-4 h-4 mr-1 mb-1"></i>管理員會定期更新群組連結。<br>如發現部分群組連結失效，請與客服聯絡。</div>`;
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div class="text-slate-500 text-center">目前沒有可用的群組連結</div>';
        }
    } catch (error) {
        container.innerHTML = `<div class="text-red-400 text-center bg-red-900/20 border border-red-700/50 p-4 rounded-xl max-w-sm w-full"><i data-lucide="alert-triangle" class="mx-auto mb-2 w-8 h-8 opacity-80"></i>${error.message}</div>`;
    }
    if (window.lucide) lucide.createIcons();
}

async function loadAnnouncements() {
    const listContainer = document.getElementById('announcements-list');
    try {
        const response = await fetch(`${API_URL_ANNOUNCE}/?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error('無法讀取資料');
        const data = await response.json();
        
        if (data.botStatus) {
            const statusCard = document.getElementById('bot-status-container');
            document.getElementById('bot-status-text').innerText = data.botStatus.text;
            document.getElementById('bot-status-subtext').innerText = data.botStatus.subText || '';
            document.getElementById('status-indicator').style.backgroundColor = data.botStatus.color || '#22c55e';
            
            if(data.botStatus.color && data.botStatus.color !== '#22c55e' && data.botStatus.color !== '#2ecc71') {
                 document.getElementById('status-ping').style.display = 'none';
            }
            statusCard.style.display = 'flex';
        }

        listContainer.innerHTML = '';
        if (data.announcements && data.announcements.length > 0) {
            data.announcements.forEach(item => {
                const contentHtml = item.content.replace(/\n/g, '<br>');
                listContainer.innerHTML += `
                    <div class="announcement-card">
                        <div class="text-xs text-blue-400 font-mono mb-1"><i data-lucide="calendar" class="inline w-3 h-3 mr-1"></i>${item.date}</div>
                        <h3 class="text-lg font-bold text-white mb-2">${item.title}</h3>
                        <div class="text-slate-300 text-sm leading-relaxed">${contentHtml}</div>
                    </div>
                `;
            });
        } else {
            listContainer.innerHTML = '<div class="text-center text-slate-500 py-10">目前沒有公告</div>';
        }
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        listContainer.innerHTML = '<div class="text-center text-red-400 py-10"><i data-lucide="wifi-off" class="mx-auto mb-2 opacity-50"></i>無法連線至狀態伺服器</div>';
        if (window.lucide) lucide.createIcons();
    }
}

function toggleCategory(btn) {
    const content = btn.nextElementSibling;
    const chevron = btn.querySelector('.chevron-icon');
    if (content.classList.contains('max-h-0')) {
        content.classList.remove('max-h-0', 'opacity-0');
        content.classList.add('max-h-[1500px]', 'opacity-100');
        chevron.style.transform = 'rotate(180deg)';
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
    } else {
        content.classList.add('max-h-0', 'opacity-0');
        content.classList.remove('max-h-[1500px]', 'opacity-100');
        chevron.style.transform = 'rotate(0deg)';
    }
}

function toggleInfo() {
    const content = document.getElementById('info-content');
    const chevron = document.getElementById('info-chevron');
    if (content.classList.contains('max-h-0')) {
        content.classList.remove('max-h-0', 'opacity-0');
        content.classList.add('max-h-[500px]', 'opacity-100');
        chevron.style.transform = 'rotate(180deg)';
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
    } else {
        content.classList.add('max-h-0', 'opacity-0');
        content.classList.remove('max-h-[500px]', 'opacity-100');
        chevron.style.transform = 'rotate(0deg)';
    }
}

function goToBotToUpgrade() {
    if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.openTelegramLink('https://t.me/flash_pic_helper_bot');
    } else {
        window.open('https://t.me/flash_pic_helper_bot', '_blank');
    }
}

function joinGroup(url) {
    if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.openTelegramLink(url);
    } else {
        window.open(url, '_blank');
    }
}

// 點擊非輸入區域自動收起鍵盤
document.addEventListener('touchstart', function(e) {
    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('button');
    if (!isInput) {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            document.activeElement.blur();
        }
    }
}, { passive: true });

// 定期檢查 VIP 是否過期
setInterval(() => { if (gameState.vipState.expiry > 0 && Date.now() > gameState.vipState.expiry) updateStatsUI(); }, 60000);

// 啟動程式
document.addEventListener("DOMContentLoaded", () => {
    if (window.lucide) lucide.createIcons();
    initTelegramUser();
    loadGame();
});
