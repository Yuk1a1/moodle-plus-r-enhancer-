// options.js
const SETTINGS_KEYS = ['forceDownload', 'timetableCompact', 'courseExpander'];

// ページ読み込み時に設定を復元
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get('settings', ({ settings }) => {
        settings = settings || {};
        SETTINGS_KEYS.forEach(key => {
            const el = document.getElementById(key);
            if (el) {
                // デフォルトはすべて ON (true)
                el.checked = settings[key] !== false;
            }
        });
    });

    // 変更イベントの登録
    SETTINGS_KEYS.forEach(key => {
        const el = document.getElementById(key);
        if (el) {
            el.addEventListener('change', saveSettings);
        }
    });
});

// 設定の保存
function saveSettings() {
    const settings = {};
    SETTINGS_KEYS.forEach(key => {
        const el = document.getElementById(key);
        if (el) {
            settings[key] = el.checked;
        }
    });

    chrome.storage.sync.set({ settings }, () => {
        const msg = document.getElementById('savedMsg');
        msg.classList.add('show');
        setTimeout(() => msg.classList.remove('show'), 2000);
    });
}
