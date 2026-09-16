// БД на Google Таблице
// Sheet ID: 1NaZqSG6sPy0R4GZklzRL9OdGKLD8XulXXZOOssMJoUY
// Для ЗАПИСИ нужен Apps Script Web App (см. APPS_SCRIPT.gs)
// ЧТЕНИЕ работает без скрипта через gviz (публичный доступ "Читатель для всех у кого есть ссылка")

const DB = {
  SHEET_ID: "1NaZqSG6sPy0R4GZklzRL9OdGKLD8XulXXZOOssMJoUY",
  // Вставь сюда URL веб-приложения из Apps Script после деплоя, например: https://script.google.com/macros/s/AKfycbx.../exec
  // Если оставить пустым — запись пойдет только в localStorage (кеш), чтение — из Таблицы
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbz5FxZSB5Xm-avIaCKGn9919oQ4snEjtDy8g8ggHtr58HEGRuus7Y8l7jlhF95Fc1b-jA/exec",

  KEY_CACHE: "fng_sheet_cache",
  KEY_SESSION: "fng_session",

  hash(s){
    // простой хеш для демо (совпадает с Apps Script)
    let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return String(h);
  },

  // --- кеш в localStorage (для мгновенной работы без ожидания сети) ---
  getCache(){
    try{ return JSON.parse(localStorage.getItem(this.KEY_CACHE)||"[]"); }catch{ return []; }
  },
  saveCache(arr){ localStorage.setItem(this.KEY_CACHE, JSON.stringify(arr)); },

  // --- Чтение из Google Таблицы через gviz ---
  async fetchFromSheet(){
    return new Promise((resolve)=>{
      const old = document.getElementById('gs_db');
      if(old) old.remove();
      window.google = window.google || {};
      window.google.visualization = window.google.visualization || {};
      let done=false;
      const timeout = setTimeout(()=>{ if(!done){ resolve(this.getCache()); } }, 4000);
      window.google.visualization.Query = {
        setResponse: (data)=>{
          done=true; clearTimeout(timeout);
          const s=document.getElementById('gs_db'); if(s) s.remove();
          if(data.status !== 'ok' || !data.table){
            resolve(this.getCache());
            return;
          }
          // Ожидаем колонки: 0=Name,1=Email,2=Password_hash,3=Created
          const users = [];
          for(const r of data.table.rows){
            const c=r.c;
            const name = c[0]?.v ? String(c[0].v).trim() : "";
            const email = c[1]?.v ? String(c[1].v).trim().toLowerCase() : "";
            const pw_hash = c[2]?.v ? String(c[2].v).trim() : "";
            const created = c[3]?.v ? String(c[3].v) : (c[3]?.f||"");
            if(!email) continue;
            users.push({name, email, password_hash: pw_hash, created_at: created, id: email});
          }
          this.saveCache(users);
          resolve(users);
        }
      };
      const script=document.createElement('script');
      script.id='gs_db';
      script.onerror=()=>{ done=true; clearTimeout(timeout); resolve(this.getCache()); };
      script.src=`https://docs.google.com/spreadsheets/d/${this.SHEET_ID}/gviz/tq?tqx=out:json&t=${Date.now()}`;
      document.head.appendChild(script);
    });
  },

  async getUsers(){ // алиас для совместимости
    return this.fetchFromSheet();
  },
  async getUsersSync(){ return this.getCache(); },

  async addUser({name,email,password}){
    const normEmail = email.trim().toLowerCase();
    const users = await this.fetchFromSheet();
    if(users.find(u=>u.email===normEmail)) throw new Error("Пользователь с таким email уже существует");
    if(!password || password.length<4) throw new Error("Пароль минимум 4 символа");
    const pw_hash = this.hash(password);
    const payload = {name: name.trim(), email: normEmail, password_hash: pw_hash, password_plain: password, created_at: new Date().toLocaleString('ru-RU')};

    // 1) пробуем записать в Google Таблицу через Apps Script
    // text/plain + no-cors = simple request без preflight, Apps Script точно получит e.postData.contents
    if(this.APPS_SCRIPT_URL){
      try{
        const r = await fetch(this.APPS_SCRIPT_URL, {
          method: "POST",
          mode: "no-cors", // Apps Script не отдает CORS, но запись пройдет
          headers: {"Content-Type":"text/plain;charset=utf-8"},
          body: JSON.stringify(payload)
        });
        // no-cors не дает прочитать ответ, считаем успехом
      }catch(e){
        console.warn("Apps Script запись не удалась, fallback в кеш", e);
      }
    } else {
      console.warn("APPS_SCRIPT_URL пустой — запись только в локальный кеш. Задеплой Apps Script чтобы писать в Таблицу.");
    }

    // 2) обновляем кеш
    const cache = this.getCache();
    cache.push({name: payload.name, email: payload.email, password_hash: pw_hash, created_at: payload.created_at, id: payload.email});
    this.saveCache(cache);
    return {name: payload.name, email: payload.email, password_hash: pw_hash};
  },

  async findByEmail(email){
    const users = await this.fetchFromSheet();
    return users.find(u=>u.email===email.toLowerCase()) || this.getCache().find(u=>u.email===email.toLowerCase()) || null;
  },
  async verify(email,password){
    const users = await this.fetchFromSheet();
    const norm=email.toLowerCase();
    let u = users.find(x=>x.email===norm) || this.getCache().find(x=>x.email===norm);
    if(!u) return null;
    return u.password_hash === this.hash(password) ? u : null;
  },

  // --- Сессия (хранится локально) ---
  setSession(email){ localStorage.setItem(this.KEY_SESSION, email.toLowerCase()); },
  getSessionSync(){
    const email = localStorage.getItem(this.KEY_SESSION);
    if(!email) return null;
    const cache=this.getCache();
    return cache.find(u=>u.email===email.toLowerCase()) || {name: email.split('@')[0], email};
  },
  async getSession(){
    const email = localStorage.getItem(this.KEY_SESSION);
    if(!email) return null;
    const u = await this.findByEmail(email);
    return u || this.getSessionSync();
  },
  clearSession(){ localStorage.removeItem(this.KEY_SESSION); },
  isLogged(){ return !!localStorage.getItem(this.KEY_SESSION); },

  // для админки
  async debugSheet(){ return this.fetchFromSheet(); }
};
