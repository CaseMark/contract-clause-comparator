'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, BarChart3, TrendingUp, FileWarning } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ClauseComparison {
  id: string;
  clauseType: string;
  status: string;
  riskScore?: number | null;
  deviationPercentage?: number | null;
  diffSummary?: string | null;
  riskFactors?: string[] | null;
}

interface RiskDashboardProps {
  overallRiskScore: number;
  summary?: string | null;
  clauseComparisons: ClauseComparison[];
  sourceContractName: string;
  targetContractName: string;
}

export function RiskDashboard({
  overallRiskScore,
  summary,
  clauseComparisons,
  sourceContractName,
  targetContractName,
}: RiskDashboardProps) {
  const getChangeLevel = (score: number): { label: string; variant: 'danger' | 'warning' | 'success' } => {
    if (score >= 75) return { label: 'Substantial', variant: 'danger' };
    if (score >= 50) return { label: 'Significant', variant: 'danger' };
    if (score >= 25) return { label: 'Moderate', variant: 'warning' };
    return { label: 'Minor', variant: 'success' };
  };

  const getChangeColor = (score: number) => {
    if (score >= 75) return 'text-red-600 dark:text-red-400';
    if (score >= 50) return 'text-orange-600 dark:text-orange-400';
    if (score >= 25) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getChangeBorderColor = (score: number) => {
    if (score >= 75) return 'border-l-red-500';
    if (score >= 50) return 'border-l-orange-500';
    if (score >= 25) return 'border-l-yellow-500';
    return 'border-l-green-500';
  };

  const getChangeBgColor = (score: number) => {
    if (score >= 75) return 'bg-red-500';
    if (score >= 50) return 'bg-orange-500';
    if (score >= 25) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const changeLevel = getChangeLevel(overallRiskScore);

  // Get top changed clauses
  const topChangedClauses = clauseComparisons
    .filter(c => c.riskScore && c.riskScore > 0)
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
    .slice(0, 5);

  // Collect all change factors
  const allChangeFactors = clauseComparisons
    .flatMap(c => c.riskFactors || [])
    .filter((factor, index, self) => self.indexOf(factor) === index)
    .slice(0, 8);

  const formatClauseType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="space-y-4">
      {/* Overall Significant Changes Score */}
      <Card className={cn('border-l-4', getChangeBorderColor(overallRiskScore))}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Change Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-muted-foreground">Significant Changes Score</div>
              <div className={cn('text-4xl font-bold', getChangeColor(overallRiskScore))}>
                {overallRiskScore}
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
            </div>
            <Badge variant={changeLevel.variant} className="text-sm px-3 py-1">
              {changeLevel.label} Changes
            </Badge>
          </div>

          {/* Change Meter */}
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                'h-full transition-all duration-500',
                getChangeBgColor(overallRiskScore)
              )}
              style={{ width: `${overallRiskScore}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Minor</span>
            <span>Moderate</span>
            <span>Significant</span>
            <span>Substantial</span>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Info */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{sourceContractName}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-medium">{targetContractName}</span>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      {summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileWarning className="h-5 w-5" />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Most Changed Clauses */}
      {topChangedClauses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Most Changed Clauses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topChangedClauses.map((clause) => {
                const clauseChange = getChangeLevel(clause.riskScore || 0);
                return (
                  <div 
                    key={clause.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium">
                        {formatClauseType(clause.clauseType)}
                      </div>
                      {clause.deviationPercentage && (
                        <div className="text-xs text-muted-foreground">
                          {clause.deviationPercentage}% deviation from standard
                        </div>
                      )}
                    </div>
                    <Badge variant={clauseChange.variant}>
                      {clause.riskScore}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Change Factors */}
      {allChangeFactors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Key Change Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {allChangeFactors.map((factor, index) => (
                <li 
                  key={index}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="text-orange-500 dark:text-orange-400 mt-0.5">•</span>
                  {factor}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
