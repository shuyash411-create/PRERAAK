#!/usr/bin/env python3
"""ghost-check: estimate how "AI-written" each sender's messages look.

Reads a WhatsApp chat export (.txt or the .zip WhatsApp produces) or a PDF,
scores every message with simple stylometric heuristics and writes a
self-contained HTML report with per-sender tables and a bar chart.

The score is a heuristic signal, not proof. Read the README before acting on it.
"""

from __future__ import annotations

import argparse
import base64
import html
import io
import re
import statistics
import sys
import zipfile
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

__version__ = "1.0.0"

# --------------------------------------------------------------------------
# Parsing
# --------------------------------------------------------------------------

_DATE = r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})"
_TIME = r"(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp])\.?\s*[Mm]\.?)?"
# Android: "31/12/23, 9:15 pm - Name: text"
ANDROID_RE = re.compile(rf"^{_DATE},?\s+{_TIME}\s+[-–]\s+(.*)$")
# iOS:     "[31/12/2023, 21:15:03] Name: text"
IOS_RE = re.compile(rf"^\[{_DATE},?\s+{_TIME}\]\s*(.*)$")

INVISIBLE = dict.fromkeys(map(ord, "‎‏‪‫‬‭‮﻿"), None)
SPACES = {0x202F: " ", 0x00A0: " ", 0x2007: " "}

SKIP_BODIES = re.compile(
    r"^(<media omitted>|<attached:.*>|.*\b(image|video|audio|sticker|gif|document|contact card) omitted"
    r"|this message was deleted|you deleted this message|null|missed (voice|video) call"
    r"|waiting for this message.*|poll:.*)$",
    re.IGNORECASE,
)
EDITED_SUFFIX = re.compile(r"\s*<this message was edited>\s*$", re.IGNORECASE)


@dataclass
class Record:
    sender: str
    timestamp: datetime | None
    message: str
    source: str


def _clean(line: str) -> str:
    return line.translate(INVISIBLE).translate(SPACES).rstrip("\r\n")


def _match(line: str):
    return ANDROID_RE.match(line) or IOS_RE.match(line)


def _detect_dayfirst(lines: list[str]) -> bool:
    """Infer dd/mm vs mm/dd from the whole export. Defaults to day-first."""
    for line in lines:
        m = _match(line)
        if not m:
            continue
        a, b = int(m.group(1)), int(m.group(2))
        if a > 12:
            return True
        if b > 12:
            return False
    return True


def _to_datetime(m: re.Match, dayfirst: bool) -> datetime | None:
    a, b, y, hh, mm, ss, ampm = m.groups()[:7]
    day, month = (int(a), int(b)) if dayfirst else (int(b), int(a))
    year = int(y) + (2000 if len(y) == 2 else 0)
    hour = int(hh)
    if ampm:
        ampm = ampm.lower()
        if ampm == "p" and hour != 12:
            hour += 12
        elif ampm == "a" and hour == 12:
            hour = 0
    try:
        return datetime(year, month, day, hour, int(mm), int(ss or 0))
    except ValueError:
        return None


def parse_whatsapp(text: str, source: str, dayfirst: bool | None = None) -> list[Record]:
    """Turn a WhatsApp export into records. Continuation lines join the previous
    message; system lines (no "Name: " prefix) and media placeholders are dropped."""
    lines = [_clean(l) for l in text.splitlines()]
    if dayfirst is None:
        dayfirst = _detect_dayfirst(lines)

    records: list[Record] = []
    current: Record | None = None
    for line in lines:
        m = _match(line)
        if m:
            if current:
                records.append(current)
            current = None
            rest = m.group(8)
            if ": " not in rest:  # system message ("X joined", "Messages are end-to-end encrypted")
                continue
            sender, body = rest.split(": ", 1)
            current = Record(sender.strip(), _to_datetime(m, dayfirst), body, source)
        elif current is not None:
            current.message += "\n" + line
    if current:
        records.append(current)

    out = []
    for r in records:
        r.message = EDITED_SUFFIX.sub("", r.message).strip()
        if r.message and not SKIP_BODIES.match(r.message):
            out.append(r)
    return out


