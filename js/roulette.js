/* =========================================================================
   ROULETTE EUROPÉENNE (un seul zéro)
   ========================================================================= */
(function(){
  const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const colorOf = (n)=> n===0 ? "green" : (RED.has(n) ? "red" : "black");

  // Ordre des cases sur le cylindre européen
  const ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const SEG = 360/37;

  // État de la table
  let chipValue = 10;
  let bets = {};            // clé -> mise cumulée
  let history = [];         // pile pour annuler : [{key, amount}]
  let lastBets = null;      // pour « rejouer »
  let spinning = false;
  let wheelRot = 0;

  const $ = (id)=>document.getElementById(id);
  const board = $("bet-board");
  const wheel = $("wheel");

  /* ---- Cylindre : dégradé conique ---- */
  function paintWheel(){
    const colHex = { red:"#7c1726", black:"#10101a", green:"#0b3b2e" };
    const stops = ORDER.map((n,i)=>{
      const a0 = (i*SEG).toFixed(3), a1 = ((i+1)*SEG).toFixed(3);
      return `${colHex[colorOf(n)]} ${a0}deg ${a1}deg`;
    }).join(",");
    wheel.style.background = `conic-gradient(${stops})`;
  }

  /* ---- Construction du tapis ---- */
  function buildBoard(){
    // Zéro
    const zeroRow = document.createElement("div");
    zeroRow.className = "bet-numbers";
    zeroRow.style.gridTemplateColumns = "1fr";
    zeroRow.style.marginBottom = "5px";
    zeroRow.appendChild(cell("n:0", "0", "green"));
    board.appendChild(zeroRow);

    // Numéros 1-36 en 3 lignes de 12 (disposition classique)
    const grid = document.createElement("div");
    grid.className = "bet-numbers";
    // Ligne haut : 3,6,...36 ; milieu : 2,5,...; bas : 1,4,...
    for (let row=0; row<3; row++){
      for (let col=0; col<12; col++){
        const num = col*3 + (3-row);
        grid.appendChild(cell("n:"+num, String(num), colorOf(num)));
      }
    }
    board.appendChild(grid);

    // Douzaines
    const dz = document.createElement("div");
    dz.className = "bet-outside";
    dz.appendChild(cell("d1","1er 12","felt"));
    dz.appendChild(cell("d2","2e 12","felt"));
    dz.appendChild(cell("d3","3e 12","felt"));
    board.appendChild(dz);

    // Chances simples
    const ev = document.createElement("div");
    ev.className = "bet-evens";
    ev.appendChild(cell("low","1-18","felt"));
    ev.appendChild(cell("even","Pair","felt"));
    ev.appendChild(cell("red","Rouge","red"));
    ev.appendChild(cell("black","Noir","black"));
    ev.appendChild(cell("odd","Impair","felt"));
    ev.appendChild(cell("high","19-36","felt"));
    board.appendChild(ev);
  }

  function cell(key, label, cls){
    const d = document.createElement("div");
    d.className = "bet-cell" + (cls && cls!=="felt" ? " "+cls : "");
    d.dataset.key = key;
    d.innerHTML = `<span>${label}</span>`;
    d.addEventListener("click", ()=>placeBet(key, d));
    return d;
  }

  /* ---- Mises ---- */
  function placeBet(key, el){
    if (spinning) return;
    if (!State.bet(chipValue)){ UI.toast("Solde insuffisant pour cette mise.", "lose", "⚠️"); return; }
    bets[key] = (bets[key]||0) + chipValue;
    history.push({ key, amount: chipValue });
    Sound.click();
    drawStake(el || board.querySelector(`[data-key="${CSS.escape(key)}"]`), bets[key]);
    refreshTotals();
  }

  function drawStake(el, amount){
    if (!el) return;
    let badge = el.querySelector(".stake");
    if (!badge){ badge = document.createElement("span"); badge.className="stake"; el.appendChild(badge); }
    badge.textContent = amount>=1000 ? Math.round(amount/1000)+"K" : amount;
  }

  function clearStakes(){
    board.querySelectorAll(".stake").forEach(b=>b.remove());
  }

  function refreshTotals(){
    const total = Object.values(bets).reduce((a,b)=>a+b,0);
    $("total-bet").textContent = UI.fmt(total);
  }

  function undo(){
    if (spinning || !history.length) return;
    const last = history.pop();
    bets[last.key] -= last.amount;
    State.addBalance(last.amount, {animate:false});
    UI.updateBalance();
    const el = board.querySelector(`[data-key="${CSS.escape(last.key)}"]`);
    if (bets[last.key] <= 0){ delete bets[last.key]; const s=el && el.querySelector(".stake"); if(s) s.remove(); }
    else drawStake(el, bets[last.key]);
    refreshTotals();
  }

  function clearAll(refund=true){
    if (spinning) return;
    if (refund){
      const total = Object.values(bets).reduce((a,b)=>a+b,0);
      if (total>0){ State.addBalance(total); }
    }
    bets = {}; history = []; clearStakes(); refreshTotals();
  }

  function repeat(){
    if (spinning || !lastBets) return;
    clearAll(true);
    let ok = true;
    for (const [key, amt] of Object.entries(lastBets)){
      if (!State.bet(amt)){ ok=false; break; }
      bets[key] = amt; history.push({key, amount:amt});
      drawStake(board.querySelector(`[data-key="${CSS.escape(key)}"]`), amt);
    }
    if (!ok){ UI.toast("Solde insuffisant pour rejouer cette mise.", "lose", "⚠️"); clearAll(true); }
    refreshTotals();
  }

  /* ---- Gains ---- */
  function isWinning(key, n){
    if (key.startsWith("n:")) return parseInt(key.slice(2))===n;
    if (n===0) return false; // les chances extérieures perdent sur le zéro
    switch(key){
      case "red":   return colorOf(n)==="red";
      case "black": return colorOf(n)==="black";
      case "even":  return n%2===0;
      case "odd":   return n%2===1;
      case "low":   return n>=1 && n<=18;
      case "high":  return n>=19 && n<=36;
      case "d1":    return n>=1 && n<=12;
      case "d2":    return n>=13 && n<=24;
      case "d3":    return n>=25 && n<=36;
    }
    return false;
  }
  function payoutMult(key){
    if (key.startsWith("n:")) return 35;      // plein
    if (key==="d1"||key==="d2"||key==="d3") return 2;  // douzaine
    return 1;                                  // chances simples
  }

  /* ---- Lancer ---- */
  function spin(){
    if (spinning) return;
    const totalBet = Object.values(bets).reduce((a,b)=>a+b,0);
    if (totalBet<=0){ UI.toast("Placez au moins une mise.", "", "🎯"); return; }

    spinning = true;
    lastBets = {...bets};
    setControls(false);
    $("msg").className = "msg-line"; $("msg").textContent = "Le cylindre tourne…";
    Sound.spin();

    const result = ORDER[Game.rndInt(0, ORDER.length-1)];
    const idx = ORDER.indexOf(result);
    const spins = 6;
    const want = (360 - (idx*SEG + SEG/2)) % 360;     // centre la case sous l'aiguille
    const cur  = ((wheelRot % 360)+360)%360;
    const jitter = (Math.random()-0.5) * SEG * 0.5;
    const delta = spins*360 + (((want - cur) % 360 + 360) % 360) + jitter;
    wheelRot += delta;
    wheel.style.transform = `rotate(${wheelRot}deg)`;

    setTimeout(()=>resolve(result), 5300);
  }

  function resolve(n){
    const col = colorOf(n);
    $("hub-res").textContent = n;
    $("hub-res").style.color = col==="red" ? "#f08a92" : col==="green" ? "#7be0a0" : "#fff";

    // Calcul du retour
    let returned = 0, won = false;
    for (const [key, stake] of Object.entries(bets)){
      if (isWinning(key, n)){ returned += stake * (payoutMult(key)+1); won = true; }
    }
    const staked = Object.values(bets).reduce((a,b)=>a+b,0);
    const net = returned - staked;

    State.settle(returned, returned>0);

    const msg = $("msg");
    if (won && net>0){
      msg.className = "msg-line win";
      msg.textContent = `${n} ${frCol(col)} — vous gagnez ${UI.fmt(net)} ${CONFIG.coin} !`;
      $("last-win").textContent = "+"+UI.fmt(net);
      Effects.win(net, net>=staked*10);
    } else if (won){
      msg.className = "msg-line";
      msg.textContent = `${n} ${frCol(col)} — mise remboursée.`;
      $("last-win").textContent = "—";
    } else {
      msg.className = "msg-line lose";
      msg.textContent = `${n} ${frCol(col)} — la maison l'emporte.`;
      $("last-win").textContent = "—";
      Sound.lose();
    }

    clearStakes();
    bets = {}; history = [];
    refreshTotals();
    spinning = false;
    setControls(true);
  }

  function frCol(c){ return c==="red"?"Rouge":c==="black"?"Noir":"Vert (zéro)"; }

  function setControls(enabled){
    ["spin-btn","undo-btn","clear-btn","repeat-btn"].forEach(id=>{ const b=$(id); if(b) b.disabled=!enabled; });
  }

  /* ---- Init ---- */
  document.addEventListener("DOMContentLoaded", ()=>{
    paintWheel();
    buildBoard();

    document.querySelectorAll("#chip-tray .chip").forEach(c=>{
      c.addEventListener("click", ()=>{
        document.querySelectorAll("#chip-tray .chip").forEach(x=>x.classList.remove("selected"));
        c.classList.add("selected"); chipValue = parseInt(c.dataset.v); Sound.click();
      });
    });

    $("spin-btn").addEventListener("click", spin);
    $("undo-btn").addEventListener("click", undo);
    $("clear-btn").addEventListener("click", ()=>clearAll(true));
    $("repeat-btn").addEventListener("click", repeat);
  });
})();
