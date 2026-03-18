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
