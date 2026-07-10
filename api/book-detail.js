export default async function handler(req, res) {
  const token = process.env.NOTION_TOKEN;
  const { id } = req.query;

  if (!token) {
    res.status(500).json({ error: 'Missing NOTION_TOKEN environment variable in Vercel settings.' });
    return;
  }
  if (!id) {
    res.status(400).json({ error: 'Missing page id.' });
    return;
  }

  try {
    let blocks = [];
    let cursor = undefined;

    do {
      const url = `https://api.notion.com/v1/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
      const resp = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28'
        }
      });
      const data = await resp.json();

      if (!resp.ok) {
        res.status(resp.status).json({ error: data });
        return;
      }

      blocks = blocks.concat(data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    const text = blocks
      .map(b => {
        const rt = b[b.type]?.rich_text;
        if (!rt) return '';
        return rt.map(t => t.plain_text).join('');
      })
      .filter(Boolean)
      .join(' ');

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.status(200).json({ synopsis: text.slice(0, 1200) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
