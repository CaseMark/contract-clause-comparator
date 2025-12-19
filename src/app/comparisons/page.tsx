'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  FolderOpen, 
  FileText, 
  ArrowRight, 
  Loader2, 
  Trash2, 
  AlertCircle, 
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  Calendar,
  Tag,
  ChevronDown
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface SemanticTag {
  label: string;
  category: 'contract_type' | 'industry' | 'risk_level' | 'key_terms' | 'parties' | 'status';
  confidence: number;
}

interface Comparison {
  id: string;
  name: string | null;
  comparisonType: string;
  comparisonStatus: string;
  overallRiskScore: number | null;
  summary: string | null;
  semanticTags: string | null;
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

type ViewMode = 'card' | 'list';
type SortOption = 'date_newest' | 'date_oldest' | 'name_asc' | 'name_desc' | 'risk_high' | 'risk_low';

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'date_newest', label: 'Date (Newest)' },
  { value: 'date_oldest', label: 'Date (Oldest)' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
  { value: 'risk_high', label: 'Risk (High to Low)' },
  { value: 'risk_low', label: 'Risk (Low to High)' },
];

const tagCategoryColors: Record<SemanticTag['category'], string> = {
  contract_type: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  industry: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  risk_level: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  key_terms: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  parties: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  status: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export default function MyComparisonsPage() {
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [sortBy, setSortBy] = useState<SortOption>('date_newest');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

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
      
      setComparisons(data.comparisons || []);
    } catch (err) {
      console.error('Error fetching comparisons:', err);
      setError(err instanceof Error ? err.message : 'Failed to load comparisons');
    } finally {
      setIsLoading(false);
    }
  };

  // Get all unique tags from comparisons
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    comparisons.forEach(comparison => {
      if (comparison.semanticTags) {
        try {
          const tags = JSON.parse(comparison.semanticTags) as SemanticTag[];
          tags.forEach(tag => tagSet.add(tag.label));
        } catch {
          // Ignore parse errors
        }
      }
    });
    return Array.from(tagSet).sort();
  }, [comparisons]);

  // Filter and sort comparisons
  const filteredAndSortedComparisons = useMemo(() => {
    let result = [...comparisons];
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(comparison => {
        const searchableText = [
          comparison.name,
          comparison.sourceContract?.name,
          comparison.targetContract?.name,
          comparison.sourceContract?.filename,
          comparison.targetContract?.filename,
          comparison.summary,
        ].filter(Boolean).join(' ').toLowerCase();
        
        // Also search in tags
        let tagText = '';
        if (comparison.semanticTags) {
          try {
            const tags = JSON.parse(comparison.semanticTags) as SemanticTag[];
            tagText = tags.map(t => t.label).join(' ').toLowerCase();
          } catch {
            // Ignore parse errors
          }
        }
        
        return searchableText.includes(query) || tagText.includes(query);
      });
    }
    
    // Filter by selected tags
    if (selectedTags.length > 0) {
      result = result.filter(comparison => {
        if (!comparison.semanticTags) return false;
        try {
          const tags = JSON.parse(comparison.semanticTags) as SemanticTag[];
          const tagLabels = tags.map(t => t.label);
          return selectedTags.some(selected => tagLabels.includes(selected));
        } catch {
          return false;
        }
      });
    }
    
    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date_newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'date_oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name_asc': {
          const nameA = a.name || `Comparison_${comparisons.indexOf(a)}`;
          const nameB = b.name || `Comparison_${comparisons.indexOf(b)}`;
          return nameA.localeCompare(nameB);
        }
        case 'name_desc': {
          const nameA = a.name || `Comparison_${comparisons.indexOf(a)}`;
          const nameB = b.name || `Comparison_${comparisons.indexOf(b)}`;
          return nameB.localeCompare(nameA);
        }
        case 'risk_high':
          return (b.overallRiskScore ?? -1) - (a.overallRiskScore ?? -1);
        case 'risk_low':
          return (a.overallRiskScore ?? 101) - (b.overallRiskScore ?? 101);
        default:
          return 0;
      }
    });
    
    return result;
  }, [comparisons, searchQuery, sortBy, selectedTags]);

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
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const parseSemanticTags = (tagsJson: string | null): SemanticTag[] => {
    if (!tagsJson) return [];
    try {
      return JSON.parse(tagsJson) as SemanticTag[];
    } catch {
      return [];
    }
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const getDisplayTitle = (comparison: Comparison) => {
    if (comparison.name) return comparison.name;
    const index = comparisons.findIndex(c => c.id === comparison.id);
    return `Comparison_${String(comparisons.length - index).padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <main className="container max-w-6xl py-8">
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
      <main className="container max-w-6xl py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">My Comparisons</h1>
                <p className="text-muted-foreground">
                  View and manage your contract clause comparisons.
                </p>
              </div>
            </div>
            <Button asChild>
              <Link href="/">
                <FileText className="h-4 w-4" />
                New Comparison
              </Link>
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Toolbar */}
        {comparisons.length > 0 && (
          <div className="mb-6 space-y-4">
            {/* Search and View Controls */}
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, contract, tags, or summary..."
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              
              {/* Sort Dropdown */}
              <div className="relative">
                <Button
                  variant="outline"
                  className="w-full sm:w-[180px] justify-between"
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                >
                  <span className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4" />
                    {sortOptions.find(o => o.value === sortBy)?.label}
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                {showSortDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowSortDropdown(false)} 
                    />
                    <div className="absolute right-0 top-full mt-1 z-20 w-[180px] rounded-md border bg-background shadow-lg">
                      {sortOptions.map(option => (
                        <button
                          key={option.value}
                          className={cn(
                            "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                            sortBy === option.value && "bg-muted font-medium"
                          )}
                          onClick={() => {
                            setSortBy(option.value);
                            setShowSortDropdown(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              
              {/* View Toggle */}
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="rounded-r-none"
                  onClick={() => setViewMode('card')}
                  title="Card view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="rounded-l-none"
                  onClick={() => setViewMode('list')}
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Tag Filters */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground mr-2">Filter by tag:</span>
                {allTags.slice(0, 10).map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTagFilter(tag)}
                    className={cn(
                      "px-2 py-1 text-xs rounded-full border transition-colors",
                      selectedTags.includes(tag)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    )}
                  >
                    {tag}
                  </button>
                ))}
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
            
            {/* Results count */}
            {(searchQuery || selectedTags.length > 0) && (
              <p className="text-sm text-muted-foreground">
                Showing {filteredAndSortedComparisons.length} of {comparisons.length} comparisons
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
        ) : filteredAndSortedComparisons.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No matching comparisons
              </h3>
              <p className="text-muted-foreground">
                Try adjusting your search query or filters.
              </p>
            </CardContent>
          </Card>
        ) : viewMode === 'card' ? (
          /* Card View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAndSortedComparisons.map((comparison) => {
              const riskBadge = getRiskBadge(comparison.overallRiskScore);
              const displayTitle = getDisplayTitle(comparison);
              const isProcessing = comparison.comparisonStatus === 'processing';
              const isFailed = comparison.comparisonStatus === 'failed';
              const tags = parseSemanticTags(comparison.semanticTags);
              
              return (
                <Link 
                  key={comparison.id} 
                  href={isProcessing ? '#' : `/comparisons/${comparison.id}`}
                  className={cn("block group", isProcessing && "pointer-events-none")}
                >
                  <Card className={cn(
                    "h-full transition-all hover:shadow-md hover:border-muted-foreground/20",
                    isProcessing && "border-dashed bg-muted/30 opacity-75",
                    isFailed && "border-destructive/30 bg-destructive/5"
                  )}>
                    <CardContent className="p-5">
                      <div className="space-y-3">
                        {/* Header with title and risk */}
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={cn(
                            "font-semibold truncate flex-1",
                            isProcessing && "text-muted-foreground"
                          )}>
                            {displayTitle}
                          </h3>
                          {isProcessing ? (
                            <Badge variant="secondary" className="text-xs flex items-center gap-1 bg-primary/10 text-primary border-primary/20 shrink-0">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Processing
                            </Badge>
                          ) : isFailed ? (
                            <Badge variant="danger" className="text-xs flex items-center gap-1 shrink-0">
                              <AlertCircle className="h-3 w-3" />
                              Failed
                            </Badge>
                          ) : (
                            <div className="text-center shrink-0">
                              <div className={cn(
                                'text-xl font-bold tabular-nums',
                                comparison.overallRiskScore !== null && comparison.overallRiskScore >= 75 ? 'text-red-600 dark:text-red-400' :
                                comparison.overallRiskScore !== null && comparison.overallRiskScore >= 50 ? 'text-orange-600 dark:text-orange-400' :
                                comparison.overallRiskScore !== null && comparison.overallRiskScore >= 25 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-green-600 dark:text-green-400'
                              )}>
                                {comparison.overallRiskScore ?? '—'}
                              </div>
                              <Badge variant={riskBadge.variant} className="text-xs">
                                {riskBadge.label}
                              </Badge>
                            </div>
                          )}
                        </div>

                        {/* Contract Names */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">
                            {comparison.sourceContract?.name || 'Unknown'}
                          </span>
                          <ArrowRight className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                            {comparison.targetContract?.name || 'Unknown'}
                          </span>
                        </div>

                        {/* Semantic Tags */}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {tags.slice(0, 3).map((tag, idx) => (
                              <span
                                key={idx}
                                className={cn(
                                  "px-2 py-0.5 text-xs rounded-full",
                                  tagCategoryColors[tag.category]
                                )}
                              >
                                {tag.label}
                              </span>
                            ))}
                            {tags.length > 3 && (
                              <span className="px-2 py-0.5 text-xs text-muted-foreground">
                                +{tags.length - 3} more
                              </span>
                            )}
                          </div>
                        )}

                        {/* Footer with date and delete */}
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatDate(comparison.createdAt)}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDelete(comparison.id, e)}
                            disabled={deletingId === comparison.id}
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
        ) : (
          /* List View */
          <div className="space-y-2">
            {/* List Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <div className="col-span-4">Name</div>
              <div className="col-span-3">Contracts</div>
              <div className="col-span-2">Tags</div>
              <div className="col-span-1 text-center">Risk</div>
              <div className="col-span-1">Date</div>
              <div className="col-span-1"></div>
            </div>
            
            {filteredAndSortedComparisons.map((comparison) => {
              const riskBadge = getRiskBadge(comparison.overallRiskScore);
              const displayTitle = getDisplayTitle(comparison);
              const isProcessing = comparison.comparisonStatus === 'processing';
              const isFailed = comparison.comparisonStatus === 'failed';
              const tags = parseSemanticTags(comparison.semanticTags);
              
              return (
                <Link 
                  key={comparison.id} 
                  href={isProcessing ? '#' : `/comparisons/${comparison.id}`}
                  className={cn("block group", isProcessing && "pointer-events-none")}
                >
                  <Card className={cn(
                    "transition-all hover:shadow-md hover:border-muted-foreground/20",
                    isProcessing && "border-dashed bg-muted/30 opacity-75",
                    isFailed && "border-destructive/30 bg-destructive/5"
                  )}>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        {/* Name */}
                        <div className="md:col-span-4 flex items-center gap-2">
                          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <h3 className={cn(
                              "font-semibold truncate",
                              isProcessing && "text-muted-foreground"
                            )}>
                              {displayTitle}
                            </h3>
                            {isProcessing && (
                              <span className="text-xs text-primary flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Processing...
                              </span>
                            )}
                            {isFailed && (
                              <span className="text-xs text-destructive flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Failed
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Contracts */}
                        <div className="md:col-span-3 text-sm text-muted-foreground truncate">
                          <span className="md:hidden font-medium text-foreground">Contracts: </span>
                          {comparison.sourceContract?.name || 'Unknown'} → {comparison.targetContract?.name || 'Unknown'}
                        </div>
                        
                        {/* Tags */}
                        <div className="md:col-span-2">
                          <div className="flex flex-wrap gap-1">
                            {tags.slice(0, 2).map((tag, idx) => (
                              <span
                                key={idx}
                                className={cn(
                                  "px-2 py-0.5 text-xs rounded-full",
                                  tagCategoryColors[tag.category]
                                )}
                              >
                                {tag.label}
                              </span>
                            ))}
                            {tags.length > 2 && (
                              <span className="text-xs text-muted-foreground">
                                +{tags.length - 2}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Risk Score */}
                        <div className="md:col-span-1 flex md:justify-center items-center gap-2">
                          <span className="md:hidden text-sm text-muted-foreground">Risk: </span>
                          {!isProcessing && (
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'font-bold tabular-nums',
                                comparison.overallRiskScore !== null && comparison.overallRiskScore >= 75 ? 'text-red-600 dark:text-red-400' :
                                comparison.overallRiskScore !== null && comparison.overallRiskScore >= 50 ? 'text-orange-600 dark:text-orange-400' :
                                comparison.overallRiskScore !== null && comparison.overallRiskScore >= 25 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-green-600 dark:text-green-400'
                              )}>
                                {comparison.overallRiskScore ?? '—'}
                              </span>
                              <Badge variant={riskBadge.variant} className="text-xs hidden lg:inline-flex">
                                {riskBadge.label}
                              </Badge>
                            </div>
                          )}
                        </div>
                        
                        {/* Date */}
                        <div className="md:col-span-1 text-sm text-muted-foreground">
                          <span className="md:hidden font-medium text-foreground">Date: </span>
                          {formatDate(comparison.createdAt)}
                        </div>
                        
                        {/* Actions */}
                        <div className="md:col-span-1 flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDelete(comparison.id, e)}
                            disabled={deletingId === comparison.id}
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

      </main>
    </div>
  );
}
