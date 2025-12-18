'use client';

import React, { useState, useMemo } from 'react';
import { FileText, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface ClauseComparisonResult {
  id: string;
  clauseType: string;
  status: string;
  riskScore: number | null;
  deviationPercentage: number | null;
  diffSummary: string | null;
  riskFactors: string[] | null;
  sourceClause: { content: string } | null;
  targetClause: { content: string } | null;
}

interface ExecutiveSummaryProps {
  summary: string;
  clauseComparisons: ClauseComparisonResult[];
  targetContractName?: string;
}

// Format clause type for display (e.g., "limitation_of_liability" -> "Limitation of Liability")
function formatClauseType(clauseType: string): string {
  return clauseType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ExecutiveSummary({ summary, clauseComparisons, targetContractName }: ExecutiveSummaryProps) {
  const [selectedClause, setSelectedClause] = useState<ClauseComparisonResult | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Create a map of clause types to their comparison data
  const clauseMap = useMemo(() => {
    const map = new Map<string, ClauseComparisonResult>();
    for (const clause of clauseComparisons) {
      map.set(clause.clauseType.toLowerCase(), clause);
    }
    return map;
  }, [clauseComparisons]);

  // Parse the summary and replace [[clause_type]] with clickable links
  const parsedSummary = useMemo(() => {
    // Clean up markdown formatting first
    let cleanSummary = summary
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/^[-•]\s*/gm, '')
      .trim();

    // Find all [[clause_type]] patterns
    const regex = /\[\[([^\]]+)\]\]/g;
    const parts: Array<{ type: 'text' | 'link'; content: string; clauseType?: string }> = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(cleanSummary)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: cleanSummary.slice(lastIndex, match.index),
        });
      }

      // Add the clause link
      const clauseType = match[1].toLowerCase();
      parts.push({
        type: 'link',
        content: formatClauseType(match[1]),
        clauseType,
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < cleanSummary.length) {
      parts.push({
        type: 'text',
        content: cleanSummary.slice(lastIndex),
      });
    }

    return parts;
  }, [summary]);

  const handleClauseClick = (clauseType: string) => {
    const clause = clauseMap.get(clauseType);
    if (clause) {
      setSelectedClause(clause);
      setIsDialogOpen(true);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'identical':
        return <Badge variant="success">Identical</Badge>;
      case 'minor_change':
        return <Badge variant="warning">Minor Change</Badge>;
      case 'significant_change':
        return <Badge variant="danger">Significant Change</Badge>;
      case 'missing':
        return <Badge variant="danger">Missing</Badge>;
      case 'added':
        return <Badge variant="warning">Added</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-muted-foreground" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {parsedSummary.map((part, index) => {
              if (part.type === 'text') {
                return <span key={index}>{part.content}</span>;
              }
              
              // Check if this clause exists in our comparison data
              const clauseExists = clauseMap.has(part.clauseType || '');
              
              if (clauseExists) {
                return (
                  <button
                    key={index}
                    onClick={() => handleClauseClick(part.clauseType!)}
                    className="text-primary hover:text-primary/80 underline underline-offset-2 font-medium transition-colors cursor-pointer"
                  >
                    {part.content}
                  </button>
                );
              }
              
              // If clause doesn't exist, just render as text
              return <span key={index}>{part.content}</span>;
            })}
          </p>
        </CardContent>
      </Card>

      {/* Clause Preview Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-full max-w-2xl" onClose={() => setIsDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span>{formatClauseType(selectedClause?.clauseType || '')}</span>
              {selectedClause && getStatusBadge(selectedClause.status)}
            </DialogTitle>
            {targetContractName && (
              <p className="text-sm text-muted-foreground">
                From: {targetContractName}
              </p>
            )}
          </DialogHeader>
          <DialogBody>
            {selectedClause?.targetClause?.content ? (
              <div className="space-y-4">
                {/* Risk Score if available */}
                {selectedClause.riskScore !== null && selectedClause.riskScore > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Risk Score:</span>
                    <span className={
                      selectedClause.riskScore >= 75 ? 'text-red-600 dark:text-red-400 font-semibold' :
                      selectedClause.riskScore >= 50 ? 'text-orange-600 dark:text-orange-400 font-semibold' :
                      selectedClause.riskScore >= 25 ? 'text-yellow-600 dark:text-yellow-400 font-semibold' :
                      'text-green-600 dark:text-green-400 font-semibold'
                    }>
                      {selectedClause.riskScore}/100
                    </span>
                  </div>
                )}

                {/* Summary if available */}
                {selectedClause.diffSummary && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      {selectedClause.diffSummary}
                    </p>
                  </div>
                )}

                {/* Clause Content */}
                <div className="border rounded-lg p-4 bg-card">
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                    Revised Contract Text
                  </h4>
                  <div className="text-sm whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
                    {selectedClause.targetClause.content}
                  </div>
                </div>
              </div>
            ) : selectedClause?.status === 'missing' ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>This clause is missing from the revised contract.</p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No content available for this clause.</p>
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
