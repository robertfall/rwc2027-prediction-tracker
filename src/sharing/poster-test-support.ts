/// <reference types="node" />

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { encodeScenario } from "../state/codec";
import { emptyScenario } from "../state/controller";
import type { SharingDatabase, SharingStatement } from "./store";
import { POSTER_RENDERER_VERSION } from "./poster-store";
import { SHARE_WORDS } from "./words";

const migrations = ["0001_shared_snapshots.sql", "0002_shared_posters.sql"].map((name) =>
  readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8"));
export const posterAliasA = `${SHARE_WORDS[0]}.${SHARE_WORDS[1]}.${SHARE_WORDS[2]}`;
export const posterAliasB = `${SHARE_WORDS[3]}.${SHARE_WORDS[4]}.${SHARE_WORDS[5]}`;

/** Real SQLite checks the additive migration, concurrent UPSERT and immutability. */
export class SqlitePosters implements SharingDatabase {
  readonly sqlite = new DatabaseSync(":memory:");
  private pending: (() => void)[] = [];
  constructor(private initialReadBarrier = 0) { for (const migration of migrations) this.sqlite.exec(migration); }
  prepare(query: string): SharingStatement {
    const bind = (...values: string[]): SharingStatement => ({
      bind,
      first: async <T>() => {
        const row = this.sqlite.prepare(query).get(...values) as T | undefined;
        if (!row && query.includes("WHERE fingerprint") && this.initialReadBarrier > 0) {
          this.initialReadBarrier--;
          await new Promise<void>((resolve) => {
            this.pending.push(resolve);
            if (this.initialReadBarrier === 0) this.pending.splice(0).forEach((release) => release());
          });
        }
        return row ?? null;
      },
      run: async () => { this.sqlite.prepare(query).run(...values); return { success: true }; },
    });
    return bind();
  }
  count(): number { return Number(this.sqlite.prepare("SELECT count(*) AS count FROM shared_posters").get()!.count); }
  close(): void { this.sqlite.close(); }
}

export function pngChunk(type: string, data: Uint8Array): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4, 4, "ascii");
  chunk.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, chunk.length - 4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return chunk;
}

export function posterPng(height = 1808, seed = 0, width = 1080): string {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  scanlines[1] = seed;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)), pngChunk("IEND", new Uint8Array()),
  ]).toString("base64");
}

export const png2027 = posterPng();
export const png2023 = posterPng(2216);

export function posterInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const scenario = emptyScenario();
  scenario.predictions[7] = { intent: { winner: "home", margin: 15 } };
  return {
    token: encodeScenario(scenario), teamId: "za", timeZone: "Africa/Johannesburg", showPredictions: true,
    rendererVersion: POSTER_RENDERER_VERSION, png: png2027, ...overrides,
  };
}

/** Simulate artifacts saved by the earlier local renderer without bypassing reads. */
export function seedPriorPoster(db: SqlitePosters, tournamentId: "rwc2027" | "rwc2023", alias = posterAliasA): {
  alias: string; token: string; png: string; height: number; pngHash: string;
} {
  const token = encodeScenario(emptyScenario(tournamentId));
  const height = tournamentId === "rwc2027" ? 1536 : 1850;
  const png = posterPng(height);
  const pngHash = createHash("sha256").update(Buffer.from(png, "base64")).digest("hex");
  const fingerprint = createHash("sha256").update(JSON.stringify([
    token, "za", "Africa/Johannesburg", true, POSTER_RENDERER_VERSION, pngHash,
  ])).digest("hex");
  db.sqlite.prepare(
    "INSERT INTO shared_posters (alias, fingerprint, token, team_id, time_zone, show_predictions, renderer_version, png_hash, png) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(alias, fingerprint, token, "za", "Africa/Johannesburg", "true", POSTER_RENDERER_VERSION, pngHash, png);
  return { alias, token, png, height, pngHash };
}
