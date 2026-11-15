# Build and test

Node.js 24.

```
npm run check
```

Local run:

```
npx wrangler d1 migrations apply DB --local
npx wrangler dev --local --var OWNER_PASSWORD:<local-password>
```

`public/*.json` and `legacy/recipe-migrations/` hold a small sample dataset. Production builds refuse a tree that contains `.kitchen-sample-data`.
