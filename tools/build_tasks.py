#!/usr/bin/env python3
"""Сборка js/tasks.js из data/lessons.json и data/tasks.json.

Источник истины — JSON в папке data/. Скрипт запускается автоматически
в GitHub Actions (deploy.yml) перед публикацией, а также вручную:
    python3 tools/build_tasks.py
Сайт подключает js/tasks.js как обычный <script>, поэтому работает и
при открытии index.html прямо с диска (file://), как эталон.
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
lessons = json.loads((ROOT / "data/lessons.json").read_text(encoding="utf-8"))
tasks = json.loads((ROOT / "data/tasks.json").read_text(encoding="utf-8"))

# --- валидация банка ---
errors = []
nums = [l["num"] for m in lessons["modules"] for l in m["lessons"]]
for n in nums:
    for k in ("K", "D"):
        if f"{k}-{n}" not in tasks:
            errors.append(f"нет варианта {k}-{n}")
for key, v in tasks.items():
    for q in v["questions"]:
        for t in q["tasks"]:
            n_inp = sum(1 for p in t["parts"] if isinstance(p, dict))
            if n_inp != len(t["inputs"]):
                errors.append(f"{key} зад.{q['num']}: полей {n_inp}, ответов {len(t['inputs'])}")
            for i in t["inputs"]:
                if i.get("type") == "choice" and i["a"] not in i.get("options", []):
                    errors.append(f"{key} зад.{q['num']}: ответ не среди вариантов")
if errors:
    print("ОШИБКИ БАНКА ЗАДАЧ:\n  " + "\n  ".join(errors)); sys.exit(1)

out = ("/* АВТОГЕНЕРИРУЕМЫЙ ФАЙЛ — не редактируйте вручную.\n"
       " * Источник: data/lessons.json и data/tasks.json; сборка: python3 tools/build_tasks.py */\n"
       "const LESSON_MODULES = " + json.dumps(lessons["modules"], ensure_ascii=False) + ";\n"
       "const TASKS = " + json.dumps(tasks, ensure_ascii=False) + ";\n")
(ROOT / "js/tasks.js").write_text(out, encoding="utf-8")
nq = sum(len(v["questions"]) for v in tasks.values())
nt = sum(len(q["tasks"]) for v in tasks.values() for q in v["questions"])
print(f"js/tasks.js собран: модулей {len(lessons['modules'])}, уроков {len(nums)}, работ {len(tasks)}, заданий {nq}, пунктов {nt}")
