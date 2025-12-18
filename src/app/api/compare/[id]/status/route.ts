import { NextRequest, NextResponse } from 'next/server';
import { db, initializeDatabase, comparisons } from '@/lib/db';
import { eq } from 'drizzle-orm';

// Ensure database is initialized (async)
async function ensureDbInitialized() {
  await initializeDatabase();
}

// GET /api/compare/[id]/status - Get comparison status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    const [comparison] = await db
      .select({
        id: comparisons.id,
        name: comparisons.name,
        comparisonStatus: comparisons.comparisonStatus,
        errorMessage: comparisons.errorMessage,
        createdAt: comparisons.createdAt,
        completedAt: comparisons.completedAt,
      })
      .from(comparisons)
      .where(eq(comparisons.id, id));

    if (!comparison) {
      return NextResponse.json(
        { error: 'Comparison not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: comparison.id,
      name: comparison.name,
      status: comparison.comparisonStatus,
      errorMessage: comparison.errorMessage,
      createdAt: comparison.createdAt,
      completedAt: comparison.completedAt,
    });
  } catch (error) {
    console.error('Error fetching comparison status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comparison status' },
      { status: 500 }
    );
  }
}
