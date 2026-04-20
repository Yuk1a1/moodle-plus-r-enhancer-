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
// ダウンロードファイル名の決定
// =============================================================================

chrome.downloads.onDeterminingFilename.addListener(function (downloadItem, suggest) {
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

            // 3.5. 直近のクリック履歴（lastClickedCourseId）から取得（強力なフォールバック）
            if (!courseId) {
                const { lastClickedCourseId, lastClickedCourseTime } = await chrome.storage.local.get(['lastClickedCourseId', 'lastClickedCourseTime']);
                // 10秒以内（10000ms）のクリックであれば、それが原因のダウンロードとみなす
                if (lastClickedCourseId && lastClickedCourseTime && (Date.now() - lastClickedCourseTime < 10000)) {
                    courseId = lastClickedCourseId;
                    bgLog('onDeterminingFilename: lastClickedCourseId から復元 ->', courseId);
                }
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

            console.log(`[TDD-ANALYSIS] [onDeterminingFilename] 提案パス: ${newFilename}`);

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

