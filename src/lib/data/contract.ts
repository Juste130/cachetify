import { ContractTemplate } from '../types/contract';

export const contractTemplates: ContractTemplate[] = [
  {
    id: 'cdi',
    title: 'Contrat à Durée Indéterminée',
    description: 'Contrat de travail permanent avec clauses standards',
    icon: '👔',
    color: 'border-blue-200 hover:border-blue-500',
    defaultContent: `CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE

Entre les soussignés :

[PARTIE_1], ci-après dénommé(e) "l'Employeur",
d'une part,

et

[PARTIE_2], ci-après dénommé(e) "le Salarié",
d'autre part,

IL A ÉTÉ CONVENU CE QUI SUIT :

ARTICLE 1 - FONCTIONS
Le Salarié est engagé en qualité de [POSTE] et exercera les fonctions correspondantes.

ARTICLE 2 - RÉMUNÉRATION
Le salaire mensuel brut est fixé à [MONTANT] euros.

ARTICLE 3 - DURÉE DU TRAVAIL
La durée du travail est fixée à 35 heures par semaine.

ARTICLE 4 - DATE D'EFFET
Le présent contrat prend effet à compter du [DATE_DEBUT].

Fait à [VILLE], le [DATE_SIGNATURE]`,
    defaultClauses: [
      {
        id: '1',
        title: 'Clause de confidentialité',
        content: 'Le salarié s\'engage à garder confidentielle toute information relative à l\'entreprise.',
        isRequired: true,
        order: 1
      },
      {
        id: '2',
        title: 'Clause de non-concurrence',
        content: 'Pendant la durée du contrat et 12 mois après sa cessation, le salarié ne pourra pas travailler pour un concurrent direct.',
        isRequired: false,
        order: 2
      }
    ],
    defaultPaymentTerms: [
      {
        id: '1',
        description: 'Salaire mensuel',
        amount: '2500',
        currency: 'EUR',
        dueDate: '',
        isAutomatic: true
      }
    ],
    requiredFields: ['title', 'parties', 'startDate', 'amount']
  },
  {
    id: 'freelance',
    title: 'Mission Freelance',
    description: 'Contrat de prestation pour projets ponctuels',
    icon: '💻',
    color: 'border-green-200 hover:border-green-500',
    defaultContent: `CONTRAT DE PRESTATION DE SERVICES

Entre :

[PARTIE_1], ci-après dénommé(e) "le Client",
d'une part,

et

[PARTIE_2], ci-après dénommé(e) "le Prestataire",
d'autre part,

ARTICLE 1 - OBJET
Le Prestataire s'engage à réaliser pour le Client les prestations suivantes : [DESCRIPTION_PRESTATION].

ARTICLE 2 - DÉLAI
La prestation devra être réalisée pour le [DATE_FIN].

ARTICLE 3 - RÉMUNÉRATION
Le prix de la prestation est fixé à [MONTANT] euros.

ARTICLE 4 - PROPRIÉTÉ INTELLECTUELLE
Les droits de propriété intellectuelle sont cédés au Client après paiement intégral.`,
    defaultClauses: [
      {
        id: '1',
        title: 'Clause de propriété intellectuelle',
        content: 'Tous les droits de propriété intellectuelle sont transférés au client après paiement complet.',
        isRequired: true,
        order: 1
      }
    ],
    defaultPaymentTerms: [
      {
        id: '1',
        description: 'Acompte',
        amount: '30',
        currency: 'EUR',
        dueDate: '',
        isAutomatic: true
      },
      {
        id: '2',
        description: 'Solde',
        amount: '70',
        currency: 'EUR',
        dueDate: '',
        isAutomatic: true
      }
    ],
    requiredFields: ['title', 'parties', 'startDate', 'endDate', 'amount']
  },
  {
    id: 'location',
    title: 'Bail de Location',
    description: 'Contrat de location immobilière',
    icon: '🏠',
    color: 'border-orange-200 hover:border-orange-500',
    defaultContent: `BAIL DE LOCATION

Entre :

[PARTIE_1], ci-après dénommé(e) "le Bailleur",
d'une part,

et

[PARTIE_2], ci-après dénommé(e) "le Locataire",
d'autre part,

ARTICLE 1 - BIEN LOUÉ
Le Bailleur donne en location le bien suivant : [DESCRIPTION_BIEN].

ARTICLE 2 - DURÉE
Le présent bail est conclu pour une durée de [DUREE] à compter du [DATE_DEBUT].

ARTICLE 3 - LOYER
Le loyer mensuel est fixé à [MONTANT] euros.

ARTICLE 4 - CAUTION
Une caution de [CAUTION] euros est versée par le Locataire.`,
    defaultClauses: [
      {
        id: '1',
        title: 'Clause d\'entretien',
        content: 'Le locataire s\'engage à entretenir le bien loué et à effectuer les menues réparations.',
        isRequired: true,
        order: 1
      }
    ],
    defaultPaymentTerms: [
      {
        id: '1',
        description: 'Loyer mensuel',
        amount: '800',
        currency: 'EUR',
        dueDate: '',
        isAutomatic: true
      },
      {
        id: '2',
        description: 'Caution',
        amount: '1600',
        currency: 'EUR',
        dueDate: '',
        isAutomatic: false
      }
    ],
    requiredFields: ['title', 'parties', 'startDate', 'amount']
  }
];