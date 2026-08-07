/**
 * Notion -> Google Calendar Sync
 *
 * Source of truth: Notion
 * Mirror: Google Calendar
 *
 * Required Script Properties:
 *   NOTION_TOKEN
 *   NOTION_DATA_SOURCE_ID
 *   WEBHOOK_SECRET
 *
 * Optional Script Properties:
 *   GOOGLE_CALENDAR_ID
 *   PROP_TITLE
 *   PROP_SCHEDULE
 *   PROP_DURATION
 *   PROP_DESCRIPTION
 *   PROP_OUTPUT
 *   PROP_EVENT_ID
 *   PROP_SYNC_STATUS
 *   PROP_LAST_SYNC
 *   STATUS_NOT_IN_CALENDAR
 *   STATUS_SYNCED
 *   STATUS_ERROR
 *   DEFAULT_EVENT_MINUTES
 */

const NOTION_API_VERSION = '2026-03-11';

const DEFAULTS = Object.freeze({
  PROP_TITLE: 'Name',
  PROP_SCHEDULE: 'Schedule',
  PROP_DURATION: 'Duration (minutes)',
  PROP_DESCRIPTION: 'Description',
  PROP_OUTPUT: 'Expected output',
  PROP_EVENT_ID: 'Google Calendar Event ID',
  PROP_SYNC_STATUS: 'Calendar Sync Status',
  PROP_LAST_SYNC: 'Last Calendar Sync',
  STATUS_NOT_IN_CALENDAR: 'Not in calendar',
  STATUS_SYNCED: 'Synced',
  STATUS_ERROR: 'Sync error',
  DEFAULT_EVENT_MINUTES: '60'
});

const INTERNAL = Object.freeze({
  TAG_PAGE_ID: 'notion_page_id',
  TAG_SYNC: 'notion_calendar_sync',
  MAP_PREFIX: 'MAP_'
});

function doPost(e) {
  const secret = requiredProp_('WEBHOOK_SECRET');
  if (!e || !e.parameter || e.parameter.key !== secret) {
    throw new Error('Unauthorized webhook request');
  }

  const raw = (e.postData && e.postData.contents) || '{}';
  const payload = JSON.parse(raw);

  if (payload.verification_token) {
    PropertiesService.getScriptProperties().setProperty(
      'NOTION_VERIFICATION_TOKEN',
      payload.verification_token
    );
    return json_({ ok: true, verification_received: true });
  }

  if (!payload.entity || payload.entity.type !== 'page' || !payload.entity.id) {
    return json_({ ok: true, ignored: true });
  }

  const pageId = payload.entity.id;
  const type = payload.type || '';

  switch (type) {
    case 'page.deleted':
      withScriptLock_(function() {
        deleteMirrorForDeletedPage_(pageId);
      });
      break;

    case 'page.moved':
      // A page moved out of the data source can become unreadable to the
      // connection. For this event only, a 404 is treated as removal.
      syncPage_(pageId, { deleteIfNotFound: true });
      break;

    case 'page.created':
    case 'page.properties_updated':
    case 'page.undeleted':
      syncPage_(pageId, { deleteIfNotFound: false });
      break;

    default:
      return json_({ ok: true, ignored: true, type: type });
  }

  return json_({ ok: true, handled: type });
}

