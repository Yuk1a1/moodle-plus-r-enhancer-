// moodle-enhancer/lib/moodle-api.js
// 共通ライブラリ — Content Script コンテキストで動作する Moodle API ユーティリティ
// manifest.json の content_scripts.js で content.js より先に読み込むこと

/**
 * @fileoverview
 * Moodle Enhancer の Content Script 群が共通で使用するユーティリティモジュール。
 * - sesskey の取得
 * - Moodle AJAX API の呼び出し
 * - コース名の取得・クリーニング
 * - ファイル名のサニタイズ
 * - デバッグログユーティリティ
 *
 * このファイルはグローバルスコープに関数を公開する（ES Modules 不使用）。
 * background.js (Service Worker) から直接参照はできない。
 * background.js からは chrome.tabs.sendMessage 経由で間接利用する。
 */

// =============================================================================
// デバッグログユーティリティ
// =============================================================================

const MOODLE_ENHANCER_DEBUG = false;
const LOG_PREFIX = '[Moodle Enhancer]';

/**
 * デバッグログを出力する。MOODLE_ENHANCER_DEBUG が true の場合のみ出力。
 * @param {...any} args - ログ引数
 */
function log(...args) {
    if (MOODLE_ENHANCER_DEBUG) {
        console.log(LOG_PREFIX, ...args);
    }
}

/**
 * 警告ログを出力する（常に出力）。
 * @param {...any} args - ログ引数
 */
function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
}

// =============================================================================
// sesskey 取得
// =============================================================================

/**
 * Moodle の sesskey をページの DOM から取得する。
 * 取得方法:
 *   1. ログアウトリンクのクエリパラメータ
 *   2. hidden input 要素
 *
 * Content Script は isolated world で実行されるため、
 * M.cfg 等の MAIN world のグローバル変数には直接アクセスできない。
 *
 * @returns {string|null} sesskey。取得できなかった場合は null。
 */
function getSesskey() {
    // 方法1: ログアウトリンクから取得
    const logoutLink = document.querySelector('a[href*="logout.php?sesskey="]');
    if (logoutLink) {
        try {
            const url = new URL(logoutLink.href);
            const sesskey = url.searchParams.get('sesskey');
            if (sesskey) return sesskey;
        } catch (e) {
            // URL パース失敗 — 次の方法へ
        }
    }

    // 方法2: hidden input から取得
    const hiddenInput = document.querySelector('input[name="sesskey"]');
    if (hiddenInput && hiddenInput.value) {
        return hiddenInput.value;
    }

    return null;
}

// =============================================================================
// コースID 取得
// =============================================================================

/**
 * body 要素のクラス名からコースIDを取得する。
 * Moodle は body に `course-XXXXX` 形式のクラスを付与する。
 * @returns {string|null} コースID。取得できなかった場合は null。
 */
function getCourseIdFromBody() {
    const match = document.body.className.match(/\bcourse-(\d+)\b/);
    return match ? match[1] : null;
}

// =============================================================================
// Moodle AJAX API 呼び出し
// =============================================================================

/**
 * Moodle AJAX Web Service API を呼び出す汎用ラッパー。
 * Content Script 内から呼び出すことで、Cookie ベースの認証が自動適用される。
 *
 * @param {string} methodname - API メソッド名 (例: 'core_course_get_courses_by_field')
 * @param {Object} args - API メソッドの引数オブジェクト
 * @returns {Promise<Object|null>} API レスポンスの data 部分。失敗時は null。
 */
