# Testing ooth App - Network Contacts & Core Features

## Overview
ooth is a Next.js 14 app with Supabase backend. Testing requires creating multiple user accounts to verify multi-user features like the friends system and network contacts.

## Devin Secrets Needed
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `OPENAI_API_KEY` - For embedding generation
- `ANTHROPIC_API_KEY` - For AI search

## Environment Setup
1. The app runs on Next.js dev server: `npm run dev -- -p 3001` from the repo root
2. Environment variables are loaded from `.env.local` in the repo root
3. Chrome may need to be launched from `/opt/.devin/chrome/chrome/linux-*/chrome-linux64/chrome` with `--no-sandbox --no-first-run --disable-session-crashed-bubble` flags and `DISPLAY=:0`
4. The deployed app is at https://ooth-devin-build.vercel.app/

## Multi-User Test Setup
To test features that involve multiple users (friends, network contacts):

1. **Create User A**: Go to `/signup`, fill in username, full name, email, password
2. **Import contacts for User A**: Click "Import Contacts", upload a CSV with Google Contacts format headers (`First Name,Last Name,E-mail 1 - Value,Organization 1 - Name,Organization 1 - Title,Phone 1 - Value,Notes`)
3. **Log out**: Click "Log Out" in nav header
4. **Create User B**: Repeat signup with different credentials
5. **Import contacts for User B**: Upload a different CSV
6. **Add User A as friend**: Navigate to `/friends`, type User A's username, click Add
7. **Log out and log in as User A**: Add User B as friend from `/friends` page
8. Friendship must be bidirectional - each user must add the other

## Key Testing Points for Network Contacts

### Filter Toggle
- **My Contacts**: Shows only user's own contacts with "1st" degree badges
- **All Network**: Shows own contacts (1st) + friends' contacts (2nd) with correct badges
- **Friends Only**: Shows only friends' contacts with "2nd" badges
- Verify contact counts match expected numbers for each filter

### Degree Badges
- "1st" badge: navy/dark color (`bg-navy/10 text-navy`)
- "2nd" badge: accent/red color (`bg-accent/10 text-accent`)
- Via attribution: "via [Friend's Full Name]" appears below 2nd degree contacts

### Contact Detail Views
- **1st degree**: Editable input fields, "OOTH CONTEXT" section, Save/Delete buttons
- **2nd degree**: Read-only text display, "Shared by [Friend Name]" banner at top, NO Ooth Context section, NO Save/Delete buttons

### Network Search
- When on "All Network" view, search includes friends' contacts
- Results show degree badges and via attribution
- If embeddings aren't built yet, text search fallback works and shows "Matched by text search (embeddings still building)"
- Embedding generation may take time (shown as "Building search index..." in bottom-right)

## Common Issues
- **Embedding generation stuck at 0%**: May need to check if OPENAI_API_KEY is correctly set. The embedding progress component triggers generation on each poll cycle.
- **Browser launch issues**: The `google-chrome` wrapper at `~/.local/bin/google-chrome` requires port 29229 to be listening. Use the actual Chrome binary at `/opt/.devin/chrome/chrome/linux-*/chrome-linux64/chrome` directly if the wrapper doesn't work.
- **GitHub App sync issues**: The Devin GitHub app may not sync with `ooth-devin-build` repo. Workaround: push branches and have the user create PRs manually from GitHub's compare UI.
- **Supabase RLS**: All contacts are filtered by `user_id` via Row Level Security. If contacts aren't showing, verify the user is authenticated and contacts have the correct `user_id`.

## Test CSV Format (Google Contacts)
```csv
First Name,Last Name,E-mail 1 - Value,Organization 1 - Name,Organization 1 - Title,Phone 1 - Value,Notes
Alice,Anderson,alice@example.com,Google,Software Engineer,555-0001,Met at Google I/O
```
