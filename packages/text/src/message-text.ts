import { countGraphemes } from 'unicode-segmenter/grapheme';

export const messageLimits = Object.freeze({ graphemes: 2000, bytes: 64 * 1024 });
export type TextAnalysis = Readonly<{
  valid: boolean;
  reason: null | 'empty' | 'unicode' | 'control' | 'graphemes' | 'bytes';
  graphemes: number | null;
  bytes: number | null;
}>;

// Portable across Hermes and Node, without TextEncoder or String.isWellFormed.
// Reject isolated surrogates; never silently repair, normalize or truncate input.
export function analyzeMessage(value: unknown): TextAnalysis {
  if (typeof value !== 'string') return { valid: false, reason: 'unicode', graphemes: null, bytes: null };
  let bytes = 0;
  let control = false;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return { valid: false, reason: 'unicode', graphemes: null, bytes: null };
      bytes += 4;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return { valid: false, reason: 'unicode', graphemes: null, bytes: null };
    } else {
      bytes += unit < 0x80 ? 1 : unit < 0x800 ? 2 : 3;
      if (unit <= 8 || unit === 11 || unit === 12 || unit >= 14 && unit <= 31 || unit === 127) control = true;
    }
  }
  // Do not segment unbounded payloads. Bytes is an independent transport budget.
  if (bytes > messageLimits.bytes) return { valid: false, reason: 'bytes', graphemes: null, bytes };
  if (control) return { valid: false, reason: 'control', graphemes: null, bytes };
  const graphemes = countGraphemes(value);
  const reason = !value.trim() ? 'empty' : graphemes > messageLimits.graphemes ? 'graphemes' : null;
  return { valid: reason === null, reason, graphemes, bytes };
}

export function messageInputError(analysis: TextAnalysis): string | null {
  if (analysis.reason === 'graphemes') return 'A mensagem ultrapassa 2.000 caracteres. Edite o texto para enviar.';
  if (analysis.reason === 'bytes') return 'A mensagem ultrapassa o limite de tamanho (64 KiB). Divida o texto para enviar.';
  if (analysis.reason === 'unicode' || analysis.reason === 'control') return 'A mensagem contém caracteres não aceitos. Revise o texto para enviar.';
  return null;
}
