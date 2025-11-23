import { Hono } from 'hono';
import { getContainer, generateId, isCosmosAvailable } from '../lib/cosmos';
import { searchYouTubeTutorials } from '../services/youtube-search';
import { searchWrittenTutorials } from '../services/tutorial-search';
import { scrapeTutorialContent } from '../services/tutorial-scraper';
import type { Tutorial, SavedTutorial, TutorialType, YouTubeTutorial, WrittenTutorial } from '@plateful/shared';

const app = new Hono();

/**
 * Search for tutorials
 * GET /api/tutorials/search?query=...&type=video|written|either
 */
app.get('/search', async (c) => {
  try {
    const query = c.req.query('query');
    const type = c.req.query('type') as 'video' | 'written' | 'either' | undefined;

    if (!query) {
      return c.json({ error: 'query parameter is required' }, 400);
    }

    const searchType = type || 'either';

    console.log(`Searching tutorials: "${query}" (type: ${searchType})`);

    const results: Tutorial[] = [];
    let hasYouTubeKey = !!process.env.YOUTUBE_API_KEY;
    let hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

    // Search YouTube videos - get only 1 result
    if (searchType === 'video' || searchType === 'either') {
      try {
        if (!hasYouTubeKey) {
          console.warn('YOUTUBE_API_KEY not configured, skipping YouTube search');
        } else {
          const youtubeResults = await searchYouTubeTutorials(query, 1);
          if (youtubeResults.length > 0) {
            results.push(youtubeResults[0]);
            console.log(`✅ Found 1 YouTube video: ${youtubeResults[0].title}`);
          }
        }
      } catch (error: any) {
        console.error('YouTube search error:', error.message);
        // Continue with written search even if YouTube fails
      }
    }

    // Search written tutorials - validate and return only 1 working result
    if (searchType === 'written' || searchType === 'either') {
      try {
        if (!hasAnthropicKey) {
          console.warn('ANTHROPIC_API_KEY not configured, skipping written search');
        } else {
          const writtenResults = await searchWrittenTutorials(query);
          console.log(`📚 Anthropic search returned ${writtenResults.length} potential tutorials`);
          
          // Try to find one working written tutorial
          let foundValidTutorial = false;
          for (const result of writtenResults) {
            try {
              console.log(`Validating written tutorial: ${result.url}`);
              
              // Scrape and validate the content
              const scraped = await scrapeTutorialContent(result.url);
              
              if (scraped.content && scraped.content.length > 200) {
                // Valid tutorial found - create and add it
                const tutorial: WrittenTutorial = {
                  type: 'written',
                  id: `written-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  title: result.title,
                  description: result.snippet || '',
                  url: result.url,
                  content: scraped.content,
                  imageUrl: scraped.imageUrl || undefined,
                  author: scraped.author || undefined,
                  siteName: scraped.siteName || undefined,
                };
                
                console.log(`✅ Tutorial created with imageUrl: ${tutorial.imageUrl || 'none'}`);
                results.push(tutorial);
                console.log(`✅ Found 1 validated written tutorial: ${result.title}`);
                foundValidTutorial = true;
                break; // Found one working tutorial, stop searching
              } else {
                console.warn(`Tutorial ${result.url} has insufficient content (${scraped.content?.length || 0} chars, need 200+)`);
              }
            } catch (error: any) {
              console.warn(`Failed to validate tutorial ${result.url}: ${error.message}`);
              // Try next result
              continue;
            }
          }
          
          if (!foundValidTutorial && writtenResults.length > 0) {
            console.warn(`⚠️  All ${writtenResults.length} tutorials failed validation/scraping`);
            // Fallback: Return first result without content (will be loaded when opened)
            const firstResult = writtenResults[0];
            const tutorial: WrittenTutorial = {
              type: 'written',
              id: `written-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: firstResult.title,
              description: firstResult.snippet || '',
              url: firstResult.url,
              // Content will be loaded when user opens it
            };
            console.log(`📄 Returning tutorial without pre-scraped content: ${firstResult.title}`);
            results.push(tutorial);
          } else if (writtenResults.length === 0) {
            console.warn('No written tutorial results found from Anthropic search');
          }
        }
      } catch (error: any) {
        console.error('Written tutorial search error:', error.message);
        console.error('Error details:', error);
        // Log the full error for debugging
        if (error.stack) {
          console.error('Stack trace:', error.stack);
        }
        // Continue even if written search fails - return empty results instead of error
      }
    }

    console.log(`✅ Total: ${results.length} tutorial(s) found and validated`);
    
    // If no results and no API keys configured, that's okay - return empty array
    // Don't throw an error, just return empty results

    // Always return results array, even if empty
    // This prevents errors when no API keys are configured
    return c.json({ 
      tutorials: results,
      query,
      type: searchType
    });

  } catch (error: any) {
    console.error('Tutorial search error:', error);
    return c.json({ 
      error: 'Failed to search tutorials',
      details: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * Scrape full content from a written tutorial URL
 * GET /api/tutorials/scrape?url=...
 */
app.get('/scrape', async (c) => {
  try {
    const url = c.req.query('url');

    if (!url) {
      return c.json({ error: 'url parameter is required' }, 400);
    }

    console.log(`Scraping tutorial content from: ${url}`);

    const scraped = await scrapeTutorialContent(url);

    return c.json({
      content: scraped.content,
      imageUrl: scraped.imageUrl,
      author: scraped.author,
      siteName: scraped.siteName,
      url,
    });

  } catch (error: any) {
    console.error('Tutorial scrape error:', error);
    
    // Provide more helpful error messages
    let errorMessage = 'Failed to scrape tutorial';
    let statusCode = 500;
    
    if (error.message?.includes('403') || error.message?.includes('forbidden')) {
      errorMessage = 'Website blocked access to this tutorial';
      statusCode = 403;
    } else if (error.message?.includes('404') || error.message?.includes('not found')) {
      errorMessage = 'Tutorial page not found';
      statusCode = 404;
    } else if (error.message?.includes('timeout') || error.message?.includes('Network')) {
      errorMessage = 'Network error: Could not connect to the tutorial website';
      statusCode = 504;
    } else if (error.message?.includes('too short')) {
      errorMessage = 'Unable to extract tutorial content from this page';
      statusCode = 422;
    } else {
      errorMessage = error.message || 'Unknown error occurred while scraping tutorial';
    }
    
    return c.json({ 
      error: errorMessage,
      details: error.message || 'Unknown error'
    }, statusCode as 400 | 403 | 404 | 422 | 500 | 504);
  }
});

/**
 * Save a tutorial
 * POST /api/tutorials/:userID
 */
app.post('/:userID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Tutorial service not available' }, 503);
  }

  try {
    const userID = c.req.param('userID');
    const body = await c.req.json<{ tutorial: Tutorial }>();
    const { tutorial } = body;

    if (!tutorial) {
      return c.json({ error: 'tutorial is required' }, 400);
    }

    const container = getContainer('tutorials');
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    // Check if tutorial already saved for this user
    const tutorialID = tutorial.id;
    const { resources: existing } = await container.items
      .query<SavedTutorial>({
        query: 'SELECT * FROM c WHERE c.userID = @userID AND c.tutorialID = @tutorialID',
        parameters: [
          { name: '@userID', value: userID },
          { name: '@tutorialID', value: tutorialID }
        ],
      })
      .fetchAll();

    const now = new Date().toISOString();

    if (existing.length > 0) {
      // Update existing saved tutorial
      const saved = existing[0];
      saved.tutorial = tutorial;
      saved.updatedAt = now;
      saved.isSaved = true;

      await container.item(saved.id, userID).replace(saved);

      return c.json({ tutorial: saved });
    }

    // Create new saved tutorial
    const savedTutorial: SavedTutorial = {
      id: generateId('tutorial'),
      tutorialID,
      userID,
      tutorialType: tutorial.type,
      tutorial,
      isSaved: true,
      createdAt: now,
      updatedAt: now,
    };

    await container.items.create(savedTutorial);

    console.log(`✅ Tutorial saved: ${tutorialID}`);

    return c.json({ tutorial: savedTutorial }, 201);

  } catch (error: any) {
    console.error('Error saving tutorial:', error);
    return c.json({ 
      error: 'Failed to save tutorial',
      details: error.message || 'Unknown error'
    }, 500);
  }
});

/**
 * Get saved tutorials for a user
 * GET /api/tutorials/:userID
 */
app.get('/:userID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Tutorial service not available' }, 503);
  }

  try {
    const userID = c.req.param('userID');
    const container = getContainer('tutorials');
    
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    const { resources: savedTutorials } = await container.items
      .query<SavedTutorial>({
        query: 'SELECT * FROM c WHERE c.userID = @userID AND c.isSaved = true ORDER BY c.createdAt DESC',
        parameters: [{ name: '@userID', value: userID }],
      })
      .fetchAll();

    return c.json({ tutorials: savedTutorials.map(st => st.tutorial) });

  } catch (error: any) {
    console.error('Error fetching saved tutorials:', error);
    return c.json({ error: 'Failed to fetch tutorials' }, 500);
  }
});

