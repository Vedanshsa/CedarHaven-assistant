"""Retrieval layer for the Cedarhaven assistant.

Pipeline (all deterministic, no network needed):

  PDF page text
    -> strip repeated header / footer boilerplate
    -> split into section-aware chunks (one chunk per numbered sub-section such as
       "BYL 1.2", plus separate chunks for callout paragraphs like "Document gap.")
    -> index with BM25 (word level) AND TF-IDF over character n-grams
    -> query: decompose into sub-queries, rank with both indexes, merge with
       a weighted score fusion, guarantee per-document coverage, apply a relevance gate.

Every chunk keeps (doc_id, page, section) so citations can look like
"CH-BYL-02 · p.2 · BYL 1.2" - the exact convention the PDFs ask for.
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from pypdf import PdfReader
from rank_bm25 import BM25Okapi
from sklearn.feature_extraction.text import TfidfVectorizer

PDF_DIR = Path(__file__).resolve().parent

# --------------------------------------------------------------------------- #
# Document registry
# --------------------------------------------------------------------------- #
DOC_REGISTRY = {
    "01": {"doc_id": "CH-SRM-01", "title": "Service Request Management", "prefix": "SRM"},
    "02": {"doc_id": "CH-BYL-02", "title": "By-law Enforcement", "prefix": "BYL"},
    "03": {"doc_id": "CH-PER-03", "title": "Permits and Licensing", "prefix": "PER"},
}

# Callout paragraphs that start with one of these labels become their own chunk.
# "gap" labels mark places where the document itself says a detail is NOT published.
GAP_LABELS = [
    "Collection schedule gap", "Document gap", "Not published", "Not specified",
    "Not covered", "Limits", "Critical absence test", "Safe-answer pattern",
]
OTHER_CALLOUT_LABELS = [
    "Important exception", "Important", "Safety first", "Dates matter", "Operations",
    "Scope distinction", "Cross-document rule", "Privacy reminder", "No guaranteed outcome",
    "Critical distinction", "Common trap", "Incomplete means not yet in review",
    "After issuance", "Document boundary", "Core service promise", "About Cedarhaven",
    "Fees are fictional exercise values", "Why this guide exists", "What approval means",
    "Citation convention", "Fictional exercise material",
]
_CALLOUT_RE = re.compile(
    r"^(" + "|".join(re.escape(x) for x in GAP_LABELS + OTHER_CALLOUT_LABELS) + r")[.:]\s",
)
_STRICT_LABELS = {"Operations", "Limits", "Important"}
_GAP_TEXT_RE = re.compile(
    r"not\s+(?:published|specified|defined|stated|provided|covered|included|available)"
    r"|do(?:es)?\s+not\s+(?:publish|specify|define|state|provide|set|establish|detail|"
    r"describe|include|have)"
    r"|intentionally\s+does\s+not|cannot\s+be\s+inferred|deliberately\s+outside"
    r"|no\s+universal\s+completion\s+deadline|are\s+not\s+in\s+the\s+supplied",
    re.IGNORECASE,
)

# Lines that are page furniture (identical on every page) and must not be indexed.
_BOILERPLATE_RE = re.compile(
    r"^(CEDARHAVEN\s*/\s*MUNICIPAL SERVICE LIBRARY"
    r"|CH-[A-Z]{3}-\d\d\s*\|\s*TRAINING ONLY"
    r"|CH-[A-Z]{3}-\d\d\s*\|\s*PAGE\s+\d+\s+OF\s+\d+"
    r"|FICTIONAL POLICY.*"
    r"|SERVICE REQUEST MANAGEMENT|BY-LAW ENFORCEMENT|PERMITS AND LICENSING)\s*$"
)
_SECTION_HEAD_RE = re.compile(r"^((?:SRM|BYL|PER)\s\d)\s*\|\s*(.+)$")
_SUBSECTION_RE = re.compile(r"^(\d)\.(\d)\s+(\S.*)$")

MAX_CHUNK_CHARS = 1500


@dataclass(frozen=True)
class Chunk:
    id: int
    text: str  # clean text shown to the LLM and used for quote verification
    filename: str
    doc_id: str
    doc_title: str
    page: int
    section: str  # e.g. "BYL 1.2" or "BYL 1" or "PER 7.1"
    heading: str  # human heading, e.g. "Construction equipment hours"
    kind: str = "section"  # section | callout | gap
    index_text: str = field(default="", compare=False)

    @property
    def citation(self) -> str:
        extra = f" ({self.heading})" if self.kind != "section" else ""
        return f"{self.doc_id} · p.{self.page} · {self.section}{extra}"


# --------------------------------------------------------------------------- #
# Text normalisation (shared with the answer validator)
# --------------------------------------------------------------------------- #
_TRANS = str.maketrans({
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "−": "-", " ": " ", "•": " ",
    "²": "2",
})


def normalize_text(text: str) -> str:
    """Whitespace/case/punctuation-insensitive form used for exact-evidence matching."""
    text = unicodedata.normalize("NFKC", text).translate(_TRANS)
    text = re.sub(r"\s*-\s*", "-", text)  # "a.m. - 5" vs "a.m.-5"
    text = re.sub(r"\s+", " ", text)
    return text.strip().casefold()


# --------------------------------------------------------------------------- #
# Tokenisation
# --------------------------------------------------------------------------- #
STOPWORDS = set(
    "a an the and or of to in on at for from by with without is are was were be been being it its this that "
    "these those as if then than so such do does did can could should would may might will shall must i me my "
    "we our you your they their he she him her what which who whom whose when where why how any all some "
    "there here about into over under up out off per not no yes also very just only more most other "
    "tell please give know want need get got have has had am s t ll d re ve whats "
    "answer answers question questions help info information explain say show ask asking something anything "
    "thing things hello hi hey thanks thank ok okay".split()
)
_SYNONYMS = {
    # money
    "penalty": ["fine", "ticket"], "fine": ["penalty", "ticket"], "fines": ["penalty", "ticket"],
    "ticket": ["fine", "penalty"], "cost": ["fee", "price"], "price": ["fee", "cost"],
    "fee": ["cost", "price"], "fees": ["cost", "price"], "pay": ["fee", "payment"], "charge": ["fee"],
    "compensation": ["compensation"], "refund": ["refunds"],
    # waste / roads
    "garbage": ["waste", "pickup", "collection"], "trash": ["waste", "garbage", "collection"],
    "rubbish": ["waste", "garbage"], "bin": ["waste", "collection"], "recycling": ["waste"],
    "pothole": ["road", "roadway"], "potholes": ["road", "roadway"], "street": ["road"],
    "light": ["streetlight"], "lamp": ["streetlight"], "outage": ["unlit"], "flicker": ["flickering"],
    "downed": ["fallen", "wire", "utility"], "fallen": ["downed", "wire"], "power": ["utility", "electrical"],
    "line": ["wire", "lot", "setback"], "wire": ["utility", "overhead"], "down": ["fallen"],
    "flood": ["flooding", "drainage"], "drain": ["catch", "basin", "drainage"],
    # noise / construction
    "tall": ["height", "maximum"], "high": ["height", "maximum"], "height": ["maximum", "tall"],
    "loud": ["noise", "sound"], "noisy": ["noise"], "noise": ["construction", "sound"],
    "saw": ["construction", "equipment", "noise"], "drill": ["construction", "equipment"],
    "hammer": ["construction", "equipment"], "weekend": ["saturday", "sunday"],
    "morning": ["a.m."], "night": ["overnight", "p.m."], "evening": ["p.m."], "hours": ["hours"],
    "renovation": ["structural", "addition", "interior"], "renovate": ["structural", "addition"],
    "extension": ["addition"], "remodel": ["structural", "interior"], "wall": ["load-bearing", "structural"],
    "build": ["construction", "building", "permit"], "building": ["construction", "permit"],
    # property
    "yard": ["front", "rear", "side"], "lawn": ["grass", "vegetation"], "weeds": ["grass", "vegetation"],
    "overgrown": ["grass", "vegetation", "unmanaged"], "grass": ["vegetation"], "junk": ["accumulation", "storage"],
    "fix": ["correct", "compliance"], "comply": ["compliance", "correct"], "far": ["setback", "distance"],
    "distance": ["setback"], "boundary": ["setback", "property"], "neighbour": ["neighbor"],
    "neighbor": ["neighbour"], "shed": ["accessory", "structure"], "garage": ["accessory", "structure"],
    "porch": ["deck"], "balcony": ["deck"], "patio": ["encroachment", "sidewalk"],
    "pool": ["swimming", "barrier"], "swimming": ["pool", "barrier"], "bylaw": ["law", "enforcement"],
    # animals / parking
    "dog": ["animal", "barking"], "barking": ["animal", "dog"], "pet": ["animal"], "cat": ["animal"],
    "car": ["parking", "vehicle"], "park": ["parking"], "parked": ["parking"], "tow": ["parking"],
    # admin
    "license": ["licence"], "licenses": ["licence"], "complain": ["complaint"], "complaints": ["complaint"],
    "report": ["request", "311"], "reports": ["request", "311"], "call": ["311", "contact"],
    "phone": ["contact", "telephone"], "restaurant": ["business", "patio", "licence"],
    "cafe": ["business", "patio"], "shop": ["business", "licence"], "store": ["business", "licence"],
    "tree": ["trees", "branch"], "sinkhole": ["p1", "urgent"], "emergency": ["urgent", "immediate"],
    "owner": ["identity", "details"], "name": ["identity", "personnel"], "who": ["identity"],
    "snow": ["winter"], "apply": ["application"], "form": ["application"], "wait": ["target", "business"],
    "long": ["target", "business", "days"], "quickly": ["target", "business", "days"],
    "soon": ["target", "business", "days"], "when": ["target"], "approval": ["permit", "approved"],
    "allowed": ["permitted", "permit"], "permission": ["permit"], "legal": ["permitted"],
}


def stem(tok: str) -> str:
    """Tiny suffix stripper - enough to unify plural / -ing forms in a small corpus."""
    for suf, rep in (("ies", "y"), ("sses", "ss"), ("ing", ""), ("ed", ""), ("es", ""), ("s", "")):
        if len(tok) > len(suf) + 3 and tok.endswith(suf):
            return tok[: -len(suf)] + rep
    return tok


def tokenize(text: str, keep_stopwords: bool = False) -> list[str]:
    toks = re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", unicodedata.normalize("NFKC", text).lower())
    toks = [t for t in toks if keep_stopwords or t not in STOPWORDS]
    return [stem(t) for t in toks]


def expand_query_tokens(question: str) -> list[str]:
    base = tokenize(question)
    extra: list[str] = []
    for raw in re.findall(r"[a-z0-9]+", question.lower()):
        for syn in _SYNONYMS.get(raw, []):
            extra.extend(tokenize(syn))
    return base + extra  # expansion tokens add recall; duplicates are fine for BM25


# --------------------------------------------------------------------------- #
# Ingestion: PDF -> section-aware chunks
# --------------------------------------------------------------------------- #
def _clean_lines(raw: str) -> list[str]:
    lines = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or _BOILERPLATE_RE.match(line):
            continue
        lines.append(line)
    return lines


def _split_long(text: str, limit: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split an oversized block on line boundaries, never mid-sentence of a line."""
    if len(text) <= limit:
        return [text]
    parts, cur = [], ""
    for line in text.split("\n"):
        # PDF extractors may return a whole page or paragraph as one long line.
        # Bound chunk size in that case too, splitting at word boundaries.
        units = [line[i:i + limit] for i in range(0, len(line), limit)] if len(line) > limit and " " not in line else [line]
        if len(units) == 1 and len(line) > limit:
            words, units, piece = line.split(), [], ""
            for word in words:
                if piece and len(piece) + len(word) + 1 > limit:
                    units.append(piece)
                    piece = word
                else:
                    piece = f"{piece} {word}".strip()
            if piece:
                units.append(piece)
        for unit in units:
            if cur and len(cur) + len(unit) + 1 > limit:
                parts.append(cur)
                cur = unit
            else:
                cur = f"{cur}\n{unit}" if cur else unit
    if cur:
        parts.append(cur)
    return parts


