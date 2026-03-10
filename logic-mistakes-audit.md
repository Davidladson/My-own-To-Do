# Codebase Orchestration Task: Logic Mistakes & UX Audit

## Overview
The goal is to conduct a thorough analysis of the application's core codebase to identify logical flaws, execution bugs, and user experience (UX) issues. The focus will be on the application's runtime files while explicitly excluding the `.agent` configuration and orchestration files.

## Project Type
**WEB** (Vanilla JavaScript, HTML, CSS with Supabase integration)

## Success Criteria
- [ ] Comprehensive report on identified logical and execution bugs in `app.js` and `sw.js`.
- [ ] Comprehensive report on UX issues and accessibility concerns in `index.html` and `style.css`.
- [ ] A consolidated findings report ready for the user to review before commencing fixes.

## Tech Stack
- Frontend: HTML5, Vanilla CSS (`style.css`), Vanilla JavaScript (`app.js`, `sw.js`).
- Backend/DB: Supabase (`supabase-setup.sql`).
- Deployment: GitHub Pages.

## File Structure / Scope of Analysis
The analysis is restricted to the following root-level files:
- `app.js` (Main application logic, state management, UI interactions)
- `sw.js` (Service worker, caching, offline capabilities, PWA logic)
- `index.html` (DOM structure, accessibility)
- `style.css` (Visual styling, UX rendering)
- `supabase-setup.sql` (Database schema and logic)

*(Note: The `.agent` directory is explicitly excluded).*

## Task Breakdown

### 1. Codebase Discovery and Mapping
- **Agent:** `explorer-agent`
- **Skill:** N/A (Native discovery)
- **INPUT:** Project root files (`app.js`, `sw.js`, `index.html`, `style.css`, `supabase-setup.sql`).
- **OUTPUT:** Map of the application's current state, component relationships, and data flow.
- **VERIFY:** Discovery report confirms exclusion of `.agent` directory and maps all target files.

### 2. Backend & Logic Execution Audit
- **Agent:** `backend-specialist`
- **Skill:** `nodejs-best-practices` (adapted for Vanilla JS logic), `database-design`
- **INPUT:** `app.js` (data fetching, state mutations, Supabase calls), `sw.js` (caching logic), `supabase-setup.sql`.
- **OUTPUT:** List of logical errors, race conditions, unhandled promise rejections, and state management flaws.
- **VERIFY:** Report clearly links identified bugs to specific line numbers and architectural flaws.

### 3. Frontend & UX Audit
- **Agent:** `frontend-specialist`
- **Skill:** `frontend-design`, `web-design-guidelines`
- **INPUT:** `index.html`, `style.css`, `app.js` (DOM manipulation logic).
- **OUTPUT:** List of UX issues, DOM manipulation bugs, accessibility (a11y) violations, and responsive design flaws.
- **VERIFY:** Report identifies specific DOM elements or CSS classes causing UX degradation.

### 4. Synthesize Findings and Generate Report
- **Agent:** `orchestrator`
- **Skill:** `plan-writing`
- **INPUT:** Findings from the `backend-specialist` and `frontend-specialist`.
- **OUTPUT:** A unified, detailed `audit-report.md` detailing all logical/execution bugs and UX issues.
- **VERIFY:** User reviews and approves the report before any fixes are initiated.

## Phase X: Verification (Pre-Fix)
Before moving to the implementation (fixing) phase, the following checks will be performed:
- [ ] Execute `lint_runner.py` (if applicable/configured) to catch syntax-level logic errors.
- [ ] Execute `ux_audit.py` to programmatically flag UX issues.
- [ ] Manual review of the `audit-report.md` by the user to authorize the fixing phase.

---

> **Note for User Review Required:** Please review this plan. Once approved, the agents will execute the analysis phase and generate the detailed report. Fixing will ONLY begin after you have reviewed the generated report.
