/**
 * The Python driver run by Pyodide in the Python runner worker. The user's
 * code, the function name and the cases are passed in as globals (never
 * spliced into source), the code is compiled in its own namespace, and
 * each case's result is JSON-encoded in Python. Pure (strings only).
 */

export const PYTHON_DRIVER = String.raw`
import json, time, copy, sys, io, traceback

def __lee_error(e):
    return f"{type(e).__name__}: {e}"[:500]

def __lee_default(o):
    if isinstance(o, (set, frozenset)):
        return sorted(o, key=repr)
    raise TypeError(f"Return value of type {type(o).__name__} is not JSON-serialisable")

__lee_ns = {"__name__": "__solution__"}
__lee_out = io.StringIO()
__lee_compile_error = None
__lee_results = []
__lee_saved = sys.stdout
sys.stdout = __lee_out
try:
    try:
        __lee_code_obj = compile(__lee_code, "<solution>", "exec")
        exec(__lee_code_obj, __lee_ns)
    except SyntaxError as e:
        __lee_compile_error = f"SyntaxError: {e.msg} (line {e.lineno})"
    except Exception as e:
        __lee_compile_error = __lee_error(e)
    if __lee_compile_error is None and not callable(__lee_ns.get(__lee_fn)):
        __lee_compile_error = f"Define a function named {__lee_fn}."
    if __lee_compile_error is None:
        __lee_f = __lee_ns[__lee_fn]
        for __lee_i, __lee_args in enumerate(json.loads(__lee_cases)):
            __lee_t = time.perf_counter()
            try:
                __lee_r = __lee_f(*__lee_args)
                __lee_ms = (time.perf_counter() - __lee_t) * 1000
                __lee_case = {"ok": True, "output": json.loads(json.dumps(__lee_r, default=__lee_default, allow_nan=False)), "ms": __lee_ms}
            except RecursionError as e:
                __lee_case = {"ok": False, "error": "RecursionError: maximum recursion depth exceeded", "ms": (time.perf_counter() - __lee_t) * 1000}
            except Exception as e:
                __lee_case = {"ok": False, "error": __lee_error(e), "ms": (time.perf_counter() - __lee_t) * 1000}
            __lee_results.append(__lee_case)
            __lee_progress(__lee_i, json.dumps(__lee_case))
finally:
    sys.stdout = __lee_saved

json.dumps({"compileError": __lee_compile_error, "cases": __lee_results, "stdout": __lee_out.getvalue()[:8000]})
`

/** Milliseconds per call at one input, batched until a batch takes ≥ 5 ms. */
export const PYTHON_TIMER = String.raw`
def __lee_time(args_json):
    base = json.loads(args_json)
    f = __lee_ns[__lee_fn]
    k = 1
    while True:
        inputs = [copy.deepcopy(base) for _ in range(k)] if k <= 16 else None
        t = time.perf_counter()
        for i in range(k):
            f(*(inputs[i] if inputs is not None else base))
        dt = (time.perf_counter() - t) * 1000
        if dt >= 5 or k >= 4096 or dt > 200:
            return dt / k
        k *= 2
`
