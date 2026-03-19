# Testing ooth Search Prompt

## Overview
The ooth app uses Claude AI to search contacts. The search prompt is critical — if too loose, Claude will hallucinate connections (e.g., returning VC-adjacent contacts for an a16z search). Testing requires controlled data to verify strict field matching.

## Devin Secrets Needed
- `ANTHROPIC_API_KEY` — for Claude search API calls
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-only)

## Test Data Setup
Create a CSV with contacts that test boundary conditions:
- Include contacts at the target company (e.g., "Andreessen Horowitz", "a16z")
- Include contacts at similar/adjacent companies (e.g., other VC firms like Atomico, Sequoia)
- Include unrelated contacts (e.g., Google, Meta)
- Include contacts with minimal data (no company, just where_met)

Example CSV:
```csv
First Name,Last Name,Company,Job Title,Where Met,Topics,Notes
Rose,Johnson,Andreessen Horowitz,Partner,,Venture Capital,
Mike,Jones,a16z,Principal,,Crypto investing,
Ian,Sharp,Andreessen Horowitz,Associate,,Healthcare,
Caroline,Chayot,Atomico,Talent Partner,,Recruiting,
Bob,Wilson,Sequoia Capital,Partner,,Venture Capital,
John,Smith,Google,Software Engineer,,Machine Learning,
Sarah,Lee,Meta,Product Manager,Berlin Conference,Social Media,
Alice,Wang,,,NYC Meetup,,Great contact from networking event
```

## Testing Procedure
1. Create a fresh test account (e.g., `searchtest1@test.com` / `testpass123`)
2. Import the test CSV
3. Run these test cases:
   - **Company search strictness**: Search "people that work at a16z" — should return ONLY a16z/Andreessen Horowitz contacts (not Atomico, Sequoia, etc.)
   - **No-results message**: Search a nonsense string — should show "No contacts found for '[query]'" with suggestion text
   - **Name search**: Search a specific name — should return exactly that contact
4. Each search takes ~10-15 seconds for Claude to respond

## Key Pass/Fail Criteria
- Company search: Result count must match exactly the number of contacts at that company. No VC-adjacent or industry-similar contacts.
- No-results: Must show the query text in the message. Must NOT show "No contacts yet" or "Import Contacts" button.
- Name search: Must return exactly 1 result for an exact name match.

## Deployment Considerations
- Vercel deploys from `main` branch. PRs merged to feature branches do NOT auto-deploy.
- If testing prompt changes, either:
  1. Test on localhost (`npm run dev` on the branch with changes), OR
  2. Use the Vercel preview URL from the PR (may require Vercel authentication)
  3. Merge changes to `main` for production deployment
- The Vercel preview URL may be access-restricted. Localhost testing with the same Supabase backend is reliable.
- The `.env.local` file in the repo root has all needed env vars for local dev.

## Common Issues
- If search returns all contacts or VC-adjacent contacts, the prompt is too loose — check `app/api/search/route.ts` for the `claudePrompt` variable.
- If search returns 0 results for valid queries, check that the compressed contact list is being built correctly (verify with console.log).
- The search API uses `claude-sonnet-4-20250514` model. If the model is unavailable, the search will fail silently and return empty results.
