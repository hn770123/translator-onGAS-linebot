# テストケースドキュメント

このドキュメントでは、LINE翻訳Botのテストケースとデバッグ方法を説明します。

## テストの目的

1. **基本翻訳機能の検証**: 日本語、英語、ポーランド語の翻訳が正しく動作するか
2. **文脈考慮機能の検証**: 過去の発言を参照して正確に翻訳できるか
3. **パフォーマンス検証**: 応答時間が許容範囲内か
4. **エラーハンドリング検証**: エラー発生時に適切に対応できるか

## テスト環境の準備

### 1. テスト用LINEアカウント

複数のテストシナリオを実行するため、2つ以上のLINEアカウントを用意することを推奨します。

### 2. スプレッドシートのテストケースシート

スプレッドシートに「テストケース」シートを作成します（[SPREADSHEET_SETUP.md](SPREADSHEET_SETUP.md)参照）。

### 3. 履歴クリア用関数

テストケース間で履歴をクリアするため、`Code.gs`に以下の関数が実装されています：

```javascript
// 特定ユーザーの履歴をクリア
function clearUserHistory(userId) { ... }

// 全ユーザーの履歴をクリア
function clearAllHistory() { ... }
```

## テストケース一覧

### A. 基本翻訳テスト

#### TC-A001: 日本語→英語（基本）

```
前提条件: 履歴なし
入力: こんにちは
期待結果: Hello または Hi
結果: ✓ / ✗
```

#### TC-A002: 英語→日本語（基本）

```
前提条件: 履歴なし
入力: Good morning
期待結果: おはようございます
結果: ✓ / ✗
```

#### TC-A003: ポーランド語→日本語

```
前提条件: 履歴なし
入力: Dzień dobry
期待結果: こんにちは または おはようございます
結果: ✓ / ✗
```

#### TC-A004: 長文翻訳（日本語→英語）

```
前提条件: 履歴なし
入力: 昨日は友達と映画を見に行きました。とても楽しかったです。
期待結果: Yesterday I went to see a movie with my friend. It was very fun.
結果: ✓ / ✗
```

### B. 文脈考慮テスト

#### TC-B001: 代名詞の解決（2発言）

```
【発言1】
入力: 昨日映画を見た
期待結果: I watched a movie yesterday.
結果: ✓ / ✗

【発言2】
入力: とても面白かった
期待結果: It was very interesting. （「それ」=「映画」を推測）
結果: ✓ / ✗
```

#### TC-B002: 省略表現の補完

```
【発言1】
入力: 今日は買い物に行きます
期待結果: I'm going shopping today.
結果: ✓ / ✗

【発言2】
入力: 新しい服を買う予定
期待結果: I'm planning to buy new clothes. （主語「私は」を補完）
結果: ✓ / ✗
```

#### TC-B003: 3発言目で1発言目の文脈が消える

```
【発言1】
入力: 犬を飼っています
期待結果: I have a dog.
結果: ✓ / ✗

【発言2】
入力: とても可愛いです
期待結果: It's very cute. （「それ」=「犬」）
結果: ✓ / ✗

【発言3】
入力: 毎日散歩します
期待結果: I take a walk every day. （発言2の文脈を参照）
結果: ✓ / ✗

【発言4】
入力: 元気です
期待結果: I'm fine. （発言1の「犬」は履歴から消えているため、主語「私」で翻訳される）
結果: ✓ / ✗
```

#### TC-B004: 異なる言語での文脈参照

```
【発言1】
入力: I like coffee.
期待結果: 私はコーヒーが好きです。
結果: ✓ / ✗

【発言2】
入力: 毎朝飲みます
期待結果: I drink it every morning. （英語の文脈を参照して翻訳）
結果: ✓ / ✗
```

### C. 言語検出テスト

#### TC-C001: 日本語の検出（ひらがな）

```
入力: おはよう
期待言語: ja
期待結果: Good morning または Hello
結果: ✓ / ✗
```

#### TC-C002: 日本語の検出（カタカナ）

```
入力: コンピュータ
期待言語: ja
期待結果: Computer
結果: ✓ / ✗
```

#### TC-C003: 日本語の検出（漢字）

