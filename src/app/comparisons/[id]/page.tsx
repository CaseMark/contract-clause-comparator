'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, ArrowLeft, Loader2, AlertCircle, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DiffViewer, ClauseDiffViewer } from '@/components/diff/DiffViewer';
import { ClauseNavigator } from '@/components/comparison/ClauseNavigator';
import { ExecutiveSummary } from '@/components/comparison/ExecutiveSummary';
import { cn } from '@/lib/utils';

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

interface ComparisonResult {
  id: string;
  name: string | null;
  comparisonStatus: 'pending' | 'processing' | 'completed' | 'failed';
  overallRiskScore: number | null;
  summary: string | null;
  errorMessage: string | null;
  createdAt: string;
  sourceContract: { 
    id: string;
    name: string; 
    rawText: string | null;
    filename: string;
  };
  targetContract: { 
    id: string;
    name: string; 
    rawText: string | null;
    filename: string;
  };
  clauseComparisons: ClauseComparisonResult[];
}

export default function ComparisonDetailPage() {
  const params = useParams();
  const comparisonId = params.id as string;
  
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [selectedClauseType, setSelectedClauseType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  useEffect(() => {
    if (comparisonId) {
      fetchComparison();
    }
  }, [comparisonId]);

  // Poll for updates if comparison is still processing
  useEffect(() => {
    if (!comparison || comparison.comparisonStatus === 'completed' || comparison.comparisonStatus === 'failed') {
      return;
    }

    const interval = setInterval(() => {
      fetchComparison(false); // Don't show loading spinner during polling
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [comparison?.comparisonStatus]);

  // Auto-select highest risk clause when comparison loads
  useEffect(() => {
    if (comparison?.clauseComparisons) {
      const highestRiskClause = [...comparison.clauseComparisons]
        .filter(c => c.riskScore !== null && c.riskScore > 0)
        .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))[0];
      
      if (highestRiskClause) {
        setSelectedClauseType(highestRiskClause.clauseType);
      } else {
        // If no risk scores, select first non-identical clause
        const firstChanged = comparison.clauseComparisons.find(c => c.status !== 'identical');
        if (firstChanged) {
          setSelectedClauseType(firstChanged.clauseType);
        } else if (comparison.clauseComparisons.length > 0) {
          setSelectedClauseType(comparison.clauseComparisons[0].clauseType);
        }
      }
    }
  }, [comparison]);

  const fetchComparison = async (showLoading = true) => {
    try {
      // Only show loading state on initial load, not during polling
      if (showLoading && !comparison) {
        setIsLoading(true);
      }
      const response = await fetch(`/api/compare/${comparisonId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch comparison');
      }
      
      setComparison(data.comparison);
    } catch (err) {
      console.error('Error fetching comparison:', err);
      setError(err instanceof Error ? err.message : 'Failed to load comparison');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditingTitle = () => {
    setEditedTitle(comparison?.name || '');
    setIsEditingTitle(true);
  };

  const cancelEditingTitle = () => {
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  const saveTitle = async () => {
    if (!comparison) return;
    
    setIsSavingTitle(true);
    try {
      const response = await fetch(`/api/compare/${comparison.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editedTitle.trim() || null }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update title');
      }
      
      // Update local state
      setComparison(prev => prev ? { ...prev, name: editedTitle.trim() || null } : null);
      setIsEditingTitle(false);
    } catch (err) {
      console.error('Error saving title:', err);
      alert('Failed to save title');
    } finally {
      setIsSavingTitle(false);
    }
  };

  const selectedClauseComparison = comparison?.clauseComparisons.find(
    c => c.clauseType === selectedClauseType
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRiskLevel = (score: number): { label: string; variant: 'danger' | 'warning' | 'success' } => {
    if (score >= 75) return { label: 'High', variant: 'danger' };
    if (score >= 50) return { label: 'Elevated', variant: 'warning' };
    if (score >= 25) return { label: 'Moderate', variant: 'warning' };
    return { label: 'Low', variant: 'success' };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <main className="container max-w-7xl py-8">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
            <span className="ml-3 text-muted-foreground">Loading comparison...</span>
          </div>
        </main>
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="min-h-screen bg-muted/30">
        <main className="container max-w-4xl py-8">
          <div className="mb-6">
            <Button variant="ghost" asChild>
              <Link href="/comparisons">
                <ArrowLeft className="h-4 w-4" />
                Back to Comparisons
              </Link>
            </Button>
          </div>
          
          <Card>
            <CardContent className="py-16 text-center">
              <AlertCircle className="h-12 w-12 text-destructive/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {error || 'Comparison not found'}
              </h3>
              <p className="text-muted-foreground mb-6">
                The comparison you're looking for doesn't exist or couldn't be loaded.
              </p>
              <Button asChild>
                <Link href="/comparisons">View All Comparisons</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Show processing state - don't allow viewing incomplete comparisons
  if (comparison.comparisonStatus === 'processing' || comparison.comparisonStatus === 'pending') {
    return (
      <div className="min-h-screen bg-muted/30">
        <main className="container max-w-4xl py-8">
          <div className="mb-6">
            <Button variant="ghost" asChild>
              <Link href="/comparisons">
                <ArrowLeft className="h-4 w-4" />
                Back to Comparisons
              </Link>
            </Button>
          </div>
          
          <Card>
            <CardContent className="py-16 text-center space-y-6">
              <div className="relative">
                <Loader2 className="h-16 w-16 text-primary animate-spin mx-auto" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-8 w-8 rounded-full bg-primary/10" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">
                  Comparison in Progress
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  We're analyzing your contracts, extracting clauses, and calculating risk scores. 
                  This usually takes 30-60 seconds.
                </p>
              </div>
              
              {/* Contract info */}
              <div className="bg-muted/50 rounded-lg p-4 max-w-sm mx-auto">
                <p className="text-sm text-muted-foreground mb-1">Comparing</p>
                <div className="flex items-center justify-center gap-2 text-sm font-medium">
                  <span>{comparison.sourceContract?.name || 'Original'}</span>
                  <ArrowLeft className="h-3 w-3 rotate-180" />
                  <span>{comparison.targetContract?.name || 'Revised'}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span>Auto-refreshing every 3 seconds...</span>
              </div>
              
              <Button variant="outline" asChild>
                <Link href="/comparisons">
                  View All Comparisons
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Show failed state
  if (comparison.comparisonStatus === 'failed') {
    return (
      <div className="min-h-screen bg-muted/30">
        <main className="container max-w-4xl py-8">
          <div className="mb-6">
            <Button variant="ghost" asChild>
              <Link href="/comparisons">
                <ArrowLeft className="h-4 w-4" />
                Back to Comparisons
              </Link>
            </Button>
          </div>
          
          <Card className="border-destructive/30">
            <CardContent className="py-16 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                Comparison Failed
              </h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                {comparison.errorMessage || 'An error occurred while processing this comparison.'}
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" asChild>
                  <Link href="/comparisons">View All Comparisons</Link>
                </Button>
                <Button asChild>
                  <Link href="/">Try Again</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="container max-w-7xl py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <Link href="/comparisons" className="hover:text-foreground transition-colors">
            Past Comparisons
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">
            {comparison.name || 'Comparison Details'}
          </span>
        </nav>

        <div className="space-y-6">
          {/* Header with reset button and risk score */}
          <div className="flex items-center justify-between">
            <div>
              {/* Editable Title */}
              {isEditingTitle ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    placeholder="Enter comparison title..."
                    className="text-2xl font-bold tracking-tight bg-transparent border-b-2 border-primary focus:outline-none px-1 py-0.5 min-w-[200px]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTitle();
                      if (e.key === 'Escape') cancelEditingTitle();
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={saveTitle}
                    disabled={isSavingTitle}
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                  >
                    {isSavingTitle ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={cancelEditingTitle}
                    disabled={isSavingTitle}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {comparison.name || 'Comparison Results'}
                  </h1>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={startEditingTitle}
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <p className="text-muted-foreground">
                {comparison.sourceContract.name} → {comparison.targetContract.name}
              </p>
              <p className="text-sm text-muted-foreground">
                Created {formatDate(comparison.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Overall Risk Score */}
              <div className="flex items-center gap-3 px-4 py-2 bg-card rounded-lg border">
                <div className="text-sm text-muted-foreground">Risk Score</div>
                <span className={cn(
                  'text-xl font-bold',
                  (comparison.overallRiskScore || 0) >= 75 ? 'text-red-600 dark:text-red-400' :
                  (comparison.overallRiskScore || 0) >= 50 ? 'text-orange-600 dark:text-orange-400' :
                  (comparison.overallRiskScore || 0) >= 25 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-green-600 dark:text-green-400'
                )}>
                  {comparison.overallRiskScore || 0}
                </span>
                <Badge variant={getRiskLevel(comparison.overallRiskScore || 0).variant}>
                  {getRiskLevel(comparison.overallRiskScore || 0).label}
                </Badge>
              </div>
              <Button variant="outline" asChild>
                <Link href="/">New Comparison</Link>
              </Button>
            </div>
          </div>

          {/* Horizontal Clause Navigator at Top */}
          <ClauseNavigator
            clauseComparisons={comparison.clauseComparisons}
            selectedClauseType={selectedClauseType}
            onSelectClause={setSelectedClauseType}
            horizontal={true}
          />

          {/* Clause Details */}
          {selectedClauseComparison ? (
            <ClauseDiffViewer
              sourceClause={selectedClauseComparison.sourceClause?.content || ''}
              targetClause={selectedClauseComparison.targetClause?.content || ''}
              clauseType={selectedClauseComparison.clauseType}
              riskScore={selectedClauseComparison.riskScore || undefined}
              riskSummary={selectedClauseComparison.diffSummary || undefined}
              status={selectedClauseComparison.status}
            />
          ) : (
            <Card className="flex items-center justify-center">
              <CardContent className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Select a clause from above to view details
                </p>
              </CardContent>
            </Card>
          )}

          {/* Executive Summary with clickable clause links */}
          {comparison.summary && (
            <ExecutiveSummary
              summary={comparison.summary}
              clauseComparisons={comparison.clauseComparisons}
              targetContractName={comparison.targetContract.name}
            />
          )}

          {/* Full Document Diff - Collapsible */}
          <details className="group">
            <summary className="cursor-pointer list-none">
              <Card className="hover:bg-muted/50 transition-colors">
                <CardHeader className="py-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    Full Document Comparison
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      (click to expand)
                    </span>
                  </CardTitle>
                </CardHeader>
              </Card>
            </summary>
            <Card className="mt-2">
              <CardContent className="pt-6">
                <DiffViewer
                  sourceText={comparison.sourceContract.rawText || ''}
                  targetText={comparison.targetContract.rawText || ''}
                  sourceTitle={comparison.sourceContract.name}
                  targetTitle={comparison.targetContract.name}
                  splitView={true}
                />
              </CardContent>
            </Card>
          </details>
        </div>
      </main>
    </div>
  );
}
