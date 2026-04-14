# GEMINI.md - Moodle Enhancer for Ritsumeikan

## 1. Project Overview

This project is a Chrome browser extension called "Moodle Enhancer for Ritsumeikan". Its purpose is to improve the user experience of the Ritsumeikan University Moodle LMS (`lms.ritsumei.ac.jp`).

*   **Phase 1 (Completed):** Automatic Download Organization. Sorts downloaded files into `Moodle/[Course Name]/[Original Filename]` using Moodle AJAX APIs (`core_course_get_courses_by_field`) and DOM analysis.
*   **Phase 2 (Ready for Implementation):** Moodle UX Overhaul. Includes Inline Course Expanders, Forced PDF Downloads, and Timetable Compacting. Detailed specs are located in `docs/phase2_requirements.md`.

## 2. Directory Structure & Architecture

The project has been refactored into a modern application structure:

```
src/
├── background/
│   └── background.js        (Service worker handling downloads via chrome.downloads API)
├── content/
│   ├── content.js           (Main content script, extracts sesskey and injects features)
│   └── (Phase 2 files will go here, e.g., force-download.js, timetable-compact.css)
├── lib/                     (Shared logic)
└── assets/                  (Icons)
docs/
├── phase2_requirements.md   (CRITICAL: Read this before starting Phase 2 work)
├── moodle_api_guide.md      (Guide on how to utilize Moodle AJAX Web Services)
└── architecture.md
manifest.json                (Manifest V3)
```

## 3. Essential Moodle Development Context

If you are an AI tasked with developing features for this extension, you MUST adhere to the following Moodle specifics:

1.  **API-First Approach**: Always try to fetch data (`core_course_get_contents`, `core_calendar_get_action_events_by_timesort`, etc.) using Moodle's built-in AJAX endpoint (`/lib/ajax/service.php`) rather than scraping the DOM, to prevent breakage when Moodle themes update.
2.  **Authentication (`sesskey`)**: You cannot call the Moodle API without a `sesskey`. In this extension, the content script (`content.js`) scrapes the `sesskey` from the logout link or hidden inputs on the page. Use this key when constructing Fetch API requests.
3.  **Forced Downloads**: To force a file on Moodle to download rather than open in the browser's PDF viewer, append `?forcedownload=1` (or `&forcedownload=1`) to the `pluginfile.php` URL.
4.  **Content Security Policy (CSP)**: Do not inject inline scripts via `document.createElement('script')` into the DOM, as it violates the extension's CSP. Always extract information visually or via standard `chrome.scripting.executeScript` from the background if needed.

## 4. Instructions for AI Assistant

Before starting any new implementation or modification:
1.  Read `docs/phase2_requirements.md` to understand the target features and UX goals.
2.  Verify the current state of `src/content/` to see what has already been implemented.
3.  Always respond in Japanese as requested by the user's global rules, and prioritize clean, modular code.