def _paragraphs(text: str, max_words: int = 180) -> list[str]:
    """Split free text (e.g. from a PDF) into paragraph-sized chunks."""
    text = re.sub(r"-\n(?=[a-z])", "", text)  # de-hyphenate wrapped words
    chunks = []
    for para in re.split(r"\n\s*\n", text):
        para = re.sub(r"\s*\n\s*", " ", para).strip()
        if not para:
            continue
        words = para.split()
        if len(words) <= max_words:
            chunks.append(para)
            continue
        # Long block (PDFs often have no blank lines): regroup by sentence.
        buf: list[str] = []
        for sent in re.split(r"(?<=[.!?])\s+", para):
            buf.append(sent)
            if sum(len(s.split()) for s in buf) >= max_words * 0.75:
                chunks.append(" ".join(buf))
                buf = []
        if buf:
            chunks.append(" ".join(buf))
    return chunks


def parse_document(pages: list[str], source: str, by_page: bool) -> list[Record]:
    stem = Path(source).stem
    records = []
    for i, page in enumerate(pages, 1):
        sender = f"{stem} · p.{i}" if by_page else stem
        records += [Record(sender, None, p, source) for p in _paragraphs(page)]
    return records


def read_pdf_pages(path: Path) -> list[str]:
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("PDF input needs pypdf:  pip install pypdf")
    reader = PdfReader(str(path))
    pages = [(p.extract_text() or "") for p in reader.pages]
    if not any(p.strip() for p in pages):
        sys.exit(f"{path}: no extractable text (scanned PDF?). OCR it first, e.g. with ocrmypdf.")
    return pages


def read_text_file(path: Path) -> str:
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".txt")]
            if not names:
                sys.exit(f"{path}: no .txt chat file inside the zip")
            raw = z.read(names[0])
    else:
        raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def load(path: Path, mode: str, dayfirst: bool | None, by_page: bool) -> tuple[list[Record], str]:
    """Load any supported file. Returns (records, detected mode)."""
    if path.suffix.lower() == ".pdf":
        pages = read_pdf_pages(path)
        text = "\n".join(pages)
    else:
        text = read_text_file(path)
        pages = [text]

    if mode in ("auto", "chat"):
        chat = parse_whatsapp(text, path.name, dayfirst)
        if mode == "chat" or len(chat) >= 3:
            return chat, "chat"
    return parse_document(pages, path.name, by_page), "document"


# --------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------

# Phrases that show up far more in LLM output than in people's chats.
STOCK_PHRASES = [
    "it's important to note", "it is important to note", "it's worth noting", "it is worth noting",
    "delve", "in conclusion", "in summary", "additionally,", "furthermore,", "moreover,",
    "i hope this helps", "i hope this message finds you", "hope this message finds you",
    "feel free to", "let me know if you have any", "don't hesitate to", "great question",
    "certainly!", "absolutely!", "as an ai", "as a language model", "here's a", "here are some",
    "key takeaways", "navigate the", "tapestry", "in today's fast-paced", "a testament to",
    "plays a crucial role", "crucial role", "seamless", "leverage", "foster", "embark",
    "overall,", "ultimately,", "that being said", "on the other hand", "not only", "whether you're",
    "i understand your", "thank you for reaching out", "rest assured", "navigating",
    "comprehensive", "streamline", "elevate", "unlock", "empower",
]
_STOCK_RE = re.compile("|".join(re.escape(p) for p in STOCK_PHRASES))

PUNCT = set(".,;:!?—–-()\"'’“”…")
TERMINAL = ".!?…"

WEIGHTS = {
    "sentence_variance": 0.20,
    "burstiness": 0.20,
    "punctuation": 0.20,
    "word_length": 0.15,
    "repetition": 0.25,
}
FEATURE_LABELS = {
    "sentence_variance": "Uniform sentences",
    "burstiness": "Low burstiness",
    "punctuation": "Punctuation",
    "word_length": "Word length",
    "repetition": "Stock / repeated phrases",
}


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def _words(text: str) -> list[str]:
    """Tokens containing at least one letter, stripped of edge punctuation
    (works for any script, not just Latin)."""
    out = []
    for tok in text.split():
        tok = tok.strip("".join(PUNCT) + "*_~`[]{}<>")
        if any(ch.isalpha() for ch in tok):
            out.append(tok)
    return out


