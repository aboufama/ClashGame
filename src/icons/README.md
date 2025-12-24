# Icons

This folder contains all CSS-based pixel icons.

Files
- `src/icons/accurate-icons.css`: troop, building, resource, and obstacle icons.
- `src/icons/ui-icons.css`: small UI/action icons (move/delete/upgrade).
- `src/icons/index.css`: import hub used by `src/App.css`.

How to add an icon
- Add a class in `src/icons/accurate-icons.css` or `src/icons/ui-icons.css`.
- Use the naming convention `<id>-icon::before` (for example, `archer-icon::before`).
- Render it with `<div class="icon <id>-icon"></div>`.

Sizing
- Base sizes live in `src/App.css` under the `.icon` rules.
