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
            if (cell.hasAttribute('data-me-processed')) return;
            cell.setAttribute('data-me-processed', 'true');

            // 【TDD Step 1: データ抽出】
            // 授業リンクを基準として、周辺のテキストやアイコンを抽出する
            const links = Array.from(cell.querySelectorAll('a.active-course-name, a[href*="course/view.php"]'));
            if (links.length === 0) return;

            let fullTooltipText = '';
            const coursesData = [];

            links.forEach(link => {
                // リンクテキスト自体（例: "54610:情報技術と社会"）
                let rawTitle = link.innerText.trim();
                
                // 次のリンクまでの間にあるテキストノードを走査し、教室名（例: ":C274"）を取得
                let roomText = '';
                let next = link.nextSibling;
                while(next) {
                    if (next.tagName === 'A') break; // 次の授業リンクに到達したら終了
                    if (next.nodeType === Node.TEXT_NODE) {
                        roomText += next.textContent;
                    } else if (next.nodeType === Node.ELEMENT_NODE && next.tagName !== 'IMG') {
                        roomText += next.innerText || '';
                    }
                    next = next.nextSibling;
                }

                // リンクテキストと教室名テキストを合わせたものをツールチップ用に保存
                const fullTextForTooltip = rawTitle + roomText;
                if (fullTooltipText) fullTooltipText += '\n\n';
                fullTooltipText += fullTextForTooltip.trim();

                // 授業コードと授業名に分割 (例: "54610:情報技術と社会" -> "54610", "情報技術と社会")
                let code = '';
                let name = rawTitle;
                const firstColon = rawTitle.indexOf(':');
                // もし名前の中にコロンがあれば分離
                if (firstColon > 0) {
                    code = rawTitle.substring(0, firstColon).trim();
                    name = rawTitle.substring(firstColon + 1).trim();
                }

                // 教室名から不要な文字（先頭のコロンや空白）を除去
                // ": C274" -> "C274"
                roomText = roomText.replace(/^[:\s]+/, '').trim();

                // アイコンの抽出（リンクの親コンテナから検索）
                const container = link.parentElement.tagName === 'TD' ? cell : link.parentElement;
                const iconList = [];
                container.querySelectorAll('img').forEach(img => {
                    const altText = (img.alt || '').replace(/\s+/g, '');
                    // "点灯"が含まれるアイコンを抽出
                    if (altText.includes('点灯')) {
                        iconList.push({ src: img.src, title: img.alt });
                    }
                });

                coursesData.push({
                    code,
                    name,
                    room: roomText,
                    url: link.href,
                    icons: iconList,
                    originalLink: link
                });
            });

            // 【TDD Step 2: UI構築】
            // cellの中身を完全にクリアし、抽出したデータからカードUIを再構築する
            cell.innerHTML = '';

            coursesData.forEach(data => {
                // カード全体のリンク要素
                const card = document.createElement('a');
                card.href = data.url;
                card.className = 'me-timetable-card';

                // 第1レイヤー：ヘッダー（コードとアイコン）
                const headerDiv = document.createElement('div');
                headerDiv.className = 'me-card-header';
                
                const codeSpan = document.createElement('span');
                codeSpan.className = 'me-course-code';
                codeSpan.textContent = data.code ? data.code : '';
                headerDiv.appendChild(codeSpan);

                if (data.icons.length > 0) {
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'me-icons';
                    data.icons.forEach(icData => {
                        const iconImg = document.createElement('img');
                        iconImg.src = icData.src;
                        iconImg.title = icData.title;
                        iconSpan.appendChild(iconImg);
                    });
                    headerDiv.appendChild(iconSpan);
                }
                card.appendChild(headerDiv);

                // 第2レイヤー：授業名
                const titleDiv = document.createElement('div');
                titleDiv.className = 'me-course-title';
                titleDiv.textContent = data.name;
                card.appendChild(titleDiv);

                // 第3レイヤー：教室名
                if (data.room) {
                    const roomDiv = document.createElement('div');
                    roomDiv.className = 'me-course-room';
                    roomDiv.textContent = `📍 ${data.room}`;
                    card.appendChild(roomDiv);
                }

                cell.appendChild(card);
                processedCount++;
            });

            // ツールチップ設定とトグル処理
            if (fullTooltipText) {
                cell.setAttribute('data-tooltip', fullTooltipText);
            }

            cell.addEventListener('click', (e) => {
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