function syncPage_(pageId, options) {
  options = options || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const result = notion_('get', '/v1/pages/' + encodeURIComponent(uuid_(pageId)));

    if (result.status === 404) {
      if (options.deleteIfNotFound && mappedEventId_(pageId)) {
        deleteMirrorForDeletedPage_(pageId);
      }
      return;
    }

    assertNotionOk_(result, 'Retrieve page');
    const page = result.json;
    const dataSourceId = requiredProp_('NOTION_DATA_SOURCE_ID');

    if (page.in_trash || !belongsToDataSource_(page, dataSourceId)) {
      deleteMirrorForDeletedPage_(page.id);
      return;
    }

    const schedule = scheduleFromPage_(page);
    if (!schedule) {
      removeMirrorForActivePage_(page);
      return;
    }

    syncScheduledPage_(page, schedule);
  } catch (err) {
    markError_(pageId);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function syncScheduledPage_(page, schedule) {
  const cfg = config_();
  const calendar = calendar_();
  const pageId = page.id;
  const notionEventId = readTextProperty_(page, cfg.eventId);
  const mappedId = mappedEventId_(pageId);

  let event = ownedEvent_(calendar, pageId, notionEventId, mappedId);
  let changed = false;

  if (!event) {
    event = createEvent_(calendar, page, schedule);
    // Store mapping before writing metadata to Notion. If the Notion PATCH
    // fails and the webhook is retried, the retry finds this event.
    setMappedEventId_(pageId, event.getId());
    changed = true;
  } else {
    setMappedEventId_(pageId, event.getId());
    changed = updateEvent_(event, page, schedule) || changed;
  }

  if (event.getTag(INTERNAL.TAG_PAGE_ID) !== norm_(pageId)) {
    event.setTag(INTERNAL.TAG_PAGE_ID, norm_(pageId));
    changed = true;
  }
  if (event.getTag(INTERNAL.TAG_SYNC) !== '1') {
    event.setTag(INTERNAL.TAG_SYNC, '1');
    changed = true;
  }

  unique_([notionEventId, mappedId].filter(Boolean)).forEach(function(id) {
    if (id === event.getId()) return;
    const duplicate = safeEvent_(calendar, id);
    if (duplicate && duplicate.getTag(INTERNAL.TAG_PAGE_ID) === norm_(pageId)) {
      duplicate.deleteEvent();
      changed = true;
    }
  });

  const currentStatus = readSelectProperty_(page, cfg.syncStatus);
  const properties = {};

  if (hasProperty_(page, cfg.eventId) && notionEventId !== event.getId()) {
    properties[cfg.eventId] = richTextWrite_(event.getId());
  }
  if (hasProperty_(page, cfg.syncStatus) && currentStatus !== cfg.statusSynced) {
    properties[cfg.syncStatus] = { select: { name: cfg.statusSynced } };
  }
  if (
    hasProperty_(page, cfg.lastSync) &&
    (changed || notionEventId !== event.getId() || currentStatus !== cfg.statusSynced)
  ) {
    properties[cfg.lastSync] = { date: { start: new Date().toISOString() } };
  }

  if (Object.keys(properties).length) {
    patchPage_(page.id, properties);
  }

  console.log('Synced: ' + pageTitle_(page) + ' -> ' + event.getId());
}

function ownedEvent_(calendar, pageId, notionEventId, mappedId) {
  if (notionEventId) {
    const event = safeEvent_(calendar, notionEventId);
    if (
      event &&
      (event.getTag(INTERNAL.TAG_PAGE_ID) === norm_(pageId) || mappedId === notionEventId)
    ) {
      return event;
    }
  }

  if (mappedId) {
    const event = safeEvent_(calendar, mappedId);
    if (
      event &&
      (event.getTag(INTERNAL.TAG_PAGE_ID) === norm_(pageId) || notionEventId === mappedId)
    ) {
      return event;
    }
  }

  return null;
}

function createEvent_(calendar, page, schedule) {
  const title = pageTitle_(page);
  const description = calendarDescription_(page);
  let event;

  if (schedule.allDay) {
    if (schedule.range) {
      event = calendar.createAllDayEvent(title, schedule.start, schedule.end, {
        description: description
      });
    } else {
      event = calendar.createAllDayEvent(title, schedule.start, {
        description: description
      });
    }
  } else {
    event = calendar.createEvent(title, schedule.start, schedule.end, {
      description: description
    });
  }

  event.setTag(INTERNAL.TAG_PAGE_ID, norm_(page.id));
  event.setTag(INTERNAL.TAG_SYNC, '1');
  return event;
}

function updateEvent_(event, page, schedule) {
  let changed = false;
  const title = pageTitle_(page);
  const description = calendarDescription_(page);

  if ((event.getTitle() || '') !== title) {
    event.setTitle(title);
    changed = true;
  }
  if ((event.getDescription() || '') !== description) {
    event.setDescription(description);
    changed = true;
  }

  if (schedule.allDay) {
    if (schedule.range) {
      const wrong =
        !event.isAllDayEvent() ||
        !sameDay_(event.getAllDayStartDate(), schedule.start) ||
        !sameDay_(event.getAllDayEndDate(), schedule.end);
      if (wrong) {
        event.setAllDayDates(schedule.start, schedule.end);
        changed = true;
      }
    } else {
      const wrong =
        !event.isAllDayEvent() || !sameDay_(event.getAllDayStartDate(), schedule.start);
      if (wrong) {
        event.setAllDayDate(schedule.start);
        changed = true;
      }
    }
  } else {
    const wrong =
      event.isAllDayEvent() ||
      Math.abs(event.getStartTime().getTime() - schedule.start.getTime()) >= 1000 ||
      Math.abs(event.getEndTime().getTime() - schedule.end.getTime()) >= 1000;
    if (wrong) {
      event.setTime(schedule.start, schedule.end);
      changed = true;
    }
  }

  return changed;
}

function removeMirrorForActivePage_(page) {
  const cfg = config_();
  const calendar = calendar_();
  const notionEventId = readTextProperty_(page, cfg.eventId);
  const mappedId = mappedEventId_(page.id);
  let deleted = false;

  unique_([notionEventId, mappedId].filter(Boolean)).forEach(function(id) {
    const event = safeEvent_(calendar, id);
    if (!event) return;

    const proven =
      event.getTag(INTERNAL.TAG_PAGE_ID) === norm_(page.id) ||
      (notionEventId && mappedId && notionEventId === mappedId && id === notionEventId);

    if (proven) {
      event.deleteEvent();
      deleted = true;
    }
  });

  deleteMappedEventId_(page.id);

  const properties = {};
  if (hasProperty_(page, cfg.eventId) && notionEventId) {
    properties[cfg.eventId] = { rich_text: [] };
  }
  if (
    hasProperty_(page, cfg.syncStatus) &&
    readSelectProperty_(page, cfg.syncStatus) !== cfg.statusNotInCalendar
  ) {
    properties[cfg.syncStatus] = { select: { name: cfg.statusNotInCalendar } };
  }
  if (hasProperty_(page, cfg.lastSync) && (deleted || notionEventId)) {
    properties[cfg.lastSync] = { date: { start: new Date().toISOString() } };
  }

  if (Object.keys(properties).length) patchPage_(page.id, properties);
}

function deleteMirrorForDeletedPage_(pageId) {
  const cfg = config_();
  const calendar = calendar_();
  const mappedId = mappedEventId_(pageId);
  let notionEventId = '';

  try {
    const result = notion_('get', '/v1/pages/' + encodeURIComponent(uuid_(pageId)));
    if (result.status === 200 && result.json.properties) {
      notionEventId = readTextProperty_(result.json, cfg.eventId);
    }
  } catch (ignore) {}

  unique_([mappedId, notionEventId].filter(Boolean)).forEach(function(id) {
    const event = safeEvent_(calendar, id);
    if (!event) return;

    const bothAgree = mappedId && notionEventId && mappedId === notionEventId && id === mappedId;
    if (event.getTag(INTERNAL.TAG_PAGE_ID) === norm_(pageId) || bothAgree) {
      event.deleteEvent();
    }
  });

  deleteMappedEventId_(pageId);
}

function safeEvent_(calendar, eventId) {
  if (!eventId) return null;
  try {
    return calendar.getEventById(eventId);
  } catch (err) {
    return null;
  }
}

function calendar_() {
  const id = optionalProp_('GOOGLE_CALENDAR_ID', '');
  if (!id) return CalendarApp.getDefaultCalendar();
  const calendar = CalendarApp.getCalendarById(id);
  if (!calendar) throw new Error('GOOGLE_CALENDAR_ID is not accessible');
  return calendar;
}

function scheduleFromPage_(page) {
  const cfg = config_();
  const property = page.properties[cfg.schedule];
  if (!property || property.type !== 'date' || !property.date || !property.date.start) {
    return null;
  }

  const date = property.date;
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(date.start);

  if (allDay) {
    const start = allDayDate_(date.start);
    if (date.end) {
      // Notion's displayed date range is inclusive; Calendar all-day end is exclusive.
      return {
        allDay: true,
        range: true,
        start: start,
        end: addDays_(allDayDate_(date.end), 1)
      };
    }
    return { allDay: true, range: false, start: start, end: addDays_(start, 1) };
  }

  const start = parseDateTime_(date.start, date.time_zone);
  let end;
  if (date.end) {
    end = parseDateTime_(date.end, date.time_zone);
  } else {
    const duration = readNumberProperty_(page, cfg.duration);
    const minutes = duration || cfg.defaultMinutes;
    end = new Date(start.getTime() + Math.max(1, minutes) * 60000);
  }

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid Notion schedule date');
  }
  if (end <= start) {
    end = new Date(start.getTime() + cfg.defaultMinutes * 60000);
  }

  return { allDay: false, range: !!date.end, start: start, end: end };
}

