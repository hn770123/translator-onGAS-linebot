/**
 * LINE翻訳Bot - 文脈考慮型
 * Google Apps Script + Gemini 2.5 Flash-Lite
 */

// 定数
const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-latest:generateContent';
const MAX_HISTORY_COUNT = 2; // 保存する履歴の最大件数

/**
 * LINEからのWebhook受信処理
 */
function doPost(e) {
  try {
    console.log('doPost 開始');
    const startTime = new Date().getTime();

    // リクエストボディをパース
    const contents = JSON.parse(e.postData.contents);
    console.log('リクエスト内容: ' + JSON.stringify(contents));
    const events = contents.events;

    // 署名検証
    if (!verifySignature(e)) {
      console.log('署名検証失敗');
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Invalid signature'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    console.log('署名検証成功');

    // イベント処理
    events.forEach(event => {
      if (event.type === 'message' && event.message.type === 'text') {
        console.log('テキストメッセージイベント処理: ' + event.replyToken);
        handleTextMessage(event, startTime);
      } else {
        console.log('イベントタイプスキップ: ' + event.type);
      }
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.log('doPostエラー: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * LINE署名検証
 */
function verifySignature(e) {
  try {
    const channelSecret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
    const signature = e.parameter.hasOwnProperty('X-Line-Signature')
      ? e.parameter['X-Line-Signature']
      : e.headers['X-Line-Signature'];

    const body = e.postData.contents;
    const hash = Utilities.computeHmacSha256Signature(Utilities.newBlob(body).getBytes(), channelSecret);
    const expectedSignature = Utilities.base64Encode(hash);

    console.log('受信署名: ' + signature);
    console.log('期待署名: ' + expectedSignature);

    return signature === expectedSignature;
  } catch (error) {
    console.log('verifySignatureエラー: ' + error.toString());
    return false;
  }
}

/**
 * テキストメッセージ処理
 */
function handleTextMessage(event, startTime) {
  const userId = event.source.userId;
  const messageText = event.message.text;
  const replyToken = event.replyToken;

  console.log('handleTextMessage開始 ユーザーID: ' + userId);
  console.log('メッセージ内容: ' + messageText);

  try {
    // 1. 履歴取得（超高速: スクリプトプロパティから）
    const historyStartTime = new Date().getTime();
    const userHistory = getUserHistory(userId);
    const historyEndTime = new Date().getTime();
    const historyFetchTime = historyEndTime - historyStartTime;
    console.log('履歴取得時間: ' + historyFetchTime + 'ms. 件数: ' + userHistory.length);

    // 2. 言語検出
    const detectedLanguage = detectLanguage(messageText);
    console.log('検出言語: ' + detectedLanguage);

    // 3. 翻訳実行
    const translationStartTime = new Date().getTime();
    console.log('翻訳開始...');
    const translationResult = translateWithContext(messageText, userHistory, detectedLanguage);
    const translationEndTime = new Date().getTime();
    const translationTime = translationEndTime - translationStartTime;
    console.log('翻訳完了時間: ' + translationTime + 'ms');
    console.log('翻訳結果: ' + translationResult.translation);

    // 4. LINEに返信（即座に）
    console.log('LINE返信中...');
    replyToLine(replyToken, translationResult.translation);
    const replyEndTime = new Date().getTime();
    const totalResponseTime = replyEndTime - startTime;
    console.log('返信完了. 合計応答時間: ' + totalResponseTime + 'ms');

    // 5. 履歴更新（ユーザー発言のみ）
    updateUserHistory(userId, messageText, detectedLanguage);
    console.log('ユーザー履歴更新完了');

    // 6. 非同期でスプレッドシートに保存（応答には影響しない）
    saveToSpreadsheetAsync({
      timestamp: new Date(),
      userId: userId,
      language: detectedLanguage,
      originalMessage: messageText,
      translation: translationResult.translation,
      prompt: translationResult.prompt,
      historyFetchTime: historyFetchTime,
      translationTime: translationTime,
      totalResponseTime: totalResponseTime,
      historyCount: userHistory.length
    });

  } catch (error) {
    console.log('handleTextMessageエラー: ' + error.toString());
    replyToLine(replyToken, '申し訳ございません。翻訳中にエラーが発生しました。');
  }
}

/**
 * ユーザー履歴取得（スクリプトプロパティから超高速取得）
 */
function getUserHistory(userId) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const historyKey = 'HISTORY_' + userId;
    const historyJson = properties.getProperty(historyKey);

    if (!historyJson) {
      console.log('履歴なし ユーザーID: ' + userId);
      return [];
    }

    const history = JSON.parse(historyJson);
    console.log('履歴発見 ユーザーID ' + userId + ': ' + history.length + '件');
    return history;
  } catch (error) {
    console.log('getUserHistoryエラー: ' + error.toString());
    return [];
  }
}

/**
 * ユーザー履歴更新（ユーザー発言のみ、Bot応答は含めない）
 */
function updateUserHistory(userId, message, language) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const historyKey = 'HISTORY_' + userId;

    // 現在の履歴を取得
    let history = getUserHistory(userId);

    // 新しいメッセージを追加
    history.push({
      message: message,
      language: language,
      timestamp: new Date().getTime()
    });

    // 最新の2件のみ保持
    if (history.length > MAX_HISTORY_COUNT) {
      history = history.slice(-MAX_HISTORY_COUNT);
    }

    // 保存
    properties.setProperty(historyKey, JSON.stringify(history));
    console.log('履歴保存完了 ユーザーID: ' + userId);

  } catch (error) {
    console.log('updateUserHistoryエラー: ' + error.toString());
  }
}

/**
 * 言語検出
 */
function detectLanguage(text) {
  console.log('言語検出開始 テキスト: ' + text.substring(0, 20) + '...');
  // 日本語を含むかチェック
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
    return 'ja';
  }

  // ポーランド語特有の文字をチェック
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) {
    return 'pl';
  }

  // デフォルトは英語
  return 'en';
}

