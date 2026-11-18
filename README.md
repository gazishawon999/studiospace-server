# StudioSpace Server — Express & MongoDB REST API

Backend REST API for **StudioSpace**, a peer-to-peer creative workspace and production studio sharing platform.

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: MongoDB Atlas (Official Native Driver)
- **Auth**: Better Auth + Google OAuth, Express JWT in HTTPOnly cookies
- **Images**: ImgBB (server-side uploads)
- **Security**: CORS with credentials, environment validation, HTTPOnly cookies

## Requirements

- Node.js 20+
- A MongoDB Atlas cluster

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create your environment file:
   ```bash
   cp .env.example .env
   ```

3. Fill in `.env`. At minimum, `MONGODB_URI` must be a real connection string.
   See [`docs/environment.md`](docs/environment.md) for every variable and where
   to obtain each credential.

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Verify:
   ```bash
   curl http://localhost:5000/api/health
   ```

The server validates `.env` on boot. Missing Better Auth, Google, or ImgBB
credentials print warnings in development and become hard errors when
`NODE_ENV=production`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with nodemon and reload on change. |
| `npm start` | Start once with Node. |
| `node --check src/config/env.js` | Syntax-check the env module. |

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service and database health. |
| `GET` | `/api/studios/featured` | Six top-rated/newest public studios. |
| `GET` | `/api/studios?category=&limit=` | Public studio list, optionally filtered by category. |

Public responses never include owner email addresses.

## Environment & Secrets

- Template: [`.env.example`](.env.example)
- Guide: [`docs/environment.md`](docs/environment.md)

**Never commit `.env`.** `.env.*` is git-ignored with the exception of
`.env.example`. Credentials must never appear in source code, logs, API
responses, or the frontend bundle.

## Client

The Next.js frontend lives in `../studiospace-client` and runs on
<http://localhost:3000>. Allowed origins are configured with `CLIENT_URL`.
