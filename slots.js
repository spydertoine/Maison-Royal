/* =========================================================================
   MACHINE À SOUS — 3 rouleaux, 1 ligne de paiement centrale
   ========================================================================= */
(function(){
  // Symboles + poids (plus le poids est élevé, plus le symbole est fréquent)
  const SYMBOLS = [
    { e:"🍒", w:30, mult:3  },
    { e:"🔔", w:24, mult:5  },
    { e:"⭐", w:18, mult:8  },
    { e:"💎", w:12, mult:12 },
    { e:"7️⃣", w:9,  mult:20 },
    { e:"👑", w:4,  mult:50 },
  ];
  const SYM_H = 120;                 // hauteur d'un symbole (px) = .reel / .sym
  const BETS = [10,25,50,100,250,500];
  let betIdx = 2;                    // 50 par défaut
  let spinning = false;

  const $ = (id)=>document.getElementById(id);

  function weightedPick(){
    const total = SYMBOLS.reduce((a,s)=>a+s.w,0);
    let r = Math.random()*total;
    for (const s of SYMBOLS){ if ((r-=s.w)<0) return s; }
    return SYMBOLS[0];
  }
  const randSym = ()=> SYMBOLS[Game.rndInt(0,SYMBOLS.length-1)];

  /* ---- Table des gains (affichage) ---- */
  function buildPaytable(){
    const pt = $("paytable");
    [...SYMBOLS].reverse().forEach(s=>{
      const d=document.createElement("div"); d.className="pt";
      d.innerHTML = `<span class="syms">${s.e}${s.e}${s.e}</span><span class="x">×${s.mult}</span>`;
      pt.appendChild(d);
    });
    const d=document.createElement("div"); d.className="pt";
    d.innerHTML = `<span class="syms">🍒🍒 <small style="opacity:.6">(2)</small></span><span class="x">×1</span>`;
    pt.appendChild(d);
  }

  /* ---- Rouleaux ---- */
  function fillReel(reelIdx, resultSym, stopIndex){
    const strip = document.querySelector(`#reel-${reelIdx} .reel-strip`);
    strip.style.transition="none"; strip.style.transform="translateY(0)";
    strip.innerHTML="";
    for (let i=0; i<=stopIndex; i++){
      const sym = (i===stopIndex) ? resultSym : randSym();
      const d=document.createElement("div"); d.className="sym"; d.textContent=sym.e;
      strip.appendChild(d);
    }
    // force reflow puis lance l'animation
    void strip.offsetHeight;
    const dur = 2 + reelIdx*0.55;     // arrêts décalés
    strip.style.transition = `transform ${dur}s cubic-bezier(.16,.84,.2,1)`;
    strip.style.transform = `translateY(${-(stopIndex*SYM_H)}px)`;
    return dur;
  }

  function setBet(){ $("bet-amount").textContent = UI.fmt(BETS[betIdx]); }

  /* ---- Lancer ---- */
  function spin(){
    if (spinning) return;
    const bet = BETS[betIdx];
    if (!State.bet(bet)){ UI.toast("Solde insuffisant.", "lose", "⚠️"); return; }

    spinning=true;
    $("spin-btn").disabled=$("bet-up").disabled=$("bet-down").disabled=true;
    $("msg").className="msg-line"; $("msg").textContent="…";
    document.querySelectorAll(".reel").forEach(r=>r.classList.remove("win-line"));
    Sound.spin();

    const results = [weightedPick(), weightedPick(), weightedPick()];
    let maxDur = 0;
    results.forEach((sym,i)=>{
      const stop = 26 + i*4;          // index d'arrêt (scroll long)
      const d = fillReel(i, sym, stop);
      maxDur = Math.max(maxDur, d);
    });

    setTimeout(()=>resolve(results, bet), maxDur*1000 + 200);
  }

  function resolve(results, bet){
    const [a,b,c] = results;
    let mult = 0, big=false;
    if (a.e===b.e && b.e===c.e){
      mult = a.mult; big = (a.e==="👑");
      document.querySelectorAll(".reel").forEach(r=>r.classList.add("win-line"));
    } else {
      const cherries = results.filter(s=>s.e==="🍒").length;
      if (cherries===2) mult = 1;
    }

    const win = bet*mult;
    State.save.stats.played++;
    if (win>0){
      State.save.stats.won++;
      if (win>State.save.stats.biggestWin) State.save.stats.biggestWin=win;
      State.addBalance(win);
      $("last-win").textContent = "+"+UI.fmt(win);
      $("msg").className="msg-line win";
      $("msg").textContent = big ? `JACKPOT ROYAL ! +${UI.fmt(win)} ${CONFIG.coin}` : `Gagné ! +${UI.fmt(win)} ${CONFIG.coin}`;
      Effects.win(win, big || mult>=20);
    } else {
      State.save.stats.lost++; Store.persist();
      $("last-win").textContent="—";
      $("msg").className="msg-line lose"; $("msg").textContent="Pas de combinaison. Retentez !";
      Sound.lose();
    }

    spinning=false;
    $("spin-btn").disabled=$("bet-up").disabled=$("bet-down").disabled=false;
  }

  /* ---- Init ---- */
  document.addEventListener("DOMContentLoaded", ()=>{
    buildPaytable();
    // remplit les rouleaux au repos
    [0,1,2].forEach(i=>{
      const strip=document.querySelector(`#reel-${i} .reel-strip`);
      const d=document.createElement("div"); d.className="sym"; d.textContent=randSym().e; strip.appendChild(d);
    });
    setBet();
    $("spin-btn").addEventListener("click", spin);
    $("bet-up").addEventListener("click", ()=>{ if(spinning)return; betIdx=Math.min(BETS.length-1,betIdx+1); setBet(); Sound.click(); });
    $("bet-down").addEventListener("click", ()=>{ if(spinning)return; betIdx=Math.max(0,betIdx-1); setBet(); Sound.click(); });
  });
})();
