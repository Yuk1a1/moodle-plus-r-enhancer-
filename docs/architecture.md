# Moodle Enhancer 開発アーキテクチャ

このドキュメントでは、本プロジェクト（Moodle Enhancer for Ritsumeikan）のディレクトリ構成や、開発の進め方について定着させます。

## 1. ディレクトリ構成

保守性の高いアプリ開発のスタンダードに則り、コードを役割ごとに `src` ディレクトリ内で分割しています。

```
-manaba-plus-r-enhancer/ (または moodle-enhancer-for-ritsumeikan/)
│
├── src/                      # アプリケーションの全ソースコード
│   ├── background/           # Service Worker (バックグラウンド処理)
│   │   └── background.js     # ダウンロードインターセプト等のコアロジック
│   │
│   ├── content/              # Content Scripts (ページに注入される処理)
│   │   ├── content.js        # DOM操作や sesskey の取得
│   │   └── style.css         # (将来) カスタムUI用のスタイルシート
│   │
│   ├── lib/                  # 共通ユーティリティやAPI通信モジュール
│   │   └── moodle-api.js     # (作成予定) API呼び出しを抽象化するクラス/関数群
│   │
│   └── assets/               # 画像等の静的リソース
│       ├── icon48.png
│       └── icon128.png
│
├── docs/                     # 開発知識を永続化するドキュメントフォルダ
│   ├── moodle_api_guide.md
│   └── architecture.md       (本ファイル)
│
├── manifest.json             # Chrome拡張機能の定義ファイル
├── GEMINI.md                 # Antigravity等 AIへのコンテキスト用ファイル
└── README.md                 # 公開用のシステム概要
```

## 2. 開発ワークフロー（思想）

今後の機能追加（Phase 2: ダッシュボード機能など）における基本的な開発の進め方です。

1.  **API 主導アプローチ**: 可能な限りHTML要素からのスクレイピングを避け、`lib/moodle-api.js` 等でAPIリクエストを抽象化し、構造化されたデータ（JSON）をもとにUIを構築します。
2.  **モジュール化**: `background.js` にすべてを詰め込まず、複雑なダウンロード先解決ロジックやAPI呼び出し処理は `lib/` 内部に定義したものをインポート（※MV3の `import` 等）する形へ移行させていきます。
3.  **UI コンポーネント**: ダッシュボードの課題一覧UIなどをDOMに挿入する場合、`src/content/` 以下に機能単位でファイルを分割することを検討します。

## 3. 次のステップ

*   **APIモジュールの切り出し**: `background.js` および `content.js` の中で独立している `fetchCourseFullName` や `resolveCourseName` などの Moodle API とやり取りするコードを、`src/lib/moodle-api.js` として分離し共有可能にします。
*   **ダッシュボード拡張の着手**: `core_calendar_get_action_events_by_timesort` API を使用して、未提出課題のカレンダーUIを Moodle のダッシュボード画面にマウントする開発に入ります。
