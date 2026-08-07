# Find your Notion data source ID — copy/paste helper

Modern Notion APIs use a **data source ID** for querying database rows. If you do not know yours, use this helper instead of guessing from the browser URL.

## 1. First store only the Notion token

In Apps Script:

**Project Settings → Script Properties**

Add:

```text
NOTION_TOKEN = your Notion connection token
```

Your Notion connection must already have **Content access** to the database you want to sync.

## 2. Paste this temporary function into Apps Script

You can place it under the main code, run it once, then remove it if you want.

```javascript
function listAccessibleNotionDataSources() {
  const token = PropertiesService
    .getScriptProperties()
    .getProperty('NOTION_TOKEN');

  if (!token) {
    throw new Error('NOTION_TOKEN is missing from Script Properties');
  }

  const response = UrlFetchApp.fetch(
    'https://api.notion.com/v1/search',
    {
      method: 'post',
      muteHttpExceptions: true,
      headers: {
        Authorization: 'Bearer ' + token,
        'Notion-Version': '2026-03-11',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        page_size: 100,
        filter: {
          property: 'object',
          value: 'data_source'
        }
      })
    }
  );

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status !== 200) {
    throw new Error('Notion search failed: HTTP ' + status + ' ' + body);
  }

  const data = JSON.parse(body);
  const sources = (data.results || []).filter(function(item) {
    return item.object === 'data_source';
  });

  if (!sources.length) {
    console.log(
      'No data sources found. Check Content access on your Notion connection.'
    );
    return;
  }

  sources.forEach(function(item) {
    const title = (item.title || [])
      .map(function(part) {
        return part.plain_text || '';
      })
      .join('') || '(Untitled data source)';

    console.log(title + ' :: ' + item.id);
  });
}
```

## 3. Run it

Select:

```text
listAccessibleNotionDataSources
```

Click **Run**.

The Execution log should show entries like:

```text
Tasks :: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Projects :: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Copy the ID next to the database/data source you want to synchronize.

## 4. Save it as a Script Property

Add:

```text
NOTION_DATA_SOURCE_ID = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Do not post your token in a GitHub issue or AI chat just to discover this ID.
