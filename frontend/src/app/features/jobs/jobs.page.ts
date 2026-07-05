import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JobsApiService } from '../../core/api/jobs-api.service';
import { extractError } from '../../core/http-error';
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
  imports: [FormsModule],
  template: `
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Job Applications</h1>
        <p class="text-slate-400 mt-1">{{ applications().length }} application(s)</p>
      </div>
      <button (click)="openForm(null)" class="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium transition-colors">
        + Add application
      </button>
    </header>

    <!-- Status filter chips -->
    <div class="mb-6 flex flex-wrap gap-2">
      <button (click)="filter.set(null)"
        [class]="chipClass(filter() === null)">
        All <span class="text-slate-500">{{ countFor(null) }}</span>
      </button>
      @for (s of statuses; track s.value) {
        <button (click)="filter.set(s.value)" [class]="chipClass(filter() === s.value)">
          <span class="h-2 w-2 rounded-full inline-block" [style.background]="s.color"></span>
          {{ s.label }} <span class="text-slate-500">{{ countFor(s.value) }}</span>
        </button>
      }
    </div>

    @if (loading()) {
      <p class="text-slate-400">Loading…</p>
    } @else if (filtered().length === 0) {
      <div class="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500">
        No applications{{ filter() ? ' with this status' : '' }} yet.
      </div>
    } @else {
      <div class="space-y-3">
        @for (app of filtered(); track app.id) {
          <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="font-semibold text-lg truncate">{{ app.company }}</h2>
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-2.5 py-0.5 text-xs">
                    <span class="h-2 w-2 rounded-full" [style.background]="statusColor(app.status)"></span>
                    {{ statusLabel(app.status) }}
                  </span>
                </div>
                <p class="text-slate-400 text-sm mt-0.5">
                  {{ app.position }}
                  @if (app.applied_date) { · applied {{ app.applied_date }} }
                  @if (app.link) {
                    · <a [href]="app.link" target="_blank" rel="noopener" class="text-indigo-400 hover:underline">Job posting ↗</a>
                  }
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button (click)="openStatus(app)" class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
                  Change status
                </button>
                <button (click)="openForm(app)" class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
                  Edit
                </button>
                <button (click)="toggleExpand(app.id)" class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
                  {{ expanded() === app.id ? 'Hide' : 'Details' }}
                  @if (app.documents.length > 0) {
                    <span class="text-slate-500">· {{ app.documents.length }} 📄</span>
                  }
                </button>
              </div>
            </div>

            @if (expanded() === app.id) {
              <div class="mt-4 border-t border-slate-800 pt-4">
                @if (app.notes) {
                  <p class="text-sm text-slate-300 mb-3"><span class="text-slate-500">Notes:</span> {{ app.notes }}</p>
                }
                <ol class="space-y-2">
                  @for (h of historyNewestFirst(app); track h.id) {
                    <li class="flex items-start gap-3 text-sm">
                      <span class="mt-1 h-2.5 w-2.5 rounded-full shrink-0" [style.background]="statusColor(h.status)"></span>
                      <div>
                        <span class="font-medium">{{ statusLabel(h.status) }}</span>
                        <span class="text-slate-500"> · {{ formatDate(h.changed_at) }}</span>
                        @if (h.note) { <p class="text-slate-400">{{ h.note }}</p> }
                      </div>
                    </li>
                  }
                </ol>

                <!-- Documents -->
                <div class="mt-4 border-t border-slate-800 pt-4">
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="text-sm font-medium text-slate-300">Documents</h3>
                    <label class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 cursor-pointer">
                      {{ uploading() ? 'Uploading…' : '+ Upload PDF' }}
                      <input type="file" accept="application/pdf" class="hidden"
                        [disabled]="uploading()" (change)="onFileSelected($event, app)" />
                    </label>
                  </div>
                  @if (docError()) {
                    <p class="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 mb-2">
                      {{ docError() }}
                    </p>
                  }
                  @if (app.documents.length === 0) {
                    <p class="text-sm text-slate-500">No documents yet — CV, cover letter, …</p>
                  } @else {
                    <ul class="space-y-1.5">
                      @for (doc of app.documents; track doc.id) {
                        <li class="flex items-center gap-3 text-sm rounded-lg border border-slate-800 px-3 py-2">
                          <span>📄</span>
                          <span class="min-w-0 flex-1 truncate">{{ doc.filename }}</span>
                          <span class="text-slate-500 shrink-0">{{ formatBytes(doc.size_bytes) }} · {{ formatDate(doc.created_at) }}</span>
                          <button (click)="download(doc)" class="text-indigo-400 hover:underline shrink-0">Download</button>
                          <button (click)="removeDocument(doc)" class="text-red-400 hover:underline shrink-0">Delete</button>
                        </li>
                      }
                    </ul>
                  }
                </div>

                <button (click)="remove(app)" class="mt-4 rounded-lg border border-red-900 text-red-400 px-3 py-1.5 text-sm hover:bg-red-950/40">
                  Delete application
                </button>
              </div>
            }
          </div>
        }
      </div>
    }

    <!-- Add/edit modal -->
    @if (showForm()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" (click)="showForm.set(false)">
        <div class="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" (click)="$event.stopPropagation()">
          <h2 class="text-xl font-semibold mb-4">{{ editing() ? 'Edit application' : 'New application' }}</h2>
          @if (error()) {
            <p class="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 mb-4">{{ error() }}</p>
          }
          <form class="space-y-4" (ngSubmit)="submitForm()">
            <div>
              <label for="company" class="block text-sm text-slate-300 mb-1">Company</label>
              <input id="company" name="company" required [(ngModel)]="fCompany"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
            </div>
            <div>
              <label for="position" class="block text-sm text-slate-300 mb-1">Position</label>
              <input id="position" name="position" required [(ngModel)]="fPosition"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
            </div>
            <div>
              <label for="link" class="block text-sm text-slate-300 mb-1">Link</label>
              <input id="link" name="link" type="url" [(ngModel)]="fLink" placeholder="https://…"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
            </div>
            <div>
              <label for="appliedDate" class="block text-sm text-slate-300 mb-1">Applied on</label>
              <input id="appliedDate" name="appliedDate" type="date" [(ngModel)]="fAppliedDate"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
            </div>
            <div>
              <label for="notes" class="block text-sm text-slate-300 mb-1">Notes</label>
              <textarea id="notes" name="notes" rows="3" [(ngModel)]="fNotes"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"></textarea>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showForm.set(false)"
                class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
              <button type="submit" [disabled]="saving()"
                class="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium">
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Status change modal -->
    @if (statusTarget(); as app) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" (click)="statusTarget.set(null)">
        <div class="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-1">Change status</h2>
          <p class="text-sm text-slate-400 mb-4">{{ app.company }} · {{ app.position }}</p>
          @if (error()) {
            <p class="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 mb-4">{{ error() }}</p>
          }
          <div class="grid gap-2 mb-4">
            @for (s of statuses; track s.value) {
              @if (s.value !== app.status) {
                <button type="button" (click)="newStatus.set(s.value)"
                  [class]="'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors ' +
                    (newStatus() === s.value ? 'border-indigo-500 bg-slate-800' : 'border-slate-700 hover:bg-slate-800/60')">
                  <span class="h-2.5 w-2.5 rounded-full" [style.background]="s.color"></span>
                  {{ s.label }}
                </button>
              }
            }
          </div>
          <input name="statusNote" [(ngModel)]="statusNote" placeholder="Note (optional)"
            class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm mb-4" />
          <div class="flex justify-end gap-2">
            <button (click)="statusTarget.set(null)"
              class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
            <button (click)="submitStatus(app)" [disabled]="!newStatus() || saving()"
              class="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium">
              Update
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class JobsPage {
  private readonly api = inject(JobsApiService);

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
      },
      error: () => this.loading.set(false),
    });
  }

  chipClass(active: boolean): string {
    return (
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ' +
      (active
        ? 'border-indigo-500 bg-slate-800 text-white'
        : 'border-slate-700 text-slate-300 hover:bg-slate-800/60')
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

  statusLabel(status: JobStatus): string {
    return JOB_STATUSES.find((s) => s.value === status)?.label ?? status;
  }

  historyNewestFirst(app: JobApplication) {
    return [...app.status_history].sort((a, b) => b.id - a.id);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {
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
    this.showForm.set(true);
  }

  submitForm(): void {
    if (!this.fCompany.trim() || !this.fPosition.trim()) {
      this.error.set('Company and position are required.');
      return;
    }
    const payload: ApplicationPayload = {
      company: this.fCompany.trim(),
      position: this.fPosition.trim(),
      link: this.fLink.trim() || null,
      applied_date: this.fAppliedDate || null,
      notes: this.fNotes.trim() || null,
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
        this.error.set(extractError(err, 'Could not save the application.'));
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
        this.error.set(extractError(err, 'Could not update the status.'));
      },
    });
  }

  remove(app: JobApplication): void {
    if (!confirm(`Delete the application at ${app.company}?`)) return;
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
      this.docError.set('Only PDF files are allowed.');
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      this.docError.set('The file exceeds the 10 MB limit.');
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
        this.docError.set(extractError(err, 'Could not upload the file.'));
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
      error: () => this.docError.set('Could not download the file.'),
    });
  }

  removeDocument(doc: JobDocument): void {
    if (!confirm(`Delete ${doc.filename}?`)) return;
    this.api.deleteDocument(doc.id).subscribe({
      next: () => this.load(),
      error: (err) => this.docError.set(extractError(err, 'Could not delete the file.')),
    });
  }
}
