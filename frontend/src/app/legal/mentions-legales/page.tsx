import { LegalPage, type LegalSection } from "@/components/pages/legal-page";

const sections: LegalSection[] = [
  {
    id: "editeur-du-site",
    title: "Éditeur du site",
    incomplete: true,
    content: (
      <p>
        <em>
          Raison sociale, forme juridique, adresse du siège, numéro d'immatriculation et
          directeur de la publication — à compléter par l'équipe Cachetify avant publication
          définitive. Ces informations sont obligatoires dans la plupart des juridictions avant
          toute mise en ligne d'un service à destination du public.
        </em>
      </p>
    ),
  },
  {
    id: "hebergement",
    title: "Hébergement",
    incomplete: true,
    content: <p>Coordonnées de l'hébergeur de l'application et de l'infrastructure associée — à compléter.</p>,
  },
  {
    id: "nature-du-service",
    title: "Nature du service",
    content: (
      <p>
        Cachetify est une plateforme de rédaction assistée par IA, de signature électronique et
        d'archivage de contrats, s'appuyant sur le réseau blockchain Polygon pour l'horodatage et
        la preuve d'intégrité des documents. À la date de cette page, Cachetify fonctionne sur
        le réseau de test public Polygon Amoy, et non sur le réseau principal (mainnet) : les
        contrats et signatures y sont fonctionnels mais l'infrastructure blockchain sous-jacente
        n'est pas encore celle d'un environnement de production définitif.
      </p>
    ),
  },
  {
    id: "contrats-generes-par-ia",
    title: "Contrats générés par intelligence artificielle",
    content: (
      <p>
        Les contrats proposés par l'assistant de rédaction de Cachetify sont générés
        automatiquement à partir des informations fournies par l'utilisateur. Ils ne constituent
        pas un avis juridique et ne remplacent pas la relecture par un professionnel du droit
        compétent dans la juridiction concernée, en particulier pour tout contrat à enjeu
        significatif.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    incomplete: true,
    content: <p>Adresse de contact pour toute question relative au service — à compléter.</p>,
  },
];

export default function Page() {
  return <LegalPage title="Mentions légales" updatedAt="26 août 2026" sections={sections} />;
}
