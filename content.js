// moodle-enhancer/content.js
console.log("Moodle Enhancer: content.js is running.");

/**
 * 現在のページからコース名を取得し、chrome.storage に保存する。
 * Moodleのコースページ（course/view.php, course/section.php）と
 * モジュールページ（mod/resource/view.php 等）の両方に対応。
 */
function saveCourseName() {
    let courseName = null;

    // 方法1: ページヘッダーの h1 から取得（コースページ）
    const h1 = document.querySelector('.page-header-headings h1');
    if (h1) {
        courseName = h1.textContent.trim();
    }

    // 方法2: パンクズリストから取得（モジュールページ等）
    if (!courseName) {
        const breadcrumbs = document.querySelectorAll('.breadcrumb-item a');
        for (const crumb of breadcrumbs) {
            if (crumb.href && crumb.href.includes('/course/view.php')) {
                courseName = crumb.textContent.trim();
                break;
            }
        }
    }

    if (!courseName) {
        console.log("Moodle Enhancer: コース名が見つかりませんでした。");
        return;
    }

    // § で区切られている場合、最初のコース名を使用
    // 例: "52151:経営組織論(BA) § 52152:別科目名" → "52151:経営組織論(BA)"
    const sectionIndex = courseName.indexOf('§');
    if (sectionIndex !== -1) {
        courseName = courseName.substring(0, sectionIndex).trim();
    }

    // コース番号を削除（例: "52151:経営組織論(BA)" → "経営組織論(BA)"）
    courseName = courseName.replace(/^\d+:/, '').trim();

    // コースIDも保存（URLまたはbodyクラスから取得）
    let courseId = null;
    const urlParams = new URLSearchParams(window.location.search);
    courseId = urlParams.get('id');

    // URLにIDがない場合（mod/ページ等）、bodyクラスから取得
    if (!courseId) {
        const bodyClasses = document.body.className;
        const courseIdMatch = bodyClasses.match(/course-(\d+)/);
        if (courseIdMatch) {
            courseId = courseIdMatch[1];
        }
    }

    chrome.storage.local.set({
        currentCourseName: courseName,
        currentCourseId: courseId
    });

    console.log("Moodle Enhancer: コース名を保存:", courseName, "ID:", courseId);
}

// ページ読み込み時に実行
window.addEventListener('load', saveCourseName);