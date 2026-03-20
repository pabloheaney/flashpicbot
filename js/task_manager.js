// js/task_manager.js

// 全局任務註冊表，供其他腳本 (如 userbot.js) 讀取
window.globalTaskRegistry = {};
let taskPollInterval = null;

/**
 * 啟動全局任務輪詢 (當 Userbot 登入成功，或切換到私閃分頁時呼叫)
 */
function startTaskPolling() {
    if (taskPollInterval) clearInterval(taskPollInterval);
    
    // 立即執行一次
    fetchAndSyncTasks();
    
    // 每 3 秒輪詢一次
    taskPollInterval = setInterval(fetchAndSyncTasks, 3000);
    console.log("[TaskManager] 任務輪詢已啟動");
}

/**
 * 停止全局任務輪詢 (當 Userbot 登出，或連線過期時呼叫)
 */
function stopTaskPolling() {
    if (taskPollInterval) {
        clearInterval(taskPollInterval);
        taskPollInterval = null;
    }
    window.globalTaskRegistry = {}; // 清空本地註冊表
    console.log("[TaskManager] 任務輪詢已停止");
}

/**
 * 向伺服器拉取所有任務狀態，並更新 UI
 */
async function fetchAndSyncTasks() {
    // 如果沒有 Session，就不需要輪詢
    if (!ubState.sessionToken) {
        stopTaskPolling();
        return;
    }

    try {
        const res = await fetch(`${API_URL_USERBOT}/api/tasks`, {
            headers: { 'Authorization': `Bearer ${ubState.sessionToken}` }
        });
        
        // 如果連線失效 (401)，不處理，交由 userbot 本身的倒數計時去登出
        if (!res.ok) return; 

        const data = await res.json();
        
        // 更新全局註冊表
        // data.tasks 的結構為: { "message_id": { status: "processing", message: "..." }, ... }
        window.globalTaskRegistry = data.tasks || {};

        // 掃描畫面上的按鈕並更新狀態
        updateVisibleTaskButtons();

    } catch (err) {
        console.error("[TaskManager] 輪詢任務失敗:", err);
    }
}

/**
 * 掃描 DOM 中所有帶有 data-msg-id 的按鈕，根據全局註冊表更新它們的外觀
 */
function updateVisibleTaskButtons() {
    // 找出所有標記了 data-msg-id 的下載按鈕
    const buttons = document.querySelectorAll('button[data-msg-id]');
    
    buttons.forEach(btn => {
        const msgId = btn.getAttribute('data-msg-id');
        const taskInfo = window.globalTaskRegistry[msgId];

        if (!taskInfo) return; // 如果這個訊息沒有任務，保持原樣

        // 避免重複渲染相同的狀態，導致按鈕閃爍
        const currentStatus = btn.getAttribute('data-task-status');
        if (currentStatus === taskInfo.status) return; 

        // 標記當前狀態
        btn.setAttribute('data-task-status', taskInfo.status);

        if (taskInfo.status === "processing") {
            btn.innerHTML = '<i data-lucide="loader-2" size="14" class="animate-spin"></i> 處理中...';
            btn.className = "mt-2 text-xs bg-blue-600 text-white font-bold py-1.5 px-3 rounded flex items-center gap-1 transition-colors w-fit";
            btn.disabled = true;
        } 
        else if (taskInfo.status === "success") {
            btn.innerHTML = '<i data-lucide="check" size="14"></i> 已發送至收藏';
            btn.className = "mt-2 text-xs bg-green-600 text-white font-bold py-1.5 px-3 rounded flex items-center gap-1 transition-colors w-fit shadow-[0_0_10px_rgba(34,197,94,0.3)]";
            btn.disabled = true; // 成功後鎖死按鈕
            
            // 震動回饋 (如果狀態是剛從 processing 變成 success)
            if (currentStatus === "processing" && window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
        } 
        else if (taskInfo.status === "error") {
            btn.innerHTML = '<i data-lucide="refresh-cw" size="14"></i> 重試提取';
            btn.className = "mt-2 text-xs bg-red-600 hover:bg-red-500 text-white py-1.5 px-3 rounded flex items-center gap-1 transition-colors w-fit";
            btn.disabled = false; // 失敗了允許重試
            
            if (currentStatus === "processing") {
                showToast(`任務失敗: ${taskInfo.message}`, true);
            }
        }
    });

    // 重新渲染 Lucide Icons
    if (window.lucide) lucide.createIcons();
}

/**
 * 發起提取媒體請求 (取代原本 index.html 裡面的舊函數)
 * @param {string} chatId - 對話 ID
 * @param {string} messageId - 訊息 ID
 * @param {HTMLElement} btn - 點擊的按鈕元素
 */
async function downloadUbMedia(chatId, messageId, btn) {
    // 1. 立即改變按鈕外觀 (Optimistic UI Update)
    btn.innerHTML = '<i data-lucide="loader-2" size="14" class="animate-spin"></i> 排隊中...';
    btn.className = "mt-2 text-xs bg-blue-600 text-white font-bold py-1.5 px-3 rounded flex items-center gap-1 transition-colors w-fit";
    btn.disabled = true;
    btn.setAttribute('data-task-status', 'processing'); // 預先設定狀態
    if (window.lucide) lucide.createIcons();

    try {
        // 2. 呼叫後端的 Async Factory API
        const res = await fetch(`${API_URL_USERBOT}/api/forward_media/${chatId}/${messageId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${ubState.sessionToken}` }
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.detail || "傳送失敗");
        
        // 3. 請求成功送出！
        // 接下來什麼都不用做，交給 fetchAndSyncTasks() 的背景輪詢去更新按鈕狀態
        
        // 可以主動觸發一次輪詢加速反應
        fetchAndSyncTasks();

    } catch (err) {
        // 4. 只有在發送請求「本身」失敗時，才需要手動把按鈕改回報錯狀態
        showToast(err.message, true);
        btn.innerHTML = '<i data-lucide="refresh-cw" size="14"></i> 重試提取';
        btn.className = "mt-2 text-xs bg-red-600 hover:bg-red-500 text-white py-1.5 px-3 rounded flex items-center gap-1 transition-colors w-fit";
        btn.disabled = false;
        btn.setAttribute('data-task-status', 'error');
        if (window.lucide) lucide.createIcons();
    }
}