- [x] Verify that the copilot-instructions.md file in the .github directory is created.

- [x] Clarify project requirements.

- [x] Scaffold the project.

- [x] Customize the project.

- [x] Install required extensions. None are required.

- [ ] Compile the project. Blocked: Node.js and npm are unavailable in this environment.

- [x] Create and run task. Not needed; `npm run dev` is documented in README.md.

- [ ] Launch the project. Blocked: Node.js and npm are unavailable in this environment.

- [x] Ensure documentation is complete. README.md and this file are present.

Project conventions:
- For UI and visual changes, follow the shared visual rules in `DESIGN_SYSTEM.md` and reuse the tokens in `src/index.css`.
- Keep facade calculations in `src/domain` and DXF interpretation in `src/dxf`.
- Keep Three.js geometry and viewer concerns separate from UI components.
- DXF profile dimensions are interpreted in millimeters.
- Run `npm run build` before shipping changes when Node.js is available.
