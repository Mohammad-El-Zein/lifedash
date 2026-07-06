import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthApiService } from '../../core/api/auth-api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { AvatarService } from '../../core/auth/avatar.service';
import { AppLanguage, LanguageService } from '../../core/i18n/language.service';
import { AppTheme, ThemeService } from '../../core/theme/theme.service';
import { extractError } from '../../core/http-error';
import { User } from '../../core/models';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // keep in sync with the backend limit
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-profile-page',
  imports: [FormsModule, TranslatePipe],
  template: `
    <header class="mb-8">
      <h1 class="text-3xl font-bold">{{ 'profile.title' | translate }}</h1>
      <p class="text-ink-muted mt-1">{{ 'profile.subtitle' | translate }}</p>
    </header>

    <div class="grid gap-6 lg:grid-cols-3 max-w-4xl">
      <!-- Avatar -->
      <div class="rounded-card border border-edge bg-card p-5 text-center">
        <h2 class="font-semibold mb-4 text-left">{{ 'profile.picture' | translate }}</h2>
        @if (avatar.url(); as url) {
          <img [src]="url" alt="Your avatar"
            class="mx-auto h-32 w-32 rounded-full object-cover border border-edge-strong" />
        } @else {
          <div class="mx-auto h-32 w-32 rounded-full bg-field border border-edge-strong
            flex items-center justify-center text-4xl font-semibold text-ink-muted">
            {{ initials() }}
          </div>
        }
        <div class="mt-4 flex justify-center gap-2">
          <label class="rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field cursor-pointer">
            {{ (uploading() ? 'common.uploading' : user()?.has_avatar ? 'common.change' : 'common.upload') | translate }}
            <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden"
              [disabled]="uploading()" (change)="onFileSelected($event)" />
          </label>
          @if (user()?.has_avatar) {
            <button (click)="removeAvatar()"
              class="rounded-control border border-danger-edge text-danger px-3 py-1.5 text-sm hover:bg-danger-surface">
              {{ 'common.remove' | translate }}
            </button>
          }
        </div>
        <p class="mt-3 text-xs text-ink-faint">{{ 'profile.fileHint' | translate }}</p>

        <!-- Preferences -->
        <div class="mt-6 border-t border-edge pt-4 text-left">
          <h2 class="font-semibold mb-3">{{ 'profile.preferences' | translate }}</h2>
          <label for="language" class="block text-sm text-ink-soft mb-1">
            {{ 'languages.label' | translate }}
          </label>
          <select
            id="language"
            name="language"
            [ngModel]="language.lang()"
            (ngModelChange)="setLanguage($event)"
            class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"
          >
            <option value="en">{{ 'languages.en' | translate }}</option>
            <option value="de">{{ 'languages.de' | translate }}</option>
          </select>
          <label for="theme" class="block text-sm text-ink-soft mb-1 mt-3">
            {{ 'theme.label' | translate }}
          </label>
          <select
            id="theme"
            name="theme"
            [ngModel]="theme.theme()"
            (ngModelChange)="setTheme($event)"
            class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"
          >
            <option value="dark">{{ 'theme.dark' | translate }}</option>
            <option value="light">{{ 'theme.light' | translate }}</option>
            <option value="system">{{ 'theme.system' | translate }}</option>
          </select>
        </div>
      </div>

      <!-- Details -->
      <div class="rounded-card border border-edge bg-card p-5 lg:col-span-2">
        <h2 class="font-semibold mb-4">{{ 'profile.details' | translate }}</h2>
        @if (error()) {
          <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">
            {{ error() }}
          </p>
        }
        @if (saved()) {
          <p class="fx-pop text-sm text-success bg-success-surface border border-success-edge rounded-control px-3 py-2 mb-4">
            {{ 'profile.saved' | translate }}
          </p>
        }
        <form class="space-y-4" (ngSubmit)="save()" (input)="dirty = true">
          <div>
            <label for="fullName" class="block text-sm text-ink-soft mb-1">{{ 'profile.name' | translate }}</label>
            <input id="fullName" name="fullName" [(ngModel)]="fName" maxlength="255"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
          </div>
          <div>
            <label for="jobTitle" class="block text-sm text-ink-soft mb-1">{{ 'profile.jobTitle' | translate }}</label>
            <input id="jobTitle" name="jobTitle" [(ngModel)]="fJobTitle" maxlength="200"
              [placeholder]="'profile.jobTitlePlaceholder' | translate"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
          </div>
          <div>
            <label for="bio" class="block text-sm text-ink-soft mb-1">{{ 'profile.bio' | translate }}</label>
            <textarea id="bio" name="bio" rows="4" [(ngModel)]="fBio" maxlength="1000"
              [placeholder]="'profile.bioPlaceholder' | translate"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"></textarea>
            <p class="mt-1 text-xs text-ink-faint">{{ fBio.length }}/1000</p>
          </div>
          <div>
            <span class="block text-sm text-ink-soft mb-1">{{ 'profile.email' | translate }}</span>
            <p class="text-sm text-ink-faint">{{ user()?.email }} {{ 'profile.emailNote' | translate }}</p>
          </div>
          <button type="submit" [disabled]="saving()"
            class="rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 px-4 py-2 text-sm font-medium">
            {{ (saving() ? 'common.saving' : 'profile.saveButton') | translate }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class ProfilePage {
  private readonly api = inject(AuthApiService);
  private readonly store = inject(AuthStore);
  private readonly translate = inject(TranslateService);
  readonly avatar = inject(AvatarService);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);

  readonly user = this.store.user;
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  fName = this.user()?.full_name ?? '';
  fJobTitle = this.user()?.job_title ?? '';
  fBio = this.user()?.bio ?? '';
  /** Once the user typed anything, the server sync must not clobber the form. */
  dirty = false;

  ngOnInit(): void {
    // Sync from the server in case the cached user is stale.
    this.api.me().subscribe({
      next: (user) => {
        this.store.updateUser(user);
        if (!this.dirty) {
          this.fName = user.full_name ?? '';
          this.fJobTitle = user.job_title ?? '';
          this.fBio = user.bio ?? '';
        }
        this.avatar.refresh();
      },
    });
  }

  initials(): string {
    const name = this.user()?.full_name || this.user()?.email || '?';
    return name
      .split(/[\s@]+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  setLanguage(lang: AppLanguage): void {
    this.language.set(lang);
  }

  setTheme(theme: AppTheme): void {
    this.theme.set(theme);
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.api
      .updateProfile({
        full_name: this.fName.trim() || null,
        job_title: this.fJobTitle.trim() || null,
        bio: this.fBio.trim() || null,
      })
      .subscribe({
        next: (user) => this.afterChange(user, () => this.saved.set(true)),
        error: (err) => {
          this.saving.set(false);
          this.error.set(extractError(err, this.translate.instant('profile.errors.save')));
        },
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      this.error.set(this.translate.instant('profile.errors.uploadType'));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      this.error.set(this.translate.instant('profile.errors.uploadSize'));
      return;
    }
    this.error.set(null);
    this.uploading.set(true);
    this.api.uploadAvatar(file).subscribe({
      next: (user) => {
        this.uploading.set(false);
        this.store.updateUser(user);
        this.avatar.refresh();
      },
      error: (err) => {
        this.uploading.set(false);
        this.error.set(extractError(err, this.translate.instant('profile.errors.upload')));
      },
    });
  }

  removeAvatar(): void {
    this.api.deleteAvatar().subscribe({
      next: (user) => {
        this.store.updateUser(user);
        this.avatar.clear();
      },
      error: (err) =>
        this.error.set(extractError(err, this.translate.instant('profile.errors.removeAvatar'))),
    });
  }

  private afterChange(user: User, onDone: () => void): void {
    this.saving.set(false);
    this.store.updateUser(user);
    onDone();
  }
}
