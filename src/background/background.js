// moodle-enhancer/background.js

/**
 * @fileoverview
 * Moodle からのダウンロードを検知し、授業名でフォルダ分けする Service Worker。
 *
 * ダウンロード URL または referrer URL からコースIDを特定し、
 * content.js が蓄積したコースID→コース名マッピング（chrome.storage）から正しい授業名を取得する。
 * マッピングに存在しない場合は、content.js にメッセージを送って API 経由で取得を委任する。
 *
 * 保存構造: Moodle/[授業名]/[元のファイル名]
 *
 * 重要: onDeterminingFilename リスナーでは、すべてのコードパスで
 * suggest() を呼び出す必要がある。呼び出さないとダウンロードがハングする。
 */

// =============================================================================
// ログユーティリティ（Service Worker 用）
// =============================================================================

const BG_DEBUG = false;
const BG_LOG_PREFIX = '[Moodle Enhancer BG]';

function bgLog(...args) {
    if (BG_DEBUG) console.log(BG_LOG_PREFIX, ...args);
}

function bgWarn(...args) {
    console.warn(BG_LOG_PREFIX, ...args);
}

// =============================================================================
// ファイル名サニタイズ（Service Worker 用）
// =============================================================================
// NOTE: moodle-api.js は Content Script 用であり、Service Worker から直接参照できない。
// そのため、sanitizeForFilename のロジックをここにも配置する。
// Phase 2 で ES Modules 移行時に統合予定。

/**
 * 文字列をファイル名として安全な形式にサニタイズする。
 * @param {string} name - サニタイズ対象の文字列
 * @param {string} [fallback='moodle-files'] - 空文字列時のフォールバック
 * @returns {string} サニタイズ済みの文字列
 */