function parseDateTime_(raw, timeZone) {
  if (/([zZ]|[+-]\d{2}:\d{2})$/.test(raw)) return new Date(raw);
  if (!timeZone) return new Date(raw);

  const clean = raw.replace(/\.\d+$/, '');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(clean)) {
    return Utilities.parseDate(clean, timeZone, "yyyy-MM-dd'T'HH:mm");
  }
  return Utilities.parseDate(clean, timeZone, "yyyy-MM-dd'T'HH:mm:ss");
}

function pageTitle_(page) {
  const cfg = config_();
  const prop = page.properties[cfg.title];
  return prop && prop.type === 'title' ? plain_(prop.title) || '(Untitled)' : '(Untitled)';
}

function calendarDescription_(page) {
  const cfg = config_();
  const output = readTextProperty_(page, cfg.output);
  const description = readTextProperty_(page, cfg.description);
  const parts = [];

  if (output) parts.push('Expected output:\n' + output);
  if (description) parts.push('Description:\n' + description);
  parts.push('Notion page:\n' + page.url);
  parts.push('— Automatically synchronized from Notion —');
  return parts.join('\n\n');
}

function reconcileNotionToCalendar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;

  try {
    const dataSourceId = requiredProp_('NOTION_DATA_SOURCE_ID');
    const health = notion_('get', '/v1/data_sources/' + encodeURIComponent(dataSourceId));
    assertNotionOk_(health, 'Data source health check');

    const seen = {};
    const mappings = allMappings_();

    Object.keys(mappings).forEach(function(normalizedPageId) {
      const result = notion_('get', '/v1/pages/' + encodeURIComponent(uuid_(normalizedPageId)));
      if (result.status === 404) {
        deleteMirrorForDeletedPage_(normalizedPageId);
        return;
      }
      assertNotionOk_(result, 'Reconcile page');

      const page = result.json;
      seen[norm_(page.id)] = true;
      if (page.in_trash || !belongsToDataSource_(page, dataSourceId)) {
        deleteMirrorForDeletedPage_(page.id);
        return;
      }

      const schedule = scheduleFromPage_(page);
      if (schedule) syncScheduledPage_(page, schedule);
      else removeMirrorForActivePage_(page);
    });

    queryScheduledPages_().forEach(function(page) {
      if (seen[norm_(page.id)]) return;
      const schedule = scheduleFromPage_(page);
      if (schedule) syncScheduledPage_(page, schedule);
    });

    console.log('Reconciliation completed');
  } finally {
    lock.releaseLock();
  }
}

