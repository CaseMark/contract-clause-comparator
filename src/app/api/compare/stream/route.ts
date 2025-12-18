import { NextRequest } from 'next/server';
import { db, initializeDatabase, comparisons } from '@/lib/db';
import { eq } from 'drizzle-orm';

// Ensure database is initialized (async)
async function ensureDbInitialized() {
  await initializeDatabase();
}

// GET /api/compare/stream - Stream status updates for processing comparisons
export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  
  const searchParams = request.nextUrl.searchParams;
  const orgId = searchParams.get('orgId') || process.env.DEFAULT_ORG_ID || 'demo-org';
  // Optional: filter to specific comparison IDs (comma-separated)
  const idsParam = searchParams.get('ids');
  const filterIds = idsParam ? idsParam.split(',') : null;

  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE message
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Track last known status for each comparison
      const lastStatus = new Map<string, string>();
      let isActive = true;

      const checkForUpdates = async () => {
        if (!isActive) return;
        
        try {
          // Fetch all comparisons (or filtered ones)
          let query = db
            .select({
              id: comparisons.id,
              name: comparisons.name,
              comparisonStatus: comparisons.comparisonStatus,
              overallRiskScore: comparisons.overallRiskScore,
              errorMessage: comparisons.errorMessage,
              completedAt: comparisons.completedAt,
            })
            .from(comparisons)
            .where(eq(comparisons.orgId, orgId));

          const results = await query;
          
          // Filter to requested IDs if specified
          const filteredResults = filterIds 
            ? results.filter(c => filterIds.includes(c.id))
            : results;

          // Check for status changes
          for (const comparison of filteredResults) {
            const lastKnownStatus = lastStatus.get(comparison.id);
            
            // Send update if status changed or this is a new comparison we're tracking
            if (lastKnownStatus !== comparison.comparisonStatus) {
              sendEvent('status', {
                id: comparison.id,
                name: comparison.name,
                status: comparison.comparisonStatus,
                overallRiskScore: comparison.overallRiskScore,
                errorMessage: comparison.errorMessage,
                completedAt: comparison.completedAt,
              });
              lastStatus.set(comparison.id, comparison.comparisonStatus);
            }
          }

          // Check if there are still processing comparisons
          const hasProcessing = filteredResults.some(c => c.comparisonStatus === 'processing');
          
          if (hasProcessing && isActive) {
            // Continue checking every 2 seconds while there are processing items
            setTimeout(checkForUpdates, 2000);
          } else if (isActive) {
            // No more processing items, send a done event and close
            sendEvent('done', { message: 'All comparisons complete' });
            controller.close();
          }
        } catch (error) {
          console.error('SSE check error:', error);
          sendEvent('error', { message: 'Failed to check status' });
          // Retry after a longer delay on error
          if (isActive) {
            setTimeout(checkForUpdates, 5000);
          }
        }
      };

      // Send initial heartbeat
      sendEvent('connected', { message: 'Connected to status stream' });
      
      // Start checking for updates
      await checkForUpdates();

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        isActive = false;
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