/**
 * 文脈を考慮した翻訳
 */
function translateWithContext(message, history, sourceLanguage) {
  try {
    // ターゲット言語を決定
    const targetLanguage = determineTargetLanguage(sourceLanguage);
    console.log('翻訳方向: ' + sourceLanguage + ' -> ' + targetLanguage);

    // プロンプト作成
    const prompt = buildTranslationPrompt(message, history, sourceLanguage, targetLanguage);
    console.log('生成プロンプト: ' + prompt);

    // Gemini APIで翻訳
    const translation = callGeminiAPI(prompt);

    return {
      translation: translation,
      prompt: prompt
    };

  } catch (error) {
    console.log('translateWithContextエラー: ' + error.toString());
    throw error;
  }
}

/**
 * ターゲット言語決定
 */
function determineTargetLanguage(sourceLanguage) {
  // 日本語 → 英語
  // 英語 → 日本語
  // ポーランド語 → 日本語
  // その他 → 日本語

  if (sourceLanguage === 'ja') {
    return 'en';
  } else {
    return 'ja';
  }
}

/**
 * 翻訳プロンプト作成
 */
function buildTranslationPrompt(message, history, sourceLanguage, targetLanguage) {
  const languageNames = {
    'ja': '日本語',
    'en': '英語',
    'pl': 'ポーランド語'
  };

  let prompt = `あなたは優秀な翻訳アシスタントです。以下のテキストを${languageNames[sourceLanguage]}から${languageNames[targetLanguage]}に翻訳してください。\n\n`;

  // 履歴がある場合は文脈として追加
  if (history && history.length > 0) {
    prompt += `【会話の文脈】\n`;
    prompt += `以下は過去のユーザーの発言です。代名詞や省略表現を翻訳する際の参考にしてください。\n\n`;

    history.forEach((item, index) => {
      prompt += `${index + 1}. ${item.message}\n`;
    });

    prompt += `\n`;
  }

  prompt += `【翻訳対象】\n`;
  prompt += `${message}\n\n`;
  prompt += `【指示】\n`;
  prompt += `- 翻訳結果のみを出力してください（説明や追加情報は不要）\n`;
  prompt += `- 自然で流暢な${languageNames[targetLanguage]}にしてください\n`;

  if (history && history.length > 0) {
    prompt += `- 代名詞や省略表現は、上記の文脈を考慮して適切に翻訳してください\n`;
  }

  return prompt;
}

