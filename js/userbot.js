// js/userbot.js

let ubWarningShown = false; // 控制彈窗不要一直跳

/**
 * 清除本地的所有 Userbot 狀態與紀錄
 */
function clearUbSession() {
    ubState.sessionToken = null;
    ubState.pendingSessionToken = null;
    ubState.phoneHash = null;
    ubState.phone = '';
    ubState.expiryTime = 0;
    ubWarningShown = false;
    
    localStorage.removeItem('ub_token');
    localStorage.removeItem('ub_expiry');
    localStorage.removeItem('ub_pending_token');
    localStorage.removeItem('ub_phone_hash');
    localStorage.removeItem('ub_phone');
    
    if (ubState.timerInterval) clearInterval(ubState.timerInterval);
    ubState.timerInterval = null;
    
    // 同步停止任務輪詢
    if (typeof stopTaskPolling === 'function') {
        stopTaskPolling();
    }
    
    // UI 清理
    const codeSec = document.getElementById('ub-code-section');
    if(codeSec) codeSec.classList.add('hidden');
    const pwdSec = document.getElementById('ub-password-container');
    if(pwdSec) pwdSec.classList.add('hidden');
    const phoneInput = document.getElementById('ub-phone');
    if(phoneInput) phoneInput.value = '';
}

/**
 * 初始化 Userbot 分頁的顯示狀態
 */
function initUserbotView() {
    // 判斷是否具備高級 VIP 資格 (依賴 config.js 裡的 gameState)
    const isPremium = gameState.vipState.level === 'premium' && gameState.vipState.expiry > Date.now();
    
    // 檢查 Session 是否已過期
    if (ubState.sessionToken && Date.now() > ubState.expiryTime) {
        clearUbSession();
    }

    // 依據 VIP 資格切換權限畫面
    document.getElementById('ub-unauthorized').classList.toggle('hidden', isPremium);
    
    if (!isPremium) {
        document.getElementById('ub-login-section').classList.add('hidden');
        document.getElementById('ub-active-session').classList.add('hidden');
        document.getElementById('ub-active-session').classList.remove('flex');
    } else if (ubState.sessionToken !== null) {
        // 已登入狀態
        document.getElementById('ub-login-section').classList.add('hidden');
        document.getElementById('ub-active-session').classList.remove('hidden');
        document.getElementById('ub-active-session').classList.add('flex');
        
        if (!ubState.timerInterval) {
            startUbTimer();
            loadUbChats();
            if (typeof startTaskPolling === 'function') startTaskPolling(); // 啟動任務管理器
        }
    } else if (ubState.pendingSessionToken !== null) {
        // 等待驗證碼狀態
        document.getElementById('ub-login-section').classList.remove('hidden');
        document.getElementById('ub-code-section').classList.remove('hidden');
        document.getElementById('ub-active-session').classList.add('hidden');
        document.getElementById('ub-active-session').classList.remove('flex');
        if (ubState.phone) {
            document.getElementById('ub-phone').value = ubState.phone;
        }
    } else {
        // 全新登入狀態
        document.getElementById('ub-login-section').classList.remove('hidden');
        document.getElementById('ub-code-section').classList.add('hidden');
        document.getElementById('ub-active-session').classList.add('hidden');
        document.getElementById('ub-active-session').classList.remove('flex');
    }
    
    if (window.lucide) lucide.createIcons();
}

/**
 * 請求發送驗證碼
 */