function queryScheduledPages_() {
  const cfg = config_();
  const dataSourceId = requiredProp_('NOTION_DATA_SOURCE_ID');
  const pages = [];
  let cursor = null;

  do {
    const body = {
      page_size: 100,
      result_type: 'page',
      in_trash: false,
      filter: {
        property: cfg.schedule,
        date: { is_not_empty: true }
      }
    };
    if (cursor) body.start_cursor = cursor;

    const result = notion_(
      'post',
      '/v1/data_sources/' + encodeURIComponent(dataSourceId) + '/query',
      body
    );
    assertNotionOk_(result, 'Query scheduled pages');

    (result.json.results || []).forEach(function(item) {
      if (item.object === 'page') pages.push(item);
    });
    cursor = result.json.has_more ? result.json.next_cursor : null;
  } while (cursor);

  return pages;
}

function installReconciliationTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'reconcileNotionToCalendar') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('reconcileNotionToCalendar')
    .timeBased()
    .everyMinutes(15)
    .create();

  console.log('15-minute reconciliation trigger installed');
}

function uninstallReconciliationTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'reconcileNotionToCalendar') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  console.log('Reconciliation trigger removed');
}

function createWebhookSecret() {
  const secret =
    Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('WEBHOOK_SECRET', secret);
  console.log('WEBHOOK_SECRET created. Copy it from Script Properties; do not commit it.');
}

