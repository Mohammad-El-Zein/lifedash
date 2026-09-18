import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';

/**
 * Reacts to the one-shot query params the command palette navigates with
 * (`?new=1`, `?tab=…`, `?day=…`, …) and strips them from the URL afterwards, so
 * a reload or a back navigation doesn't replay the action.
 *
 * Angular reuses a page component when only query params change, so this has to
 * listen to the stream rather than read a snapshot once.
 *
 * Call it from a **field initializer declared after every signal the handler
 * touches** — the first emission is synchronous, and it deliberately lands
 * before `ngOnInit`, so a handler that only sets state needs no extra reload.
 * Handlers should reload themselves only for later emissions (see the `started`
 * flag pattern in the feature pages).
 */
export function deepLink(keys: string[], apply: (params: ParamMap) => void): void {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const destroyRef = inject(DestroyRef);

  route.queryParamMap.pipe(takeUntilDestroyed(destroyRef)).subscribe((params) => {
    if (!keys.some((key) => params.has(key))) return;
    apply(params);
    void router.navigate([], {
      relativeTo: route,
      queryParams: {},
      replaceUrl: true,
    });
  });
}