async function callMoodleApi(methodname, args) {
    const sesskey = getSesskey();
    if (!sesskey) {
        warn('sesskey が取得できないため API を呼び出せません。');
        return null;
    }

    try {
        const response = await fetch(
            `/lib/ajax/service.php?sesskey=${sesskey}&info=${methodname}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([{
                    index: 0,
                    methodname: methodname,
                    args: args
                }])
            }
        );

        if (!response.ok) {
            warn(`API レスポンスエラー: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();

        // Moodle API はエラーの場合 { error: true, ... } を返す
        if (data[0]?.error) {
            warn('Moodle API エラー:', data[0].exception?.message || data[0].exception);
            return null;
        }

        return data[0]?.data ?? null;
    } catch (error) {
        warn('API 呼び出し失敗:', error.message);
        return null;
    }
}

// =============================================================================
// コース名の取得・クリーニング
// =============================================================================

/**
 * コースフルネームから授業名を抽出・クリーニングする。
 *
 * 立命館 Moodle のコース名フォーマット:
 *   - "52335:企業倫理論(BA)"
 *   - "52151:経営組織論(BA) § 52152:別科目"
 *
 * @param {string} fullname - Moodle API から取得したコースフルネーム
 * @returns {string} クリーニング後の授業名
 */
function cleanCourseName(fullname) {
    if (!fullname) return '';

    let name = fullname;

    // § で区切られている場合、最初のコース名を使用
    const sectionIndex = name.indexOf('§');
    if (sectionIndex !== -1) {
        name = name.substring(0, sectionIndex).trim();
    }

    // コース番号を削除（例: "52335:企業倫理論(BA)" → "企業倫理論(BA)"）
    name = name.replace(/^\d+:/, '').trim();

    return name;
}

/**
 * コースIDからコース名を取得する。
 * API から取得したフルネームをクリーニングして返す。
 * API 失敗時は、コースページ (/course/view.php) の場合のみ h1 要素をフォールバックとして使用。
 *
 * @param {string} courseId - コースID
 * @returns {Promise<string|null>} クリーニング済みのコース名。取得失敗時は null。
 */
async function fetchCourseName(courseId) {
    if (!courseId || courseId === '1') return null;

    // API でコースフルネームを取得
    const data = await callMoodleApi('core_course_get_courses_by_field', {
        field: 'id',
        value: courseId
    });

    if (data?.courses && data.courses.length > 0) {
        const cleaned = cleanCourseName(data.courses[0].fullname);
        log('API からコース名取得:', data.courses[0].fullname, '→', cleaned);
        return cleaned;
    }

    // フォールバック: コースページの場合のみ h1 を使用
    if (window.location.pathname.startsWith('/course/view.php')) {
        const h1 = document.querySelector('.page-header-headings h1');
        if (h1) {
            const cleaned = cleanCourseName(h1.textContent.trim());
            log('h1 からコース名取得:', cleaned);
            return cleaned;
        }
    }

    return null;
}

// =============================================================================
// ファイル名サニタイズ
// =============================================================================

/**
 * 文字列をファイル名として安全な形式にサニタイズする。
 * Windows / macOS / Linux のファイルシステム制約を網羅的にカバー。
 *
 * 対処する問題:
 *   - ファイル名に使えない文字 (\ / : * ? " < > |)
 *   - 制御文字 (ASCII 0-31)
 *   - Windows 予約語 (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
 *   - 末尾のピリオド・スペース (Windows で許可されない)
 *   - サニタイズ後に空文字列になった場合のフォールバック
 *
 * @param {string} name - サニタイズ対象の文字列
 * @param {string} [fallback='moodle-files'] - サニタイズ後に空になった場合のフォールバック名
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

    // 空文字列になった場合
    if (!sanitized) return fallback;

    return sanitized;
}

// =============================================================================
// モジュール/ファイル ユーティリティ (F1 全展開用)
// =============================================================================

/**
 * Moodle API の fileurl を Cookie 認証で使えるURLに変換する。
 * /webservice/pluginfile.php/ → /pluginfile.php/ に置換し、token パラメータを除去。
 */
function convertFileUrl(fileurl) {
    if (!fileurl) return '';
    let url = fileurl.replace('/webservice/pluginfile.php/', '/pluginfile.php/');
    try {
        const urlObj = new URL(url);
        urlObj.searchParams.delete('token');
        url = urlObj.toString();
    } catch (e) { /* そのまま返す */ }
    return url;
}

/**
 * モジュールからダウンロード可能なファイルURLを取得する。
 * contents が空 / 未定義の場合は null を返す。
 */
function getModuleFileUrl(module) {
    if (!module.contents || module.contents.length === 0) return null;
    const content = module.contents[0];
    if (!content.fileurl) return null;
    
    // PDFの場合は強制ダウンロードパラメータを付与
    const url = convertFileUrl(content.fileurl);
    if (url.toLowerCase().includes('.pdf')) {
        try {
            const urlObj = new URL(url);
            urlObj.searchParams.set('forcedownload', '1');
            return urlObj.toString();
        } catch (e) {
            return url;
        }
    }
    return url;
}
