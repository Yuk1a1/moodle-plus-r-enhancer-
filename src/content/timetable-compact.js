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

    // =================================================================
    // セルテキストのパース
    // 形式: "授業コード:授業名 曜日時限:教室"
    // 例:   "54610:情報技術と社会(GV) 水1:C274"
    // =================================================================
    const COURSE_NAME_MAX_LEN = 12;

    /**
     * セルのテキストを「授業コード:授業名 曜日時限:教室」形式でパースする。
     * @param {string} raw - セルの元テキスト
     * @returns {{ code: string, name: string, room: string, full: string } | null}
     */
    function parseCellText(raw) {
        if (!raw) return null;
        const text = raw.trim();

        // 最後の `:` で教室を分離
        const lastColon = text.lastIndexOf(':');
        if (lastColon === -1) return null;

        const room = text.substring(lastColon + 1).trim();
        const before = text.substring(0, lastColon).trim();

        // 先頭の `:` で授業コードと授業名を分離
        const firstColon = before.indexOf(':');
        if (firstColon === -1) return null;

        const code = before.substring(0, firstColon).trim();
        const name = before.substring(firstColon + 1).trim();

        if (!name && !room) return null;

        return { code, name, room, full: text };
    }

    /**
     * 授業名を指定文字数に截断する。
     */
    function truncateName(name, maxLen) {
        if (!name) return '';
        if (name.length <= maxLen) return name;
        return name.substring(0, maxLen) + '…';
    }

    function initTimetableCompact() {
        const timetableTable = document.querySelector('.timetable-table, table.timetable');
        if (!timetableTable) return;

        // セルにツールチップデータを設定
        const cells = timetableTable.querySelectorAll('td.highlight');
        let processedCount = 0;

        // 【新機能】凡例（マークの説明）をタイトルの横の空きスペースに移動して省スペース化
        const block = timetableTable.closest('.block, .card');
        if (block) {
            const title = block.querySelector('.card-title, h3, h5');
            const legendEl = timetableTable.previousElementSibling;
            
            // prev要素があり、かつそれが凡例らしきもの（divで、テキストを含んでいる）なら移動
            if (title && legendEl && legendEl.tagName === 'DIV' && !legendEl.classList.contains('me-legend-moved')) {
                legendEl.classList.add('me-legend-moved');
                
                // タイトルをFlexレイアウトにして横並びにする
                title.style.display = 'flex';
                title.style.alignItems = 'center';
                title.style.justifyContent = 'space-between';
                title.style.marginBottom = '0';
                
                // 凡例自体のスタイルをタイトルバーに馴染ませる
                legendEl.style.margin = '0';
                legendEl.style.padding = '0';
                legendEl.style.fontSize = '0.8rem';
                legendEl.style.background = 'transparent';
                legendEl.style.border = 'none';
                legendEl.style.flexShrink = '1';
                // 元のグレー背景を消してスッキリさせる
                legendEl.style.boxShadow = 'none';
                
                // アイコン類の隙間を詰める（もし内部にmarginがあれば）
                const items = legendEl.querySelectorAll('span, div');
                items.forEach(item => {
                    item.style.marginRight = '8px';
                    item.style.marginBottom = '0';
                });
                
                title.appendChild(legendEl);
            }
        }

        cells.forEach(cell => {
            // すでに処理済みならスキップ
            if (cell.hasAttribute('data-tooltip')) return;

            const rawText = cell.textContent.trim();
            if (!rawText) return;

            // ツールチップに元テキスト全文を設定
            cell.setAttribute('data-tooltip', rawText);

            // テキストをパースして構造化表示
            const parsed = parseCellText(rawText);

            // セル内のリンク要素を探す
            const link = cell.querySelector('a');

            if (parsed && link) {
                // リンクの中身を「授業名(截断) + 教室」に書き換える
                const nameSpan = document.createElement('span');
                nameSpan.className = 'me-course-name';
                nameSpan.textContent = truncateName(parsed.name, COURSE_NAME_MAX_LEN);

                const roomSpan = document.createElement('span');
                roomSpan.className = 'me-course-room';
                roomSpan.textContent = parsed.room;

                // リンクの中身を入れ替え（hrefはそのまま保持）
                link.textContent = '';
                link.appendChild(nameSpan);
                link.appendChild(roomSpan);
            }

            processedCount++;

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