```
入力: 明日
期待言語: ja
期待結果: Tomorrow
結果: ✓ / ✗
```

#### TC-C004: ポーランド語の検出

```
入力: Dziękuję
期待言語: pl
期待結果: ありがとうございます
結果: ✓ / ✗
```

#### TC-C005: 英語の検出

```
入力: Thank you
期待言語: en
期待結果: ありがとうございます
結果: ✓ / ✗
```

### D. エラーハンドリングテスト

#### TC-D001: 空メッセージ

```
入力: （空文字）
期待結果: エラーメッセージまたは翻訳スキップ
結果: ✓ / ✗
```

#### TC-D002: 非常に長いメッセージ（1000文字以上）

```
入力: （1000文字以上のテキスト）
期待結果: 正常に翻訳 または 適切なエラーメッセージ
結果: ✓ / ✗
```

#### TC-D003: 絵文字のみのメッセージ

```
入力: 😊👍
期待結果: そのまま返す または エラーメッセージ
結果: ✓ / ✗
```

#### TC-D004: 特殊文字・記号

```
入力: @#$%^&*()
期待結果: そのまま返す または エラーメッセージ
結果: ✓ / ✗
```

### E. パフォーマンステスト

#### TC-E001: 応答時間（短文）

```
入力: こんにちは
期待応答時間: 3秒以内
実測: ___秒
結果: ✓ / ✗
```

#### TC-E002: 応答時間（長文）

```
入力: （100文字以上のテキスト）
期待応答時間: 5秒以内
実測: ___秒
結果: ✓ / ✗
```

#### TC-E003: 履歴取得時間

```
確認方法: スプレッドシートの「履歴取得時間(ms)」列を確認
期待時間: 100ms以内（理想は10ms以内）
実測: ___ms
結果: ✓ / ✗
```

## テスト実行手順

### 手動テスト

1. **履歴クリア**
   - Apps Scriptエディタで`clearAllHistory()`を実行

2. **テストケース実行**
   - LINEでBotにメッセージを送信
   - 翻訳結果を確認
   - スプレッドシートに結果を記録

3. **スプレッドシート確認**
   - 「翻訳ログ」シートで以下を確認：
     - タイムスタンプが正しい
     - 元メッセージと翻訳結果が記録されている
     - 使用プロンプトが確認できる
     - パフォーマンスメトリクスが記録されている

### 自動テスト（Apps Script関数）

Apps Scriptエディタで以下のテスト関数を作成し、実行します：

```javascript
/**
 * 言語検出テスト
 */
function testLanguageDetection() {
  const testCases = [
    { input: 'こんにちは', expected: 'ja' },
    { input: 'Hello', expected: 'en' },
    { input: 'Dziękuję', expected: 'pl' }
  ];

  testCases.forEach(testCase => {
    const result = detectLanguage(testCase.input);
    const status = result === testCase.expected ? '✓' : '✗';
    Logger.log(`${status} Input: "${testCase.input}" | Expected: ${testCase.expected} | Actual: ${result}`);
  });
}

/**
 * 履歴管理テスト
 */
function testHistoryManagement() {
  const userId = 'TEST_USER_001';

  // 履歴クリア
  clearUserHistory(userId);
  let history = getUserHistory(userId);
  Logger.log('✓ 履歴クリア: ' + (history.length === 0 ? 'OK' : 'NG'));

  // 1件追加
  updateUserHistory(userId, 'こんにちは', 'ja');
  history = getUserHistory(userId);
  Logger.log('✓ 1件追加: ' + (history.length === 1 ? 'OK' : 'NG'));

  // 2件追加
  updateUserHistory(userId, 'ありがとう', 'ja');
  history = getUserHistory(userId);
  Logger.log('✓ 2件追加: ' + (history.length === 2 ? 'OK' : 'NG'));

  // 3件追加（最古の1件が削除されるはず）
  updateUserHistory(userId, 'さようなら', 'ja');
  history = getUserHistory(userId);
  Logger.log('✓ 3件追加（2件保持）: ' + (history.length === 2 ? 'OK' : 'NG'));
  Logger.log('✓ 最新メッセージ: ' + (history[1].message === 'さようなら' ? 'OK' : 'NG'));
  Logger.log('✓ 2番目のメッセージ: ' + (history[0].message === 'ありがとう' ? 'OK' : 'NG'));

  // クリーンアップ
  clearUserHistory(userId);
}

/**
 * 統合テスト
 */
function testIntegration() {
  Logger.log('=== 統合テスト開始 ===');

  // 言語検出テスト
  Logger.log('\n--- 言語検出テスト ---');
  testLanguageDetection();

  // 履歴管理テスト
  Logger.log('\n--- 履歴管理テスト ---');
  testHistoryManagement();

  Logger.log('\n=== 統合テスト完了 ===');
}
```

