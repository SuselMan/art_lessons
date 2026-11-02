import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import ts from 'typescript';

/** Exact event keys only; this is intentionally not a general TypeScript evaluator.
 * Unsupported syntax is an error, never a silently incomplete event table. */
export function eventTable(entry: string, name: string, options: {
  root?: string;
  read?: (path: string) => string;
} = {}): Set<string> {
  const root = resolve(options.root ?? dirname(entry));
  const files = new Map<string, ts.SourceFile>();
  const active = new Set<string>();
  let bytes = 0, visits = 0;
  function fail(message: string): never { throw new Error(`runtime event table: ${message}`); }
  const contained = (file: string): string => {
    const path = resolve(file), rel = relative(root, path);
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)
      || path.endsWith('/sourceDefaultAutoVectorShader.ts')) fail('source outside allowed root');
    return path;
  };
  const source = (file: string): ts.SourceFile => {
    file = contained(file);
    const cached = files.get(file);
    if (cached) return cached;
    if (files.size >= 16) fail('file limit');
    if (!options.read) {
      contained(realpathSync(file));
      if (statSync(file).size > 1024 * 1024) fail('file byte limit');
    }
    const text = options.read ? options.read(file) : readFileSync(file, 'utf8');
    bytes += Buffer.byteLength(text);
    if (Buffer.byteLength(text) > 1024 * 1024 || bytes > 2 * 1024 * 1024) fail('source byte limit');
    const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if ((parsed as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.length) fail('invalid TypeScript');
    files.set(file, parsed);
    return parsed;
  };
  const declaration = (file: string, identifier: string, depth: number): Set<string> => {
    if (depth > 32 || ++visits > 4096) fail('resolution limit');
    file = contained(file);
    const key = `${file}:${identifier}`;
    if (active.has(key)) fail(`cyclic type ${identifier}`);
    active.add(key);
    try {
      const sf = source(file);
      const local = sf.statements.filter((s): s is ts.TypeAliasDeclaration | ts.InterfaceDeclaration => (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) && s.name.text === identifier);
      const imported: { module: string; name: string }[] = [];
      for (const s of sf.statements) {
        if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
        const bindings = s.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const spec of bindings.elements) if (spec.name.text === identifier) imported.push({ module: s.moduleSpecifier.text, name: spec.propertyName?.text ?? spec.name.text });
      }
      if (local.length + imported.length !== 1) fail(`unknown or ambiguous type ${identifier}`);
      if (local.length) {
        if (local[0].typeParameters?.length) fail('generic event alias');
        const node = local[0];
        if (ts.isInterfaceDeclaration(node)) {
          if (node.heritageClauses?.length) fail('interface inheritance is unsupported');
          return keys(ts.factory.createTypeLiteralNode(node.members), file, depth + 1);
        }
        return keys(node.type, file, depth + 1);
      }
      const ref = imported[0];
      if (!ref.module.startsWith('./') && !ref.module.startsWith('../')) fail('non-relative event import');
      let target = resolve(dirname(file), ref.module);
      if (extname(target) === '.js') target = target.slice(0, -3) + '.ts';
      else if (!extname(target)) target += '.ts';
      else if (extname(target) !== '.ts') fail('unsupported import extension');
      const targetSource = source(target);
      const exported = targetSource.statements.some(s => (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) && s.name.text === ref.name && s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
      if (!exported) fail(`unexported imported type ${ref.name}`);
      return declaration(target, ref.name, depth + 1);
    } finally { active.delete(key); }
  };
  const keys = (node: ts.TypeNode, file: string, depth: number): Set<string> => {
    if (depth > 32 || ++visits > 4096) fail('resolution limit');
    if (ts.isParenthesizedTypeNode(node)) return keys(node.type, file, depth + 1);
    if (ts.isIntersectionTypeNode(node)) return new Set(node.types.flatMap(n => [...keys(n, file, depth + 1)]));
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && !node.typeArguments?.length) return declaration(file, node.typeName.text, depth + 1);
    if (ts.isMappedTypeNode(node)) {
      const bound = node.typeParameter.constraint;
      if (node.nameType || node.members?.length || !bound || !ts.isTypeOperatorNode(bound) || bound.operator !== ts.SyntaxKind.KeyOfKeyword) fail('unsupported mapped event keys');
      return keys(bound.type, file, depth + 1);
    }
    if (!ts.isTypeLiteralNode(node)) return fail('unsupported event type');
    const result = new Set<string>();
    for (const member of node.members) {
      if (++visits > 4096) fail('member limit');
      if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) fail('unsupported event member');
      if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) fail('nonliteral event key');
      result.add(member.name.text);
    }
    return result;
  };
  return declaration(resolve(entry), name, 0);
}
