# LINE翻訳Bot（文脈考慮型）

Google Apps ScriptとGemini 2.5 Flash-Liteを使用した、文脈を考慮する高性能な翻訳LINE Bot。

## 特徴

### 🚀 高速・高精度な翻訳
- **Gemini 2.5 Flash-Lite**を使用した高速かつ低コストな翻訳
- 日本語 ↔ 英語 ↔ ポーランド語の双方向翻訳に対応
- 直近2件のユーザー発言を文脈として参照し、代名詞や省略表現を正確に翻訳

### ⚡ 非同期処理アーキテクチャ
- 翻訳処理を実行し、結果を即座に送信
- データ保存は応答完了後に非同期で実行するため、ユーザー体験に影響なし

### 💾 効率的なデータ管理
- **リアルタイム履歴**: スクリプトプロパティ（0.01秒未満で取得）
  - ユーザーID別に直近2件のユーザー発言のみを保存
  - Bot応答は含めず、ユーザー発言のみを記録
- **長期保存**: Googleスプレッドシート（非同期保存）
  - タイムスタンプ、ユーザーID、言語タイプ、元メッセージ、翻訳結果、使用プロンプト、処理時間を記録
  - テスト・デバッグ・分析に使用

### 🧪 充実したテスト・デバッグ機能
- スプレッドシート上でリアルタイムに翻訳結果を確認
- プロンプトと応答を全件保存し、翻訳品質の検証が容易
- テストケースシート、エラー分析シート、統計ダッシュボードを用意

## 技術スタック

- **プラットフォーム**: Google Apps Script
- **翻訳AI**: Gemini 2.5 Flash-Lite
- **メッセージング**: LINE Messaging API（Reply API + Push API）
- **高速履歴管理**: スクリプトプロパティ
- **長期データ保存**: Google スプレッドシート

## 処理フロー

```
1. LINEメッセージ受信
2. スクリプトプロパティから直近2件のユーザー発言を超高速取得
3. 履歴+現在メッセージをGemini 2.5 Flash-Liteに送信して翻訳
4. Reply APIで翻訳結果を送信
5. 非同期でスプレッドシートに全データ（プロンプト含む）を保存
6. スクリプトプロパティに現在のユーザー発言を追加（Bot応答は除外）
```

## セットアップ

### 前提条件
- Googleアカウント
- LINE Developersアカウント
- Gemini API key

### 1. LINE Messaging APIの設定
1. [LINE Developers Console](https://developers.line.biz/console/)にアクセス
2. 新しいプロバイダーとMessaging APIチャネルを作成
3. Channel Secret、Channel Access Tokenを取得

### 2. Gemini API keyの取得
1. [Google AI Studio](https://aistudio.google.com/)にアクセス
2. API keyを作成

### 3. Google Apps Scriptプロジェクトの作成
1. [Google Apps Script](https://script.google.com/)にアクセス
2. 新しいプロジェクトを作成
3. `src/Code.gs`の内容をコピー

### 4. スクリプトプロパティの設定
スクリプトエディタで「プロジェクトの設定」→「スクリプトプロパティ」から以下を設定:

```
LINE_CHANNEL_ACCESS_TOKEN = [LINEのChannel Access Token]
LINE_CHANNEL_SECRET = [LINEのChannel Secret]
GEMINI_API_KEY = [Gemini API Key]
SPREADSHEET_ID = [GoogleスプレッドシートのID]
```

詳細は [ENV.md](docs/ENV.md) を参照してください。

### 5. Googleスプレッドシートの設定
詳細は [SPREADSHEET_SETUP.md](docs/SPREADSHEET_SETUP.md) を参照してください。

### 6. デプロイ
詳細は [DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照してください。

## 使い方

1. LINEでBotを友だち追加
2. メッセージを送信すると自動的に言語を検出して翻訳
3. 過去2件の発言を文脈として考慮した翻訳結果が返信される

### 翻訳例

```
ユーザー: 昨日映画を見たよ
Bot: I watched a movie yesterday.

ユーザー: とても面白かった
Bot: It was very interesting.  (「それ」が「映画」を指すことを文脈から理解)

ユーザー: 友達にも勧めるつもり
Bot: I'm going to recommend it to my friends.  (文脈から「映画」を推測)
```

## テスト

テストケースとデバッグ方法については [TESTING.md](docs/TESTING.md) を参照してください。

## プロジェクト構造

```
translator-onGAS-linebot/
├── src/
│   ├── Code.gs              # メインのGASコード
│   └── appsscript.json      # GASマニフェストファイル
├── docs/
│   ├── ENV.md               # 環境変数設定ガイド
│   ├── SPREADSHEET_SETUP.md # スプレッドシート設定ガイド
│   ├── DEPLOYMENT.md        # デプロイ手順書
│   └── TESTING.md           # テストケースドキュメント
├── .gitignore
├── CLAUDE.md                # Claude Code向けプロジェクト指示
└── README.md
```

## ライセンス

MIT

## 作者

Created with ❤️ using Google Apps Script and Gemini AI
