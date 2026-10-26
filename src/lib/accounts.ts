// Comptes artistes : inscription / connexion par pseudo + mot de passe, session longue
// dans un cookie HttpOnly, favoris enregistrés par compte.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";

const db = () => getCloudflareContext().env.DB;

export const SESSION_COOKIE = "diggers_session";
const SESSION_DAYS = 365;
// Plafond de PBKDF2 sur Cloudflare Workers.
const PBKDF2_ITERATIONS = 100_000;

export interface PublicUser {
  id: string;
  pseudo: string;
  firstName: string;
  lastName: string;
}

export type FavoriteMap = Record<string, string>;

// --- Mots de passe -----------------------------------------------------------

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));

async function hashPassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return toHex(bits);
}

function sameHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Validation --------------------------------------------------------------

export function validateSignup(input: { firstName?: string; lastName?: string; pseudo?: string; password?: string }) {
  const firstName = String(input.firstName ?? "").trim();
  const lastName = String(input.lastName ?? "").trim();
  const pseudo = String(input.pseudo ?? "").trim().replace(/^@/, "");
  const password = String(input.password ?? "");
  if (!firstName || !lastName) return { error: "Indique ton prénom et ton nom." } as const;
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(pseudo)) {
    return { error: "Le pseudo doit faire 3 à 30 caractères : lettres, chiffres, point, tiret ou _." } as const;
  }
  if (password.length < 6) return { error: "Le mot de passe doit faire au moins 6 caractères." } as const;
  return { firstName, lastName, pseudo, password } as const;
}

// --- Comptes et sessions -------------------------------------------------------

type UserRow = { id: string; pseudo: string; first_name: string; last_name: string; password_hash: string; salt: string };

const toPublic = (u: UserRow): PublicUser => ({ id: u.id, pseudo: u.pseudo, firstName: u.first_name, lastName: u.last_name });

export async function createUser(data: { firstName: string; lastName: string; pseudo: string; password: string }) {
  const exists = await db().prepare("SELECT 1 FROM users WHERE pseudo = ?1").bind(data.pseudo).first();
  if (exists) return { error: "Ce pseudo est déjà pris." } as const;

  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const user: UserRow = {
    id: crypto.randomUUID(),
    pseudo: data.pseudo,
    first_name: data.firstName,
    last_name: data.lastName,
    password_hash: await hashPassword(data.password, salt),
    salt,
  };
  await db()
    .prepare("INSERT INTO users (id, pseudo, first_name, last_name, password_hash, salt, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(user.id, user.pseudo, user.first_name, user.last_name, user.password_hash, user.salt, new Date().toISOString())
    .run();
  return { user: toPublic(user) } as const;
}

export async function checkLogin(pseudo: string, password: string): Promise<PublicUser | null> {
  const user = await db().prepare("SELECT * FROM users WHERE pseudo = ?1").bind(pseudo.trim().replace(/^@/, "")).first<UserRow>();
  if (!user) return null;
  return sameHex(await hashPassword(password, user.salt), user.password_hash) ? toPublic(user) : null;
}

/** Réinitialisation par l'équipe (pas d'e-mail, donc pas de « mot de passe oublié » automatique). */
export async function resetPassword(userId: string, password: string) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  await db()
    .batch([
      db().prepare("UPDATE users SET password_hash = ?1, salt = ?2 WHERE id = ?3").bind(await hashPassword(password, salt), salt, userId),
      db().prepare("DELETE FROM sessions WHERE user_id = ?1").bind(userId),
    ]);
}

export async function listUsers() {
  const { results } = await db()
    .prepare(
      `SELECT u.id, u.pseudo, u.first_name, u.last_name, u.created_at, COUNT(f.video_id) AS favorites
       FROM users u LEFT JOIN favorites f ON f.user_id = u.id GROUP BY u.id ORDER BY u.created_at DESC`,
    )
    .all<{ id: string; pseudo: string; first_name: string; last_name: string; created_at: string; favorites: number }>();
  return results;
}

/** Crée une session et renvoie l'en-tête Set-Cookie correspondant. */
export async function startSession(userId: string) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db()
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?1, ?2, ?3)")
    .bind(token, userId, expires.toISOString())
    .run();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}`;
}

export async function endSession(token: string | undefined) {
  if (token) await db().prepare("DELETE FROM sessions WHERE token = ?1").bind(token).run();
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** L'artiste connecté (d'après le cookie de session), ou null. */
export async function currentUser(): Promise<PublicUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await db()
    .prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?1 AND s.expires_at > ?2")
    .bind(token, new Date().toISOString())
    .first<UserRow>();
  return user ? toPublic(user) : null;
}

// --- Favoris -----------------------------------------------------------------

export async function getFavorites(userId: string): Promise<FavoriteMap> {
  const { results } = await db()
    .prepare("SELECT video_id, created_at FROM favorites WHERE user_id = ?1")
    .bind(userId)
    .all<{ video_id: string; created_at: string }>();
  return Object.fromEntries(results.map((r) => [r.video_id, r.created_at]));
}

/** Ajoute des favoris (sans écraser la date de ceux déjà présents). */
export async function addFavorites(userId: string, favorites: FavoriteMap) {
  const entries = Object.entries(favorites).slice(0, 1000);
  if (entries.length === 0) return;
  await db().batch(
    entries.map(([videoId, at]) =>
      db()
        .prepare("INSERT OR IGNORE INTO favorites (user_id, video_id, created_at) VALUES (?1, ?2, ?3)")
        .bind(userId, videoId, at),
    ),
  );
}

export async function removeFavorite(userId: string, videoId: string) {
  await db().prepare("DELETE FROM favorites WHERE user_id = ?1 AND video_id = ?2").bind(userId, videoId).run();
}
