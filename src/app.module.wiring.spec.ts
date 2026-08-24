// Does every module actually have the providers its providers need?
//
// WHY THIS EXISTS. MENTOR_REVIEW_2026-08-18 §9 added a signed résumé-download route and
// listed `StorageService` in EmployerModule's providers without `SupabaseClientService`,
// which StorageService takes as its first constructor argument. The result was total:
//
//   Nest can't resolve dependencies of the StorageService (?, ConfigService).
//   Please make sure that the argument SupabaseClientService at index [0] is
//   available in the EmployerModule context.
//
// `AppModule` could not instantiate, so the application could not start at all — and
// **896 unit tests passed anyway**, because jest's `testRegex` is `.*\.spec\.ts$`, which
// does not match `*.e2e-spec.ts`, and the e2e suite is a separate config nobody ran. The
// unit suite is blind to wiring by construction.
//
// It was found by accident: `scripts/eval-score-calibration.ts` boots AppModule, and was
// being run to answer a different finding. Nothing would have caught it — there is no CI.
//
// HOW IT CHECKS, without a database. It never calls `NestFactory.create`; it walks the
// module graph from its decorator metadata and asks, of every provider class, whether the
// constructor tokens it needs are visible from the module that declares it.
//
// It only checks tokens that SOME module in the graph provides. That is what keeps it
// quiet about framework-injected tokens — `ModuleRef`, `ModulesContainer`, `ConsoleLogger`
// and the dynamically-registered `ConfigService` are supplied by Nest's own container, so
// no module declares them, so there is nothing to verify. A token that IS declared
// somewhere but is not reachable from where it is used is exactly the §9 bug.

import 'reflect-metadata';
import { AppModule } from './app.module';

type Ctor = new (...args: never[]) => unknown;

function meta(target: object, key: string): unknown[] {
  return (Reflect.getMetadata(key, target) as unknown[]) ?? [];
}

function isClass(value: unknown): value is Ctor {
  return typeof value === 'function' && !!(value as { prototype?: unknown }).prototype;
}

/** Unwrap `forwardRef`, dynamic modules, and `{ module }` shapes to the module class. */
function moduleClassOf(entry: unknown): Ctor | null {
  if (isClass(entry)) return entry;
  if (entry && typeof entry === 'object') {
    const dynamic = entry as { module?: unknown; forwardRef?: () => unknown };
    if (typeof dynamic.forwardRef === 'function') return moduleClassOf(dynamic.forwardRef());
    if (dynamic.module) return moduleClassOf(dynamic.module);
  }
  return null;
}

/** Provider entries are classes or `{ provide, useClass|useValue|useFactory }`. */
function providedTokens(entry: unknown): unknown[] {
  if (isClass(entry)) return [entry];
  if (entry && typeof entry === 'object' && 'provide' in entry) {
    return [(entry as { provide: unknown }).provide];
  }
  return [];
}

/** Only plain class providers expose constructor params we can inspect. */
function classProviderOf(entry: unknown): Ctor | null {
  if (isClass(entry)) return entry;
  if (entry && typeof entry === 'object' && 'useClass' in entry) {
    const useClass = (entry as { useClass: unknown }).useClass;
    return isClass(useClass) ? useClass : null;
  }
  return null;
}

interface ModuleInfo {
  cls: Ctor;
  imports: Ctor[];
  provides: Set<unknown>;
  exports: unknown[];
  isGlobal: boolean;
  providerClasses: Ctor[];
}

function collect(root: Ctor): Map<Ctor, ModuleInfo> {
  const found = new Map<Ctor, ModuleInfo>();
  const queue: Ctor[] = [root];

  while (queue.length) {
    const cls = queue.shift()!;
    if (found.has(cls)) continue;

    const imports = meta(cls, 'imports')
      .map(moduleClassOf)
      .filter((m): m is Ctor => !!m);
    const providerEntries = meta(cls, 'providers');
    const controllerEntries = meta(cls, 'controllers');

    const provides = new Set<unknown>();
    for (const entry of providerEntries) {
      for (const token of providedTokens(entry)) provides.add(token);
    }

    found.set(cls, {
      cls,
      imports,
      provides,
      exports: meta(cls, 'exports'),
      // Nest's own flag for @Global().
      isGlobal: Reflect.getMetadata('__module:global__', cls) === true,
      providerClasses: [...providerEntries, ...controllerEntries]
        .map(classProviderOf)
        .filter((c): c is Ctor => !!c),
    });

    queue.push(...imports);
  }
  return found;
}

