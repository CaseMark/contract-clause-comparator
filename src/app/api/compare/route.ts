import { NextRequest, NextResponse } from 'next/server';
import { db, initializeDatabase, contracts, clauses, comparisons, clauseComparisons } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { analyzeClauseRisk, generateComparisonSummary, matchClausesSemantically } from '@/lib/casedev';
import { calculateOverallRisk, normalizeTextForComparison } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import * as Diff from 'diff';

// Ensure database is initialized (async)
async function ensureDbInitialized() {
  await initializeDatabase();
}

// Background processing function for comparisons
async function processComparisonInBackground(
  comparisonId: string,
  sourceContract: typeof contracts.$inferSelect,
  targetContract: typeof contracts.$inferSelect,
  sourceClauses: (typeof clauses.$inferSelect)[],
  targetClauses: (typeof clauses.$inferSelect)[]
) {
  try {
    // Sort clauses by type for deterministic ordering
    // This ensures consistent processing order regardless of database retrieval order
    const sortedSourceClauses = [...sourceClauses].sort((a, b) => 
      a.clauseType.localeCompare(b.clauseType) || a.id.localeCompare(b.id)
    );
    const sortedTargetClauses = [...targetClauses].sort((a, b) => 
      a.clauseType.localeCompare(b.clauseType) || a.id.localeCompare(b.id)
    );

    // Use semantic matching to pair clauses by meaning, not just by type
    const sourceClausesForMatching = sortedSourceClauses.map(c => ({
      id: c.id,
      clauseType: c.clauseType,
      title: c.title || c.clauseType,
      content: c.content,
    }));
    
    const targetClausesForMatching = sortedTargetClauses.map(c => ({
      id: c.id,
      clauseType: c.clauseType,
      title: c.title || c.clauseType,
      content: c.content,
    }));

    // Get semantic matches from LLM
    const matchingResult = await matchClausesSemantically(
      sourceClausesForMatching,
      targetClausesForMatching
    );
    
    // Validate and enhance matching results
    // If semantic matching returns too few matches, supplement with type-based and title-based matching
    if (matchingResult.data) {
      const matchedSourceIds = new Set(matchingResult.data.matches.map(m => m.sourceClauseId));
      const matchedTargetIds = new Set(
        matchingResult.data.matches.map(m => m.targetClauseId).filter(Boolean)
      );
      
      // Helper to normalize titles for comparison
      const normalizeTitle = (title: string | null): string => {
        if (!title) return '';
        return title
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
          .replace(/section|article|clause/g, ''); // Remove common prefixes
      };
      
      // Find unmatched clauses that could be matched by type or title
      for (const sourceClause of sortedSourceClauses) {
        if (!matchedSourceIds.has(sourceClause.id)) {
          // First try: match by clause type
          let matchingTarget = sortedTargetClauses.find(tc => 
            tc.clauseType === sourceClause.clauseType && 
            !matchedTargetIds.has(tc.id)
          );
          
          // Second try: match by similar title (section numbers)
          if (!matchingTarget && sourceClause.title) {
            const sourceTitle = normalizeTitle(sourceClause.title);
            if (sourceTitle) {
              matchingTarget = sortedTargetClauses.find(tc => 
                !matchedTargetIds.has(tc.id) &&
                tc.title &&
                normalizeTitle(tc.title) === sourceTitle
              );
            }
          }
          
          if (matchingTarget) {
            // Add this match
            matchingResult.data.matches.push({
              sourceClauseId: sourceClause.id,
              targetClauseId: matchingTarget.id,
              matchConfidence: 0.7, // Lower confidence for fallback match
              matchReason: matchingTarget.clauseType === sourceClause.clauseType 
                ? `Matched by clause type: ${sourceClause.clauseType}`
                : `Matched by title similarity`
            });
            matchedSourceIds.add(sourceClause.id);
            matchedTargetIds.add(matchingTarget.id);
            
            // Remove from unmatched arrays
            matchingResult.data.unmatchedSource = matchingResult.data.unmatchedSource.filter(
              id => id !== sourceClause.id
            );
            matchingResult.data.unmatchedTarget = matchingResult.data.unmatchedTarget.filter(
              id => id !== matchingTarget.id
            );
          }
        }
      }
    }

    const clauseComparisonResults: Array<{
      clauseType: string;
      status: string;
      riskScore?: number;
      summary?: string;
    }> = [];

    // Create maps for quick lookup
    const sourceClausesById = new Map(sourceClauses.map(c => [c.id, c]));
    const targetClausesById = new Map(targetClauses.map(c => [c.id, c]));

    // Process matched clauses
    if (matchingResult.data) {
      // Process matched pairs
      for (const match of matchingResult.data.matches) {
        const sourceClause = sourceClausesById.get(match.sourceClauseId);
        const targetClause = match.targetClauseId ? targetClausesById.get(match.targetClauseId) : null;

        if (!sourceClause) continue;

        let status: string;
        let riskScore: number | undefined;
        let riskFactors: string[] | undefined;
        let deviationPercentage: number | undefined;
        let diffSummary: string | undefined;
        const clauseType = sourceClause.clauseType;

        if (!targetClause) {
          status = 'missing';
          riskScore = 50;
          diffSummary = 'This clause is missing from the redlined version.';
        } else {
          // Normalize content before comparison to ensure consistent results
          const sourceContent = normalizeTextForComparison(sourceClause.content);
          const targetContent = normalizeTextForComparison(targetClause.content);

          if (sourceContent === targetContent) {
            status = 'identical';
            riskScore = 0;
          } else {
            // Use word-level diff on normalized content for consistent change detection
            const diff = Diff.diffWords(sourceContent, targetContent);
            const changes = diff.filter((part) => part.added || part.removed);
            
            // Calculate change ratio based on character count, not just part count
            // This provides more accurate measurement of actual content differences
            const totalChars = diff.reduce((sum, part) => sum + part.value.length, 0);
            const changedChars = changes.reduce((sum, part) => sum + part.value.length, 0);
            const changeRatio = totalChars > 0 ? changedChars / totalChars : 0;

            if (changeRatio < 0.05) {
              status = 'minor_change';
            } else if (changeRatio < 0.20) {
              status = 'minor_change';
            } else {
              status = 'significant_change';
            }

            // Analyze changes using LLM with normalized content for consistent scoring
            const riskAnalysis = await analyzeClauseRisk(
              sourceContent,
              targetContent,
              clauseType
            );

            if (riskAnalysis.data) {
              riskScore = riskAnalysis.data.risk_score;
              riskFactors = riskAnalysis.data.risk_factors;
              deviationPercentage = riskAnalysis.data.deviation_percentage;
              diffSummary = riskAnalysis.data.summary;
            } else {
              riskScore = status === 'minor_change' ? 25 : 60;
              diffSummary = `Changes detected in ${clauseType} clause.`;
            }
          }
        }

        // Create clause comparison record
        const clauseComparisonId = uuidv4();
        await db.insert(clauseComparisons).values({
          id: clauseComparisonId,
          comparisonId,
          clauseType,
          sourceClauseId: sourceClause.id,
          targetClauseId: targetClause?.id || null,
          status,
          riskScore: riskScore || null,
          riskFactors: riskFactors ? JSON.stringify(riskFactors) : null,
          deviationPercentage: deviationPercentage || null,
          diffSummary: diffSummary || null,
        });

        clauseComparisonResults.push({
          clauseType,
          status,
          riskScore,
          summary: diffSummary,
        });
      }

      // Process unmatched source clauses (missing in target)
      for (const sourceId of matchingResult.data.unmatchedSource) {
        const sourceClause = sourceClausesById.get(sourceId);
        if (!sourceClause) continue;

        const clauseComparisonId = uuidv4();
        await db.insert(clauseComparisons).values({
          id: clauseComparisonId,
          comparisonId,
          clauseType: sourceClause.clauseType,
          sourceClauseId: sourceClause.id,
          targetClauseId: null,
          status: 'missing',
          riskScore: 50,
          riskFactors: null,
          deviationPercentage: null,
          diffSummary: 'This clause is missing from the redlined version.',
        });

        clauseComparisonResults.push({
          clauseType: sourceClause.clauseType,
          status: 'missing',
          riskScore: 50,
          summary: 'This clause is missing from the redlined version.',
        });
      }

      // Process unmatched target clauses (added in target)
      for (const targetId of matchingResult.data.unmatchedTarget) {
        const targetClause = targetClausesById.get(targetId);
        if (!targetClause) continue;

        const clauseComparisonId = uuidv4();
        await db.insert(clauseComparisons).values({
          id: clauseComparisonId,
          comparisonId,
          clauseType: targetClause.clauseType,
          sourceClauseId: null,
          targetClauseId: targetClause.id,
          status: 'added',
          riskScore: 50,
          riskFactors: null,
          deviationPercentage: null,
          diffSummary: 'This clause was added in the redlined version.',
        });

        clauseComparisonResults.push({
          clauseType: targetClause.clauseType,
          status: 'added',
          riskScore: 50,
          summary: 'This clause was added in the redlined version.',
        });
      }
    } else {
      // Fallback to type-based matching if semantic matching fails
      console.warn('Semantic matching failed, falling back to type-based matching:', matchingResult.error);
      
      const sourceClausesByType = new Map<string, typeof sourceClauses[0]>();
      const targetClausesByType = new Map<string, typeof targetClauses[0]>();

      for (const clause of sourceClauses) {
        sourceClausesByType.set(clause.clauseType, clause);
      }

      for (const clause of targetClauses) {
        targetClausesByType.set(clause.clauseType, clause);
      }

      const allClauseTypes = new Set([
        ...sourceClausesByType.keys(),
        ...targetClausesByType.keys(),
      ]);

      for (const clauseType of allClauseTypes) {
        const sourceClause = sourceClausesByType.get(clauseType);
        const targetClause = targetClausesByType.get(clauseType);

        let status: string;
        let riskScore: number | undefined;
        let riskFactors: string[] | undefined;
        let deviationPercentage: number | undefined;
        let diffSummary: string | undefined;

        if (!sourceClause && targetClause) {
          status = 'added';
          riskScore = 50;
          diffSummary = 'This clause was added in the redlined version.';
        } else if (sourceClause && !targetClause) {
          status = 'missing';
          riskScore = 50;
          diffSummary = 'This clause is missing from the redlined version.';
        } else if (sourceClause && targetClause) {
          // Normalize content before comparison to ensure consistent results
          const sourceContent = normalizeTextForComparison(sourceClause.content);
          const targetContent = normalizeTextForComparison(targetClause.content);

          if (sourceContent === targetContent) {
            status = 'identical';
            riskScore = 0;
          } else {
            // Use word-level diff on normalized content for consistent change detection
            const diff = Diff.diffWords(sourceContent, targetContent);
            const changes = diff.filter((part) => part.added || part.removed);
            
            // Calculate change ratio based on character count, not just part count
            const totalChars = diff.reduce((sum, part) => sum + part.value.length, 0);
            const changedChars = changes.reduce((sum, part) => sum + part.value.length, 0);
            const changeRatio = totalChars > 0 ? changedChars / totalChars : 0;

            if (changeRatio < 0.05) {
              status = 'minor_change';
            } else if (changeRatio < 0.20) {
              status = 'minor_change';
            } else {
              status = 'significant_change';
            }

            // Analyze changes using LLM with normalized content for consistent scoring
            const riskAnalysis = await analyzeClauseRisk(
              sourceContent,
              targetContent,
              clauseType
            );

            if (riskAnalysis.data) {
              riskScore = riskAnalysis.data.risk_score;
              riskFactors = riskAnalysis.data.risk_factors;
              deviationPercentage = riskAnalysis.data.deviation_percentage;
              diffSummary = riskAnalysis.data.summary;
            } else {
              riskScore = status === 'minor_change' ? 25 : 60;
              diffSummary = `Changes detected in ${clauseType} clause.`;
            }
          }
        } else {
          continue;
        }

        const clauseComparisonId = uuidv4();
        await db.insert(clauseComparisons).values({
          id: clauseComparisonId,
          comparisonId,
          clauseType,
          sourceClauseId: sourceClause?.id || null,
          targetClauseId: targetClause?.id || null,
          status,
          riskScore: riskScore || null,
          riskFactors: riskFactors ? JSON.stringify(riskFactors) : null,
          deviationPercentage: deviationPercentage || null,
          diffSummary: diffSummary || null,
        });

        clauseComparisonResults.push({
          clauseType,
          status,
          riskScore,
          summary: diffSummary,
        });
      }
    }

    // Sort clause comparison results by clause type for consistent ordering
    clauseComparisonResults.sort((a, b) => a.clauseType.localeCompare(b.clauseType));

    // Calculate overall risk score
    const riskScores = clauseComparisonResults
      .filter((c) => c.riskScore !== undefined)
      .map((c) => c.riskScore as number);
    const overallRiskScore = calculateOverallRisk(riskScores);

    // Generate comparison summary
    const summaryResult = await generateComparisonSummary(
      sourceContract.name,
      targetContract.name,
      clauseComparisonResults
    );

    // Update comparison with overall risk, summary, and completed status
    await db
      .update(comparisons)
      .set({
        overallRiskScore,
        summary: summaryResult.data || null,
        comparisonStatus: 'completed',
        completedAt: new Date(),
      })
      .where(eq(comparisons.id, comparisonId));

    console.log(`Background comparison ${comparisonId} completed successfully`);
  } catch (error) {
    console.error(`Background comparison ${comparisonId} failed:`, error);
    // Update comparison with failed status
    await db
      .update(comparisons)
      .set({
        comparisonStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
        completedAt: new Date(),
      })
      .where(eq(comparisons.id, comparisonId));
  }
}