async function ubSendCode() {
    const phone = document.getElementById('ub-phone').value.trim();
    if(!phone) return showToast("請輸入電話號碼", true);
    
    const btn = document.getElementById('ub-btn-sendcode');
    btn.disabled = true; 
    btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> 發送中...';
    if (window.lucide) lucide.createIcons();

    try {
        const res = await fetch(`${API_URL_USERBOT}/auth/send_code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phone })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            // 處理 Session 恢復邏輯
            if (res.status === 400 && data.detail && data.detail.action === "restore_session") {
                const payload = data.detail;
                
                ubState.sessionToken = payload.session_token;
                ubState.expiryTime = Date.now() + payload.expires_at;
                
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('ub_token', ubState.sessionToken);
                    localStorage.setItem('ub_expiry', ubState.expiryTime);
                }
                
                document.getElementById('ub-login-section').classList.add('hidden');
                const act = document.getElementById('ub-active-session');
                act.classList.remove('hidden');
                act.classList.add('flex');
                
                startUbTimer(); 
                loadUbChats();
                if (typeof startTaskPolling === 'function') startTaskPolling();
                
                showToast(payload.message, false);
                return;
            } else if (res.status === 429) {
                 throw new Error(data.detail || "請求過於頻繁，請稍後再試");
            } else {
                 throw new Error(data.detail || "發送失敗");
            }
        }

        // 保存等待狀態
        ubState.pendingSessionToken = data.session_token;
        ubState.phoneHash = data.phone_code_hash;
        ubState.phone = phone;
        
        localStorage.setItem('ub_pending_token', data.session_token);
        localStorage.setItem('ub_phone_hash', data.phone_code_hash);
        localStorage.setItem('ub_phone', phone);
        
        document.getElementById('ub-code-section').classList.remove('hidden');
        btn.innerHTML = '<i data-lucide="check"></i> 已發送';
    } catch (err) {
        showToast(err.message, true);
        btn.disabled = false; 
        btn.innerHTML = '<i data-lucide="send" size="18"></i> 獲取驗證碼';
    }
    if (window.lucide) lucide.createIcons();
}

/**
 * 登入並建立連線
 */
async function ubLogin() {
    const code = document.getElementById('ub-code').value.trim();
    const passwordContainer = document.getElementById('ub-password-container');
    const password = document.getElementById('ub-password').value.trim();
    
    if(!code) return showToast("請輸入驗證碼", true);
    if (!ubState.pendingSessionToken) return showToast("請先獲取驗證碼", true);
    
    if (!passwordContainer.classList.contains('hidden') && !password) {
        return showToast("此帳號已開啟兩步驟驗證，請輸入密碼", true);
    }

    const btn = document.getElementById('ub-btn-login');
    btn.disabled = true; 
    btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> 登入中...';
    if (window.lucide) lucide.createIcons();

    try {
        const res = await fetch(`${API_URL_USERBOT}/auth/login`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ubState.pendingSessionToken}`
            },
            body: JSON.stringify({
                phone: document.getElementById('ub-phone').value.trim(),
                phone_code_hash: ubState.phoneHash,
                code: code,
                password: password || null
            })
        });
        const data = await res.json();
        
        if (res.ok && data.status === "password_needed") {
            passwordContainer.classList.remove('hidden');
            throw new Error("此帳號已開啟兩步驟驗證，請輸入密碼");
        }

        if (!res.ok) {
            if (data.detail && data.detail.includes("密碼錯誤")) {
                document.getElementById('ub-password').value = "";
            }
            if (data.detail && (data.detail.includes("過期") || data.detail.includes("不存在"))) {
                clearUbSession();
                setTimeout(() => initUserbotView(), 1500); 
            }
            throw new Error(data.detail || "登入失敗");
        }

        // 登入成功，轉換 Token
        ubState.sessionToken = ubState.pendingSessionToken;
        ubState.pendingSessionToken = null;
        ubState.expiryTime = Date.now() + (15 * 60 * 1000);
        
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ub_token', ubState.sessionToken);
            localStorage.setItem('ub_expiry', ubState.expiryTime);
            localStorage.removeItem('ub_pending_token');
            localStorage.removeItem('ub_phone_hash');
        }
        
        startUbTimer();
        if (typeof startTaskPolling === 'function') startTaskPolling();
        
        document.getElementById('ub-login-section').classList.add('hidden');
        document.getElementById('ub-active-session').classList.remove('hidden');
        document.getElementById('ub-active-session').classList.add('flex');
        
        loadUbChats();

    } catch (err) {
        showToast(err.message, true);
        btn.disabled = false; 
        btn.innerHTML = '<i data-lucide="log-in" size="18"></i> 登入連線';
    }
    if (window.lucide) lucide.createIcons();
}

/**
 * 啟動連線倒數計時器
 */
