'use client';

import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File, text: string) => void;
  label: string;
  description?: string;
  accept?: string;
  isLoading?: boolean;
  selectedFile?: { name: string; text: string } | null;
  onClear?: () => void;
}

export function FileUpload({
  onFileSelect,
  label,
  description,
  accept = '.pdf,.doc,.docx,.txt',
  isLoading = false,
  selectedFile,
  onClear,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    
    // For MVP, we'll read text files directly
    // In production, this would use OCR for PDFs
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const text = await file.text();
      onFileSelect(file, text);
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // For demo purposes, we'll show a message about PDF processing
      // In production, this would call the OCR API
      setError('PDF processing requires OCR. For the demo, please use a .txt file or paste contract text directly.');
    } else {
      setError('Unsupported file type. Please use .txt, .pdf, .doc, or .docx files.');
    }
  }, [onFileSelect]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      await processFile(file);
    }
  }, [processFile]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  }, [processFile]);

  if (selectedFile) {
    return (
      <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-medium text-green-900 dark:text-green-100">{selectedFile.name}</p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  {selectedFile.text.length.toLocaleString()} characters
                </p>
              </div>
            </div>
            {onClear && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClear}
                className="text-green-700 hover:text-green-900 hover:bg-green-100 dark:text-green-300 dark:hover:text-green-100 dark:hover:bg-green-900/50"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 block mb-1">
        {label}
      </label>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/50',
          isLoading && 'opacity-50 pointer-events-none'
        )}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isLoading}
        />
        
        <div className="flex flex-col items-center gap-2">
          {isLoading ? (
            <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
          ) : (
            <Upload className="h-10 w-10 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium">
              {isLoading ? 'Processing...' : 'Drop your contract here'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {description || 'or click to browse'}
            </p>
          </div>
        </div>
      </div>
      
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
