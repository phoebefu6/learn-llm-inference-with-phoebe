"""Compare two canon JSON files by VALUE (relative tolerance 1e-9). Exit 0 if every value matches.
Self-test: python3 compare-ladder.py a.json b.json --plant  (perturbs one number by 0.1%; must FAIL)."""
import json, sys, math
def walk(a, b, p, bad):
    if isinstance(a, dict):
        if not isinstance(b, dict) or set(a) != set(b): bad.append((p, "keys", sorted(set(a) ^ set(b or {})))); return
        for k in a: walk(a[k], b[k], p + "." + k, bad)
    elif isinstance(a, list):
        if not isinstance(b, list) or len(a) != len(b): bad.append((p, "len")); return
        for i, (x, y) in enumerate(zip(a, b)): walk(x, y, p + "[%d]" % i, bad)
    elif isinstance(a, bool) or a is None or isinstance(a, str):
        if a != b: bad.append((p, a, b))
    else:
        if isinstance(b, bool) or b is None or not (math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12) or (math.isinf(a) and a == b)): bad.append((p, a, b))
def count(a):
    return sum(count(v) for v in a.values()) if isinstance(a, dict) else sum(count(v) for v in a) if isinstance(a, list) else 1
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2]))
if "--plant" in sys.argv: b["plans"]["full"]["total"] *= 1.001
bad = []; walk(a, b, "", bad)
print("values compared:", count(a), "mismatches:", len(bad))
for x in bad[:10]: print(x)
sys.exit(1 if bad else 0)
