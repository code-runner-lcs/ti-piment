# TiPiment — app de rencontre PWA — Cahier des charges · V1

> PWA de rencontre construite sur une base vierge : boucle cœur (swipe → match → chat) impeccable, authentification simple, backend qui fait le travail, client qui affiche.

| | |
|---|---|
| **Version** | 1.1 (2026-10-28 : décisions §13 tranchées — nom « TiPiment », vérification email obligatoire, fuseau Europe/Paris) |
| **Date** | 2026-10-28 |
| **Statut** | Brouillon — à valider (décisions ouvertes en §13) |
| **Nom de travail** | « TiPiment » ⚠️ collision connue avec ti'Piment.fr (rencontres + restaurant local) — vérifications INPI + stores + domaines (.fr/.re) OBLIGATOIRES avant tout design/comm |
| **Plateforme V1** | PWA — navigateur mobile d'abord, installable (Android/desktop natif ; iOS 16.4+ avec push si installée) |
| **Stack** | 100 % TypeScript : SolidJS (Vite) · Express + TypeORM · PostgreSQL · Redis · Socket.IO |
| **Authentification V1** | Email + mot de passe + JWT (évolutive OTP SMS / magic-link en V1.1, cf. §13) |
| **Monétisation V1** | Aucune (100 % gratuit) |
| **Public** | 18 ans et plus |

---

## 0. Hypothèses & conventions

