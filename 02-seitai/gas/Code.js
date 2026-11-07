/**
 * こもれび整体院 予約管理（制作サンプル） / produced by IDELO
 *
 * できること
 *  1. WEB予約フォームからの予約を Googleスプレッドシートに自動記録
 *  2. 同じ時間帯の重複予約・定休日・営業時間外の予約を自動でお断り
 *  3. お客さまへ予約確認メール、院へ新規予約の通知メールを自動送信
 *  4. 前日18時にリマインドメールを自動送信
 *  5. スプレッドシートのメニューから「明日の予約一覧」をワンクリック作成
 */

// ===== 設定（院ごとに変更する箇所） =====
const CONFIG = {
  SHOP_NAME: 'こもれび整体院',
  SHOP_TEL: '000-000-0000',
  OWNER_EMAIL: '',            // 空なら、スクリプトを実行しているGoogleアカウント宛て
  CLOSED_DAYS: [3],           // 定休日（0=日, 1=月, … 6=土）
  BOOKING_DAYS_AHEAD: 60,     // 何日先まで予約を受け付けるか
  BEDS: 1,                    // 同時に施術できる人数
  HOURS: {                    // 営業時間帯（休憩を挟む場合は複数）
    weekday: [['10:00', '13:00'], ['14:00', '20:00']],
    weekend: [['10:00', '13:00'], ['14:00', '18:00']],
  },
  MENUS: {                    // メニュー名: 所要時間（分）※フォームの選択肢と一致させる
    '初回 整体コース（60分）': 60,
    '整体コース（45分）': 45,
    'じっくり整体コース（75分）': 75,
  },
  REMINDER_HOUR: 18,          // 前日リマインドを送る時刻
};

const SHEET_NAME = '予約一覧';
const HEADERS = ['予約ID', '受付日時', '予約日', '開始', '終了', 'メニュー', 'お名前', '電話番号', 'メール', 'ご要望', 'ステータス', 'リマインド送信'];
const COL = Object.fromEntries(HEADERS.map((h, i) => [h, i]));
const STATUS = { BOOKED: '予約済', CANCELED: 'キャンセル', DONE: '来院済' };

// ===== 初期設定（最初に1回だけ実行） =====
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#5b7a5e').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  // 日付・時刻は文字列で保存（タイムゾーンのずれを防ぐ）
  sheet.getRange('C:E').setNumberFormat('@');
  sheet.getRange('H:H').setNumberFormat('@');

  // ステータス列をプルダウンに
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(STATUS), true).build();
  sheet.getRange(2, COL['ステータス'] + 1, sheet.getMaxRows() - 1, 1).setDataValidation(rule);

  // 前日リマインドのトリガーを作り直す
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendReminders')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendReminders').timeBased().everyDays(1).atHour(CONFIG.REMINDER_HOUR).create();

  safeAlert_('初期設定が完了しました。\n次に「デプロイ → 新しいデプロイ → ウェブアプリ」で公開してください。');
}

// ===== スプレッドシートのメニュー =====
function onOpen() {
  SpreadsheetApp.getUi().createMenu('予約管理')
    .addItem('明日の予約一覧を作成', 'createTomorrowList')
    .addItem('リマインドを今すぐ送信（テスト）', 'sendReminders')
    .addSeparator()
    .addItem('初期設定', 'setup')
    .addToUi();
}

// ===== WEB予約の受付（ウェブアプリ） =====
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 同時送信による二重予約を防ぐ
    const p = normalize_(e && e.parameter ? e.parameter : {});
    const error = validate_(p);
    if (error) return json_({ ok: false, message: error });

    const sheet = getSheet_();
    const end = addMinutes_(p.time, CONFIG.MENUS[p.menu]);
    if (countOverlaps_(sheet, p.date, p.time, end) >= CONFIG.BEDS) {
      return json_({ ok: false, message: '申し訳ありません。その時間帯はすでに予約が入っています。別の時間をお選びください。' });
    }

    const id = 'R' + Utilities.formatDate(new Date(), tz_(), 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
    const row = new Array(HEADERS.length).fill('');
    row[COL['予約ID']] = id;
    row[COL['受付日時']] = new Date();
    row[COL['予約日']] = p.date;
    row[COL['開始']] = p.time;
    row[COL['終了']] = end;
    row[COL['メニュー']] = p.menu;
    row[COL['お名前']] = p.name;
    row[COL['電話番号']] = p.tel;
    row[COL['メール']] = p.email;
    row[COL['ご要望']] = p.note;
    row[COL['ステータス']] = STATUS.BOOKED;
    sheet.appendRow(row);
    SpreadsheetApp.flush();

    sendConfirmation_(p, id, end);
    notifyOwner_(p, id, end);
    return json_({ ok: true, id: id });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, message: 'システムエラーが発生しました。お手数ですがお電話でご予約ください。' });
  } finally {
    lock.releaseLock();
  }
}

