export default async function handler(req, res) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DB_ID;

  if (!token || !dbId) {
    res.status(500).json({ error: 'Missing NOTION_TOKEN or NOTION_DB_ID environment variables in Vercel settings.' });
    return;
  }

  try {
    let results = [];
    let cursor = undefined;

    do {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const resp = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await resp.json();

      if (!resp.ok) {
        res.status(resp.status).json({ error: data });
        return;
      }

      results = results.concat(data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    const books = results
      .map(page => {
        const props = page.properties;
        return {
          title: getTitle(props['Book name']),
          author: getText(props['Author']),
          genre: getMultiSelect(props['Genre']),
          language: getSelect(props['Language']),
          notionISBN: getText(props['ISBN'])
        };
      })
      .filter(b => b.title);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({ books });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function getTitle(prop) {
  if (!prop || !prop.title) return '';
  return prop.title.map(t => t.plain_text).join('');
}
function getText(prop) {
  if (!prop) return '';
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
  if (prop.title) return prop.title.map(t => t.plain_text).join('');
  if (prop.number != null) return String(prop.number);
  return '';
}
function getMultiSelect(prop) {
  if (!prop || !prop.multi_select) return [];
  return prop.multi_select.map(s => s.name);
}
function getSelect(prop) {
  if (!prop || !prop.select) return '';
  return prop.select.name;
}
