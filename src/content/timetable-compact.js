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

        // `:` で分割
        const parts = text.split(':').map(p => p.trim());

        if (parts.length === 1) {
            // 例: "情報技術と社会" (コードなし)
            return { code: '', name: parts[0], room: '', full: text };
        } else if (parts.length === 2) {
            // 例: "54610:情報技術と社会(GV)" (教室なし)
            return { code: parts[0], name: parts[1], room: '', full: text };
        } else {
            // 例: "54610:情報技術と社会(GV):C274"
            const code = parts[0];
            const room = parts[parts.length - 1];
            // 授業名に : が含まれている場合を考慮し中間を結合
            const name = parts.slice(1, parts.length - 1).join(':');
            return { code, name, room, full: text };
        }
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
     * <a> タグ内の直接テキストノードだけを連結して返す。
     * アイコン（<span class="off"><img>...</span> や <img>）のalt/textは含まない。
     */
    function getLinkText(linkEl) {
        let text = '';
        for (const node of linkEl.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            }
        }
        return text.trim();
    }

    /**
     * セルから「活性（点灯）」アイコンのみをクローンして返す。
     *
     * Moodle の時間割アイコン構造:
     *   活性: <img class="newsicon" alt="未読アナウンスメント 点灯">  (span.off なし)
     *   非活性: <span class="off"><img class="newsicon" alt="... 消灯"></span>
     *
     * 「消灯」アイコンは情報量がないので省略し、「点灯」のみ表示する。
     */
    function collectActiveIcons(linkEl) {
        const iconImgs = linkEl.querySelectorAll(
            'img.favouriteicon, img.newsicon, img.assignicon, img.forumicon, img.icon'
        );

        const activeIcons = [];
        iconImgs.forEach(img => {
            const alt = (img.alt || '').trim();
            // Moodleの点灯アイコンは alt="... 点灯" または親に span.off がないもの
            // span.offの中にあるものは非活性なので無視
            if (!img.closest('span.off')) {
                activeIcons.push(img.cloneNode(true));
            }
        });

        return activeIcons;
    }

    function initTimetableCompact() {
        const timetableTable = document.querySelector('.timetable-table, table.timetable');
        if (!timetableTable) return;

        const cells = timetableTable.querySelectorAll('td.highlight');
        let processedCount = 0;

        // 【凡例移動】凡例をタイトル横に移動して省スペース化
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
            // 処理済みならスキップ
            if (cell.hasAttribute('data-me-processed')) return;
            cell.setAttribute('data-me-processed', 'true');

            const links = cell.querySelectorAll('a.active-course-name, a');
            if (links.length === 0) return;

            let fullTooltipText = '';

            links.forEach(link => {
                // --- 1. DOM変更前にデータを収集 ---
                const rawText = getLinkText(link);
                const activeIcons = collectActiveIcons(link);

                if (!rawText) return;
                
                if (fullTooltipText) fullTooltipText += '\n\n';
                fullTooltipText += rawText;

                // テキストをパースして構造化表示
                const parsed = parseCellText(rawText);

                if (parsed) {
                    // --- 2. リンクの中身を全クリアして再構築（カード型UI） ---
                    link.textContent = '';
                    link.classList.add('me-timetable-card'); // カードスタイル適用

                    // --- 第1レイヤー：ヘッダー（授業コード ＆ 通知アイコン） ---
                    const headerDiv = document.createElement('div');
                    headerDiv.className = 'me-card-header';

                    const codeSpan = document.createElement('span');
                    codeSpan.className = 'me-course-code';
                    codeSpan.textContent = parsed.code ? parsed.code : '';
                    headerDiv.appendChild(codeSpan);

                    if (activeIcons.length > 0) {
                        const iconSpan = document.createElement('span');
                        iconSpan.className = 'me-icons';
                        activeIcons.forEach(icon => {
                            icon.classList.remove('icon'); // marginリセットのため不要クラス削除
                            iconSpan.appendChild(icon);
                        });
                        headerDiv.appendChild(iconSpan);
                    }
                    link.appendChild(headerDiv);

                    // --- 第2レイヤー：授業名 ---
                    const titleDiv = document.createElement('div');
                    titleDiv.className = 'me-course-title';
                    // truncateNameに頼らず CSS line-clamp に委ねるためフルネームをセット
                    titleDiv.textContent = parsed.name;
                    link.appendChild(titleDiv);

                    // --- 第3レイヤー：教室名 ---
                    if (parsed.room) {
                        const roomDiv = document.createElement('div');
                        roomDiv.className = 'me-course-room';
                        roomDiv.textContent = `📍 ${parsed.room}`;
                        link.appendChild(roomDiv);
                    }

                    processedCount++;
                }
            });

            if (fullTooltipText) {
                // ツールチップに元テキスト全文を設定
                cell.setAttribute('data-tooltip', fullTooltipText);
            }

            // タッチデバイス対応: クリックでツールチップトグル
            cell.addEventListener('click', (e) => {
                // リンク自体のクリックなら何もしない（遷移させる）
                if (e.target.tagName === 'A' || e.target.closest('a')) return;

                document.querySelectorAll('.me-tooltip-active')
                    .forEach(el => el !== cell && el.classList.remove('me-tooltip-active'));

                cell.classList.toggle('me-tooltip-active');
            });
        });

        if (processedCount > 0) {
            console.log(`[Moodle Enhancer] 時間割コンパクト化: ${processedCount} セルを構造化表示に変換`);
        }
    }

    // 初回実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTimetableCompact);
    } else {
        initTimetableCompact();
    }

    // Moodleの非同期レンダリング対策
    const observer = new MutationObserver(() => {
        const table = document.querySelector('.timetable-table, table.timetable');
        if (table) {
            initTimetableCompact();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
