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
    Logger.log('doPost started');
    const startTime = new Date().getTime();

    // リクエストボディをパース
    const contents = JSON.parse(e.postData.contents);
    Logger.log('Request contents: ' + JSON.stringify(contents));
    const events = contents.events;

    // 署名検証
    if (!verifySignature(e)) {
      Logger.log('Signature verification failed');
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Invalid signature'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    Logger.log('Signature verification passed');

    // イベント処理
    events.forEach(event => {
      if (event.type === 'message' && event.message.type === 'text') {
        Logger.log('Processing text message event: ' + event.replyToken);
        handleTextMessage(event, startTime);
      } else {
        Logger.log('Skipping event type: ' + event.type);
      }
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
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

    Logger.log('Signature: ' + signature);
    Logger.log('Expected: ' + expectedSignature);

    return signature === expectedSignature;
  } catch (error) {
    Logger.log('Error in verifySignature: ' + error.toString());
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

  Logger.log('handleTextMessage started for user: ' + userId);
  Logger.log('Message text: ' + messageText);

  try {
    // 1. 履歴取得（超高速: スクリプトプロパティから）
    const historyStartTime = new Date().getTime();
    const userHistory = getUserHistory(userId);
    const historyEndTime = new Date().getTime();
    const historyFetchTime = historyEndTime - historyStartTime;
    Logger.log('History fetched in ' + historyFetchTime + 'ms. Count: ' + userHistory.length);

    // 2. 言語検出
    const detectedLanguage = detectLanguage(messageText);
    Logger.log('Detected language: ' + detectedLanguage);

    // 3. 翻訳実行
    const translationStartTime = new Date().getTime();
    Logger.log('Starting translation...');
    const translationResult = translateWithContext(messageText, userHistory, detectedLanguage);
    const translationEndTime = new Date().getTime();
    const translationTime = translationEndTime - translationStartTime;
    Logger.log('Translation completed in ' + translationTime + 'ms');
    Logger.log('Translation result: ' + translationResult.translation);

    // 4. LINEに返信（即座に）
    Logger.log('Replying to LINE...');
    replyToLine(replyToken, translationResult.translation);
    const replyEndTime = new Date().getTime();
    const totalResponseTime = replyEndTime - startTime;
    Logger.log('Reply sent. Total response time: ' + totalResponseTime + 'ms');

    // 5. 履歴更新（ユーザー発言のみ）
    updateUserHistory(userId, messageText, detectedLanguage);
    Logger.log('User history updated');

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
    Logger.log('Error in handleTextMessage: ' + error.toString());
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
      Logger.log('No history found for user: ' + userId);
      return [];
    }

    const history = JSON.parse(historyJson);
    Logger.log('History found for user ' + userId + ': ' + history.length + ' items');
    return history;
  } catch (error) {
    Logger.log('Error in getUserHistory: ' + error.toString());
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
    Logger.log('History saved for user: ' + userId);

  } catch (error) {
    Logger.log('Error in updateUserHistory: ' + error.toString());
  }
}

/**
 * 言語検出
 */
function detectLanguage(text) {
  Logger.log('Detecting language for text: ' + text.substring(0, 20) + '...');
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
    Logger.log('Translation direction: ' + sourceLanguage + ' -> ' + targetLanguage);

    // プロンプト作成
    const prompt = buildTranslationPrompt(message, history, sourceLanguage, targetLanguage);
    Logger.log('Generated prompt: ' + prompt);

    // Gemini APIで翻訳
    const translation = callGeminiAPI(prompt);

    return {
      translation: translation,
      prompt: prompt
    };

  } catch (error) {
    Logger.log('Error in translateWithContext: ' + error.toString());
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
    Logger.log('Calling Gemini API...');
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
    Logger.log('Gemini API Response Code: ' + responseCode);

    const responseContent = response.getContentText();
    if (responseCode !== 200) {
      throw new Error('Gemini API error: ' + responseCode + ' - ' + responseContent);
    }

    const result = JSON.parse(responseContent);

    if (!result.candidates || result.candidates.length === 0) {
      Logger.log('Gemini API returned no candidates: ' + responseContent);
      throw new Error('No translation result from Gemini API');
    }

    const translation = result.candidates[0].content.parts[0].text.trim();
    Logger.log('Gemini API success');
    return translation;

  } catch (error) {
    Logger.log('Error in callGeminiAPI: ' + error.toString());
    throw error;
  }
}

/**
 * LINEへ返信
 */
function replyToLine(replyToken, message) {
  try {
    Logger.log('Sending reply to LINE...');
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
    Logger.log('LINE Reply API Response Code: ' + responseCode);

    if (responseCode !== 200) {
      throw new Error('LINE Reply API error: ' + responseCode + ' - ' + response.getContentText());
    }

  } catch (error) {
    Logger.log('Error in replyToLine: ' + error.toString());
    throw error;
  }
}

/**
 * スプレッドシートに非同期保存
 */
function saveToSpreadsheetAsync(data) {
  try {
    Logger.log('Saving to spreadsheet...');
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

    if (!spreadsheetId) {
      Logger.log('SPREADSHEET_ID not set. Skipping save to spreadsheet.');
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
    Logger.log('Saved to spreadsheet successfully');

  } catch (error) {
    Logger.log('Error in saveToSpreadsheetAsync: ' + error.toString());
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
    Logger.log('History cleared for user: ' + userId);
  } catch (error) {
    Logger.log('Error in clearUserHistory: ' + error.toString());
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

    Logger.log('All user histories cleared');
  } catch (error) {
    Logger.log('Error in clearAllHistory: ' + error.toString());
  }
}
