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
    const startTime = new Date().getTime();

    // リクエストボディをパース
    const contents = JSON.parse(e.postData.contents);
    const events = contents.events;

    // 署名検証
    if (!verifySignature(e)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Invalid signature'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // イベント処理
    events.forEach(event => {
      if (event.type === 'message' && event.message.type === 'text') {
        handleTextMessage(event, startTime);
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

  try {
    // 1. 履歴取得（超高速: スクリプトプロパティから）
    const historyStartTime = new Date().getTime();
    const userHistory = getUserHistory(userId);
    const historyEndTime = new Date().getTime();
    const historyFetchTime = historyEndTime - historyStartTime;

    // 2. 言語検出
    const detectedLanguage = detectLanguage(messageText);

    // 3. 翻訳実行
    const translationStartTime = new Date().getTime();
    const translationResult = translateWithContext(messageText, userHistory, detectedLanguage);
    const translationEndTime = new Date().getTime();
    const translationTime = translationEndTime - translationStartTime;

    // 4. LINEに返信（即座に）
    replyToLine(replyToken, translationResult.translation);
    const replyEndTime = new Date().getTime();
    const totalResponseTime = replyEndTime - startTime;

    // 5. 履歴更新（ユーザー発言のみ）
    updateUserHistory(userId, messageText, detectedLanguage);

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
      return [];
    }

    return JSON.parse(historyJson);
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

  } catch (error) {
    Logger.log('Error in updateUserHistory: ' + error.toString());
  }
}

/**
 * 言語検出
 */
function detectLanguage(text) {
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
    // プロンプト作成
    const prompt = buildTranslationPrompt(message, history, sourceLanguage);

    // Gemini APIで翻訳
    const rawTranslation = callGeminiAPI(prompt);

    // 翻訳結果をパースして整形
    const formattedTranslation = parseTranslationResult(rawTranslation, sourceLanguage);

    return {
      translation: formattedTranslation,
      prompt: prompt
    };

  } catch (error) {
    Logger.log('Error in translateWithContext: ' + error.toString());
    throw error;
  }
}

/**
 * 翻訳結果をパースして整形
 */
function parseTranslationResult(rawTranslation, sourceLanguage) {
  try {
    // 各言語の翻訳を抽出
    const translations = {
      en: '',
      pl: '',
      ja: ''
    };

    // English:, Polish:, Japanese: の行を探して抽出
    const lines = rawTranslation.split('\n');
    let currentLang = null;
    let currentText = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('English:')) {
        if (currentLang && currentText.length > 0) {
          translations[currentLang] = currentText.join('\n').trim();
        }
        currentLang = 'en';
        currentText = [];
        const content = line.substring('English:'.length).trim();
        if (content) {
          currentText.push(content);
        }
      } else if (line.startsWith('Polish:')) {
        if (currentLang && currentText.length > 0) {
          translations[currentLang] = currentText.join('\n').trim();
        }
        currentLang = 'pl';
        currentText = [];
        const content = line.substring('Polish:'.length).trim();
        if (content) {
          currentText.push(content);
        }
      } else if (line.startsWith('Japanese:')) {
        if (currentLang && currentText.length > 0) {
          translations[currentLang] = currentText.join('\n').trim();
        }
        currentLang = 'ja';
        currentText = [];
        const content = line.substring('Japanese:'.length).trim();
        if (content) {
          currentText.push(content);
        }
      } else if (currentLang && line) {
        currentText.push(line);
      }
    }

    // 最後の言語の翻訳を保存
    if (currentLang && currentText.length > 0) {
      translations[currentLang] = currentText.join('\n').trim();
    }

    // ソース言語以外の2つの言語を整形して返す
    const languageLabels = {
      en: 'English',
      pl: 'Polish',
      ja: 'Japanese'
    };

    const targetLanguages = ['en', 'pl', 'ja'].filter(lang => lang !== sourceLanguage);
    const result = targetLanguages
      .map(lang => `${languageLabels[lang]}:\n${translations[lang]}`)
      .join('\n\n');

    return result;

  } catch (error) {
    Logger.log('Error in parseTranslationResult: ' + error.toString());
    // パースに失敗した場合は、生の翻訳結果をそのまま返す
    return rawTranslation;
  }
}

/**
 * 翻訳プロンプト作成
 */
function buildTranslationPrompt(message, history, sourceLanguage) {
  let prompt = `[Context / Environment]
- Situation: Group chat for a children's ballet class.
- Key Goal: Smooth communication between teachers and parents.
- Role: An expert cultural mediator and translator.

[Language Strategy]
1. English: Use clear, friendly, and practical English. Prioritize being understood by a non-native speaker over complex grammar.
2. Polish: Use "Pan/Pani" for respect. Mirror the politeness of the source while keeping it natural for a teacher-parent relationship in Poland.
3. Japanese: Use appropriate "Keigo" (honorifics) that reflects the modest yet respectful tone Japanese parents use with teachers.

[Output Rules]
- Detect the source language automatically.
- Provide translations for the other two languages.
- Skip the original language.
- Output ONLY the result. No conversational filler.
`;

  // 履歴がある場合は文脈として追加
  if (history && history.length > 0) {
    prompt += `\n[Conversation History]\n`;
    prompt += `Here are the recent messages for context (use these to resolve pronouns and understand context):\n`;
    history.forEach((item, index) => {
      prompt += `${index + 1}. ${item.message}\n`;
    });
  }

  prompt += `\n[Current Text]\n${message}\n\n`;
  prompt += `[Translation]\n`;
  prompt += `English:\n`;
  prompt += `Polish:\n`;
  prompt += `Japanese:\n`;

  return prompt;
}

/**
 * Gemini API呼び出し
 */
function callGeminiAPI(prompt) {
  try {
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

    if (responseCode !== 200) {
      throw new Error('Gemini API error: ' + responseCode + ' - ' + response.getContentText());
    }

    const result = JSON.parse(response.getContentText());

    if (!result.candidates || result.candidates.length === 0) {
      throw new Error('No translation result from Gemini API');
    }

    const translation = result.candidates[0].content.parts[0].text.trim();
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
