import { NextRequest, NextResponse } from 'next/server';
import { db, initializeDatabase, contracts, clauses, comparisons, clauseComparisons } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { analyzeClauseRisk, generateComparisonSummary, matchClausesSemantically, generateSemanticTags, extractClauses } from '@/lib/casedev';
import { calculateOverallRisk, normalizeTextForComparison } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import * as Diff from 'diff';

// Ensure database is initialized (async)
async function ensureDbInitialized() {
  await initializeDatabase();
}

// Helper function to extract and save clauses for a contract
async function extractAndSaveClauses(
  contractId: string,
  contractText: string
): Promise<(typeof clauses.$inferSelect)[]> {
  // Extract clauses using LLM
  const extractionResult = await extractClauses(contractText);
  
  if (extractionResult.error) {
    throw new Error(`Failed to extract clauses: ${extractionResult.error}`);
  }

  const extractedClauses = extractionResult.data || [];

  // Deduplicate clauses by content similarity
  const deduplicatedClauses: typeof extractedClauses = [];
  const seenContentHashes = new Set<string>();
  const seenClauseTypes = new Set<string>();
  
  const sortedClauses = [...extractedClauses].sort((a, b) => 
    (b.confidence || 0) - (a.confidence || 0)
  );
  
  for (const clause of sortedClauses) {
    const normalizedContent = normalizeTextForComparison(clause.content.toLowerCase());
    const contentHash = normalizedContent.substring(0, 500);
    
    let isDuplicate = false;
    for (const seenHash of seenContentHashes) {
      if (contentHash.substring(0, 200) === seenHash.substring(0, 200)) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate && seenClauseTypes.has(clause.clause_type)) {
      const existingOfType = deduplicatedClauses.find(c => c.clause_type === clause.clause_type);
      if (existingOfType) {
        const existingNormalized = normalizeTextForComparison(existingOfType.content.toLowerCase());
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
  
  deduplicatedClauses.sort((a, b) => a.clause_type.localeCompare(b.clause_type));

  // Delete existing clauses and create new ones
  await db.delete(clauses).where(eq(clauses.contractId, contractId));

  const newClauses: (typeof clauses.$inferSelect)[] = [];
  for (const clause of deduplicatedClauses) {
    const clauseId = uuidv4();
    await db.insert(clauses).values({
      id: clauseId,
      contractId: contractId,
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

  // Update contract status to completed
  await db
    .update(contracts)
    .set({
      ingestionStatus: 'completed',
      processedAt: new Date(),
    })
    .where(eq(contracts.id, contractId));

  return newClauses;
}

// Full background processing: create contracts, extract clauses, run comparison
async function processFullComparisonInBackground(
  comparisonId: string,
  sourceContractId: string,
  targetContractId: string,
  sourceText: string,
  targetText: string
) {
  try {
    // Save raw text to contracts
    await db.update(contracts).set({ rawText: sourceText, ingestionStatus: 'processing' }).where(eq(contracts.id, sourceContractId));
    await db.update(contracts).set({ rawText: targetText, ingestionStatus: 'processing' }).where(eq(contracts.id, targetContractId));

    // Extract clauses for both contracts (this is the slow part)
    const [sourceClauses, targetClauses] = await Promise.all([
      extractAndSaveClauses(sourceContractId, sourceText),
      extractAndSaveClauses(targetContractId, targetText),
    ]);

    // Get contract details
    const [sourceContract] = await db.select().from(contracts).where(eq(contracts.id, sourceContractId));
    const [targetContract] = await db.select().from(contracts).where(eq(contracts.id, targetContractId));

    // Now run the comparison logic
    await processComparisonInBackground(comparisonId, sourceContract, targetContract, sourceClauses, targetClauses);
  } catch (error) {
    console.error(`Full background comparison ${comparisonId} failed:`, error);
    // Update comparison with failed status
    await db
      .update(comparisons)
      .set({
        comparisonStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
        completedAt: new Date(),
      })
      .where(eq(comparisons.id, comparisonId));
    
    // Also mark contracts as failed
    await db.update(contracts).set({ ingestionStatus: 'failed' }).where(eq(contracts.id, sourceContractId));
    await db.update(contracts).set({ ingestionStatus: 'failed' }).where(eq(contracts.id, targetContractId));
  }
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

    // Create maps for quick lookup
    const sourceClausesById = new Map(sourceClauses.map(c => [c.id, c]));
    const targetClausesById = new Map(targetClauses.map(c => [c.id, c]));

    // Prepare all clause comparison data
    interface ClauseComparisonData {
      clauseType: string;
      sourceClauseId: string | null;
      targetClauseId: string | null;
      status: string;
      riskScore?: number;
      riskFactors?: string[];
      deviationPercentage?: number;
      diffSummary?: string;
      // For risk analysis
      needsRiskAnalysis?: boolean;
      sourceContent?: string;
      targetContent?: string;
    }

    const clauseComparisonData: ClauseComparisonData[] = [];

    // Process matched clauses - prepare data without LLM calls
    if (matchingResult.data) {
      // Process matched pairs - just compute diff status, queue LLM calls
      for (const match of matchingResult.data.matches) {
        const sourceClause = sourceClausesById.get(match.sourceClauseId);
        const targetClause = match.targetClauseId ? targetClausesById.get(match.targetClauseId) : null;

        if (!sourceClause) continue;

        const clauseType = sourceClause.clauseType;

        if (!targetClause) {
          clauseComparisonData.push({
            clauseType,
            sourceClauseId: sourceClause.id,
            targetClauseId: null,
            status: 'missing',
            riskScore: 50,
            diffSummary: 'This clause is missing from the redlined version.',
          });
        } else {
          // Normalize content before comparison
          const sourceContent = normalizeTextForComparison(sourceClause.content);
          const targetContent = normalizeTextForComparison(targetClause.content);

          if (sourceContent === targetContent) {
            clauseComparisonData.push({
              clauseType,
              sourceClauseId: sourceClause.id,
              targetClauseId: targetClause.id,
              status: 'identical',
              riskScore: 0,
            });
          } else {
            // Calculate change ratio
            const diff = Diff.diffWords(sourceContent, targetContent);
            const changes = diff.filter((part) => part.added || part.removed);
            const totalChars = diff.reduce((sum, part) => sum + part.value.length, 0);
            const changedChars = changes.reduce((sum, part) => sum + part.value.length, 0);
            const changeRatio = totalChars > 0 ? changedChars / totalChars : 0;

            const status = changeRatio < 0.20 ? 'minor_change' : 'significant_change';

            // Queue for parallel risk analysis
            clauseComparisonData.push({
              clauseType,
              sourceClauseId: sourceClause.id,
              targetClauseId: targetClause.id,
              status,
              needsRiskAnalysis: true,
              sourceContent,
              targetContent,
            });
          }
        }
      }

      // Add unmatched source clauses (missing in target)
      for (const sourceId of matchingResult.data.unmatchedSource) {
        const sourceClause = sourceClausesById.get(sourceId);
        if (!sourceClause) continue;

        clauseComparisonData.push({
          clauseType: sourceClause.clauseType,
          sourceClauseId: sourceClause.id,
          targetClauseId: null,
          status: 'missing',
          riskScore: 50,
          diffSummary: 'This clause is missing from the redlined version.',
        });
      }

      // Add unmatched target clauses (added in target)
      for (const targetId of matchingResult.data.unmatchedTarget) {
        const targetClause = targetClausesById.get(targetId);
        if (!targetClause) continue;

        clauseComparisonData.push({
          clauseType: targetClause.clauseType,
          sourceClauseId: null,
          targetClauseId: targetClause.id,
          status: 'added',
          riskScore: 50,
          diffSummary: 'This clause was added in the redlined version.',
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

        if (!sourceClause && targetClause) {
          clauseComparisonData.push({
            clauseType,
            sourceClauseId: null,
            targetClauseId: targetClause.id,
            status: 'added',
            riskScore: 50,
            diffSummary: 'This clause was added in the redlined version.',
          });
        } else if (sourceClause && !targetClause) {
          clauseComparisonData.push({
            clauseType,
            sourceClauseId: sourceClause.id,
            targetClauseId: null,
            status: 'missing',
            riskScore: 50,
            diffSummary: 'This clause is missing from the redlined version.',
          });
        } else if (sourceClause && targetClause) {
          const sourceContent = normalizeTextForComparison(sourceClause.content);
          const targetContent = normalizeTextForComparison(targetClause.content);

          if (sourceContent === targetContent) {
            clauseComparisonData.push({
              clauseType,
              sourceClauseId: sourceClause.id,
              targetClauseId: targetClause.id,
              status: 'identical',
              riskScore: 0,
            });
          } else {
            const diff = Diff.diffWords(sourceContent, targetContent);
            const changes = diff.filter((part) => part.added || part.removed);
            const totalChars = diff.reduce((sum, part) => sum + part.value.length, 0);
            const changedChars = changes.reduce((sum, part) => sum + part.value.length, 0);
            const changeRatio = totalChars > 0 ? changedChars / totalChars : 0;

            const status = changeRatio < 0.20 ? 'minor_change' : 'significant_change';

            // Queue for parallel risk analysis
            clauseComparisonData.push({
              clauseType,
              sourceClauseId: sourceClause.id,
              targetClauseId: targetClause.id,
              status,
              needsRiskAnalysis: true,
              sourceContent,
              targetContent,
            });
          }
        }
      }
    }

    // PARALLEL RISK ANALYSIS: Analyze all changed clauses at once
    const clausesNeedingAnalysis = clauseComparisonData.filter(c => c.needsRiskAnalysis);
    console.log(`Analyzing ${clausesNeedingAnalysis.length} clauses in parallel...`);
    
    if (clausesNeedingAnalysis.length > 0) {
      const riskAnalysisPromises = clausesNeedingAnalysis.map(clause =>
        analyzeClauseRisk(clause.sourceContent!, clause.targetContent!, clause.clauseType)
          .then(result => ({ clause, result }))
      );
      
      const riskResults = await Promise.all(riskAnalysisPromises);
      
      // Update clause data with risk analysis results
      for (const { clause, result } of riskResults) {
        if (result.data) {
          clause.riskScore = result.data.risk_score;
          clause.riskFactors = result.data.risk_factors;
          clause.deviationPercentage = result.data.deviation_percentage;
          clause.diffSummary = result.data.summary;
        } else {
          clause.riskScore = clause.status === 'minor_change' ? 25 : 60;
          clause.diffSummary = `Changes detected in ${clause.clauseType} clause.`;
        }
      }
    }

    // BATCH INSERT: Insert all clause comparisons at once
    const clauseComparisonInserts = clauseComparisonData.map(c => ({
      id: uuidv4(),
      comparisonId,
      clauseType: c.clauseType,
      sourceClauseId: c.sourceClauseId,
      targetClauseId: c.targetClauseId,
      status: c.status,
      riskScore: c.riskScore || null,
      riskFactors: c.riskFactors ? JSON.stringify(c.riskFactors) : null,
      deviationPercentage: c.deviationPercentage || null,
      diffSummary: c.diffSummary || null,
    }));

    if (clauseComparisonInserts.length > 0) {
      await db.insert(clauseComparisons).values(clauseComparisonInserts);
    }

    // Prepare results for summary generation
    const clauseComparisonResults = clauseComparisonData.map(c => ({
      clauseType: c.clauseType,
      status: c.status,
      riskScore: c.riskScore,
      summary: c.diffSummary,
    }));

    // Sort by clause type for consistent ordering
    clauseComparisonResults.sort((a, b) => a.clauseType.localeCompare(b.clauseType));

    // Calculate overall risk score
    const riskScores = clauseComparisonResults
      .filter((c) => c.riskScore !== undefined)
      .map((c) => c.riskScore as number);
    const overallRiskScore = calculateOverallRisk(riskScores);

    // PARALLEL: Generate summary and tags at the same time
    const [summaryResult, tagsResult] = await Promise.all([
      generateComparisonSummary(
        sourceContract.name,
        targetContract.name,
        clauseComparisonResults
      ),
      generateSemanticTags(
        sourceContract.name,
        targetContract.name,
        null, // Can't use summary here since they run in parallel
        clauseComparisonResults.map(c => c.clauseType),
        overallRiskScore
      ),
    ]);

    // Update comparison with overall risk, summary, tags, and completed status
    await db
      .update(comparisons)
      .set({
        overallRiskScore,
        summary: summaryResult.data || null,
        semanticTags: tagsResult.data ? JSON.stringify(tagsResult.data) : null,
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
    const { 
      // New format: raw text provided directly
      sourceText, targetText, sourceName, targetName, sourceFilename, targetFilename,
      // Legacy format: contract IDs provided
      sourceContractId, targetContractId, 
      // Common fields
      comparisonType, name 
    } = body;
    const orgId = body.orgId || process.env.DEFAULT_ORG_ID || 'demo-org';

    // New format: raw text provided - create contracts and process everything in background
    if (sourceText && targetText) {
      // Create both contracts immediately (just DB records, no processing yet)
      const newSourceContractId = uuidv4();
      const newTargetContractId = uuidv4();

      await db.insert(contracts).values({
        id: newSourceContractId,
        orgId,
        name: sourceName || 'Original',
        filename: sourceFilename || 'Original.txt',
        isTemplate: true,
        templateType: 'general',
        ingestionStatus: 'pending',
        uploadedAt: new Date(),
      });

      await db.insert(contracts).values({
        id: newTargetContractId,
        orgId,
        name: targetName || 'Revised',
        filename: targetFilename || 'Revised.txt',
        isTemplate: false,
        ingestionStatus: 'pending',
        uploadedAt: new Date(),
      });

      // Create comparison record with 'processing' status
      const comparisonId = uuidv4();
      await db.insert(comparisons).values({
        id: comparisonId,
        orgId,
        name: name || null,
        sourceContractId: newSourceContractId,
        targetContractId: newTargetContractId,
        comparisonType: comparisonType || 'template_vs_redline',
        comparisonStatus: 'processing',
      });

      // Process everything in background - fire and forget
      processFullComparisonInBackground(
        comparisonId,
        newSourceContractId,
        newTargetContractId,
        sourceText,
        targetText
      ).catch(err => {
        console.error('Full background comparison error:', err);
      });

      // Return immediately with the comparison ID
      return NextResponse.json({
        comparison: {
          id: comparisonId,
          name: name || null,
          comparisonStatus: 'processing',
          sourceContract: {
            id: newSourceContractId,
            name: sourceName || 'Original',
            filename: sourceFilename || 'Original.txt',
          },
          targetContract: {
            id: newTargetContractId,
            name: targetName || 'Revised',
            filename: targetFilename || 'Revised.txt',
          },
          createdAt: new Date().toISOString(),
        },
        background: true,
      });
    }

    // Legacy format: contract IDs provided
    if (!sourceContractId || !targetContractId) {
      return NextResponse.json(
        { error: 'Either provide sourceText/targetText or sourceContractId/targetContractId' },
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
        createdAt: new Date().toISOString(),
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
