/* =========================================================================
   MAISON ROYALE — core.js
   Logique partagée par toutes les pages :
   - CONFIG (personnalisable)
   - État + sauvegarde (localStorage)
   - Comptes (inscription / connexion / invité)
   - Chrome du site (en-tête, navigation, pied de page, modale)
   - Effets premium (toasts, confettis, pluie de pièces, son)
   - Révélations au scroll
   ========================================================================= */

/* -------------------------------------------------------------------------
   1. CONFIGURATION  — modifie librement ces valeurs
   ------------------------------------------------------------------------- */
const CONFIG = {
  brand:        "Maison Royale",
  tagline:      "Casino Virtuel",
  currency:     "jetons",
  coin:         "♛",
  startBalance: 1000,        // solde de départ d'un nouveau compte
  // Navigation principale (libellé + fichier)
  nav: [
    { label: "Accueil",    href: "index.html"     },
    { label: "Jeux",       href: "jeux.html"      },
    { label: "Mini-jeux",  href: "minijeux.html"  },
    { label: "À propos",   href: "apropos.html"   },
    { label: "Contact",    href: "contact.html"   },
  ],
};

/* -------------------------------------------------------------------------
   2. ÉTAT & SAUVEGARDE
   ------------------------------------------------------------------------- */
const Store = {
  KEY_ACCOUNTS: "royale.accounts",
  KEY_SESSION:  "royale.session",
  saveKey(user){ return "royale.save." + (user || "__invite__"); },

  readJSON(key, fallback){
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  writeJSON(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){ /* quota */ }
  },

  getAccounts(){ return this.readJSON(this.KEY_ACCOUNTS, {}); },
  getSession(){  return localStorage.getItem(this.KEY_SESSION) || null; },
  setSession(u){ u ? localStorage.setItem(this.KEY_SESSION, u) : localStorage.removeItem(this.KEY_SESSION); },

  freshSave(){
    return {
      balance: CONFIG.startBalance,
      stats: { played:0, won:0, lost:0, biggestWin:0, wagered:0 },
      cooldowns: {},               // pour les mini-jeux
      settings: { sound:true },
      createdAt: Date.now(),
    };
  },
  loadSave(user){
    const s = this.readJSON(this.saveKey(user), null);
    return s || this.freshSave();
  },
  persist(){ this.writeJSON(this.saveKey(State.user), State.save); },
};

const State = {
  user: null,                // null = invité
  save: null,

  init(){
    this.user = Store.getSession();             // peut être null (invité)
    this.save = Store.loadSave(this.user);
  },
  get balance(){ return this.save.balance; },

  /* Ajoute (ou retire) des jetons. delta peut être négatif. */
  addBalance(delta, opts = {}){
    delta = Math.round(delta);
    this.save.balance = Math.max(0, this.save.balance + delta);
    Store.persist();
    UI.updateBalance(opts.animate !== false);
    return this.save.balance;
  },
  /* Tente de miser : renvoie true si le solde suffit et débite. */
  bet(amount){
    if (amount <= 0 || amount > this.save.balance) return false;
    this.save.balance -= amount;
    this.save.stats.wagered += amount;
    Store.persist();
    UI.updateBalance();
    return true;
  },
  /* Enregistre l'issue d'une partie (payout = gain total rendu, 0 si perdu). */
  settle(payout, isWin){
    this.save.stats.played++;
    if (isWin){
      this.save.stats.won++;
      this.save.balance += payout;
      if (payout > this.save.stats.biggestWin) this.save.stats.biggestWin = payout;
    } else {
      this.save.stats.lost++;
    }
    Store.persist();
    UI.updateBalance();
  },

  /* ---- Comptes ---- */
  register(user, pwd){
    user = (user||"").trim();
    if (user.length < 3) return { ok:false, err:"Pseudo : 3 caractères minimum." };
    if (pwd.length < 3)  return { ok:false, err:"Code : 3 caractères minimum." };
    const accounts = Store.getAccounts();
    if (accounts[user.toLowerCase()]) return { ok:false, err:"Ce pseudo est déjà pris." };
    accounts[user.toLowerCase()] = { name:user, pwd:btoa(pwd), created:Date.now() };
    Store.writeJSON(Store.KEY_ACCOUNTS, accounts);
    this._switchTo(user.toLowerCase());
    return { ok:true };
  },
  login(user, pwd){
    user = (user||"").trim().toLowerCase();
    const accounts = Store.getAccounts();
    const acc = accounts[user];
    if (!acc) return { ok:false, err:"Compte introuvable." };
    if (acc.pwd !== btoa(pwd)) return { ok:false, err:"Code incorrect." };
    this._switchTo(user);
    return { ok:true };
  },
  _switchTo(userKey){
    Store.setSession(userKey);
    this.user = userKey;
    this.save = Store.loadSave(userKey);
    UI.updateBalance(false);
    UI.refreshAccountUI();
  },
  logout(){
    Store.setSession(null);
    this.user = null;
    this.save = Store.loadSave(null);
    UI.updateBalance(false);
    UI.refreshAccountUI();
  },
  displayName(){
    if (!this.user) return "Invité";
    const acc = Store.getAccounts()[this.user];
    return acc ? acc.name : this.user;
  },
};

