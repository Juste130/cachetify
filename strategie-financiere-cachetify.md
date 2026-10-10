# Stratégie financière — Cachetify

> Document de travail interne. Rédigé le 30 août 2026. Complète la note stratégique business
> complète (marché, concurrence, institutions, positionnement, feuille de route) publiée en
> artifact — ce fichier se concentre sur le volet financier et la levée de fonds, avec assez de
> détail pour servir de base à un pitch investisseurs.
>
> **Statut des chiffres** : modèle illustratif à hypothèses explicites, pas une étude de marché
> vérifiée ni des prévisions engageantes. Chaque chiffre est accompagné de l'hypothèse qui le
> produit, pour pouvoir être corrigé avec des données terrain et un conseil juridique/comptable
> avant tout usage face à des investisseurs.

## Sommaire

1. [Taille de marché (TAM / SAM / SOM)](#1-taille-de-marché-tam--sam--som)
2. [Scénarios de revenu à 3 ans](#2-scénarios-de-revenu-à-3-ans)
3. [Économie unitaire par segment](#3-économie-unitaire-par-segment-cac-ltv-marge-churn)
4. [Trajectoire MRR / ARR](#4-trajectoire-mrr--arr)
5. [Churn — ce qu'il faut mesurer](#5-churn--ce-quil-faut-mesurer-segment-par-segment)
6. [Levée de fonds — montant et contrepartie](#6-levée-de-fonds--montant-et-contrepartie)
7. [Répartition des fonds](#7-répartition-des-fonds-18-mois-de-runway-visés)
8. [Injection en tranches](#8-injection-en-tranches)
9. [Gestion de la dette](#9-gestion-de-la-dette)
10. [Sources](#10-sources)

---

## 1. Taille de marché (TAM / SAM / SOM)

Approche par entonnoir, construite à partir de la population des quatre pays déjà câblés
juridiquement dans le produit (Bénin, Togo, Côte d'Ivoire, Sénégal — population cumulée
≈ 73 millions d'habitants, projections 2025 INSAE/ANSD/UNFPA).

| Niveau | Estimation | Méthode |
|---|---|---|
| **TAM** (plafond théorique) | ≈ 10 à 18 millions d'actes/an | Population active des 4 pays (≈ 33–36M, ~47% des 73M habitants) × 0,3 à 0,5 acte contractuel formalisable par actif et par an (embauche, bail, prestation, accord commercial), formel + informel confondus. |
| **SAM** (adressable) | ≈ 1 à 2 millions d'actes/an | TAM × 8–12% : segments connectés et enclins à formaliser — indépendants numériques, MPME semi-formelles à formelles, professions organisées, ONG/bailleurs. |
| **SOM à 36 mois** | ≈ 20 000 à 700 000 actes/an | 1 à 3% du SAM effectivement capté selon le scénario (conservateur/central/ambitieux), sur les segments prioritaires et les 4 pays ouverts progressivement. |

**Repères démographiques utilisés** : Bénin ≈ 14M · Togo ≈ 9,5M · Côte d'Ivoire ≈ 31M ·
Sénégal ≈ 19M.

**Repères sectoriels (Bénin, INSAE — ERI-ESI 2018)** : ≈ 90% des emplois relèvent de
l'économie informelle ; ≈ 1,3 million d'unités de production informelles ; les MPME (formelles
et informelles confondues) emploient 3,5 millions de personnes (94,2% de la population active
occupée) et produisent plus de 40% de la richesse nationale.

---

## 2. Scénarios de revenu à 3 ans

Modèle simple et transparent : volume de contrats payants × prix moyen pondéré (« ARPU
mixte », qui augmente avec le temps à mesure que les paliers Pro/API montent en poids dans le
mix). Taux de conversion indicatif retenu : **≈ 600 FCFA / 1 $**.

| Période | Scénario | Contrats payants/an | ARPU moyen | Revenu annuel |
|---|---|---:|---:|---:|
| **Année 1** — Bénin seul | Conservateur | 2 000 | 600 F | 1,2 M F (≈ 2 000 $) |
| | Central | 6 000 | 700 F | 4,2 M F (≈ 7 000 $) |
| | Ambitieux | 15 000 | 800 F | 12 M F (≈ 20 000 $) |
| **Année 2** — + Côte d'Ivoire, Sénégal, 1er partenaire API | Conservateur | 20 000 | 900 F | 18 M F (≈ 30 000 $) |
| | Central | 60 000 | 1 100 F | 66 M F (≈ 110 000 $) |
| | Ambitieux | 150 000 | 1 300 F | 195 M F (≈ 325 000 $) |
| **Année 3** — 4 pays, séquestre actif, 2–5 partenaires API | Conservateur | 100 000 | 1 200 F | 120 M F (≈ 200 000 $) |
| | Central | 300 000 | 1 500 F | 450 M F (≈ 750 000 $) |
| | Ambitieux | 700 000 | 1 800 F | 1,26 Md F (≈ 2,1 M $) |

**Exemple illustratif — mécanique du revenu séquestre** : si 5 000 contrats/an utilisent le
séquestre avec un montant moyen de 200 000 FCFA et une commission de 1,5%, cela ajoute environ
15 M FCFA (≈ 25 000 $) de revenu annuel. Un seul exemple chiffré pour montrer le mécanisme —
le volume réel dépendra de l'adoption du séquestre en phase 2, elle-même conditionnée à la
levée des points réglementaires (statut du séquestre au regard des services de paiement selon
les pays).

**Lecture honnête** : même le scénario ambitieux de l'année 3 (≈ 2,1 M$ de revenu annuel) reste
une taille d'entreprise seed-stage, pas une licorne — cohérent avec un prix unitaire
volontairement bas pour lever la barrière d'adoption. La vraie valeur à moyen terme vient moins
du volume grand public que du mix API/marque blanche et de la commission séquestre.

---

## 3. Économie unitaire par segment (CAC, LTV, marge, churn)

Hypothèses volontairement optimistes sur les canaux à faible coût (communautés,
partenariats) — à corriger à la baisse dès que les premiers chiffres réels d'acquisition
seront disponibles ; le CAC réel des premiers mois est presque toujours plus élevé que le
modèle initial.

| Segment | ARPU | CAC estimé | Marge brute | LTV estimée | LTV:CAC | Payback |
|---|---:|---:|---:|---:|---:|---:|
| Indépendant (à l'usage) | ≈ 1 800 F/mois actif | 500–1 000 F | ≈ 95% | ≈ 10 000 F | 10–20x | < 1 mois |
| PME (Pro) | ≈ 20 000 F/mois | 15 000–25 000 F | ≈ 92% | ≈ 330 000 F | 15–20x | < 2 mois |
| Partenaire API/B2B | ≈ 6 M F/mois | 500 K–1,5 M F | ≈ 85% | ≈ 120 M F | > 80x | < 1 mois* |

\* Le retour financier est rapide une fois signé, mais le cycle de vente lui-même dure
généralement 3 à 6 mois — un délai à budgéter séparément dans le runway, pas dans le payback.

**Point clé** : la marge brute très élevée (coût marginal quasi nul par contrat : appel IA
Groq, ancrage IPFS, transaction Polygon sponsorisée — de l'ordre de fractions de centime à
quelques centimes de dollar) rend le modèle tolérant à un CAC imparfait sur les segments
PME/API, mais **intolérant sur le segment indépendant/à l'usage** — à 600 FCFA le contrat,
aucun canal d'acquisition payant classique (publicité display, réseaux sociaux sponsorisés) ne
peut s'amortir. C'est ce qui justifie la priorité donnée aux canaux communautaires et
institutionnels à coût quasi nul dans la stratégie go-to-market.

---

## 4. Trajectoire MRR / ARR

À distinguer du tableau de revenu total (section 2), qui inclut aussi le revenu transactionnel
à l'usage (non récurrent par nature). Le MRR ci-dessous ne compte que les abonnements Pro et
les minimums contractuels API — la mesure qu'un investisseur SaaS cherchera en premier.
Scénario central.

| Horizon | MRR | ARR |
|---|---:|---:|
| Fin Année 1 | ≈ 300 000 F (≈ 500 $) | ≈ 3,6 M F (≈ 6 000 $) |
| Fin Année 2 | ≈ 7,4 M F (≈ 12 300 $) | ≈ 89 M F (≈ 148 000 $) |
| Fin Année 3 | ≈ 32,8 M F (≈ 54 700 $) | ≈ 394 M F (≈ 656 000 $) |

Hypothèses sous-jacentes (année 3, exemple) : ≈ 400 PME sur le palier Pro (≈ 22 000 F/mois
chacune) + 4 partenaires API (≈ 6 M F/mois en moyenne chacun).

---

## 5. Churn — ce qu'il faut mesurer, segment par segment

- **Indépendants/à l'usage** : ce n'est pas un abonnement, le churn classique n'a pas de sens.
  Suivre plutôt la *fréquence de retour* (contrats/actif/mois) et le taux de réactivation à 90
  jours.
- **PME Pro** : churn mensuel cible < 5% en phase de validation, à faire converger vers < 3%
  une fois le produit mature — cohérent avec des repères SaaS habituels en marché émergent
  (plus élevés qu'en SaaS occidental mature).
- **Partenaires API/B2B** : échantillon trop petit les deux premières années pour un taux
  significatif — suivre en nombre absolu de partenaires gagnés/perdus, le coût de bascule
  technique étant élevé une fois intégré.

---

## 6. Levée de fonds — montant et contrepartie

> **Ask recommandé : 60 000 000 FCFA (≈ 100 000 $) en pré-amorçage, contre 10 à 12% du
> capital.**

Instrument recommandé : **SAFE ou note convertible à plafond de valorisation**, plutôt qu'un
tour au prix fait — plus rapide à négocier et plus habituel à ce stade pré-revenu significatif
(produit prêt, marché documenté, pas encore d'utilisateurs payants réels).

- **Plafond de valorisation indicatif** : ≈ 550 M FCFA (≈ 915 000 $) pre-money, impliquant une
  dilution d'environ 10 à 12% à la conversion.
- **Alternative** : si un investisseur exige un tour au prix fait dès maintenant, la même
  fourchette de 10 à 12% contre 60 M FCFA reste un point de départ de négociation raisonnable.
- À faire valider par un avocat corporate avant toute signature — la structure exacte (SAFE,
  note convertible, actions préférentielles) a des implications fiscales et de gouvernance
  différentes selon le pays d'incorporation choisi.

**Profils de fonds pertinents à approcher** (hypothèse de travail à valider, pas des
engagements) : fonds pré-amorçage/amorçage actifs sur le fintech/legaltech africain
francophone, et véhicules non-dilutifs listés en section 9.

---

## 7. Répartition des fonds (18 mois de runway visés)

| Poste | Part | Montant |
|---|---:|---:|
| Équipe (recrutement business/GTM local) | 35% | 21 M F (≈ 35 000 $) |
| Produit & infrastructure (production payante, KYC renforcé, paiement) | 20% | 12 M F (≈ 20 000 $) |
| Juridique & conformité (entité, cabinets locaux, avis KYC/AML) | 15% | 9 M F (≈ 15 000 $) |
| Marketing & acquisition (communautés, contenu, ambassadeurs juridiques) | 15% | 9 M F (≈ 15 000 $) |
| Relations institutionnelles (DGI, OTR, DGID — déplacements, dossiers) | 5% | 3 M F (≈ 5 000 $) |
| Réserve de sécurité | 10% | 6 M F (≈ 10 000 $) |
| **Total** | **100%** | **60 M F (≈ 100 000 $)** |

Burn mensuel moyen implicite sur 18 mois : ≈ 3,3 M FCFA/mois (≈ 5 600 $/mois) — cohérent avec
une équipe très restreinte (2 à 4 personnes) dans un marché à faible coût opérationnel. Point
de décision à 12 mois sur la trajectoire MRR pour engager le tour Seed suivant.

---

## 8. Injection en tranches

Le découpage en tranches protège les deux parties : il évite de lever plus que ce que
l'exécution des 6 premiers mois peut raisonnablement absorber, et donne à l'investisseur des
points de contrôle objectifs sans renégocier le prix à chaque étape.

| Tranche | Part | Déclenchée par |
|---|---:|---|
| 1 | 50% (30 M F) | Signature — entité légale finalisée, paiement mobile money branché, recrutement clé effectué. |
| 2 | 30% (18 M F) | Volume de contrats payants mensuels atteint (jalon chiffré à fixer avec l'investisseur) + premier contact DGI documenté. |
| 3 | 20% (12 M F) | Unit economics validés (LTV:CAC > 3 sur au moins un segment) + KYC renforcé opérationnel. |

---

## 9. Gestion de la dette

À ce stade, **aucune dette ne doit financer le fonctionnement courant** : sans revenu récurrent
prévisible, le service d'une dette classique (taux bancaires locaux souvent à deux chiffres)
grèverait un runway déjà serré. Le financement doit rester exclusivement en capital/convertible
jusqu'à ce que le MRR soit assez régulier pour envisager de la dette de croissance (venture
debt), généralement pas avant un tour Seed.

**Acceptable** : une dette de très court terme, ciblée — un mini fonds de roulement pour
couvrir le décalage entre dépôt mobile money et libération d'un séquestre, strictement
plafonné, jamais mêlé au budget d'exploitation.

**À éviter** : emprunter pour payer salaires/marketing avant d'avoir un revenu récurrent
prévisible — le scénario qui a fait échouer nombre de jeunes entreprises ouest-africaines
sous-capitalisées.

**Compléments non-dilutifs à explorer en parallèle de la levée** (pas en substitut) : concours
et subventions à l'entrepreneuriat numérique — agences nationales de transformation numérique,
Orange Digital Center, initiatives type Digital Africa ou GSMA Innovation Fund. Montants
généralement modestes mais gratuits en capital, utiles pour financer spécifiquement le volet
institutionnel/juridique (relations DGI/OTR/DGID).

---

## 10. Sources

- [e-Enregistrement — Ministère de l'Économie et des Finances du Bénin](https://finances.bj/services/e-enregistrement/?lang=en)
- [Guide d'utilisation E-Enregistrement — DGI Bénin](https://www.impots.finances.gouv.bj/wp-content/uploads/2020/08/GUIDE-D%E2%80%99UTILISATION-E-ENREGISTREMENT.pdf)
- [Office Togolais des Recettes (OTR)](https://www.otr.tg/)
- [e-Impôts — DGI Côte d'Ivoire](https://e-impots.gouv.ci/)
- [e-Services — DGID Sénégal](https://www.dgid.sn/e-services/)
- [Enregistrer un contrat de location — DGID Sénégal](http://www.impotsetdomaines.gouv.sn/fr/enregistrer-un-contrat-de-location-dun-bien-immobilier)
- [Enquête Régionale Intégrée de l'Emploi et du Secteur Informel — INSAE Bénin](https://instad.bj/images/docs/insae-statistiques/sociales/ERI_ESI/Rapport%20de%20synth%C3%A8se%20de%20l'Enqu%C3%AAte%20R%C3%A9gionale%20Int%C3%A9gr%C3%A9e%20de%20l'Emploi%20et%20du%20Secteur%20Informel%20(ERIESI).pdf)
- [Annuaire Population du Sénégal 2025 — ANSD](https://www.ansd.sn/sites/default/files/2026-04/Rapport%20sur%20la%20Population%20du%20Se%CC%81ne%CC%81gal%202025%2029_avril_OK.pdf)
- [Mobile Money — rapport GSMA](https://www.gsma.com/newsroom/press-release/mobile-money-surpasses-two-billion-registered-accounts-and-over-half-a-billion-monthly-active-users-globally/)

---

## Documents liés

- Note stratégique complète (marché, concurrence, institutions, positionnement, feuille de
  route, risques, KPIs) — publiée en artifact, à demander au dernier lien partagé en
  conversation.
- Pitch deck investisseurs (15 slides) — publié en artifact, même remarque.

*Document rédigé avec l'assistance de Claude (Anthropic) sur la base du code et des choix
produit réels de Cachetify, croisés avec une recherche documentaire ciblée. À faire réviser
par un conseil juridique et comptable local avant tout usage face à des investisseurs.*
