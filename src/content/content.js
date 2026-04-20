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
// クリック時のコースコンテキストトラッキング（自動ダウンロード用のフォールバック）
// =============================================================================

/**
 * ユーザーがリンクをクリックした瞬間、それがどのコースに属しているかを判定し保存する。
 * これにより、/course/section.php のようなコースIDを持たないURLや、ダッシュボードから
 * 直接PDF等へ遷移した場合でも、バックグラウンドスクリプトが元のコースを特定できる。
 */
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    let courseId = null;

    // 1. もし自分のリンクがコースそのものを指しているなら（ダッシュボードの時間割カードなど）
    try {
        const url = new URL(link.href);
        if (url.pathname.includes('/course/view.php')) {
            courseId = url.searchParams.get('id');
        }
    } catch(err) {}

    // 2. もしダッシュボードからのクリックなら、親要素（時間割セルやリスト）からコースへのリンクを探す
    if (!courseId) {
        const container = link.closest('.me-timetable-card, .list-group-item, .event, .card, .block, tr');
        if (container) {
            const courseLink = container.querySelector('a[href*="/course/view.php?id="]');
            if (courseLink) {
                try {
                    courseId = new URL(courseLink.href).searchParams.get('id');
                } catch(err) {}
            }
        }
    }

    // 3. それでも分からなければ、現在開いているページ自体のBodyからコースIDを取得（section.php などの場合）
    if (!courseId) {
        courseId = getCourseIdFromBody();
    }

    // キャッシュ保存
    if (courseId && courseId !== '1') {
        chrome.storage.local.set({ 
            lastClickedCourseId: courseId,
            lastClickedCourseTime: Date.now()
        });
        log('クリックコンテキストとしてコースを保存:', courseId);
    }
}, true); // キャプチャフェーズで確実に処理

// =============================================================================
// 初期化
// =============================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', saveCourseName);
} else {
    saveCourseName();
}