// Where saved data lives: JSON files in .cache/ on a computer, Netlify Blobs on Netlify
// (functions there have no lasting disk). The Netlify function calls useBlobs() once.

let blobs = null; // the @netlify/blobs module, once useBlobs() is called

export const useBlobs = () => { blobs ||= import('@netlify/blobs'); };
export const usingBlobs = () => Boolean(blobs);

// Strong consistency: a search saved a second ago must be found again, or opening it
// a second time would spend its credits again.
export async function blobStore(name) {
  const { getStore } = await blobs;
  return getStore({ name, consistency: 'strong' });
}

// For /api/status: can the app reach its saved data?
export async function storageCheck() {
  if (!usingBlobs()) return { kind: 'files', ok: true };
  try {
    await (await blobStore('health')).get('ping');
    return { kind: 'blobs', ok: true };
  } catch (err) {
    return { kind: 'blobs', ok: false, error: err.message };
  }
}
