import { Injectable, inject, signal } from '@angular/core';
import { AuthApiService } from '../api/auth-api.service';
import { AuthStore } from './auth.store';

/** Holds the object URL for the current user's avatar so the shell and the
 * profile page share one authenticated fetch instead of raw <img src>. */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly api = inject(AuthApiService);
  private readonly store = inject(AuthStore);

  private readonly _url = signal<string | null>(null);
  readonly url = this._url.asReadonly();

  refresh(): void {
    if (!this.store.user()?.has_avatar) {
      this.clear();
      return;
    }
    this.api.avatarBlob().subscribe({
      next: (blob) => this.setUrl(URL.createObjectURL(blob)),
      error: () => this.clear(),
    });
  }

  clear(): void {
    this.setUrl(null);
  }

  private setUrl(url: string | null): void {
    const old = this._url();
    if (old) URL.revokeObjectURL(old);
    this._url.set(url);
  }
}
