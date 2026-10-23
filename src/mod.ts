/**
 * Read-only Bluesky watcher for keywords and buying-intent phrases
 * ("looking for a tool", "alternative to", "any recommendations"...).
 *
 * It searches public posts through the AT Protocol AppView endpoint
 * `app.bsky.feed.searchPosts` on `https://api.bsky.app`, then re-checks each
 * phrase locally on whole words. No login, no runtime dependencies, and it
 * never posts, replies, likes or follows.
 *
 * ```ts
 * import { watchOnce } from "@prospy/bsky-keyword-watch";
 *
 * const seen = new Set<string>();
 * const posts = await watchOnce({
 *   phrases: ["looking for a tool", "alternative to"],
 *   since: new Date(Date.now() - 3600_000),
 *   lang: "en",
 *   seen,
 * });
 * for (const p of posts) console.log(p.url, p.matched);
 * ```
 *
 * There is also a CLI: `npx bsky-keyword-watch --help`.
 * Source: [codeberg.org/prospy/bsky-keyword-watch](https://codeberg.org/prospy/bsky-keyword-watch)
 * (mirrored to [GitHub](https://github.com/prospy-io/bsky-keyword-watch)).
 *
 * If you'd rather not run this yourself, [Prospy](https://prospy.io) does social listening and AI lead generation across X/Twitter, Reddit, Bluesky and Hacker News, surfacing buying-intent posts.
 *
 * @module
 */

export const DEFAULT_APPVIEW = "https://api.bsky.app";
const USER_AGENT = "bsky-keyword-watch/0.1 (+https://prospy.io)";

/** Options for {@link searchPosts}. */
export interface SearchOptions {
  /** Search query. Lucene-ish syntax supported by Bluesky, e.g. `"looking for" crm`. */
  q: string;
  /** "latest" (default) or "top". */
  sort?: "latest" | "top";
  /** Only posts at or after this time (ISO 8601 string or Date). */
  since?: string | Date;
  /** Only posts before this time. */
  until?: string | Date;
  /** Two-letter language filter, e.g. "en". */
  lang?: string;
  /** Results per page, 1-100 (default 25). */
  limit?: number;
  /** Pagination cursor from a previous call. */
  cursor?: string;
  /** AppView base URL (default https://api.bsky.app). */
  appview?: string;
  /** Inject a fetch implementation (for tests). */
  fetch?: typeof fetch;
}

/** A flattened Bluesky post. */
export interface Post {
  uri: string;
  cid: string;
  url: string;
  author: string;
  displayName: string;
  text: string;
  createdAt: string;
  likes: number;
  reposts: number;
  replies: number;
  langs: string[];
  matched: string[];
}

/** Raw page from app.bsky.feed.searchPosts. */
export interface SearchPage {
  posts: Post[];
  cursor?: string;
  hitsTotal?: number;
}

const toIso = (v: string | Date): string => (v instanceof Date ? v.toISOString() : v);

/** Convert an at:// URI + handle into a bsky.app web URL. */
export function postUrl(uri: string, handle: string): string {
  const rkey = uri.split("/").pop() ?? "";
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// deno-lint-ignore no-explicit-any
export function flattenPost(p: any): Post {
  const handle: string = p?.author?.handle ?? "";
  return {
    uri: p.uri,
    cid: p.cid,
    url: postUrl(p.uri, handle || p?.author?.did || ""),
    author: handle,
    displayName: p?.author?.displayName ?? "",
    text: p?.record?.text ?? "",
    createdAt: p?.record?.createdAt ?? p?.indexedAt ?? "",
    likes: p?.likeCount ?? 0,
    reposts: p?.repostCount ?? 0,
    replies: p?.replyCount ?? 0,
    langs: p?.record?.langs ?? [],
    matched: [],
  };
}

/** Build the searchPosts request URL. */
export function buildSearchUrl(opts: SearchOptions): string {
  const base = (opts.appview ?? DEFAULT_APPVIEW).replace(/\/$/, "");
  const params = new URLSearchParams({ q: opts.q, sort: opts.sort ?? "latest" });
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  params.set("limit", String(limit));
  if (opts.since) params.set("since", toIso(opts.since));
  if (opts.until) params.set("until", toIso(opts.until));
  if (opts.lang) params.set("lang", opts.lang);
  if (opts.cursor) params.set("cursor", opts.cursor);
  return `${base}/xrpc/app.bsky.feed.searchPosts?${params}`;
}

/** Call app.bsky.feed.searchPosts once (read-only, no login). */
export async function searchPosts(opts: SearchOptions): Promise<SearchPage> {
  const f = opts.fetch ?? fetch;
  const res = await f(buildSearchUrl(opts), {
    headers: { "Accept": "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`searchPosts failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  // deno-lint-ignore no-explicit-any
  const data: any = await res.json();
  return {
    posts: (data.posts ?? []).map(flattenPost),
    cursor: data.cursor,
    hitsTotal: data.hitsTotal,
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Return the phrases found in `text` (case-insensitive, whole words). */
export function matchText(text: string, phrases: string[]): string[] {
  return phrases.filter((p) => {
    const words = p.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${words.map(escapeRe).join("\\s+")}(?![\\p{L}\\p{N}_])`, "iu");
    return re.test(text);
  });
}

/** Options for {@link watchOnce}. */
export interface WatchOptions extends Omit<SearchOptions, "q" | "cursor"> {
  phrases: string[];
  /** Max pages per phrase (default 1). */
  pages?: number;
  /** IDs already reported; updated in place. */
  seen?: Set<string>;
}

/**
 * Search each phrase, confirm the match locally, de-duplicate and return
 * new posts newest first.
 */
export async function watchOnce(opts: WatchOptions): Promise<Post[]> {
  const seen = opts.seen ?? new Set<string>();
  const found = new Map<string, Post>();
  for (const phrase of opts.phrases) {
    let cursor: string | undefined;
    for (let page = 0; page < (opts.pages ?? 1); page++) {
      const res = await searchPosts({ ...opts, q: `"${phrase}"`, cursor });
      for (const post of res.posts) {
        const hits = matchText(post.text, opts.phrases);
        if (!hits.length || seen.has(post.uri)) continue;
        post.matched = hits;
        found.set(post.uri, post);
      }
      cursor = res.cursor;
      if (!cursor) break;
    }
  }
  const out = [...found.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  out.forEach((p) => seen.add(p.uri));
  return out;
}
