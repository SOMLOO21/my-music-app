// Données de démo pour Booking : une quinzaine de lieux FICTIFS (noms inventés, marqués « démo »),
// publiés dans l'annuaire partagé, à Nantes, Rennes et Paris. Aucun contact.
// Usage : npm run seed:booking  (base locale de .env.local ; relançable sans créer de doublons)
import { venueMatchKey } from "../src/booking/normalize.ts";
import { saveSharedVenue, setVenueStatus } from "../src/booking/admin-repo.ts";
import { sql } from "../src/lib/sql.ts";

const url = process.env.TURSO_DATABASE_URL ?? "";
if (!url.startsWith("file:") && !process.argv.includes("--hors-local")) {
  console.error("Base distante détectée : les données de démo ne vont que sur une base locale (ajoute --hors-local pour forcer).");
  process.exit(1);
}

const NOTE = "Lieu fictif de démonstration.";
const VENUES = [
  { name: "La Fabrique Sonore (démo)", type: "SMAC / salle de musiques actuelles", city: "Nantes", department: "44", capacity: 650, genres: ["Rap", "Électro", "Pop"], usual_format: "Cachet + billetterie", booking_period: "Bouclage 6 mois avant" },
  { name: "Le Comptoir du Quai (démo)", type: "Bar-concert", city: "Nantes", department: "44", capacity: 120, genres: ["Rock", "Pop", "Chanson / variété"], usual_format: "Chapeau", booking_period: "Bouclage 2 mois avant" },
  { name: "Cave Bleue (démo)", type: "Cave / club de jazz", city: "Nantes", department: "44", capacity: 80, genres: ["Jazz", "Soul / funk"], usual_format: "Cachet fixe", booking_period: "Bouclage 3 mois avant" },
  { name: "Hangar 404 (démo)", type: "Club électro", city: "Nantes", department: "44", capacity: 900, genres: ["Électro", "Techno", "House"], usual_format: "Cachet fixe", booking_period: "Bouclage 4 mois avant" },
  { name: "Péniche Lune (démo)", type: "Péniche / lieu atypique", city: "Nantes", department: "44", capacity: 150, genres: ["Afro", "Reggae", "Musiques du monde"], usual_format: "Billetterie / recette" },
  { name: "L'Usine à Sons (démo)", type: "SMAC / salle de musiques actuelles", city: "Rennes", department: "35", capacity: 1100, genres: ["Rap", "Rock", "Électro"], usual_format: "Cachet + billetterie", booking_period: "Bouclage 6 mois avant" },
  { name: "Le Petit Zinc (démo)", type: "Bar-concert", city: "Rennes", department: "35", capacity: 90, genres: ["Rock", "Indie", "Punk"], usual_format: "Plateau partagé", booking_period: "Bouclage 6 semaines avant" },
  { name: "Collectif Nuit Blanche (démo)", type: "Collectif / organisateur de soirées", city: "Rennes", department: "35", capacity: 400, genres: ["Techno", "House", "Bass music"], usual_format: "Cachet fixe" },
  { name: "Festival des Remparts (démo)", type: "Festival", city: "Rennes", department: "35", capacity: 5000, genres: ["Pop", "Rap", "Électro"], usual_format: "Cachet fixe", booking_period: "Candidatures d'octobre à décembre" },
  { name: "La Friche Ouest (démo)", type: "Tiers-lieu / friche", city: "Rennes", department: "35", capacity: 300, genres: ["Afro", "R&B", "Rap"], usual_format: "Billetterie / recette" },
  { name: "Le Studio Saint-Martin (démo)", type: "Salle de spectacle", city: "Paris", department: "75", capacity: 450, genres: ["Pop", "R&B", "Chanson / variété"], usual_format: "Billetterie / recette", booking_period: "Bouclage 5 mois avant" },
  { name: "Le Caveau des Lilas (démo)", type: "Cave / club de jazz", city: "Paris", department: "75", capacity: 110, genres: ["Jazz", "Jazz fusion"], usual_format: "Cachet fixe", booking_period: "Bouclage 3 mois avant" },
  { name: "Club Métronome (démo)", type: "Club électro", city: "Paris", department: "75", capacity: 700, genres: ["Techno", "House", "Disco / funk"], usual_format: "Cachet fixe" },
  { name: "Le Bistrot Mélodie (démo)", type: "Café-culture / associatif", city: "Paris", department: "75", capacity: 60, genres: ["Chanson / variété", "Pop"], usual_format: "Chapeau" },
  { name: "Tremplin Jeunes Talents (démo)", type: "Tremplin / dispositif", city: "Paris", department: "75", capacity: null, genres: ["Rap", "Pop", "R&B", "Rock"], usual_format: "Défraiement", booking_period: "Candidatures au printemps" },
];
const REGION = { 44: "Pays de la Loire", 35: "Bretagne", 75: "Île-de-France" };

let created = 0;
for (const v of VENUES) {
  const exists = await sql
    .prepare("SELECT 1 FROM bk_venues WHERE owner_user_id IS NULL AND match_key = ?1")
    .bind(venueMatchKey(v.name, v.city))
    .first();
  if (exists) continue;
  const venue = await saveSharedVenue(null, { ...v, region: REGION[v.department], public_notes: NOTE });
  await setVenueStatus(venue.id, "published");
  created++;
}
console.log(`✓ ${created} lieu(x) de démo ajouté(s) (${VENUES.length - created} déjà présent(s)).`);
