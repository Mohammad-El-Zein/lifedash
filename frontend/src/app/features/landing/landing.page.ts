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
      <header class="relative z-10 mx-auto w-full max-w-6xl px-6 py-5 flex items-center justify-between">
        <span class="text-2xl font-bold tracking-tight">Life<span class="logo-accent">Dash</span></span>
        <nav class="flex items-center gap-3">
          <button (click)="language.toggle()"
            class="rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field transition-colors uppercase tracking-wide"
            [title]="'languages.switch' | translate">
            {{ language.lang() === 'en' ? 'DE' : 'EN' }}
          </button>
          <a routerLink="/login"
            class="rounded-control border border-edge-strong px-4 py-1.5 text-sm text-ink-soft hover:bg-field transition-colors">
            {{ 'landing.signIn' | translate }}
          </a>
        </nav>
      </header>

      <!-- Hero -->
      <section class="relative flex-1 flex items-center overflow-hidden">
        <app-landing-fx />
        <div class="relative z-10 mx-auto w-full max-w-6xl px-6 py-20 lg:py-28">
          <div class="max-w-2xl">
            <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
              {{ 'landing.heroTitle' | translate }}
              <span class="logo-accent">{{ 'landing.heroTitleAccent' | translate }}</span>
            </h1>
            <p class="mt-5 text-lg text-ink-soft max-w-xl">
              {{ 'landing.heroSubtitle' | translate }}
            </p>
            <div class="mt-8 flex flex-wrap items-center gap-3">
              <a routerLink="/register"
                class="rounded-control bg-accent hover:bg-accent-hover px-6 py-3 font-medium transition-colors">
                {{ 'landing.cta' | translate }}
              </a>
              <a routerLink="/login"
                class="rounded-control border border-edge-strong px-6 py-3 text-ink-soft hover:bg-field transition-colors">
                {{ 'landing.signIn' | translate }}
              </a>
            </div>
            <p class="mt-4 text-sm text-ink-faint">{{ 'landing.ctaHint' | translate }}</p>
          </div>
        </div>
      </section>

      <!-- Module showcase -->
      <section class="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20">
        <h2 class="text-xl font-semibold mb-2">{{ 'landing.modulesTitle' | translate }}</h2>
        <p class="text-ink-muted mb-6 max-w-2xl">{{ 'landing.modulesSubtitle' | translate }}</p>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          @for (mod of modules; track mod.key) {
            <div data-tile class="rounded-card border border-edge bg-card p-5">
              <span class="icon-chip"><lucide-icon [name]="mod.icon" [size]="18" /></span>
              <h3 class="mt-3 font-semibold">{{ mod.labelKey | translate }}</h3>
              <p class="mt-1 text-sm text-ink-muted">{{ mod.descriptionKey | translate }}</p>
            </div>
          }
        </div>
      </section>

      <footer class="relative z-10 border-t border-edge">
        <div class="mx-auto w-full max-w-6xl px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-faint">
          <span>Life<span class="logo-accent">Dash</span> — {{ 'app.tagline' | translate }}</span>
          <a routerLink="/register" class="text-link hover:underline">{{ 'landing.cta' | translate }}</a>
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
