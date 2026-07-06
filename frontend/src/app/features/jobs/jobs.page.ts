import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FxModal, staggerTilesSoon } from '../../shared/animations';
import { JobsApiService } from '../../core/api/jobs-api.service';
import { extractError } from '../../core/http-error';
import { LanguageService } from '../../core/i18n/language.service';
import {
  ApplicationPayload,
  JOB_STATUSES,
  JobApplication,
  JobDocument,
  JobStatus,
} from '../../core/models';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // keep in sync with the backend limit

@Component({
  selector: 'app-jobs-page',
  imports: [FormsModule, TranslatePipe, FxModal],
  template: `
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">{{ 'jobs.title' | translate }}</h1>
        <p class="text-ink-muted mt-1">{{ 'jobs.count' | translate: { n: applications().length } }}</p>
      </div>
      <button (click)="openForm(null)" class="rounded-control bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium transition-colors">
        {{ 'jobs.addApplication' | translate }}
      </button>
    </header>

    <!-- Status filter chips -->
    <div class="mb-6 flex flex-wrap gap-2">
      <button (click)="filter.set(null)"
        [class]="chipClass(filter() === null)">
        {{ 'common.all' | translate }} <span class="text-ink-faint">{{ countFor(null) }}</span>
      </button>
      @for (s of statuses; track s.value) {
        <button (click)="filter.set(s.value)" [class]="chipClass(filter() === s.value)">
          <span class="h-2 w-2 rounded-full inline-block" [style.background]="s.color"></span>
          {{ s.labelKey | translate }} <span class="text-ink-faint">{{ countFor(s.value) }}</span>
        </button>
      }
    </div>

    @if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else if (filtered().length === 0) {
      <div class="rounded-card border border-edge bg-card p-10 text-center text-ink-faint">
        {{ (filter() ? 'jobs.noApplicationsFiltered' : 'jobs.noApplications') | translate }}
      </div>
    } @else {
      <div class="space-y-3">
        @for (app of filtered(); track app.id) {
          <div data-tile class="rounded-card border border-edge bg-card p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="font-semibold text-lg truncate">{{ app.company }}</h2>
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-edge-strong px-2.5 py-0.5 text-xs">
                    <span class="h-2 w-2 rounded-full" [style.background]="statusColor(app.status)"></span>
                    {{ statusLabelKey(app.status) | translate }}
                  </span>
                </div>
                <p class="text-ink-muted text-sm mt-0.5">
                  {{ app.position }}
                  @if (app.applied_date) { · {{ 'jobs.appliedOn' | translate: { date: app.applied_date } }} }
                  @if (app.link) {
                    · <a [href]="app.link" target="_blank" rel="noopener" class="text-link hover:underline">{{ 'jobs.posting' | translate }}</a>
                  }
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button (click)="openStatus(app)" class="rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field">
                  {{ 'jobs.changeStatus' | translate }}
                </button>
                <button (click)="openForm(app)" class="rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field">
                  {{ 'common.edit' | translate }}
                </button>
                <button (click)="toggleExpand(app.id)" class="rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field">
                  {{ (expanded() === app.id ? 'common.hide' : 'common.details') | translate }}
                  @if (app.documents.length > 0) {
                    <span class="text-ink-faint">· {{ app.documents.length }} 📄</span>
                  }
                </button>
              </div>
            </div>

            @if (expanded() === app.id) {
              <div class="mt-4 border-t border-edge pt-4">
                @if (app.notes) {
                  <p class="text-sm text-ink-soft mb-3"><span class="text-ink-faint">{{ 'jobs.notes' | translate }}</span> {{ app.notes }}</p>
                }
                @if (app.description) {
                  <details class="mb-3 text-sm">
                    <summary class="cursor-pointer text-ink-muted hover:text-ink">{{ 'jobs.jobDescription' | translate }}</summary>
                    <p class="mt-2 whitespace-pre-wrap text-ink-soft border-l-2 border-edge-strong pl-3">{{ app.description }}</p>
                  </details>
                }
                <ol class="space-y-2">
                  @for (h of historyNewestFirst(app); track h.id) {
                    <li class="flex items-start gap-3 text-sm">
                      <span class="mt-1 h-2.5 w-2.5 rounded-full shrink-0" [style.background]="statusColor(h.status)"></span>
                      <div>
                        <span class="font-medium">{{ statusLabelKey(h.status) | translate }}</span>
                        <span class="text-ink-faint"> · {{ formatDate(h.changed_at) }}</span>
                        @if (h.note) { <p class="text-ink-muted">{{ h.note }}</p> }
                      </div>
                    </li>
                  }
                </ol>

                <!-- Documents -->
                <div class="mt-4 border-t border-edge pt-4">
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="text-sm font-medium text-ink-soft">{{ 'jobs.documents' | translate }}</h3>
                    <label class="rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field cursor-pointer">
                      {{ (uploading() ? 'common.uploading' : 'jobs.uploadPdf') | translate }}
                      <input type="file" accept="application/pdf" class="hidden"
                        [disabled]="uploading()" (change)="onFileSelected($event, app)" />
                    </label>
                  </div>
                  @if (docError()) {
                    <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-2">
                      {{ docError() }}
                    </p>
                  }
                  @if (app.documents.length === 0) {
                    <p class="text-sm text-ink-faint">{{ 'jobs.noDocuments' | translate }}</p>
                  } @else {
                    <ul class="space-y-1.5">
                      @for (doc of app.documents; track doc.id) {
                        <li class="flex items-center gap-3 text-sm rounded-control border border-edge px-3 py-2">
                          <span>📄</span>
                          <span class="min-w-0 flex-1 truncate">{{ doc.filename }}</span>
                          <span class="text-ink-faint shrink-0">{{ formatBytes(doc.size_bytes) }} · {{ formatDate(doc.created_at) }}</span>
                          <button (click)="download(doc)" class="text-link hover:underline shrink-0">{{ 'common.download' | translate }}</button>
                          <button (click)="removeDocument(doc)" class="text-danger hover:underline shrink-0">{{ 'common.delete' | translate }}</button>
                        </li>
                      }
                    </ul>
                  }
                </div>

                <button (click)="remove(app)" class="mt-4 rounded-control border border-danger-edge text-danger px-3 py-1.5 text-sm hover:bg-danger-surface">
                  {{ 'jobs.deleteApplication' | translate }}
                </button>
              </div>
            }
          </div>
        }
      </div>
    }

    <!-- Add/edit modal -->
    @if (showForm()) {
      <div class="fx-fade fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" (click)="showForm.set(false)">
        <div class="w-full max-w-md rounded-card border border-edge-strong bg-card p-6 shadow-modal" fxModal (click)="$event.stopPropagation()">
          <h2 class="text-xl font-semibold mb-4">
            {{ (editing() ? 'jobs.form.editTitle' : 'jobs.form.newTitle') | translate }}
          </h2>
          @if (error()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">{{ error() }}</p>
          }
          <form class="space-y-4" (ngSubmit)="submitForm()">
            <div>
              <label for="company" class="block text-sm text-ink-soft mb-1">{{ 'jobs.form.company' | translate }}</label>
              <input id="company" name="company" required [(ngModel)]="fCompany"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <div>
              <label for="position" class="block text-sm text-ink-soft mb-1">{{ 'jobs.form.position' | translate }}</label>
              <input id="position" name="position" required [(ngModel)]="fPosition"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <div>
              <label for="link" class="block text-sm text-ink-soft mb-1">{{ 'jobs.form.link' | translate }}</label>
              <input id="link" name="link" type="url" [(ngModel)]="fLink" placeholder="https://…"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <div>
              <label for="appliedDate" class="block text-sm text-ink-soft mb-1">{{ 'jobs.form.appliedDate' | translate }}</label>
              <input id="appliedDate" name="appliedDate" type="date" [(ngModel)]="fAppliedDate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <div>
              <label for="description" class="block text-sm text-ink-soft mb-1">{{ 'jobs.form.description' | translate }}</label>
              <textarea id="description" name="description" rows="5" [(ngModel)]="fDescription"
                [placeholder]="'jobs.form.descriptionPlaceholder' | translate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"></textarea>
            </div>
            <div>
              <label for="notes" class="block text-sm text-ink-soft mb-1">{{ 'jobs.form.notes' | translate }}</label>
              <textarea id="notes" name="notes" rows="3" [(ngModel)]="fNotes"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"></textarea>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showForm.set(false)"
                class="rounded-control border border-edge-strong px-4 py-2 text-sm text-ink-soft hover:bg-field">{{ 'common.cancel' | translate }}</button>
              <button type="submit" [disabled]="saving()"
                class="rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 px-4 py-2 text-sm font-medium">
                {{ (saving() ? 'common.saving' : 'common.save') | translate }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Status change modal -->
    @if (statusTarget(); as app) {
      <div class="fx-fade fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" (click)="statusTarget.set(null)">
        <div class="w-full max-w-sm rounded-card border border-edge-strong bg-card p-6 shadow-modal" fxModal (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-1">{{ 'jobs.statusModal.title' | translate }}</h2>
          <p class="text-sm text-ink-muted mb-4">{{ app.company }} · {{ app.position }}</p>
          @if (error()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">{{ error() }}</p>
          }
          <div class="grid gap-2 mb-4">
            @for (s of statuses; track s.value) {
              @if (s.value !== app.status) {
                <button type="button" (click)="newStatus.set(s.value)"
                  [class]="'flex items-center gap-2 rounded-control border px-3 py-2 text-sm text-left transition-colors ' +
                    (newStatus() === s.value ? 'border-accent bg-nav-active' : 'border-edge-strong hover:bg-field-soft')">
                  <span class="h-2.5 w-2.5 rounded-full" [style.background]="s.color"></span>
                  {{ s.labelKey | translate }}
                </button>
              }
            }
          </div>
          <input name="statusNote" [(ngModel)]="statusNote" [placeholder]="'jobs.statusModal.notePlaceholder' | translate"
            class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 text-sm mb-4" />
          <div class="flex justify-end gap-2">
            <button (click)="statusTarget.set(null)"
              class="rounded-control border border-edge-strong px-4 py-2 text-sm text-ink-soft hover:bg-field">{{ 'common.cancel' | translate }}</button>
            <button (click)="submitStatus(app)" [disabled]="!newStatus() || saving()"
              class="rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 px-4 py-2 text-sm font-medium">
              {{ 'common.update' | translate }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class JobsPage {
  private readonly api = inject(JobsApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  readonly statuses = JOB_STATUSES;

  readonly loading = signal(true);
  readonly applications = signal<JobApplication[]>([]);
  readonly filter = signal<JobStatus | null>(null);
  readonly expanded = signal<number | null>(null);

  readonly showForm = signal(false);
  readonly editing = signal<JobApplication | null>(null);
  readonly statusTarget = signal<JobApplication | null>(null);
  readonly newStatus = signal<JobStatus | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly docError = signal<string | null>(null);

  fCompany = '';
  fPosition = '';
  fLink = '';
  fAppliedDate = '';
  fNotes = '';
  fDescription = '';
  statusNote = '';

  readonly filtered = computed(() => {
    const f = this.filter();
    return f ? this.applications().filter((a) => a.status === f) : this.applications();
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.list().subscribe({
      next: (apps) => {
        this.applications.set(apps);
        this.loading.set(false);
        staggerTilesSoon(this.host.nativeElement);
      },
      error: () => this.loading.set(false),
    });
  }

  chipClass(active: boolean): string {
    return (
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ' +
      (active
        ? 'border-accent bg-nav-active text-nav-active-ink'
        : 'border-edge-strong text-ink-soft hover:bg-field-soft')
    );
  }

  countFor(status: JobStatus | null): number {
    return status
      ? this.applications().filter((a) => a.status === status).length
      : this.applications().length;
  }

  statusColor(status: JobStatus): string {
    return JOB_STATUSES.find((s) => s.value === status)?.color ?? '#64748b';
  }

  statusLabelKey(status: JobStatus): string {
    return JOB_STATUSES.find((s) => s.value === status)?.labelKey ?? status;
  }

  historyNewestFirst(app: JobApplication) {
    return [...app.status_history].sort((a, b) => b.id - a.id);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.language.locale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  toggleExpand(id: number): void {
    this.expanded.update((cur) => (cur === id ? null : id));
  }

  openForm(app: JobApplication | null): void {
    this.editing.set(app);
    this.error.set(null);
    this.fCompany = app?.company ?? '';
    this.fPosition = app?.position ?? '';
    this.fLink = app?.link ?? '';
    this.fAppliedDate = app?.applied_date ?? '';
    this.fNotes = app?.notes ?? '';
    this.fDescription = app?.description ?? '';
    this.showForm.set(true);
  }

  submitForm(): void {
    if (!this.fCompany.trim() || !this.fPosition.trim()) {
      this.error.set(this.translate.instant('jobs.errors.required'));
      return;
    }
    const payload: ApplicationPayload = {
      company: this.fCompany.trim(),
      position: this.fPosition.trim(),
      link: this.fLink.trim() || null,
      applied_date: this.fAppliedDate || null,
      notes: this.fNotes.trim() || null,
      description: this.fDescription.trim() || null,
    };
    this.saving.set(true);
    this.error.set(null);
    const editing = this.editing();
    const req = editing ? this.api.update(editing.id, payload) : this.api.create(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('jobs.errors.save')));
      },
    });
  }

  openStatus(app: JobApplication): void {
    this.statusTarget.set(app);
    this.newStatus.set(null);
    this.statusNote = '';
    this.error.set(null);
  }

  submitStatus(app: JobApplication): void {
    const status = this.newStatus();
    if (!status) return;
    this.saving.set(true);
    this.api.changeStatus(app.id, status, this.statusNote.trim() || null).subscribe({
      next: () => {
        this.saving.set(false);
        this.statusTarget.set(null);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('jobs.errors.status')));
      },
    });
  }

  remove(app: JobApplication): void {
    if (!confirm(this.translate.instant('jobs.deleteConfirm', { company: app.company }))) return;
    this.api.delete(app.id).subscribe({ next: () => this.load() });
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  onFileSelected(event: Event, app: JobApplication): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.docError.set(this.translate.instant('jobs.errors.pdfOnly'));
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      this.docError.set(this.translate.instant('jobs.errors.pdfSize'));
      return;
    }
    this.docError.set(null);
    this.uploading.set(true);
    this.api.uploadDocument(app.id, file).subscribe({
      next: () => {
        this.uploading.set(false);
        this.load();
      },
      error: (err) => {
        this.uploading.set(false);
        this.docError.set(extractError(err, this.translate.instant('jobs.errors.upload')));
      },
    });
  }

  download(doc: JobDocument): void {
    this.api.downloadDocument(doc.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.filename;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.docError.set(this.translate.instant('jobs.errors.download')),
    });
  }

  removeDocument(doc: JobDocument): void {
    if (!confirm(this.translate.instant('jobs.deleteDocConfirm', { filename: doc.filename }))) return;
    this.api.deleteDocument(doc.id).subscribe({
      next: () => this.load(),
      error: (err) =>
        this.docError.set(extractError(err, this.translate.instant('jobs.errors.deleteDoc'))),
    });
  }
}
