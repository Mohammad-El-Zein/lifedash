import { Component, ElementRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../core/i18n/language.service';
import { MODULES } from '../../core/models';
import { staggerTilesSoon } from '../../shared/animations';
import { LandingFxComponent } from './landing-fx.component';

@Component({
  selector: 'app-landing-page',
  imports: [RouterLink, TranslatePipe, LucideAngularModule, LandingFxComponent],
  template: `
    <div class="min-h-screen flex flex-col">
      <!-- Top bar -->
      <header class="relative z-10 mx-auto w-full max-w-6xl px-4 py-4 flex items-center justify-between sm:px-6 sm:py-5">
        <span class="text-2xl font-bold tracking-tight">Life<span class="logo-accent">Dash</span></span>
        <nav class="flex items-center gap-3">
          <button (click)="language.toggle()"
            class="min-h-11 rounded-control border border-edge-strong px-3 text-sm text-ink-soft hover:bg-field transition-colors uppercase tracking-wide"
            [title]="'languages.switch' | translate">
            {{ language.lang() === 'en' ? 'DE' : 'EN' }}
          </button>
          <a routerLink="/login"
            class="flex min-h-11 items-center rounded-control border border-edge-strong px-4 text-sm text-ink-soft hover:bg-field transition-colors">
            {{ 'landing.signIn' | translate }}
          </a>
        </nav>
      </header>

      <!-- Hero -->
      <section class="relative flex-1 flex items-center overflow-hidden">
        <app-landing-fx />
        <div class="relative z-10 mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-28">
          <div class="max-w-2xl">
            <h1 class="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
              {{ 'landing.heroTitle' | translate }}
              <span class="logo-accent">{{ 'landing.heroTitleAccent' | translate }}</span>
            </h1>
            <p class="mt-4 text-base sm:mt-5 sm:text-lg text-ink-soft max-w-xl">
              {{ 'landing.heroSubtitle' | translate }}
            </p>
            <div class="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center">
              <a routerLink="/register"
                class="min-h-12 rounded-control bg-accent hover:bg-accent-hover px-6 py-3 text-center font-medium transition-colors">
                {{ 'landing.cta' | translate }}
              </a>
              <a routerLink="/login"
                class="min-h-12 rounded-control border border-edge-strong px-6 py-3 text-center text-ink-soft hover:bg-field transition-colors">
                {{ 'landing.signIn' | translate }}
              </a>
            </div>
            <p class="mt-4 text-sm text-ink-faint">{{ 'landing.ctaHint' | translate }}</p>
          </div>
        </div>
      </section>

      <!-- Module showcase -->
      <section class="relative z-10 mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
        <h2 class="text-xl font-semibold mb-2">{{ 'landing.modulesTitle' | translate }}</h2>
        <p class="text-ink-muted mb-6 max-w-2xl">{{ 'landing.modulesSubtitle' | translate }}</p>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          @for (mod of modules; track mod.key) {
            <div data-tile class="flex items-center gap-4 rounded-card border border-edge bg-card p-4 sm:block sm:p-5">
              <span class="icon-chip shrink-0"><lucide-icon [name]="mod.icon" [size]="18" /></span>
              <div class="min-w-0">
                <h3 class="font-semibold sm:mt-3">{{ mod.labelKey | translate }}</h3>
                <p class="mt-1 text-sm text-ink-muted">{{ mod.descriptionKey | translate }}</p>
              </div>
            </div>
          }
        </div>
      </section>

      <footer class="relative z-10 border-t border-edge">
        <div class="mx-auto w-full max-w-6xl px-4 py-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-faint sm:px-6">
          <span>Life<span class="logo-accent">Dash</span> — {{ 'app.tagline' | translate }}</span>
          <a routerLink="/register" class="inline-flex min-h-11 items-center text-link hover:underline">{{ 'landing.cta' | translate }}</a>
        </div>
      </footer>
    </div>
  `,
})
export class LandingPage {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly language = inject(LanguageService);
  readonly modules = MODULES;

  ngOnInit(): void {
    staggerTilesSoon(this.host.nativeElement);
  }
}