def _sentences(text: str) -> list[list[str]]:
    parts = re.split(r"(?<=[.!?…])\s+|\n+", text)
    return [w for w in (_words(p) for p in parts) if w]


def _ngrams(words: list[str], n: int) -> list[tuple[str, ...]]:
    lw = [w.lower() for w in words]
    return [tuple(lw[i : i + n]) for i in range(len(lw) - n + 1)]


def score_features(text: str) -> dict[str, float]:
    """Per-message subscores in [0, 1], where 1 = more AI-like.
    NaN means "not enough text to judge" and is left out of the weighted mean."""
    nan = float("nan")
    words = _words(text)
    n = len(words)
    sents = _sentences(text)
    lengths = [len(s) for s in sents]
    f: dict[str, float] = {"words": n, "sentences": len(sents)}

    # 1. Sentence length variance: LLMs write evenly sized sentences.
    if len(lengths) >= 2:
        mean = statistics.fmean(lengths)
        cv = statistics.pstdev(lengths) / mean if mean else 0
        f["sentence_variance"] = _clamp(1 - cv / 0.8)
    else:
        f["sentence_variance"] = nan

    # 2. Burstiness: how much the length jumps from one sentence to the next.
    #    Humans alternate short and long; LLM rhythm is flat.
    if len(lengths) >= 3:
        mean = statistics.fmean(lengths)
        jumps = statistics.fmean(abs(a - b) for a, b in zip(lengths, lengths[1:]))
        f["burstiness"] = _clamp(1 - (jumps / mean) / 0.9)
    else:
        f["burstiness"] = nan

    # 3. Punctuation density and "proper" punctuation habits.
    if n:
        collapsed = re.sub(r"([^\w\s])\1+", r"\1", text)  # "!!!" counts once
        collapsed = re.sub(r"(?<=\w)['’\-](?=\w)", "", collapsed)  # don't, well-known
        density = sum(ch in PUNCT for ch in collapsed) / n
        s = _clamp((density - 0.05) / 0.15)
        stripped = text.strip()
        starts = [p.strip()[:1] for p in re.split(r"(?<=[.!?…])\s+|\n+", stripped) if p.strip()]
        cased = [c for c in starts if c.isupper() or c.islower()]
        cap_ratio = sum(c.isupper() for c in cased) / len(cased) if cased else 0.5
        if "—" in text:  # em dash: a strong LLM tell in chat
            s += 0.3
        if ";" in text:
            s += 0.1
        if cap_ratio == 1 and stripped[-1:] in TERMINAL:
            s += 0.15  # every sentence capitalised and properly ended
        elif cap_ratio < 0.5:
            s -= 0.2  # lowercase sentence starts read like texting
        if re.search(r"[!?]{2,}|\.{4,}", text):  # "!!!", "??", "....." read human
            s -= 0.25
        f["punctuation"] = _clamp(s)
    else:
        f["punctuation"] = nan

    # 4. Average word length: LLM vocabulary skews longer than chat.
    if n:
        avg = statistics.fmean(len(w) for w in words)
        f["word_length"] = _clamp((avg - 3.6) / 1.6)
    else:
        f["word_length"] = nan

    # 5. Repeated phrase patterns (within-message part; the cross-message part
    #    is added in score_frame once all of a sender's messages are known).
    low = text.lower().replace("’", "'")
    hits = len(_STOCK_RE.findall(low))
    tri = _ngrams(words, 3)
    rep = (sum(c - 1 for c in Counter(tri).values() if c > 1) / len(tri)) if tri else 0
    structure = 0.2 if re.search(r"^\s*(\d+[.)]|[-•*])\s+\S", text, re.M) else 0
    structure += 0.1 if re.search(r"\*\*[^*]+\*\*", text) else 0
    f["repetition"] = _clamp(0.35 * hits + 1.5 * rep + structure)
    f["stock_hits"] = hits
    return f


