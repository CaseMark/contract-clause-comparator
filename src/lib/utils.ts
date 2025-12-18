import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function getContentType(filename: string): string {
  const ext = getFileExtension(filename);
  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

export function getRiskColor(score: number): string {
  if (score >= 75) return 'text-red-600 bg-red-50';
  if (score >= 50) return 'text-orange-600 bg-orange-50';
  if (score >= 25) return 'text-yellow-600 bg-yellow-50';
  return 'text-green-600 bg-green-50';
}

export function getRiskLevel(score: number): string {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Medium';
  return 'Low';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    identical: 'text-green-600 bg-green-50',
    minor_change: 'text-yellow-600 bg-yellow-50',
    significant_change: 'text-orange-600 bg-orange-50',
    missing: 'text-red-600 bg-red-50',
    added: 'text-blue-600 bg-blue-50',
  };
  return colors[status] || 'text-gray-600 bg-gray-50';
}

export function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    identical: '✓',
    minor_change: '~',
    significant_change: '!',
    missing: '✗',
    added: '+',
  };
  return icons[status] || '?';
}

export function formatClauseType(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function calculateOverallRisk(clauseRisks: number[]): number {
  if (clauseRisks.length === 0) return 0;
  // Weight higher risks more heavily
  const weightedSum = clauseRisks.reduce((sum, risk) => {
    const weight = risk >= 75 ? 2 : risk >= 50 ? 1.5 : 1;
    return sum + risk * weight;
  }, 0);
  const totalWeight = clauseRisks.reduce((sum, risk) => {
    return sum + (risk >= 75 ? 2 : risk >= 50 ? 1.5 : 1);
  }, 0);
  return Math.round(weightedSum / totalWeight);
}

/**
 * Normalize text for consistent comparison
 * This ensures identical content produces identical results regardless of
 * whitespace variations, line breaks, or other non-semantic differences
 */
export function normalizeTextForComparison(text: string): string {
  return text
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Normalize multiple spaces to single space
    .replace(/[ \t]+/g, ' ')
    // Normalize multiple newlines to double newline (paragraph break)
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading/trailing whitespace from each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Final trim
    .trim();
}

/**
 * Compute a simple hash of text content for deduplication and caching
 * Uses a fast non-cryptographic hash for performance
 */
export function hashText(text: string): string {
  const normalized = normalizeTextForComparison(text);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Calculate text similarity ratio (0-1) between two strings
 * Uses Levenshtein-like approach for quick similarity check
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  const s1 = normalizeTextForComparison(text1);
  const s2 = normalizeTextForComparison(text2);
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // For very long texts, use a sampling approach
  const maxLen = Math.max(s1.length, s2.length);
  const minLen = Math.min(s1.length, s2.length);
  
  // Quick length-based similarity check
  const lengthRatio = minLen / maxLen;
  if (lengthRatio < 0.3) return lengthRatio * 0.5; // Very different lengths = low similarity
  
  // Check common prefix and suffix
  let commonPrefix = 0;
  let commonSuffix = 0;
  const checkLen = Math.min(minLen, 100); // Check first/last 100 chars
  
  for (let i = 0; i < checkLen && s1[i] === s2[i]; i++) {
    commonPrefix++;
  }
  
  for (let i = 0; i < checkLen && s1[s1.length - 1 - i] === s2[s2.length - 1 - i]; i++) {
    commonSuffix++;
  }
  
  const commonRatio = (commonPrefix + commonSuffix) / (checkLen * 2);
  
  // Combine length ratio and common content ratio
  return (lengthRatio * 0.3) + (commonRatio * 0.7);
}