/* -------------------------------------------------------------------------
   3. SON (WebAudio — aucun fichier externe)
   ------------------------------------------------------------------------- */
const Sound = {
  ctx:null,
  ensure(){ if(!this.ctx){ try{ this.ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch{} } },
  on(){ return State.save && State.save.settings.sound; },
  tone(freq, dur=0.12, type="sine", gain=0.06, when=0){
    if (!this.on()) return;
    this.ensure(); if(!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t+dur);
  },
  click(){ this.tone(520,0.05,"triangle",0.04); },
  win(){ [523,659,784,1046].forEach((f,i)=>this.tone(f,0.22,"sine",0.07,i*0.09)); },
  bigWin(){ [392,523,659,784,1046,1318].forEach((f,i)=>this.tone(f,0.3,"sine",0.08,i*0.08)); },
  lose(){ this.tone(220,0.25,"sine",0.05); this.tone(180,0.3,"sine",0.05,0.1); },
  spin(){ this.tone(140,0.4,"sawtooth",0.02); },
};

/* -------------------------------------------------------------------------
   4. EFFETS VISUELS
   ------------------------------------------------------------------------- */
const Effects = {
  canvas:null, ctx:null, parts:[], raf:null,

  initCanvas(){
    this.canvas = document.getElementById("fx-canvas");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", ()=>this.resize());
  },
  resize(){ if(this.canvas){ this.canvas.width=innerWidth; this.canvas.height=innerHeight; } },

  burst(n=120, gold=true){
    if (!this.canvas) return;
    this.canvas.style.display="block";
    const colors = gold ? ["#f6e7b4","#d4af37","#a87f2b","#fff7e0"]
                        : ["#6fe3a0","#d6b6ff","#6ea8ff","#f6e7b4"];
    for (let i=0;i<n;i++){
      this.parts.push({
        x: innerWidth/2 + (Math.random()-0.5)*200,
        y: innerHeight/2,
        vx:(Math.random()-0.5)*14,
        vy:(Math.random()*-16)-4,
        g:0.4+Math.random()*0.3,
        size:6+Math.random()*8,
        rot:Math.random()*6, vr:(Math.random()-0.5)*0.4,
        color:colors[(Math.random()*colors.length)|0],
        life:1, shape: Math.random()<0.4 ? "coin":"rect",
      });
    }
    if (!this.raf) this.loop();
  },
  loop(){
    const c=this.ctx; c.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.parts.forEach(p=>{
      p.vy+=p.g; p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr; p.life-=0.008;
      c.save(); c.globalAlpha=Math.max(0,p.life); c.translate(p.x,p.y); c.rotate(p.rot);
      c.fillStyle=p.color;
      if (p.shape==="coin"){ c.beginPath(); c.ellipse(0,0,p.size,p.size*0.7,0,0,7); c.fill();
        c.fillStyle="rgba(0,0,0,.15)"; c.beginPath(); c.ellipse(0,0,p.size*0.5,p.size*0.35,0,0,7); c.fill(); }
      else c.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.5);
      c.restore();
    });
    this.parts = this.parts.filter(p=>p.life>0 && p.y < this.canvas.height+60);
    if (this.parts.length){ this.raf=requestAnimationFrame(()=>this.loop()); }
    else { this.raf=null; this.canvas.style.display="none"; }
  },

  /* Grand overlay de victoire */
  win(amount, big=false){
    const ov = document.getElementById("win-overlay");
    if (!ov) return;
    ov.innerHTML = `<div class="win-burst">
        <div class="big gold-text">${big ? "JACKPOT" : "GAGNÉ"}</div>
        <div class="amt">${CONFIG.coin} +${UI.fmt(amount)}</div>
      </div>`;
    ov.classList.add("show");
    this.burst(big?220:120, true);
    big ? Sound.bigWin() : Sound.win();
    clearTimeout(this._wt);
    this._wt = setTimeout(()=>ov.classList.remove("show"), big?2600:1700);
  },
};

