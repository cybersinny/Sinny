const LANG_MAP = {
  'español': { code: 'es', name: 'Spanish' },
  'spanish': { code: 'es', name: 'Spanish' },
  'english': { code: 'en', name: 'English' },
  'inglés': { code: 'en', name: 'English' },
  'français': { code: 'fr', name: 'French' },
  'french': { code: 'fr', name: 'French' },
  'português': { code: 'pt', name: 'Portuguese' },
  'portuguese': { code: 'pt', name: 'Portuguese' },
  'italiano': { code: 'it', name: 'Italian' },
  'italian': { code: 'it', name: 'Italian' },
  'deutsch': { code: 'de', name: 'German' },
  'german': { code: 'de', name: 'German' },
};

function resolveLanguage(raw) {
  if (!raw) return { code: 'en', name: 'English' };
  const key = raw.trim().toLowerCase();
  return LANG_MAP[key] || { code: 'en', name: 'English' };
}

function getTitle(prop) {
  if (!prop || !prop.title) return '';
  return prop.title.map(t => t.plain_text).join('');
}
function getText(prop) {
  if (!prop) return '';
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
  return '';
}
function getSelect(prop) {
  if (!prop || !prop.select) return '';
  return prop.select.name;
}

async function notionFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function hasPageContent(pageId, token) {
  const { ok, data } = await notionFetch(
    `https://api.notion.com/v1/blocks/${pageId}/children?page_size=3`,
    token
  );
  if (!ok) return true; // fail safe: don't overwrite if we can't check
  return (data.results || []).length > 0;
}

async function findCover(title, author, langCode) {
  try {
    const q = encodeURIComponent(author ? `intitle:${title} inauthor:${author}` : title);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&langRestrict=${langCode}&maxResults=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) return { url: null, reason: `Google Books HTTP ${res.status}: ${data.error?.message || 'unknown'}` };
    const item = data.items && data.items[0];
    if (!item) return { url: null, reason: `Google Books found 0 results for "${title}"` };
    const thumb = item?.volumeInfo?.imageLinks?.thumbnail?.replace('http://', 'https://');
    if (!thumb) return { url: null, reason: `Google Books found "${item.volumeInfo?.title}" but it has no cover image` };
    return { url: thumb, reason: null };
  } catch (e) {
    return { url: null, reason: 'Google Books fetch threw: ' + e.message };
  }
}

async function generateSynopsis(title, author, languageName, apiKey) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Write a concise, engaging 2-3 sentence synopsis in ${languageName} for the book "${title}"${author ? ' by ' + author : ''}. Only output the synopsis text itself, nothing else - no preamble, no title repetition.`
        }]
      })
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    return text ? text.trim() : null;
  } catch (e) {
    return null;
  }
}

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DB_ID;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!token || !dbId) {
    res.status(500).json({ error: 'Missing NOTION_TOKEN or NOTION_DB_ID.' });
    return;
  }
  if (!anthropicKey) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY.' });
    return;
  }

  const cursor = req.query.cursor || undefined;
  const batchSize = 2;

  const queryBody = { page_size: batchSize };
  if (cursor) queryBody.start_cursor = cursor;

  const queryResult = await notionFetch(
    `https://api.notion.com/v1/databases/${dbId}/query`,
    token,
    { method: 'POST', body: JSON.stringify(queryBody) }
  );

  if (!queryResult.ok) {
    res.status(queryResult.status).json({ error: queryResult.data });
    return;
  }

  const pages = queryResult.data.results || [];
  const log = [];
  let coversAdded = 0, synopsesAdded = 0, skipped = 0;

  for (const page of pages) {
    const props = page.properties;
    const title = getTitle(props['Book name']);
    const author = getText(props['Author']);
    const langRaw = getSelect(props['Language']);
    const isbn = getText(props['ISBN']);
    const lang = resolveLanguage(langRaw);

    if (!title) continue;

    const needsCover = !page.cover;
    const needsSynopsis = !(await hasPageContent(page.id, token));

    if (!needsCover && !needsSynopsis) {
      skipped++;
      log.push(`⏭ ${title} — already has cover & synopsis, skipped`);
      continue;
    }

    let didSomething = false;
    let coverNote = '';

    if (needsCover) {
      const { url: coverUrl, reason } = await findCover(title, author, lang.code);
      if (coverUrl) {
        const patchResult = await notionFetch(
          `https://api.notion.com/v1/pages/${page.id}`,
          token,
          { method: 'PATCH', body: JSON.stringify({ cover: { type: 'external', external: { url: coverUrl } } }) }
        );
        if (patchResult.ok) {
          coversAdded++; didSomething = true;
        } else {
          coverNote = ` [cover write failed: ${patchResult.data?.message || JSON.stringify(patchResult.data)}]`;
        }
      } else {
        coverNote = ` [cover skipped: ${reason}]`;
      }
    }

    if (needsSynopsis) {
      const synopsis = await generateSynopsis(title, author, lang.name, anthropicKey);
      if (synopsis) {
        const appendResult = await notionFetch(
          `https://api.notion.com/v1/blocks/${page.id}/children`,
          token,
          {
            method: 'PATCH',
            body: JSON.stringify({
              children: [{
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: synopsis } }] }
              }]
            })
          }
        );
        if (appendResult.ok) { synopsesAdded++; didSomething = true; }
      }
    }

    log.push(`${didSomething ? '✓' : '✗'} ${title} (${lang.name})${needsSynopsis ? ' [synopsis]' : ''}${coverNote}`);
  }

  res.status(200).json({
    processed: pages.length,
    coversAdded,
    synopsesAdded,
    skipped,
    log,
    hasMore: queryResult.data.has_more,
    nextCursor: queryResult.data.next_cursor
  });
}
