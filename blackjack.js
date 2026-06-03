/* =========================================================================
   BLACKJACK — le croupier tire jusqu'à 17, blackjack paie 3:2
   ========================================================================= */
(function(){
  const SUITS = ["♠","♥","♦","♣"];
  const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

  let shoe = [];
  let dealer = [], player = [];
  let currentBet = 0;
  let inRound = false;
  let canDouble = false;

  const $ = (id)=>document.getElementById(id);

  /* ---- Sabot 6 jeux ---- */
  function buildShoe(){
    shoe = [];
    for (let d=0; d<6; d++)
      for (const s of SUITS)
        for (const r of RANKS)
          shoe.push({ r, s });
    // Mélange Fisher–Yates
    for (let i=shoe.length-1; i>0; i--){ const j=Game.rndInt(0,i); [shoe[i],shoe[j]]=[shoe[j],shoe[i]]; }
  }
  function draw(){ if (shoe.length<15) buildShoe(); return shoe.pop(); }

  /* ---- Valeur d'une main ---- */
  function value(cards){
    let total=0, aces=0;
    for (const c of cards){
      if (c.r==="A"){ aces++; total+=11; }
      else if (["K","Q","J","10"].includes(c.r)) total+=10;
      else total+=parseInt(c.r);
    }
    while (total>21 && aces>0){ total-=10; aces--; }
    const soft = aces>0 && total<=21;
    return { total, soft };
  }
  const isBlackjack = (cards)=> cards.length===2 && value(cards).total===21;

  /* ---- Rendu ---- */
  function cardEl(c){
    const el = document.createElement("div");
    const red = (c.s==="♥"||c.s==="♦");
    el.className = "card" + (red?" red":"");
    el.innerHTML = `<div class="rank">${c.r}${c.s}</div>
                    <div class="suit-big">${c.s}</div>
                    <div class="rank bottom">${c.r}${c.s}</div>`;
    return el;
  }
  function backEl(){ const el=document.createElement("div"); el.className="card back"; return el; }

  function render(hideHole){
    const dz=$("dealer-hand"), pz=$("player-hand");
    dz.innerHTML=""; pz.innerHTML="";
    dealer.forEach((c,i)=> dz.appendChild(hideHole && i===1 ? backEl() : cardEl(c)));
    player.forEach(c=> pz.appendChild(cardEl(c)));

    const ps=$("player-score"); ps.style.display="inline-block"; ps.textContent=value(player).total;
    const ds=$("dealer-score");
    if (hideHole){ ds.style.display="inline-block"; ds.textContent = value([dealer[0]]).total; }
    else { ds.style.display="inline-block"; ds.textContent = value(dealer).total; }
  }

  /* ---- Mise ---- */
  function addBet(v){
    if (inRound) return;
    if (currentBet + v > State.balance){ UI.toast("Solde insuffisant.", "lose", "⚠️"); return; }
    currentBet += v; $("bet-amount").textContent = UI.fmt(currentBet); Sound.click();
  }
  function clearBet(){ if(inRound) return; currentBet=0; $("bet-amount").textContent="0"; }

  /* ---- Distribution ---- */
  function deal(){
    if (inRound) return;
    if (currentBet<=0){ UI.toast("Placez une mise.", "", "🎯"); return; }
    if (!State.bet(currentBet)){ UI.toast("Solde insuffisant.", "lose", "⚠️"); return; }

    inRound=true; canDouble=true;
    dealer=[draw(),draw()]; player=[draw(),draw()];
    render(true);
    $("bet-controls").style.display="none";
    $("action-controls").style.display="flex";
    setMsg("À vous de jouer.", "");

    // Blackjack immédiat ?
    if (isBlackjack(player)){
      render(false);
      if (isBlackjack(dealer)) endRound("push");
      else endRound("blackjack");
      return;
    }
    $("double-btn").disabled = (State.balance < currentBet);
  }

  /* ---- Actions ---- */
  function hit(){
    if (!inRound) return;
    player.push(draw()); canDouble=false; $("double-btn").disabled=true;
    Sound.click(); render(true);
    if (value(player).total>21){ render(false); endRound("bust"); }
  }
  function stand(){ if(!inRound) return; dealerPlay(); }
  function double(){
    if (!inRound || !canDouble) return;
    if (!State.bet(currentBet)){ UI.toast("Solde insuffisant pour doubler.", "lose", "⚠️"); return; }
    currentBet *= 2; $("bet-amount").textContent=UI.fmt(currentBet);
    player.push(draw()); Sound.click(); render(true);
    if (value(player).total>21){ render(false); endRound("bust"); }
    else dealerPlay();
  }

  function dealerPlay(){
    canDouble=false;
    $("hit-btn").disabled=$("stand-btn").disabled=$("double-btn").disabled=true;
    render(false);
    // Le croupier tire pas à pas
    const tick = ()=>{
      if (value(dealer).total<17){ dealer.push(draw()); render(false); Sound.click(); setTimeout(tick, 600); }
      else resolve();
    };
    setTimeout(tick, 650);
  }

  /* ---- Résolution ---- */
  function resolve(){
    const p=value(player).total, d=value(dealer).total;
    if (d>21) endRound("dealer-bust");
    else if (p>d) endRound("win");
    else if (p<d) endRound("lose");
    else endRound("push");
  }

  function endRound(outcome){
    let returned=0, won=false, big=false, txt="", cls="";
    switch(outcome){
      case "blackjack":   returned=Math.round(currentBet*2.5); won=true; big=true; txt=`Blackjack ! +${UI.fmt(returned-currentBet)} ${CONFIG.coin}`; cls="win"; break;
      case "win":
      case "dealer-bust": returned=currentBet*2; won=true; txt=`${outcome==="dealer-bust"?"Le croupier saute !":"Gagné !"} +${UI.fmt(currentBet)} ${CONFIG.coin}`; cls="win"; break;
      case "push":        returned=currentBet; txt="Égalité — mise remboursée."; cls=""; break;
      case "bust":        returned=0; txt="Vous dépassez 21. Perdu."; cls="lose"; break;
      case "lose":        returned=0; txt="Le croupier l'emporte."; cls="lose"; break;
    }

    // Statistiques + solde
    State.save.stats.played++;
    if (won){ State.save.stats.won++; if (returned>State.save.stats.biggestWin) State.save.stats.biggestWin=returned; }
    else if (outcome==="bust"||outcome==="lose"){ State.save.stats.lost++; }
    if (returned>0) State.addBalance(returned); else Store.persist();

    setMsg(txt, cls);
    if (won) Effects.win(returned-currentBet>0?returned-currentBet:returned, big);
    else if (returned===0) Sound.lose();

    // Réinitialisation pour la manche suivante
    inRound=false;
    $("action-controls").style.display="none";
    $("bet-controls").style.display="block";
    $("hit-btn").disabled=$("stand-btn").disabled=$("double-btn").disabled=false;
    // on conserve la mise pour rejouer vite ; débit au prochain « Distribuer »
  }

  function setMsg(t, cls){ const m=$("msg"); m.className="msg-line "+(cls||""); m.textContent=t; }

  /* ---- Init ---- */
  document.addEventListener("DOMContentLoaded", ()=>{
    buildShoe();
    document.querySelectorAll("#chip-tray .chip").forEach(c=>{
      c.addEventListener("click", ()=>addBet(parseInt(c.dataset.v)));
    });
    $("deal-btn").addEventListener("click", deal);
    $("clear-bet").addEventListener("click", clearBet);
    $("hit-btn").addEventListener("click", hit);
    $("stand-btn").addEventListener("click", stand);
    $("double-btn").addEventListener("click", double);
  });
})();
