# ghost-check

A single-file Python CLI that estimates how "AI-written" each person's messages
look in a **WhatsApp chat export**, or each file or page of a **PDF**. It writes
a self-contained HTML report with a bar chart comparing senders and a table per
sender, sorted by AI-likely %.

> **Heuristic, not proof.** ghost-check measures writing style, not where the
> text came from. Formal writers, non-native speakers, copy-pasted
> announcements and very short texts can all score high with no AI involved.
> Treat a high score as a reason to look closer, never as evidence against
> someone.

## Install

Needs Python 3.9+.

```bash
cd tools/ghost-check
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt     # pandas, matplotlib, pypdf
```

`pypdf` is only needed for PDF input.

## Export a WhatsApp chat

- **Android:** open the chat → ⋮ → More → Export chat → **Without media**
- **iPhone:** open the chat → tap the name → Export Chat → **Without Media**

You get a `.txt` file, or a `.zip` with `_chat.txt` inside. ghost-check reads either.

## Usage

```bash
# WhatsApp chat → report
python ghost_check.py "WhatsApp Chat with Team.txt"

# The .zip WhatsApp produces works too
python ghost_check.py chat.zip -o team-report.html

# A PDF: an essay, an assignment, or a chat saved as PDF
python ghost_check.py assignment.pdf

# Compare pages of a PDF against each other
python ghost_check.py assignment.pdf --by-page

# Several files in one report, plus a CSV of every message's scores
python ghost_check.py chat.txt essay1.pdf essay2.pdf --csv scores.csv
```

The report opens in any browser (`ghost-check-report.html` by default). The
terminal also prints a short summary:

```
sample_chat.txt: 15 messages (chat mode)

        scored   avg  AI-likely %
sender
Meera        4  65.6         75.0
Arjun        4  16.2          0.0
Riya         4   8.6          0.0
```

Try it on the bundled example: `python ghost_check.py examples/sample_chat.txt`.
The output is in `examples/sample_report.html`.

### Options

| Option | Default | What it does |
|---|---|---|
| `-o, --output PATH` | `ghost-check-report.html` | Where to write the HTML report |
| `--csv PATH` | – | Also write per-message scores and features to a CSV file |
| `--threshold N` | `50` | Score (0–100) at which a message counts as AI-likely |
| `--min-words N` | `6` | Skip messages shorter than this. Short texts like "ok" or "lol" give no signal |
| `--top N` | `25` | How many of each sender's highest-scoring messages to list |
| `--mode auto\|chat\|document` | `auto` | Force WhatsApp parsing or plain-document mode |
| `--by-page` | off | In document mode, treat every PDF page as its own "sender" |
| `--dayfirst` / `--monthfirst` | auto | Date order in the export, if auto-detection guesses wrong |

## PDF support

A PDF is handled in one of two ways, picked automatically:

1. **Chat PDF.** If the text contains WhatsApp-style lines (`12/03/2024, 9:05 am - Name: …`),
   it is parsed as a chat and scored per sender, the same as a `.txt` export.
2. **Document PDF.** Otherwise the text is split into paragraph-sized passages
   and each passage is scored. The "sender" is the file name, or the file name
   plus the page number with `--by-page`. Pass several PDFs to compare them.

Scanned PDFs have no text layer. Run them through OCR first (for example
`ocrmypdf in.pdf out.pdf`) and then run ghost-check on the result.

## How the score works

Each message gets five subscores between 0 and 1, where 1 is more AI-like:

| Feature | Weight | Why it signals AI |
|---|---|---|
| **Sentence length variance** | 20% | LLMs write evenly sized sentences. Low spread (coefficient of variation) of sentence lengths scores high |
| **Burstiness** | 20% | People alternate short and long sentences, while LLM rhythm is flat. This measures how much the length jumps between consecutive sentences |
| **Punctuation density** | 20% | Chat is lightly punctuated. Measures punctuation per word, capitalised and properly ended sentences, semicolons and em dashes (—). Lowercase starts and `!!!`/`??` pull the score down |
| **Average word length** | 15% | LLM vocabulary skews longer ("comprehensive", "additionally") than chat |
| **Repeated phrase patterns** | 25% | Stock LLM phrases ("it's worth noting", "feel free to", "delve"), repeated 3-grams inside a message, list/bold formatting, and 4-word phrases a sender reuses across 3+ messages (templated boilerplate) |

The message score is the weighted average × 100. Features that can't be
measured, such as burstiness for a one-sentence message, are left out and the
remaining weights are rescaled.

**Per sender:**
- **AI-likely %** is the share of that sender's scored messages at or above `--threshold`. The report sorts by this.
- **Avg score** is the mean message score.

Messages under `--min-words` are counted but not scored. Media placeholders,
deleted messages and system notices ("X joined", encryption notice) are dropped.

## Supported export formats

- Android: `31/12/23, 9:15 pm - Name: message`
- iOS: `[31/12/2023, 21:15:03] Name: message`
- 12- and 24-hour times, `/`, `.` or `-` date separators, 2- or 4-digit years
- Multi-line messages, `<This message was edited>` markers, and the invisible
  Unicode characters iOS inserts

Day/month order is detected from the file. If every date is ambiguous
(day ≤ 12), day-first is assumed. Use `--monthfirst` for US-style exports.

## Limitations

- The heuristics are tuned for English. Other languages and Hinglish are
  tokenised correctly, but the stock-phrase list and word-length ranges are
  English-centric.
- A few short messages are a weak sample. Trust senders with many scored messages more.
- Someone who edits AI output, or prompts it to "write casually", will score low.
- Scores are relative. They work best for comparing people in the same chat.
