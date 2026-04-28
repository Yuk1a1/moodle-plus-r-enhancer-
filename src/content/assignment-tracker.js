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
            <div class="me-at-footer" style="display:none;">
                <div class="me-at-footer-main">
                    <span class="me-at-manage-btn">非表示の課題を管理</span>
                </div>
                <div class="me-at-hidden-manager" style="display:none;">
                    <div class="me-at-mgr-header">
                        <label><input type="checkbox" class="me-at-select-all"> 全選択</label>
                        <button class="me-at-restore-selected">選択した課題を表示</button>
                    </div>
                    <ul class="me-at-hidden-list"></ul>
                </div>
            </div>
        `;

        // 既存のサイドバーの最上部に挿入
        sidebar.prepend(tracker);

        try {
            // APIから未提出の直近イベントを取得
            let events = await fetchUpcomingAssignments();
            
            // 非表示にされた課題をフィルタリング
            const { me_hidden_assignments } = await chrome.storage.local.get(['me_hidden_assignments']);
            let hiddenData = me_hidden_assignments || [];
            
            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            
            // 【自動クリーンアップ】30日以上経過した非表示設定は削除する
            const originalLength = hiddenData.length;
            hiddenData = hiddenData.filter(d => {
                if (typeof d !== 'object' || !d.hiddenAt) return true; // 古い形式は維持
                return (now - d.hiddenAt) < THIRTY_DAYS_MS;
            });

            // 【自動補完】名前が未取得（旧バージョン）の課題があれば、今回のAPIレスポンスから名前を補完する
            let needsUpdate = originalLength !== hiddenData.length;
            hiddenData = hiddenData.map(d => {
                const item = typeof d === 'object' ? d : { id: d, name: null, course: null, hiddenAt: now };
                if (!item.hiddenAt) item.hiddenAt = now; // タイムスタンプ付与
                
                if (!item.name || item.name.includes("課題ID:")) {
                    const found = events.find(ev => ev.id === item.id);
                    if (found) {
                        item.name = found.name.replace(/「(.*?)」の提出期限/g, '$1');
                        item.course = found.course.fullname;
                        needsUpdate = true;
                    } else if (!item.name) {
                        item.name = `不明な課題 (ID: ${item.id})`;
                        needsUpdate = true;
                    }
                }
                return item;
            });
            if (needsUpdate) {
                await chrome.storage.local.set({ me_hidden_assignments: hiddenData });
            }

            const hiddenIds = hiddenData.map(d => d.id);
            events = events.filter(ev => !hiddenIds.includes(ev.id));

            const body = tracker.querySelector('.me-at-body');
            const countBadge = tracker.querySelector('.me-at-count');
            const footer = tracker.querySelector('.me-at-footer');
            const hiddenManager = tracker.querySelector('.me-at-hidden-manager');
            const hiddenList = tracker.querySelector('.me-at-hidden-list');

            if (hiddenIds.length > 0) {
                footer.style.display = 'block';
                renderHiddenList(hiddenData, hiddenList);
            }

            if (!events || events.length === 0) {
                body.innerHTML = '<div class="me-at-status">🎉 近日中に期限を迎える課題はありません。</div>';
                countBadge.textContent = '0件';
            } else {
                countBadge.textContent = `${events.length}件`;
                renderEvents(events, body);
            }

            // 非表示ボタンのクリックイベント（委譲）
            body.addEventListener('click', async (e) => {
                if (e.target.classList.contains('me-at-hide-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const evId = parseInt(e.target.getAttribute('data-id'), 10);
                    if (!evId) return;

                    const result = await chrome.storage.local.get(['me_hidden_assignments']);
                    const currentHidden = result.me_hidden_assignments || [];
                    
                    // 以前はIDのみ保存していた可能性があるため、正規化しつつ追加
                    const normalizedHidden = currentHidden.map(d => typeof d === 'object' ? d : { id: d, name: "不明な課題", course: "" });
                    
                    if (!normalizedHidden.find(d => d.id === evId)) {
                        const itemElem = e.target.closest('.me-at-item');
                        const name = itemElem.querySelector('.me-at-title').textContent;
                        const course = itemElem.querySelector('.me-at-course').textContent;
                        
                        normalizedHidden.push({ 
                            id: evId, 
                            name, 
                            course,
                            hiddenAt: Date.now() // 非表示にした日時を記録
                        });
                        await chrome.storage.local.set({ me_hidden_assignments: normalizedHidden });
                        
                        // 管理リストを更新
                        renderHiddenList(normalizedHidden, hiddenList);
                    }
                    
                    // UIから即時削除
                    const item = e.target.closest('.me-at-item');
                    if (item) item.remove();
                    
                    // フッターの表示更新
                    if (footer) footer.style.display = 'block';

                    // カウントバッジの更新
                    const items = body.querySelectorAll('.me-at-item');
                    if (countBadge) {
                        countBadge.textContent = `${items.length}件`;
                    }
                    if (items.length === 0) {
                        body.innerHTML = '<div class="me-at-status">🎉 近日中に期限を迎える課題はありません。</div>';
                    }
                }
            });

            // 管理パネルのトグル
            footer.addEventListener('click', async (e) => {
                if (e.target.classList.contains('me-at-manage-btn')) {
                    const isVisible = hiddenManager.style.display === 'block';
                    hiddenManager.style.display = isVisible ? 'none' : 'block';
                    e.target.textContent = isVisible ? '非表示の課題を管理' : '管理パネルを閉じる';
                }
            });

            // 全選択
            tracker.querySelector('.me-at-select-all').addEventListener('change', (e) => {
                const checkboxes = hiddenList.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => cb.checked = e.target.checked);
            });

            // 選択した課題を復元
            tracker.querySelector('.me-at-restore-selected').addEventListener('click', async () => {
                const selectedCheckboxes = hiddenList.querySelectorAll('input[type="checkbox"]:checked');
                if (selectedCheckboxes.length === 0) return;

                const idsToRestore = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value, 10));
                
                const result = await chrome.storage.local.get(['me_hidden_assignments']);
                const currentHidden = result.me_hidden_assignments || [];
                const newHidden = currentHidden.filter(d => {
                    const id = typeof d === 'object' ? d.id : d;
                    return !idsToRestore.includes(id);
                });

                await chrome.storage.local.set({ me_hidden_assignments: newHidden });
                
                // 再描画
                tracker.remove();
                init();
            });

        } catch (e) {
            console.error("[Moodle Enhancer] 課題データの取得に失敗:", e);
            tracker.querySelector('.me-at-body').innerHTML = 
                `<div class="me-at-status" style="color:#dc3545;">⚠️ データの取得に失敗しました。<br>${e.message}</div>`;
            tracker.querySelector('.me-at-count').textContent = 'エラー';
        }
    }

    /**
     * 非表示リストのレンダリング
     */
    function renderHiddenList(data, container) {
        container.innerHTML = '';
        data.forEach(item => {
            const id = typeof item === 'object' ? item.id : item;
            const name = typeof item === 'object' ? item.name : `課題ID: ${id}`;
            const course = typeof item === 'object' ? item.course : "";

            const li = document.createElement('li');
            li.innerHTML = `
                <label>
                    <input type="checkbox" value="${id}">
                    <div class="me-at-hidden-info">
                        <div class="me-at-hidden-name">${name}</div>
                        <div class="me-at-hidden-course">${course}</div>
                    </div>
                </label>
            `;
            container.appendChild(li);
        });
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
                <div class="me-at-header-row">
                    <div class="me-at-course">${ev.course.fullname}</div>
                    <div class="me-at-hide-btn" data-id="${ev.id}" title="この課題を非表示にする">&times;</div>
                </div>
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