function showVerificationToken() {
  console.log(
    PropertiesService.getScriptProperties().getProperty('NOTION_VERIFICATION_TOKEN') ||
      'No token received yet'
  );
}

function validateSetup() {
  const cfg = config_();
  requiredProp_('NOTION_TOKEN');
  requiredProp_('NOTION_DATA_SOURCE_ID');
  requiredProp_('WEBHOOK_SECRET');

  const dataSourceId = requiredProp_('NOTION_DATA_SOURCE_ID');
  const result = notion_('get', '/v1/data_sources/' + encodeURIComponent(dataSourceId));
  assertNotionOk_(result, 'Retrieve data source');

  const schema = result.json.properties || {};
  requireSchemaType_(schema, cfg.title, 'title');
  requireSchemaType_(schema, cfg.schedule, 'date');
  optionalSchemaType_(schema, cfg.duration, 'number');
  optionalSchemaType_(schema, cfg.description, 'rich_text');
  optionalSchemaType_(schema, cfg.output, 'rich_text');
  optionalSchemaType_(schema, cfg.eventId, 'rich_text');
  optionalSchemaType_(schema, cfg.syncStatus, 'select');
  if (schema[cfg.syncStatus] && schema[cfg.syncStatus].type === 'select') {
    validateStatusOptions_(schema[cfg.syncStatus], cfg);
  }
  optionalSchemaType_(schema, cfg.lastSync, 'date');

  const cal = calendar_();
  console.log('Notion API: OK');
  console.log('Data source: ' + result.json.id);
  console.log('Calendar: ' + cal.getName() + ' [' + cal.getId() + ']');
  console.log('Calendar timezone: ' + cal.getTimeZone());
  console.log('Script timezone: ' + Session.getScriptTimeZone());
  if (cal.getTimeZone() !== Session.getScriptTimeZone()) {
    console.log('WARNING: Calendar and Apps Script timezones differ. Set the Apps Script project timezone to match the calendar, especially for all-day events.');
  }
  console.log('Setup validation completed');
}

function testCalendarAccess() {
  const calendar = calendar_();
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const event = calendar.createEvent('Notion Sync - permission test', start, end);
  console.log('Created test event: ' + event.getId());
  event.deleteEvent();
  console.log('Deleted test event. Calendar access is OK.');
}

