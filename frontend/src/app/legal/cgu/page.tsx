import { LegalPage, type LegalSection } from "@/components/pages/legal-page";

const sections: LegalSection[] = [
  {
    id: "objet",
    title: "1. Objet",
    content: (
      <p>
        Les présentes conditions régissent l'accès et l'utilisation de Cachetify, un service de
        création, signature électronique et archivage de contrats s'appuyant sur une intelligence
        artificielle et sur le réseau blockchain Polygon.
      </p>
    ),
  },
  {
    id: "ce-que-cachetify-fait",
    title: "2. Ce que Cachetify fait — et ne fait pas",
    content: (
      <>
        <p>
          La rédaction assistée par IA propose un texte de contrat à partir des informations
          fournies ; elle ne constitue pas un avis juridique et ne se substitue pas à l'examen d'un
          professionnel du droit, en particulier pour un engagement à enjeu significatif.
        </p>
        <p>
          La signature réalisée sur Cachetify confirme l'identité de l'utilisateur via son compte
          et son portefeuille numérique déjà connectés à la session ; elle ne constitue pas une
          vérification d'identité par pièce officielle. La valeur juridique de cette signature
          dépend du cadre légal applicable dans le pays du contrat concerné.
        </p>
        <p>
          L'ancrage blockchain assure l'horodatage et l'intégrité du document signé (toute
          modification ultérieure du texte est détectable). Cachetify fonctionne actuellement sur
          Polygon Amoy, un réseau de test public, en amont d'un déploiement sur le réseau principal.
        </p>
      </>
    ),
  },
  {
    id: "compte-et-portefeuille",
    title: "3. Compte et portefeuille numérique",
    content: (
      <p>
        L'inscription entraîne la création automatique d'un portefeuille numérique associé au
        compte de l'utilisateur, utilisé pour signer les contrats sur la blockchain. L'utilisateur
        reste responsable de la confidentialité de l'accès à son compte.
      </p>
    ),
  },
  {
    id: "sequestre-et-litiges",
    title: "4. Séquestre (escrow) et litiges",
    content: (
      <p>
        La fonctionnalité de séquestre de fonds entre parties, lorsqu'elle est proposée dans un
        contrat, n'est pas encore active en production à la date de cette page : aucun fonds réel
        n'est aujourd'hui déplacé via cette fonctionnalité. Le signalement d'un litige sur un
        contrat suspend, côté Cachetify, la libération automatique ou anticipée d'un séquestre
        associé, en attendant sa résolution. La résolution d'un litige signalé est examinée par
        l'équipe Cachetify ; elle ne constitue pas une décision arbitrale ou judiciaire.
      </p>
    ),
  },
  {
    id: "resiliation-et-suspension",
    title: "5. Résiliation et suspension",
    content: (
      <p>
        Cachetify peut suspendre l'accès à la plateforme en cas d'incident technique ou de
        sécurité affectant l'ensemble du service. Cette suspension est distincte de la résiliation
        d'un contrat individuel entre utilisateurs, qui reste régie par les clauses propres à ce
        contrat. Un utilisateur peut demander la clôture de son compte à tout moment ; les contrats
        déjà signés et ancrés sur la blockchain restent consultables et opposables indépendamment
        de la clôture du compte qui les a créés.
      </p>
    ),
  },
  {
    id: "propriete-du-contenu",
    title: "6. Propriété du contenu généré",
    content: (
      <p>
        Le texte d'un contrat généré ou modifié par l'utilisateur via Cachetify lui appartient.
        Cachetify ne revendique aucun droit sur le contenu des contrats créés par ses
        utilisateurs, et ne les exploite pas à d'autres fins que la fourniture du service
        (génération, signature, archivage, et amélioration technique du service lui-même).
      </p>
    ),
  },
  {
    id: "limitation-de-responsabilite",
    title: "7. Limitation de responsabilité",
    incomplete: true,
    content: (
      <p>
        Cachetify est un outil facilitant la création, la signature et l'archivage de contrats ;
        il n'est pas partie aux contrats conclus entre ses utilisateurs et n'intervient pas dans
        leur exécution. La portée exacte de cette limitation (cas d'exclusion, plafond éventuel,
        articulation avec le droit de la consommation applicable) doit être validée par un
        professionnel du droit avant publication définitive — ce paragraphe reste un point
        d'attention prioritaire du brouillon.
      </p>
    ),
  },
  {
    id: "modification-des-conditions",
    title: "8. Modification des présentes conditions",
    content: (
      <p>
        Cachetify peut faire évoluer ces conditions, notamment pour refléter de nouvelles
        fonctionnalités (activation réelle de l'escrow, passage en réseau principal) ou une
        évolution du cadre légal. La date de dernière mise à jour, en haut de cette page, permet
        de suivre ces changements.
      </p>
    ),
  },
  {
    id: "droit-applicable",
    title: "9. Droit applicable et juridiction",
    incomplete: true,
    content: (
      <p>
        À préciser selon les juridictions effectivement desservies par Cachetify (France et
        espace OHADA à ce jour) — un service multi-juridictions comme celui-ci doit clarifier avec
        un professionnel du droit si une loi et une juridiction uniques s'appliquent à tous les
        utilisateurs, ou si cela varie selon le pays du contrat concerné.
      </p>
    ),
  },
];

export default function Page() {
  return <LegalPage title="Conditions générales d'utilisation" updatedAt="26 août 2026" sections={sections} />;
}
