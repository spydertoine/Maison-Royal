/* =========================================================================
   MINI-JEUX — gains purs, aucune mise.
   Quatre divertissements offerts par la maison pour farmer les jetons :
     1. La Roue de la Fortune   (cooldown 4 h)
     2. La Mémoire Royale       (cooldown 6 min)
     3. Le Réflexe Doré         (cooldown 8 min)
     4. Pile ou Face            (cooldown 5 min, jeu de série)
   Utilise les API de core.js : Game.reward / State / Store / UI / Sound / Effects.
   ========================================================================= */
(function(){
  const $ = (id)=>document.getElementById(id);

  /* ----------------------------------------------------------------------
     Gestion des temps de recharge (persistés par compte dans save.cooldowns)
     ---------------------------------------------------------------------- */
  const Cooldowns = {
    until(key){ return (State.save.cooldowns && State.save.cooldowns[key]) || 0; },
    remaining(key){ return Math.max(0, this.until(key) - Date.now()); },
    ready(key){ return this.remaining(key) <= 0; },
    set(key, ms){
      State.save.cooldowns = State.save.cooldowns || {};
      State.save.cooldowns[key] = Date.now() + ms;
      Store.persist();
    },
  };

  /* Formate une durée (ms) en « 03 h 12 min » / « 4 min 09 s » / « 12 s ». */
  function fmtDur(ms){
    const s = Math.ceil(ms/1000);
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    if (h > 0) return `${h} h ${String(m).padStart(2,"0")} min`;
    if (m > 0) return `${m} min ${String(sec).padStart(2,"0")} s`;
    return `${sec} s`;
  }

  const H = 1000*60*60, MIN = 1000*60;

  /* =======================================================================
     1. LA ROUE DE LA FORTUNE
     ======================================================================= */
  const Fortune = (function(){
    const KEY = "fortune";
    const CD = 4*H;
    // 8 segments de taille égale (45°). Poids = probabilité (gros lots rares).
    const SEG = [
      { label:"50",  amount:50,  weight:26 },
      { label:"150", amount:150, weight:14 },
      { label:"75",  amount:75,  weight:20 },
      { label:"300", amount:300, weight:8  },
      { label:"50",  amount:50,  weight:24 },
      { label:"200", amount:200, weight:10 },
      { label:"100", amount:100, weight:18 },
      { label:"500", amount:500, weight:4  },
    ];
    const STEP = 360 / SEG.length;        // 45°
    const COLORS = ["#3b1d6e","#5a2ea6"]; // pourpres alternés
    const GOLD = "linear-gradient"; // (segment doré géré séparément)

    let wheel, btn, cd, hub, rot = 0, spinning = false, tick = null;

    function paint(){
      // Conic-gradient : départ en haut (from 0deg), sens horaire.
      const stops = SEG.map((s,i)=>{
        let col = COLORS[i % 2];
        if (s.amount >= 500) col = "#d4af37";          // grand lot doré
        else if (s.amount >= 300) col = "#7a3fb0";     // beau lot
        return `${col} ${i*STEP}deg ${(i+1)*STEP}deg`;
      });
      wheel.style.background = `conic-gradient(from 0deg, ${stops.join(", ")})`;

      // Étiquettes radiales (restent droites grâce à la contre-rotation)
      wheel.querySelectorAll(".fortune-label").forEach(n=>n.remove());
      SEG.forEach((s,i)=>{
        const a = i*STEP + STEP/2;        // angle du centre du segment
        const el = document.createElement("span");
        el.className = "fortune-label";
        el.textContent = s.label;
        el.style.width = "44px";
        el.style.marginLeft = "-22px";
        el.style.marginTop = "-12px";
        el.style.textAlign = "center";
        el.style.transform = `rotate(${a}deg) translateY(-122px) rotate(${-a}deg)`;
        if (s.amount >= 500) el.style.color = "#2a1c06";
        wheel.appendChild(el);
      });
    }

    function weightedIndex(){
      const total = SEG.reduce((t,s)=>t+s.weight, 0);
      let r = Math.random()*total;
      for (let i=0;i<SEG.length;i++){ r -= SEG[i].weight; if (r < 0) return i; }
      return SEG.length-1;
    }

    function refresh(){
      const rem = Cooldowns.remaining(KEY);
      if (rem > 0){
        btn.disabled = true;
        cd.textContent = `Prochaine rotation gratuite dans ${fmtDur(rem)}`;
        if (!tick) tick = setInterval(refresh, 1000);
      } else {
        btn.disabled = false;
        cd.textContent = "Rotation offerte — bonne chance !";
        if (tick){ clearInterval(tick); tick = null; }
      }
    }

    function spin(){
      if (spinning || !Cooldowns.ready(KEY)) return;
      spinning = true; btn.disabled = true;
      Sound.spin();

      const idx = weightedIndex();
      const center = idx*STEP + STEP/2;          // position du centre du lot
      const jitter = (Math.random()*2-1) * (STEP/2 - 6); // reste dans le segment
      // rotation horaire pour amener le centre du segment sous le pointeur (haut)
      const target = (5 + Math.floor(Math.random()*3))*360 + (360 - center) - jitter;
      rot += target;
      wheel.style.transform = `rotate(${rot}deg)`;

      setTimeout(()=>{
        const lot = SEG[idx];
        Cooldowns.set(KEY, CD);
        Game.reward(lot.amount, "Roue de la fortune");
        hub.textContent = "+" + lot.amount;
        spinning = false;
        refresh();
        setTimeout(()=>{ hub.textContent = CONFIG.coin; }, 4000);
      }, 4700); // > transition 4.5s
    }

    function init(){
      wheel = $("fortune"); btn = $("fortune-spin"); cd = $("fortune-cd"); hub = $("fortune-hub");
      if (!wheel) return;
      paint();
      btn.addEventListener("click", spin);
      refresh();
    }
    return { init };
  })();

  /* =======================================================================
     2. LA MÉMOIRE ROYALE  (memory match — 6 paires)
     ======================================================================= */
  const Memory = (function(){
    const KEY = "memory";
    const CD = 6*MIN;
    const SYMBOLS = ["♛","♠","♦","♣","♥","💎","⭐","7️⃣","🔔","🍒"];

    let grid, movesEl, btn, cd, msg, tick = null;
    let first = null, lock = false, moves = 0, matched = 0, pairs = 6, playing = false;

    function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

    function refreshCd(){
      const rem = Cooldowns.remaining(KEY);
      if (rem > 0){
        btn.disabled = true;
        cd.textContent = `Nouvelle partie dans ${fmtDur(rem)}`;
        if (!tick) tick = setInterval(refreshCd, 1000);
      } else {
        btn.disabled = false;
        cd.textContent = playing ? "" : "Prête à jouer.";
        if (tick){ clearInterval(tick); tick = null; }
      }
    }

    function build(){
      const chosen = shuffle(SYMBOLS.slice()).slice(0, pairs);
      const deck = shuffle(chosen.concat(chosen));
      grid.innerHTML = "";
      first = null; lock = false; moves = 0; matched = 0; playing = true;
      movesEl.textContent = "0";
      msg.textContent = "";
      deck.forEach(sym=>{
        const card = document.createElement("div");
        card.className = "mem-card";
        card.dataset.sym = sym;
        card.innerHTML = `<div class="mem-inner">
            <div class="mem-face mem-front"></div>
            <div class="mem-face mem-back">${sym}</div>
          </div>`;
        card.addEventListener("click", ()=>flip(card));
        grid.appendChild(card);
      });
    }

    function flip(card){
      if (lock || playing===false) return;
      if (card.classList.contains("flipped") || card.classList.contains("matched")) return;
      card.classList.add("flipped");
      Sound.click();
      if (!first){ first = card; return; }

      moves++; movesEl.textContent = String(moves);
      if (first.dataset.sym === card.dataset.sym){
        first.classList.add("matched"); card.classList.add("matched");
        first = null; matched++;
        if (matched === pairs) finish();
      } else {
        lock = true;
        const a = first, b = card; first = null;
        setTimeout(()=>{ a.classList.remove("flipped"); b.classList.remove("flipped"); lock = false; }, 720);
      }
    }

    function finish(){
      playing = false;
      const reward = Math.max(60, 260 - moves*12);
      Cooldowns.set(KEY, CD);
      Game.reward(reward, "Mémoire royale");
      msg.textContent = `Tableau résolu en ${moves} coups — récompense : ${UI.fmt(reward)} ${CONFIG.coin}`;
      refreshCd();
    }

    function init(){
      grid = $("memory-grid"); movesEl = $("memory-moves"); btn = $("memory-new");
      cd = $("memory-cd"); msg = $("memory-msg");
      if (!grid) return;
      btn.addEventListener("click", ()=>{ if (Cooldowns.ready(KEY)) build(); });
      build();          // première partie offerte immédiatement
      refreshCd();
    }
    return { init };
  })();

  /* =======================================================================
     3. LE RÉFLEXE DORÉ  (cliquer un maximum de cibles en 15 s)
     ======================================================================= */
  const Reflex = (function(){
    const KEY = "reflex";
    const CD = 8*MIN;
    const DURATION = 15;       // secondes
    const PER_HIT = 8;         // jetons par cible touchée

    let zone, btn, timerEl, scoreEl, cd, msg;
    let running = false, hits = 0, left = DURATION;
    let spawnTo = null, countTo = null, vanishTo = null, cdTick = null;

    function refreshCd(){
      const rem = Cooldowns.remaining(KEY);
      if (rem > 0){
        btn.disabled = true;
        cd.textContent = `Nouvelle manche dans ${fmtDur(rem)}`;
        if (!cdTick) cdTick = setInterval(refreshCd, 1000);
      } else {
        btn.disabled = false;
        cd.textContent = running ? "" : "Prêt — 15 secondes de précision.";
        if (cdTick){ clearInterval(cdTick); cdTick = null; }
      }
    }

    function spawn(){
      clearTimeout(vanishTo);
      const old = zone.querySelector(".reflex-target");
      if (old) old.remove();
      const t = document.createElement("div");
      t.className = "reflex-target";
      t.textContent = CONFIG.coin;
      const pad = 12;
      const maxX = zone.clientWidth - 64 - pad, maxY = zone.clientHeight - 64 - pad;
      t.style.left = (pad + Math.random()*maxX) + "px";
      t.style.top  = (pad + Math.random()*maxY) + "px";
      t.addEventListener("click", ()=>{
        hits++; scoreEl.textContent = String(hits);
        Sound.click();
        spawn();
      });
      zone.appendChild(t);
      // si la cible n'est pas cliquée à temps, elle réapparaît ailleurs
      const life = Math.max(620, 1100 - hits*22);
      vanishTo = setTimeout(spawn, life);
    }

    function tickTime(){
      left--; timerEl.textContent = left + " s";
      if (left <= 0) end();
    }

    function start(){
      if (running || !Cooldowns.ready(KEY)) return;
      running = true; hits = 0; left = DURATION;
      scoreEl.textContent = "0"; timerEl.textContent = DURATION + " s";
      msg.textContent = ""; btn.disabled = true; cd.textContent = "";
      spawn();
      countTo = setInterval(tickTime, 1000);
    }

    function end(){
      running = false;
      clearInterval(countTo); clearTimeout(vanishTo); clearTimeout(spawnTo);
      const t = zone.querySelector(".reflex-target"); if (t) t.remove();
      const reward = hits * PER_HIT;
      Cooldowns.set(KEY, CD);
      if (reward > 0){
        Game.reward(reward, "Réflexe doré");
        msg.textContent = `${hits} cibles — récompense : ${UI.fmt(reward)} ${CONFIG.coin}`;
      } else {
        Sound.lose();
        msg.textContent = "Aucune cible touchée. Retentez votre chance plus tard !";
      }
      refreshCd();
    }

    function init(){
      zone = $("reflex-zone"); btn = $("reflex-start"); timerEl = $("reflex-timer");
      scoreEl = $("reflex-score"); cd = $("reflex-cd"); msg = $("reflex-msg");
      if (!zone) return;
      btn.addEventListener("click", start);
      refreshCd();
    }
    return { init };
  })();

  /* =======================================================================
     4. PILE OU FACE  (jeu de série : on bâtit une cagnotte, on encaisse quand on veut)
     ======================================================================= */
  const CoinFlip = (function(){
    const KEY = "coinflip";
    const CD = 5*MIN;
    const BASE = 25;

    let coin, btnP, btnF, btnCash, potEl, streakEl, msg, cd;
    let pot = 0, streak = 0, active = false, animating = false, tick = null;

    function refreshCd(){
      const rem = Cooldowns.remaining(KEY);
      if (rem > 0){
        setBtns(false);
        cd.textContent = `Nouvelle série dans ${fmtDur(rem)}`;
        if (!tick) tick = setInterval(refreshCd, 1000);
      } else {
        cd.textContent = "Choisissez Pile ou Face pour lancer une série.";
        setBtns(true);
        if (tick){ clearInterval(tick); tick = null; }
      }
    }

    function setBtns(enabled){
      btnP.disabled = !enabled; btnF.disabled = !enabled;
      btnCash.disabled = !(enabled && pot > 0);
    }

    function update(){
      potEl.textContent = UI.fmt(pot);
      streakEl.textContent = String(streak);
    }

    function guess(side){
      if (animating || !Cooldowns.ready(KEY)) return;
      animating = true; setBtns(false);
      Sound.spin();
      const result = Math.random() < 0.5 ? "pile" : "face";
      coin.classList.add("flipping");
      setTimeout(()=>{
        coin.classList.remove("flipping");
        coin.textContent = result === "pile" ? "P" : "F";
        if (result === side){
          streak++;
          pot = pot === 0 ? BASE : pot*2;
          update();
          msg.textContent = `${result.toUpperCase()} ! Cagnotte doublée — encaissez ou tentez encore.`;
          Sound.win();
          active = true; animating = false; setBtns(true);
        } else {
          msg.textContent = `${result.toUpperCase()}… la série s'arrête. Cagnotte perdue.`;
          Sound.lose();
          pot = 0; streak = 0; active = false; animating = false;
          update();
          Cooldowns.set(KEY, CD);
          refreshCd();
        }
      }, 650);
    }

    function cashOut(){
      if (pot <= 0 || animating) return;
      const gained = pot;
      Game.reward(gained, "Pile ou Face");
      msg.textContent = `Encaissé : ${UI.fmt(gained)} ${CONFIG.coin} après ${streak} bonnes prédictions.`;
      pot = 0; streak = 0; active = false; update();
      Cooldowns.set(KEY, CD);
      refreshCd();
    }

    function init(){
      coin = $("coin"); btnP = $("coin-pile"); btnF = $("coin-face"); btnCash = $("coin-cash");
      potEl = $("coin-pot"); streakEl = $("coin-streak"); msg = $("coin-msg"); cd = $("coin-cd");
      if (!coin) return;
      btnP.addEventListener("click", ()=>guess("pile"));
      btnF.addEventListener("click", ()=>guess("face"));
      btnCash.addEventListener("click", cashOut);
      update();
      refreshCd();
    }
    return { init };
  })();

  /* ----------------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", ()=>{
    Fortune.init();
    Memory.init();
    Reflex.init();
    CoinFlip.init();
  });
})();
