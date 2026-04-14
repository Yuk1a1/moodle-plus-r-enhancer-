// moodle-enhancer/background.js

/**
 * Moodleからのダウンロードを検知し、授業名でフォルダ分けするリスナー。
 *
 * ダウンロードURLまたはreferrer URLからコースIDを特定し、
 * content.jsで蓄積されたコースID→コース名マッピングから正しい授業名を取得する。
 * マッピングに存在しない場合は、Moodle Web Service APIを使って解決を試みる。
 *
 * 保存構造: Moodle/[授業名]/[元のファイル名]
 *
 * 重要: onDeterminingFilename リスナーでは、すべてのコードパスで
 * suggest() を呼び出す必要がある。呼び出さないとダウンロードがハングする。
 */

/**
 * URLからMoodleのコースIDを抽出する。
 * 対応パターン:
 *   - /course/view.php?id=XXXXX
 *   - /mod/resource/view.php?id=XXXXX (→ cmid なので直接使えないが referrer に course id がある場合)
 *   - /pluginfile.php/XXXXX/... (最初の数値はコンテキストID、コースIDではない)
 *   - /course/section.php?id=XXXXX
 * @param {string} url - 解析するURL
 * @returns {string|null} コースID
 */
function extractCourseIdFromUrl(url) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);

    // /course/view.php?id=XXXXX → コースID直接
    // 注意: /course/section.php?id=XXXXX の id はセクションIDでありコースIDではない
    if (urlObj.pathname === "/course/view.php") {
      return urlObj.searchParams.get("id");
    }

    // URLのパスに course-XXXXX パターンがある場合（稀だが対応）
    // referrer URLから /course/view.php?id= パターンを探す
    if (urlObj.pathname.startsWith("/course/")) {
      const id = urlObj.searchParams.get("id");
      if (id) return id;
    }
  } catch (e) {
    // URL解析失敗
  }
  return null;
}

/**
 * ダウンロードURLからコンテキストIDを抽出し、
 * Moodle Web Service APIでコースIDを解決する。
 * pluginfile.php/[contextId]/... のパターンに対応。
 * @param {string} url - ダウンロードURL
 * @returns {Promise<string|null>} コースID
 */
async function resolveContextIdToCourseId(url) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // /pluginfile.php/123456/mod_resource/content/1/file.pdf
    const pluginfileMatch = urlObj.pathname.match(
      /\/pluginfile\.php\/(\d+)\//
    );
    if (!pluginfileMatch) return null;

    const contextId = pluginfileMatch[1];

    // コンテキストIDからコースIDへの変換は Web Service API が必要だが、
    // background.js からは cookie ベースの認証が使えるので fetch で直接呼べる
    // ただし sesskey が必要なので、content.js から渡してもらう必要がある
    // → 代わりに、pluginfile URL のパス構造からコース情報を推測する

    // pluginfile のコンテキストIDをキャッシュとして使い、
    // content.js が構築したマッピングから探す
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * referrer URLのタブからコースIDを取得する。
 * タブのURLを直接パースしてコースIDを特定する。
 * また、mod/xxx/view.php ページの場合は、そのタブの content.js が
 * すでにコースIDをbodyクラスから抽出して保存しているはずなので、
 * タブにスクリプトを注入してコースIDを取得する。
 * @param {string} referrerUrl - referrer URL
 * @returns {Promise<string|null>} コースID
 */
async function getCourseIdFromTab(referrerUrl) {
  if (!referrerUrl) return null;

  try {
    // referrer URLがコースページの場合、直接IDを抽出
    const directId = extractCourseIdFromUrl(referrerUrl);
    if (directId) return directId;

    // referrer URLが mod/xxx/view.php の場合、
    // そのタブを見つけてコースIDを問い合わせる
    const tabs = await chrome.tabs.query({
      url: "https://lms.ritsumei.ac.jp/*",
    });

    for (const tab of tabs) {
      if (tab.url === referrerUrl || tab.url.startsWith(referrerUrl)) {
        try {
          // タブ内でbodyクラスからコースIDを取得
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const match = document.body.className.match(/course-(\d+)/);
              return match ? match[1] : null;
            },
          });
          if (results && results[0] && results[0].result) {
            return results[0].result;
          }
        } catch (e) {
          console.warn(
            "Moodle Enhancer: タブへのスクリプト注入失敗:",
            e
          );
        }
      }
    }
  } catch (e) {
    console.warn("Moodle Enhancer: タブからのコースID取得失敗:", e);
  }
  return null;
}

/**
 * コースIDからコース名を解決する。
 * 1. chrome.storage のキャッシュを確認
 * 2. キャッシュにない場合、Moodleのタブを使ってAPIで取得
 * @param {string} courseId - コースID
 * @returns {Promise<string>} コース名（取得失敗時は "moodle-files"）
 */
