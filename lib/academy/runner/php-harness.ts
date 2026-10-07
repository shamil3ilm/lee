/**
 * PHP drivers for the PHP runner worker (php-wasm). The user's code is
 * written to its own file and `include`d inside try/catch, so a parse
 * error becomes a compile error instead of killing the request. Cases come
 * from a JSON file; results go out as one JSON document. Pure (strings).
 */

export const PHP_SOLUTION_PATH = '/tmp/lee-solution.php'
export const PHP_INPUT_PATH = '/tmp/lee-input.json'

/** Ensure the solution file starts in PHP mode. */
export function phpSource(code: string): string {
  const trimmed = code.trimStart()
  return trimmed.startsWith('<?php') || trimmed.startsWith('<?=') ? code : `<?php\n${code}`
}

const PRELUDE = String.raw`<?php
$__in = json_decode(file_get_contents('${PHP_INPUT_PATH}'), true);
$__fn = $__in['fn'];
$__ce = null;
ob_start();
try {
    include '${PHP_SOLUTION_PATH}';
} catch (\ParseError $e) {
    $__ce = 'Parse error: ' . $e->getMessage() . ' (line ' . $e->getLine() . ')';
} catch (\Throwable $e) {
    $__ce = get_class($e) . ': ' . $e->getMessage();
}
if ($__ce === null && !function_exists($__fn)) {
    $__ce = 'Define a function named ' . $__fn . '.';
}
`

const FLAGS = 'JSON_PRESERVE_ZERO_FRACTION | JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE'

export const PHP_CASES_DRIVER = String.raw`${PRELUDE}
$__res = [];
if ($__ce === null) {
    foreach ($__in['cases'] as $__args) {
        $__t = hrtime(true);
        try {
            $__out = $__fn(...$__args);
            $__res[] = ['ok' => true, 'output' => $__out, 'ms' => (hrtime(true) - $__t) / 1e6];
        } catch (\Throwable $e) {
            $__res[] = ['ok' => false, 'error' => substr(get_class($e) . ': ' . $e->getMessage(), 0, 500), 'ms' => (hrtime(true) - $__t) / 1e6];
        }
    }
}
$__stdout = ob_get_clean();
echo "\n__LEE_RESULT__" . json_encode([
    'compileError' => $__ce,
    'cases' => $__res,
    'stdout' => substr((string) $__stdout, 0, 8000),
    'memoryKb' => intdiv(memory_get_peak_usage(), 1024),
], ${FLAGS});
`

/** Milliseconds per call for one input, batched until a batch takes ≥ 5 ms. */
export const PHP_TIMER_DRIVER = String.raw`${PRELUDE}
$__ms = -1;
if ($__ce === null) {
    $__k = 1;
    while (true) {
        $__t = hrtime(true);
        for ($__i = 0; $__i < $__k; $__i++) {
            $__fn(...$__in['args']);
        }
        $__dt = (hrtime(true) - $__t) / 1e6;
        if ($__dt >= 5 || $__k >= 4096 || $__dt > 200) {
            $__ms = $__dt / $__k;
            break;
        }
        $__k *= 2;
    }
}
ob_end_clean();
echo "\n__LEE_RESULT__" . json_encode(['ms' => $__ms]);
`

export const RESULT_MARKER = '__LEE_RESULT__'

/** The JSON after the marker (anything before it is stray output). */
export function readMarked<T>(text: string): T | null {
  const i = text.lastIndexOf(RESULT_MARKER)
  if (i < 0) return null
  try {
    return JSON.parse(text.slice(i + RESULT_MARKER.length)) as T
  } catch {
    return null
  }
}

/** "PHP Fatal error: … in /tmp/lee-solution.php on line 3" → a short message. */
export function phpFatal(message: string): string {
  const line = message
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^(PHP )?(Parse|Fatal) error/.test(l))
  return (line ?? message.split('\n')[0] ?? 'PHP error').replace(/^PHP /, '').replace(/<[^>]+>/g, '').slice(0, 500)
}
