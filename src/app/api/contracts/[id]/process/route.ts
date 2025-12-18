import { NextRequest, NextResponse } from 'next/server';
import { db, initializeDatabase, contracts, clauses } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { extractClauses } from '@/lib/casedev';
import { normalizeTextForComparison } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

// Ensure database is initialized (async)
async function ensureDbInitialized() {
  await initializeDatabase();
}

// POST /api/contracts/[id]/process - Process contract text and extract clauses
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'Contract text is required' },
        { status: 400 }
      );
    }

    // Get the contract
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

    // Update contract with raw text and set status to processing
    await db
      .update(contracts)
      .set({
        rawText: text,
        ingestionStatus: 'processing',
      })
      .where(eq(contracts.id, id));

    // Extract clauses using LLM
    const extractionResult = await extractClauses(text);

    if (extractionResult.error) {
      await db
        .update(contracts)
        .set({ ingestionStatus: 'failed' })
        .where(eq(contracts.id, id));
      
      return NextResponse.json(
        { error: extractionResult.error },
        { status: 500 }
      );
    }

    const extractedClauses = extractionResult.data || [];

    // Deduplicate clauses by content similarity - remove exact or near-duplicate content
    // but allow multiple clauses of the same type if they have different content
    const deduplicatedClauses: typeof extractedClauses = [];
    const seenContentHashes = new Set<string>();
    const seenClauseTypes = new Set<string>();
    
    // Sort by confidence score (higher first) to keep best extraction when duplicates exist
    const sortedClauses = [...extractedClauses].sort((a, b) => 
      (b.confidence || 0) - (a.confidence || 0)
    );
    
    for (const clause of sortedClauses) {
      // Use robust text normalization for consistent comparison
      const normalizedContent = normalizeTextForComparison(clause.content.toLowerCase());
      
      // Create a hash from the first 500 chars of normalized content
      const contentHash = normalizedContent.substring(0, 500);
      
      // Check if we've seen very similar content
      let isDuplicate = false;
      for (const seenHash of seenContentHashes) {
        // Simple similarity check - if content starts the same way, likely duplicate
        if (contentHash.substring(0, 200) === seenHash.substring(0, 200)) {
          isDuplicate = true;
          break;
        }
      }
      
      // Also check if we already have this clause type (prefer one entry per type)
      // unless the content is genuinely different
      if (!isDuplicate && seenClauseTypes.has(clause.clause_type)) {
        // Check if content is substantially different from existing same-type clause
        const existingOfType = deduplicatedClauses.find(c => c.clause_type === clause.clause_type);
        if (existingOfType) {
          const existingNormalized = normalizeTextForComparison(existingOfType.content.toLowerCase());
          // If >60% overlap in first 300 chars, consider it a duplicate
          const overlap = contentHash.substring(0, 300);
          const existingOverlap = existingNormalized.substring(0, 300);
          if (overlap === existingOverlap) {
            isDuplicate = true;
          }
        }
      }
      
      if (!isDuplicate) {
        seenContentHashes.add(contentHash);
        seenClauseTypes.add(clause.clause_type);
        deduplicatedClauses.push(clause);
      }
    }
    
    // Sort by clause type for deterministic ordering
    deduplicatedClauses.sort((a, b) => a.clause_type.localeCompare(b.clause_type));

    // Delete existing clauses for this contract
    await db.delete(clauses).where(eq(clauses.contractId, id));

    // Create new clauses
    const newClauses = [];
    for (const clause of deduplicatedClauses) {
      const clauseId = uuidv4();
      await db.insert(clauses).values({
        id: clauseId,
        contractId: id,
        clauseType: clause.clause_type,
        title: clause.title,
        content: clause.content,
        pageNumber: clause.page_number,
        confidenceScore: clause.confidence,
        extractedAt: new Date(),
      });
      
      const [newClause] = await db
        .select()
        .from(clauses)
        .where(eq(clauses.id, clauseId));
      
      newClauses.push(newClause);
    }

    // Update contract status
    await db
      .update(contracts)
      .set({
        ingestionStatus: 'completed',
        processedAt: new Date(),
      })
      .where(eq(contracts.id, id));

    const [updatedContract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, id));

    return NextResponse.json({
      contract: {
        ...updatedContract,
        clauses: newClauses,
      },
      clausesExtracted: newClauses.length,
    });
  } catch (error) {
    console.error('Error processing contract:', error);
    return NextResponse.json(
      { error: 'Failed to process contract' },
      { status: 500 }
    );
  }
}