// 動作確認用（ブラウザでURLを開くと表示）
function doGet() {
  return json_({ ok: true, message: CONFIG.SHOP_NAME + ' 予約API は稼働中です。' });
}

// ===== 入力チェック =====
function normalize_(p) {
  const s = v => String(v || '').trim();
  return {
    date: s(p.date), time: s(p.time), menu: s(p.menu),
    name: s(p.name).slice(0, 50), tel: s(p.tel).slice(0, 20),
    email: s(p.email).slice(0, 100), note: s(p.note).slice(0, 500),
  };
}

function validate_(p) {
  if (!p.date || !p.time || !p.menu || !p.name || !p.tel || !p.email) return '必須項目が入力されていません。';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return 'メールアドレスの形式が正しくありません。';
  if (!(p.menu in CONFIG.MENUS)) return 'メニューの指定が正しくありません。';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !/^\d{2}:\d{2}$/.test(p.time)) return '日時の形式が正しくありません。';

  const d = parseDate_(p.date);
  const today = parseDate_(Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'));
  const diff = Math.round((d - today) / 86400000);
  if (diff < 1) return '当日のご予約はお電話でお願いします。';
  if (diff > CONFIG.BOOKING_DAYS_AHEAD) return CONFIG.BOOKING_DAYS_AHEAD + '日先までのご予約を承っています。';
  if (CONFIG.CLOSED_DAYS.includes(d.getDay())) return 'ご希望日は定休日です。';

  const end = addMinutes_(p.time, CONFIG.MENUS[p.menu]);
  const blocks = (d.getDay() === 0 || d.getDay() === 6) ? CONFIG.HOURS.weekend : CONFIG.HOURS.weekday;
  const fits = blocks.some(([open, close]) => p.time >= open && end <= close);
  if (!fits) return 'ご希望の時間ではメニューが営業時間内に収まりません。別の時間をお選びください。';
  return null;
}

function countOverlaps_(sheet, date, start, end) {
  const values = sheet.getDataRange().getDisplayValues().slice(1);
  return values.filter(r =>
    r[COL['予約日']] === date &&
    r[COL['ステータス']] !== STATUS.CANCELED &&
    r[COL['開始']] < end && start < r[COL['終了']]
  ).length;
}

// ===== メール =====
function sendConfirmation_(p, id, end) {
  const body = [
    p.name + ' 様',
    '',
    'このたびは' + CONFIG.SHOP_NAME + 'をご予約いただき、ありがとうございます。',
    '以下の内容でご予約を承りました。',
    '',
    '――――――――――――――',
    '予約番号：' + id,
    '日時　　：' + formatJpDate_(p.date) + ' ' + p.time + '〜' + end,
    'メニュー：' + p.menu,
    '――――――――――――――',
    '',
    '・動きやすいお着替えをご用意しています。',
    '・変更・キャンセルは前日までにお電話（' + CONFIG.SHOP_TEL + '）でお願いします。',
    '',
    'ご来院を心よりお待ちしております。',
    CONFIG.SHOP_NAME,
  ].join('\n');
  MailApp.sendEmail({ to: p.email, subject: '【' + CONFIG.SHOP_NAME + '】ご予約確認（' + formatJpDate_(p.date) + ' ' + p.time + '）', body: body, name: CONFIG.SHOP_NAME });
}

function notifyOwner_(p, id, end) {
  const to = CONFIG.OWNER_EMAIL || Session.getEffectiveUser().getEmail();
  const body = [
    '新しいWEB予約が入りました。',
    '',
    '予約番号：' + id,
    '日時　　：' + formatJpDate_(p.date) + ' ' + p.time + '〜' + end,
    'メニュー：' + p.menu,
    'お名前　：' + p.name,
    '電話番号：' + p.tel,
    'メール　：' + p.email,
    'ご要望　：' + (p.note || '（なし）'),
    '',
    SpreadsheetApp.getActiveSpreadsheet().getUrl(),
  ].join('\n');
  MailApp.sendEmail(to, '【新規予約】' + formatJpDate_(p.date) + ' ' + p.time + ' ' + p.name + '様', body);
}