function notion_(method, path, body) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + requiredProp_('NOTION_TOKEN'),
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json'
    }
  };
  if (body !== undefined) options.payload = JSON.stringify(body);

  let result;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = UrlFetchApp.fetch('https://api.notion.com' + path, options);
    const status = response.getResponseCode();
    const text = response.getContentText();
    result = { status: status, text: text, json: text ? parseJson_(text) : null };

    if ((status >= 200 && status < 300) || (status >= 400 && status < 500 && status !== 429)) {
      return result;
    }

    const headers = response.getHeaders();
    const retryAfter = Number(headers['Retry-After'] || headers['retry-after'] || 0);
    const wait = retryAfter ? retryAfter * 1000 : Math.pow(2, attempt) * 500;
    Utilities.sleep(Math.min(wait, 10000));
  }
  return result;
}

function patchPage_(pageId, properties) {
  if (!Object.keys(properties).length) return;
  const result = notion_(
    'patch',
    '/v1/pages/' + encodeURIComponent(uuid_(pageId)),
    { properties: properties }
  );
  assertNotionOk_(result, 'Update page');
}

function markError_(pageId) {
  try {
    const cfg = config_();
    const result = notion_('get', '/v1/pages/' + encodeURIComponent(uuid_(pageId)));
    if (result.status !== 200 || result.json.in_trash) return;
    if (!belongsToDataSource_(result.json, requiredProp_('NOTION_DATA_SOURCE_ID'))) return;
    if (!hasProperty_(result.json, cfg.syncStatus)) return;
    if (readSelectProperty_(result.json, cfg.syncStatus) === cfg.statusError) return;
    patchPage_(pageId, {
      [cfg.syncStatus]: { select: { name: cfg.statusError } }
    });
  } catch (ignore) {}
}

function config_() {
  return {
    title: optionalProp_('PROP_TITLE', DEFAULTS.PROP_TITLE),
    schedule: optionalProp_('PROP_SCHEDULE', DEFAULTS.PROP_SCHEDULE),
    duration: optionalProp_('PROP_DURATION', DEFAULTS.PROP_DURATION),
    description: optionalProp_('PROP_DESCRIPTION', DEFAULTS.PROP_DESCRIPTION),
    output: optionalProp_('PROP_OUTPUT', DEFAULTS.PROP_OUTPUT),
    eventId: optionalProp_('PROP_EVENT_ID', DEFAULTS.PROP_EVENT_ID),
    syncStatus: optionalProp_('PROP_SYNC_STATUS', DEFAULTS.PROP_SYNC_STATUS),
    lastSync: optionalProp_('PROP_LAST_SYNC', DEFAULTS.PROP_LAST_SYNC),
    statusNotInCalendar: optionalProp_('STATUS_NOT_IN_CALENDAR', DEFAULTS.STATUS_NOT_IN_CALENDAR),
    statusSynced: optionalProp_('STATUS_SYNCED', DEFAULTS.STATUS_SYNCED),
    statusError: optionalProp_('STATUS_ERROR', DEFAULTS.STATUS_ERROR),
    defaultMinutes: Math.max(1, Number(optionalProp_('DEFAULT_EVENT_MINUTES', DEFAULTS.DEFAULT_EVENT_MINUTES)) || 60)
  };
}

function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function requiredProp_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(name + ' is missing from Script Properties');
  return value;
}

function optionalProp_(name, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  return value === null || value === '' ? fallback : value;
}

function belongsToDataSource_(page, dataSourceId) {
  return (
    page &&
    page.parent &&
    page.parent.type === 'data_source_id' &&
    sameId_(page.parent.data_source_id, dataSourceId)
  );
}

function hasProperty_(page, propertyName) {
  return !!(propertyName && page && page.properties && page.properties[propertyName]);
}

function readTextProperty_(page, propertyName) {
  if (!hasProperty_(page, propertyName)) return '';
  const property = page.properties[propertyName];
  if (property.type === 'rich_text') return plain_(property.rich_text);
  if (property.type === 'title') return plain_(property.title);
  return '';
}

