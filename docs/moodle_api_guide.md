# Moodle Web Service API ガイド

Moodle には、内部の様々なデータ（コース一覧、カレンダー、課題など）をJSON形式で取得できる強力な AJAX 対応の Web Service API が存在します。
このガイドでは、Chrome拡張機能からこのAPIをどのように活用し、開発の幅を広げるかについて解説します。

## 1. Moodle API の特徴とメリット

MoodleのAPIは `lib/ajax/service.php` エンドポイントを介して呼び出されます。

*   **DOMスクレイピングからの脱却**: 画面上の `div` や `h1` を探す必要がなくなり、MoodleのテーマやUIが変更されても拡張機能が壊れません。
*   **非公開データの取得**: 画面には「○月○日」としか書いていない締切日も、API経由なら正確な UNIX タイムスタンプで取得できるため、ソートやGoogleカレンダー連携が容易になります。
*   **他ページのデータ取得**: 「ダッシュボード」にいながら、各授業の詳細な課題一覧を裏側でフェッチすることができます。

## 2. API 呼び出しの基本構造

APIを呼び出すには、Moodle にログインしているユーザーの **`sesskey` (セッションキー)** が必要です。

```javascript
// 1. sesskey の取得 (例: ログアウトリンクなどから)
const sesskey = "YOUR_SESSKEY_HERE";

// 2. Fetch API による POST リクエスト
const response = await fetch(
    `/lib/ajax/service.php?sesskey=${sesskey}&info=api_function_name`,
    {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{
            index: 0,
            methodname: 'API_FUNCTION_NAME', // 呼び出したい機能名
            args: { 
                // 関数が必要とする引数
                param1: "value1",
                param2: "value2" 
            }
        }])
    }
);

const data = await response.json();
```

> **注意点**: Chrome拡張の Content Script から `fetch` を呼ぶ場合、相対パス (`/lib/ajax/...`) は `https://lms.ritsumei.ac.jp` に向けて送信されるため、Moodle の Cookie（セッション情報）が自動的に付与されます。

## 3. 実用的な API エンドポイント一覧

### `core_course_get_courses_by_field`
*   **用途**: コースIDから正式なコース名や詳細を取得。
*   **引数**: `field` (例: 'id'), `value` (コースID)

### `core_calendar_get_action_events_by_timesort`
*   **用途**: 直近のイベント（課題の締切や小テストなど）を時系列で取得。ダッシュボードの「未提出課題一覧」作成に必須。
*   **引数**: `limitnum` (取得件数), `timesortfrom` (Unixタイムスタンプ)

### `core_course_get_contents`
*   **用途**: あるコース内のセクションや、モジュール（アップロードされたファイルごとの詳細）を取得。
*   **引数**: `courseid` (コースID)

### `mod_assign_get_assignments` / `mod_assign_get_submissions`
*   **用途**: コース内の特定の「課題」の詳細と、現在のユーザーの「提出状況」を取得。

## 4. セキュリティと権限に関する注意

*   通常、Moodle外部のシステム（スマホアプリ等）からアクセスする場合は「Web Service Token」を発行する必要があります。
*   しかし、Chrome拡張機能（Content Script内）では、ブラウザのCookieと `sesskey` を利用する**内部AJAX方式**をそのまま流用できるため、Tokenの発行というユーザーの手間を省くことができます。