function sanitizeForFilename(name, fallback = 'moodle-files') {
    if (!name) return fallback;

    let sanitized = name;

    // 制御文字を除去 (ASCII 0-31)
    sanitized = sanitized.replace(/[\x00-\x1f]/g, '');

    // ファイル名に使えない文字を全角ハイフンに置換
    sanitized = sanitized.replace(/[\\/:*?"<>|]/g, '－');

    // 末尾のピリオドとスペースを除去
    sanitized = sanitized.replace(/[. ]+$/, '');

    // 先頭のスペースを除去
    sanitized = sanitized.replace(/^ +/, '');

    // Windows 予約語チェック
    const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (RESERVED_NAMES.test(sanitized)) {
        sanitized = `_${sanitized}`;
    }

    if (!sanitized) return fallback;
    return sanitized;
}

// =============================================================================
// URL からのコースID抽出
// =============================================================================

/**
 * URL から Moodle のコースIDを抽出する。
 * /course/view.php?id=XXXXX のパターンのみに対応。
 *
 * 注意: /course/section.php?id=XXXXX の id はセクションIDであり コースIDではない。
 *       /mod/xxx/view.php?id=XXXXX の id は cmid (コースモジュールID) であり コースIDではない。
 *       /pluginfile.php/XXXXX/... の数値はコンテキストIDであり コースIDではない。
 *
 * @param {string} url - 解析する URL
 * @returns {string|null} コースID。該当しない場合は null。
 */
function extractCourseIdFromUrl(url) {
    if (!url) return null;
    try {
        const urlObj = new URL(url);
        if (urlObj.pathname === '/course/view.php') {
            return urlObj.searchParams.get('id');
        }
    } catch (e) {
        // URL 解析失敗
    }
    return null;
}

// =============================================================================
// タブからのコースID取得（メッセージパッシング方式）
// =============================================================================

/**
 * referrer URL に対応するタブの content.js にメッセージを送り、コースIDを取得する。
 * body クラスの `course-XXXXX` パターンから正確なコースIDを得る。
 *
 * @param {string} referrerUrl - referrer URL
 * @returns {Promise<string|null>} コースID
 */
async function getCourseIdFromTab(referrerUrl) {
    if (!referrerUrl) return null;

    try {
        // referrer URL がコースページの場合、直接IDを抽出
        const directId = extractCourseIdFromUrl(referrerUrl);
        if (directId) return directId;

        // Moodle のタブを検索
        const tabs = await chrome.tabs.query({
            url: 'https://lms.ritsumei.ac.jp/*'
        });

        // referrer URL に一致するタブを探して content.js に問い合わせ
        let referrerNormalized;
        try {
            referrerNormalized = new URL(referrerUrl);
            referrerNormalized.hash = '';
        } catch (e) {
            return null;
        }

        for (const tab of tabs) {
            try {
                const tabNormalized = new URL(tab.url);
                tabNormalized.hash = '';

                if (tabNormalized.href === referrerNormalized.href) {
                    const response = await chrome.tabs.sendMessage(tab.id, {
                        type: 'GET_COURSE_ID'
                    });
                    if (response?.courseId) {
                        return response.courseId;
                    }
                }
            } catch (e) {
                // このタブでは content.js が応答しない（まだ読み込まれていない等）
            }
        }
    } catch (e) {
        bgWarn('タブからのコースID取得失敗:', e.message);
    }
    return null;
}

// =============================================================================
// コース名の解決
// =============================================================================

/**
 * コースIDからコース名を解決する。
 *
 * 解決戦略:
 *   1. chrome.storage のキャッシュを確認
 *   2. キャッシュにない場合、Moodle のタブの content.js に API 呼び出しを委任
 *
 * @param {string} courseId - コースID
 * @returns {Promise<string>} コース名。取得失敗時は 'moodle-files'。
 */
async function resolveCourseName(courseId) {
    if (!courseId || courseId === '1') return 'moodle-files';

    // 1. キャッシュ確認
    const result = await chrome.storage.local.get(['courseNames']);
    const courseNames = result.courseNames || {};
    if (courseNames[courseId]) {
        bgLog('キャッシュからコース名取得:', courseId, '→', courseNames[courseId]);
        return courseNames[courseId];
    }

    // 2. Moodle のタブに問い合わせ（メッセージパッシング）
    try {
        const tabs = await chrome.tabs.query({
            url: 'https://lms.ritsumei.ac.jp/*'
        });

        for (const tab of tabs) {
            try {
                const response = await chrome.tabs.sendMessage(tab.id, {
                    type: 'RESOLVE_COURSE_NAME',
                    courseId: courseId
                });
                if (response?.name) {
                    // キャッシュに保存
                    courseNames[courseId] = response.name;
                    await chrome.storage.local.set({ courseNames });
                    bgLog('API から取得してキャッシュ:', courseId, '→', response.name);
                    return response.name;
                }
            } catch (e) {
                // このタブでは content.js が応答しない
            }
        }
    } catch (e) {
        bgWarn('API によるコース名解決失敗:', e.message);
    }

    return 'moodle-files';
}

// =============================================================================
// FORCE_DOWNLOAD による自動ダウンロード 
// =============================================================================

// FORCE_DOWNLOAD 経由で開始されたダウンロードの ID を記録
// onDeterminingFilename での二重フォルダ分けを防止するため
const forceDownloadIds = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FORCE_DOWNLOAD') {
        (async () => {
            try {
                // 既存の解決ロジック（キャッシュ優先）を使う
                const courseName = await resolveCourseName(message.courseId);
                const sanitizedCourseName = sanitizeForFilename(courseName);

                // chrome.downloads.download API で直接ダウンロード
                // filename に指定されたパスでフォルダ分けが実行される
                const downloadId = await chrome.downloads.download({
                    url: message.url,
                    filename: `Moodle/${sanitizedCourseName}/`,
                    conflictAction: 'uniquify'
                });

                if (downloadId) {
                    forceDownloadIds.add(downloadId);
                }
                bgLog("F2 自動DL開始 ID:", downloadId, `(フォルダ: ${sanitizedCourseName})`);
            } catch (error) {
                bgWarn("F2 自動DLエラー:", error);
            }
        })();
        return false;
    }
});

// =============================================================================
// ダウンロードファイル名の決定
// =============================================================================

