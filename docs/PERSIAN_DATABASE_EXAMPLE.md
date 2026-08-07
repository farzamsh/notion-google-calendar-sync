# Example: Persian Notion database mapping

You do not need English property names.

For example, a database can use:

| Meaning | Persian property | Type |
|---|---|---|
| Title | `عنوان` | Title |
| Calendar schedule | `زمان‌بندی` | Date |
| Duration | `مدت تخمینی (دقیقه)` | Number |
| Description | `توضیحات اجرایی` | Text |
| Expected output | `خروجی مورد انتظار` | Text |
| Google event ID | `شناسه رویداد تقویم` | Text |
| Sync status | `وضعیت تقویم` | Select |
| Last sync | `آخرین همگام‌سازی` | Date |

Add these Apps Script Script Properties:

```text
PROP_TITLE = عنوان
PROP_SCHEDULE = زمان‌بندی
PROP_DURATION = مدت تخمینی (دقیقه)
PROP_DESCRIPTION = توضیحات اجرایی
PROP_OUTPUT = خروجی مورد انتظار
PROP_EVENT_ID = شناسه رویداد تقویم
PROP_SYNC_STATUS = وضعیت تقویم
PROP_LAST_SYNC = آخرین همگام‌سازی
```

For a status field with values such as:

```text
وارد تقویم نشده
رویداد ایجاد شده
خطای همگام‌سازی
```

set:

```text
STATUS_NOT_IN_CALENDAR = وارد تقویم نشده
STATUS_SYNCED = رویداد ایجاد شده
STATUS_ERROR = خطای همگام‌سازی
```

This keeps the source code unchanged while adapting the integration to a localized workspace.