/** Tokens a module makes visible to importers: its exports, resolved transitively. */
function exportedTokens(
  cls: Ctor,
  graph: Map<Ctor, ModuleInfo>,
  seen = new Set<Ctor>(),
): Set<unknown> {
  const out = new Set<unknown>();
  if (seen.has(cls)) return out;
  seen.add(cls);

  const info = graph.get(cls);
  if (!info) return out;

  for (const entry of info.exports) {
    const asModule = moduleClassOf(entry);
    // Re-exporting a module forwards everything that module exports.
    if (asModule && graph.has(asModule)) {
      for (const token of exportedTokens(asModule, graph, seen)) out.add(token);
      continue;
    }
    for (const token of providedTokens(entry)) out.add(token);
  }
  return out;
}

describe('AppModule wiring — every provider can resolve its dependencies', () => {
  const graph = collect(AppModule as unknown as Ctor);

  /** Everything any module declares. A token outside this set is framework-supplied. */
  const declaredAnywhere = new Set<unknown>();
  for (const info of graph.values()) {
    for (const token of info.provides) declaredAnywhere.add(token);
  }

  /** Anything a @Global module exports is visible from every module. */
  const globalTokens = new Set<unknown>();
  for (const info of graph.values()) {
    if (info.isGlobal) {
      for (const token of exportedTokens(info.cls, graph)) globalTokens.add(token);
    }
  }

  it('walks a real module graph', () => {
    // Without this, every assertion below would pass vacuously on an empty map — the
    // exact failure mode that let the original bug through.
    expect(graph.size).toBeGreaterThan(10);
    expect(declaredAnywhere.size).toBeGreaterThan(20);
    expect(globalTokens.size).toBeGreaterThan(0);
  });

  it('sees StorageService as reachable — the dependency §9 broke', () => {
    // A named guard as well as the sweep below, so a regression names itself rather than
    // arriving as one line in a list.
    const employer = [...graph.values()].find((m) => m.cls.name === 'EmployerModule');
    expect(employer).toBeDefined();

    const visible = new Set<unknown>([...employer!.provides, ...globalTokens]);
    for (const imported of employer!.imports) {
      for (const token of exportedTokens(imported, graph)) visible.add(token);
    }
    const names = [...visible].filter(isClass).map((c) => c.name);
    expect(names).toContain('StorageService');
    expect(names).toContain('SupabaseClientService');
  });

  it('has no provider whose constructor asks for a token its module cannot see', () => {
    const unresolved: string[] = [];

    for (const info of graph.values()) {
      const visible = new Set<unknown>([...info.provides, ...globalTokens]);
      for (const imported of info.imports) {
        for (const token of exportedTokens(imported, graph)) visible.add(token);
      }

      for (const provider of info.providerClasses) {
        const params =
          (Reflect.getMetadata('design:paramtypes', provider) as unknown[]) ?? [];
        const optional =
          (Reflect.getMetadata('__optional__', provider) as Record<number, boolean>) ?? {};

        params.forEach((param, index) => {
          if (!isClass(param)) return;
          // Not declared by any module ⇒ framework-supplied (ModuleRef, ConfigService,
          // ConsoleLogger…). Nothing for this test to verify.
          if (!declaredAnywhere.has(param)) return;
          // @Optional() is allowed to be missing — that is its whole contract.
          if (optional[index]) return;

          if (!visible.has(param)) {
            unresolved.push(
              `${info.cls.name}: ${provider.name} needs ${param.name} at index [${index}] — ` +
                `not provided by ${info.cls.name}, not exported by anything it imports, not global.`,
            );
          }
        });
      }
    }

    expect(unresolved).toEqual([]);
  });
});