/**
 * Toggle saved status of a tutorial
 * PATCH /api/tutorials/:tutorialID
 */
app.patch('/:tutorialID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Tutorial service not available' }, 503);
  }

  try {
    const tutorialID = c.req.param('tutorialID');
    const { userID, isSaved } = await c.req.json<{ userID: string; isSaved: boolean }>();

    if (!userID) {
      return c.json({ error: 'userID is required' }, 400);
    }

    const container = getContainer('tutorials');
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    // Find saved tutorial by tutorialID
    const { resources } = await container.items
      .query<SavedTutorial>({
        query: 'SELECT * FROM c WHERE c.userID = @userID AND c.tutorialID = @tutorialID',
        parameters: [
          { name: '@userID', value: userID },
          { name: '@tutorialID', value: tutorialID }
        ],
      })
      .fetchAll();

    if (resources.length === 0) {
      return c.json({ error: 'Tutorial not found' }, 404);
    }

    const saved = resources[0];
    saved.isSaved = isSaved !== undefined ? isSaved : !saved.isSaved;
    saved.updatedAt = new Date().toISOString();

    await container.item(saved.id, userID).replace(saved);

    return c.json({ tutorial: saved });

  } catch (error: any) {
    console.error('Error updating tutorial:', error);
    return c.json({ error: 'Failed to update tutorial' }, 500);
  }
});

