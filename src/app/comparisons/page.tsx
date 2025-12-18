'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { History, FileText, ArrowRight, Loader2, Trash2, AlertCircle, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface Comparison {
  id: string;
  name: string | null;
  comparisonType: string;
  comparisonStatus: string;
  overallRiskScore: number | null;
  summary: string | null;
  createdAt: string;
  sourceContract: {
    id: string;
    name: string;
    filename: string;
  };
  targetContract: {
    id: string;
    name: string;
    filename: string;
  };
}

export default function PastComparisonsPage() {
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchComparisons();
  }, []);

  // Use SSE for real-time updates when there are processing comparisons
  useEffect(() => {
    const processingIds = comparisons
      .filter(c => c.comparisonStatus === 'processing')
      .map(c => c.id);
    
    if (processingIds.length === 0) return;

    // Connect to SSE stream for status updates
    const eventSource = new EventSource(`/api/compare/stream?ids=${processingIds.join(',')}`);
    
    eventSource.addEventListener('status', (event) => {
      try {
        const update = JSON.parse(event.data);
        setComparisons(prev => prev.map(c => 
          c.id === update.id 
            ? { 
                ...c, 
                comparisonStatus: update.status,
                overallRiskScore: update.overallRiskScore ?? c.overallRiskScore,
              }
            : c
        ));
        
        // If a comparison just completed, fetch fresh data to get all details
        if (update.status === 'completed' || update.status === 'failed') {
          fetchComparisons();
        }
      } catch (err) {
        console.error('Error parsing SSE status:', err);
      }
    });

    eventSource.addEventListener('error', () => {
      // SSE connection error - fall back to fetch
      console.warn('SSE connection error, refreshing...');
      eventSource.close();
      fetchComparisons();
    });

    eventSource.addEventListener('done', () => {
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, [comparisons.filter(c => c.comparisonStatus === 'processing').map(c => c.id).join(',')]);

  const fetchComparisons = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/compare');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch comparisons');
      }
      
      // Sort by most recent first
      const sortedComparisons = (data.comparisons || []).sort((a: Comparison, b: Comparison) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      setComparisons(sortedComparisons);
    } catch (err) {
      console.error('Error fetching comparisons:', err);
      setError(err instanceof Error ? err.message : 'Failed to load comparisons');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter comparisons based on search query
  const filteredComparisons = useMemo(() => {
    if (!searchQuery.trim()) return comparisons;
    
    const query = searchQuery.toLowerCase();
    return comparisons.filter(comparison => {
      const searchableText = [
        comparison.name,
        comparison.sourceContract?.name,
        comparison.targetContract?.name,
        comparison.sourceContract?.filename,
        comparison.targetContract?.filename,
        comparison.summary,
      ].filter(Boolean).join(' ').toLowerCase();
      
      return searchableText.includes(query);
    });
  }, [comparisons, searchQuery]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this comparison?')) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await fetch(`/api/compare/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete comparison');
      }
      
      setComparisons(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Error deleting comparison:', err);
      alert('Failed to delete comparison');
    } finally {
      setDeletingId(null);
    }
  };

  const getRiskBadge = (score: number | null) => {
    if (score === null) return { variant: 'secondary' as const, label: 'N/A' };
    if (score >= 75) return { variant: 'danger' as const, label: 'Critical' };
    if (score >= 50) return { variant: 'warning' as const, label: 'High' };
    if (score >= 25) return { variant: 'warning' as const, label: 'Medium' };
    return { variant: 'success' as const, label: 'Low' };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <main className="container max-w-4xl py-8">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
            <span className="ml-3 text-muted-foreground">Loading comparisons...</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="container max-w-4xl py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <History className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Past Comparisons</h1>
          </div>
          <p className="text-muted-foreground">
            View and manage your previous contract clause comparisons.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Search Input */}
        {comparisons.length > 0 && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search comparisons by name, contract, or summary..."
                className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            {searchQuery && (
              <p className="text-sm text-muted-foreground mt-2">
                Found {filteredComparisons.length} of {comparisons.length} comparisons
              </p>
            )}
          </div>
        )}

        {comparisons.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No comparisons yet
              </h3>
              <p className="text-muted-foreground mb-6">
                Start by comparing your first set of contracts.
              </p>
              <Button asChild>
                <Link href="/">
                  New Comparison
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : filteredComparisons.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No matching comparisons
              </h3>
              <p className="text-muted-foreground">
                Try adjusting your search query.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredComparisons.map((comparison) => {
              const riskBadge = getRiskBadge(comparison.overallRiskScore);
              // Calculate comparison number (based on position in full list, sorted by date)
              const comparisonNumber = comparisons.length - comparisons.findIndex(c => c.id === comparison.id);
              const displayTitle = comparison.name || `Comparison_${String(comparisonNumber).padStart(2, '0')}`;
              const isProcessing = comparison.comparisonStatus === 'processing';
              const isFailed = comparison.comparisonStatus === 'failed';
              
              // Render processing comparisons with greyed-out style (not clickable until complete)
              if (isProcessing) {
                return (
                  <div key={comparison.id} className="block">
                    <Card className={cn(
                      "transition-all border-dashed",
                      "bg-muted/30 opacity-75"
                    )}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-3">
                            {/* Comparison Title with Processing Status */}
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-lg truncate text-muted-foreground">
                                {displayTitle}
                              </h3>
                              <Badge variant="secondary" className="text-xs flex items-center gap-1 bg-primary/10 text-primary border-primary/20">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Processing
                              </Badge>
                            </div>

                            {/* Contract Names */}
                            <div className="flex items-center gap-2 text-sm text-muted-foreground/70 flex-wrap">
                              <FileText className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">
                                {comparison.sourceContract?.name || 'Unknown'}
                              </span>
                              <ArrowRight className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">
                                {comparison.targetContract?.name || 'Unknown'}
                              </span>
                            </div>

                            {/* Processing Message */}
                            <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
                              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                              <span>Analyzing clauses and calculating risk...</span>
                            </div>

                            {/* Date */}
                            <div className="text-xs text-muted-foreground/60">
                              Started {formatDate(comparison.createdAt)}
                            </div>
                          </div>

                          {/* Pending Risk Score */}
                          <div className="flex items-center gap-3">
                            <div className="text-center space-y-1">
                              <div className="text-2xl font-bold tabular-nums text-muted-foreground/40">
                                —
                              </div>
                              <Badge variant="secondary" className="opacity-60">
                                Pending
                              </Badge>
                            </div>

                            {/* Delete Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handleDelete(comparison.id, e)}
                              disabled={deletingId === comparison.id}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              {deletingId === comparison.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              }
              
              return (
                <Link 
                  key={comparison.id} 
                  href={`/comparisons/${comparison.id}`}
                  className="block group"
                >
                  <Card className={cn(
                    "transition-all hover:shadow-md hover:border-muted-foreground/20",
                    isFailed && "border-destructive/30 bg-destructive/5"
                  )}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-3">
                          {/* Comparison Title with Status */}
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg truncate">
                              {displayTitle}
                            </h3>
                            {isFailed && (
                              <Badge variant="danger" className="text-xs flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Failed
                              </Badge>
                            )}
                          </div>

                          {/* Contract Names */}
                          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                            <FileText className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">
                              {comparison.sourceContract?.name || 'Unknown'}
                            </span>
                            <ArrowRight className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              {comparison.targetContract?.name || 'Unknown'}
                            </span>
                          </div>

                          {/* Summary Preview */}
                          {comparison.summary && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {comparison.summary}
                            </p>
                          )}

                          {/* Date */}
                          <div className="text-xs text-muted-foreground">
                            {formatDate(comparison.createdAt)}
                          </div>
                        </div>

                        {/* Risk Score & Actions */}
                        <div className="flex items-center gap-3">
                          {/* Risk Badge */}
                          <div className="text-center space-y-1">
                            <div className={cn(
                              'text-2xl font-bold tabular-nums',
                              comparison.overallRiskScore !== null && comparison.overallRiskScore >= 75 ? 'text-red-600 dark:text-red-400' :
                              comparison.overallRiskScore !== null && comparison.overallRiskScore >= 50 ? 'text-orange-600 dark:text-orange-400' :
                              comparison.overallRiskScore !== null && comparison.overallRiskScore >= 25 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-green-600 dark:text-green-400'
                            )}>
                              {comparison.overallRiskScore ?? '—'}
                            </div>
                            <Badge variant={riskBadge.variant}>
                              {riskBadge.label}
                            </Badge>
                          </div>

                          {/* Delete Button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleDelete(comparison.id, e)}
                            disabled={deletingId === comparison.id}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            {deletingId === comparison.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* New Comparison CTA */}
        {comparisons.length > 0 && (
          <div className="mt-8 text-center">
            <Button variant="outline" asChild>
              <Link href="/">
                <FileText className="h-4 w-4 text-muted-foreground" />
                New Comparison
              </Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
