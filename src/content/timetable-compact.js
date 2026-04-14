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
        const timetableContainer = document.querySelector('.timetable-table');
        if (!timetableContainer) {
            console.log('[Moodle Enhancer] 時間割テーブルが見つかりませんでした。');
            return;
        }

        // 既に移動済みの場合は何もしない
        if (timetableContainer.parentNode.classList.contains('me-timetable-wrapper')) return;

        // 時間割をページの主要コンテンツエリアの先頭に移動
        const mainContent = document.querySelector('#region-main .card-body, #region-main');
        if (mainContent) {
            // 元の位置から削除して先頭に挿入
            const wrapper = document.createElement('div');
            wrapper.className = 'me-timetable-wrapper';
            wrapper.appendChild(timetableContainer);
            mainContent.prepend(wrapper);
            console.log('[Moodle Enhancer] 時間割をページ上部に移動しました。');
        }

        // セルにツールチップデータを設定
        const cells = timetableContainer.querySelectorAll('table.timetable td.highlight');
        cells.forEach(cell => {
            const text = cell.textContent.trim();
            if (text) {
                cell.setAttribute('data-tooltip', text);
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

        console.log(`[Moodle Enhancer] 時間割コンパクト化: ${cells.length} セルにツールチップを設定しました`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTimetableCompact);
    } else {
        initTimetableCompact();
    }
})();
