# Moodle Enhancer for Ritsumeikan

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/Yuk1a1/-manaba-plus-r-enhancer)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

立命館大学の Moodle LMS (`lms.ritsumei.ac.jp`) のユーザー体験を改善する Chrome 拡張機能です。

## ✨ 機能

### 📁 ダウンロードファイルの自動フォルダ分け

Moodle からダウンロードしたファイルを、自動的に授業ごとのフォルダに整理します。

```
📂 Moodle/
├── 📂 企業倫理論(BA)/
│   ├── 第1回講義資料.pdf
│   └── 第2回講義資料.pdf
├── 📂 経営組織論(BA)/
│   └── レポート課題.pdf
└── 📂 経営情報論(BA)/
    └── 参考資料.pdf
```

**仕組み**:
- Moodle のページ読み込み時に、Moodle AJAX API (`core_course_get_courses_by_field`) でコース名を自動取得
- ファイルダウンロード時に、referrer URL やタブ情報からコースIDを特定
- `Moodle/[授業名]/[元のファイル名]` 形式で自動保存

## 🚀 インストール方法

### 1. 拡張機能をダウンロード

```bash
# Git を使う場合
git clone https://github.com/Yuk1a1/-manaba-plus-r-enhancer.git

# または、GitHub から ZIP をダウンロード
# 「Code」ボタン → 「Download ZIP」→ 解凍
```

### 2. Chrome に拡張機能を読み込む

1. Chrome を開き、`chrome://extensions/` にアクセス
2. 右上の「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. ダウンロードした/解凍したフォルダを選択

インストール後、Moodle (`lms.ritsumei.ac.jp`) にアクセスすると自動的に動作を開始します。

## 🏗️ プロジェクト構成

```
src/
├── background/
│   └── background.js        # Service Worker — ダウンロードのフォルダ分け制御
├── content/
│   └── content.js           # Content Script — コース名のキャッシュ保存 & メッセージ応答
├── lib/
│   └── moodle-api.js        # 共通ライブラリ — Moodle API 呼び出し・ユーティリティ
└── assets/
    ├── icon48.png
    └── icon128.png
```

## 🛠️ 技術スタック

- JavaScript (ES6+)
- Chrome Extensions Manifest V3
- Moodle AJAX Web Services API

## 📚 ドキュメント

- [GEMINI.md](./GEMINI.md) — 開発者向け技術ドキュメント
- [docs/architecture.md](./docs/architecture.md) — アーキテクチャ概要
- [docs/moodle_api_guide.md](./docs/moodle_api_guide.md) — Moodle API ガイド
- [docs/phase2_requirements.md](./docs/phase2_requirements.md) — Phase 2 要件定義

## 🗺️ ロードマップ

- [x] **Phase 1**: ダウンロードファイルの自動フォルダ分け
- [ ] **Phase 2**: Moodle UX 改善
  - [ ] コースコンテンツのインライン展開
  - [ ] PDF 強制ダウンロード化
  - [ ] 時間割のコンパクト表示

## 📝 変更履歴

### v1.0.0 (2026-04)

- ✨ Moodle 対応版として再構築
- 📁 Moodle AJAX API を使ったダウンロードファイルの自動フォルダ分け
- 🏗️ `src/` ディレクトリ構成にリファクタリング
- 📚 Moodle API ガイド・アーキテクチャドキュメント追加

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。

## 👤 作者

- GitHub: [@Yuk1a1](https://github.com/Yuk1a1)

---

⭐ 気に入ったらスターをお願いします！
