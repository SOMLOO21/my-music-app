// Accès à la base Turso (SQLite) avec une petite interface « prepare / bind / all / first / run »,
// la même que celle de Cloudflare D1 utilisée à l'origine.
// En local, TURSO_DATABASE_URL peut pointer vers un fichier : « file:local.db ».
import { createClient, type Client, type InStatement, type InValue } from "@libsql/client";

let client: Client | null = null;

function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL n'est pas défini.");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

class Statement {
  constructor(
    readonly sql: string,
    readonly args: InValue[] = [],
  ) {}

  bind(...args: unknown[]) {
    return new Statement(this.sql, args as InValue[]);
  }

  async all<T>(): Promise<{ results: T[] }> {
    const res = await getClient().execute({ sql: this.sql, args: this.args });
    const results = res.rows.map((row) => Object.fromEntries(res.columns.map((col, i) => [col, row[i]])) as T);
    return { results };
  }

  async first<T>(): Promise<T | null> {
    return (await this.all<T>()).results[0] ?? null;
  }

  async run() {
    await getClient().execute({ sql: this.sql, args: this.args });
  }

  toStatement(): InStatement {
    return { sql: this.sql, args: this.args };
  }
}

export const sql = {
  prepare: (query: string) => new Statement(query),
  /** Exécute plusieurs requêtes d'un bloc (tout ou rien). */
  batch: async (statements: Statement[]) => {
    await getClient().batch(
      statements.map((s) => s.toStatement()),
      "write",
    );
  },
};
