# GEMINI.md - Moodle Enhancer for Ritsumeikan

## Project Overview

This project is a Chrome browser extension called "Moodle Enhancer for Ritsumeikan". Its purpose is to improve the user experience of the Ritsumeikan University Moodle LMS (`lms.ritsumei.ac.jp`).

The extension was migrated from the previous "manaba+R Enhancer" (which targeted `ct.ritsumei.ac.jp`) when the university switched from manaba+R to Moodle.

### Current Features (Phase 1)

1.  **Automatic Download Organization:** It automatically sorts files downloaded from Moodle into a structured folder hierarchy: `Moodle/[Course Name]/[Original Filename]`. The course name is extracted from the page header (`h1`) or breadcrumb navigation on course and module pages.

### Planned Features (Future Phases)

2.  **Enhanced Dashboard:** (Phase 2) Inject unsubmitted assignment lists and a deadline calendar into the Moodle dashboard.
3.  **Google Calendar Integration:** (Phase 3) Register assignments to Google Calendar via Google Apps Script (GAS).

## Building and Running

There is no build process for this extension. To run or test the extension, load it directly into a Chromium-based browser:

1.  Open your browser and navigate to the extensions page (`chrome://extensions` or `edge://extensions`).
2.  Enable "Developer mode".
3.  Click the "Load unpacked" button.
4.  Select the folder where the `manifest.json` file is located.

## Development Conventions

*   **Code Style:** Modern JavaScript (ES6+) with `camelCase` naming. JSDoc comments for all functions.
*   **Dependencies:** No package manager. Third-party libraries are included directly.
*   **File Structure:**
    *   `manifest.json`: Core Chrome extension configuration.
    *   `content.js`: Content script that extracts and stores the current course name from Moodle pages.
    *   `background.js`: Service worker that intercepts downloads and organizes files into course-named folders.
    *   `style.css`: CSS rules for UI enhancements (Phase 2+).
    *   `options.html` / `options.js`: Settings page for GAS integration (Phase 3).
    *   Legacy files (`vanilla-calendar.*`, `GAS_SETUP.md`) are retained for future phases.

## Migration Notes (from manaba+R)

| Aspect | manaba+R | Moodle |
|--------|----------|--------|
| Domain | `ct.ritsumei.ac.jp` | `lms.ritsumei.ac.jp` |
| Course name selector | `#coursename` | `.page-header-headings h1` or `.breadcrumb-item a` |
| File download URL | Direct links from course pages | `pluginfile.php/...` or `mod/resource/view.php` |
| Course URL pattern | `/ct/course_*` | `/course/view.php?id=*` |
| Course name format | `番号:科目名` (§ separated) | Same format |
