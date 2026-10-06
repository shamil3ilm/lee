// A minimal JSON Schema (draft-07 subset) validator with no dependencies.
// Supported keywords: $ref (local "#/definitions/..."), type, required, properties,
// additionalProperties, items, minItems, maxItems, uniqueItems, minLength, maxLength,
// pattern, format (email, uri), enum, const, minimum, maximum.
// Any other keyword in the schema is rejected so the schema can't silently promise more
// than this validator checks.

const SUPPORTED = new Set([
  '$schema', '$id', '$comment', 'title', 'description', 'definitions', '$ref',
  'type', 'required', 'properties', 'additionalProperties', 'items',
  'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength',
  'pattern', 'format', 'enum', 'const', 'minimum', 'maximum',
]);

const FORMATS = {
  email: (v) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v),
  uri: (v) => {
    try {
      return Boolean(new URL(v).protocol);
    } catch {
      return false;
    }
  },
};

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  return actual === type;
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref "${ref}" (only local refs)`);
  const target = ref.slice(2).split('/').reduce((node, key) => (node ? node[key] : undefined), root);
  if (!target) throw new Error(`Unresolvable $ref "${ref}"`);
  return target;
}

function checkKeywords(schema) {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) throw new Error(`Schema keyword "${key}" is not supported by the validator`);
  }
}

function validateString(value, schema, path, errors) {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`${path}: must be at least ${schema.minLength} character(s)`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push(`${path}: must be at most ${schema.maxLength} characters`);
  }
  if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
    errors.push(`${path}: "${value}" does not match ${schema.pattern}`);
  }
  if (schema.format !== undefined) {
    const check = FORMATS[schema.format];
    if (!check) throw new Error(`Unsupported format "${schema.format}"`);
    if (!check(value)) errors.push(`${path}: "${value}" is not a valid ${schema.format}`);
  }
}

function validateArray(root, value, schema, path, errors) {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push(`${path}: must have at least ${schema.minItems} item(s)`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push(`${path}: must have at most ${schema.maxItems} items`);
  }
  if (schema.uniqueItems) {
    const seen = new Set();
    value.forEach((item, i) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) errors.push(`${path}/${i}: duplicate item ${key}`);
      seen.add(key);
    });
  }
  if (schema.items) value.forEach((item, i) => validateNode(root, item, schema.items, `${path}/${i}`, errors));
}

function validateObject(root, value, schema, path, errors) {
  for (const key of schema.required || []) {
    if (!(key in value)) errors.push(`${path || '/'}: missing required property "${key}"`);
  }
  const props = schema.properties || {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${key}`;
    if (key in props) validateNode(root, child, props[key], childPath, errors);
    else if (schema.additionalProperties === false) errors.push(`${childPath}: unknown property`);
    else if (typeof schema.additionalProperties === 'object') {
      validateNode(root, child, schema.additionalProperties, childPath, errors);
    }
  }
}

function validateNode(root, value, schemaIn, path, errors) {
  const schema = schemaIn.$ref ? resolveRef(root, schemaIn.$ref) : schemaIn;
  checkKeywords(schema);

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path || '/'}: expected ${types.join(' or ')}, got ${typeOf(value)}`);
      return;
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: must be ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  }

  const kind = typeOf(value);
  if (kind === 'string') validateString(value, schema, path, errors);
  if (kind === 'array') validateArray(root, value, schema, path, errors);
  if (kind === 'object') validateObject(root, value, schema, path, errors);
  if (kind === 'number' || kind === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: must be <= ${schema.maximum}`);
  }
}

/** Returns a list of human-readable errors; an empty list means the value is valid. */
export function validate(value, schema) {
  const errors = [];
  validateNode(schema, value, schema, '', errors);
  return errors;
}
