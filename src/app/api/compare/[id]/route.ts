import { NextRequest, NextResponse } from 'next/server';
import { db, initializeDatabase, contracts, clauses, comparisons, clauseComparisons } from '@/lib/db';
import { eq } from 'drizzle-orm';

// Ensure database is initialized (async)
async function ensureDbInitialized() {
  await initializeDatabase();
}

// GET /api/compare/[id] - Get a single comparison with full details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    const [comparison] = await db
      .select()
      .from(comparisons)
      .where(eq(comparisons.id, id));

    if (!comparison) {
      return NextResponse.json(
        { error: 'Comparison not found' },
        { status: 404 }
      );
    }

    // Get source contract with clauses
    const [sourceContract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, comparison.sourceContractId));

    const sourceClauses = await db
      .select()
      .from(clauses)
      .where(eq(clauses.contractId, comparison.sourceContractId));

    // Get target contract with clauses
    const [targetContract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, comparison.targetContractId));

    const targetClauses = await db
      .select()
      .from(clauses)
      .where(eq(clauses.contractId, comparison.targetContractId));

    // Get clause comparisons with clause details
    const comparisonClauseComparisons = await db
      .select()
      .from(clauseComparisons)
      .where(eq(clauseComparisons.comparisonId, id));

    const clauseComparisonsWithDetails = await Promise.all(
      comparisonClauseComparisons.map(async (cc) => {
        const sourceClause = cc.sourceClauseId
          ? (await db.select().from(clauses).where(eq(clauses.id, cc.sourceClauseId)))[0]
          : null;
        const targetClause = cc.targetClauseId
          ? (await db.select().from(clauses).where(eq(clauses.id, cc.targetClauseId)))[0]
          : null;

        return {
          ...cc,
          riskFactors: cc.riskFactors ? JSON.parse(cc.riskFactors) : null,
          sourceClause,
          targetClause,
        };
      })
    );

    return NextResponse.json({
      comparison: {
        ...comparison,
        sourceContract: {
          ...sourceContract,
          clauses: sourceClauses,
        },
        targetContract: {
          ...targetContract,
          clauses: targetClauses,
        },
        clauseComparisons: clauseComparisonsWithDetails,
      },
    });
  } catch (error) {
    console.error('Error fetching comparison:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comparison' },
      { status: 500 }
    );
  }
}

// PATCH /api/compare/[id] - Update a comparison (e.g., title)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const body = await request.json();

    const [comparison] = await db
      .select()
      .from(comparisons)
      .where(eq(comparisons.id, id));

    if (!comparison) {
      return NextResponse.json(
        { error: 'Comparison not found' },
        { status: 404 }
      );
    }

    // Update the comparison name/title
    if (body.name !== undefined) {
      await db
        .update(comparisons)
        .set({ name: body.name || null })
        .where(eq(comparisons.id, id));
    }

    // Return updated comparison
    const [updatedComparison] = await db
      .select()
      .from(comparisons)
      .where(eq(comparisons.id, id));

    return NextResponse.json({ comparison: updatedComparison });
  } catch (error) {
    console.error('Error updating comparison:', error);
    return NextResponse.json(
      { error: 'Failed to update comparison' },
      { status: 500 }
    );
  }
}

// DELETE /api/compare/[id] - Delete a comparison
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    // Delete clause comparisons first
    await db.delete(clauseComparisons).where(eq(clauseComparisons.comparisonId, id));

    // Delete comparison
    await db.delete(comparisons).where(eq(comparisons.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting comparison:', error);
    return NextResponse.json(
      { error: 'Failed to delete comparison' },
      { status: 500 }
    );
  }
}
