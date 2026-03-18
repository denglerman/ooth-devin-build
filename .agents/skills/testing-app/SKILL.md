# Testing the ooth App

## Local Dev Setup
- Run `npm run dev` from the repo root
- Dev server starts on port 3000 (or next available port)
- Environment variables are loaded from `.env.local`
- Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`

## Auth Testing
- Supabase has email confirmation enabled by default
- Fake email domains (e.g. `@ooth-test.com`) are rejected by Supabase email validation
- Use real email domains (e.g. `@gmail.com`) for test accounts
- To bypass email confirmation for test users, use the Supabase admin API:
  ```
  curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"email": "test@gmail.com", "password": "testpass123", "email_confirm": true}'
  ```
- To confirm an existing unconfirmed user:
  ```
  curl -X PUT "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users/{user_id}" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"email_confirm": true}'
  ```
- Supabase has email rate limits - if you hit 429 errors on signup, create users via admin API instead

## Cleanup After Testing
- Delete test contacts before test users (foreign key constraint on `user_id`)
- Delete contacts: `DELETE /rest/v1/contacts?user_id=eq.{user_id}` via Supabase REST API
- Delete users: `DELETE /auth/v1/admin/users/{user_id}` via Supabase admin API

## Key Auth Routes
- `/login` - Login page (email/password)
- `/signup` - Signup page (email/password/confirm)
- `/api/auth/logout` - POST to log out
- `/api/auth/callback` - OAuth callback handler
- Middleware redirects unauthenticated users to `/login`
- Middleware redirects authenticated users away from `/login` and `/signup`

## Build & Lint
- `npm run lint` - ESLint checks
- `npm run build` - Production build with type checking
- There's a pre-existing warning in SearchBar.tsx about debounceRef - this is not a blocker

## Deployment
- Vercel deploys from `main` branch
- The feature branch must be merged to `main` for changes to deploy to production
- Live URL: https://ooth-devin-build.vercel.app/
