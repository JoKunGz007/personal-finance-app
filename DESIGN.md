# Design system

## Direction

The interface borrows from a bank reconciliation worksheet: a wide ruled ledger, restrained labels, and one persistent balance trace. The signature element is the balance rail beside the rows; a saffron diamond marks a known gap and the blue line resumes from the printed balance.

## Tokens

- Cool mist `#eaf0f4`: canvas
- Navy ink `#102b46`: primary text and rules
- Bank blue `#1769aa`: actions and active state
- Celadon `#bcdccc`: confirmation and privacy
- Saffron `#d99519`: warnings and resynchronization
- Restrained red `#aa3a3a`: blocking errors

IBM Plex Sans Thai is the body/display face and IBM Plex Mono is the data face. Both are bundled through Fontsource rather than requested from a third-party CDN. Tabular financial values use the mono face.

Avoid gradients, nested cards, KPI tiles, decorative motion, observation tooling, and color-only status. Support 320 px layouts, visible keyboard focus, native semantics, reduced motion, and the system dark preference.
