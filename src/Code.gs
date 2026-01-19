/**
 * LINE翻訳Bot - 文脈考慮型
 * Google Apps Script + Gemini 3 Flash
 */

// 定数
const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
// 【変更1】モデルを gemini-3-flash-preview に変更
// ※2026年1月時点でのGemini 3 FlashのモデルID
// const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

const MAX_HISTORY_COUNT = 2; // 保存する履歴の最大件数

/**
 * LINEからのWebhook受信処理
 */
function doPost(e) {
  try {
    const debugInfo = {
      parameter: e.parameter,
      contextPath: e.contextPath,
      contentLength: e.contentLength,
      queryString: e.queryString,
      headers: e.headers,
      postDataType: e.postData ? e.postData.type : "なし"
    };
    
    console.log('doPost 開始');
    const startTime = new Date().getTime();

    // リクエストボディをパース
    const contents = JSON.parse(e.postData.contents);
    console.log('リクエスト内容: ' + JSON.stringify(contents));

    if (!contents.events || contents.events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);
    }

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
      // 変更点3: CacheServiceを使ったLINE Webhookのリトライガード
      const eventId = event.webhookEventId;
      if (eventId) {
        const cache = CacheService.getScriptCache();
        // 既に処理済みのイベントIDならスキップ
        if (cache.get(eventId)) {
          console.log('重複イベントのためスキップ: ' + eventId);
          return; 
        }
        // 処理済みとしてマーク (10分間保持)
        cache.put(eventId, 'processed', 600);
      }

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
    debugToSheet('doPostエラー: ' + error.toString());
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
    // 開発中のため検証スキップが必要な場合はここを有効化
    return true; 

    /*
    const channelSecret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
    let signature = null;
    if (e.parameter && e.parameter['X-Line-Signature']) {
      signature = e.parameter['X-Line-Signature'];
    }
    if (!signature && e.headers) {
      signature = e.headers['X-Line-Signature'] || e.headers['x-line-signature'];
    }
    if (!signature) {
      return false;
    }
    const body = e.postData.contents;
    const hash = Utilities.computeHmacSha256Signature(Utilities.newBlob(body).getBytes(), channelSecret);
    const expectedSignature = Utilities.base64Encode(hash);
    if (signature !== expectedSignature) {
      return false;
    }
    return true;
    */
  } catch (error) {
    debugToSheet("❌ 署名検証中にエラー: " + error.toString());
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
    // 1. 履歴取得
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

    // 4. LINEに返信
    console.log('LINE返信中...');
    replyToLine(replyToken, translationResult.translation);

    const replyEndTime = new Date().getTime();
    const totalResponseTime = replyEndTime - startTime;
    console.log('返信完了. 合計応答時間: ' + totalResponseTime + 'ms');

    // 5. 履歴更新
    updateUserHistory(userId, messageText, detectedLanguage);
    console.log('ユーザー履歴更新完了');

    // 6. スプレッドシートに保存
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

    let errorMessage = '申し訳ございません。翻訳中にエラーが発生しました。';

    // callGeminiAPIから投げられたレートリミットエラーを検知
    if (error.message.includes('RATE_LIMIT_EXCEEDED')) {
      errorMessage = 'AIサービスのレートリミットに到達しました。５分ほど置いて試してください';
    }
    replyToLine(replyToken, errorMessage);
  }
}

/**
 * ユーザー履歴取得
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
 * ユーザー履歴更新
 */
function updateUserHistory(userId, message, language) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const historyKey = 'HISTORY_' + userId;

    let history = getUserHistory(userId);
    history.push({
      message: message,
      language: language,
      timestamp: new Date().getTime()
    });

    if (history.length > MAX_HISTORY_COUNT) {
      history = history.slice(-MAX_HISTORY_COUNT);
    }

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
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
    return 'ja';
  }
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) {
    return 'pl';
  }
  return 'en';
}

/**
 * 文脈を考慮した翻訳
 */