function readSelectProperty_(page, propertyName) {
  if (!hasProperty_(page, propertyName)) return '';
  const property = page.properties[propertyName];
  return property.type === 'select' && property.select ? property.select.name || '' : '';
}

function readNumberProperty_(page, propertyName) {
  if (!hasProperty_(page, propertyName)) return null;
  const property = page.properties[propertyName];
  return property.type === 'number' && typeof property.number === 'number' ? property.number : null;
}

function plain_(array) {
  return (array || [])
    .map(function(item) {
      return item.plain_text || (item.text && item.text.content) || '';
    })
    .join('');
}

function richTextWrite_(value) {
  return {
    rich_text: [{ type: 'text', text: { content: String(value) } }]
  };
}

function mapKey_(pageId) {
  return INTERNAL.MAP_PREFIX + norm_(pageId);
}

function mappedEventId_(pageId) {
  return PropertiesService.getScriptProperties().getProperty(mapKey_(pageId));
}

function setMappedEventId_(pageId, eventId) {
  PropertiesService.getScriptProperties().setProperty(mapKey_(pageId), eventId);
}

function deleteMappedEventId_(pageId) {
  PropertiesService.getScriptProperties().deleteProperty(mapKey_(pageId));
}

function allMappings_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const result = {};
  Object.keys(props).forEach(function(key) {
    if (key.indexOf(INTERNAL.MAP_PREFIX) === 0) {
      result[key.slice(INTERNAL.MAP_PREFIX.length)] = props[key];
    }
  });
  return result;
}

function norm_(id) {
  return String(id || '').replace(/-/g, '').toLowerCase();
}

function sameId_(a, b) {
  return norm_(a) === norm_(b);
}

function uuid_(id) {
  const value = norm_(id);
  if (value.length !== 32) return String(id || '');
  return (
    value.slice(0, 8) + '-' +
    value.slice(8, 12) + '-' +
    value.slice(12, 16) + '-' +
    value.slice(16, 20) + '-' +
    value.slice(20)
  );
}

function allDayDate_(yyyyMmDd) {
  const parts = yyyyMmDd.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function addDays_(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function sameDay_(a, b) {
  if (!a || !b) return false;
  const tz = calendar_().getTimeZone();
  return Utilities.formatDate(a, tz, 'yyyy-MM-dd') === Utilities.formatDate(b, tz, 'yyyy-MM-dd');
}

function unique_(values) {
  return Array.from(new Set(values));
}

function parseJson_(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function assertNotionOk_(result, operation) {
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(
      operation + ' failed: HTTP ' + (result ? result.status : 'unknown') + ' ' +
      (result ? result.text : '')
    );
  }
}

function requireSchemaType_(schema, name, expectedType) {
  if (!schema[name]) throw new Error('Required Notion property not found: ' + name);
  if (schema[name].type !== expectedType) {
    throw new Error('Notion property "' + name + '" must be type ' + expectedType + ', got ' + schema[name].type);
  }
}

function optionalSchemaType_(schema, name, expectedType) {
  if (!name || !schema[name]) {
    console.log('Optional property not found; feature disabled: ' + name);
    return;
  }
  if (schema[name].type !== expectedType) {
    throw new Error('Notion property "' + name + '" must be type ' + expectedType + ', got ' + schema[name].type);
  }
}

function validateStatusOptions_(propertySchema, cfg) {
  const options =
    propertySchema && propertySchema.select && propertySchema.select.options
      ? propertySchema.select.options.map(function(option) { return option.name; })
      : [];

  [cfg.statusNotInCalendar, cfg.statusSynced, cfg.statusError].forEach(function(name) {
    if (options.indexOf(name) === -1) {
      throw new Error(
        'Select property "' + cfg.syncStatus + '" is missing required option: ' + name
      );
    }
  });
}
