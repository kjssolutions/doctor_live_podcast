# Deploy to CapRover (DigitalOcean)

## 1. Create `deploy.tar`

From the project root:

```bash
npm run deploy:tar
```

This creates `deploy.tar` in the project root (excludes `node_modules`, `.next`, `.git`, `.env`).

## 2. CapRover app setup

1. CapRover → **Apps** → create app (e.g. `doctor-podcast`)
2. **Deployment** → method **Upload tar file** → upload `deploy.tar`
3. **HTTP Settings** → enable HTTPS, set your domain
4. **App Configs** → **Environment Variables** → paste from `.env.caprover.example` (with real values)
5. **App Configs** → container HTTP port: **3000**
6. Deploy / Save & Restart

## 3. Database (first time only)

The app expects MySQL tables to exist. From your machine (with `.env` pointing at production DB), run once:

```bash
npx tsx scripts/apply-asset-storage-url-migration.ts
npx tsx scripts/apply-row-number-and-doctor-fields-migration.ts
npx tsx scripts/apply-asset-kind-edited-storage-url.ts
npx tsx scripts/make-spaces-objects-public.ts
npm run prisma:seed
```

Or use `npm run db:setup-local` on a fresh empty database.

## 4. Required env vars (minimum)

| Variable | Purpose |
|----------|---------|
| `NEXTAUTH_URL` | Full site URL, e.g. `https://doctor-podcast.example.com` |
| `NEXTAUTH_SECRET` | Random secret (required in production) |
| `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB` | Database |
| `MYSQL_SSL` | `true` for DO managed MySQL |
| `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, keys | Spaces uploads |
| `STORAGE_PUBLIC_BASE_URL` | CDN URL for public file links |

## 5. Troubleshooting

- **Build fails on CapRover**: increase app memory (512MB+ recommended for `next build`)
- **DB connection error**: check firewall — allow CapRover server IP on DO database trusted sources
- **Login fails**: ensure `NEXTAUTH_URL` matches the browser URL exactly (https)
- **Upload fails**: verify Spaces keys and `STORAGE_PUBLIC_BASE_URL` uses `.cdn.digitaloceanspaces.com`