- **Équipe** : 1 développeur full-stack (solo) ; modération tenue par le même compte back-office V1.
- **Horizon** : version publique ~3 mois après GO (beta fermée 2–4 semaines avant).
- **Toutes les cibles chiffrées (KPI, quotas, latence) sont des hypothèses** à calibrer pendant la beta, pas des engagements.
- **Fuséologie (timezone) de référence : Europe/Paris** (reset des quotas à 00:00 locale) — décision tranchée (§13) ; paramétrable uniquement en cas d'internationalisation.
- **Règle de maison « enrichissement backend »** : le calcul (deck, score, filtres, distance) vit côté serveur. Le client reçoit une carte prête à afficher — il ne calcule rien. (Comme un restaurant : le client reçoit l'assiette, pas la recette.)
- **RGPD / légal** : 18+ strict, CGU + politique de confidentialité accessibles à l'inscription, hébergement UE.
- **Comptes** : 1 email = 1 compte. Interdiction explicite des comptes multiples ; sanctions (suspension/ban) documentées en F5.
- **Git** : le projet démarre par un `git init` en M0 (mono-repo, commits ciblés par tâche — cf. conventions du fondateur).

---

## 1. Synthèse exécutive

**Vision.** Une rencontre se fait en trois gestes — on swipe, on match, on parle. La V1 livre exactement cette boucle, dans une PWA installable qui se met à jour toute seule et ne coûte pas un compte développeur aux stores.

**La boucle cœur :**

```
Inscription (email+mdp) → Profil (photos, bio, intention)
        → Deck de swipe (pré-calculé BACKEND, 10–20 cartes)
        → Like réciproque = MATCH
        → Chat 1:1 temps réel (Socket.IO)
        → Signalement / blocage accessibles partout
```

**Architecture en une image :**

```
┌─────────────────────────────────────────────────────────────┐
│  Navigateur / PWA installée                                 │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │  SolidJS SPA   │  │  Service Worker │  │  Web Push    │  │
│  │  (Vite+Router) │  │  (vite-plugin-  │  │  (VAPID,     │  │
│  │  affiche, ne   │  │   pwa/workbox)  │  │  opt-in)     │  │
│  │  calcule rien  │  │  app shell      │  │              │  │
│  └───────┬────────┘  └────────┬────────┘  └──────────────┘  │
└──────────┼────────────────────┼──────────────────────────────┘
           │ REST JSON (fetch)  │ WebSocket (Socket.IO : chat)
           ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend — Node 22 · TypeScript · Express 5                 │
│  routes → validation zod → services métier → dépôts TypeORM │
│  JWT (jose) · deck builder · quotas · rate-limit · uploads  │
└────────┬───────────────┬────────────────────┬───────────────┘
         │ TypeORM       │ ioredis            │ stockage
         ▼               ▼                    ▼
┌───────────────┐  ┌──────────────┐  ┌────────────────────┐
│  PostgreSQL   │  │    Redis     │  │  Photos (disque    │
│  16 (données) │  │ quotas, rate │  │  local V1 → stock  │
│               │  │ limit, cache │  │  objet UE en V1.1) │
│               │  │ deck, pubsub │  │  + variantes sharp │
└───────────────┘  └──────────────┘  └────────────────────┘
```

**Ce que la V1 n'est pas.** Pas de messagerie vocale/vidéo, pas de photos dans le chat, pas d'undo, pas de « qui m'a liké », pas de mode incognito, pas de payant, pas d'events, pas d'app native, pas de ML de recommandation (score déterministe uniquement, §8).

---

## 2. Périmètre V1

### 2.1 Dans le périmètre (IN)

| # | Fonction | Réf. |
|---|---|---|
| 1 | Inscription/connexion email + mot de passe + JWT (sessions multi-appareils) | F-Auth |
| 2 | Profil : photos, prénom, bio, intention, genre/orientation, naissance | F1 |
| 3 | Deck de swipe pré-calculé (like / passe / super-like), filtres de base | F2 |
| 4 | Matching réciproque + score de pondération déterministe (backend) | F3 |
| 5 | Chat 1:1 temps réel texte (Socket.IO), liens non cliquables | F4 |
| 6 | Signalement + blocage instantanés, modération < 24 h | F5 |
| 7 | Notifications Web Push (VAPID), contenu générique | F6 |
| 8 | PWA : installable, app shell offline, mise à jour silencieuse | F7 |
| 9 | Back-office minimal (signalements, inspecteur profil, stats) | F8 |
| 10 | Conformité : 18+, RGPD (export/suppression), CGU, analytics funnel | F9 |

### 2.2 Hors périmètre V1 (OUT explicite)

Vocal/visio · photos, GIF, audio dans le chat · undo (rewind) · « qui m'a liké » · mode incognito payé · app native (iOS/Android) · reels/vidéos profils · events & groupes · icebreakers IA · détection NSFW automatique · multilingue (FR seulement, anglais V1.1) · fonction voyage · comptes multiples/liés · monétisation · 2FA · vérification d'identité avec provider.

### 2.3 MoSCoW

| Must (bloque la beta) | Should (V1.0 public) | Could (si budget temps) | Won't (V1) |
|---|---|---|---|
| F-Auth, F1, F2, F3, F4 (envoi/réception), F5 (signalement+blocage), F9 (18+, CGU, RGPD), F7 (installable+offline), **vérification email obligatoire** | F4 (indicateurs typing/lu), F6 (push), F8 (back-office), analytics funnel | tags, stats avancées, Playwright e2e | tout §2.2 |

> La vérification email est désormais un **Must** (cf. §4.1) ; désactivable par variable d'env uniquement pour les tests.

---

## 3. Architecture technique

### 3.1 Mono-repo (pnpm workspaces)

```
app-rencontre/
├── apps/
│   ├── api/            # Express + TypeORM (Node 22, TS strict)
│   └── web/            # SolidJS (Vite, SSR non requis — SPA pure)
├── packages/
│   └── shared/         # types + schémas zod partagés API↔web (contrats)
├── docker-compose.yml  # dev : postgres:16 + redis:7
└── package.json        # workspaces pnpm, scripts racine (dev/build/test)
```

- **Règle** : tout DTO échangé entre API et web est défini **une seule fois** dans `packages/shared` (schéma zod) ; l'API le valide à l'entrée, le web en dérive ses types (`z.infer`). Une seule source de vérité, zéro désynchronisation.
- Les modules internes d'un package importent depuis les fichiers source directement (pas de barrels) — stabilité des mocks de tests et des bundles.

### 3.2 Backend (apps/api)

| Aspect | Choix | Justification |
|---|---|---|
| Framework | Express 5 (TypeScript strict) | Simple, éprouvé, écosystème riche |
| Validation | zod via `packages/shared` | Contrats partagés avec le front |
| ORM | TypeORM 0.3 (DataMapper, repositories) | Demandé ; migrations (`migration:generate`), jamais `synchronize:true` hors dev |
| Logs | pino (JSON structuré, request-id) | Observabilité min. viable |
| Sécurité HTTP | helmet + CORS restreint à l'origine web + express-rate-limit (compteur Redis via `rate-limit-redis`) | Socle anti-abus |
| Erreurs | Error handler central `{ code, message }` — zéro stack en réponse | API propre |
| Uploads | multer (limite 8 Mo) → disque local → variantes **sharp** | V1 simple ; S3-compatible en V1.1 |
| Process | un seul processus Node (mono-instance V1) ; cluster horizontal = décision §13 | Éviter la complexité tant que le trafic le permet |

**Couches :** `routes → middleware auth → validation zod → service → repository TypeORM`. Les services n'importent jamais `express` (testables hors HTTP). Les contrôleurs ne contiennent aucune règle métier.

### 3.3 Frontend (apps/web)

| Aspect | Choix | Justification |
|---|---|---|
| Build | Vite + `vite-plugin-solid`, TS strict | SPA pure, pas de SSR requis V1 |
| Router | `@solidjs/router` + `@solidjs/meta` (titres/og) | Navigation protégée par guard session |
| État | signals + `createStore` natifs | Rien de plus à installer ; le store global reste mince (session, deck, quotas) |
| Styles | Tailwind CSS 4 | Vitesse de layout solo-dev ; design tokens centralisés |
| Formulaires | natifs + schémas zod partagés | Pas de lib de formulaire en V1 |
| PWA | `vite-plugin-pwa` (workbox) : precache app shell, runtime cache pour assets statiques uniquement | Offline maîtrisé ; **jamais** de cache des réponses authentifiées |
| Push | `web-push` côté serveur (clés VAPID en env) ; handler push dans le SW ; stockage abonnements en BDD | Pas de FCM requis : Web Push standard |
| Upload HEIC | dégradé : JPEG/PNG/WebP acceptés ; HEIC → message « convertis ta photo » en V1 (conversion wasm côté client = §13) | sharp sans libheif ne décode pas HEIC sur Linux |

### 3.4 Temps réel (Socket.IO)

- Namespace unique, handshake authentifié par JWT (le token est transmis à la connexion, refus sinon).
- Rooms par match : `match:{id}` — seuls les deux membres y sont admis (contrôle serveur à chaque join).
- Événements : cf. §7.2. Tout message persisté en PostgreSQL **avant** diffusion ; Socket.IO n'est qu'un transport, jamais une source de vérité.
- V1 mono-instance : pub/sub Redis (adapter Socket.IO) est prévu mais optionnel — il ne devient obligatoire qu'avec le scaling horizontal.

### 3.5 Redis (rôle unique : état éphémère)

| Usage | Clé type | TTL |
|---|---|---|
| Quotas (likes/super-likes restants) | `quota:{userId}` | reset 00:00 Europe/Paris (calcul TTL à la clé) |
| Rate-limit (login, global, uploads) | `rl:{scope}:{ip|user}` | fenêtre glissante |
| Aperçu du deck en cours | `deck:{userId}` | 10 min |
| Rate-limit Socket.IO typing | par room | 10 s |
| Cache de session (révocation access tokens) | `revoked:{jti}` | jusqu'à expiration du token |

Aucune donnée durable ne vit dans Redis : Redis est un cache, PostgreSQL la vérité.

### 3.6 Photos

1. Upload multipart (1 requête par photo) → contrôle MIME réellement par inspection du buffer (pas du Content-Type).
2. **sharp** : redimensionnement (grandes 1 080 px, miniatures 480 px, format WebP + fallback JPEG), **purge EXIF (par défaut : sharp supprime les métadonnées — GPS inclus)** — aucune coordonnée ne quitte le serveur dans un fichier.
3. Stockage disque local `/uploads` (volume Docker) → **V1.1 : stockage objet S3-compatible UE + CDN** (migration par variable d'env, même interface).
4. Première photo d'un profil → file d'attente de modération avant publication (cf. F5.3).

### 3.7 Environnements

- **dev** : `docker compose up` (Postgres 16, Redis 7) ; API sur :3000, web :5173, proxies configurés.
- **staging/prod** : conteneurs Linux (VPS UE), TLS 1.2+ (nginx/Caddy), sauvegardes PostgreSQL quotidiennes chiffrées + restauration testée 1×/trimestre.
- **Secrets** : uniquement en variables d'environnement (`JWT_SECRET`, `VAPID_…`, `DB_…`, `REDIS_…`) — jamais committés ; template `.env.example` fourni.
- **CI** (Should) : GitHub Actions — lint (eslint+prettier), `tsc --noEmit`, vitest, build des deux apps.

---

## 4. F-Auth — Authentification simple (détaillée)

> Principe : « simple pour l'instant » = un seul moyen de connexion, solide et extensible. Email + mot de passe + JWT. Ajouter un OTP SMS ou un magic-link plus tard est un ajout, pas une refonte (les services `authService` et `sessionService` seront découplés du transport).

### 4.1 Inscription

1. Écran : email + mot de passe (×2) + date de naissance → contrôle **> 18 ans strict** (calculé serveur) ; rejet explicite sinon.
2. Mot de passe : **min. 8 caractères** (sans règle de complexité artificielle — longueur > composition) ; hachage **argon2id** (`@node-rs/argon2`, prébuilds multi-OS).
3. Unicité email (insensible à la casse, normalisation) ; 1 email = 1 compte.
4. Vérification email : **obligatoire** — lien signé (HMAC, 24 h de validité). Tant que l'email n'est pas vérifié : ni publication du profil, ni participation à la découverte (pas de swipe, pas d'apparition dans les decks). Écran bloqué « Vérifie ton email pour commencer » + bouton « renvoyer le lien ».
5. CGU + politique de confidentialité : cases obligatoires (+ liens lisibles, pas de dark pattern).

### 4.2 Session (JWT)

```
Connexion  : email + mdp ──► argon2id verify ──► émet :
               ① access token  (JWT, 15 min, en mémoire du client, JAMAIS localStorage)
               ② refresh token (30 j, httpOnly cookie SameSite=Lax, rotation à chaque usage)
Chaque requête  : header « Authorization: Bearer <access> » → middleware jose verify
Access expiré   : renouvellement silencieux via POST /auth/refresh (le cookie fait le travail)
Déconnexion/logout : révocation de la ligne refresh_token (rotation + révocable = anti-jeu volé)
```

- **Rotation du refresh** : usage = invalide l'ancien ; réutilisation d'un refresh déjà utilisé → **révocation de toute la famille de tokens** (détection de vol) + journal.
- Multi-appareils autorisé (max 5 sessions actives, liste consultable + déconnexion par appareil).
- Toutes les routes authentifiées portent le middleware `requireAuth` ; back-office ajoute `requireRole('admin')`.

### 4.3 Récupération & hygiène

- **Mot de passe oublié** : email contenant un lien signé (30 min) ; usage → invalide tous les refresh existants (anti-hijack).
- **Rate limit login** : 5 tentatives / 15 min par (IP + email) — messages **génériques** (« identifiants invalides ») : aucune différence entre « email inconnu » et « mauvais mdp » (anti-énumération).
- **Suppression du compte** : 3 taps dans les réglages → anomalisation immédiate (profil désactivé, retiré des decks, chats gelés) + purge des données personnelles à J+30 (cf. F9).

### 4.4 Critères d'acceptation F-Auth

- Un 17 ans et 11 mois ne peut pas s'inscrire (test serveur, pas côté client).
- Un refresh token réutilisé invalide la famille entière (test).
- 5 échecs de login → 429 avec message générique, l'IP reste bloquée 15 min.
- Aucun `bcrypt`/`md5`/`sha1` dans le code — argon2id vérifié par test.
- Un access token expiré → 401 structuré, renouvellement silencieux sans coupure UX.
- Aucun token dans localStorage ni en query-string (audit du front, test).
- Un compte à email non vérifié ne peut ni swiper ni être publié (test : deck refusé + profil invisible + endpoint refusé).

---

## 5. Fonctionnalités détaillées

### F1 — Onboarding & profil

**Parcours (cible : < 5 min, 5 étapes).** Après inscription : (1) prénom d'affichage + intention (`Relation sérieuse` / `Sortir, découvrir` / `À voir`) ; (2) genre + « je cherche » (listes fermées) ; (3) date de naissance déjà saisie → affichage âge ; (4) photos (1 min, 6 max) + bio (≤ 500 car.) ; (5) préférences de recherche (âge min/max, distance km, intention recherchée).

**Champs (composition 100 % backend) :**

| Champ | Contraintes |
|---|---|
| Prénom d'affichage | 2–20 car. ; pas de nom de famille (minimisation RGPD) |
| Âge | calculé serveur depuis la naissance ; jamais éditable |
| Intention | 3 valeurs fermées, affichée en pill sur la carte |
| Bio | ≤ 500 car. ; regex anti-liens/réseaux sociaux (rejet à l'enregistrement) |
| Photos | 1–6, JPEG/PNG/WebP ≤ 8 Mo, EXIF purgé, modérées avant publication |
| Préférences | appliquées **côté backend** à la génération du deck |

**Critères d'acceptation F1.** Aucun profil sans 1 photo modérée ne devient public ; la modification de préférences prend effet sur le deck suivant immédiatement ; onboarding reprise possible (progression sauvegardée).

### F2 — Découverte (deck de swipe)

**Carte** (composée serveur, le client n'affiche que) :

```
 ┌─────────────────────────────┐
 │  [PHOTO 1]                  │  tap : photos suivantes (points)
 │  Sarah · 27 · Le Mans       │  prénom · âge · commune affichée
 │  💞 Relation sérieuse       │  pill intention
 │  42 km                      │  distance (km, arrondie à 5 près)
 │  bio (pliée)                │
 ├─────────────────────────────┤
 │  ✕ Passe   ⚡ Super-like   ❤ Like │   ⚡ : 1/jour
 └─────────────────────────────┘
```

- **Deck pré-calculé** : `GET /deck` renvoie 10–20 cartes enrichies + prêtes. L'usage d'un swipe envoie `POST /swipe` (ack) puis continue la pile ; pile vide → re-fetch. **Le front ne trie, ne filtre, ne calcule rien.**
- **Quotas** (reset 00:00 Europe/Paris, compteurs Redis, affichés sur la pile) : **25 likes/jour**, **1 super-like/jour** (le destinataire l'apprend avant un like classique), passes illimitées.
- **Exhaustion** : écran neutre « Personne de nouveau pour l'instant » + 3 leviers (élargir rayon, âge, compléter le profil). Aucun paywall.
- Sans photos chargées réseau → le SW n'affiche jamais de cartes en cache (données datées interdites) mais l'app shell reste navigable.

**Critères d'acceptation F2.** Swipe perçu < 300 ms (préchargement images + prefetch du deck à 3 cartes d'avance) ; aucune réponse de deck ne contient de lat/lng, d'email, de date de naissance ni de score ; les quotas sont contrôlés **serveur** (impossible de tricher depuis le client).

### F3 — Matching & score

- Like réciproque = match immédiat (créé transactionnellement) → push générique + écran de célébration.
- Le super-like reçu met son auteur **en tête du deck** du destinataire (bandeau ⚡).
- Un match sans message pendant 48 h « s'endort » (conservé, remonte à l'activité) ; matchs réciproques vieillis de plus de 30 jours ne comptent plus comme « récent » pour le score.
- **Bloqué/exclu** = jamais de match possible.

**Critères d'acceptation F3.** La création d'un match est idempotente (double swipe synchrone ne crée pas 2 matchs) ; un utilisateur bloqué par A ne peut ni liker A ni joindre A.

### F4 — Chat 1:1 temps réel

- Texte + emoji clavier ; 1 000 car./message ; Socket.IO room `match:{id}` ; écriture persistée PostgreSQL avant diffusion → aucun message perdu à une reconnexion.
- Indicateur « en train d'écrire » ; **pas d'accusé de lecture** (anti-anxiété V1, évoluable).
- **URL en texte brut non cliquable** + bandeau anti-escroquerie au premier lien détecté (« Attention aux demandes d'argent et d'investissement — signale en 1 clic »). Motifs d'alerte automatiques : Western-union, crypto, invest.
- Rate limit : 30 msg/min, 100 msg/h par utilisateur (Redis).
- Blocage pendant une conversation → gel immédiat bidirectionnel (plus rien ne passe, ni push ni socket).
- Should V1.0 : historique paginé 50/50 pour scroll inférieur.

**Critères d'acceptation F4.** Une coupure réseau pendant l'envoi ne duplique ni ne perd le message (ack + idempotence par message-uuid client) ; deux comptes en blocage ne peuvent envoyer la moindre donnée l'un à l'autre ; les liens restent inertes.

### F5 — Sécurité utilisateur : signalement, blocage, modération

- **Signalement** (accessible partout : carte, profil, chat) : motifs fermés (faux profil, contenu choquant, harcèlement, escroquerie, mineur, autre) + texte libre. Accusé : « Réponse < 24 h ». Aucune réciprocité punitive (signaler ne plombe pas ton propre score).
- **Blocage** : 1-tap, instantané, silencieux, sans limite. Effet : disparition réciproque des decks, gel des chats, refus des sockets.
- **Modération** : back-office F8. File priorisée : mineur/menace/escroquerie < 2 h, le reste < 24 h. Actions : avertissement, suspension, **ban** (email + empreinte d'appareil, table `bans`). Journal d'audit de chaque action (qui, quand, quoi).
- **Photos** : première photo d'un profil → modération humaine avant publication ; photos suivantes publiées puis revues sur signalement.

**Critères d'acceptation F5.** 100 % des signalements répondus < 24 h ; un profil signalé par 3 utilisateurs distincts passe en priorité ; un ban empêche re-création de compte (email déjà banni → refus).

### F6 — Notifications Web Push

| Type | Contenu | Désactivable |
|---|---|---|
| Match | générique (« Tu as un nouveau match 😍 ») | oui |
| Message | générique (« Un nouveau message t'attend ») | oui |
| Super-like reçu | « Quelqu'un t'a envoyé un ⚡ » | oui |
| Rappel | max 1/semaine, jamais 2 semaines d'affilée | oui |

- Abonnement VAPID demandé **après** un moment de valeur (post-premier match), jamais à l'entrée.
- iOS : Web Push ne fonctionne que si la PWA est **ajoutée à l'écran d'accueil** (iOS ≥ 16.4) — l'UI détecte et guide (« installe l'app pour être notifiée ») au lieu de montrer un bouton mort.
- Contenu **générique par défaut** (pas de prénom ni d'extrait de message dans la notification).

**Critères d'acceptation F6.** Aucun push envoyé à un abonnement d'un compte bloqué/banni ; deep-link du push rouvre sur l'écran concerné ; taux de livraison suivi (events F9).

### F7 — PWA : install, offline, mise à jour

- **Manifest** complet (icônes 192/512 + maskable, thème, `display: standalone`) — cible **installable Lighthouse**.
- **Installation** : `beforeinstallprompt` (Chrome/Edge/desktop) → bouton « Installer » dans l'app ; iOS → instructions « Partager → Sur l'écran d'accueil ».
- **Offline** : app shell precaché (workbox) → hors-ligne on voit l'app, écran « Pas de réseau » pour les données ; requêtes API authentifiées **jamais** servies du cache ; file d'attente locale non requise V1 (les messages partent uniquement en ligne, accepté).
- **Mises à jour** : nouvelle version détectée, « nouvelle version dispo → recharger » discret ; pas de hard reload forcé.

**Critères d'acceptation F7.** Lighthouse PWA installable = vert ; second lancement en avion : app shell affiché sans requête réseau (audits) ; mise à jour déployée → client propose le rechargement < 1 h.

### F8 — Back-office minimal

Routes `/admin` derrière `requireRole('admin')`, sur la même API, une page très simple avant tout travail exotique (< 1 semaine de dev) :

- File de signalements (tri priorité, historique, filtres) ;
- Inspecteur de profil (lecture seule, photos/bio/préférences) ;
- Actions modération (avertir/suspendre/ban/supprimer contenu + motif + audit) ;
- Stats quotidiennes (funnel §F9, comptes actifs, deck non vide).
- Pas d'édition directe des données utilisateur (lecture seule) — limite accidentelle et RGPD-friendly.

**Critères d'acceptation F8.** Toute action admin tracée dans `moderation_actions` avec utilisateur, cible, motif, heure ; un admin ne peut pas déléguer son rôle (changement manuel DB seulement).

### F9 — Conformité & conformité RGPD

- **18+** : contrôle serveur à l'inscription ; mention légale ; signalement « mineur » → suspension immédiate + revue.
- **CGU / politique de confidentialité** : accessibles à l'inscription + réglages ; interdictions claires (nudité, escroquerie, commerce, harcèlement) ; promesse écrite « vos données ne sont jamais revendues ».
- **RGPD** : base légale (contrat + intérêt légitime sécurité) ; minimisation (pas de nom de famille, pas de pièce d'identité, position jamais stockée en précis) ; **droits** : export JSON (profil, matchs, messages), suppression J+30 après demande (sauvegardes ≤ 90 j) ; registre des traitements ; sous-traitants UE quand disponible ; plan incident (notification CNIL 72 h).
- **Analytics produit** (table `events`) : funnel étape par étape (inscription, profil complété, 1er swipe, match, 1er message, date déclarée « on s'est vu ») — la North Star est **conversations actives à J+7**.

**Critères d'acceptation F9.** Export demandé → lien de téléchargement signé valable 24 h ; suppression → anomalisation < 24 h, purge < 30 j ; aucune coordonnée GPS stockée nulle part (audit DB + fichiers).

---

## 6. Modèle de données (entités TypeORM)

| Table | Contenu clé | Remarques |
|---|---|---|
| `users` | id uuid, email (unique, lowercase), password_hash, role (`user`/`admin`), email_verified, created_at | argon2id |
| `refresh_tokens` | token_hash, family_id, user_id, expires_at, revoked_at, user_agent | rotation + familles |
| `profiles` | user_id, display_name, birth_date, gender, seeking, intention, bio, commune, completed_at | 1:1 users |
| `photos` | profile_id, path_orig, path_main, path_thumb, status (`pending`/`approved`/`rejected`), position | sharp |
| `preferences` | profile_id, age_min, age_max, distance_km, seeking, intention | 1:1 profiles |
| `swipes` | swiper_id, target_profile_id, action (`like`/`pass`/`superlike`), created_at | index (swiper, created) ; unique (swiper, target) |
| `matches` | user_a_id, user_b_id, created_at, last_message_at, status | unique sur le couple trié |
| `messages` | id uuid, match_id, sender_id, body, client_uuid (unique), delivered_at | source de vérité |
| `blocks` | blocker_id, blocked_profile_id, created_at | unique ; contrôle decks + sockets |
| `reports` | reporter_id, target_profile_id, reason, detail, status, handled_at, handled_by | file modération |
| `bans` | email, device_fingerprint, reason, created_at | anti-recréation |
| `push_subscriptions` | user_id, endpoint (unique), keys_json, user_agent | web-push |
| `moderation_actions` | admin_id, target_user_id, action, reason | audit RGPD/stores |
| `events` | user_id, name, props_json, created_at | analytics funnel |

- PK uuid, `created_at/updated_at` partout ; soft-delete **non utilisé** (suppression = anomalisation explicite, plus RGPD-sûr).
- Index créés dès le début : `swipes(target_profile_id)`, `matches(user_a_id|user_b_id)`, `messages(match_id, created_at)`, `blocks(blocker_id)` ; FK en cascade maîtrisée (jamais `ON DELETE CASCADE` sur `users` — purge via service, pour garder l'audit).

## 7. Référence API

### 7.1 REST (préfixe `/api`)

| Domaine | Endpoints |
|---|---|
| Auth | `POST /auth/register · /auth/verify-email · /auth/login · /auth/refresh · /auth/logout · /auth/forgot-password · /auth/reset-password` |
| Profil | `GET/PUT /me · GET/PUT /me/preferences · POST /me/photos · DELETE /me/photos/:id · PUT /me/photos/order · DELETE /me` |
| Découverte | `GET /deck` · `POST /swipe` · `GET /quotas` |
| Matchs & chat | `GET /matches · GET /matches/:id/messages?cursor · POST /matches/:id/messages (fallback hors websocket)` |
| Sécurité | `POST /reports · POST /blocks · DELETE /blocks/:profileId` |
| Push | `POST /push/subscribe · DELETE /push/subscribe` |
| Admin | `GET /admin/reports?status= · POST /admin/moderation-actions · GET /admin/profiles/:id · GET /admin/stats` |

Conventions : réponses `{ data, meta? }`, erreurs `{ code, message }`, pagination par curseur, validation zod de tout corps entrant.

### 7.2 Événements Socket.IO

| Direction | Événement | Payload |
|---|---|---|
| ↕ | `connection` (auth JWT au handshake, join auto des rooms `match:{id}` des matchs actifs) | — |
| client→srv | `message:send` | `{ matchId, clientUuid, body }` |
| srv→client | `message:new` | message persisté enrichi |
| client→srv | `typing` | `{ matchId }` (rate-limited 1/s) |
| srv→client | `match:new` | carte match |
| srv→client | `blocked` | `{ byProfileId }` → gel UI immédiat |

## 8. Score de deck (déterministe, documenté, ré-entraînable plus tard)

```
score(profile p, requester r) = 100
  − 30 × (inactif > 14 jours ?)            [dernière session]
  + 20 × (≥ 2 photos ?)
  + 10 × (photo 1 modérée < 7 jours ?)
  − distance_km_bucket :  ≤10 km→0 · ≤30 km→5 · ≤60 km→10 · ≤160 km→20 · au-delà → déjà exclu par le filtre distance de r
  + 15  si r a envoyé un super-like à p    [priorisation : p placé en tête du deck de r]
  × 1.5  si profil < 72 h (boost découverte)

Exclusions absolues avant calcul : bloqués, bannis, profils non publiés/non vérifiés email,
hors filtres (âge/genre/distance), 18+ strict, matchs existants, déjà swipés < 30 j.
```

Sélection : top N pondéré par un léger mélange déterministe (sel = date du jour) pour la fraîcheur ; recalculé à chaque `GET /deck`. Le score n'est jamais exposé au client.

---

## 9. Règles de gestion — récapitulatif

| Règle | Valeur V1 |
|---|---|
| Âge minimum | 18 ans (serveur, depuis la date de naissance) |
| Compte | 1 email = 1 compte · vérification email obligatoire avant tout usage actif |
| Tokens | access 15 min (mémoire) · refresh 30 j (cookie httpOnly, rotation) |
| Reset quotas | 00:00 Europe/Paris |
| Likes / jour | 25 |
| Super-like / jour | 1 |
| Deck | 10–20 cartes pré-calculées backend, refetch à pile vide |
| Pénalité distance | ≤10 km:0 · ≤30:5 · ≤60:10 · ≤160:20 |
| Inactivité | −30 au score après 14 j ; dépriorisation > 30 j |
| Profil nouveau | boost ×1,5 pendant 72 h |
| Match sans message | « endormi » à 48 h, conservé |
| Messages | 1 000 car. · 30/min · 100/h · curseur 50 |
| Photos | 1–6 · JPEG/PNG/WebP ≤ 8 Mo · EXIF purgé · 1re photo modérée avant publication |
| Blocage | instantané, silencieux, bidirectionnel |
| Signalements | réponse < 24 h (urgences < 2 h) |
| Suppression compte | anomalisation < 24 h · purge J+30 · backups ≤ 90 j |
| Rate-limit login | 5 / 15 min par IP+email |

---

## 10. Qualité, performance, observabilité

- **Performance** : API p95 < 500 ms ; swipe perçu < 300 ms (préchargement) ; cold start PWA < 2,5 s ; Lighthouse perf mobile ≥ 90 sur les écrans clés.
- **Tests** : vitest (unit) dès M1 ; supertest sur les routes critiques (auth, deck, swipe, match, modération) ; Playwright e2e « inscription → swipe → match → 1 message » en Should.
- **Observabilité** : pino JSON + request-id ; Sentry (erreurs API + crash front) ; dashboard des events funnel dans F8 ; alerte simple (uptime check) sur /healthz.
- **Sécurité** : TLS 1.2+, helmet, CORS strict, rate-limits Redis, argon2id, jose HS512, upload MIME contrôlé par contenu, aucune donnée géo précise stockée, secrets en env.
- **Accessibilité** : contrastes AA, navigation clavier sur les flux critiques (deck, chat, signalement).

---

## 11. Phasage (≈ 12 semaines jusqu'à la beta)

| Phase | Durée | Contenu | Jalon GO/NO-GO |
|---|---|---|---|
| **M0 — Fondations** | 1 sem | `git init`, monorepo pnpm, docker compose, CI, squelettes api/web, `packages/shared`, déploiement éclair staging | Boucle « hello world » authentifiée bout en bout |
| **M1 — Auth + profil** | 3 sem | F-Auth complet, F1, uploads photos + sharp + modération basique, migrations | Inscription → profil public jouable internement, tests verts |
| **M2 — Découverte + match** | 3 sem | F2 (deck, quotas), F3 (swipes, matchs, score §8), écrans swipe | Boucle swipe→match interne OK, p95 < 500 ms |
| **M3 — Chat + sécurité + push** | 2–3 sem | F4 Socket.IO, F5 signalement/blocage/modération, F6 Web Push, F8 back-office | Beta fermée possible : boucle complète + modération |
| **M4 — PWA hardening + beta** | 2 sem | F7 (install/offline/update), RGPD (export/suppression), audits (sécurité, EXIF, tokens), beta 100–300 users | GO public si rétention D7 ≥ 15 % + 0 fuite de données sensibles |

**Stratégie de lancement** : beta fermée par lien/invitation (listes d'attente locales suffisent au stade « Tinder-like vierge ») ; la densité du bassin prime sur la couverture — démarrer sur une seule zone géographique dense avant d'ouvrir (principe « l'œuf et la poule »).

## 12. Risques & mitigations

| # | Risque | Gravité | Mitigation |
|---|---|---|---|
| 1 | Deck vide = churn instantané (œuf/poule) | 🔴 | Lancement zone unique + boost nouveau profil + liste d'attente ; densité > étendue |
| 2 | Auth mdp-only → comptes fake/fermes de bots | 🟠 | Vérification email obligatoire avant tout usage actif, rate-limits, modération, ban email+device ; OTP SMS en V1.1 si la beta le prouve |
| 3 | Modération solo sous-dimensionnée | 🟠 | SLA < 24 h assumé, file priorisée, motif anti-recréation (bans), page conseils (V1.1) |
| 4 | Web Push fragmenté (iOS exige installation) | 🟡 | Guide d'installation contextuel ; l'app reste pleinement utilisable sans push |
| 5 | Photos NSFW / HEIC non décodé | 🟡 | Modération 1re photo ; HEIC dégradé avec message clair (§13) |
| 6 | RGPD (données photos + chats) | 🟡 | Minimisation, export/suppression, audit EXIF, sous-traitants UE, registre |
| 7 | Mono-instance (SPOF) | 🟡 | Redis adapter socket prévu ; scale-out documenté (§13) — pas avant d'en avoir besoin |

## 13. Décisions à valider (open questions)

| # | Décision | Recommandation | Pourquoi |
|---|---|---|---|
| 1 | **Nom + domaine** ✅ tranché V1.1 | « **TiPiment** » — vérifs INPI + stores + domaines (.fr/.re) à mener avant tout design/comm (collision connue ti'Piment.fr) | Le nom se porte avant la beta |
| 2 | **Vérification email** ✅ tranché V1.1 | **Obligatoire avant tout usage actif** (Must, cf. §4.1) | Anti-fake minimum, sans coût SMS |
| 3 | **V1.1 auth** | OTP SMS ou magic-link, selon les faux comptes constatés en beta | Ne pas payer SMS tant que mdp+email suffit |
| 4 | **Photos : stockage objet + CDN** | V1.1 (interface déjà prévue), coût mesuré en beta | Simplicité V1, migration douce |
| 5 | **HEIC** | Conversion wasm côté client si demande beta | sharp/Linux sans libheif ne décode pas |
| 6 | **Scaling horizontal** | Ajouté seulement si > 1 000 utilisateurs simultanés (Socket.IO Redis adapter déjà prévu) | YAGNI |
| 7 | **Distance en km ou buckets temps** | km arrondi V1 ; buckets étudier en V1.1 selon retours | Familiarité Tinder |
| 8 | **Fuseau reset quotas** ✅ tranché V1.1 | Europe/Paris (paramétrable si internationalisation) | Cohérence locale |
| 9 | **Tags et réactions supplémentaires** | Could, si la beta le demande | Reste léger |

---

*Fin du CDC V1.1 — toute modification passe par un changement de version + date.*