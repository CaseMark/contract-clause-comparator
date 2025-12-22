/**
 * Input validation schemas using Zod
 * Provides security and data integrity for API inputs
 */

import { z } from 'zod';

// Maximum text size limits to prevent abuse and excessive API costs
export const MAX_CONTRACT_TEXT_LENGTH = 500000; // ~500KB of text (roughly 100 pages)
export const MAX_NAME_LENGTH = 200;
export const MAX_FILENAME_LENGTH = 255;

// Sanitize string input - remove potential XSS/injection patterns
function sanitizeString(str: string): string {
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
}

// Helper to create sanitized string with max length
const sanitizedStringWithMax = (maxLength: number) => 
  z.string().max(maxLength).transform(sanitizeString);

// Comparison creation schema (new format with raw text)
export const createComparisonWithTextSchema = z.object({
  sourceText: z.string()
    .min(1, 'Source contract text is required')
    .max(MAX_CONTRACT_TEXT_LENGTH, `Contract text must be less than ${MAX_CONTRACT_TEXT_LENGTH} characters`)
    .transform(sanitizeString),
  targetText: z.string()
    .min(1, 'Target contract text is required')
    .max(MAX_CONTRACT_TEXT_LENGTH, `Contract text must be less than ${MAX_CONTRACT_TEXT_LENGTH} characters`)
    .transform(sanitizeString),
  sourceName: sanitizedStringWithMax(MAX_NAME_LENGTH).optional(),
  targetName: sanitizedStringWithMax(MAX_NAME_LENGTH).optional(),
  sourceFilename: sanitizedStringWithMax(MAX_FILENAME_LENGTH).optional(),
  targetFilename: sanitizedStringWithMax(MAX_FILENAME_LENGTH).optional(),
  comparisonType: z.enum(['template_vs_redline', 'version_comparison']).optional(),
  name: sanitizedStringWithMax(MAX_NAME_LENGTH).optional(),
  orgId: sanitizedStringWithMax(100).optional(),
});

// Comparison creation schema (legacy format with contract IDs)
export const createComparisonWithIdsSchema = z.object({
  sourceContractId: z.string().uuid('Invalid source contract ID'),
  targetContractId: z.string().uuid('Invalid target contract ID'),
  comparisonType: z.enum(['template_vs_redline', 'version_comparison']).optional(),
  name: sanitizedStringWithMax(MAX_NAME_LENGTH).optional(),
  orgId: sanitizedStringWithMax(100).optional(),
});

// Contract creation schema
export const createContractSchema = z.object({
  filename: z.string()
    .min(1, 'Filename is required')
    .max(MAX_FILENAME_LENGTH, `Filename must be less than ${MAX_FILENAME_LENGTH} characters`)
    .transform(sanitizeString),
  name: sanitizedStringWithMax(MAX_NAME_LENGTH).optional(),
  isTemplate: z.boolean().optional(),
  templateType: z.string().max(50).optional(),
  orgId: sanitizedStringWithMax(100).optional(),
});

// Contract processing schema
export const processContractSchema = z.object({
  text: z.string()
    .min(1, 'Contract text is required')
    .max(MAX_CONTRACT_TEXT_LENGTH, `Contract text must be less than ${MAX_CONTRACT_TEXT_LENGTH} characters`)
    .transform(sanitizeString),
});

// Comparison update schema
export const updateComparisonSchema = z.object({
  name: sanitizedStringWithMax(MAX_NAME_LENGTH).optional().nullable(),
});

// UUID validation
export const uuidSchema = z.string().uuid('Invalid ID format');

// Query parameters schema
export const listQuerySchema = z.object({
  orgId: sanitizedStringWithMax(100).optional(),
  isTemplate: z.enum(['true', 'false']).optional(),
});

// Type exports
export type CreateComparisonWithTextInput = z.infer<typeof createComparisonWithTextSchema>;
export type CreateComparisonWithIdsInput = z.infer<typeof createComparisonWithIdsSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type ProcessContractInput = z.infer<typeof processContractSchema>;
export type UpdateComparisonInput = z.infer<typeof updateComparisonSchema>;

/**
 * Validate request body against a schema
 * Returns parsed data or throws an error with details
 */
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new ValidationError(`Validation failed: ${errors}`);
  }
  return result.data;
}

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
