'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  PlusCircle,
  MinusCircle 
} from 'lucide-react';

interface ClauseComparison {
  id: string;
  clauseType: string;
  status: string;
  riskScore?: number | null;
  diffSummary?: string | null;
}

interface ClauseNavigatorProps {
  clauseComparisons: ClauseComparison[];
  selectedClauseType: string | null;
  onSelectClause: (clauseType: string) => void;
  horizontal?: boolean;
}

export function ClauseNavigator({
  clauseComparisons,
  selectedClauseType,
  onSelectClause,
  horizontal = false,
}: ClauseNavigatorProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'identical':
        return <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />;
      case 'minor_change':
        return <AlertTriangle className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />;
      case 'significant_change':
        return <AlertTriangle className="h-4 w-4 text-orange-500 dark:text-orange-400" />;
      case 'missing':
        return <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />;
      case 'added':
        return <PlusCircle className="h-4 w-4 text-blue-500 dark:text-blue-400" />;
      default:
        return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getChangeBadgeVariant = (changeScore: number): 'success' | 'warning' | 'danger' | 'default' => {
    if (changeScore >= 75) return 'danger';
    if (changeScore >= 50) return 'warning';
    if (changeScore >= 25) return 'warning';
    return 'success';
  };

  const formatClauseType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Sort clauses: significant changes first, then by risk score
  const sortedClauses = [...clauseComparisons].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      significant_change: 0,
      missing: 1,
      minor_change: 2,
      added: 3,
      identical: 4,
    };
    
    const aOrder = statusOrder[a.status] ?? 5;
    const bOrder = statusOrder[b.status] ?? 5;
    
    if (aOrder !== bOrder) return aOrder - bOrder;
    
    // Then by risk score (higher first)
    const aRisk = a.riskScore ?? 0;
    const bRisk = b.riskScore ?? 0;
    return bRisk - aRisk;
  });

  const stats = {
    total: clauseComparisons.length,
    identical: clauseComparisons.filter(c => c.status === 'identical').length,
    changed: clauseComparisons.filter(c => 
      c.status === 'minor_change' || c.status === 'significant_change'
    ).length,
    missing: clauseComparisons.filter(c => c.status === 'missing').length,
    added: clauseComparisons.filter(c => c.status === 'added').length,
  };

  if (horizontal) {
    return (
      <div className="bg-card rounded-lg border shadow-sm">
        {/* Header with Stats */}
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Clause Analysis</h3>
            <p className="text-sm text-muted-foreground">{stats.total} clauses analyzed</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-green-600 dark:text-green-400">{stats.identical}</span>
              <span className="text-muted-foreground">identical</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-orange-600 dark:text-orange-400">{stats.changed}</span>
              <span className="text-muted-foreground">changed</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-red-600 dark:text-red-400">{stats.missing}</span>
              <span className="text-muted-foreground">missing</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-blue-600 dark:text-blue-400">{stats.added}</span>
              <span className="text-muted-foreground">added</span>
            </div>
          </div>
        </div>

        {/* Horizontal Clause Pills - Max 3 rows with scroll */}
        <div className="p-4 overflow-y-auto max-h-[180px]">
          <div className="flex gap-2 flex-wrap">
            {sortedClauses.map((clause) => (
              <button
                key={clause.id}
                onClick={() => onSelectClause(clause.clauseType)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm',
                  selectedClauseType === clause.clauseType
                    ? 'bg-accent border-accent-foreground/20'
                    : 'bg-background hover:bg-muted/50'
                )}
              >
                {getStatusIcon(clause.status)}
                <span className="font-medium whitespace-nowrap">
                  {formatClauseType(clause.clauseType)}
                </span>
                {clause.riskScore !== null && clause.riskScore !== undefined && clause.riskScore > 0 && (
                  <Badge variant={getChangeBadgeVariant(clause.riskScore)} className="text-xs ml-1">
                    {clause.riskScore}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Vertical layout (original)
  return (
    <div className="bg-card rounded-lg border shadow-sm">
      {/* Header */}
      <div className="p-4 border-b">
        <h3 className="font-semibold">Clause Navigator</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {stats.total} clauses analyzed
        </p>
      </div>

      {/* Stats Summary */}
      <div className="px-4 py-3 border-b">
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <div className="font-semibold text-green-600 dark:text-green-400">{stats.identical}</div>
            <div className="text-muted-foreground">Identical</div>
          </div>
          <div>
            <div className="font-semibold text-orange-600 dark:text-orange-400">{stats.changed}</div>
            <div className="text-muted-foreground">Changed</div>
          </div>
          <div>
            <div className="font-semibold text-red-600 dark:text-red-400">{stats.missing}</div>
            <div className="text-muted-foreground">Missing</div>
          </div>
          <div>
            <div className="font-semibold text-blue-600 dark:text-blue-400">{stats.added}</div>
            <div className="text-muted-foreground">Added</div>
          </div>
        </div>
      </div>

      {/* Clause List */}
      <div className="max-h-[500px] overflow-y-auto">
        {sortedClauses.map((clause) => (
          <button
            key={clause.id}
            onClick={() => onSelectClause(clause.clauseType)}
            className={cn(
              'w-full text-left px-4 py-3 border-b transition-colors',
              selectedClauseType === clause.clauseType
                ? 'bg-accent'
                : 'hover:bg-muted/50'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(clause.status)}
                <span className="font-medium text-sm">
                  {formatClauseType(clause.clauseType)}
                </span>
              </div>
              {clause.riskScore !== null && clause.riskScore !== undefined && clause.riskScore > 0 && (
                <Badge variant={getChangeBadgeVariant(clause.riskScore)} className="text-xs">
                  {clause.riskScore}
                </Badge>
              )}
            </div>
            {clause.diffSummary && clause.status !== 'identical' && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {clause.diffSummary}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
