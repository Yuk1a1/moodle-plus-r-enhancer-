/**
 * course-expander.js — コースコンテンツのインラインエクスパンダー
 * 
 * ページ移動せずにMoodle APIを叩いて全セクションのモジュールを取得し、
 * インラインで展開/折りたたみを行う機能。
 */

(function () {
    // コーストップページ (/course/view.php) 以外は実行しない
    if (!location.pathname.startsWith('/course/view.php')) return;

    let apiCache = null;

    /**
     * DOM読み込み完了時に初期化
     */
    function init() {
        const courseContent = document.querySelector('.course-content') || document.querySelector('ul.topics');
        if (!courseContent) return;

        // すでに注入済みの場合はスキップ（二重実行防止）
        if (document.querySelector('.me-global-controls')) return;

        // グローバルコントローラーを上部に挿入
        injectGlobalControls(courseContent);

        // 各セクションヘッダーにトグルボタンを挿入
        const sections = document.querySelectorAll('li.section.course-section');
        sections.forEach(injectSectionToggle);

        // 常に自動で「すべて展開」を実行する（ゼロクリックUX）
        const expandBtn = document.querySelector('.me-btn-expand-all');
        if (expandBtn) {
            expandBtn.click();
        }
    }

    /**
     * コースページの最上部に「すべて展開」「すべて折りたたむ」ボタンを配置
     */
    function injectGlobalControls(container) {
        const controls = document.createElement('div');
        controls.className = 'me-global-controls';
        controls.innerHTML = `
            <button class="me-btn me-btn-expand-all" title="全セクションに入っている資料を展開します">
                📂 すべて展開
            </button>
            <button class="me-btn me-btn-collapse-all" title="展開された資料をすべて閉じます" style="display:none;">
                📁 すべて折りたたむ
            </button>
        `;

        const expandBtn = controls.querySelector('.me-btn-expand-all');
        const collapseBtn = controls.querySelector('.me-btn-collapse-all');

        expandBtn.addEventListener('click', async () => {
            expandBtn.innerHTML = '<span class="me-spinner"></span>展開中...';
            await expandAllSections();
            expandBtn.innerHTML = '📂 すべて展開';
            expandBtn.style.display = 'none';
            collapseBtn.style.display = 'inline-flex';
        });

        collapseBtn.addEventListener('click', () => {
            collapseAllSections();
            collapseBtn.style.display = 'none';
            expandBtn.style.display = 'inline-flex';
        });

        container.prepend(controls);
    }

    /**
     * 各セクションのヘッダーに個別展開ボタンを配置
     */
    function injectSectionToggle(sectionElement) {
        const headerTitle = sectionElement.querySelector('.course-section-header h3.sectionname');
        if (!headerTitle) return; // タイトルがなければ無視

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'me-section-toggle';
        toggleBtn.textContent = '▼ 展開';
        toggleBtn.title = 'この週の資料を展開します';

        toggleBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const contentContainer = getOrCreateContentContainer(sectionElement);
            
            // すでに展開中の場合は閉じる
            if (contentContainer.classList.contains('me-expanded')) {
                collapseSection(sectionElement, toggleBtn, contentContainer);
            } else {
                toggleBtn.textContent = '⌛...';
                await expandSection(sectionElement, contentContainer);
                toggleBtn.textContent = '▲ 閉じる';
            }
        });

        headerTitle.appendChild(toggleBtn);
    }

    /**
     * セクションを展開（APIからデータ取得＆レンダリング）
     */
    async function expandSection(sectionElement, contentContainer) {
        // すでにデータがレンダリング済みの場合は開くだけ
        if (contentContainer.dataset.rendered === "true") {
            contentContainer.classList.add('me-expanded');
            return;
        }

        try {
            contentContainer.innerHTML = '<div class="me-status-box"><div class="me-spinner"></div>データを取得しています...</div>';
            contentContainer.classList.add('me-expanded'); // アニメーション開始

            const courseId = getCourseIdFromBody();
            if (!courseId) throw new Error("コースIDが見つかりません。");

            // キャッシュがなければDOM(コースインデックス)からスクレイピング
            if (!apiCache) {
                apiCache = scrapeCourseIndex();
            }

            const sectionData = matchSectionToScrapedData(sectionElement, apiCache);

            if (!sectionData) {
                throw new Error("セクションの紐付けに失敗しました。このセクションは目次に存在しない可能性があります。");
            }

            // モジュールが存在しない（空の）セクションの場合
            if (!sectionData.modules || sectionData.modules.length === 0) {
                // 展開キャンセル
                contentContainer.classList.remove('me-expanded');
                const toggleBtn = sectionElement.querySelector('.me-section-toggle');
                if (toggleBtn) {
                    toggleBtn.style.display = 'none'; // 無効化
                }
                return;
            }

            renderModules(sectionData.modules, contentContainer);
            contentContainer.dataset.rendered = "true";

        } catch (e) {
            console.error("[Moodle Enhancer] F1 展開エラー:", e);
            contentContainer.innerHTML = `<div class="me-status-box me-error-box">⚠️ データの取得に失敗しました。(${e.message})</div>`;
        }
    }

    /**
     * 左側のコースインデックスドロワーからデータをスクレイピングする
     */
    function scrapeCourseIndex() {
        const drawerContent = document.getElementById('courseindex-content');
        if (!drawerContent) {
            throw new Error("コース目次要素(courseindex-content)が見つかりません。テーマが異なるか、まだ読み込まれていません。");
        }

        const sections = Array.from(drawerContent.querySelectorAll('.courseindex-section'));
        const result = [];

        sections.forEach(sec => {
            // 例: courseindexsection10
            const sectionIdNode = sec.id;
            let sectionId = null;
            if (sectionIdNode) {
                const match = sectionIdNode.match(/courseindexsection(\d+)/);
                if (match) sectionId = match[1];
            }

            const titleNode = sec.querySelector('.courseindex-section-title');
            const title = titleNode ? titleNode.textContent.trim() : '無題のセクション';

            // そのセクションに含まれる全モジュール
            const items = Array.from(sec.querySelectorAll('.courseindex-item')).map(item => {
                const nameNode = item.querySelector('.courseindex-name') || item.querySelector('.courseindex-link') || item;
                
                // Moodleがスクリーンリーダー用に入れる視覚外テキストやバッジを取り除く
                const clone = nameNode.cloneNode(true);
                clone.querySelectorAll('.sr-only, .badge, .courseindex-chevron').forEach(el => el.remove());
                
                // それでも残るテキストノイズを無理やりリプレイス
                let name = clone.textContent.replace(/展開する/g, '')
                                            .replace(/折りたたむ/g, '')
                                            .replace(/ハイライト/g, '')
                                            .replace(/活動:\s*\d+/g, '')
                                            .replace(/進捗:\s*\d+\s*\/\s*\d+/g, '')
                                            .replace(/[「」]/g, '') // 「テスト」のようなスクリーンリーダーの括弧を除去
                                            .trim();

                let url = item.href;
                if (!url) {
                    const aTag = item.querySelector('a');
                    if (aTag) url = aTag.href;
                }

                // アイコンのURLを取得
                let iconUrl = '';
                const iconImg = item.querySelector('img.icon');
                if (iconImg) iconUrl = iconImg.src;

                // モジュール種別を大まかに推測（URLやアイコンから）
                const isPdf = iconUrl.includes('pdf') || iconUrl.includes('document') || (url && url.toLowerCase().includes('resource/view.php') && name.toLowerCase().includes('.pdf'));

                return {
                    name: name,
                    url: url,
                    modicon: iconUrl,
                    isPdf: isPdf
                };
            });

            result.push({
                id: sectionId,
                title: title,
                modules: items
            });
        });

        return result;
    }

    /**
     * セクションを閉じる
     */
    function collapseSection(sectionElement, toggleBtn, contentContainer) {
        contentContainer.classList.remove('me-expanded');
        toggleBtn.textContent = '▼ 展開';
    }

    /**
     * 全セクションを一括展開
     */
    async function expandAllSections() {
        const sections = document.querySelectorAll('li.section.course-section');
        const tasks = Array.from(sections).map(section => {
            const toggleBtn = section.querySelector('.me-section-toggle');
            if (!toggleBtn || toggleBtn.style.display === 'none') return null;
            
            const contentContainer = getOrCreateContentContainer(section);
            if (!contentContainer.classList.contains('me-expanded')) {
                toggleBtn.textContent = '▲ 閉じる';
                return expandSection(section, contentContainer);
            }
            return null;
        }).filter(t => t !== null);

        await Promise.allSettled(tasks);
    }

    /**
     * 全セクションを一括で折りたたむ
     */
    function collapseAllSections() {
        const sections = document.querySelectorAll('li.section.course-section');
        sections.forEach(section => {
            const toggleBtn = section.querySelector('.me-section-toggle');
            const contentContainer = section.querySelector('.me-section-content');
            if (toggleBtn && contentContainer && contentContainer.classList.contains('me-expanded')) {
                collapseSection(section, toggleBtn, contentContainer);
            }
        });
    }

    /**
     * セクション要素からスクレイピングしたデータを紐付ける
     */
    function matchSectionToScrapedData(sectionElement, scrapedSections) {
        // sectionElement (例: <li id="section-1" class="section course-section">)
        const elemId = sectionElement.id;
        let sectionNum = elemId ? elemId.replace('section-', '') : null;

        if (sectionNum !== null) {
            // スクラップしたデータもidにセクション番号（courseindexsectionX -> X）を持っている
            const match = scrapedSections.find(s => String(s.id) === sectionNum);
            if (match) return match;
        }

        // フォールバック: タイトル名による緩い一致
        const titleNode = sectionElement.querySelector('.course-section-header h3.sectionname');
        if (titleNode) {
            const titleText = titleNode.textContent.replace('▼ 展開', '').replace('▲ 閉じる', '').replace('⌛...', '').trim();
            const match = scrapedSections.find(s => s.title.includes(titleText) || titleText.includes(s.title));
            if (match) return match;
        }

        return null;
    }

    /**
     * モジュールのリストをHTMLにレンダリングする
     */
    function renderModules(modules, container) {
        const ul = document.createElement('ul');
        ul.className = 'me-module-list';

        modules.forEach(mod => {
            // Label（単なるテキスト領域）は今回は除外（ファイルや課題のみが主なターゲット）
            if (!mod.url) return;

            const li = document.createElement('li');
            li.className = 'me-module-item';

            // アイコン
            if (mod.modicon) {
                const iconImg = document.createElement('img');
                iconImg.className = 'me-module-icon';
                iconImg.src = mod.modicon;
                iconImg.alt = '';
                li.appendChild(iconImg);
            }

            // インフォ領域（タイトル等）
            const infoDiv = document.createElement('div');
            infoDiv.className = 'me-module-info';

            const nameLink = document.createElement('a');
            nameLink.className = 'me-module-name';
            nameLink.href = mod.url || '#';
            nameLink.textContent = mod.name;
            infoDiv.appendChild(nameLink);

            li.appendChild(infoDiv);

            // ダウンロードリンク (PDFの場合)
            if (mod.isPdf && mod.url) {
                try {
                    let dlUrl = new URL(mod.url);
                    dlUrl.searchParams.set('forcedownload', '1');
                    
                    const dlBtn = document.createElement('a');
                    dlBtn.className = 'me-dl-btn';
                    dlBtn.href = dlUrl.toString();
                    dlBtn.target = '_blank';
                    dlBtn.innerHTML = '📥 DL';
                    dlBtn.title = 'ファイルをダウンロードします';
                    
                    // クリック時に元のリンクへの遷移を防ぐ
                    dlBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                    });

                    li.appendChild(dlBtn);
                } catch(e) {}
            }

            ul.appendChild(li);
        });
        
        container.innerHTML = '';
        
        if (ul.childNodes.length === 0) {
            // Labelばかりで実質空だった場合
            container.classList.remove('me-expanded');
            container.style.display = 'none'; // 親の処理などで対応済なら不要だが念のため
            return;
        }

        container.appendChild(ul);
    }

    /**
     * セクションに紐付く展開コンテンツ用のコンテナを取得または作成する
     */
    function getOrCreateContentContainer(sectionElement) {
        let container = sectionElement.querySelector('.me-section-content');
        if (!container) {
            container = document.createElement('div');
            container.className = 'me-section-content';
            
            // 通常、.content クラス配下に挿入するのが綺麗
            const target = sectionElement.querySelector('.content') || sectionElement;
            target.appendChild(container);
        }
        return container;
    }

    // body クラスからのコースID抽出 (content.js と同等)
    function getCourseIdFromBody() {
        const bodyClass = document.body.className;
        const match = bodyClass.match(/course-(\d+)/);
        if (match && match[1]) {
            return match[1];
        }
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    // Moodleのページロード処理に割り込む
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // DOMの動的変化に対応するため、MutationObserverで遅延読み込みにも備える
    const observer = new MutationObserver(() => {
        const courseContent = document.querySelector('.course-content') || document.querySelector('ul.topics');
        if (courseContent && !document.querySelector('.me-global-controls')) {
            init();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
