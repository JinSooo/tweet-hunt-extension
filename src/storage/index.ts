// src/storage/index.ts
// Open-source storage adapter.
// The private build uses a separate local encryption layer that is intentionally
// not included in the public repository.
import { Storage } from '@plasmohq/storage';

export const localStorageInstance = new Storage({ area: 'local' });
