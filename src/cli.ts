#!/usr/bin/env node
/**
 * CLI for bsky-keyword-watch. Read-only: it never posts, likes, follows or replies.
 * @module
 */
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { type Post, watchOnce } from "./mod.ts";

const DEFAULT_PHRASES = ["looking for a tool", "any recommendations", "alternative to", "is there an app"];

const HELP = `bsky-keyword-watch - read-only Bluesky keyword watcher

Usage: bsky-keyword-watch [phrases...] [options]

Options:
  --hours <n>     look back n hours (default 24)
  --lang <xx>     language filter, e.g. en
  --limit <n>     results per phrase, 1-100 (default 25)
  --json          print JSON lines
  --out <file>    also write all matches to a JSON file
  --watch <sec>   repeat every sec seconds (min 60)
  -h, --help      show this help
`;

function formatPost(p: Post): string {
  const text = p.text.replace(/\s+/g, " ");
  const snippet = text.length > 200 ? text.slice(0, 197) + "..." : text;
  return `${p.createdAt} @${p.author} | matched: ${p.matched.join(", ")}\n  ${snippet}\n  ${p.url}\n`;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      hours: { type: "string", default: "24" },
      lang: { type: "string" },
      limit: { type: "string", default: "25" },
      json: { type: "boolean", default: false },
      out: { type: "string" },
      watch: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const watch = values.watch ? Number(values.watch) : undefined;
  if (watch !== undefined && !(watch >= 60)) {
    process.stderr.write("--watch must be at least 60 seconds\n");
    return 2;
  }
  const phrases = positionals.length ? positionals : DEFAULT_PHRASES;
  const seen = new Set<string>();
  const all: Post[] = [];
  let since = new Date(Date.now() - Number(values.hours) * 3600_000);
  for (;;) {
    const started = Date.now();
    const posts = await watchOnce({ phrases, since, lang: values.lang, limit: Number(values.limit), seen });
    for (const p of posts) process.stdout.write(values.json ? JSON.stringify(p) + "\n" : formatPost(p) + "\n");
    all.push(...posts);
    if (values.out) writeFileSync(values.out, JSON.stringify(all, null, 2));
    if (!values.json) process.stderr.write(`-- ${posts.length} new match(es)\n`);
    if (watch === undefined) return 0;
    since = new Date(started - 60_000);
    await new Promise((r) => setTimeout(r, watch * 1000));
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  },
);
