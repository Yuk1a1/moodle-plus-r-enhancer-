/**
 * always-active.js — IntelliBoard アクティブ状態偽装
 *
 * IntelliBoard の非アクティブ検出を無効化し、
 * 常に「アクティブに操作中」とサーバーに報告させる。
 *
 * 仕組み:
 *   1. document.hidden / document.visibilityState を上書きし、
 *      タブが裏に回っても「表示中」に見せかける
 *   2. visibilitychange イベントの発火を抑制する
 *   3. 定期的にマウスとキーボードのイベントを発火し、
 *      IntelliBoard の非アクティブタイマーを常にリセットし続ける
 *
 * 設定ページ (options.html) から ON/OFF を切り替え可能。
 * デフォルトは OFF（有効化しない）。
 */

(function () {
    'use strict';

    const LOG_PREFIX = '[Moodle Enhancer: Always Active]';
    let isActive = false;
    let heartbeatInterval = null;

    /**
     * 設定を読み込み、有効/無効を判定する
     */
    async function checkSetting() {
        const { settings } = await chrome.storage.sync.get('settings');
        const enabled = settings && settings.alwaysActive === true;

        if (enabled && !isActive) {
            activate();
        } else if (!enabled && isActive) {
            deactivate();
        }
    }

    /**
     * 偽装を有効化する
     */
    function activate() {
        if (isActive) return;
        isActive = true;
        console.log(LOG_PREFIX, '有効化しました');

        // ---- 1. document.hidden と visibilityState を上書き ----
        Object.defineProperty(document, 'hidden', {
            get: () => false,
            configurable: true
        });
        Object.defineProperty(document, 'visibilityState', {
            get: () => 'visible',
            configurable: true
        });

        // ---- 2. visibilitychange イベントを抑制 ----
        document.addEventListener('visibilitychange', suppressVisibilityChange, true);

        // ---- 3. 定期的に活動イベントを発火してタイマーをリセット ----
        // IntelliBoard は mousemove, keypress, scroll を監視しているため、
        // 30秒ごとにこれらのイベントを合成・発火する
        heartbeatInterval = setInterval(emitActivityEvents, 30000);

        // 即座に1回発火しておく
        emitActivityEvents();
    }

    /**
     * 偽装を無効化する（ページリロードが必要な場合あり）
     */
    function deactivate() {
        if (!isActive) return;
        isActive = false;
        console.log(LOG_PREFIX, '無効化しました');

        // イベント抑制の解除
        document.removeEventListener('visibilitychange', suppressVisibilityChange, true);

        // ハートビートの停止
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }

        // hidden / visibilityState の上書き解除
        // （完全な復元にはリロードが必要な場合がある）
        try {
            delete document.hidden;
            delete document.visibilityState;
        } catch (e) {
            // 上書き解除に失敗しても問題なし（次のリロードで自然に戻る）
        }
    }

    /**
     * visibilitychange イベントの発火を抑制するハンドラ
     */
    function suppressVisibilityChange(e) {
        e.stopImmediatePropagation();
    }

    /**
     * 合成イベントを発火して IntelliBoard に「操作中」と認識させる
     */
    function emitActivityEvents() {
        // mousemove イベント
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: Math.floor(Math.random() * 800) + 100,
            clientY: Math.floor(Math.random() * 600) + 100
        }));

        // keypress イベント（特定のキーは送らない、イベント発火のみ）
        document.dispatchEvent(new KeyboardEvent('keypress', {
            bubbles: true,
            key: '',
            code: ''
        }));

        // scroll イベント
        document.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    // ---- 初期化 ----
    checkSetting();

    // 設定の変更をリアルタイムで反映
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.settings) {
            const newSettings = changes.settings.newValue || {};
            if (newSettings.alwaysActive && !isActive) {
                activate();
            } else if (!newSettings.alwaysActive && isActive) {
                deactivate();
            }
        }
    });
})();
