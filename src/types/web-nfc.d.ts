/**
 * Type declarations for the Web NFC API.
 * @see https://w3c.github.io/web-nfc/
 */

interface NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(
    message: NDEFMessageSource,
    options?: { overwrite?: boolean; signal?: AbortSignal }
  ): Promise<void>;
  onreading: ((this: NDEFReader, ev: NDEFReadingEvent) => void) | null;
  onerror: ((this: NDEFReader, ev: Event) => void) | null;
}

interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: NDEFMessage;
}

interface NDEFMessage {
  records: NDEFRecord[];
}

type NDEFMessageSource = string | NDEFMessage | NDEFRecord[];

interface NDEFRecord {
  recordType: string;
  mediaType?: string;
  id?: string;
  data?: BufferSource;
  encoding?: string;
  lang?: string;
}

declare const NDEFReader: {
  prototype: NDEFReader;
  new (): NDEFReader;
};

interface Window {
  NDEFReader?: typeof NDEFReader;
}