// ===== 前日リマインド（毎日 REMINDER_HOUR 時に自動実行） =====
function sendReminders() {
  const sheet = getSheet_();
  const tomorrow = Utilities.formatDate(new Date(Date.now() + 86400000), tz_(), 'yyyy-MM-dd');
  const values = sheet.getDataRange().getDisplayValues();
  let sent = 0;

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[COL['予約日']] !== tomorrow || r[COL['ステータス']] !== STATUS.BOOKED || r[COL['リマインド送信']]) continue;
    const body = [
      r[COL['お名前']] + ' 様',
      '',
      '明日のご予約のお知らせです。',
      '',
      '日時　　：' + formatJpDate_(r[COL['予約日']]) + ' ' + r[COL['開始']] + '〜' + r[COL['終了']],
      'メニュー：' + r[COL['メニュー']],
      '',
      'ご都合が悪くなった場合は、お電話（' + CONFIG.SHOP_TEL + '）でご連絡ください。',
      'お気をつけてお越しください。',
      CONFIG.SHOP_NAME,
    ].join('\n');
    MailApp.sendEmail({ to: r[COL['メール']], subject: '【' + CONFIG.SHOP_NAME + '】明日のご予約のお知らせ', body: body, name: CONFIG.SHOP_NAME });
    sheet.getRange(i + 1, COL['リマインド送信'] + 1).setValue(new Date());
    sent++;
  }
  console.log('リマインド送信：' + sent + '件');
}

// ===== 明日の予約一覧（印刷・共有用） =====
function createTomorrowList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tomorrow = Utilities.formatDate(new Date(Date.now() + 86400000), tz_(), 'yyyy-MM-dd');
  const rows = getSheet_().getDataRange().getDisplayValues().slice(1)
    .filter(r => r[COL['予約日']] === tomorrow && r[COL['ステータス']] !== STATUS.CANCELED)
    .sort((a, b) => a[COL['開始']].localeCompare(b[COL['開始']]))
    .map(r => [r[COL['開始']] + '〜' + r[COL['終了']], r[COL['お名前']], r[COL['メニュー']], r[COL['電話番号']], r[COL['ご要望']]]);

  const name = '予約表_' + tomorrow;
  const old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);
  const sheet = ss.insertSheet(name);
  sheet.getRange(1, 1).setValue(formatJpDate_(tomorrow) + ' の予約（' + rows.length + '件）').setFontSize(14).setFontWeight('bold');
  sheet.getRange(3, 1, 1, 5).setValues([['時間', 'お名前', 'メニュー', '電話番号', 'ご要望']]).setFontWeight('bold').setBackground('#f6f1e8');
  if (rows.length) sheet.getRange(4, 1, rows.length, 5).setValues(rows);
  sheet.autoResizeColumns(1, 5);
  sheet.activate();
}

// ===== テスト用：サイトを使わずに予約処理を試す =====
// 次の営業日の10:00で、自分宛てにテスト予約を1件入れる。
// 2回続けて実行すると、2回目は「すでに予約が入っています」になるのが正常。
function testBooking() {
  let d = new Date(Date.now() + 86400000);
  while (CONFIG.CLOSED_DAYS.includes(d.getDay())) d = new Date(d.getTime() + 86400000);
  const params = {
    date: Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'),
    time: '10:00',
    menu: Object.keys(CONFIG.MENUS)[0],
    name: 'テスト 太郎',
    tel: '090-0000-0000',
    email: Session.getEffectiveUser().getEmail(),
    note: 'テスト予約です',
  };
  const res = doPost({ parameter: params });
  console.log(res.getContent());
}

// ===== ユーティリティ =====
function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('「' + SHEET_NAME + '」シートがありません。setup() を実行してください。');
  return sheet;
}
function tz_() { return Session.getScriptTimeZone() || 'Asia/Tokyo'; }
function parseDate_(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addMinutes_(hhmm, min) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + min;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
function formatJpDate_(s) {
  const d = parseDate_(s);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'[d.getDay()] + '）';
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function safeAlert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
