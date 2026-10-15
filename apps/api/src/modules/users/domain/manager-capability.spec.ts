import type {
  ManagerCapability,
  SoleCapability,
  SoleManagerCapability,
} from './manager-capability';

// TD-12: the guard is a type, so these cases are checked by the compiler
// (`npm run typecheck` and ts-jest). Each `@ts-expect-error` fails the build
// if its assignment stops being an error, i.e. if the guard stops collapsing
// to `never`. The runtime expectations only keep the bindings used.
describe('SoleManagerCapability', () => {
  it('is ManagerCapability while VIEW_ALL_REVIEWS is the only member', () => {
    const capability: SoleManagerCapability = 'VIEW_ALL_REVIEWS';
    const widened: ManagerCapability = capability;

    expect(widened).toBe('VIEW_ALL_REVIEWS');
  });

  it('collapses to never when the union gains, renames, widens or loses its member', () => {
    // @ts-expect-error a second member makes the guard `never`
    const gained: SoleCapability<'VIEW_ALL_REVIEWS' | 'PROBE'> =
      'VIEW_ALL_REVIEWS';
    // @ts-expect-error a renamed member makes the guard `never`
    const renamed: SoleCapability<'RENAMED'> = 'RENAMED';
    // @ts-expect-error widening to string makes the guard `never`
    const widenedToString: SoleCapability<string> = 'VIEW_ALL_REVIEWS';

    // @ts-expect-error losing the only member makes the guard `never`
    const lost: SoleCapability<never> = 'VIEW_ALL_REVIEWS';

    expect([gained, renamed, widenedToString, lost]).toHaveLength(4);
  });
});
