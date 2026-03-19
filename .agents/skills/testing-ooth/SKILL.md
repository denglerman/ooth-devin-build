# Testing ooth - AI-Native Contact Intelligence Platform

## Environment Setup

### Required Secrets (Devin Secrets Needed)
- `OPENAI_API_KEY` - OpenAI API key for embedding generation (text-embedding-3-small model)
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude search reasoning
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (safe for frontend)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-only, never expose in frontend)

### Local Dev Server
```bash
cd /home/ubuntu/repos/ooth
# Create .env.local with all 5 secrets
npx next dev -p 3000
```

### Vercel Preview Deployments
- Preview URLs are generated per-PR by Vercel
- Format: `ooth-devin-build-git-{branch-slug}-denglermans-projects.vercel.app`
- Preview deployments may be behind Vercel deployment protection (requires Vercel login)
- The production URL is: https://ooth-devin-build.vercel.app/
- API routes on preview/production require auth cookies (401 without session)

## Test Account Creation
1. Navigate to `/signup`
2. Fill in: Username, Full Name, Email, Password, Confirm Password
3. Use pattern: `testuser_<purpose>@test.com` with `TestPass123!`
4. Signup auto-logs in (email confirmation is disabled in Supabase)

## Test Data

### CSV Import for Search Testing
Create a CSV with Google Contacts format headers:
```csv
First Name,Last Name,E-mail 1 - Value,Phone 1 - Value,Organization 1 - Name,Organization 1 - Title,Notes
Alice,TestVenture,alice.tv@test.com,555-0101,Andreessen Horowitz,Partner,Met at tech conference
Bob,TestCapital,bob.tc@test.com,555-0102,Andreessen Horowitz,Associate,Introduced by mutual friend
Carol,TestOther,carol.to@test.com,555-0103,Google,Software Engineer,College friend
```

Import via the "Import Contacts" button on the main page.

## Search Testing

### Search Has Two Paths
1. **Text-only fallback** - Used when embeddings aren't ready (`embeddedCount === 0`). Does `ilike` matching across 8 fields. Does NOT require OpenAI API key.
2. **Hybrid search** - Used when embeddings are ready. Combines vector similarity + text `ilike` + Claude AI ranking. Requires working OpenAI API key.

### Verifying Embeddings Are Ready
- Check the "Building search index..." banner at bottom-right
- Or call `/api/embedding-status` which returns `{total, embedded, ready}`
- Embedding generation might fail silently if the OpenAI API key is invalid - check the dev server console for 500 errors on `/api/generate-embeddings`

### Text Fallback Limitations
- The text fallback does NOT filter stop words (e.g., "work", "people", "that" are all searched)
- This means queries like "people that work at a16z" will match contacts whose notes contain common words like "work"
- The hybrid search path HAS a stop-word filter, so it's more precise
- Abbreviations like "a16z" won't match "Andreessen Horowitz" via text search alone - that requires vector similarity

### Testing Filter Switching (Double-Fetch)
1. Open browser DevTools → Network tab
2. Filter network log to "contacts?page" 
3. Clear the log
4. Click a different filter tab (My Contacts / All Network / Friends Only)
5. Verify only 1 `contacts?page` request appears (not 2)

## Common Issues

### Corrupted Environment Variables
- When writing `.env.local`, avoid using `eval` or command substitution with variables containing special characters
- Use `echo` with proper quoting or `cat << 'EOF'` heredoc syntax instead
- Verify key validity: `echo "Length: ${#OPENAI_API_KEY}"` - OpenAI keys are typically ~51 chars starting with `sk-`

### Embedding Generation Failing
- Check dev server console for errors on `/api/generate-embeddings`
- Common cause: invalid OpenAI API key
- The EmbeddingProgress component polls `/api/embedding-status` every 5 seconds and triggers generation
- If stuck at 0%, the API key is likely invalid

### Supabase RLS
- All API routes use the service role key to bypass RLS, then filter by user_id manually
- Test accounts can only see their own contacts (1st degree) and friends' contacts (2nd degree)
- The `match_contacts` RPC function returns ALL contacts regardless of user - filtering happens in the API route

## GitHub Integration Note
- The Devin GitHub app may have persistent sync issues with the `ooth-devin-build` repo
- Workaround: Push branches normally (git push works), then ask the user to create PRs from GitHub's compare UI
- Example: `https://github.com/denglerman/ooth-devin-build/compare/main...branch-name`
# Testing ooth Web App

## Overview
ooth is a Next.js 14 contact intelligence platform deployed on Vercel with Supabase as the database. Testing is done against the deployed production URL.

## Devin Secrets Needed
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-only)
- `ANTHROPIC_API_KEY` - For Claude-powered AI search
- `OPENAI_API_KEY` - For embedding generation

## Environment
- **Deployed URL**: https://ooth-devin-build.vercel.app/
- **GitHub Repo**: https://github.com/denglerman/ooth-devin-build
- **Local dev**: `npm run dev` runs on port 3000
- **Build check**: `npm run build` (no separate lint command needed, build catches errors)
- Vercel deploys from the `main` branch. After pushing to the PR branch, you must also update `main` to the same SHA for Vercel to pick up changes.

## Key Test Flows

### Contact Editing
1. Navigate to grid at root URL `/`
2. Click any contact card to open detail page at `/contact/[id]`
3. Core fields (First Name, Last Name, Email, Phone, Company, Job Title) are editable input fields in a 2-column grid under "Contact Info"
4. Ooth context fields (Where met, When met, How met, Topics, Relationship strength, Notes) are below under "Ooth Context"
5. Click "Save Changes" button at bottom — toast "Contact saved successfully" should appear
6. The header preview (name, job title, company) updates live as you type
7. Navigate away and back to verify persistence

### Contact Deletion (Individual)
1. On contact detail page, scroll to bottom
2. "Delete Contact" button is next to "Save Changes" (red text, white bg)
3. Clicking opens a confirmation modal with backdrop blur
4. Modal shows contact name and "This action cannot be undone"
5. "Cancel" closes modal without deleting
6. "Delete" removes the contact and redirects to grid `/`
7. Contact count should decrease by 1

### Delete All Contacts
1. "Delete All" button appears in the header only when `total > 0`
2. Clicking opens confirmation modal showing the contact count
3. "Cancel" closes without deleting
4. "Delete All" removes all contacts, grid shows empty state
5. **Warning**: This is destructive and cannot be undone. Only test the Cancel flow unless you intend to wipe all data.

### AI Search
1. Type a query in the search bar (e.g., "people at a16z")
2. Results appear as cards with AI reasoning beneath each
3. Search uses OpenAI embeddings + Supabase vector search + Claude reasoning
4. If embeddings aren't ready, falls back to text search

### CSV Import
1. Click "Import Contacts" button in header
2. Drag-and-drop or select a CSV file
3. Auto-detects Google Contacts vs LinkedIn format
4. After import, embedding progress banner appears at bottom-right
5. Polls every 5 seconds until all embeddings are generated

## Known Quirks
- The contact grid sort order may change after editing a contact's name (contacts are sorted alphabetically by the DB)
- Supabase pgvector: `.is('embedding', null)` is unreliable for vector columns. Use `.not('embedding', 'is', null)` instead.
- Vercel free tier has 10s serverless timeout. Embedding generation is batched (50 per call) to stay within limits.
- After deleting a contact, the grid briefly shows "0 contacts" with a loading spinner before the full list loads — this is expected behavior as the page re-fetches.
- No authentication on API routes — all endpoints are publicly accessible. Be aware that DELETE endpoints can be called by anyone.