function startUbTimer() {
    if (ubState.timerInterval) clearInterval(ubState.timerInterval);
    const timerEl = document.getElementById('ub-timer');
    ubWarningShown = false;
    
    const renewBtn = document.getElementById('ub-btn-renew');
    if(renewBtn) {
        renewBtn.classList.add('hidden');
        renewBtn.classList.remove('flex');
    }
    
    ubState.timerInterval = setInterval(() => {
        const remain = Math.max(0, Math.floor((ubState.expiryTime - Date.now()) / 1000));
        const m = String(Math.floor(remain / 60)).padStart(2, '0');
        const s = String(remain % 60).padStart(2, '0');
        timerEl.innerText = `${m}:${s}`;
        
        if (remain <= 120 && remain > 0 && !ubWarningShown) {
            ubWarningShown = true;
            document.getElementById('ub-warning-modal').classList.add('active');
        }
        
        if (remain <= 0) {
            document.getElementById('ub-warning-modal').classList.remove('active');
            clearUbSession();
            showToast("Session 已過期，連線已自動登出。", true);
            setTimeout(() => location.reload(), 2000); 
        }
    }, 1000);
}

function closeUbWarningModal() {
    document.getElementById('ub-warning-modal').classList.remove('active');
    const renewBtn = document.getElementById('ub-btn-renew');
    if(renewBtn) {
        renewBtn.classList.remove('hidden');
        renewBtn.classList.add('flex');
    }
}

/**
 * 延長連線時間
 */
