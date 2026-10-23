# bsky-keyword-watch

A read-only Bluesky watcher for keywords and buying-intent phrases ("looking for a tool", "alternative to", "any recommendations"...). It calls the public AT Protocol AppView endpoint [`app.bsky.feed.searchPosts`](https://docs.bsky.app/docs/api/app-bsky-feed-search-posts) on `https://api.bsky.app` and prints the posts that match.

- No login, no app password, no runtime dependencies (it uses the built-in `fetch`).
- **Read-only by design.** It never posts, replies, likes, follows or DMs.
- Works as a CLI (Node 18+) and as a library (npm or JSR, Node/Deno/Bun).

## Install

```bash
npm install -g bsky-keyword-watch          # CLI
npx bsky-keyword-watch --help              # or run without installing
npm install bsky-keyword-watch             # library
npx jsr add @prospy/bsky-keyword-watch     # library via JSR (Node/Bun)
deno add jsr:@prospy/bsky-keyword-watch    # library via JSR (Deno)
# or from a checkout:
npm install && npm run build && node dist/src/cli.js --help
```

Packages: [npm](https://www.npmjs.com/package/bsky-keyword-watch) · [JSR](https://jsr.io/@prospy/bsky-keyword-watch)

## CLI usage

```bash
# Default buying-intent phrases, last 24 hours
bsky-keyword-watch

# Your own phrases, English posts only, last 6 hours
bsky-keyword-watch "alternative to hubspot" "looking for a crm" --hours 6 --lang en

# JSON lines for scripting, plus a JSON file with every match
bsky-keyword-watch "social listening" --json --out matches.json

# Keep running and check every 10 minutes
bsky-keyword-watch "need a crm" --watch 600
```

Example output:

```
2026-10-23T13:45:33.236Z @someone.bsky.social | matched: any recommendations
  anyone got any recommendations for a drawing stylus? iPhone compatible, preferably.
  https://bsky.app/profile/someone.bsky.social/post/3mykcsvm7sc2d
```

## Library usage

```ts
import { searchPosts, watchOnce } from "bsky-keyword-watch"; // or "@prospy/bsky-keyword-watch" from JSR

// One raw search page
const page = await searchPosts({ q: '"alternative to" notion', lang: "en", limit: 25 });
console.log(page.posts.map((p) => p.url));

// Several phrases, matches confirmed locally, de-duplicated, newest first
const seen = new Set<string>();
const posts = await watchOnce({
  phrases: ["looking for a tool", "alternative to"],
  since: new Date(Date.now() - 3600_000),
  seen,
});
```

Each phrase is sent as a quoted query and then checked again locally on whole words, case-insensitive. That way "alternative to" doesn't match "Alternatively, ...".

## Limits

- `searchPosts` is limited to 100 results per page. `watchOnce` reads one page per phrase unless you pass `pages`.
- Search results depend on Bluesky's search index. They can lag a little, and they can leave out posts from accounts that opted out or were labelled.
- In our tests `public.api.bsky.app` returned 403 for search while `api.bsky.app` worked. You can override the host with the `appview` option.
- The seen-set lives in memory only.

## Respect the network

- Follow the [Bluesky Developer Guidelines](https://docs.bsky.app/docs/support/developer-guidelines) and the AppView's rate limits. The CLI won't poll more often than every 60 seconds.
- Automated or bulk interactions (auto-replies, mass likes or follows) are not okay. This tool only reads. If you find someone you can help, reply yourself, by hand.
- Don't build profiles of individual users or republish people's posts in bulk.

If you'd rather not run this yourself, [Prospy](https://prospy.io) does social listening and AI lead generation across X/Twitter, Reddit, Bluesky and Hacker News, surfacing buying-intent posts.

## Source and issues

The canonical repo is on Codeberg: [codeberg.org/prospy/bsky-keyword-watch](https://codeberg.org/prospy/bsky-keyword-watch). It's mirrored to GitHub at [github.com/prospy-io/bsky-keyword-watch](https://github.com/prospy-io/bsky-keyword-watch). Issues and pull requests are welcome on either.

## Development

```bash
npm install
npm test      # tsc build + node --test
```

## License

MIT