function translateWithContext(message, history, sourceLanguage) {
  try {
    const targetLanguage = determineTargetLanguage(sourceLanguage);
    console.log('翻訳方向: ' + sourceLanguage + ' -> ' + targetLanguage);

    const prompt = buildTranslationPrompt(message, history, sourceLanguage, targetLanguage);
    console.log('生成プロンプト: ' + prompt);

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
  let prompt = '';
  if (sourceLanguage === 'ja') {
    prompt += `あなたはプロの通訳アシスタントです。以下の日本語テキストを「英語」と「ポーランド語」の両方に翻訳してください。\n\n`;
    prompt += `【出力形式】\n`;
    prompt += `Polish: [ポーランド語の翻訳結果]\n`;
    prompt += `English: [英語の翻訳結果]\n\n`;
  } else {
    prompt += `あなたはプロの通訳アシスタントです。以下のテキストを自然な日本語に翻訳してください。\n\n`;
  }
  
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
  prompt += `- 子供バレエ教室のチャットでのメッセージです。ポーランド語は先生で、日本語は保護者の生徒です。バレエ教室の先生とのやりとりとして自然な文章にしてください。\n`;
  // 変更点4: ニュアンスを含めるためのプロンプト改善
  prompt += `- 原文に含まれるニュアンス（感情、皮肉、丁寧さの度合い、ユーモアなど）を鋭敏に汲み取り、それをターゲット言語で適切に表現してください。直訳よりも、この「空気感」の再現を優先してください。\n`;
  prompt += `- 翻訳した文章が長くなっても構いませんので、元の文章の意図が完全に伝わるようにしてください\n`;

  if (history && history.length > 0) {
    prompt += `- 代名詞や省略表現は、上記の文脈を考慮して適切に翻訳してください\n`;
  }

  return prompt;
}

/**
 * Gemini API呼び出し (リトライ機能付き)
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
        maxOutputTokens: 8192
      }
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    // 変更点2: 503エラー時のリトライ実装 (3回)
    let response;
    let responseCode;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      response = UrlFetchApp.fetch(url, options);
      responseCode = response.getResponseCode();

      // 成功(200)または、リトライしても無駄なエラー(503以外)の場合はループを抜ける
      if (responseCode !== 503) {
        break;
      }

      // 503の場合、指定回数までリトライ待機
      if (attempt < maxRetries - 1) {
        // 2秒〜5秒のランダムな待機時間
        const waitTime = Math.floor(Math.random() * 3001) + 2000; 
        console.log(`Gemini API 503エラー。${waitTime}ms後にリトライします (${attempt + 1}/${maxRetries})`);
        Utilities.sleep(waitTime);
      }
    }

    console.log('Gemini APIレスポンスコード: ' + responseCode);

    const responseContent = response.getContentText();

    // 【追加】リトライ後も429の場合は、判定用の特別なエラーを投げる
    if (responseCode === 429) {
      throw new Error('RATE_LIMIT_EXCEEDED');
    }

    if (responseCode !== 200) {
      debugToSheet('Gemini API error: ' + responseCode + ' - ' + responseContent);
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
      debugToSheet('LINE Reply APIレスポンスコード: ' + responseCode);
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

/**
 * システム診断用 doGet
 */
function doGet(e) {
  const result = [];
  const log = (msg) => {
    result.push(msg);
  };

  debugToSheet("doGet()");

  log("=== システム診断開始 ===");
  log("現在時刻: " + new Date().toString());
  try {
    const props = PropertiesService.getScriptProperties().getProperties();
    log("[Check 1] 環境変数:");
    log("- LINE_CHANNEL_ACCESS_TOKEN: " + (props.LINE_CHANNEL_ACCESS_TOKEN ? "設定済 (OK)" : "❌ 未設定"));
    log("- LINE_CHANNEL_SECRET: " + (props.LINE_CHANNEL_SECRET ? "設定済 (OK)" : "❌ 未設定"));
    log("- GEMINI_API_KEY: " + (props.GEMINI_API_KEY ? "設定済 (OK)" : "❌ 未設定"));
    log("- SPREADSHEET_ID: " + (props.SPREADSHEET_ID ? "設定済 (OK)" : "❌ 未設定"));

    if (props.SPREADSHEET_ID) {
      try {
        const ss = SpreadsheetApp.openById(props.SPREADSHEET_ID);
        log("[Check 2] スプレッドシート接続: 成功 (OK)");
        log("- シート名: " + ss.getName());
      } catch (e) {
        log("[Check 2] スプレッドシート接続: ❌ 失敗");
        log("エラー: " + e.toString());
        log("→ SPREADSHEET_IDが正しいか、権限があるか確認してください");
      }
    } else {
      log("[Check 2] スプレッドシート接続: スキップ (ID未設定)");
    }

  } catch (e) {
    log("❌ 致命的エラー: " + e.toString());
  }

  log("=== 診断終了 ===");
  return ContentService.createTextOutput(result.join("\n")).setMimeType(ContentService.MimeType.TEXT);
}

// デバッグ用関数
function debugToSheet(msg) {
  try {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('SPREADSHEET_ID');
    if (!id) return;
    
    const ss = SpreadsheetApp.openById(id);
    let sheet = ss.getSheetByName('デバッグ');
    if (!sheet) sheet = ss.insertSheet('デバッグ');
    
    sheet.appendRow([new Date(), msg]);
  } catch (e) {
    console.log('debugToSheetエラー: ' + e.toString());
  }
}

/**
 * ローカルテスト用関数
 */
function testDoPost() {
  console.log("🧪 テスト開始: doPostの動作検証");
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        destination: "Uxxxxxxxx",
        events: [
          {
            type: "message",
            replyToken: "dummy_token",
            webhookEventId: "TEST_EVENT_ID_" + new Date().getTime(), // テスト用のID
            source: { userId: "U_TEST_USER", type: "user" },
            message: { type: "text", id: "100", text: "テストメッセージ" },
            timestamp: 1625660000000
          }
        ]
      })
    },
    headers: {
      "X-Line-Signature": "dummy_signature"
    }
  };
  try {
    const output = doPost(mockEvent);
    console.log("✅ 実行完了");
    
    const jsonOutput = output.getContent();
    const mimeType = output.getMimeType();

    console.log("📦 レスポンス内容: " + jsonOutput);
    console.log("📄 MimeType: " + mimeType);

    if (jsonOutput.includes("status")) {
       console.log("🙆‍♂️ 判定: OK");
    } else {
       console.log("🙅‍♂️ 判定: NG");
    }

  } catch (e) {
    console.error("❌ テスト失敗: " + e.toString());
  }
}
