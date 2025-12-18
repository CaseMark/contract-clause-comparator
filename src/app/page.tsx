'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, ArrowRight, Loader2, AlertCircle, Shield, ExternalLink, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { FileUpload } from '@/components/upload/FileUpload';
import { DiffViewer, ClauseDiffViewer } from '@/components/diff/DiffViewer';
import { ClauseNavigator } from '@/components/comparison/ClauseNavigator';
import { ExecutiveSummary } from '@/components/comparison/ExecutiveSummary';
import { useComparison } from '@/lib/comparison-context';
import { cn } from '@/lib/utils';

interface ContractFile {
  name: string;
  text: string;
}

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
  overallRiskScore: number | null;
  summary: string | null;
  sourceContract: { name: string; rawText: string | null };
  targetContract: { name: string; rawText: string | null };
  clauseComparisons: ClauseComparisonResult[];
}

type Step = 'upload' | 'processing' | 'results';
type InputMode = 'upload' | 'paste';

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  
  // Comparison context for tracking active comparisons
  const { isComparisonInProgress, activeComparison, setActiveComparison, clearActiveComparison } = useComparison();
  
  // Track if we just started a background comparison
  const [backgroundComparisonStarted, setBackgroundComparisonStarted] = useState<{
    id: string;
    name: string;
  } | null>(null);
  
  // File upload state (separate from paste)
  const [templateFile, setTemplateFile] = useState<ContractFile | null>(null);
  const [redlinedFile, setRedlinedFile] = useState<ContractFile | null>(null);
  
  // Paste text state (separate from upload)
  const [templatePasteText, setTemplatePasteText] = useState<string>('');
  const [redlinedPasteText, setRedlinedPasteText] = useState<string>('');
  
  // Optional comparison title
  const [comparisonTitle, setComparisonTitle] = useState<string>('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [selectedClauseType, setSelectedClauseType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Track when it's unsafe to navigate (during initial processing before DB save)
  const [isUnsafeToNavigate, setIsUnsafeToNavigate] = useState(false);

  // Browser warning when trying to close/navigate during critical processing
  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (isUnsafeToNavigate) {
      e.preventDefault();
      // Modern browsers ignore custom messages but still show a warning
      return 'Your comparison is being saved. Are you sure you want to leave?';
    }
  }, [isUnsafeToNavigate]);

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  const handleTemplateSelect = (file: File, text: string) => {
    setTemplateFile({ name: file.name, text });
    setError(null);
  };

  const handleRedlinedSelect = (file: File, text: string) => {
    setRedlinedFile({ name: file.name, text });
    setError(null);
  };

  // Determine if we can compare based on current input mode
  const canCompareUpload = templateFile && redlinedFile;
  const canComparePaste = templatePasteText.trim() && redlinedPasteText.trim();

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
        }
      }
    }
  }, [comparison]);

  const runComparison = async (mode: InputMode) => {
    let sourceText: string;
    let targetText: string;
    let sourceName: string;
    let targetName: string;

    if (mode === 'upload') {
      if (!templateFile || !redlinedFile) {
        setError('Please upload both contracts');
        return;
      }
      sourceText = templateFile.text;
      targetText = redlinedFile.text;
      sourceName = templateFile.name.replace(/\.[^/.]+$/, '') || 'Original';
      targetName = redlinedFile.name.replace(/\.[^/.]+$/, '') || 'Revised';
    } else {
      if (!templatePasteText.trim() || !redlinedPasteText.trim()) {
        setError('Please paste both contract texts');
        return;
      }
      sourceText = templatePasteText;
      targetText = redlinedPasteText;
      sourceName = 'Original';
      targetName = 'Revised';
    }

    setIsProcessing(true);
    setStep('processing');
    setError(null);
    setBackgroundComparisonStarted(null);
    setIsUnsafeToNavigate(true); // Don't navigate until comparison is saved

    try {
      // Create template contract
      const templateResponse = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: mode === 'upload' ? templateFile!.name : 'Original.txt',
          name: sourceName,
          isTemplate: true,
          templateType: 'general',
        }),
      });
      const templateData = await templateResponse.json();
      
      if (!templateResponse.ok) {
        throw new Error(templateData.error || 'Failed to create template contract');
      }

      // Process template contract
      const templateProcessResponse = await fetch(`/api/contracts/${templateData.contract.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText }),
      });
      
      if (!templateProcessResponse.ok) {
        const errorData = await templateProcessResponse.json();
        throw new Error(errorData.error || 'Failed to process template contract');
      }

      // Create redlined contract
      const redlinedResponse = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: mode === 'upload' ? redlinedFile!.name : 'Revised.txt',
          name: targetName,
        }),
      });
      const redlinedData = await redlinedResponse.json();
      
      if (!redlinedResponse.ok) {
        throw new Error(redlinedData.error || 'Failed to create redlined contract');
      }

      // Process redlined contract
      const redlinedProcessResponse = await fetch(`/api/contracts/${redlinedData.contract.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: targetText }),
      });
      
      if (!redlinedProcessResponse.ok) {
        const errorData = await redlinedProcessResponse.json();
        throw new Error(errorData.error || 'Failed to process redlined contract');
      }

      // Run comparison - use custom title if provided, otherwise use document names
      // All comparisons now run in the background for better UX
      const comparisonDisplayName = comparisonTitle.trim() || `${sourceName} → ${targetName}`;
      const compareResponse = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceContractId: templateData.contract.id,
          targetContractId: redlinedData.contract.id,
          comparisonType: 'template_vs_redline',
          name: comparisonDisplayName,
        }),
      });
      const compareData = await compareResponse.json();
      
      if (!compareResponse.ok) {
        throw new Error(compareData.error || 'Failed to compare contracts');
      }

      // Track the active comparison in context
      setActiveComparison({
        id: compareData.comparison.id,
        name: comparisonDisplayName,
        status: 'processing',
        startedAt: new Date().toISOString(),
      });
      
      // Show the background comparison started notification
      setBackgroundComparisonStarted({
        id: compareData.comparison.id,
        name: comparisonDisplayName,
      });
      
      setIsProcessing(false);
      setIsUnsafeToNavigate(false); // Now safe to navigate - comparison is saved
      // Stay on processing step but show navigation options
    } catch (err) {
      console.error('Comparison error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during comparison');
      setStep('upload');
      setIsProcessing(false);
      setIsUnsafeToNavigate(false); // Clear warning on error
    }
  };

  const resetComparison = () => {
    setStep('upload');
    setTemplateFile(null);
    setRedlinedFile(null);
    setTemplatePasteText('');
    setRedlinedPasteText('');
    setComparisonTitle('');
    setComparison(null);
    setSelectedClauseType(null);
    setError(null);
    setBackgroundComparisonStarted(null);
    setIsUnsafeToNavigate(false);
    // Note: We intentionally don't clear activeComparison from context 
    // so the user can still track it in the Past Comparisons page
  };

  const selectedClauseComparison = comparison?.clauseComparisons.find(
    c => c.clauseType === selectedClauseType
  );

  const getRiskLevel = (score: number): { label: string; variant: 'danger' | 'warning' | 'success' } => {
    if (score >= 75) return { label: 'High', variant: 'danger' };
    if (score >= 50) return { label: 'Elevated', variant: 'warning' };
    if (score >= 25) return { label: 'Moderate', variant: 'warning' };
    return { label: 'Low', variant: 'success' };
  };

  // Get display names for results header
  const getDisplayNames = () => {
    if (inputMode === 'upload' && templateFile && redlinedFile) {
      return `${templateFile.name.replace(/\.[^/.]+$/, '')} → ${redlinedFile.name.replace(/\.[^/.]+$/, '')}`;
    }
    return 'Original → Revised';
  };

  return (
    <div className="bg-muted/30">
      <main className="container max-w-7xl py-8">
        {/* Upload Step */}
        {step === 'upload' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                Compare Contract Clauses
              </h1>
              <p className="text-muted-foreground text-lg">
                Upload your template and redlined contracts to see side-by-side diffs, extract clauses, and identify risk areas.
              </p>
            </div>

            {/* Info banner when comparison is in progress */}
            {isComparisonInProgress && (
              <Alert className="border-primary/50 bg-primary/5">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <AlertDescription className="text-primary">
                  A comparison is processing in the background{activeComparison?.name ? ` ("${activeComparison.name}")` : ''}. 
                  You can start another comparison or view progress on the{' '}
                  <a href="/comparisons" className="underline font-medium hover:text-primary/80">
                    Past Comparisons
                  </a>{' '}page.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Optional Comparison Title */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">
                    Comparison Title <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={comparisonTitle}
                    onChange={(e) => setComparisonTitle(e.target.value)}
                    placeholder="e.g., Acme Corp NDA Review"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Mode Toggle */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-lg border bg-muted p-1">
                <button
                  onClick={() => setInputMode('upload')}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                    inputMode === 'upload'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Upload Files
                </button>
                <button
                  onClick={() => setInputMode('paste')}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                    inputMode === 'paste'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Paste Text
                </button>
              </div>
            </div>

            {/* File Upload Mode */}
            {inputMode === 'upload' && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <FileUpload
                    label="Original Contract"
                    description="Your standard contract template"
                    onFileSelect={handleTemplateSelect}
                    selectedFile={templateFile}
                    onClear={() => setTemplateFile(null)}
                  />
                  <FileUpload
                    label="Redlined Contract"
                    description="The vendor's modified version"
                    onFileSelect={handleRedlinedSelect}
                    selectedFile={redlinedFile}
                    onClear={() => setRedlinedFile(null)}
                  />
                </div>

                <div className="flex justify-center">
                  <Button
                    size="lg"
                    onClick={() => runComparison('upload')}
                    disabled={!canCompareUpload}
                  >
                    Compare Contracts
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Paste Text Mode */}
            {inputMode === 'paste' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Paste contract text directly</CardTitle>
                  <CardDescription>
                    Copy and paste contract text from your documents
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none block mb-1">
                      Original Contract
                    </label>
                    <textarea
                      className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                      placeholder="Paste your original contract text here..."
                      value={templatePasteText}
                      onChange={(e) => setTemplatePasteText(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none block mb-1">
                      Redlined Contract
                    </label>
                    <textarea
                      className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                      placeholder="Paste your redlined contract text here..."
                      value={redlinedPasteText}
                      onChange={(e) => setRedlinedPasteText(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-center pt-2">
                    <Button
                      size="lg"
                      onClick={() => runComparison('paste')}
                      disabled={!canComparePaste}
                    >
                      Compare Contracts
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Processing Step */}
        {step === 'processing' && (
          <div className="max-w-lg mx-auto text-center py-16 space-y-6">
            {/* Warning banner when unsafe to navigate */}
            {isUnsafeToNavigate && (
              <Alert className="border-orange-500/50 bg-orange-500/10 text-left">
                <TriangleAlert className="h-4 w-4 text-orange-500" />
                <AlertDescription className="text-orange-700 dark:text-orange-400">
                  <strong>Please wait</strong> — Your comparison is being saved. Navigating away now may cause data loss.
                </AlertDescription>
              </Alert>
            )}

            <Loader2 className="h-12 w-12 text-muted-foreground animate-spin mx-auto" />
            <div>
              <h2 className="text-xl font-semibold mb-2">
                {backgroundComparisonStarted ? 'Comparison Started!' : 'Analyzing Contracts...'}
              </h2>
              <p className="text-muted-foreground">
                {backgroundComparisonStarted 
                  ? 'Your comparison is processing in the background. You can navigate away and check back later.'
                  : 'Extracting clauses, comparing content, and assessing risk. This may take a moment.'
                }
              </p>
            </div>
            
            {/* Background comparison navigation options */}
            {backgroundComparisonStarted && (
              <Card className="text-left">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="h-2 w-2 mt-2 rounded-full bg-primary animate-pulse" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {backgroundComparisonStarted.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Processing in background...
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button 
                      variant="default" 
                      className="flex-1"
                      onClick={() => router.push('/comparisons')}
                    >
                      <ExternalLink className="h-4 w-4" />
                      View All Comparisons
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => {
                        setBackgroundComparisonStarted(null);
                        resetComparison();
                      }}
                    >
                      Start Another Comparison
                    </Button>
                  </div>
                  
                  <p className="text-xs text-muted-foreground text-center">
                    Results will appear in Past Comparisons when ready
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Results Step */}
        {step === 'results' && comparison && (
          <div className="space-y-6">
            {/* Header with reset button and risk score */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Comparison Results</h1>
                <p className="text-muted-foreground">
                  {getDisplayNames()}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {/* Overall Risk Score */}
                <div className="flex items-center gap-3 px-4 py-2 bg-card rounded-lg border">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Risk Score</div>
                    <div className="flex items-center gap-2">
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
                  </div>
                </div>
                <Button variant="outline" onClick={resetComparison}>
                  New Comparison
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
        )}
      </main>
    </div>
  );
}
