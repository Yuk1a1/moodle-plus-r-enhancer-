// moodle-enhancer/content.js
console.log("Moodle Enhancer: content.js is running.");

/**
 * ページコンテキストの M.cfg から sesskey を取得する。
 * content script は isolated world で実行されるため、
 * script タグを注入して M.cfg にアクセスする必要がある。
 * @returns {string|null} sesskey
 */
function getSesskey() {
    // 方法1: スクリプト注入で M.cfg.sesskey を取得
    try {
        const script = document.createElement('script');
        script.textContent = 'document.body.dataset.moodleSesskey = M.cfg.sesskey;';
        document.head.appendChild(script);
        script.remove();
        const sesskey = document.body.dataset.moodleSesskey;
        if (sesskey) return sesskey;
    } catch (e) {
        console.warn("Moodle Enhancer: スクリプト注入によるsesskey取得失敗:", e);
    }

    // 方法2: ログアウトリンクから取得
    const logoutLink = document.querySelector('a[href*="logout.php?sesskey="]');
    if (logoutLink) {
        const url = new URL(logoutLink.href);
        const sesskey = url.searchParams.get('sesskey');
        if (sesskey) return sesskey;
    }

    // 方法3: hidden input から取得
    const hiddenInput = document.querySelector('input[name="sesskey"]');
    if (hiddenInput) return hiddenInput.value;

    return null;
}

/**
 * body クラスからコースIDを取得する。
 * @returns {string|null} コースID
 */
function getCourseIdFromBody() {
    const match = document.body.className.match(/course-(\d+)/);
    return match ? match[1] : null;
}

/**
 * Moodle AJAX API でコースのフルネームを取得する。
 * @param {string} courseId - コースID
 * @param {string} sesskey - セッションキー
 * @returns {Promise<string|null>} コースフルネーム
 */
async function fetchCourseFullName(courseId, sesskey) {
    try {
        const response = await fetch(
            `/lib/ajax/service.php?sesskey=${sesskey}&info=core_course_get_courses_by_field`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([{
                    index: 0,
                    methodname: 'core_course_get_courses_by_field',
                    args: { field: 'id', value: courseId }
                }])
            }
        );
        const data = await response.json();
        const courses = data[0]?.data?.courses;
        if (courses && courses.length > 0) {
            return courses[0].fullname;
        }
    } catch (error) {
        console.error("Moodle Enhancer: API呼び出しエラー:", error);
    }
    return null;
}

/**
 * コースフルネームから授業名を抽出する。
 * 例: "52335:企業倫理論(BA)" → "企業倫理論(BA)"
 * 例: "52151:経営組織論(BA) § 52152:別科目" → "経営組織論(BA)"
 * @param {string} fullname - コースフルネーム
 * @returns {string} 抽出された授業名
 */
function extractCourseName(fullname) {
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
 * 現在のページからコース名を取得し、chrome.storage にコースID別で保存する。
 * コースIDをキーとした辞書形式で保存することで、
 * 複数コースを同時に開いても正しいコース名を参照できる。
 */
async function saveCourseName() {
    const courseId = getCourseIdFromBody();
    if (!courseId || courseId === '1') {
        console.log("Moodle Enhancer: コースページではありません。");
        return;
    }

    const sesskey = getSesskey();
    if (!sesskey) {
        console.warn("Moodle Enhancer: sesskeyが取得できませんでした。");
        return;
    }

    // API でコースフルネームを取得
    let courseName = null;
    const fullname = await fetchCourseFullName(courseId, sesskey);
    if (fullname) {
        courseName = extractCourseName(fullname);
        console.log("Moodle Enhancer: APIからコース名取得:", fullname, "→", courseName);
    }

    // フォールバック: コースページ(/course/view.php)の場合のみ h1 を使用
    if (!courseName && window.location.pathname.startsWith('/course/view.php')) {
        const h1 = document.querySelector('.page-header-headings h1');
        if (h1) {
            courseName = extractCourseName(h1.textContent.trim());
            console.log("Moodle Enhancer: h1からコース名取得:", courseName);
        }
    }

    if (!courseName) {
        console.log("Moodle Enhancer: コース名が見つかりませんでした。");
        return;
    }

    // コースIDをキーとした辞書で保存（既存のマッピングとマージ）
    chrome.storage.local.get(["courseNames"], function (result) {
        const courseNames = result.courseNames || {};
        courseNames[courseId] = courseName;
        chrome.storage.local.set({ courseNames: courseNames });
        console.log("Moodle Enhancer: コース名を保存:", courseId, "→", courseName);
    });
}

// ページ読み込み時に実行
window.addEventListener('load', saveCourseName);