/**
 * Delete/unsave a tutorial
 * DELETE /api/tutorials/:userID/:tutorialID
 */
app.delete('/:userID/:tutorialID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Tutorial service not available' }, 503);
  }

  try {
    const userID = c.req.param('userID');
    const tutorialID = c.req.param('tutorialID');

    const container = getContainer('tutorials');
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    console.log(`Deleting tutorial: userID=${userID}, tutorialID=${tutorialID}`);

    // Find saved tutorial
    const { resources } = await container.items
      .query<SavedTutorial>({
        query: 'SELECT * FROM c WHERE c.userID = @userID AND c.tutorialID = @tutorialID',
        parameters: [
          { name: '@userID', value: userID },
          { name: '@tutorialID', value: tutorialID }
        ],
      })
      .fetchAll();

    if (resources.length === 0) {
      console.warn(`Tutorial not found: userID=${userID}, tutorialID=${tutorialID}`);
      return c.json({ 
        error: 'Tutorial not found',
        details: `No saved tutorial found with ID: ${tutorialID}`
      }, 404);
    }

    const saved = resources[0];
    await container.item(saved.id, userID).delete();

    console.log(`✅ Tutorial deleted: ${tutorialID}`);

    return c.json({ message: 'Tutorial deleted successfully' });

  } catch (error: any) {
    console.error('Error deleting tutorial:', error);
    return c.json({ error: 'Failed to delete tutorial' }, 500);
  }
});

export default app;

