import { Injectable, inject, signal } from '@angular/core';
import { LanguageService } from '../i18n/language.service';

/**
 * Thin wrapper around the browser's Web Speech API (SpeechRecognition).
 *
 * Browser-native on purpose: no audio ever leaves the machine through us, and
 * there is no second paid service in the loop — only the recognised *text* is
 * later sent to the backend for parsing. Support is uneven (Chrome, Edge and
 * Safari have it; Firefox does not), so `supported` is the gate and the UI
 * always keeps the plain text field as the equal alternative.
 */

type SpeechRecognitionErrorCode =
  | 'no-speech'
  | 'aborted'
  | 'audio-capture'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'network'
  | string;

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: SpeechRecognitionErrorCode }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly language = inject(LanguageService);
  private recognition: SpeechRecognitionLike | null = null;

  readonly supported = recognitionCtor() !== null;
  readonly listening = signal(false);
  /** Everything recognised so far in this session, final parts only. */
  readonly transcript = signal('');
  /** The in-progress guess, shown greyed out while speaking. */
  readonly interim = signal('');
  /** Translation key of the last error, or null. */
  readonly errorKey = signal<string | null>(null);

  start(): void {
    const Ctor = recognitionCtor();
    if (!Ctor || this.listening()) return;

    this.errorKey.set(null);
    this.interim.set('');

    const recognition = new Ctor();
    recognition.lang = this.language.locale();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText) {
        this.transcript.update((current) => (current ? `${current} ${finalText.trim()}` : finalText.trim()));
      }
      this.interim.set(interimText);
    };

    recognition.onerror = (event) => {
      this.errorKey.set(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'capture.speech.denied'
          : event.error === 'no-speech'
            ? 'capture.speech.noSpeech'
            : 'capture.speech.failed',
      );
      this.listening.set(false);
    };

    recognition.onend = () => {
      this.listening.set(false);
      this.interim.set('');
    };

    this.recognition = recognition;
    try {
      recognition.start();
      this.listening.set(true);
    } catch {
      // start() throws if a previous session is still tearing down.
      this.errorKey.set('capture.speech.failed');
      this.listening.set(false);
    }
  }

  stop(): void {
    this.recognition?.stop();
    this.listening.set(false);
    this.interim.set('');
  }

  /** Drops the recogniser and every piece of recognised text. */
  reset(): void {
    this.recognition?.abort();
    this.recognition = null;
    this.listening.set(false);
    this.transcript.set('');
    this.interim.set('');
    this.errorKey.set(null);
  }

  /** Lets the user edit the dictated text before it is parsed. */
  setTranscript(value: string): void {
    this.transcript.set(value);
  }
}
