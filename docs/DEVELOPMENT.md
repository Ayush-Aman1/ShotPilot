# Development workflow

## Setup and launch

Use Node.js 22.12 or newer. Run `npm ci` to install locked dependencies.

| Task | Command | Address |
| --- | --- | --- |
| Ready-to-run production preview | `./startup.sh` | `http://127.0.0.1:5175/ShotPilot/` |
| Development with hot reload | `npm run dev` | `http://localhost:5173/` |
| Production build | `npm run build` | Writes `dist/` |
| Manual production preview | `npm run preview` | `http://localhost:4173/ShotPilot/` |

For the prepared macOS distribution, `Start-ShotPilot.command` runs `startup.sh`.
Use `./startup.sh --check` to verify setup or `--no-open` to skip opening a browser.
Keep the terminal open while using the app; Ctrl+C stops its server.

## Generated files

Change the generator or its inputs and rerun the relevant command instead of hand-editing
these outputs. Review regenerated diffs before committing.

| Generated output | Regenerate with |
| --- | --- |
| `src/assets/mesh2motionData.ts` | `npm run catalog:m2m` |
| `public/catalog/*.json` | `npm run catalog` |
| `package-lock.json` | `npm install` or `npm update`, as appropriate |

## Validation

Run `npm run check` for ESLint, TypeScript and all unit tests, then `npm run build`.
To lint and fix an individual edited source file, run `npx eslint --fix path/to/file.ts`,
then address any remaining errors. These commands can be run directly from a terminal;
no editor integration is required. CI runs the checks and build on pushes and pull requests.

For a render change, render a short take in the browser and inspect the exported files.
Use PNG output when exact ID colors or encoded depth values matter.

## Further guides

- [Architecture and conventions](../CONTRIBUTING.md)
- [Adding render passes](ADDING_RENDER_PASSES.md)
- [Saved-file format changes](FILE_FORMATS.md)
- [Architecture and Quest performance review](REVIEW_CHECKLIST.md)
