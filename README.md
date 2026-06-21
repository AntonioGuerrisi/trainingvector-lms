# TrainingVector LMS

TrainingVector LMS is a full stack business LMS application for training videos, course sequencing, progress tracking, role-based access, assignments, and reporting.

## About me
Hi, Antonio Guerrisi here and I’m the mind behind this project. I develop following the principles of Vibe Coding. For me, coding is as much about intuition and flow as it is about logic: it's about capturing an idea and turning it into reality while the energy is high.

Beyond this repository, I’m a creator constantly exploring new digital frontiers. You can see more of my work and philosophy over [my site](https://antonio.guerrisi.net).

If you find this project (or any of my work) interesting, please consider tapping the badge to <a href='https://ko-fi.com/J3J617WRZF' target='_blank'><img height='36' style='border:0px;height:24px;vertical-align:middle;' src='https://storage.ko-fi.com/cdn/kofi1.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>  
It’s a great way to fuel my next coding session and keep the vibes alive!

## Feedback and ideas
I built this because I needed it (or just thought it would be cool), but it’s a living thing. If you stumble upon a bug, have an idea that would make this 10x better, or just want to suggest a new feature, don’t be a stranger; open an Issue! I’m all ears (and usually looking for an excuse to open up the editor again).

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn-style UI primitives, lucide-react
- Backend: Node.js, Express, TypeScript, Prisma
- Database: PostgreSQL
- Cache: Redis
- Local deployment: Docker Compose with separate frontend, backend, database, and cache services

## Quick Start With Docker

```bash
docker compose up --build
```

Open:

- Frontend: http://localhost:5173
- Backend health check: http://localhost:4000/api/health

## Development

```bash
npm install
copy .env.example .env
npm run db:push
npm run seed
npm run dev
```

Demo accounts created by the seed script:

- Admin: `admin@lms.local` / `admin123`
- Professor: `professor@lms.local` / `professor123`
- Student: `student@lms.local` / `student123`

## Versioning

The canonical application version is stored in `VERSION` with the format `major.minor.revision+build`.

Use these commands instead of editing version files manually:

```bash
npm run version:revision
npm run version:feature
npm run version:major
```

Install the automatic Git pre-commit version hook after initializing or cloning the repository:

```bash
npm run version:install-hook
```

## Implemented Features

- JWT login and `STUDENT`, `PROFESSOR`, `ADMIN` roles
- Course and video management with sequential content unlocking
- Standalone video assignments
- MP4 upload for administrators
- H5P-compatible popup and interaction configuration in the video player
- Video progress and completion tracking
- H5P/xAPI-style event recording
- Completion and progress reports
- Course or standalone video assignments to users or groups
- Docker Compose services split by responsibility