def _combine(row: pd.Series) -> float:
    num = den = 0.0
    for k, w in WEIGHTS.items():
        v = row[k]
        if pd.notna(v):
            num += w * v
            den += w
    return 100 * num / den if den else float("nan")


def score_frame(df: pd.DataFrame, min_words: int) -> pd.DataFrame:
    feats = pd.DataFrame([score_features(t) for t in df["message"]], index=df.index)
    df = pd.concat([df, feats], axis=1)

    # Cross-message repetition: 4-grams a sender reuses in 3+ different messages
    # (copy-pasted AI boilerplate, templated sign-offs).
    grams = {i: set(_ngrams(_words(t), 4)) for i, t in df["message"].items()}
    for _, idx in df.groupby("sender").groups.items():
        counts = Counter(g for i in idx for g in grams[i])
        for i in idx:
            g = grams[i]
            if g:
                reused = sum(counts[x] >= 3 for x in g) / len(g)
                df.at[i, "repetition"] = _clamp(df.at[i, "repetition"] + 0.6 * reused)

    df["scored"] = df["words"] >= min_words
    df["score"] = df.apply(_combine, axis=1)
    df.loc[~df["scored"], "score"] = float("nan")
    return df


def summarize(df: pd.DataFrame, threshold: float) -> pd.DataFrame:
    scored = df[df["scored"]]
    g = scored.groupby("sender")
    summary = pd.DataFrame(
        {
            "messages_scored": g.size(),
            "avg_score": g["score"].mean(),
            "ai_likely_pct": g["score"].apply(lambda s: 100 * (s >= threshold).mean()),
            "avg_words": g["words"].mean(),
        }
    )
    for k in WEIGHTS:
        summary[k] = g[k].mean()
    total = df.groupby("sender").size().rename("messages_total")
    summary = summary.join(total, how="right").fillna({"messages_scored": 0})
    summary[["messages_scored", "messages_total"]] = summary[["messages_scored", "messages_total"]].astype(int)
    return summary.sort_values(["ai_likely_pct", "avg_score"], ascending=False, na_position="last")


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

BAR = "#2a78d6"
INK, INK2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"


def chart_png(summary: pd.DataFrame, threshold: float) -> str:
    data = summary.dropna(subset=["ai_likely_pct"]).iloc[::-1]  # highest at top
    if data.empty:
        return ""
    h = max(1.6, 0.42 * len(data) + 1.0)
    fig, ax = plt.subplots(figsize=(8, h), dpi=150)
    fig.patch.set_facecolor(SURFACE)
    ax.set_facecolor(SURFACE)
    labels = [s if len(s) <= 28 else s[:27] + "…" for s in data.index]
    bars = ax.barh(labels, data["ai_likely_pct"], color=BAR, height=0.6, zorder=2)
    for bar, pct, avg in zip(bars, data["ai_likely_pct"], data["avg_score"]):
        ax.text(bar.get_width() + 1.2, bar.get_y() + bar.get_height() / 2,
                f"{pct:.0f}%  (avg {avg:.0f})", va="center", fontsize=8.5, color=INK2)
    ax.set_xlim(0, 118)
    ax.set_xticks(range(0, 101, 25))
    ax.set_xticklabels([f"{t}%" for t in range(0, 101, 25)])
    ax.set_xlabel(f"Messages scoring ≥ {threshold:g} (AI-likely %)", color=INK2, fontsize=9)
    ax.grid(axis="x", color=GRID, linewidth=0.8, zorder=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=9, length=0)
    ax.tick_params(axis="y", colors=INK)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=SURFACE)
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()


def _band(score: float, threshold: float) -> str:
    if pd.isna(score):
        return "na"
    if score >= threshold:
        return "high"
    if score >= threshold - 15:
        return "mid"
    return "low"


def _fmt(v, digits=0) -> str:
    return "–" if pd.isna(v) else f"{v:.{digits}f}"


