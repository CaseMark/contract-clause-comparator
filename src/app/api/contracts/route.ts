import { NextRequest, NextResponse } from 'next/server';
import { db, initializeDatabase, contracts, clauses, organizations } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getContentType } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

// Ensure database is initialized (async)
async function ensureDbInitialized() {
  await initializeDatabase();
}

// GET /api/contracts - List all contracts
export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('orgId') || process.env.DEFAULT_ORG_ID || 'demo-org';
    const isTemplate = searchParams.get('isTemplate');

    let query = db.select().from(contracts).where(eq(contracts.orgId, orgId));
    
    const contractList = await query;
    
    // Filter by isTemplate if specified
    const filteredContracts = isTemplate !== null 
      ? contractList.filter(c => c.isTemplate === (isTemplate === 'true'))
      : contractList;

    // Get clauses for each contract
    const contractsWithClauses = await Promise.all(
      filteredContracts.map(async (contract) => {
        const contractClauses = await db
          .select({
            id: clauses.id,
            clauseType: clauses.clauseType,
            title: clauses.title,
          })
          .from(clauses)
          .where(eq(clauses.contractId, contract.id));
        
        return {
          ...contract,
          clauses: contractClauses,
        };
      })
    );

    return NextResponse.json({ contracts: contractsWithClauses });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
}

// POST /api/contracts - Create a new contract
export async function POST(request: NextRequest) {
  try {
    await ensureDbInitialized();
    
    const body = await request.json();
    const { filename, name, isTemplate, templateType } = body;
    const orgId = body.orgId || process.env.DEFAULT_ORG_ID || 'demo-org';

    if (!filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    // Ensure organization exists
    const existingOrg = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (existingOrg.length === 0) {
      await db.insert(organizations).values({
        id: orgId,
        name: 'Demo Organization',
      });
    }

    const contentType = getContentType(filename);
    const contractId = uuidv4();

    // Create contract record
    await db.insert(contracts).values({
      id: contractId,
      orgId,
      name: name || filename.replace(/\.[^/.]+$/, ''),
      filename,
      contentType,
      isTemplate: isTemplate || false,
      templateType: templateType || null,
      ingestionStatus: 'pending',
    });

    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, contractId));

    return NextResponse.json({
      contract,
      message: 'Contract created. Use /api/contracts/[id]/process to upload content.',
    });
  } catch (error) {
    console.error('Error creating contract:', error);
    return NextResponse.json(
      { error: 'Failed to create contract' },
      { status: 500 }
    );
  }
}