def _chunks_from_page(pdf_path: Path, page_no: int, raw: str, start_id: int, metadata: dict | None = None) -> list[Chunk]:
    meta = metadata or DOC_REGISTRY.get(pdf_path.name[:2])
    if meta is None:
        raise ValueError(f"No document metadata supplied for {pdf_path.name}")
    prefix = meta["prefix"]
    if metadata is not None:
        # Uploaded files do not share Cedarhaven's section numbering. Keep each extracted
        # paragraph as its own evidence unit so citations never point at an entire page.
        paragraphs = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", raw) if p.strip()]
        if len(paragraphs) <= 1:
            lines = _clean_lines(raw)
            paragraphs, current = [], ""
            for line in lines:
                current = f"{current} {line}".strip()
                if re.search(r"[.!?][\"')\]]?$", line):
                    paragraphs.append(current)
                    current = ""
            if current:
                paragraphs.append(current)
        chunks, cid = [], start_id
        for paragraph_no, paragraph in enumerate(paragraphs, 1):
            for part in _split_long(paragraph, limit=1200):
                if len(part) < 15:
                    continue
                heading = f"Paragraph {paragraph_no}"
                label = f"{prefix} p.{page_no}"
                chunks.append(Chunk(id=cid, text=part, filename=pdf_path.name,
                    doc_id=meta["doc_id"], doc_title=meta["title"], page=page_no,
                    section=label, heading=heading, kind="section",
                    index_text=f"{meta['title']} {label} {heading}\n{part}"))
                cid += 1
        return chunks
    lines = _clean_lines(raw)

    section = f"{prefix} (overview)"
    page_title = ""
    sub_label, sub_heading = None, ""
    # blocks: (section_label, heading, kind, [lines])
    blocks: list[list] = []
    current: list | None = None

    def start(label: str, heading: str, kind: str):
        nonlocal current
        current = [label, heading, kind, []]
        blocks.append(current)

    start(section, "Page overview", "section")
    prev_line = ""
    for line in lines:
        m_head = _SECTION_HEAD_RE.match(line)
        m_sub = _SUBSECTION_RE.match(line)
        m_call = _CALLOUT_RE.match(line)
        # A callout starts a new chunk. A few ambiguous labels ("Operations.") may also appear
        # mid-sentence after a line wrap, so those need a sentence end on the previous line.
        callout_ok = bool(m_call) and (
            m_call.group(1) not in _STRICT_LABELS or not prev_line or bool(re.search(r"[.!?:)\"]$", prev_line))
        )
        if m_head:
            section = m_head.group(1)
            page_title = m_head.group(2).strip()
            current[0], current[1] = section, page_title
            current[3].append(line)
        elif m_sub and m_sub.group(1) == section.split()[-1]:
            sub_label = f"{prefix} {m_sub.group(1)}.{m_sub.group(2)}"
            sub_heading = m_sub.group(3).strip()
            start(sub_label, sub_heading, "section")
            current[3].append(line)
        elif callout_ok:
            label = m_call.group(1)
            kind = "gap" if label in GAP_LABELS else "callout"
            start(section, label, kind)
            current[3].append(line)
        else:
            if current is not None:
                current[3].append(line)
        prev_line = line

    chunks: list[Chunk] = []
    cid = start_id
    for label, heading, kind, blines in blocks:
        text = "\n".join(blines).strip()
        if len(text) < 25:
            continue
        for part in _split_long(text):
            doc_words = f"{meta['title']} {label} {heading}"
            chunks.append(Chunk(
                id=cid, text=part, filename=pdf_path.name, doc_id=meta["doc_id"],
                doc_title=meta["title"], page=page_no, section=label, heading=heading, kind=kind,
                index_text=f"{doc_words}\n{part}",
            ))
            cid += 1
    return chunks


