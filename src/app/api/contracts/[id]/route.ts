import { NextRequest, NextResponse } from 'next/server';
import { db, initializeDatabase, contracts, clauses, organizations } from '@/lib/db';
import { eq } from 'drizzle-orm';

// Ensure database is initialized (async)
async function ensureDbInitialized() {
  await initializeDatabase();
}

// GET /api/contracts/[id] - Get a single contract
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, id));

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Get clauses
    const contractClauses = await db
      .select()
      .from(clauses)
      .where(eq(clauses.contractId, id));

    // Get organization
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, contract.orgId));

    return NextResponse.json({
      contract: {
        ...contract,
        clauses: contractClauses,
        organization,
      },
    });
  } catch (error) {
    console.error('Error fetching contract:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contract' },
      { status: 500 }
    );
  }
}

// PATCH /api/contracts/[id] - Update a contract
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const body = await request.json();
    const { name, isTemplate, templateType } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (isTemplate !== undefined) updateData.isTemplate = isTemplate;
    if (templateType !== undefined) updateData.templateType = templateType;

    await db
      .update(contracts)
      .set(updateData)
      .where(eq(contracts.id, id));

    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, id));

    return NextResponse.json({ contract });
  } catch (error) {
    console.error('Error updating contract:', error);
    return NextResponse.json(
      { error: 'Failed to update contract' },
      { status: 500 }
    );
  }
}

// DELETE /api/contracts/[id] - Delete a contract
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    // Delete associated clauses first
    await db.delete(clauses).where(eq(clauses.contractId, id));

    // Delete contract
    await db.delete(contracts).where(eq(contracts.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contract:', error);
    return NextResponse.json(
      { error: 'Failed to delete contract' },
      { status: 500 }
    );
  }
}
