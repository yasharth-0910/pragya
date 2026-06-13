"""CLI runner for the RAGAS evaluation (CLAUDE.md §10).

Run from the backend/ directory so the app modules import cleanly:

    python -m evaluation.run_eval --all              # generate A,B,C → score → table
    python -m evaluation.run_eval --method dense          # generate one experiment
    python -m evaluation.run_eval --method hybrid
    python -m evaluation.run_eval --method hybrid_rerank
    python -m evaluation.run_eval --score            # score all three from disk
    python -m evaluation.run_eval --table            # print the table from scored files

--all is the recommended single command: it runs the three generation phases in
order with a pause between them, then scores everything and prints the table.
Generation is the rate-limited half (Gemini free tier) — expect roughly half an
hour end to end, longer if 429s trigger retries. Don't rush it; a 429 costs more
time than the spacing does.
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Allow `python evaluation/run_eval.py …` as well as `-m evaluation.run_eval`.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from evaluation.ragas_eval import (  # noqa: E402
    METHODS,
    print_table,
    run_all,
    run_generation,
    score_all,
    score_faithfulness,
    score_faithfulness_all,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="RAGAS retrieval comparison (dense vs hybrid vs hybrid+rerank).",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--method",
        choices=METHODS,
        help="Run PHASE 1 generation for a single experiment.",
    )
    group.add_argument(
        "--score",
        action="store_true",
        help="Run PHASE 2 context_precision scoring (Groq judge) on all three result files.",
    )
    group.add_argument(
        "--faithfulness",
        nargs="?",
        const="all",
        choices=[*METHODS, "all"],
        help="Score faithfulness via local Ollama. Optionally a single method; default all. Resumable.",
    )
    group.add_argument(
        "--table",
        action="store_true",
        help="Run PHASE 3 — print the comparison table from scored files.",
    )
    group.add_argument(
        "--all",
        action="store_true",
        help="Run everything: generate A,B,C, then score, then print the table.",
    )
    args = parser.parse_args()

    if args.all:
        run_all()
    elif args.method:
        asyncio.run(run_generation(args.method))
    elif args.score:
        score_all()
    elif args.faithfulness:
        if args.faithfulness == "all":
            score_faithfulness_all()
        else:
            score_faithfulness(args.faithfulness)
    elif args.table:
        print_table()


if __name__ == "__main__":
    main()
