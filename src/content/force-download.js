// force-download.js — /mod/resource/view.php および /mod/folder/view.php 専用
// run_at: "document_end"

(async function() {
    // =================================================================
    // 0. 設定チェック — OFF なら即終了
    // =================================================================
    try {
        const { settings } = await chrome.storage.sync.get('settings');
        if (settings?.forceDownload === false) return;
    } catch (e) {
        // storage 未初期化時はデフォルト ON として続行
    }

    // body クラスからコースIDを取得するユーティリティ (content.js と重複)
    function getCourseIdFromBody() {
        const match = document.body.className.match(/course-(\d+)/);
        return match ? match[1] : null;
    }

    // =================================================================
    // 1. ページ種別に応じた URL 検出
    // =================================================================
    const isResourcePage = location.pathname.startsWith('/mod/resource/view.php');
    const isFolderPage = location.pathname.startsWith('/mod/folder/view.php');

    if (!isResourcePage && !isFolderPage) return;

    if (isFolderPage) {
        handleFolderPage();
        return;
    }

    handleResourcePage();

    // =================================================================
    // リソースページ処理 (ゼロクリック自動DL)
    // =================================================================
    function handleResourcePage() {
        const pluginfileUrl = detectPluginfileUrl();
        if (!pluginfileUrl) return;

        if (!isPdfUrl(pluginfileUrl)) return;

        triggerDownload(pluginfileUrl);
    }

    // =================================================================
    // フォルダページ処理 (リンクの書き換えのみ)
    // =================================================================
    function handleFolderPage() {
        const links = document.querySelectorAll('.foldertree a[href*="pluginfile.php"], .filemanager a[href*="pluginfile.php"]');
        let rewriteCount = 0;

        links.forEach(link => {
            if (!isPdfUrl(link.href)) return;
            try {
                const url = new URL(link.href);
                url.searchParams.set('forcedownload', '1');
                link.href = url.toString();
                rewriteCount++;
            } catch (e) {
                // 無視
            }
        });

        if (rewriteCount > 0) {
            console.log(`[Moodle Enhancer] フォルダページ: ${rewriteCount} 個のPDFリンクに forcedownload を付与`);
        }
    }

    // =================================================================
    // URL 検出・判定ロジック
    // =================================================================
    function detectPluginfileUrl() {
        // パターン1: resourceworkaround（デフォルト表示）
        const workaroundLink = document.querySelector('.resourceworkaround a[href*="pluginfile.php"]');
        if (workaroundLink) return workaroundLink.href;

        // パターン2: 埋め込み表示（iframe / object / embed）
        const embedded = document.querySelector(
            '.resourcecontent object[data*="pluginfile.php"],' +
            '.resourcecontent embed[src*="pluginfile.php"],' +
            '.resourcecontent iframe[src*="pluginfile.php"]'
        );
        if (embedded) return embedded.data || embedded.src;

        // パターン3: ページ内のいずれかの pluginfile.php リンク
        const fallbackLink = document.querySelector('#region-main a[href*="pluginfile.php"]');
        if (fallbackLink) return fallbackLink.href;

        return null; // 見つからなければ静かにFAIL
    }

    function isPdfUrl(url) {
        try {
            return new URL(url).pathname.toLowerCase().endsWith('.pdf');
        } catch (e) {
            return url.toLowerCase().includes('.pdf');
        }
    }

    // =================================================================
    // ダウンロード実行 (background連携)
    // =================================================================
    function triggerDownload(pluginfileUrl) {
        const courseId = getCourseIdFromBody();

        // 常に forcedownload=1 を付与
        let downloadUrl;
        try {
            const urlObj = new URL(pluginfileUrl);
            urlObj.searchParams.set('forcedownload', '1');
            downloadUrl = urlObj.toString();
        } catch (e) {
            downloadUrl = pluginfileUrl + '?forcedownload=1';
        }

        // background.js に「ダウンロードして」と依頼するだけ（コース名解決はbackgroundがやる）
        chrome.runtime.sendMessage({
            type: 'FORCE_DOWNLOAD',
            url: downloadUrl,
            courseId: courseId
        });

        showDownloadNotice();
        console.log('[Moodle Enhancer] PDF自動ダウンロード開始:', downloadUrl);
    }

    // =================================================================
    // 通知バナー UI表示
    // =================================================================
    function showDownloadNotice() {
        // 二重注入防止
        if (document.querySelector('.me-download-notice')) return;

        const notice = document.createElement('div');
        notice.className = 'me-download-notice';
        notice.textContent = '📥 ダウンロードを開始しました (Moodle Enhancer)';
        document.body.prepend(notice);

        setTimeout(() => notice.classList.add('me-fade-out'), 3000);
        setTimeout(() => notice.remove(), 3500);
    }

})();
