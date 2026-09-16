// APPS_SCRIPT.gs — вставь в https://script.google.com (Расширения → Apps Script)
// Привяжи к таблице 1NaZqSG6sPy0R4GZklzRL9OdGKLD8XulXXZOOssMJoUY
// Деплой: Publish → Deploy as web app → Execute as: Me, Who has access: Anyone, even anonymous

const SHEET_ID = "1NaZqSG6sPy0R4GZklzRL9OdGKLD8XulXXZOOssMJoUY";
const SHEET_NAME = "Лист1"; // поменяй если лист называется иначе


function doPost(e) {
  try {
    let data = {};
  try{
    if(e.postData && e.postData.contents){
      data = JSON.parse(e.postData.contents);
    } else if(e.parameter){
      data = e.parameter;
      // e.parameter has strings, need to parse if action is there
      if(!data.action && e.postData) data = JSON.parse(e.postData.contents || '{}');
    }
  }catch(err){
    // fallback: try parameter
    data = e.parameter || {};
  }
  if(!data.email && e.parameter && e.parameter.email) data.email = e.parameter.email;
    const name = (data.name || "").toString().trim();
    const email = (data.email || "").toString().trim().toLowerCase();
    const pw_hash = (data.password_hash || "").toString().trim();
    const created = (data.created_at || new Date().toLocaleString("ru-RU")).toString();

    if (!name || !email || !pw_hash) {
      return ContentService.createTextOutput(JSON.stringify({ok:false, error:"name/email/password_hash required"}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.openById("1NaZqSG6sPy0R4GZklzRL9OdGKLD8XulXXZOOssMJoUY");
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.getSheets()[0];

    // проверка дубликата по email
    const values = sheet.getDataRange().getValues();
    for (let i=1; i<values.length; i++) {
      if (String(values[i][1]).toLowerCase().trim() === email) {
        return ContentService.createTextOutput(JSON.stringify({ok:false, error:"email already exists"}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Заголовки если пустой лист
    if (values.length === 0 || !values[0][0]) {
      sheet.getRange(1,1,1,4).setValues([["Name","Email","Password_hash","Created_at"]]);
    }

    sheet.appendRow([name, email, pw_hash, created]);

    // Чистим возможный мусор от прошлой функции кодов (Variant 1), чтобы старые pending-ключи не мешали
    try{ PropertiesService.getScriptProperties().deleteProperty('code_'+email); }catch(err){}

    return ContentService.createTextOutput(JSON.stringify({ok:true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false, error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ok:true, msg:"Use POST"}))
    .setMimeType(ContentService.MimeType.JSON);
}

// простой хеш как в JS (для сверки, не используется напрямую тк хеш приходит с клиента)
function hash(s){
  let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return String(h);
}

// РАЗОВАЯ чистка: запусти вручную (Выполнить → clearPendingCodes), чтобы удалить старые коды Variant 1
function clearPendingCodes(){
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  let n = 0;
  for(const k in all){ if(k.indexOf('code_') === 0){ props.deleteProperty(k); n++; } }
  console.log('Удалено pending-кодов: ' + n);
}
