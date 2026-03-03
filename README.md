# EKinLab

EKinLab is an interactive enzyme kinetics laboratory built as a single-page React application. It is designed to help students, educators, and self-learners explore core biochemical kinetics concepts in a visual and intuitive way.

The app combines simulation controls, mathematical models, and real-time charts so users can quickly understand how substrate concentration, enzyme concentration, inhibitors, temperature, pH, and pathway behavior influence reaction dynamics.

## Why this project exists

Many learners struggle to connect equations in textbooks with the behavior of real enzyme systems. EKinLab closes that gap by making kinetics immediately explorable.

Instead of static diagrams, users can:
- tune kinetic variables live,
- switch between model views,
- compare kinetic scenarios,
- and observe reaction progress over time.

## Core features

- Michaelis–Menten kinetics simulation.
- Lineweaver–Burk transformed view.
- Inhibition modes (none, competitive, non-competitive, uncompetitive).
- Time-course simulation for substrate/product behavior.
- Environmental modulation via temperature and pH factors.
- Single-enzyme and pathway mode (S → I → P).
- Clean UI with responsive controls and Chart.js plots.

## Tech stack

- React + TypeScript
- Vite
- Tailwind CSS
- Chart.js
- Lucide icons + Motion animations

## Deployment notes

This project uses Vite and is configured with `base: "./"`, making it suitable for static hosting environments such as shared hosting setups (for example, Hostinger-style deployments).

Typical deployment flow:
1. Install dependencies.
2. Build the production assets.
3. Upload the `dist/` directory to your host.

Detailed run and deployment steps are documented in [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## About the author

EKinLab is created by **Gadriel Gargard**, an independent builder focused on educational and scientific open-source work.

If you found this lab helpful in your classes, mentoring, research training, or personal learning journey, please consider supporting continued development.

## Support the project

Donations directly help fund:
- new educational lab features,
- improvements to simulation accuracy and usability,
- documentation and tutorials,
- and more open-source tools for science and learning.

You can support the author here:

**Buy Me a Coffee:** https://buymeacoffee.com/gadrielgargard7

Every contribution helps turn more ideas into open-source educational projects.

## Project status

Actively usable and ready for local development and static deployment.

For setup, local run, and navigation guidance, see [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).