def render_html(df, summary, sources, threshold, min_words, top) -> str:
    e = html.escape
    png = chart_png(summary, threshold)
    feat_heads = "".join(f"<th>{e(FEATURE_LABELS[k])}</th>" for k in WEIGHTS)

    anchor = {sender: f"s-{i}" for i, sender in enumerate(summary.index)}
    rows = []
    for sender, s in summary.iterrows():
        rows.append(
            f"<tr><td><a href='#{anchor[sender]}'>{e(sender)}</a></td>"
            f"<td class='num'><span class='pill {_band(s.avg_score, threshold)}'>{_fmt(s.ai_likely_pct)}%</span></td>"
            f"<td class='num'>{_fmt(s.avg_score)}</td>"
            f"<td class='num'>{int(s.messages_scored)} / {int(s.messages_total)}</td>"
            f"<td class='num'>{_fmt(s.avg_words, 1)}</td>"
            + "".join(f"<td class='num'>{_fmt(100 * s[k])}</td>" for k in WEIGHTS)
            + "</tr>"
        )

    sections = []
    for sender, s in summary.iterrows():
        msgs = df[(df.sender == sender) & df.scored].sort_values("score", ascending=False)
        shown = msgs.head(top)
        body = []
        for _, m in shown.iterrows():
            ts = m.timestamp.strftime("%Y-%m-%d %H:%M") if pd.notna(m.timestamp) else ""
            body.append(
                f"<tr><td class='num'><span class='pill {_band(m.score, threshold)}'>{m.score:.0f}</span></td>"
                f"<td class='ts'>{e(ts)}</td><td class='msg'>{e(m.message)}</td>"
                + "".join(f"<td class='num'>{_fmt(100 * m[k])}</td>" for k in WEIGHTS)
                + "</tr>"
            )
        more = (f"<p class='muted'>Showing top {len(shown)} of {len(msgs)} scored messages.</p>"
                if len(msgs) > len(shown) else "")
        skipped = int(s.messages_total - s.messages_scored)
        sections.append(
            f"<section id='{anchor[sender]}'><h3>{e(sender)}"
            f" <span class='pill {_band(s.avg_score, threshold)}'>{_fmt(s.ai_likely_pct)}% AI-likely</span></h3>"
            f"<p class='muted'>Average score {_fmt(s.avg_score)} · {int(s.messages_scored)} messages scored"
            f" · {skipped} too short (&lt; {min_words} words) and skipped.</p>"
            + (f"<div class='scroll'><table><thead><tr><th>Score</th><th>Time</th><th>Message</th>{feat_heads}"
               f"</tr></thead><tbody>{''.join(body)}</tbody></table></div>{more}" if body else "")
            + "</section>"
        )

    generated = datetime.now().strftime("%Y-%m-%d %H:%M")
    chart = (f"<figure><img alt='Bar chart of AI-likely percentage per sender' "
             f"src='data:image/png;base64,{png}'></figure>") if png else "<p>No scorable messages.</p>"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ghost-check report</title>
