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

## 3. 実用的な API エンドポイント一覧と活用アイデア

ここでは、学生向けポータル（Phase 2以降）の開発で強力な武器となるMoodle Core Web Services APIをいくつか紹介します。

### 3.1. ダッシュボード・授業管理機能向け
*   **`core_course_get_enrolled_courses_by_timeline_classification`**
    *   **用途**: 現在履修中のコース（過去・現在・未来）を一括取得。
    *   **取得できるデータ**: コースID、フルネーム、コースのカバー画像URL、進捗率など。
    *   **アイデア**: Moodle標準の重いダッシュボードの代わりに、サイドバーなどに軽量な「My時間割リスト」を自作できます。

*   **`core_course_get_courses_by_field`**
    *   **用途**: コースIDから正式なコース名や詳細なシラバス情報を取得。（現在のファイル振り分けで使用中）
    *   **引数**: `field` (例: 'id'), `value` (コースID)

### 3.2. 課題・スケジュール管理向け（カレンダー連携）
*   **`core_calendar_get_action_events_by_timesort`**
    *   **用途**: 直近のイベント（課題の締切、小テストの期限など）を時系列で取得。ダッシュボードの「未提出課題一覧」作成に必須。
    *   **引数**: `limitnum` (取得件数), `timesortfrom` (Unixタイムスタンプ = 現在時刻から)
    *   **アイデア**: 拡張機能のポップアップを開くだけで、あと何日で何を出さなければいけないかが一覧できる「締切リスト」が作れます。Google Calendar等へのエクスポート機能の元データにも最適です。

*   **`mod_assign_get_assignments` / `mod_assign_get_submissions`**
    *   **用途**: 特定のコースの「課題」の詳細設定（ワード数制限など）と、現在のユーザーの「提出状況（提出済みか、未提出か、採点済みか）」を正確に取得。
    *   **アイデア**: 提出済みの課題を未提出リストから非表示にするロジックに利用します。

*   **`mod_quiz_get_user_attempts` / `mod_quiz_get_quizzes_by_courses`**
    *   **用途**: 課題(Assignment)ではなく、小テスト(Quiz)の期限や解答状況を取得。課題と並んで重要な評価対象をキャッチします。

### 3.3. コンテンツ・成績管理向け
*   **`core_course_get_contents`**
    *   **用途**: あるコース内のセクションや、モジュール（アップロードされたファイルごとの詳細）を取得。
    *   **引数**: `courseid` (コースID)
    *   **アイデア**: 各回の「第X回講義資料」の中身にあるPDFの直リンクを一覧化する拡張機能が作れます。

*   **`gradereport_user_get_grade_items`**
    *   **用途**: 現在履修しているコースの自分の成績（評価）を取得。
    *   **アイデア**: わざわざ個別の評価ページを見に行かなくても、ポータル画面上に最新の成績をオーバーレイ表示させることができます。

### 3.4. その他の拡張アイデア
*   **`core_message_get_messages`**: サイト内のプライベートメッセージや通知を取得。拡張機能のアイコンに赤いバッジ（未読通知数）をつける機能が実現可能です。
*   **`core_webservice_get_site_info`**: 現在ログインしている学生の名前やプロフィール画像URLなどを取得できます。

## 4. セキュリティと権限に関する注意

*   通常、Moodle外部のシステム（スマホアプリ等）からアクセスする場合は「Web Service Token」を発行する必要があります。
*   しかし、Chrome拡張機能（Content Script内）では、ブラウザのCookieと `sesskey` を利用する**内部AJAX方式**をそのまま流用できるため、Tokenの発行というユーザーの手間を省くことができます。