// POST /api/compare - Compare two contracts
export async function POST(request: NextRequest) {
  try {
    await ensureDbInitialized();
    
    const body = await request.json();
    const { sourceContractId, targetContractId, comparisonType, name, background } = body;
    const orgId = body.orgId || process.env.DEFAULT_ORG_ID || 'demo-org';

    if (!sourceContractId || !targetContractId) {
      return NextResponse.json(
        { error: 'Both sourceContractId and targetContractId are required' },
        { status: 400 }
      );
    }

    // Get both contracts
    const [sourceContract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, sourceContractId));
    
    const [targetContract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, targetContractId));

    if (!sourceContract || !targetContract) {
      return NextResponse.json(
        { error: 'One or both contracts not found' },
        { status: 404 }
      );
    }

    if (sourceContract.ingestionStatus !== 'completed' || targetContract.ingestionStatus !== 'completed') {
      return NextResponse.json(
        { error: 'Both contracts must be processed before comparison' },
        { status: 400 }
      );
    }

    // Get clauses for both contracts
    const sourceClauses = await db
      .select()
      .from(clauses)
      .where(eq(clauses.contractId, sourceContractId));
    
    const targetClauses = await db
      .select()
      .from(clauses)
      .where(eq(clauses.contractId, targetContractId));

    // Create comparison record with 'processing' status
    const comparisonId = uuidv4();
    await db.insert(comparisons).values({
      id: comparisonId,
      orgId,
      name: name || null,
      sourceContractId,
      targetContractId,
      comparisonType: comparisonType || 'template_vs_redline',
      comparisonStatus: 'processing',
    });

    // Always use background processing - fire and forget
    // The processComparisonInBackground function handles all the semantic comparison
    processComparisonInBackground(
      comparisonId,
      sourceContract,
      targetContract,
      sourceClauses,
      targetClauses
    ).catch(err => {
      console.error('Background comparison error:', err);
    });

    // Return immediately with the comparison ID and processing status
    // Users can poll for status or view it on the Past Comparisons page
    return NextResponse.json({
      comparison: {
        id: comparisonId,
        name: name || null,
        comparisonStatus: 'processing',
        sourceContract: {
          id: sourceContract.id,
          name: sourceContract.name,
          filename: sourceContract.filename,
        },
        targetContract: {
          id: targetContract.id,
          name: targetContract.name,
          filename: targetContract.filename,
        },
        createdAt: new Date().toISOString(), // Return ISO string for client
      },
      background: true,
    });
  } catch (error) {
    console.error('Error comparing contracts:', error);
    return NextResponse.json(
      { error: 'Failed to compare contracts' },
      { status: 500 }
    );
  }
}

// GET /api/compare - List all comparisons
export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('orgId') || process.env.DEFAULT_ORG_ID || 'demo-org';

    const comparisonList = await db
      .select()
      .from(comparisons)
      .where(eq(comparisons.orgId, orgId));

    const comparisonsWithContracts = await Promise.all(
      comparisonList.map(async (comparison) => {
        const [sourceContract] = await db
          .select({
            id: contracts.id,
            name: contracts.name,
            filename: contracts.filename,
          })
          .from(contracts)
          .where(eq(contracts.id, comparison.sourceContractId));

        const [targetContract] = await db
          .select({
            id: contracts.id,
            name: contracts.name,
            filename: contracts.filename,
          })
          .from(contracts)
          .where(eq(contracts.id, comparison.targetContractId));

        return {
          ...comparison,
          sourceContract,
          targetContract,
        };
      })
    );

    return NextResponse.json({ comparisons: comparisonsWithContracts });
  } catch (error) {
    console.error('Error fetching comparisons:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comparisons' },
      { status: 500 }
    );
  }
}