def load_chunks(pdf_dir: Path = PDF_DIR) -> list[Chunk]:
    pdfs = sorted(p for p in Path(pdf_dir).glob("*.pdf") if p.is_file() and p.name[:2] in DOC_REGISTRY)
    if not pdfs:
        raise FileNotFoundError(f"No Cedarhaven PDFs (01_/02_/03_*.pdf) found in {pdf_dir}")
    chunks: list[Chunk] = []
    cid = 0
    for pdf in pdfs:
        reader = PdfReader(str(pdf))
        for page_no, page in enumerate(reader.pages, start=1):
            page_chunks = _chunks_from_page(pdf, page_no, page.extract_text() or "", cid)
            chunks.extend(page_chunks)
            cid += len(page_chunks)
    if not chunks:
        raise ValueError("No extractable text found in the PDFs.")
    return chunks


def is_gap_chunk(chunk: Chunk) -> bool:
    return chunk.kind == "gap" or bool(_GAP_TEXT_RE.search(chunk.text))


# --------------------------------------------------------------------------- #
# Retrieval
# --------------------------------------------------------------------------- #
def _split_subqueries(question: str) -> list[str]:
    """'deck and power saw on Saturday' -> also search each clause on its own."""
    parts = re.split(r"\?|;|\band also\b|\balso\b|\bplus\b|\band\b|&|,|\bbut\b|\bwhile\b", question, flags=re.I)
    subs = [p.strip() for p in parts if len(tokenize(p)) >= 2]
    return subs if len(subs) > 1 else []