async function resolveCourseName(courseId) {
  if (!courseId || courseId === "1") return "moodle-files";

  // 1. キャッシュ確認
  const result = await chrome.storage.local.get(["courseNames"]);
  const courseNames = result.courseNames || {};
  if (courseNames[courseId]) {
    console.log(
      "Moodle Enhancer: キャッシュからコース名取得:",
      courseId,
      "→",
      courseNames[courseId]
    );
    return courseNames[courseId];
  }

  // 2. Moodle のタブを見つけて API 呼び出しを委任
  try {
    const tabs = await chrome.tabs.query({
      url: "https://lms.ritsumei.ac.jp/*",
    });
    if (tabs.length > 0) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: async (cId) => {
          // sesskey を取得
          let sesskey = null;
          try {
            sesskey = M.cfg.sesskey;
          } catch (e) {
            /* ignore */
          }
          if (!sesskey) {
            const link = document.querySelector(
              'a[href*="logout.php?sesskey="]'
            );
            if (link) sesskey = new URL(link.href).searchParams.get("sesskey");
          }
          if (!sesskey) return null;

          // API呼び出し
          try {
            const resp = await fetch(
              `/lib/ajax/service.php?sesskey=${sesskey}&info=core_course_get_courses_by_field`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([
                  {
                    index: 0,
                    methodname: "core_course_get_courses_by_field",
                    args: { field: "id", value: cId },
                  },
                ]),
              }
            );
            const data = await resp.json();
            const courses = data[0]?.data?.courses;
            if (courses && courses.length > 0) {
              return courses[0].fullname;
            }
          } catch (err) {
            return null;
          }
          return null;
        },
        args: [courseId],
      });

      if (results && results[0] && results[0].result) {
        const fullname = results[0].result;
        let name = fullname;

        // § で区切られている場合、最初のコース名を使用
        const sectionIndex = name.indexOf("§");
        if (sectionIndex !== -1) {
          name = name.substring(0, sectionIndex).trim();
        }
        // コース番号を削除
        name = name.replace(/^\d+:/, "").trim();

        // キャッシュに保存
        courseNames[courseId] = name;
        await chrome.storage.local.set({ courseNames: courseNames });
        console.log(
          "Moodle Enhancer: APIからコース名を取得してキャッシュ:",
          courseId,
          "→",
          name
        );
        return name;
      }
    }
  } catch (e) {
    console.warn("Moodle Enhancer: APIによるコース名解決失敗:", e);
  }

  return "moodle-files";
}

chrome.downloads.onDeterminingFilename.addListener(function (
  downloadItem,
  suggest
) {
  const moodleUrlPattern = "https://lms.ritsumei.ac.jp/";

  // referrer または URL で Moodle からのダウンロードか判定
  const isFromMoodle =
    (downloadItem.referrer &&
      downloadItem.referrer.startsWith(moodleUrlPattern)) ||
    (downloadItem.url && downloadItem.url.startsWith(moodleUrlPattern));

  if (!isFromMoodle) {
    // Moodle 以外 → デフォルトのファイル名をそのまま使用
    suggest({ filename: downloadItem.filename });
    return;
  }

  // コースIDの特定を試みる（複数の方法を順番に試行）
  (async () => {
    try {
      let courseId = null;

      // 1. referrer URLからコースIDを直接抽出
      courseId = extractCourseIdFromUrl(downloadItem.referrer);

      // 2. referrer のタブからbodyクラス経由でコースIDを取得
      if (!courseId) {
        courseId = await getCourseIdFromTab(downloadItem.referrer);
      }

      // 3. ダウンロードURLからコースIDを抽出（あまり期待できないが試行）
      if (!courseId) {
        courseId = extractCourseIdFromUrl(downloadItem.url);
      }

      // コースIDからコース名を解決
      const courseName = await resolveCourseName(courseId);

      // ファイル名として不適切な文字を置換する
      const sanitizedCourseName = courseName.replace(
        /[\\/:*?"<>|]/g,
        "－"
      );

      const originalFilename = downloadItem.filename;

      // 新しいファイルパスを構築する (Moodle/[授業名]/[元のファイル名])
      const newFilename = `Moodle/${sanitizedCourseName}/${originalFilename}`;

      console.log("Moodle Enhancer: Suggesting new filename:", newFilename);

      suggest({
        filename: newFilename,
        conflictAction: "uniquify",
      });
    } catch (error) {
      console.error("Moodle Enhancer: Error in filename suggestion:", error);
      // エラー時はデフォルトのファイル名を使用
      suggest({ filename: downloadItem.filename });
    }
  })();

  return true; // 非同期処理のため true を返す
});