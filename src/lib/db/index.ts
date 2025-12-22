import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// PostgreSQL connection string - REQUIRED for production
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required. Please set it in your .env file or Vercel environment variables.');
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection not established
});

// Create Drizzle ORM instance
export const db = drizzle(pool, { schema });

// Track initialization state
let initPromise: Promise<void> | null = null;
let initialized = false;

// Initialize database tables (async, with caching)
export function initializeDatabase(): Promise<void> {
  if (initialized) {
    return Promise.resolve();
  }
  
  if (initPromise) {
    return initPromise;
  }
  
  initPromise = (async () => {
    const client = await pool.connect();
    try {
      // Create tables if they don't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          vault_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS contracts (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL REFERENCES organizations(id),
          name TEXT NOT NULL,
          filename TEXT NOT NULL,
          object_id TEXT,
          content_type TEXT,
          raw_text TEXT,
          ingestion_status TEXT NOT NULL DEFAULT 'pending',
          is_template BOOLEAN NOT NULL DEFAULT FALSE,
          template_type TEXT,
          uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          processed_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS clauses (
          id TEXT PRIMARY KEY,
          contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
          clause_type TEXT NOT NULL,
          title TEXT,
          content TEXT NOT NULL,
          start_position INTEGER,
          end_position INTEGER,
          page_number INTEGER,
          confidence_score REAL,
          extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS comparisons (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL REFERENCES organizations(id),
          name TEXT,
          source_contract_id TEXT NOT NULL REFERENCES contracts(id),
          target_contract_id TEXT NOT NULL REFERENCES contracts(id),
          comparison_type TEXT,
          comparison_status TEXT NOT NULL DEFAULT 'pending',
          overall_risk_score REAL,
          summary TEXT,
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS clause_comparisons (
          id TEXT PRIMARY KEY,
          comparison_id TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
          clause_type TEXT NOT NULL,
          source_clause_id TEXT REFERENCES clauses(id),
          target_clause_id TEXT REFERENCES clauses(id),
          diff_summary TEXT,
          risk_score REAL,
          risk_factors TEXT,
          deviation_percentage REAL,
          status TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS templates (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL REFERENCES organizations(id),
          contract_id TEXT NOT NULL REFERENCES contracts(id),
          name TEXT NOT NULL,
          template_type TEXT,
          description TEXT,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Create indexes for better query performance
        CREATE INDEX IF NOT EXISTS idx_contracts_org_id ON contracts(org_id);
        CREATE INDEX IF NOT EXISTS idx_clauses_contract_id ON clauses(contract_id);
        CREATE INDEX IF NOT EXISTS idx_comparisons_org_id ON comparisons(org_id);
        CREATE INDEX IF NOT EXISTS idx_clause_comparisons_comparison_id ON clause_comparisons(comparison_id);
      `);

      // Create default organization if it doesn't exist
      const defaultOrgId = process.env.DEFAULT_ORG_ID || 'demo-org';
      const existingOrg = await client.query('SELECT id FROM organizations WHERE id = $1', [defaultOrgId]);
      
      if (existingOrg.rows.length === 0) {
        await client.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [defaultOrgId, 'Demo Organization']);
      }

      initialized = true;
      console.log('Database initialized successfully');
    } finally {
      client.release();
    }
  })();
  
  return initPromise;
}

// Export schema for use in queries
export * from './schema';
