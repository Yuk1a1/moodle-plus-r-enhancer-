// moodle-enhancer/content.js
// メイン Content Script — コース名のキャッシュ保存 & background.js からの問い合わせ応答
// 前提: src/lib/moodle-api.js がグローバルスコープに先に読み込まれていること

/**
 * @fileoverview
 * Moodle ページ読み込み時にコースIDとコース名を取得し、
 * chrome.storage.local にキャッシュとして保存する。
 *
 * また、background.js (Service Worker) からのメッセージに応答し、
 * コースIDの問い合わせやコース名の解決を仲介する。
 *
 * 共通ロジック (sesskey取得, API呼び出し, コース名クリーニング) は
 * src/lib/moodle-api.js に定義されている。
 */

// =============================================================================
// コース名のキャッシュ保存
// =============================================================================

/**
 * 現在のページからコース名を取得し、chrome.storage にコースID別で保存する。
 * コースIDをキーとした辞書形式で保存することで、
 * 複数コースを同時に開いても正しいコース名を参照できる。
 */
async function saveCourseName() {
    const courseId = getCourseIdFromBody();
    if (!courseId || courseId === '1') {
        log('コースページではありません。');
        return;
    }

    const courseName = await fetchCourseName(courseId);
    if (!courseName) {
        log('コース名が見つかりませんでした。');
        return;
    }

    // コースIDをキーとした辞書で保存（既存のマッピングとマージ）
    const result = await chrome.storage.local.get(['courseNames']);
    const courseNames = result.courseNames || {};
    courseNames[courseId] = courseName;
    await chrome.storage.local.set({ courseNames });
    log('コース名を保存:', courseId, '→', courseName);
}

// =============================================================================
// background.js からのメッセージ応答
// =============================================================================

/**
 * background.js からのメッセージを受け取り応答するリスナー。
 *
 * 対応メッセージ:
 *   - GET_COURSE_ID: 現在のページの body クラスからコースIDを返す
 *   - RESOLVE_COURSE_NAME: 指定されたコースIDのコース名をAPI経由で取得して返す
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_COURSE_ID') {
        sendResponse({ courseId: getCourseIdFromBody() });
        return false; // 同期応答
    }

    if (message.type === 'RESOLVE_COURSE_NAME') {
        fetchCourseName(message.courseId)
            .then(name => sendResponse({ name }))
            .catch(() => sendResponse({ name: null }));
        return true; // 非同期応答のため true を返す
    }
});

// =============================================================================
// 初期化
// =============================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', saveCourseName);
} else {
    saveCourseName();
}