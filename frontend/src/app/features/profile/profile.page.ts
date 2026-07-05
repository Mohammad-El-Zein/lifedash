import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthApiService } from '../../core/api/auth-api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { AvatarService } from '../../core/auth/avatar.service';
import { extractError } from '../../core/http-error';
import { User } from '../../core/models';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // keep in sync with the backend limit
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-profile-page',
  imports: [FormsModule],
  template: `
    <header class="mb-8">
      <h1 class="text-3xl font-bold">Your profile</h1>
      <p class="text-slate-400 mt-1">How you appear across LifeDash.</p>
    </header>

    <div class="grid gap-6 lg:grid-cols-3 max-w-4xl">
      <!-- Avatar -->
      <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center">
        <h2 class="font-semibold mb-4 text-left">Profile picture</h2>
        @if (avatar.url(); as url) {
          <img [src]="url" alt="Your avatar"
            class="mx-auto h-32 w-32 rounded-full object-cover border border-slate-700" />
        } @else {
          <div class="mx-auto h-32 w-32 rounded-full bg-slate-800 border border-slate-700
            flex items-center justify-center text-4xl font-semibold text-slate-400">
            {{ initials() }}
          </div>
        }
        <div class="mt-4 flex justify-center gap-2">
          <label class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 cursor-pointer">
            {{ uploading() ? 'Uploading…' : user()?.has_avatar ? 'Change' : 'Upload' }}
            <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden"
              [disabled]="uploading()" (change)="onFileSelected($event)" />
          </label>
          @if (user()?.has_avatar) {
            <button (click)="removeAvatar()"
              class="rounded-lg border border-red-900 text-red-400 px-3 py-1.5 text-sm hover:bg-red-950/40">
              Remove
            </button>
          }
        </div>
        <p class="mt-3 text-xs text-slate-500">JPEG, PNG or WebP · max 2 MB</p>
      </div>

      <!-- Details -->
      <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2">
        <h2 class="font-semibold mb-4">Details</h2>
        @if (error()) {
          <p class="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 mb-4">
            {{ error() }}
          </p>
        }
        @if (saved()) {
          <p class="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-lg px-3 py-2 mb-4">
            Profile saved.
          </p>
        }
        <form class="space-y-4" (ngSubmit)="save()" (input)="dirty = true">
          <div>
            <label for="fullName" class="block text-sm text-slate-300 mb-1">Name</label>
            <input id="fullName" name="fullName" [(ngModel)]="fName" maxlength="255"
              class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
          </div>
          <div>
            <label for="jobTitle" class="block text-sm text-slate-300 mb-1">Job title</label>
            <input id="jobTitle" name="jobTitle" [(ngModel)]="fJobTitle" maxlength="200"
              placeholder="e.g. Full-stack Developer"
              class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
          </div>
          <div>
            <label for="bio" class="block text-sm text-slate-300 mb-1">Bio</label>
            <textarea id="bio" name="bio" rows="4" [(ngModel)]="fBio" maxlength="1000"
              placeholder="A short introduction…"
              class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"></textarea>
            <p class="mt-1 text-xs text-slate-500">{{ fBio.length }}/1000</p>
          </div>
          <div>
            <span class="block text-sm text-slate-300 mb-1">Email</span>
            <p class="text-sm text-slate-500">{{ user()?.email }} (cannot be changed)</p>
          </div>
          <button type="submit" [disabled]="saving()"
            class="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium">
            {{ saving() ? 'Saving…' : 'Save profile' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class ProfilePage {
  private readonly api = inject(AuthApiService);
  private readonly store = inject(AuthStore);
  readonly avatar = inject(AvatarService);

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
          this.error.set(extractError(err, 'Could not save the profile.'));
        },
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      this.error.set('Only JPEG, PNG or WebP images are allowed.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      this.error.set('The image exceeds the 2 MB limit.');
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
        this.error.set(extractError(err, 'Could not upload the image.'));
      },
    });
  }

  removeAvatar(): void {
    this.api.deleteAvatar().subscribe({
      next: (user) => {
        this.store.updateUser(user);
        this.avatar.clear();
      },
      error: (err) => this.error.set(extractError(err, 'Could not remove the image.')),
    });
  }

  private afterChange(user: User, onDone: () => void): void {
    this.saving.set(false);
    this.store.updateUser(user);
    onDone();
  }
}
