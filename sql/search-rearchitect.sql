-- Search Rearchitecture SQL Migration
-- Run this in Supabase SQL Editor before deploying the new search

-- 1. Enable pg_trgm extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Add search_vector column for full-text search (auto-generated)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(company, '') || ' ' ||
      coalesce(job_title, '') || ' ' ||
      coalesce(where_met, '') || ' ' ||
      coalesce(how_met, '') || ' ' ||
      coalesce(topics, '') || ' ' ||
      coalesce(ooth_notes, '') || ' ' ||
      coalesce(original_notes, '')
    )
  ) STORED;

-- 3. Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS contacts_search_vector_idx ON contacts USING gin(search_vector);

-- 4. Create trigram indexes for fuzzy matching
CREATE INDEX IF NOT EXISTS contacts_company_trgm ON contacts USING gin(company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_name_trgm ON contacts USING gin((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_title_trgm ON contacts USING gin(job_title gin_trgm_ops);

-- 5. Create IVFFlat index on embedding column (if enough rows exist)
-- Note: IVFFlat requires at least lists * 10 rows. Start with lists=10 for smaller datasets.
-- For millions of contacts, increase lists to 100+
DO $$
BEGIN
  IF (SELECT count(*) FROM contacts WHERE embedding IS NOT NULL) >= 1000 THEN
    DROP INDEX IF EXISTS contacts_embedding_idx;
    CREATE INDEX contacts_embedding_idx ON contacts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  ELSE
    -- Use a simpler HNSW index that works with any number of rows
    DROP INDEX IF EXISTS contacts_embedding_hnsw_idx;
    CREATE INDEX contacts_embedding_hnsw_idx ON contacts USING hnsw (embedding vector_cosine_ops);
  END IF;
END $$;

-- 6. Create company_aliases table
CREATE TABLE IF NOT EXISTS company_aliases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alias text NOT NULL,
  canonical_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(alias, canonical_name)
);

-- Seed common aliases
INSERT INTO company_aliases (alias, canonical_name) VALUES
  ('a16z', 'Andreessen Horowitz'),
  ('google', 'Alphabet'),
  ('fb', 'Meta'),
  ('facebook', 'Meta'),
  ('ms', 'Microsoft'),
  ('amzn', 'Amazon'),
  ('goog', 'Alphabet'),
  ('msft', 'Microsoft'),
  ('aapl', 'Apple'),
  ('nflx', 'Netflix'),
  ('tsla', 'Tesla'),
  ('meta', 'Meta'),
  ('aws', 'Amazon Web Services'),
  ('gcp', 'Google Cloud Platform'),
  ('mckinsey', 'McKinsey & Company'),
  ('bcg', 'Boston Consulting Group'),
  ('deloitte', 'Deloitte'),
  ('pwc', 'PricewaterhouseCoopers'),
  ('ey', 'Ernst & Young'),
  ('kpmg', 'KPMG'),
  ('gs', 'Goldman Sachs'),
  ('jpm', 'JPMorgan Chase'),
  ('morganstanley', 'Morgan Stanley'),
  ('boa', 'Bank of America'),
  ('citi', 'Citigroup'),
  ('yc', 'Y Combinator'),
  ('sequoia', 'Sequoia Capital'),
  ('kp', 'Kleiner Perkins'),
  ('greylock', 'Greylock Partners'),
  ('accel', 'Accel Partners')
ON CONFLICT DO NOTHING;

-- 7. Full-text search RPC function
CREATE OR REPLACE FUNCTION search_contacts_fts(
  search_query text,
  user_ids uuid[],
  result_limit int DEFAULT 50
)
RETURNS TABLE(id uuid, rank real) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, ts_rank(c.search_vector, plainto_tsquery('english', search_query)) AS rank
  FROM contacts c
  WHERE c.user_id = ANY(user_ids)
    AND c.search_vector @@ plainto_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- 8. Fuzzy company match RPC function
CREATE OR REPLACE FUNCTION search_contacts_fuzzy_company(
  company_term text,
  user_ids uuid[],
  similarity_threshold real DEFAULT 0.3,
  result_limit int DEFAULT 50
)
RETURNS TABLE(id uuid, sim real) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, similarity(c.company, company_term) AS sim
  FROM contacts c
  WHERE c.user_id = ANY(user_ids)
    AND c.company IS NOT NULL
    AND similarity(c.company, company_term) > similarity_threshold
  ORDER BY sim DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- 9. Vector search by user IDs (replaces old match_contacts)
CREATE OR REPLACE FUNCTION match_contacts_by_user(
  query_embedding vector(1536),
  match_count int DEFAULT 50,
  user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE(id uuid, similarity float) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, 1 - (c.embedding <=> query_embedding) AS similarity
  FROM contacts c
  WHERE c.user_id = ANY(user_ids)
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;
