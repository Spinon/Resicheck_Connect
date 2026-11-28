import type {ImageDescriptor} from '../../../packages/chat-client/src/image-contract.ts';
import type {LocalImagePreview} from './local-image.ts';

// Only names and descriptors. Android owns bitmap eviction; we never pin a bitmap or a file.
type Saved = Readonly<{descriptor:ImageDescriptor;preview:LocalImagePreview}>;
export function createReceivedThumbnailMemory() {
  const recent = new Map<string, Saved>();
  return {
    get: (key:string) => recent.get(key),
    forget: (key:string) => recent.delete(key),
    clear: () => recent.clear(),
    remember(key:string, value:Saved) {
      recent.delete(key);
      recent.set(key, value);
      if (recent.size > 100) recent.delete(recent.keys().next().value!);
    },
  };
}
