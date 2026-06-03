# Maison Royale — Casino Virtuel ♛

Un site de **casino entièrement virtuel** : aucun argent réel, uniquement des **jetons**
gagnés aux tables et dans les mini-jeux. Site statique en **HTML / CSS / JavaScript pur**
(aucune dépendance à installer, aucun framework), pensé pour une esthétique premium
« velours nocturne & or » avec animations façon Apple.

---

## 1. Structure des fichiers

```
maison-royale/
├── index.html          → Accueil (héros, stats, jeux vedettes, farm)
├── jeux.html           → Le grand salon : tous les jeux
├── roulette.html       → Roulette européenne
├── blackjack.html      → Blackjack (croupier tire jusqu'à 17, BJ payé 3:2)
├── machines.html       → Machine à sous (3 rouleaux)
├── minijeux.html       → 4 mini-jeux gratuits pour farmer des jetons
├── apropos.html        → À propos + section « Jeu responsable » (#responsable)
├── contact.html        → Formulaire de contact (simulé, sans envoi réseau)
│
├── css/
│   └── style.css       → Tout le design system (couleurs, composants, animations)
│
└── js/
    ├── core.js         → Cerveau partagé : compte, solde, sauvegarde, en-tête,
    │                      pied de page, modale, effets (confettis, sons, toasts)
    ├── roulette.js     → Logique de la roulette
    ├── blackjack.js    → Logique du blackjack
    ├── slots.js        → Logique de la machine à sous
    └── minigames.js    → Logique des 4 mini-jeux
```

Chaque page HTML charge, dans l'ordre : les **polices Google Fonts**, puis `css/style.css`,
puis `js/core.js`, puis (si besoin) le script spécifique de la page.

---

## 2. Lancer le site en local (VS Code + Live Server)

C'est la méthode recommandée — elle recharge la page automatiquement à chaque sauvegarde.

1. Ouvre le dossier `maison-royale/` dans **VS Code** (`Fichier ▸ Ouvrir le dossier`).
2. Installe l'extension **Live Server** (par Ritwick Dey) depuis l'onglet Extensions.
3. Clique droit sur `index.html` ▸ **« Open with Live Server »**.
4. Le site s'ouvre sur `http://127.0.0.1:5500/index.html`. ✦

> ⚠️ N'ouvre pas les fichiers en double-cliquant (`file://…`) : certains navigateurs
> bloquent alors les polices et le `localStorage`. Passe toujours par un serveur local
> (Live Server) ou un hébergement.

---

## 3. Mettre le site en ligne

Le site étant 100 % statique, il s'héberge gratuitement en quelques minutes :

- **Netlify** : glisse-dépose le dossier sur https://app.netlify.com/drop — en ligne instantanément.
- **Firebase Hosting** :
  ```bash
  npm install -g firebase-tools
  firebase login
  firebase init hosting     # dossier public = le dossier du site
  firebase deploy
  ```
- **GitHub Pages** : pousse le dossier dans un dépôt, puis active Pages dans les réglages.

---

## 4. Personnaliser le site

Tout passe par l'objet **`CONFIG`** en haut de `js/core.js` — une seule source de vérité :

```js
const CONFIG = {
  brand: "Maison Royale",     // nom affiché partout
  tagline: "Casino Virtuel",
  currency: "jetons",         // nom de la monnaie
  coin: "♛",                  // symbole de la monnaie
  startBalance: 1000,         // solde de départ d'un nouveau joueur
  nav: [ ... ],               // liens du menu
};
```

- **Changer les couleurs** → variables CSS en haut de `css/style.css` (`--gold`, `--bg`,
  `--royal`, `--velvet`, etc.). Modifie `--gold` et toute l'identité dorée suit.
- **Ajouter une page au menu** → ajoute une entrée dans `CONFIG.nav`.
- **Régler les mini-jeux** (récompenses, temps de recharge) → constantes en haut de chaque
  module dans `js/minigames.js` (`CD`, `SEG`, `PER_HIT`, `BASE`…).
- **Régler un jeu** (mises, gains) → en haut du fichier `js/<jeu>.js`
  (ex. `BETS` et `SYMBOLS` dans `slots.js`).

---

## 5. Comptes & sauvegarde

- Le solde, les statistiques et les temps de recharge sont stockés dans le **`localStorage`**
  du navigateur — aucune base de données, aucun serveur.
- On peut jouer en **mode invité** (sauvegarde locale) ou **créer un compte / se connecter**
  via la modale (icône en haut à droite). Chaque pseudo a sa propre sauvegarde.
- ⚠️ Les comptes sont une **démonstration locale** : le mot de passe est simplement encodé
  (base64), ce n'est **pas** un système sécurisé. Pour une vraie authentification, branche
  un service comme **Firebase Auth** (que tu connais déjà) à la place de l'objet `State`.

---

## 6. Important — aucun argent réel

La Maison Royale est un **divertissement**. Les jetons n'ont **aucune valeur monétaire**,
ne s'achètent pas et ne se retirent pas. La page « À propos » contient une section
**Jeu responsable** dédiée. Garde ce cadre si tu publies le site.

Bon jeu ! ♛