chrome.downloads.onDeterminingFilename.addListener(function (downloadItem, suggest) {
    // FORCE_DOWNLOAD 経由のDLはスキップ（既にフォルダ指定済み）
    if (forceDownloadIds.has(downloadItem.id)) {
        forceDownloadIds.delete(downloadItem.id);
        bgLog(`二重フォルダ分け防止: DL-ID ${downloadItem.id} をスキップします`);
        suggest({ filename: downloadItem.filename });
        return true; 
    }

    const moodleUrlPattern = 'https://lms.ritsumei.ac.jp/';

    // referrer または URL で Moodle からのダウンロードか判定
    const isFromMoodle =
        (downloadItem.referrer && downloadItem.referrer.startsWith(moodleUrlPattern)) ||
        (downloadItem.url && downloadItem.url.startsWith(moodleUrlPattern));

    if (!isFromMoodle) {
        suggest({ filename: downloadItem.filename });
        return;
    }

    // 非同期でコースIDを特定し、フォルダ分けを決定
    (async () => {
        try {
            let courseId = null;

            // 1. referrer URL からコースIDを直接抽出
            courseId = extractCourseIdFromUrl(downloadItem.referrer);

            // 2. referrer のタブから body クラス経由でコースIDを取得
            if (!courseId) {
                courseId = await getCourseIdFromTab(downloadItem.referrer);
            }

            // 3. ダウンロード URL からコースIDを抽出（あまり期待できないが試行）
            if (!courseId) {
                courseId = extractCourseIdFromUrl(downloadItem.url);
            }

            // 4. アクティブタブから取得（フォールバック）
            if (!courseId) {
                try {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (activeTab?.url?.includes('lms.ritsumei.ac.jp')) {
                        courseId = extractCourseIdFromUrl(activeTab.url);
                        if (!courseId) {
                            courseId = await getCourseIdFromTab(activeTab.url);
                        }
                    }
                } catch (e) { /* ignore */ }
            }

            // コースIDからコース名を解決
            const courseName = await resolveCourseName(courseId);

            // ファイル名として安全な形式にサニタイズ
            const sanitizedCourseName = sanitizeForFilename(courseName);

            const originalFilename = downloadItem.filename;

            // 新しいファイルパスを構築 (Moodle/[授業名]/[元のファイル名])
            const newFilename = `Moodle/${sanitizedCourseName}/${originalFilename}`;

            bgLog('ファイル名提案:', newFilename);

            suggest({
                filename: newFilename,
                conflictAction: 'uniquify'
            });
        } catch (error) {
            bgWarn('ファイル名提案エラー:', error.message);
            // エラー時はデフォルトのファイル名を使用
            suggest({ filename: downloadItem.filename });
        }
    })();

    return true; // 非同期処理のため true を返す
});

// =============================================================================
// PDF 自動ダウンロード: pluginfile.php への直接遷移を検知
// =============================================================================
// Moodle の「自動」表示設定では mod/resource/view.php からサーバーサイドリダイレクトで
// pluginfile.php に飛ばされ、ブラウザの PDF ビューアで開かれる。
// content script が発火しないケースをバックグラウンドレベルで補完する。

// 同じタブ+URLで複数回発火するのを防止
const pdfAutoDownloadedTabs = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // status=complete のみ処理（URL変更中の中間状態を無視）
    if (changeInfo.status !== 'complete') return;
    if (!tab.url) return;

    // 設定チェック
    try {
        const { settings } = await chrome.storage.sync.get('settings');
        if (settings?.forceDownload === false) return;
    } catch (e) { /* デフォルト ON */ }

    try {
        const url = new URL(tab.url);
        if (url.hostname !== 'lms.ritsumei.ac.jp') return;
        if (!url.pathname.startsWith('/pluginfile.php/')) return;
        if (!url.pathname.toLowerCase().endsWith('.pdf')) return;
        // すでに forcedownload=1 が付いている場合はスキップ（ダウンロードが始まっているはず）
        if (url.searchParams.get('forcedownload') === '1') return;

        // 同じタブ+URLの重複防止
        const key = `${tabId}:${tab.url}`;
        if (pdfAutoDownloadedTabs.has(key)) return;
        pdfAutoDownloadedTabs.add(key);
        // 30秒後にクリア（メモリリーク防止）
        setTimeout(() => pdfAutoDownloadedTabs.delete(key), 30000);

        // forcedownload=1 を付与してダウンロード実行
        const downloadUrl = new URL(tab.url);
        downloadUrl.searchParams.set('forcedownload', '1');

        bgLog('PDF自動DL (tabs.onUpdated): pluginfile.php 検知 →', downloadUrl.toString());

        const downloadId = await chrome.downloads.download({
            url: downloadUrl.toString(),
            conflictAction: 'uniquify'
        });

        if (downloadId) {
            forceDownloadIds.add(downloadId);
        }
    } catch (e) {
        bgWarn('PDF自動DL (tabs.onUpdated) エラー:', e);
    }
});