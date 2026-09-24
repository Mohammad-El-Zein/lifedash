import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthStore } from '../../core/auth/auth.store';
import { AvatarService } from '../../core/auth/avatar.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ViewportService } from '../../core/layout/viewport.service';
import { ThemeService } from '../../core/theme/theme.service';
import { MODULES } from '../../core/models';
import { QuickCaptureComponent } from '../capture/quick-capture.component';
import { CommandPaletteComponent } from '../palette/command-palette.component';
import { pageEnter } from '../../shared/animations';

/**
 * Application frame. The navigation takes one of three shapes, driven by
 * ViewportService (see DeviceClass):
 *
 *   handset  a top bar with a hamburger; the sidebar slides in as a drawer
 *   rail     a 4rem icon rail that expands over the content on demand
 *   desktop  the full 16rem sidebar, always visible
 *
 * All three share the same <aside>: the element itself only reserves layout
 * width, while the panel inside is absolutely positioned, so below desktop it
 * can overlay the content instead of reflowing it.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    LucideAngularModule,
    CommandPaletteComponent,
    QuickCaptureComponent,
  ],
  host: { '(document:keydown.escape)': 'closeNav()' },
  template: `
    <div class="h-screen flex overflow-hidden">
      <!-- Dims the content while the drawer or the expanded rail sits over it -->
      @if (navOpen()) {
        <div class="fx-fade fixed inset-0 z-40 bg-backdrop" (click)="closeNav()" aria-hidden="true"></div>
      }

      <!-- Sidebar: spacer + absolutely positioned panel -->
      <aside class="relative z-50 shrink-0 transition-[width] duration-200" [class]="spacerWidth()">
        <div
          class="absolute inset-y-0 left-0 flex flex-col border-r border-edge bg-sidebar transition-[width,transform] duration-200"
          [class]="panelClass()"
          [attr.inert]="navHidden() ? '' : null"
        >
          <div class="flex items-center gap-1 px-3 py-4" [class.justify-center]="!showLabels()">
            @if (showLabels()) {
              <a routerLink="/dashboard" class="flex min-h-11 flex-1 items-center px-3 text-2xl font-bold tracking-tight">
                Life<span class="logo-accent">Dash</span>
              </a>
            }
            <!-- Rail: pins the panel open. Handset: closes the drawer. -->
            @if (navOverlays()) {
              <button
                (click)="toggleNav()"
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-soft hover:bg-nav-hover transition-colors"
                [attr.aria-label]="(navOpen() ? 'nav.collapseNav' : 'nav.expandNav') | translate"
              >
                <lucide-icon [name]="navOpen() ? 'x' : 'menu'" [size]="20" />
              </button>
            }
          </div>

          <button
            (click)="palette.openPalette()"
            class="mx-3 mb-3 flex min-h-11 items-center gap-2 rounded-control border border-edge-strong px-3 text-sm text-ink-faint hover:bg-nav-hover transition-colors"
            [class.justify-center]="!showLabels()"
            [attr.aria-label]="'palette.open' | translate"
            [title]="showLabels() ? null : ('palette.open' | translate)"
          >
            <lucide-icon name="search" [size]="16" />
            @if (showLabels()) {
              <span class="flex-1 truncate text-left">{{ 'palette.open' | translate }}</span>
              @if (!viewport.isTouch()) {
                <kbd class="rounded border border-edge-strong bg-field px-1.5 py-0.5 text-[10px] tracking-wide">
                  {{ paletteShortcut }}
                </kbd>
              }
            }
          </button>

          <nav class="flex-1 min-h-0 overflow-y-auto px-3 space-y-1">
            <a
              routerLink="/dashboard"
              routerLinkActive="bg-nav-active text-nav-active-ink"
              class="flex min-h-11 items-center gap-3 rounded-control px-3 text-ink-soft hover:bg-nav-hover transition-colors"
              [class.justify-center]="!showLabels()"
              [title]="showLabels() ? null : ('nav.overview' | translate)"
            >
              <lucide-icon name="house" [size]="18" />
              @if (showLabels()) {
                {{ 'nav.overview' | translate }}
              }
            </a>

            @for (mod of modules(); track mod.key) {
              @if (mod.route) {
                <a
                  [routerLink]="mod.route"
                  routerLinkActive="bg-nav-active text-nav-active-ink"
                  class="flex min-h-11 items-center gap-3 rounded-control px-3 text-ink-soft hover:bg-nav-hover transition-colors"
                  [class.justify-center]="!showLabels()"
                  [title]="showLabels() ? null : (mod.labelKey | translate)"
                >
                  <lucide-icon [name]="mod.icon" [size]="18" />
                  @if (showLabels()) {
                    {{ mod.labelKey | translate }}
                  }
                </a>
              } @else {
                <div
                  class="flex min-h-11 items-center gap-3 rounded-control px-3 text-ink-faint cursor-not-allowed"
                  [class.justify-center]="!showLabels()"
                  [title]="(mod.labelKey | translate) + ' — ' + ('common.comingSoon' | translate)"
                >
                  <lucide-icon [name]="mod.icon" [size]="18" class="opacity-60" />
                  @if (showLabels()) {
                    <span class="flex-1">{{ mod.labelKey | translate }}</span>
                    <span class="text-[10px] uppercase tracking-wide bg-field text-ink-muted rounded px-1.5 py-0.5">
                      {{ 'common.soon' | translate }}
                    </span>
                  }
                </div>
              }
            }
          </nav>

          <div class="border-t border-edge p-3">
            <a
              routerLink="/profile"
              class="flex items-center gap-3 rounded-control p-1.5 hover:bg-nav-hover transition-colors"
              [class.justify-center]="!showLabels()"
              [title]="'nav.editProfile' | translate"
            >
              @if (avatar.url(); as url) {
                <img [src]="url" alt="" class="h-10 w-10 rounded-full object-cover border border-edge-strong shrink-0" />
              } @else {
                <span class="h-10 w-10 rounded-full bg-field border border-edge-strong flex items-center justify-center text-sm font-semibold text-ink-muted shrink-0">
                  {{ initials() }}
                </span>
              }
              @if (showLabels()) {
                <span class="min-w-0">
                  <span class="block text-sm font-medium truncate">
                    {{ user()?.full_name || ('nav.welcome' | translate) }}
                  </span>
                  <span class="block text-xs text-ink-faint truncate">
                    {{ user()?.job_title || user()?.email }}
                  </span>
                </span>
              }
            </a>

            <!-- The collapsed rail stacks the same three actions as icon buttons. -->
            <div class="mt-2 flex gap-2" [class.flex-col]="!showLabels()">
              <button
                (click)="logout()"
                class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control border border-edge-strong px-3 text-sm text-ink-soft hover:bg-field transition-colors"
                [title]="showLabels() ? null : ('nav.signOut' | translate)"
                [attr.aria-label]="'nav.signOut' | translate"
              >
                @if (showLabels()) {
                  {{ 'nav.signOut' | translate }}
                } @else {
                  <lucide-icon name="log-out" [size]="16" />
                }
              </button>
              <button
                (click)="theme.cycle()"
                class="flex min-h-11 items-center justify-center rounded-control border border-edge-strong text-sm text-ink-soft hover:bg-field transition-colors"
                [class]="showLabels() ? 'w-11' : 'w-full'"
                [title]="'theme.switch' | translate: { mode: ('theme.' + theme.theme() | translate) }"
              >
                <lucide-icon [name]="themeIcon()" [size]="16" />
              </button>
              <button
                (click)="language.toggle()"
                class="flex min-h-11 items-center justify-center rounded-control border border-edge-strong text-sm text-ink-soft hover:bg-field transition-colors uppercase tracking-wide"
                [class]="showLabels() ? 'w-11' : 'w-full'"
                [title]="'languages.switch' | translate"
              >
                {{ language.lang() === 'en' ? 'DE' : 'EN' }}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- Content -->
      <div class="flex flex-1 min-w-0 flex-col">
        @if (viewport.isHandset()) {
          <header class="flex shrink-0 items-center gap-1 border-b border-edge bg-sidebar px-2 py-2">
            <button
              (click)="toggleNav()"
              class="flex h-11 w-11 items-center justify-center rounded-control text-ink-soft hover:bg-nav-hover transition-colors"
              [attr.aria-label]="'nav.openMenu' | translate"
            >
              <lucide-icon name="menu" [size]="22" />
            </button>
            <a routerLink="/dashboard" class="flex min-h-11 flex-1 items-center truncate px-1 text-xl font-bold tracking-tight">
              Life<span class="logo-accent">Dash</span>
            </a>
            <!-- Phones have no Ctrl key, so the palette needs a button of its own. -->
            <button
              (click)="palette.openPalette()"
              class="flex h-11 w-11 items-center justify-center rounded-control text-ink-soft hover:bg-nav-hover transition-colors"
              [attr.aria-label]="'palette.open' | translate"
            >
              <lucide-icon name="search" [size]="20" />
            </button>
          </header>
        }

        <main class="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 xl:p-10">
          <div #content>
            <router-outlet (activate)="onRouteActivate()" />
          </div>
        </main>
      </div>
    </div>

    <app-command-palette #palette />
    <app-quick-capture />
  `,
})
export class ShellComponent {
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  readonly avatar = inject(AvatarService);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);
  readonly viewport = inject(ViewportService);

  /** Drawer (handset) / expanded rail (tablet) state. Ignored on desktop. */
  private readonly navOpenState = signal(false);

  /** Below desktop the panel floats above the content instead of pushing it. */
  readonly navOverlays = computed(() => !this.viewport.isDesktop());
  readonly navOpen = computed(() => this.navOverlays() && this.navOpenState());
  /** Labels are hidden only on the collapsed rail, never on desktop. */
  readonly showLabels = computed(() => !this.viewport.isRail() || this.navOpen());
  /** A closed drawer is off-screen — keep it out of the tab order. */
  readonly navHidden = computed(() => this.viewport.isHandset() && !this.navOpen());

  readonly spacerWidth = computed(() =>
    this.viewport.isHandset() ? 'w-0' : this.viewport.isRail() ? 'w-16' : 'w-64',
  );

  readonly panelClass = computed(() => {
    if (this.viewport.isHandset()) {
      return this.navOpen() ? 'w-[17rem] translate-x-0 shadow-modal' : 'w-[17rem] -translate-x-full';
    }
    if (this.viewport.isRail()) {
      return this.navOpen() ? 'w-64 shadow-modal' : 'w-16';
    }
    return 'w-64';
  });

  /** Mac shows the Command glyph; every other platform Ctrl. */
  readonly paletteShortcut = /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘K' : 'Ctrl K';

  readonly themeIcon = computed(() =>
    this.theme.theme() === 'dark' ? 'moon' : this.theme.theme() === 'light' ? 'sun' : 'monitor',
  );

  toggleNav(): void {
    this.navOpenState.update((open) => !open);
  }

  closeNav(): void {
    this.navOpenState.set(false);
  }

  onRouteActivate(): void {
    // Navigating from the drawer or expanded rail should reveal the page behind it.
    this.closeNav();
    pageEnter(this.content().nativeElement);
  }

  readonly user = this.store.user;

  ngOnInit(): void {
    this.avatar.refresh();
  }

  initials(): string {
    const name = this.user()?.full_name || this.user()?.email || '?';
    return name
      .split(/[\s@]+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
  readonly modules = computed(() => {
    const enabled = this.store.user()?.enabled_modules;
    return enabled ? MODULES.filter((m) => enabled.includes(m.key)) : MODULES;
  });

  logout(): void {
    this.store.clear();
    void this.router.navigate(['/login']);
  }
}