/**
 * Gemini API呼び出し
 */
function callGeminiAPI(prompt) {
  try {
    console.log('Gemini API呼び出し中...');
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    const url = GEMINI_API_URL + '?key=' + apiKey;

    const payload = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000
      }
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    console.log('Gemini APIレスポンスコード: ' + responseCode);

    const responseContent = response.getContentText();
    if (responseCode !== 200) {
      throw new Error('Gemini API error: ' + responseCode + ' - ' + responseContent);
    }

    const result = JSON.parse(responseContent);

    if (!result.candidates || result.candidates.length === 0) {
      console.log('Gemini API候補なし: ' + responseContent);
      throw new Error('No translation result from Gemini API');
    }

    const translation = result.candidates[0].content.parts[0].text.trim();
    console.log('Gemini API呼び出し成功');
    return translation;

  } catch (error) {
    console.log('callGeminiAPIエラー: ' + error.toString());
    throw error;
  }
}

/**
 * LINEへ返信
 */
function replyToLine(replyToken, message) {
  try {
    console.log('LINE返信送信中...');
    const accessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');

    const payload = {
      replyToken: replyToken,
      messages: [{
        type: 'text',
        text: message
      }]
    };

    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(LINE_REPLY_URL, options);
    const responseCode = response.getResponseCode();
    console.log('LINE Reply APIレスポンスコード: ' + responseCode);

    if (responseCode !== 200) {
      throw new Error('LINE Reply API error: ' + responseCode + ' - ' + response.getContentText());
    }

  } catch (error) {
    console.log('replyToLineエラー: ' + error.toString());
    throw error;
  }
}

/**
 * スプレッドシートに非同期保存
 */
function saveToSpreadsheetAsync(data) {
  try {
    console.log('スプレッドシート保存中...');
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

    if (!spreadsheetId) {
      console.log('SPREADSHEET_ID未設定のため保存をスキップします');
      return;
    }

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName('翻訳ログ') || spreadsheet.insertSheet('翻訳ログ');

    // ヘッダー行が無い場合は追加
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'タイムスタンプ',
        'ユーザーID',
        '言語',
        '元メッセージ',
        '翻訳結果',
        '使用プロンプト',
        '履歴取得時間(ms)',
        '翻訳時間(ms)',
        '合計応答時間(ms)',
        '履歴件数'
      ]);
    }

    // データを追加
    sheet.appendRow([
      data.timestamp,
      data.userId,
      data.language,
      data.originalMessage,
      data.translation,
      data.prompt,
      data.historyFetchTime,
      data.translationTime,
      data.totalResponseTime,
      data.historyCount
    ]);
    console.log('スプレッドシート保存成功');

  } catch (error) {
    console.log('saveToSpreadsheetAsyncエラー: ' + error.toString());
  }
}

/**
 * テスト用関数：履歴クリア
 */
function clearUserHistory(userId) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const historyKey = 'HISTORY_' + userId;
    properties.deleteProperty(historyKey);
    console.log('ユーザー履歴クリア: ' + userId);
  } catch (error) {
    console.log('clearUserHistoryエラー: ' + error.toString());
  }
}

/**
 * テスト用関数：全ユーザーの履歴クリア
 */
function clearAllHistory() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const allProperties = properties.getProperties();

    Object.keys(allProperties).forEach(key => {
      if (key.startsWith('HISTORY_')) {
        properties.deleteProperty(key);
      }
    });

    console.log('全ユーザー履歴クリア完了');
  } catch (error) {
    console.log('clearAllHistoryエラー: ' + error.toString());
  }
}
