import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchUrl, flattenPost, matchText, postUrl, searchPosts, watchOnce } from "../src/mod.ts";

const RAW = {
  uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz",
  cid: "bafy1",
  author: { did: "did:plc:abc", handle: "alice.example.com", displayName: "Alice" },
  record: { text: "Anyone got a good alternative to Notion for small teams?", createdAt: "2026-01-02T03:04:05Z", langs: ["en"] },
  likeCount: 3,
  repostCount: 1,
  replyCount: 2,
};
const RAW2 = {
  ...RAW,
  uri: "at://did:plc:def/app.bsky.feed.post/3kabc",
  author: { did: "did:plc:def", handle: "bob.example.com" },
  record: { text: "Alternatively, totally unrelated.", createdAt: "2026-01-03T00:00:00Z" },
};

function fakeFetch(pages: unknown[], urls: string[] = []): typeof fetch {
  let i = 0;
  return (async (url: string) => {
    urls.push(String(url));
    const body = pages[Math.min(i++, pages.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

test("buildSearchUrl clamps limit and encodes params", () => {
  const url = new URL(buildSearchUrl({ q: '"alternative to" notion', limit: 500, lang: "en", since: new Date("2026-01-01T00:00:00Z") }));
  assert.equal(url.origin + url.pathname, "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts");
  assert.equal(url.searchParams.get("q"), '"alternative to" notion');
  assert.equal(url.searchParams.get("limit"), "100");
  assert.equal(url.searchParams.get("sort"), "latest");
  assert.equal(url.searchParams.get("lang"), "en");
  assert.equal(url.searchParams.get("since"), "2026-01-01T00:00:00.000Z");
});

test("postUrl and flattenPost", () => {
  assert.equal(postUrl(RAW.uri, "alice.example.com"), "https://bsky.app/profile/alice.example.com/post/3kxyz");
  const p = flattenPost(RAW);
  assert.equal(p.author, "alice.example.com");
  assert.equal(p.likes, 3);
  assert.deepEqual(p.langs, ["en"]);
});

test("matchText is case-insensitive and whole-word", () => {
  assert.deepEqual(matchText("ALTERNATIVE  TO notion", ["alternative to"]), ["alternative to"]);
  assert.deepEqual(matchText("Alternatively, no", ["alternative to"]), []);
  assert.deepEqual(matchText("need a crm!", ["crm", "erp"]), ["crm"]);
});

test("searchPosts throws on HTTP errors", async () => {
  const f = (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(searchPosts({ q: "x", fetch: f }), /HTTP 403/);
});

test("watchOnce confirms matches locally, dedupes and remembers seen", async () => {
  const urls: string[] = [];
  const f = fakeFetch([{ posts: [RAW, RAW2] }], urls);
  const seen = new Set<string>();
  const first = await watchOnce({ phrases: ["alternative to", "notion"], fetch: f, seen });
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].matched, ["alternative to", "notion"]);
  assert.equal(new URL(urls[0]).searchParams.get("q"), '"alternative to"');
  const second = await watchOnce({ phrases: ["alternative to"], fetch: f, seen });
  assert.equal(second.length, 0);
});
