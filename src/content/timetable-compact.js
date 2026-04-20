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
     * アイコン要素のテキスト（altやtitle）はrawTextに混入しないよう、
     * 呼び出し側で純粋なテキストノードのみを渡すこと。
     *
     * @param {string} raw - セルの元テキスト（アイコンテキスト除外済み）
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

    /**
     * 要素内のテキストノードだけを連結して返す（子要素のテキストは除外）。
     * アイコンの title/alt がテキストに混ざるのを防ぐ。
     */
    function getDirectText(element) {
        let text = '';
        for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A') {
                // リンク内のテキストも取得（リンク内にアイコンがある場合はその中のテキストノードのみ）
                for (const child of node.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        text += child.textContent;
                    }
                }
            }
        }
        return text.trim();
    }

    /**
     * セルからアイコン要素（i, img, svg, span.icon 等）を収集してクローンを返す。
     * 元のアイコンは後で削除される可能性があるため、クローンを返す。
     */
    function collectIcons(cell) {
        const selectors = [
            'i[class*="fa"]',
            'i[class*="icon"]',
            'img.icon',
            'img[class*="flag"]',
            'svg',
            'span.icon',
            '[class*="announcement"]',
            '[class*="forum"]',
            '[class*="assignment"]'
        ];
        const icons = cell.querySelectorAll(selectors.join(', '));
        return Array.from(icons).map(icon => icon.cloneNode(true));
    }

    function initTimetableCompact() {
        const timetableTable = document.querySelector('.timetable-table, table.timetable');
        if (!timetableTable) return;

        // セルにツールチップデータを設定
        const cells = timetableTable.querySelectorAll('td.highlight');
        let processedCount = 0;

        // 【凡例移動】凡例（マークの説明）をタイトルの横の空きスペースに移動して省スペース化
        const block = timetableTable.closest('.block, .card');
        if (block) {
            const title = block.querySelector('.card-title, h3, h5');
            const legendEl = timetableTable.previousElementSibling;
            
            if (title && legendEl && legendEl.tagName === 'DIV' && !legendEl.classList.contains('me-legend-moved')) {
                legendEl.classList.add('me-legend-moved');
                
                title.style.display = 'flex';
                title.style.alignItems = 'center';
                title.style.justifyContent = 'space-between';
                title.style.marginBottom = '0';
                
                legendEl.style.margin = '0';
                legendEl.style.padding = '0';
                legendEl.style.fontSize = '0.8rem';
                legendEl.style.background = 'transparent';
                legendEl.style.border = 'none';
                legendEl.style.flexShrink = '1';
                legendEl.style.boxShadow = 'none';
                
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
            if (cell.hasAttribute('data-me-processed')) return;
            cell.setAttribute('data-me-processed', 'true');

            // --- 1. アイコンをクローンして保存（DOM変更前に！）---
            const iconClones = collectIcons(cell);

            // --- 2. テキストの取得（アイコンのテキストを除外）---
            const link = cell.querySelector('a');
            const container = cell.querySelector('div') || cell;
            // リンク内またはコンテナ内の純粋なテキストを取得
            const rawText = link
                ? getDirectText(link) || getDirectText(container)
                : getDirectText(container);

            if (!rawText) return;

            // ツールチップに元テキスト全文を設定
            cell.setAttribute('data-tooltip', rawText);

            // テキストをパースして構造化表示
            const parsed = parseCellText(rawText);

            if (parsed && link) {
                // --- 3. リンクの中身を構造化して書き換え ---
                link.textContent = '';

                // 1行目: 授業名（截断）
                const nameSpan = document.createElement('span');
                nameSpan.className = 'me-course-name';
                nameSpan.textContent = truncateName(parsed.name, COURSE_NAME_MAX_LEN);
                link.appendChild(nameSpan);

                // 2行目: 教室 + アイコン
                const bottomRow = document.createElement('span');
                bottomRow.className = 'me-course-bottom';

                const roomSpan = document.createElement('span');
                roomSpan.className = 'me-course-room';
                roomSpan.textContent = parsed.room;
                bottomRow.appendChild(roomSpan);

                // アイコンを復元
                if (iconClones.length > 0) {
                    const iconWrap = document.createElement('span');
                    iconWrap.className = 'me-course-icons';
                    iconClones.forEach(icon => iconWrap.appendChild(icon));
                    bottomRow.appendChild(iconWrap);
                }

                link.appendChild(bottomRow);

                // --- 4. リンク外に残っている元のアイコンを削除（クローン済みなので不要）---
                const remainingIcons = container.querySelectorAll(
                    'i[class*="fa"], i[class*="icon"], img.icon, svg, span.icon'
                );
                remainingIcons.forEach(icon => {
                    if (!link.contains(icon)) icon.remove();
                });
            }

            processedCount++;

            // タッチデバイス対応: クリックでトグル
            cell.addEventListener('click', (e) => {
                if (e.target.tagName === 'A' || e.target.closest('a')) return;

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
    const observer = new MutationObserver(() => {
        const table = document.querySelector('.timetable-table, table.timetable');
        if (table) {
            initTimetableCompact();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
