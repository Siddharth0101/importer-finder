// The backend on Netlify: every /api route, the same code the local server runs.

import { handle } from '../../server/api.js';
import { useBlobs } from '../../server/storage.js';

useBlobs(); // no lasting disk here: the cache and saved searches go to Netlify Blobs

export default (request) => handle(request, { hosted: true });

export const config = { path: '/api/*' };