async function ubRenewSession() {
    try {
        const res = await fetch(`${API_URL_USERBOT}/auth/renew`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${ubState.sessionToken}` }
        });
        if (!res.ok) throw new Error("續約失敗，可能連線已過期");
        
        document.getElementById('ub-warning-modal').classList.remove('active');
        const renewBtn = document.getElementById('ub-btn-renew');
        if(renewBtn) {
            renewBtn.classList.add('hidden');
            renewBtn.classList.remove('flex');
        }
        
        ubWarningShown = false;
        ubState.expiryTime = Date.now() + (15 * 60 * 1000);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ub_expiry', ubState.expiryTime);
        }
        
        showToast("✅ 已成功延長連線時間 15 分鐘", false);
    } catch(err) {
        showToast(err.message, true);
        clearUbSession();
        initUserbotView();
    }
}

/**
 * 登出並中止連線
 */
async function ubLogout() {
    if (!confirm("確定要登出嗎？這將會中斷目前的 Telegram 連線與所有未完成的任務。")) return;
    
    try {
        await fetch(`${API_URL_USERBOT}/auth/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${ubState.sessionToken}` }
        });
    } catch (err) {
        console.log("登出 API 呼叫失敗，但仍會清理本地紀錄");
    } finally {
        clearUbSession();
        initUserbotView();
        showToast("✅ 已成功登出", false);
    }
}

/**
 * 載入使用者對話列表
 */
async function loadUbChats() {
    const listEl = document.getElementById('ub-chat-list');
    listEl.innerHTML = '<div class="text-center py-4 text-slate-500"><i data-lucide="loader-2" class="animate-spin mx-auto mb-2"></i> 讀取對話中...</div>';
    if (window.lucide) lucide.createIcons();

    try {
        const res = await fetch(`${API_URL_USERBOT}/api/chats`, {
            headers: { 'Authorization': `Bearer ${ubState.sessionToken}` }
        });
        
        if (res.status === 401 || res.status === 404) {
            clearUbSession();
            initUserbotView();
            throw new Error("連線已失效，請重新登入");
        }
        if (!res.ok) throw new Error("讀取失敗");
        const data = await res.json();

        listEl.innerHTML = '';
        if(data.chats.length === 0) listEl.innerHTML = '<div class="text-center text-slate-500 py-4">沒有個人對話</div>';
        
        data.chats.forEach(chat => {
            // 安全處理單引號
            const safeName = chat.name.replace(/'/g, "\\'");
            listEl.innerHTML += `
                <div onclick="openUbChat('${chat.id}', '${safeName}')" class="bg-slate-800/60 p-4 rounded-xl border border-slate-700 hover:border-purple-500 cursor-pointer flex items-center justify-between transition-colors mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                            <i data-lucide="user"></i>
                        </div>
                        <div class="font-bold text-slate-200">${chat.name}</div>
                    </div>
                    ${chat.unread_count > 0 ? `<div class="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full">${chat.unread_count}</div>` : ''}
                </div>
            `;
        });
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        listEl.innerHTML = `<div class="text-red-400 text-center">${err.message}</div>`;
    }
}

/**
 * 開啟特定對話並渲染訊息 (包含 TaskManager 狀態映射)
 */
async function openUbChat(chatId, chatName) {
    document.getElementById('ub-chat-list').classList.add('hidden');
    const viewEl = document.getElementById('ub-chat-view');
    const msgsEl = document.getElementById('ub-messages');
    viewEl.classList.remove('hidden'); viewEl.classList.add('flex');
    
    msgsEl.innerHTML = '<div class="text-center py-10 text-slate-500"><i data-lucide="loader-2" class="animate-spin mx-auto mb-2"></i> 提取訊息中...</div>';
    if (window.lucide) lucide.createIcons();

    try {
        const res = await fetch(`${API_URL_USERBOT}/api/messages/${chatId}?limit=20`, {
            headers: { 'Authorization': `Bearer ${ubState.sessionToken}` }
        });
        if (!res.ok) throw new Error("讀取對話失敗");
        const data = await res.json();

        msgsEl.innerHTML = '';
        data.messages.reverse().forEach(msg => {
            const alignClass = msg.is_sender ? 'self-end bg-purple-900/40 border-purple-700/50' : 'self-start bg-slate-800/80 border-slate-700/50';
            
            // 安全插入文字
            let textNode = document.createElement('div');
            textNode.textContent = msg.text;
            let textHtml = textNode.innerHTML;
            
            let content = `<div class="text-sm text-slate-200 mb-1">${textHtml}</div>`;
            
            if (msg.has_media) {
                // 【核心串接】檢查全局任務狀態，預先渲染正確的按鈕外觀！
                const taskInfo = window.globalTaskRegistry ? window.globalTaskRegistry[msg.id] : null;
                const btnStatus = taskInfo ? taskInfo.status : 'none';
                
                let btnHtml = '<i data-lucide="send" size="14"></i> 傳送至收藏';
                let btnClass = "mt-2 text-xs bg-purple-600 hover:bg-purple-500 text-white py-1.5 px-3 rounded flex items-center gap-1 transition-colors w-fit";
                let btnDisabled = "";

                if (btnStatus === 'processing') {
                    btnHtml = '<i data-lucide="loader-2" size="14" class="animate-spin"></i> 處理中...';
                    btnClass = "mt-2 text-xs bg-blue-600 text-white font-bold py-1.5 px-3 rounded flex items-center gap-1 transition-colors w-fit";
                    btnDisabled = "disabled";
                } else if (btnStatus === 'success') {
                    btnHtml = '<i data-lucide="check" size="14"></i> 已發送至收藏';
                    btnClass = "mt-2 text-xs bg-green-600 text-white font-bold py-1.5 px-3 rounded flex items-center gap-1 transition-colors w-fit shadow-[0_0_10px_rgba(34,197,94,0.3)]";
                    btnDisabled = "disabled";
                } else if (btnStatus === 'error') {
                    btnHtml = '<i data-lucide="refresh-cw" size="14"></i> 重試提取';
                    btnClass = "mt-2 text-xs bg-red-600 hover:bg-red-500 text-white py-1.5 px-3 rounded flex items-center gap-1 transition-colors w-fit";
                }
                
                // 加上 data-msg-id 讓 task_manager.js 可以精準抓取
                content += `
                    <button onclick="downloadUbMedia('${chatId}', '${msg.id}', this)" 
                            data-msg-id="${msg.id}" 
                            data-task-status="${btnStatus}"
                            ${btnDisabled}
                            class="${btnClass}">
                        ${btnHtml}
                    </button>
                `;
            }
            
            const timeStr = new Date(msg.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            msgsEl.innerHTML += `
                <div class="max-w-[80%] p-3 rounded-xl border ${alignClass}">
                    ${content}
                    <div class="text-[10px] text-slate-400 text-right mt-1">${timeStr}</div>
                </div>
            `;
        });
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        msgsEl.innerHTML = `<div class="text-red-400 text-center">${err.message}</div>`;
    }
}

function ubBackToChats() {
    document.getElementById('ub-chat-view').classList.add('hidden');
    document.getElementById('ub-chat-view').classList.remove('flex');
    document.getElementById('ub-chat-list').classList.remove('hidden');
}