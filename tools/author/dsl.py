"""Мини-DSL для авторинга банка задач. Формат вывода совместим с эталоном (questions→tasks→parts/inputs)."""
import re
MODULES = []

def module(num, title, part):
    m = {"num": num, "title": title, "part": part, "lessons": []}
    MODULES.append(m); return m

def I(a, type="", v=None, tol=None):
    d = {"a": a, "type": type}
    if v is not None: d["v"] = v
    if tol is not None: d["tol"] = tol
    return d
def N(a, v=None): return I(str(a), "", v)
def LI(a, v=None): return I(a, "list", v)
def CO(a): return I(a, "coords")
def TX(a): return I(a, "text")
def C(options, correct):
    return {"a": options[correct], "type": "choice", "options": options}
def P(answer, grid):
    return {"a": answer, "type": "point", "grid": grid}

def T(label, parts, *inputs, e=None, fig=None):
    chunks = parts.split("{}")
    assert len(chunks) - 1 == len(inputs), (label, parts, len(inputs))
    out = []
    for i, ch in enumerate(chunks):
        if ch.strip(): out.append(ch.strip())
        if i < len(inputs): out.append({"_input": i})
    t = {"label": label, "parts": out, "inputs": [dict(x) if isinstance(x, dict) else N(x) for x in inputs]}
    if e: t["e"] = e
    if fig: t["fig"] = fig
    return t

def Q(title, sub, hints, *tasks, crumb=None):
    return {"title": title, "sub": sub, "hints": [hints] if isinstance(hints, str) else hints,
            "tasks": list(tasks), "crumb": crumb}

def lesson(mod, num, title, short, level, badge, exam, rules, sample, K, D):
    mod["lessons"].append({"num": num, "title": title, "short": short, "level": level, "badge": badge,
                           "exam": exam, "theory": {"rules": rules, "sample": sample}, "K": K, "D": D})

def grid(xmin=-6, xmax=6, ymin=-6, ymax=6, pts=None, segs=None, lines=None, poly=None, axes=True):
    g = {"xmin": xmin, "xmax": xmax, "ymin": ymin, "ymax": ymax, "axes": axes}
    if pts: g["pts"] = pts
    if segs: g["segs"] = segs
    if lines: g["lines"] = lines
    if poly: g["poly"] = poly
    return g