実行方法：
1. Apps Scriptエディタで上記コードを`Code.gs`に追加
2. 「関数を選択」ドロップダウンから`testIntegration`を選択
3. 「実行」をクリック
4. 「実行ログ」で結果を確認

## デバッグ方法

### 1. Apps Script実行ログの確認

**手順:**
1. Apps Scriptエディタを開く
2. 「実行数」をクリック
3. 失敗した実行をクリック
4. 「ログを表示」でエラーメッセージを確認

**よくあるエラー:**
```
Error: LINE Reply API error: 401
→ LINE_CHANNEL_ACCESS_TOKENが間違っている

Error: Gemini API error: 403
→ GEMINI_API_KEYが間違っているか、課金が有効になっていない

Error: Exception: Invalid argument: spreadsheet
→ SPREADSHEET_IDが間違っている
```

### 2. スプレッドシートでプロンプト確認

翻訳結果が期待と異なる場合、プロンプトを確認します：

**手順:**
1. スプレッドシートの「翻訳ログ」シートを開く
2. 該当行の「使用プロンプト」列を確認
3. プロンプトが適切か検証
4. 必要に応じて`buildTranslationPrompt`関数を修正

### 3. 文脈の確認

文脈が正しく参照されているか確認します：

**手順:**
1. スプレッドシートの「履歴件数」列を確認
2. 0件の場合は履歴が保存されていない
3. 2件以上の場合は、`MAX_HISTORY_COUNT`の設定を確認

**履歴のデバッグ関数:**
```javascript
function debugUserHistory(userId) {
  const history = getUserHistory(userId);
  Logger.log('ユーザーID: ' + userId);
  Logger.log('履歴件数: ' + history.length);

  history.forEach((item, index) => {
    Logger.log(`\n--- 履歴 ${index + 1} ---`);
    Logger.log('メッセージ: ' + item.message);
    Logger.log('言語: ' + item.language);
    Logger.log('タイムスタンプ: ' + new Date(item.timestamp));
  });
}
```

### 4. パフォーマンスのデバッグ

応答が遅い場合、スプレッドシートでボトルネックを特定します：

**手順:**
1. スプレッドシートの以下の列を確認：
   - 履歴取得時間(ms)
   - 翻訳時間(ms)
   - 合計応答時間(ms)

2. ボトルネックの特定：
   - 履歴取得時間が100ms以上 → スクリプトプロパティの問題
   - 翻訳時間が3000ms以上 → Gemini APIの問題
   - 合計応答時間が5000ms以上 → 全体的な最適化が必要

## テスト結果の記録

### テストケースシートへの記録

スプレッドシートの「テストケース」シートに結果を記録します：

| テストID | 入力メッセージ | 期待される翻訳 | 実際の翻訳 | 言語 | ステータス | 実行日 | メモ |
|---------|--------------|--------------|-----------|------|----------|--------|------|
| TC-A001 | こんにちは | Hello | Hello | ja→en | ✓ | 2025-01-15 | OK |
| TC-B001 | とても面白かった | It was very interesting. | It was very fun. | ja→en | ✗ | 2025-01-15 | 文脈の参照が不十分 |

### 継続的な品質改善

1. **定期的なテスト実行**（週次または月次）
2. **失敗したテストケースの分析**
3. **プロンプトの改善**
4. **新しいテストケースの追加**

## 次のステップ

テストが完了したら、本番環境にデプロイしてください（[DEPLOYMENT.md](DEPLOYMENT.md)参照）。