/* -------------------------------------------------------------------------
   5. INTERFACE (chrome + helpers)
   ------------------------------------------------------------------------- */
const UI = {
  fmt(n){ return Math.round(n).toLocaleString("fr-FR"); },

  toast(msg, type="", icon="✦"){
    const zone = document.getElementById("toast-zone"); if(!zone) return;
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.innerHTML = `<span class="ic">${icon}</span><span>${msg}</span>`;
    zone.appendChild(t);
    requestAnimationFrame(()=>t.classList.add("show"));
    setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(),500); }, 3200);
  },

  /* Anime la pastille de solde (count-up) */
  updateBalance(animate=true){
    const el = document.querySelector(".balance-pill .amount");
    if (!el) return;
    const target = State.balance;
    const pill = document.querySelector(".balance-pill");
    if (!animate){ el.textContent = this.fmt(target); return; }
    const from = parseInt(el.dataset.cur || el.textContent.replace(/\D/g,"")) || 0;
    if (pill){ pill.classList.remove("pulse"); void pill.offsetWidth; pill.classList.add("pulse"); }
    const dur=600, t0=performance.now();
    const step = (t)=>{
      const p = Math.min(1,(t-t0)/dur);
      const e = 1-Math.pow(1-p,3);
      const val = Math.round(from + (target-from)*e);
      el.textContent = this.fmt(val); el.dataset.cur = val;
      if (p<1) requestAnimationFrame(step); else el.dataset.cur = target;
    };
    requestAnimationFrame(step);
  },

  /* ---- Construction de l'en-tête ---- */
  buildHeader(){
    const active = document.body.dataset.page || "";
    const header = document.createElement("header");
    header.id = "site-header";
    const links = CONFIG.nav.map(n=>{
      const file = n.href.replace(".html","");
      const isActive = (file===active) || (active===""&&file==="index");
      return `<a href="${n.href}" class="${isActive?"active":""}">${n.label}</a>`;
    }).join("");
    header.innerHTML = `
      <div class="container header-inner">
        <a href="index.html" class="brand">
          ${this.crestSVG(38)}
          <span class="brand-name">${CONFIG.brand}<small>${CONFIG.tagline}</small></span>
        </a>
        <nav class="nav-main">${links}</nav>
        <div class="header-right">
          <div class="balance-pill" id="balance-pill" title="Votre solde">
            <span class="coin gold-text">${CONFIG.coin}</span>
            <span class="amount" data-cur="0">0</span>
          </div>
          <button class="btn-account" id="open-account" aria-label="Compte">
            <span id="account-initial">?</span>
          </button>
          <button class="nav-toggle" id="nav-toggle" aria-label="Menu"><span></span></button>
        </div>
      </div>`;
    document.body.prepend(header);

    // Comportements
    const onScroll = ()=> header.classList.toggle("scrolled", window.scrollY>20);
    window.addEventListener("scroll", onScroll); onScroll();

    document.getElementById("open-account").addEventListener("click", ()=>{ Sound.click(); this.openAccountModal(); });
    document.getElementById("balance-pill").addEventListener("click", ()=>{ Sound.click(); this.openAccountModal(); });

    const toggle = document.getElementById("nav-toggle");
    const navEl = header.querySelector(".nav-main");
    toggle.addEventListener("click", ()=> navEl.classList.toggle("open"));
  },

  crestSVG(size=38){
    return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f7ecc1"/><stop offset="0.5" stop-color="#d8b25e"/><stop offset="1" stop-color="#a87f2b"/>
      </linearGradient></defs>
      <path d="M8 34 L8 18 L16 24 L24 12 L32 24 L40 18 L40 34 Z" fill="url(#cg)"/>
      <rect x="8" y="34" width="32" height="5" rx="2" fill="url(#cg)"/>
      <circle cx="8" cy="16" r="3" fill="url(#cg)"/><circle cx="24" cy="9" r="3.4" fill="url(#cg)"/><circle cx="40" cy="16" r="3" fill="url(#cg)"/>
    </svg>`;
  },

  /* ---- Pied de page ---- */
  buildFooter(){
    const footer = document.createElement("footer");
    footer.id = "site-footer";
    const col = (title, items)=>`<div><h4>${title}</h4>${items.map(i=>`<a href="${i.href}">${i.label}</a>`).join("")}</div>`;
    footer.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div class="footer-about">
            <a href="index.html" class="brand">${this.crestSVG(34)}
              <span class="brand-name">${CONFIG.brand}</span></a>
            <p>L'élégance du jeu, sans le moindre risque. Une expérience de casino entièrement virtuelle, propulsée par des jetons fictifs.</p>
          </div>
          ${col("Jeux", [
            {label:"Roulette", href:"roulette.html"},
            {label:"Blackjack", href:"blackjack.html"},
            {label:"Machines à sous", href:"machines.html"},
            {label:"Tous les jeux", href:"jeux.html"},
          ])}
          ${col("Farmer", [
            {label:"Roue de la fortune", href:"minijeux.html"},
            {label:"Mémoire royale", href:"minijeux.html"},
            {label:"Réflexe doré", href:"minijeux.html"},
          ])}
          ${col("Maison", [
            {label:"À propos", href:"apropos.html"},
            {label:"Contact", href:"contact.html"},
            {label:"Jeu responsable", href:"apropos.html#responsable"},
          ])}
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} ${CONFIG.brand} — Casino virtuel à but ludique.</span>
          <span class="disclaimer">Aucune somme réelle n'est en jeu. Les jetons n'ont aucune valeur marchande et ne peuvent être ni achetés ni échangés.</span>
        </div>
      </div>`;
    document.body.appendChild(footer);
  },

  /* ---- Modale de compte ---- */
  buildModal(){
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "account-modal";
    ov.innerHTML = `
      <div class="modal corner-deco">
        <button class="modal-close" id="modal-close" aria-label="Fermer">✕</button>
        <div id="modal-body"></div>
      </div>`;
    document.body.appendChild(ov);
    document.getElementById("modal-close").addEventListener("click", ()=>this.closeModal());
    ov.addEventListener("click", e=>{ if(e.target===ov) this.closeModal(); });
    document.addEventListener("keydown", e=>{ if(e.key==="Escape") this.closeModal(); });
  },
  openAccountModal(){
    this.renderModalBody();
    document.getElementById("account-modal").classList.add("open");
  },
  closeModal(){ document.getElementById("account-modal").classList.remove("open"); },

  renderModalBody(){
    const body = document.getElementById("modal-body");
    if (State.user){
      const s = State.save.stats;
      const winRate = s.played ? Math.round(s.won/s.played*100) : 0;
      body.innerHTML = `
        <div class="account-info">
          <div class="avatar">${State.displayName().charAt(0).toUpperCase()}</div>
          <div class="uname">${State.displayName()}</div>
          <div class="sub">Membre de la ${CONFIG.brand}</div>
          <div class="stats-mini">
            <div><div class="n">${this.fmt(State.balance)}</div><div class="l">Jetons</div></div>
            <div><div class="n">${s.played}</div><div class="l">Parties</div></div>
            <div><div class="n">${winRate}%</div><div class="l">Réussite</div></div>
            <div><div class="n">${this.fmt(s.biggestWin)}</div><div class="l">Plus gros gain</div></div>
          </div>
          <button class="btn btn-ghost btn-block" id="toggle-sound">${State.save.settings.sound?"🔊 Son activé":"🔇 Son coupé"}</button>
          <div style="height:10px"></div>
          <button class="btn btn-gold btn-block" id="logout-btn">Se déconnecter</button>
        </div>`;
      document.getElementById("logout-btn").addEventListener("click", ()=>{
        State.logout(); this.toast("À bientôt !", "", "👋"); this.renderModalBody();
      });
      document.getElementById("toggle-sound").addEventListener("click", ()=>{
        State.save.settings.sound = !State.save.settings.sound; Store.persist(); this.renderModalBody();
      });
    } else {
      body.innerHTML = `
        <h3 class="gold-text">Bienvenue</h3>
        <p class="sub">Créez un compte pour sauvegarder vos jetons</p>
        <div class="tabs">
          <button class="active" data-tab="login">Connexion</button>
          <button data-tab="register">Inscription</button>
        </div>
        <div class="modal-err" id="modal-err"></div>
        <div class="field"><label>Pseudo</label><input id="m-user" autocomplete="username" placeholder="VotrePseudo"></div>
        <div class="field"><label>Code secret</label><input id="m-pwd" type="password" autocomplete="current-password" placeholder="••••"></div>
        <button class="btn btn-gold btn-block" id="m-submit">Se connecter</button>
        <p class="sub" style="margin:18px 0 0; font-size:.82rem;">
          Pas envie de compte ? <a href="#" id="guest-link" style="color:var(--gold-1)">Continuer en invité</a>
        </p>`;
      let mode = "login";
      const err = body.querySelector("#modal-err");
      const submit = body.querySelector("#m-submit");
      body.querySelectorAll(".tabs button").forEach(b=>{
        b.addEventListener("click", ()=>{
          body.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));
          b.classList.add("active"); mode=b.dataset.tab; err.textContent="";
          submit.textContent = mode==="login" ? "Se connecter" : "Créer mon compte";
        });
      });
      const doSubmit = ()=>{
        const u = body.querySelector("#m-user").value;
        const p = body.querySelector("#m-pwd").value;
        const res = mode==="login" ? State.login(u,p) : State.register(u,p);
        if (res.ok){ this.toast(mode==="login"?`Ravi de vous revoir, ${State.displayName()} !`:`Compte créé — bienvenue !`, "win", "♛"); this.closeModal(); this.renderModalBody(); }
        else err.textContent = res.err;
      };
      submit.addEventListener("click", doSubmit);
      body.querySelector("#m-pwd").addEventListener("keydown", e=>{ if(e.key==="Enter") doSubmit(); });
      body.querySelector("#guest-link").addEventListener("click", e=>{ e.preventDefault(); this.closeModal(); this.toast("Mode invité — vos jetons sont sauvegardés localement.", "", "✦"); });
    }
  },
  refreshAccountUI(){
    const init = document.getElementById("account-initial");
    if (init) init.textContent = State.user ? State.displayName().charAt(0).toUpperCase() : "?";
  },

  /* ---- Révélations au scroll ---- */
  initReveal(){
    const els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)){ els.forEach(e=>e.classList.add("in")); return; }
    const io = new IntersectionObserver((ents)=>{
      ents.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold:0.12 });
    els.forEach(e=>io.observe(e));
  },
};

