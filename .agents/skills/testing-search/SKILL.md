# Testing ooth Search Feature

## Overview
The ooth search system uses Claude AI to rank contacts from a compressed contact list, supplemented by a text pre-filter for reliability. Testing search requires controlled test data and understanding of the dual-path architecture.

## Dev Server Setup
1. Ensure `.env.local` exists with: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
2. Clean stale cache before starting: `rm -rf .next`
3. Start dev server: `npm run dev` (runs on localhost:3000)
4. The dev server uses the same Supabase backend as production, so test data persists across environments

## Devin Secrets Needed
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`

## Test Account
- Email: searchtest1@test.com / testpass123
- Contains 10 controlled contacts for search testing
- Includes a16z/Andreessen Horowitz contacts for alias testing

## Search Architecture
The search API (`app/api/search/route.ts`) has two paths that merge results:
1. **Claude AI search**: Compresses all contacts into `id|name|company|title|where_met|topics|notes` format, sends to Claude for semantic ranking
2. **Text pre-filter**: Runs word-boundary regex matching on non-stop-word query terms across all contact fields, catches exact matches Claude might miss in large lists

Results are merged: Claude results first, then text matches Claude missed.

## Key Test Patterns

### Company alias testing
- Use query "people that work at a16z" to test alias recognition
- Claude handles aliases (a16z = Andreessen Horowitz)
- Text pre-filter only catches literal field matches ("a16z" in company field)
- Both paths together should return all relevant contacts

### False positive testing
- Search short terms like "meta" to verify word-boundary matching prevents substring false positives
- Before the word-boundary fix, "art" would match "Martin" or "Startup"

### No-results testing
- Search nonsense strings to verify the empty state message shows the query text
- Expected: "No contacts found for '[query]'" with suggestion text

## Common Issues
- **Stale `.next` cache**: If dev server shows webpack errors after switching branches, delete `.next` and restart
- **Claude inconsistency with large lists**: With 3000+ contacts, Claude may miss matches. The text pre-filter is the safety net for this.
- **Search takes ~10-15 seconds**: Claude API call is the bottleneck. Wait for the spinner to finish before evaluating results.
- **Stop words**: Common words like "people", "work", "that" are filtered out of text pre-filter queries. Only meaningful terms are used for matching.

## Testing on Production vs Localhost
- Production (Vercel) deploys from `main` branch only
- Localhost runs whatever branch is checked out
- Both use the same Supabase backend, so test data is shared
- Vercel preview URLs may require Vercel login — prefer localhost for testing
