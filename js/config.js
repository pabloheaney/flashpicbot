// js/config.js

// ==========================================
// 1. API 網址設定
// ==========================================
const API_URL_GACHA = "https://api.atlrunner.dpdns.org"; 
const API_URL_ANNOUNCE = "https://status.atlrunner.dpdns.org";
const API_URL_USERBOT = "https://api2.atlrunner.dpdns.org"; 

// ==========================================
// 2. 遊戲與抽卡常數設定
// ==========================================
const COOLDOWN_TIME = 24 * 60 * 60 * 1000; // 24小時冷卻

const raritiesConfig = {
    'common': { name: '一般', colorClass: 'rarity-common', iconColor: '#374151', icon: 'ticket' },
    'advanced': { name: '高級', colorClass: 'rarity-advanced', iconColor: '#1e40af', icon: 'copy' },
    'rare': { name: '稀有', colorClass: 'rarity-rare', iconColor: '#6b21a8', icon: 'layers' },
    'legendary': { name: '傳說', colorClass: 'rarity-legendary', iconColor: '#854d0e', icon: 'crown' }
};

// ==========================================
// 3. 全域狀態變數 (Global State)
// ==========================================

// 遊戲狀態
let gameState = { 
    totalFlashCards: 0, 
    vipState: { level: 'none', expiry: 0 }, 
    lastDrawTime: 0 
};

// Userbot 連線狀態
let ubState = {
    sessionToken: localStorage.getItem('ub_token') || null,
    pendingSessionToken: localStorage.getItem('ub_pending_token') || null,
    phoneHash: localStorage.getItem('ub_phone_hash') || null,
    phone: localStorage.getItem('ub_phone') || '',
    timerInterval: null,
    expiryTime: parseInt(localStorage.getItem('ub_expiry')) || 0
};

// ==========================================
// 4. 共用工具函數 (Utilities)
// ==========================================

/**
 * 獲取 Telegram WebApp 的認證 Header
 */
function getAuthHeaders() {
    const tg = window.Telegram?.WebApp;
    return { 
        "Content-Type": "application/json", 
        "Authorization": (tg && tg.initData) ? `tma ${tg.initData}` : "" 
    };
}

/**
 * 顯示全局提示框 (包含 XSS 防禦機制)
 * @param {string} message - 提示文字
 * @param {boolean} isError - 是否為錯誤提示 (顯示為紅色)
 */
function showToast(message, isError = false) {
    // 優先使用 TG 官方原生的 Alert (如果在手機上體驗更好)
    if (window.Telegram?.WebApp && window.Telegram.WebApp.showAlert) {
        window.Telegram.WebApp.showAlert(message);
        return;
    }
    
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    // 安全插入圖標
    toast.innerHTML = `<i data-lucide="${isError ? 'alert-circle' : 'info'}" class="${isError ? 'text-red-400' : 'text-blue-400'}"></i>`;
    
    // [安全升級] 安全插入純文字，防止 HTML 注入 (XSS)
    const textNode = document.createTextNode(" " + message);
    toast.appendChild(textNode);
    
    container.appendChild(toast);
    
    // 如果有載入 lucide 則重新渲染 icon
    if (window.lucide) {
        lucide.createIcons();
    }
    
    // 動畫進場
    setTimeout(() => toast.classList.add('show'), 10);
    
    // 動畫退場與銷毀
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
