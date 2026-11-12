// Launchpad configuration — loaded by index.html, no rebuild needed.
// Edit by hand (keep it valid JSON after the "="), or use the page's settings
// (the gear at the bottom of the page, or Ctrl+,) and save to this file.
window.LAUNCHPAD_CONFIG = {
  "version": 3,
  "site": { "title": "Launchpad", "footer": "Example setup · make it yours in Settings (Ctrl + ,)" },
  "statusChecks": false,
  "environments": [
    { "id": "dev", "label": "DEV", "color": "#0b95da" },
    { "id": "test", "label": "TEST", "color": "#da950b" },
    { "id": "staging", "label": "STAGING", "color": "#8b5cf6" },
    { "id": "prod", "label": "PROD", "color": "#e61a5e", "caution": true }
  ],
  "groups": [
    { "id": "customer", "name": "Customer-facing" },
    { "id": "internal", "name": "Internal tools" }
  ],
  "links": [
    { "label": "Team wiki", "url": "https://wiki.example.com" },
    { "label": "Status page", "url": "https://status.example.com" },
    { "label": "Help desk", "url": "https://help.example.com" }
  ],
  "apps": [
    {
      "id": "storefront",
      "name": "Storefront",
      "description": "The public web shop",
      "group": "customer",
      "links": [
        { "label": "Docs", "url": "https://docs.example.com/storefront", "icon": "book" },
        { "label": "Repository", "url": "https://git.example.com/storefront", "icon": "git" }
      ],
      "envs": [
        { "env": "dev", "url": "https://dev.storefront.example.com", "name": "Latest build" },
        { "env": "test", "url": "https://test.storefront.example.com", "name": "QA sign-off" },
        { "env": "staging", "url": "https://staging.storefront.example.com", "name": "Pre-release" },
        { "env": "prod", "url": "https://storefront.example.com", "name": "Live" }
      ]
    },
    {
      "id": "customer-portal",
      "name": "Customer Portal",
      "description": "Accounts, orders and support requests",
      "group": "customer",
      "links": [
        { "label": "Docs", "url": "https://docs.example.com/portal", "icon": "book" },
        { "label": "Status", "url": "https://status.example.com/portal", "icon": "chart" }
      ],
      "envs": [
        { "env": "dev", "url": "https://dev.portal.example.com", "name": "Latest build" },
        { "env": "test", "url": "https://test.portal.example.com", "name": "QA sign-off" },
        { "env": "prod", "url": "https://portal.example.com", "name": "Live" }
      ]
    },
    {
      "id": "billing",
      "name": "Billing Service",
      "description": "Invoices, payments and refunds",
      "group": "internal",
      "links": [
        { "label": "API reference", "url": "https://docs.example.com/billing/api", "icon": "book" },
        { "label": "Runbook", "url": "https://wiki.example.com/billing/runbook", "icon": "terminal" },
        { "label": "Dashboards", "url": "https://metrics.example.com/billing", "icon": "chart" }
      ],
      "envs": [
        { "env": "dev", "url": "https://dev.billing.example.com", "name": "Latest build" },
        { "env": "test", "url": "https://test.billing.example.com", "name": "QA sign-off" },
        { "env": "staging", "url": "https://staging.billing.example.com", "name": "Pre-release" },
        { "env": "prod", "url": "https://billing.example.com", "name": "Live" }
      ]
    },
    {
      "id": "reporting",
      "name": "Reporting",
      "description": "Dashboards and scheduled exports",
      "group": "internal",
      "links": [
        { "label": "Docs", "url": "https://docs.example.com/reporting", "icon": "book" }
      ],
      "envs": [
        { "env": "dev", "url": "https://dev.reports.example.com", "name": "Latest build" },
        { "env": "test", "url": "https://test.reports.example.com", "name": "QA sign-off" },
        { "env": "prod", "url": "https://reports.example.com", "name": "Live" }
      ]
    }
  ],
  "widgets": {
    "greeting": { "enabled": true, "title": "Ready for liftoff", "subtitle": "Where to today?", "typing": true },
    "clock": {
      "enabled": true,
      "zones": [
        { "label": "Local time", "timeZone": "local" },
        { "label": "UTC", "timeZone": "UTC" }
      ]
    },
    "weather": { "enabled": true, "place": "London, England", "latitude": 51.5085, "longitude": -0.1257, "units": "celsius" }
  }
};