class CedarhavenRAG:
    def __init__(self, pdf_dir: Path = PDF_DIR, rrf_k: int = 60):
        self.pdf_dir = Path(pdf_dir)
        self.rrf_k = rrf_k
        self.chunks: list[Chunk] = load_chunks(self.pdf_dir)

        self._tok = [tokenize(c.index_text) for c in self.chunks]
        self.bm25 = BM25Okapi(self._tok)
        self.vocab = {t for toks in self._tok for t in toks}
        n = len(self.chunks)
        df: dict[str, int] = {}
        for toks in self._tok:
            for t in set(toks):
                df[t] = df.get(t, 0) + 1
        self.idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}

        self.oov_idf = 0.6 * float(np.median(list(self.idf.values())))
        self.tfidf = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, min_df=1)
        self.tfidf_matrix = self.tfidf.fit_transform([c.index_text.lower() for c in self.chunks])

    # -- scoring ------------------------------------------------------------ #
    def _scores(self, query: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Three independent signals for every chunk: BM25 on the question's own words,
        BM25 on synonym-expanded words (weaker), and TF-IDF over character n-grams
        (robust to typos / unseen word forms such as 'licence' vs 'license')."""
        base = tokenize(query)
        exp = [t for t in expand_query_tokens(query)[len(base):] if t not in set(base)]
        n = len(self.chunks)
        bm_base = np.asarray(self.bm25.get_scores(base), dtype=float) if base else np.zeros(n)
        bm_exp = np.asarray(self.bm25.get_scores(exp), dtype=float) if exp else np.zeros(n)
        qv = self.tfidf.transform([" ".join(base) or query.lower()])
        tf = np.asarray((self.tfidf_matrix @ qv.T).todense()).ravel()
        return bm_base, bm_exp, tf

    def _coverage(self, query: str, chunk_idx: int) -> float:
        """Share of the question's IDF mass that this chunk contains.

        Each question word is a 'concept': it counts as present when the chunk contains the word
        or one of its lexicon synonyms. Words that are unknown to the whole corpus (e.g. 'mayor',
        'Paris') keep a fixed weight in the denominator, so off-topic questions score low even
        when a few generic words match."""
        raws = [r for r in re.findall(r"[a-z0-9]+", query.lower()) if r not in STOPWORDS]
        if not raws:
            return 0.0
        have = set(self._tok[chunk_idx])
        total = hit = 0.0
        for raw in raws:
            alts = {stem(raw)} | {stem(a) for syn in _SYNONYMS.get(raw, []) for a in tokenize(syn)}
            known = [a for a in alts if a in self.idf]
            w = max((self.idf[a] for a in known), default=self.oov_idf)
            total += w
            if any(a in have for a in known):
                hit += w
        return hit / total if total else 0.0

    def search(
        self,
        query: str,
        top_k: int = 7,
        per_doc_cap: int = 4,
        gate_coverage: float = 0.34,
    ) -> list[dict]:
        """Return ranked evidence dicts. Empty list == the question is off-topic for the corpus."""
        query = (query or "").strip()
        if not query or top_k <= 0:
            return []

        # A question with no real word in it ("1+1", "???", "answer") is never a municipal question.
        if not any(re.search(r"[a-z]", r) for r in re.findall(r"[a-z0-9]+", query.lower()) if r not in STOPWORDS):
            return []

        # Most of the question's content words must be known to the corpus (directly or via the lexicon).
        concepts = [r for r in re.findall(r"[a-z0-9]+", query.lower()) if r not in STOPWORDS and re.search(r"[a-z]", r)]
        known = sum(1 for r in concepts if any(stem(a) in self.idf for a in [r] + [x for syn in _SYNONYMS.get(r, []) for x in tokenize(syn)]))
        if concepts and known / len(concepts) < 0.6:
            return []

        queries = [query] + _split_subqueries(query)
        n = len(self.chunks)
        fused = np.zeros(n)
        sig = {"bm25": np.zeros(n), "tfidf": np.zeros(n), "cov": np.zeros(n)}
        for qi, q in enumerate(queries):
            bm_b, bm_e, tf = self._scores(q)
            weight = 1.0 if qi == 0 else 0.8
            cov = np.array([self._coverage(q, i) for i in range(n)])
            score = (
                0.45 * bm_b / (bm_b.max() or 1.0)
                + 0.12 * bm_e / (bm_e.max() or 1.0)
                + 0.18 * tf / (tf.max() or 1.0)
                + 0.25 * cov
            )
            fused = np.maximum(fused, weight * score)  # best sub-query wins per chunk
            sig["bm25"] = np.maximum(sig["bm25"], bm_b)
            sig["tfidf"] = np.maximum(sig["tfidf"], tf)
            sig["cov"] = np.maximum(sig["cov"], cov)

        # Callouts that state a gap are small and keyword-poor; nudge them when they matched.
        for i in range(n):
            if fused[i] > 0 and is_gap_chunk(self.chunks[i]):
                fused[i] *= 1.08

        ranked = [int(i) for i in np.argsort(-fused) if fused[i] > 0]
        if not ranked or sig["cov"][ranked[:10]].max() < gate_coverage:
            return []

        selected: list[int] = []
        per_doc: dict[str, int] = {}
        for idx in ranked:
            doc = self.chunks[idx].doc_id
            if per_doc.get(doc, 0) >= per_doc_cap:
                continue
            selected.append(idx)
            per_doc[doc] = per_doc.get(doc, 0) + 1
            if len(selected) >= top_k:
                break

        # Multi-document coverage: a document with a clearly matching chunk that missed the cut
        # (cross-document questions such as "deck + Saturday saw") gets its best chunk added.
        covered = {self.chunks[i].doc_id for i in selected}
        for idx in ranked[:25]:
            doc = self.chunks[idx].doc_id
            if doc not in covered and sig["cov"][idx] >= gate_coverage:
                selected.append(idx)
                covered.add(doc)

        results = []
        q_terms = set(tokenize(query))
        for rank, idx in enumerate(selected, start=1):
            c = self.chunks[idx]
            matched = sorted(q_terms & set(self._tok[idx]))
            results.append({
                "rank": rank, "id": c.id, "text": c.text, "filename": c.filename,
                "doc_id": c.doc_id, "doc_title": c.doc_title, "page": c.page,
                "section": c.section, "heading": c.heading, "kind": c.kind,
                "is_gap": is_gap_chunk(c), "citation": c.citation,
                "score": round(float(fused[idx]), 3),
                "bm25": round(float(sig["bm25"][idx]), 2),
                "tfidf": round(float(sig["tfidf"][idx]), 3),
                "coverage": round(float(sig["cov"][idx]), 2),
                "matched_terms": matched, "matched_term_count": len(matched),
            })
        return results
