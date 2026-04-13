// moodle-enhancer/background.js

/**
 * Moodleからのダウンロードを検知し、授業名でフォルダ分けするリスナー。
 * 
 * content.jsで保存されたコース名を使用し、以下の構造で保存する:
 *   Moodle/[授業名]/[元のファイル名]
 * 
 * Moodle以外のサイトからのダウンロードには影響しない。
 */
chrome.downloads.onDeterminingFilename.addListener(function(downloadItem, suggest) {
  // Moodleドメインからのダウンロードかチェック
  const moodleUrlPattern = "https://lms.ritsumei.ac.jp/";

  // referrer または URL でMoodleからのダウンロードか判定
  const isFromMoodle = 
    (downloadItem.referrer && downloadItem.referrer.startsWith(moodleUrlPattern)) ||
    (downloadItem.url && downloadItem.url.startsWith(moodleUrlPattern));

  if (!isFromMoodle) {
    // Moodleからのダウンロードではないため、何もしない
    return;
  }

  // content.jsから保存された授業名を使用してファイルパスを生成
  chrome.storage.local.get(['currentCourseName'], function(result) {
    let courseName = result.currentCourseName || "moodle-files";

    // ファイル名として不適切な文字を置換する
    const sanitizedCourseName = courseName.replace(/[\\/:*?"<>|]/g, '－');
    const originalFilename = downloadItem.filename;

    // 新しいファイルパスを構築する (Moodle/[授業名]/[元のファイル名])
    const newFilename = `Moodle/${sanitizedCourseName}/${originalFilename}`;

    console.log("Moodle Enhancer: Suggesting new filename:", newFilename);

    suggest({
      filename: newFilename,
      conflictAction: 'uniquify' // ファイル名が競合した場合、(1), (2)のように連番を付ける
    });
  });

  return true; // 非同期処理のためtrueを返す
});