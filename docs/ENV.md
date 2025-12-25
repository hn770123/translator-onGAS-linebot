# 環境変数設定ガイド

このドキュメントでは、LINE翻訳Botの環境変数（スクリプトプロパティ）の設定方法を説明します。

## 必要な環境変数

以下の4つの環境変数を設定する必要があります：

| 変数名 | 説明 | 取得方法 |
|--------|------|----------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEメッセージング用のアクセストークン | LINE Developers Console |
| `LINE_CHANNEL_SECRET` | LINE署名検証用のシークレット | LINE Developers Console |
| `GEMINI_API_KEY` | Gemini API呼び出し用のAPIキー | Google AI Studio |
| `SPREADSHEET_ID` | 翻訳ログ保存用のスプレッドシートID | Googleスプレッドシート |

## 設定手順

### 1. LINE Messaging APIの設定

#### 1.1 LINE Developersコンソールにアクセス
1. [LINE Developers Console](https://developers.line.biz/console/)にログイン
2. 「Create a new provider」をクリック（初回のみ）
3. プロバイダー名を入力

#### 1.2 Messaging APIチャネルの作成
1. 「Create a new channel」をクリック
2. 「Messaging API」を選択
3. 必要事項を入力：
   - Channel name: `LINE翻訳Bot`（任意）
   - Channel description: `文脈を考慮する翻訳Bot`
   - Category: `News`など適切なカテゴリを選択
   - Subcategory: 適切なサブカテゴリを選択

#### 1.3 Channel SecretとChannel Access Tokenの取得
1. 作成したチャネルの「Basic settings」タブを開く
2. **Channel Secret**をコピー → `LINE_CHANNEL_SECRET`に設定
3. 「Messaging API」タブを開く
4. 「Channel access token」セクションで「Issue」ボタンをクリック
5. 生成された**Channel access token**をコピー → `LINE_CHANNEL_ACCESS_TOKEN`に設定

### 2. Gemini API Keyの取得

1. [Google AI Studio](https://aistudio.google.com/)にアクセス
2. 「Get API key」をクリック
3. 「Create API key」を選択
4. 既存のGoogle Cloudプロジェクトを選択、または新規作成
5. 生成された**API key**をコピー → `GEMINI_API_KEY`に設定

### 3. Googleスプレッドシートの作成

1. [Google Sheets](https://sheets.google.com/)で新しいスプレッドシートを作成
2. 名前を「LINE翻訳Bot ログ」など適切な名前に変更
3. URLから**スプレッドシートID**を取得
   - URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
   - `SPREADSHEET_ID`の部分をコピー → `SPREADSHEET_ID`に設定

### 4. Google Apps Scriptでスクリプトプロパティを設定

1. Google Apps Scriptエディタを開く
2. 左側のメニューから「プロジェクトの設定」（⚙️アイコン）をクリック
3. 「スクリプトプロパティ」セクションまでスクロール
4. 「スクリプトプロパティを追加」をクリック
5. 以下の4つのプロパティを追加：

```
プロパティ: LINE_CHANNEL_ACCESS_TOKEN
値: [LINE Developers Consoleから取得したChannel Access Token]

プロパティ: LINE_CHANNEL_SECRET
値: [LINE Developers Consoleから取得したChannel Secret]

プロパティ: GEMINI_API_KEY
値: [Google AI Studioから取得したAPI Key]

プロパティ: SPREADSHEET_ID
値: [GoogleスプレッドシートのID]
```

6. 「スクリプトプロパティを保存」をクリック

## 設定の確認

設定が正しく完了したか確認するには、Apps Scriptエディタで以下のコードを実行します：

```javascript
function testConfiguration() {
  const properties = PropertiesService.getScriptProperties();

  const required = [
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET',
    'GEMINI_API_KEY',
    'SPREADSHEET_ID'
  ];

  required.forEach(key => {
    const value = properties.getProperty(key);
    if (value) {
      Logger.log(`✓ ${key}: 設定済み`);
    } else {
      Logger.log(`✗ ${key}: 未設定`);
    }
  });
}
```

実行後、「実行ログ」を確認し、すべての項目に✓が付いていることを確認してください。

## セキュリティに関する注意事項

1. **APIキーやトークンは絶対に公開しないでください**
   - GitHubなどのリポジトリにコミットしない
   - スクリーンショットに含めない
   - 他人と共有しない

2. **スクリプトプロパティの利点**
   - コードに直接記述する必要がない
   - Gitリポジトリに含まれない
   - Google Apps Script環境で安全に管理される

3. **定期的な見直し**
   - 不要になったトークンは削除
   - 定期的にトークンを再生成（推奨）

## トラブルシューティング

### 「LINE署名検証に失敗する」
- `LINE_CHANNEL_SECRET`が正しく設定されているか確認
- 余分なスペースや改行が含まれていないか確認

### 「LINEへの送信に失敗する」
- `LINE_CHANNEL_ACCESS_TOKEN`が正しく設定されているか確認
- トークンの有効期限が切れていないか確認

### 「Gemini APIエラー」
- `GEMINI_API_KEY`が正しく設定されているか確認
- Gemini APIの利用上限に達していないか確認
- Google Cloudプロジェクトで課金が有効になっているか確認

### 「スプレッドシートへの書き込みに失敗する」
- `SPREADSHEET_ID`が正しいか確認
- スプレッドシートの共有設定でApps Scriptからのアクセスが許可されているか確認

## 次のステップ

環境変数の設定が完了したら、[DEPLOYMENT.md](DEPLOYMENT.md)を参照してデプロイを行ってください。
