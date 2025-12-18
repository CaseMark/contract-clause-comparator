/**
 * Case.dev API Client
 * Handles interactions with Vaults, OCR, and LLM services
 */

const CASEDEV_API_URL = process.env.CASEDEV_API_URL || 'https://api.case.dev';
const CASEDEV_API_KEY = process.env.CASEDEV_API_KEY || '';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${CASEDEV_API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${CASEDEV_API_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return { error: `API Error: ${response.status} - ${error}` };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: `Request failed: ${error}` };
  }
}

// ============ VAULT OPERATIONS ============

export interface VaultCreateResponse {
  id: string;
  name: string;
  createdAt: string;
}

export async function createVault(name: string): Promise<ApiResponse<VaultCreateResponse>> {
  return apiRequest<VaultCreateResponse>('/vault', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export interface UploadUrlResponse {
  objectId: string;
  uploadUrl: string;
  expiresIn: number;
  instructions: {
    method: string;
    headers: Record<string, string>;
  };
}

export async function getUploadUrl(
  vaultId: string,
  filename: string,
  contentType: string,
  metadata?: Record<string, unknown>
): Promise<ApiResponse<UploadUrlResponse>> {
  return apiRequest<UploadUrlResponse>(`/vault/${vaultId}/upload`, {
    method: 'POST',
    body: JSON.stringify({
      filename,
      contentType,
      metadata,
      auto_index: true,
    }),
  });
}

export interface IngestResponse {
  objectId: string;
  workflowId: string;
  status: string;
  message: string;
}

export async function ingestDocument(
  vaultId: string,
  objectId: string
): Promise<ApiResponse<IngestResponse>> {
  return apiRequest<IngestResponse>(`/vault/${vaultId}/ingest/${objectId}`, {
    method: 'POST',
  });
}

export interface VaultObject {
  id: string;
  filename: string;
  ingestionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  pageCount?: number;
  textLength?: number;
  chunkCount?: number;
  error?: string;
}

export async function getVaultObject(
  vaultId: string,
  objectId: string
): Promise<ApiResponse<VaultObject>> {
  return apiRequest<VaultObject>(`/vault/${vaultId}/objects/${objectId}`);
}

export interface SearchChunk {
  text: string;
  object_id: string;
  chunk_index: number;
  hybridScore: number;
  vectorScore: number;
  bm25Score: number;
}

export interface SearchResponse {
  method: string;
  query: string;
  chunks: SearchChunk[];
  sources: Array<{
    id: string;
    filename: string;
    pageCount?: number;
  }>;
}

export async function searchVault(
  vaultId: string,
  query: string,
  options: {
    method?: 'hybrid' | 'fast' | 'global' | 'local';
    topK?: number;
    filters?: Record<string, unknown>;
  } = {}
): Promise<ApiResponse<SearchResponse>> {
  return apiRequest<SearchResponse>(`/vault/${vaultId}/search`, {
    method: 'POST',
    body: JSON.stringify({
      query,
      method: options.method || 'hybrid',
      topK: options.topK || 10,
      filters: options.filters || {},
    }),
  });
}

// ============ OCR OPERATIONS ============

export interface OcrJobResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  document_url: string;
  engine: string;
  created_at: string;
  links: {
    self: string;
    text: string;
    json: string;
  };
}

export async function processOcr(
  documentUrl: string,
  options: {
    engine?: 'doctr' | 'paddleocr';
    callback_url?: string;
  } = {}
): Promise<ApiResponse<OcrJobResponse>> {
  return apiRequest<OcrJobResponse>('/ocr/v1/process', {
    method: 'POST',
    body: JSON.stringify({
      document_url: documentUrl,
      engine: options.engine || 'doctr',
      callback_url: options.callback_url,
    }),
  });
}

export async function getOcrJob(jobId: string): Promise<ApiResponse<OcrJobResponse>> {
  return apiRequest<OcrJobResponse>(`/ocr/v1/${jobId}`);
}

export async function getOcrText(jobId: string): Promise<ApiResponse<string>> {
  try {
    const response = await fetch(`${CASEDEV_API_URL}/ocr/v1/${jobId}/download/text`, {
      headers: {
        'Authorization': `Bearer ${CASEDEV_API_KEY}`,
      },
    });

    if (!response.ok) {
      return { error: `Failed to get OCR text: ${response.status}` };
    }

    const text = await response.text();
    return { data: text };
  } catch (error) {
    return { error: `Request failed: ${error}` };
  }
}

// ============ LLM OPERATIONS ============

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: {
    model?: string;
    max_tokens?: number;
    temperature?: number;
  } = {}
): Promise<ApiResponse<ChatCompletionResponse>> {
  return apiRequest<ChatCompletionResponse>('/llm/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      messages,
      model: options.model || 'anthropic/claude-sonnet-4.5',
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature ?? 0,
    }),
  });
}

