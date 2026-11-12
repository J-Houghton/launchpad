// Launchpad configuration — loaded by index.html, no rebuild needed.
// Edit by hand (keep it valid JSON after the "="), or use the page's settings
// (the gear at the bottom of the page, or Ctrl+,) and save to this file.
//
// Each card holds tiles, each with a "name", a "url" and an optional "label" (a short tag).
// For a launch page, turn on "useColumns" and list your "columns" (e.g. DEV, TEST, PROD); each
// tile then names its "column", and they line up from card to card. "layout" places everything
// on a 12-column grid, and "look" sets its style and background. See the README for examples.
window.LAUNCHPAD_CONFIG = {
  "version": 4,
  "site": { "title": "Launchpad", "heading": "Projects", "footer": "Example setup · make it yours in Settings (Ctrl + ,)" },
  "statusChecks": false,
  "useColumns": false,
  "columns": [],
  "groups": [],
  "links": [
    { "label": "Mail", "url": "https://mail.example.com" },
    { "label": "Calendar", "url": "https://calendar.example.com" },
    { "label": "Notes", "url": "https://notes.example.com" }
  ],
  "cards": [
    {
      "id": "side-projects",
      "name": "Side projects",
      "description": "Things I'm building",
      "links": [
        { "label": "All repos", "url": "https://git.example.com/me", "icon": "git" }
      ],
      "tiles": [
        { "name": "Recipe box", "url": "https://recipes.example.com", "label": "WEB" },
        { "name": "Pixel editor", "url": "https://pixels.example.com", "label": "APP" },
        { "name": "Habit tracker", "url": "https://habits.example.com", "label": "APP" },
        { "name": "Blog", "url": "https://blog.example.com", "label": "WEB" },
        { "name": "Trail map", "url": "https://trails.example.com", "label": "WEB" },
        { "name": "Dotfiles", "url": "https://git.example.com/me/dotfiles", "label": "REPO" },
        { "name": "Home lab", "url": "https://git.example.com/me/homelab", "label": "REPO" }
      ]
    },
    {
      "id": "making",
      "name": "Making",
      "description": "Tools for design and drawing",
      "links": [],
      "tiles": [
        { "name": "Sketchbook", "url": "https://sketch.example.com" },
        { "name": "Colour palettes", "url": "https://palettes.example.com" },
        { "name": "Icon library", "url": "https://icons.example.com" },
        { "name": "Font finder", "url": "https://fonts.example.com" }
      ]
    },
    {
      "id": "learning",
      "name": "Learning",
      "description": "Courses, notes and reading",
      "links": [],
      "tiles": [
        { "name": "Systems course", "url": "https://learn.example.com/systems", "label": "COURSE" },
        { "name": "Reading list", "url": "https://reading.example.com", "label": "LIST" },
        { "name": "Language practice", "url": "https://lingo.example.com", "label": "DAILY" }
      ]
    },
    {
      "id": "reading",
      "name": "Reading",
      "description": "Blogs and newsletters",
      "newRow": false,
      "links": [],
      "tiles": [
        { "name": "Tech weekly", "url": "https://weekly.example.com", "label": "NEWS" },
        { "name": "A good blog", "url": "https://goodblog.example.com" }
      ]
    }
  ],
  "widgets": {
    "greeting": { "title": "Ready for liftoff", "subtitle": "Where to today?", "typing": true },
    "clock": {
      "zones": [
        { "label": "Local time", "timeZone": "local" },
        { "label": "UTC", "timeZone": "UTC" }
      ]
    },
    "weather": { "place": "London, England", "latitude": 51.5085, "longitude": -0.1257, "units": "celsius" }
  },
  "layout": {
    "density": "comfortable",
    "sections": [
      { "id": "greeting" },
      { "id": "clock", "span": 3, "newRow": false },
      { "id": "weather", "span": 3, "newRow": false },
      { "id": "pinned" },
      { "id": "recent", "span": 5, "newRow": false },
      { "id": "cards" }
    ]
  },
  "look": { "theme": "system", "style": "aurora", "background": "particles" }
};
