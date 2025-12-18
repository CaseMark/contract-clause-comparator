'use client';

import React, { useMemo } from 'react';
import * as Diff from 'diff';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DiffViewerProps {
  sourceText: string;
  targetText: string;
  sourceTitle?: string;
  targetTitle?: string;
  splitView?: boolean;
}

interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export function DiffViewer({
  sourceText,
  targetText,
  sourceTitle = 'Template',
  targetTitle = 'Redlined',
  splitView = true,
}: DiffViewerProps) {
  const diff = useMemo(() => {
    return Diff.diffWords(sourceText, targetText);
  }, [sourceText, targetText]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    let unchanged = 0;

    diff.forEach((part: DiffPart) => {
      const words = part.value.split(/\s+/).filter(Boolean).length;
      if (part.added) additions += words;
      else if (part.removed) deletions += words;
      else unchanged += words;
    });

    return { additions, deletions, unchanged };
  }, [diff]);

  if (splitView) {
    return (
      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-2 border-b bg-muted">
          <div className="px-4 py-2 border-r">
            <span className="font-medium">{sourceTitle}</span>
          </div>
          <div className="px-4 py-2">
            <span className="font-medium">{targetTitle}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 py-2 bg-muted border-b text-sm flex gap-4">
          <span className="text-green-600 dark:text-green-400">+{stats.additions} additions</span>
          <span className="text-red-600 dark:text-red-400">-{stats.deletions} deletions</span>
          <span className="text-muted-foreground">{stats.unchanged} unchanged</span>
        </div>

        {/* Content */}
        <div className="grid grid-cols-2">
          {/* Source (with deletions highlighted) */}
          <div className="p-4 border-r bg-card font-mono text-sm leading-relaxed overflow-auto max-h-[600px]">
            {diff.map((part: DiffPart, index: number) => {
              if (part.added) return null;
              return (
                <span
                  key={index}
                  className={cn(
                    part.removed && 'bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-300'
                  )}
                >
                  {part.value}
                </span>
              );
            })}
          </div>

          {/* Target (with additions highlighted) */}
          <div className="p-4 bg-card font-mono text-sm leading-relaxed overflow-auto max-h-[600px]">
            {diff.map((part: DiffPart, index: number) => {
              if (part.removed) return null;
              return (
                <span
                  key={index}
                  className={cn(
                    part.added && 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                  )}
                >
                  {part.value}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Unified view
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-muted border-b">
        <span className="font-medium">
          {sourceTitle} → {targetTitle}
        </span>
      </div>

      {/* Stats */}
      <div className="px-4 py-2 bg-muted border-b text-sm flex gap-4">
        <span className="text-green-600 dark:text-green-400">+{stats.additions} additions</span>
        <span className="text-red-600 dark:text-red-400">-{stats.deletions} deletions</span>
        <span className="text-muted-foreground">{stats.unchanged} unchanged</span>
      </div>

      {/* Content */}
      <div className="p-4 bg-card font-mono text-sm leading-relaxed overflow-auto max-h-[600px]">
        {diff.map((part: DiffPart, index: number) => (
          <span
            key={index}
            className={cn(
              part.added && 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
              part.removed && 'bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-300'
            )}
          >
            {part.value}
          </span>
        ))}
      </div>
    </div>
  );
}

// Clause-specific diff viewer with risk indicator
interface ClauseDiffViewerProps {
  sourceClause: string;
  targetClause: string;
  clauseType: string;
  riskScore?: number;
  riskSummary?: string;
  status: string;
}

export function ClauseDiffViewer({
  sourceClause,
  targetClause,
  clauseType,
  riskScore,
  riskSummary,
  status,
}: ClauseDiffViewerProps) {
  const getRiskColor = (score: number) => {
    if (score >= 75) return 'border-l-red-500 bg-red-50 dark:bg-red-950/20';
    if (score >= 50) return 'border-l-orange-500 bg-orange-50 dark:bg-orange-950/20';
    if (score >= 25) return 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20';
    return 'border-l-green-500 bg-green-50 dark:bg-green-950/20';
  };

  const getStatusBadge = (status: string): { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; label: string } => {
    const badges: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; label: string }> = {
      identical: { variant: 'success', label: 'Identical' },
      minor_change: { variant: 'warning', label: 'Minor Changes' },
      significant_change: { variant: 'danger', label: 'Significant Changes' },
      missing: { variant: 'danger', label: 'Missing' },
      added: { variant: 'info', label: 'Added' },
    };
    return badges[status] || { variant: 'default', label: status };
  };

  const badge = getStatusBadge(status);

  return (
    <Card className={cn('border-l-4 overflow-hidden', riskScore !== undefined ? getRiskColor(riskScore) : 'border-l-border')}>
      {/* Header */}
      <CardHeader className="pb-3 bg-card border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="capitalize">
              {clauseType.replace(/_/g, ' ')}
            </CardTitle>
            <Badge variant={badge.variant}>
              {badge.label}
            </Badge>
          </div>
          {riskScore !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Risk Score:</span>
              <span className={cn(
                'font-bold',
                riskScore >= 75 ? 'text-red-600 dark:text-red-400' :
                riskScore >= 50 ? 'text-orange-600 dark:text-orange-400' :
                riskScore >= 25 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
              )}>
                {riskScore}/100
              </span>
            </div>
          )}
        </div>
      </CardHeader>

      {/* Risk Summary */}
      {riskSummary && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-950/30 border-b text-sm text-amber-800 dark:text-amber-200">
          ⚠️ {riskSummary}
        </div>
      )}

      {/* Diff Content */}
      <CardContent className="p-0">
        {status === 'missing' ? (
          <div className="p-4 bg-red-50 dark:bg-red-950/20">
            <p className="text-red-800 dark:text-red-200 font-medium mb-2">This clause is missing from the redlined version:</p>
            <div className="p-3 bg-card rounded border font-mono text-sm">
              {sourceClause}
            </div>
          </div>
        ) : status === 'added' ? (
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20">
            <p className="text-blue-800 dark:text-blue-200 font-medium mb-2">This clause was added in the redlined version:</p>
            <div className="p-3 bg-card rounded border font-mono text-sm">
              {targetClause}
            </div>
          </div>
        ) : status === 'identical' ? (
          <div className="p-4 bg-green-50 dark:bg-green-950/20">
            <p className="text-green-800 dark:text-green-200 font-medium mb-2">This clause is identical in both versions:</p>
            <div className="p-3 bg-card rounded border font-mono text-sm">
              {sourceClause}
            </div>
          </div>
        ) : (
          <DiffViewer
            sourceText={sourceClause}
            targetText={targetClause}
            sourceTitle="Template"
            targetTitle="Redlined"
            splitView={true}
          />
        )}
      </CardContent>
    </Card>
  );
}