<style>
:root {{ --bg:#fcfcfb; --card:#ffffff; --ink:#0b0b0b; --ink2:#52514e; --line:#e4e3df;
  --low:#e7f4e7; --lowink:#1d5e1d; --mid:#fdf1d8; --midink:#7a5200; --high:#fbe3e3; --highink:#9a2323; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#1a1a19; --card:#232322; --ink:#ffffff; --ink2:#c3c2b7;
  --line:#383835; --low:#1f3a1f; --lowink:#9fdc9f; --mid:#3d3218; --midink:#f5cf7a; --high:#4a2222; --highink:#f4a5a5; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }}
main {{ max-width:1100px; margin:0 auto; padding:24px 16px 64px; }}
h1 {{ font-size:24px; margin:0 0 4px; }} h2 {{ font-size:18px; margin:32px 0 8px; }} h3 {{ font-size:16px; margin:0 0 4px; }}
.muted {{ color:var(--ink2); margin:4px 0 12px; }}
.note {{ background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px 14px; color:var(--ink2); }}
figure {{ margin:0; background:#fcfcfb; border:1px solid var(--line); border-radius:8px; padding:8px; }}
figure img {{ width:100%; height:auto; display:block; }}
section {{ background:var(--card); border:1px solid var(--line); border-radius:8px; padding:16px; margin:16px 0; }}
.scroll {{ overflow-x:auto; }}
table {{ border-collapse:collapse; width:100%; background:var(--card); }}
th, td {{ border-bottom:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; }}
th {{ font-size:12px; color:var(--ink2); font-weight:600; white-space:nowrap; }}
td.num {{ text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }}
td.ts {{ white-space:nowrap; color:var(--ink2); font-size:12px; }}
td.msg {{ white-space:pre-wrap; min-width:280px; max-width:520px; overflow-wrap:anywhere; }}
a {{ color:inherit; }}
.pill {{ display:inline-block; padding:1px 8px; border-radius:999px; font-weight:600; font-size:12px; }}
.pill.low {{ background:var(--low); color:var(--lowink); }} .pill.mid {{ background:var(--mid); color:var(--midink); }}
.pill.high {{ background:var(--high); color:var(--highink); }} .pill.na {{ color:var(--ink2); }}
</style></head><body><main>
<h1>ghost-check report</h1>
<p class="muted">{e(", ".join(sources))} · generated {generated} · ghost-check {__version__}</p>
<p class="note">Scores are stylometric heuristics (0–100, higher = more AI-like). A message counts as
<b>AI-likely</b> when it scores ≥ {threshold:g}. Formal writers, non-native speakers and short
texts can score high without any AI involved, so treat this as a prompt to look closer, not as proof.</p>

<h2>Senders compared</h2>
{chart}

<h2>Summary</h2>
<div class="scroll"><table><thead><tr><th>Sender</th><th>AI-likely %</th><th>Avg score</th>
<th>Scored / total</th><th>Avg words</th>{feat_heads}</tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>
<p class="muted">Feature columns are 0–100 averages (higher = more AI-like).</p>

<h2>Per sender</h2>
{''.join(sections)}
</main></body></html>
"""


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="ghost-check",
        description="Score WhatsApp chats or PDFs for AI-written text and write an HTML report.",
    )
    p.add_argument("inputs", nargs="+", type=Path, help="WhatsApp export (.txt/.zip) or .pdf files")
    p.add_argument("-o", "--output", type=Path, default=Path("ghost-check-report.html"),
                   help="HTML report path (default: %(default)s)")
    p.add_argument("--csv", type=Path, help="also write per-message scores to this CSV")
    p.add_argument("--threshold", type=float, default=50,
                   help="score at which a message counts as AI-likely (default: %(default)s)")
    p.add_argument("--min-words", type=int, default=6,
                   help="skip messages shorter than this (default: %(default)s)")
    p.add_argument("--top", type=int, default=25,
                   help="messages listed per sender in the report (default: %(default)s)")
    p.add_argument("--mode", choices=["auto", "chat", "document"], default="auto",
                   help="auto-detect, force WhatsApp chat parsing, or treat as plain document")
    p.add_argument("--by-page", action="store_true",
                   help="document mode: compare PDF pages instead of whole files")
    dates = p.add_mutually_exclusive_group()
    dates.add_argument("--dayfirst", dest="dayfirst", action="store_true", default=None,
                       help="dates in the export are dd/mm (default: auto-detect)")
    dates.add_argument("--monthfirst", dest="dayfirst", action="store_false",
                       help="dates in the export are mm/dd")
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    records: list[Record] = []
    for path in args.inputs:
        if not path.exists():
            sys.exit(f"{path}: file not found")
        recs, mode = load(path, args.mode, args.dayfirst, args.by_page)
        print(f"{path.name}: {len(recs)} {'messages' if mode == 'chat' else 'passages'} ({mode} mode)")
        records += recs
    if not records:
        sys.exit("Nothing to analyse: no messages or text found.")

    df = pd.DataFrame([r.__dict__ for r in records])
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = score_frame(df, args.min_words)
    summary = summarize(df, args.threshold)

    args.output.write_text(
        render_html(df, summary, [p.name for p in args.inputs], args.threshold, args.min_words, args.top),
        encoding="utf-8",
    )
    if args.csv:
        df.to_csv(args.csv, index=False)

    print()
    print(summary[["messages_scored", "avg_score", "ai_likely_pct"]]
          .rename(columns={"messages_scored": "scored", "avg_score": "avg", "ai_likely_pct": "AI-likely %"})
          .round(1).to_string())
    print(f"\nReport written to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