/* -------------------------------------------------------------------------
   6. Helpers globaux pour les jeux (utilisés par les autres scripts)
   ------------------------------------------------------------------------- */
const Game = {
  /* Entier aléatoire [min,max] inclus */
  rndInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; },
  pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; },
  /* Récompense un mini-jeu (gain pur) + effets */
  reward(amount, label){
    State.addBalance(amount);
    Effects.win(amount, amount>=500);
    if (label) UI.toast(`${label} : +${UI.fmt(amount)} ${CONFIG.coin}`, "win", "💰");
  },
};

/* -------------------------------------------------------------------------
   7. INITIALISATION
   ------------------------------------------------------------------------- */
function bootChrome(){
  // Fonds atmosphériques (si pas déjà présents)
  if (!document.querySelector(".bg-atmos")){
    const a=document.createElement("div"); a.className="bg-atmos";
    const g=document.createElement("div"); g.className="bg-grain";
    document.body.prepend(g); document.body.prepend(a);
  }
  // Zones d'effets
  if (!document.getElementById("toast-zone")){
    const tz=document.createElement("div"); tz.id="toast-zone"; document.body.appendChild(tz);
  }
  if (!document.getElementById("win-overlay")){
    const wo=document.createElement("div"); wo.id="win-overlay"; document.body.appendChild(wo);
    const cv=document.createElement("canvas"); cv.id="fx-canvas"; document.body.appendChild(cv);
  }

  State.init();
  UI.buildHeader();
  UI.buildFooter();
  UI.buildModal();
  UI.updateBalance(false);
  UI.refreshAccountUI();
  UI.initReveal();
  Effects.initCanvas();

  // Transition d'entrée
  const main = document.querySelector("main");
  if (main) main.classList.add("page-fade");

  // Débloque l'audio au 1er clic (politique navigateurs)
  document.addEventListener("click", ()=>Sound.ensure(), { once:true });
}

document.addEventListener("DOMContentLoaded", bootChrome);
