/**
 * assignment-tracker.js — ダッシュボード専用課題トラッカー
 * 
 * MoodleのAPIを叩き、直近の課題をサイドバーに常時表示・強調する機能。
 */

(function () {
    // ダッシュボード (/my/ や /my/index.php) 以外は実行しない
    if (!location.pathname.startsWith('/my/')) return;

    /**
     * DOM読み込み完了時に初期化
     */
    function init() {
        const sidebar = document.getElementById('block-region-side-pre');
        if (!sidebar) return;

        // すでに注入済みの場合はスキップ
        if (document.querySelector('.me-assignment-tracker')) return;

        injectTrackerWidget(sidebar);
    }

    /**
     * トラッカーの枠組みをDOMに注入し、データ取得を開始する
     */
    async function injectTrackerWidget(sidebar) {
        // コンテナの作成
        const tracker = document.createElement('div');
        tracker.className = 'me-assignment-tracker';
        tracker.innerHTML = `
            <div class="me-at-header">
                🚀 今週の課題
                <span class="me-badge me-at-count">取得中...</span>
            </div>
            <ul class="me-at-body">
                <div class="me-at-status">
                    <span class="me-spinner"></span> 課題データを読み込み中...
                </div>
            </ul>
        `;

        // 既存のサイドバーの最上部に挿入
        sidebar.prepend(tracker);

        try {
            // APIから未提出の直近イベントを取得
            const events = await fetchUpcomingAssignments();
            
            const body = tracker.querySelector('.me-at-body');
            const countBadge = tracker.querySelector('.me-at-count');

            if (!events || events.length === 0) {
                body.innerHTML = '<div class="me-at-status">🎉 近日中に期限を迎える課題はありません。</div>';
                countBadge.textContent = '0件';
                return;
            }

            countBadge.textContent = `${events.length}件`;
            renderEvents(events, body);

        } catch (e) {
            console.error("[Moodle Enhancer] 課題データの取得に失敗:", e);
            tracker.querySelector('.me-at-body').innerHTML = 
                `<div class="me-at-status" style="color:#dc3545;">⚠️ データの取得に失敗しました。<br>${e.message}</div>`;
            tracker.querySelector('.me-at-count').textContent = 'エラー';
        }
    }

    /**
     * Moodle API を呼び出し、直近の提出課題を取得する
     */
    async function fetchUpcomingAssignments() {
        // 今の時刻 (Unix Timestamp 秒) を開始地点とする
        const nowUnix = Math.floor(Date.now() / 1000);
        
        // moodle-api.js の共有関数を使用
        if (typeof callMoodleApi !== 'function') {
            throw new Error("moodle-api.js が読み込まれていません。");
        }

        const data = await callMoodleApi('core_calendar_get_action_events_by_timesort', {
            timesortfrom: nowUnix,
            limitnum: 15 // 一旦最大15件まで取得
        });

        if (!data || !data.events) {
            return [];
        }

        // Actionが存在する（提出などのアクションが求められている）イベントだけをフィルタ
        return data.events.filter(e => e.action && e.action.actionable);
    }

    /**
     * イベント情報をHTMLにレンダリングする
     */
    function renderEvents(events, container) {
        container.innerHTML = '';
        const now = Date.now();

        events.forEach(ev => {
            // 締切時刻 (ミリ秒)
            const dueTimeMs = ev.timesort * 1000;
            
            // 残り時間の計算
            const diffMs = Math.max(0, dueTimeMs - now);
            const totalMinutes = Math.floor(diffMs / (1000 * 60));
            const days = Math.floor(totalMinutes / (60 * 24));
            const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
            const minutes = totalMinutes % 60;

            let timeLeftText = '';
            if (diffMs === 0) {
                timeLeftText = '期限切れ';
            } else if (days > 0) {
                timeLeftText = `残り ${days}日 ${hours}時間 ${minutes}分`;
            } else if (hours > 0) {
                timeLeftText = `残り ${hours}時間 ${minutes}分`;
            } else {
                timeLeftText = `残り ${minutes}分`;
            }

            // 危険度判定
            let statusClass = 'me-safe';
            if (days < 2) {
                // 48時間(約2日)未満は「超危険」
                statusClass = 'me-urgent';
            } else if (days <= 7) {
                // 1週間以内は「要注意」
                statusClass = 'me-warning';
            } else {
                // それ以上は「安全」
                statusClass = 'me-safe';
            }

            // タイトルのクリーニング (Moodle特有の接頭辞を消すなど)
            let title = ev.name;
            title = title.replace(/「(.*?)」の提出期限/g, '$1');

            const li = document.createElement('a');
            li.href = ev.action.url; // 提出画面へのリンク
            li.className = `me-at-item ${statusClass}`;
            
            li.innerHTML = `
                <div class="me-at-course">${ev.course.fullname}</div>
                <div class="me-at-title">${title}</div>
                <div class="me-at-meta">
                    <span class="me-at-action">${ev.action.name}</span>
                    <span class="me-at-time-left">${timeLeftText}</span>
                </div>
            `;

            container.appendChild(li);
        });
    }

    // エントリーポイント
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // SPA遷移対策
    const observer = new MutationObserver(() => {
        const sidebar = document.getElementById('block-region-side-pre');
        if (sidebar && !document.querySelector('.me-assignment-tracker')) {
            init();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
