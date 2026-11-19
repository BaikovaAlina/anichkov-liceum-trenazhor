import json, sys, os
from fractions import Fraction
sys.path.insert(0, os.path.dirname(__file__))
import dsl
import c_alg1, c_alg2, c_alg3, c_geo
OUT = sys.argv[1]

def num(s):
    s = s.replace(",", ".").replace("−", "-").strip()
    if "/" in s:
        a, b = s.split("/"); return Fraction(a) / Fraction(b)
    return Fraction(s)

LETTERS = "абвгдежз"
lessons_out, tasks_out = [], {}
errors = 0; nq = nt = ni = 0
for m in dsl.MODULES:
    mo = {"num": m["num"], "title": m["title"], "part": m["part"], "lessons": []}
    for L in m["lessons"]:
        n = L["num"]
        for kind in ("K", "D"):
            key = f"{kind}-{n}"
            qs = []
            for qi, q in enumerate(L[kind], 1):
                q = dict(q); q["num"] = str(qi)
                if not q.get("crumb"): q["crumb"] = f"Урок {n}"
                tl = []
                for ti, t in enumerate(q["tasks"]):
                    t = json.loads(json.dumps(t)); nt += 1
                    g = f"{qi}{LETTERS[ti]}" if len(q["tasks"]) > 1 else f"{qi}"
                    k = len(t["inputs"])
                    for inp in t["inputs"]:
                        ni += 1
                        inp["g"] = g; inp["w"] = round(1 / k, 4) if k > 1 else 1
                        if "v" in inp:
                            val = eval(inp.pop("v"))
                            try:
                                if abs(float(num(inp["a"])) - float(val)) > 1e-9:
                                    print("MISMATCH", key, q["title"], t["label"][:50], inp["a"], val); errors += 1
                            except Exception as ex:
                                print("ERR", key, inp["a"], ex); errors += 1
                        if inp["type"] == "choice":
                            assert inp["a"] in inp["options"]
                        if inp["type"] == "point":
                            gr = inp["grid"]
                            for alt in inp["a"].split("|"):
                                x, y = map(int, alt.strip("()").split(";"))
                                assert gr["xmin"] <= x <= gr["xmax"] and gr["ymin"] <= y <= gr["ymax"], (key, alt)
                    tl.append(t)
                q["tasks"] = tl; qs.append(q); nq += 1
            tasks_out[key] = {
                "title": f"Урок {n} · " + ("Классная работа" if kind == "K" else "Домашнее задание"),
                "topic": L["title"], "badge": L["badge"], "lesson": n, "kind": kind, "questions": qs}
        mo["lessons"].append({k: L[k] for k in ("num", "title", "short", "level", "badge", "exam", "theory")})
    lessons_out.append(mo)

os.makedirs(f"{OUT}/data", exist_ok=True)
json.dump({"modules": lessons_out}, open(f"{OUT}/data/lessons.json", "w"), ensure_ascii=False, indent=1)
json.dump(tasks_out, open(f"{OUT}/data/tasks.json", "w"), ensure_ascii=False, indent=1)
print(f"modules={len(lessons_out)} lessons={sum(len(m['lessons']) for m in lessons_out)} variants={len(tasks_out)} questions={nq} tasks={nt} inputs={ni} errors={errors}")
