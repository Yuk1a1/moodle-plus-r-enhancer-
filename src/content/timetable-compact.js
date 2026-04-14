// timetable-compact.js — /my/* 専用

(async function() {
    // =================================================================
    // 0. 設定チェック — OFF なら即終了
    // =================================================================
    try {
        const { settings } = await chrome.storage.sync.get('settings');
        if (settings?.timetableCompact === false) return;
    } catch (e) {
        // storage 未初期化時はデフォルト ON として続行
    }

    if (!location.pathname.startsWith('/my/')) return;

    function initTimetableCompact() {
        const timetableTable = document.querySelector('.timetable-table, table.timetable');
        if (!timetableTable) return;

        // セルにツールチップデータを設定
        const cells = timetableTable.querySelectorAll('td.highlight');
        let processedCount = 0;

        cells.forEach(cell => {
            // すでに設定済みならスキップ
            if (cell.hasAttribute('data-tooltip')) return;

            const text = cell.textContent.trim();
            if (text) {
                cell.setAttribute('data-tooltip', text);
                processedCount++;
            }

            // タッチデバイス対応: クリックでトグル
            cell.addEventListener('click', (e) => {
                // リンク自体のクリックなら邪魔しない
                if (e.target.tagName === 'A' || e.target.closest('a')) return;

                // 他のアクティブなツールチップを閉じる
                document.querySelectorAll('.me-tooltip-active')
                    .forEach(el => el !== cell && el.classList.remove('me-tooltip-active'));

                cell.classList.toggle('me-tooltip-active');
            });
        });

        if (processedCount > 0) {
            console.log(`[Moodle Enhancer] 時間割コンパクト化: 新規に ${processedCount} セルにツールチップを設定しました`);
        }
    }

    // 初回実行を試みる
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTimetableCompact);
    } else {
        initTimetableCompact();
    }

    // Moodleの非同期/Reactレンダリング対策
    // 時間割ブロックが後から描画・更新されても追従できるようにする
    const observer = new MutationObserver(() => {
        const table = document.querySelector('.timetable-table, table.timetable');
        if (table) {
            initTimetableCompact();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