// ============ CLAUSE MATCHING ============

export interface ClauseMatch {
  sourceClauseId: string;
  targetClauseId: string | null;
  matchConfidence: number;
  matchReason: string;
}

export interface ClauseMatchingResult {
  matches: ClauseMatch[];
  unmatchedSource: string[];
  unmatchedTarget: string[];
}

interface ClauseForMatching {
  id: string;
  clauseType: string;
  title: string;
  content: string;
}

export async function matchClausesSemantically(
  sourceClauses: ClauseForMatching[],
  targetClauses: ClauseForMatching[]
): Promise<ApiResponse<ClauseMatchingResult>> {
  const systemPrompt = `You are a legal document analyst specializing in contract clause matching. Match clauses from SOURCE to TARGET documents.

MATCHING STRATEGY - Use this exact priority order:

1. EXACT TYPE MATCH: If source and target have the same clause_type, match them (highest priority)
2. TITLE SIMILARITY: Match clauses with similar section numbers or headings (e.g., "Section 5" matches "5.", "Article V" matches "ARTICLE 5")
3. CONTENT SIMILARITY: Match clauses discussing the same legal topic even if labeled differently

KEY RULES:
- EVERY source clause should have a match unless the target genuinely lacks that provision
- The same clause_type in both documents = automatic match (don't overthink it)
- When multiple targets could match, pick the one with the SAME clause_type first
- Only leave unmatched if there's truly no corresponding provision
- Prefer matching over leaving unmatched

COMMON MATCHING PAIRS (match these even if labels differ slightly):
- indemnification ↔ indemnity, hold harmless
- limitation_of_liability ↔ liability cap, damages limitation  
- confidentiality ↔ non-disclosure, proprietary information
- termination ↔ term, cancellation
- governing_law ↔ choice of law, applicable law
- dispute_resolution ↔ arbitration, jurisdiction

Return ONLY valid JSON:
{
  "matches": [
    {
      "sourceClauseId": "source-id-1",
      "targetClauseId": "target-id-1",
      "matchConfidence": 0.95,
      "matchReason": "Both clauses address indemnification"
    }
  ],
  "unmatchedSource": [],
  "unmatchedTarget": []
}`;

  // Use much more content for matching - up to 2000 chars to ensure accurate semantic matching
  // Truncation can cause critical context loss that leads to incorrect matches
  const CONTENT_LIMIT = 2000;
  
  const sourceClauseSummaries = sourceClauses.map(c => ({
    id: c.id,
    type: c.clauseType,
    title: c.title,
    content: c.content.length > CONTENT_LIMIT 
      ? c.content.substring(0, CONTENT_LIMIT) + '... [truncated]' 
      : c.content
  }));

  const targetClauseSummaries = targetClauses.map(c => ({
    id: c.id,
    type: c.clauseType,
    title: c.title,
    content: c.content.length > CONTENT_LIMIT 
      ? c.content.substring(0, CONTENT_LIMIT) + '... [truncated]' 
      : c.content
  }));

  const userPrompt = `Match the following clauses from the SOURCE (original) document to their corresponding clauses in the TARGET (revised) document.

CRITICAL INSTRUCTION: You MUST match every source clause that has a corresponding provision in the target, even if the content has been significantly modified. A redlined document typically contains modified versions of ALL original clauses plus potentially new additions.

Read the FULL content of each clause carefully before matching.

SOURCE DOCUMENT CLAUSES (Original) - Count: ${sourceClauses.length}:
${JSON.stringify(sourceClauseSummaries, null, 2)}

TARGET DOCUMENT CLAUSES (Revised) - Count: ${targetClauses.length}:
${JSON.stringify(targetClauseSummaries, null, 2)}

For each source clause, find the target clause that addresses the SAME legal topic or provision. Aim to match ALL source clauses if possible. Only list a clause as unmatched if there is genuinely NO corresponding provision.`;

  const response = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], {
    model: 'anthropic/claude-sonnet-4.5',
    max_tokens: 4000,
    temperature: 0, // Must be 0 for consistent matching results
  });

  if (response.error) {
    return { error: response.error };
  }

  try {
    const content = response.data?.choices[0]?.message?.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { error: 'Failed to parse clause matching response' };
    }
    const result = JSON.parse(jsonMatch[0]) as ClauseMatchingResult;
    return { data: result };
  } catch (error) {
    return { error: `Failed to parse clause matching: ${error}` };
  }
}

