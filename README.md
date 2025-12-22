# Contract Clause Comparator

**Compare contracts in seconds, not hours.** Upload your template and a redlined version to instantly see what changed, assess risk, and make informed decisions.

![Powered by Case.dev](https://img.shields.io/badge/Powered%20by-Case.dev-blue)

## ✨ Features

- **Automatic clause extraction** — AI identifies indemnification, liability, confidentiality, and 12+ other clause types
- **Semantic matching** — Finds corresponding clauses even when reorganized
- **Side-by-side diffs** — See exactly what was added, removed, or modified
- **Risk scoring** — Each change gets a score (0-100) based on legal significance
- **Executive summaries** — AI-generated overview of the most important changes

## 🚀 Quick Start

```bash
# Clone and install
git clone https://github.com/CaseMark/contract-clause-comparator.git
cd contract-clause-comparator
npm install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and CASEDEV_API_KEY

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start comparing!

## 🔌 Powered by Case.dev

This app showcases [Case.dev](https://www.case.dev) — the API platform for legal technology.

**LLM API Features Used:**
- Clause extraction and classification
- Semantic clause matching across documents  
- Risk analysis with legal significance scoring
- Executive summary generation
- Automatic semantic tagging

Get your API key at [case.dev](https://www.case.dev/#apis)

## 🚢 Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/CaseMark/contract-clause-comparator)

Add these environment variables:
- `DATABASE_URL` — PostgreSQL connection string ([neon.tech](https://neon.tech) offers free tier)
- `CASEDEV_API_KEY` — Your Case.dev API key

## 🛠 Tech Stack

Next.js 14 • PostgreSQL • Drizzle ORM • Tailwind CSS • Case.dev LLM API

---

<p align="center">
  Built with ❤️ using <a href="https://www.case.dev">Case.dev</a>
</p>