// ============ CLAUSE EXTRACTION ============

export interface ExtractedClause {
  clause_type: string;
  title: string;
  content: string;
  page_number?: number;
  confidence?: number;
}

const CLAUSE_TYPES = [
  'indemnification',
  'termination',
  'ip_ownership',
  'confidentiality',
  'limitation_of_liability',
  'governing_law',
  'dispute_resolution',
  'assignment',
  'force_majeure',
  'warranties',
  'payment_terms',
  'term_and_renewal',
  'non_compete',
  'non_solicitation',
  'data_protection',
];

export async function extractClauses(
  contractText: string
): Promise<ApiResponse<ExtractedClause[]>> {
  const systemPrompt = `You are a legal document analyst specializing in contract analysis. Extract all UNIQUE clauses from the provided contract text.

STEP 1 - IDENTIFY DOCUMENT STRUCTURE:
First, scan the document for its organizational structure:
- Look for numbered sections (1., 2., 3. or 1.1, 1.2, 2.1, etc.)
- Look for Article/Section headings (Article I, Section 1, ARTICLE ONE, etc.)
- Look for lettered sections (A., B., C. or (a), (b), (c))
- Look for Roman numerals (I., II., III. or i., ii., iii.)
- Identify the primary numbering scheme used in the document

STEP 2 - EXTRACT BY DOCUMENT STRUCTURE:
Use the document's OWN numbering/structure to define clause boundaries:
- If the document uses numbered sections, extract each numbered section as a clause
- Preserve the EXACT section numbers and headings from the document
- Include ALL subsections under their parent section
- Match clauses between documents by their section numbers when possible

For each clause, identify:
1. clause_type: One of [${CLAUSE_TYPES.join(', ')}]
2. title: The clause heading/title EXACTLY as it appears in the document (preserve section numbers like "8.1", "Article IV", "Section 3", etc.)
3. content: The COMPLETE clause text including ALL subsections and related provisions
4. page_number: If identifiable from context
5. confidence: Your confidence score (0-1) in the extraction

Return ONLY a valid JSON array with no additional text:
[{
  "clause_type": "indemnification",
  "title": "Section 8 - Indemnification",
  "content": "...",
  "page_number": 5,
  "confidence": 0.95
}]

CRITICAL EXTRACTION RULES:
1. RESPECT DOCUMENT NUMBERING: Use the document's own section numbers as the primary guide for clause boundaries
2. COMPLETENESS: Extract the ENTIRE clause including ALL subsections (e.g., if 8.1 is Indemnification, include 8.1.1, 8.1.2, etc.)
3. ONE ENTRY PER TYPE: Extract each clause type ONLY ONCE - combine related subsections into one entry
4. PRESERVE STRUCTURE: Include section numbers, lettered subsections (a), (b), (c), etc. in the content
5. NO TRUNCATION: Never truncate or summarize - include the complete verbatim text
6. SCOPE AWARENESS: Include introductory paragraphs, definitions, and exceptions that are part of each clause
7. CONTEXTUAL CONTENT: If a clause references or incorporates other sections, note this in the content

CLAUSE BOUNDARY RULES:
- Start: Begin at the section heading or number AS IT APPEARS IN THE DOCUMENT
- End: Continue until the next major section heading or end of document
- Include: All numbered/lettered subsections, examples, exceptions, and conditions
- Exclude: Unrelated sections that merely reference this clause

CONSISTENCY REQUIREMENTS (important for document comparison):
- Extract the same types of content for each clause type consistently
- If a clause is split across multiple sections, combine them under the primary clause type
- Use the same granularity for similar documents to enable accurate comparison
- When comparing documents, clauses with the SAME SECTION NUMBER should be matched together

If a clause type doesn't match the predefined list, use the closest match.
Maximum of ONE clause per clause_type unless they are genuinely distinct provisions addressing different subjects.`;

  const response = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Extract all clauses from this contract. 

IMPORTANT: First identify the document's numbering structure (e.g., "1.", "1.1", "Article I", "Section A"), then use that structure to define clause boundaries. Be thorough and extract the COMPLETE text of each clause including all subsections:

${contractText}` },
  ], {
    model: 'anthropic/claude-sonnet-4.5',
    max_tokens: 16000, // Increased for complete extraction
    temperature: 0, // Must be 0 for consistent extraction
  });

  if (response.error) {
    return { error: response.error };
  }

  try {
    const content = response.data?.choices[0]?.message?.content || '[]';
    // Extract JSON from the response (handle potential markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { error: 'Failed to parse clause extraction response' };
    }
    const clauses = JSON.parse(jsonMatch[0]) as ExtractedClause[];
    return { data: clauses };
  } catch (error) {
    return { error: `Failed to parse clauses: ${error}` };
  }
}

// ============ CHANGE ANALYSIS ============

export interface RiskAnalysis {
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;
  deviation_percentage: number;
  risk_factors: string[];
  summary: string;
  changes: {
    additions: string[];
    deletions: string[];
    modifications: string[];
  };
}

export async function analyzeClauseRisk(
  templateClause: string,
  redlinedClause: string,
  clauseType: string
): Promise<ApiResponse<RiskAnalysis>> {
  const systemPrompt = `You are a legal analyst specializing in contract review. Compare the template clause (original) with the redlined version and assess the significance of changes using DETERMINISTIC SCORING CRITERIA.

SCORING METHODOLOGY (use these exact criteria for consistency):

DEVIATION PERCENTAGE CALCULATION:
- Count significant word/phrase changes as a percentage of original content
- Minor formatting changes: 0-5%
- Wording tweaks without meaning change: 5-15%
- Meaningful term modifications: 15-35%
- Substantial restructuring or new terms: 35-60%
- Complete rewrite or contradictory changes: 60-100%

SIGNIFICANCE SCORE (0-100) - BASE ON THESE FACTORS:
- Scope changes (broader/narrower obligations): +10-25 points
- Financial impact (liability caps, damages, fees): +15-30 points
- Time/duration changes: +5-15 points
- Notice period changes: +5-10 points
- Definition changes: +5-20 points
- Rights/obligations added: +10-25 points
- Rights/obligations removed: +10-30 points
- Carve-outs or exceptions modified: +10-20 points
- Start at 0 and ADD points for each change found

SIGNIFICANCE LEVEL (based on score):
- 0-20: "low"
- 21-50: "medium"
- 51-75: "high"
- 76-100: "critical"

ANALYSIS REQUIREMENTS:
1. Identify ALL specific changes (additions, deletions, modifications)
2. Calculate score by ADDING points for each change found
3. Be CONSISTENT - same types of changes should receive same point values
4. Focus on LEGAL SUBSTANCE, not formatting or minor wording

TONE GUIDELINES:
- Use neutral, professional language
- Be direct and factual
- Describe changes objectively
- Use: "notable," "significant," "material," "substantial," "modified"
- Frame findings as observations, not warnings

Return ONLY valid JSON:
{
  "risk_level": "high",
  "risk_score": 75,
  "deviation_percentage": 40,
  "risk_factors": ["Broader indemnification scope (+20)", "Includes consequential damages (+25)", "Extended liability period (+10)"],
  "summary": "The redlined version modifies liability terms with 40% deviation from original. Key changes include broader indemnification scope and inclusion of consequential damages.",
  "changes": {
    "additions": ["Added consequential damages coverage"],
    "deletions": ["Removed liability cap"],
    "modifications": ["Changed notice period from 30 to 60 days"]
  }
}`;

  const userPrompt = `Clause Type: ${clauseType}

ORIGINAL VERSION:
${templateClause}

REDLINED VERSION:
${redlinedClause}

Analyze the significance of changes between these versions.`;

  const response = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], {
    model: 'anthropic/claude-sonnet-4.5',
    max_tokens: 2000,
    temperature: 0,
  });

  if (response.error) {
    return { error: response.error };
  }

  try {
    const content = response.data?.choices[0]?.message?.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { error: 'Failed to parse risk analysis response' };
    }
    const analysis = JSON.parse(jsonMatch[0]) as RiskAnalysis;
    return { data: analysis };
  } catch (error) {
    return { error: `Failed to parse risk analysis: ${error}` };
  }
}

// ============ COMPARISON SUMMARY ============

export async function generateComparisonSummary(
  sourceContractName: string,
  targetContractName: string,
  clauseComparisons: Array<{
    clauseType: string;
    status: string;
    riskScore?: number;
    summary?: string;
  }>
): Promise<ApiResponse<string>> {
  const systemPrompt = `You are a legal analyst. Generate a brief executive summary of the contract comparison.

REQUIREMENTS:
- Provide exactly 3-5 key findings as short, direct statements
- Each finding should be one sentence
- Focus only on facts and observations
- DO NOT include recommendations or suggested actions
- DO NOT use markdown formatting (no bold, bullets, headers, or asterisks)
- Separate each finding with a period and space
- Use neutral, professional language
- Be direct and factual
- When mentioning a specific clause, wrap the clause type in double brackets like [[clause_type]] so it can be linked
- Use the exact clause_type values provided (e.g., [[indemnification]], [[confidentiality]], [[limitation_of_liability]])

Example format:
"The redlined contract contains 4 material changes across 8 clauses analyzed. The [[indemnification]] clause expands liability scope by 35%. [[confidentiality]] terms extend from 2 years to 5 years. The [[limitation_of_liability]] cap was removed entirely. [[payment_terms]] changed from net-30 to net-60."`;

  const userPrompt = `Contract Comparison: "${sourceContractName}" vs "${targetContractName}"

Available clause types: ${clauseComparisons.map(c => c.clauseType).join(', ')}

Clause Analysis Results:
${clauseComparisons.map(c => 
  `- ${c.clauseType}: ${c.status}${c.riskScore ? ` (Risk: ${c.riskScore}/100)` : ''}${c.summary ? ` - ${c.summary}` : ''}`
).join('\n')}

Generate a brief executive summary with 3-5 key findings. No recommendations. Remember to wrap clause type references in [[double brackets]].`;

  const response = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], {
    model: 'anthropic/claude-sonnet-4.5',
    max_tokens: 300,
    temperature: 0, // Must be 0 for consistent, reproducible results
  });

  if (response.error) {
    return { error: response.error };
  }

  return { data: response.data?.choices[0]?.message?.content || '' };
}
