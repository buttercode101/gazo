import { auth } from './firebase';

export const triggerHaptic = () => {
  if (typeof window !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(50);
  }
};

export const triggerShare = async (title: string, text: string, url: string) => {
  triggerHaptic();
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch (e) {
      console.log('Share dismissed or failed', e);
    }
  } else {
    navigator.clipboard.writeText(`${title} - ${text} ${url}`);
    return true;
  }
  return false;
};

/**
 * Front-end seeding trigger.
 *
 * Source of truth for station generation lives in scripts/privilegedSeeder.mjs.
 * This client only calls the privileged endpoint.
 */
export const seedDatabase = async (): Promise<'seeded' | 'already-seeded' | 'failed'> => {
  const seedStartedAt = new Date().toISOString();
  const seedVersion = 'south-africa-v3';

  try {
    if (!auth.currentUser) {
      console.error('Seeding failed', { reason_code: 'not-authenticated', version: seedVersion, started_at: seedStartedAt });
      return 'failed';
    }

    const seederUrl = (import.meta.env.VITE_PRIVILEGED_SEEDER_URL as string | undefined)?.trim() || '/api/ops/seed-stations';
    const token = await auth.currentUser.getIdToken();

    const response = await fetch(seederUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        version: seedVersion,
        startedAt: seedStartedAt,
        requestedBy: {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email ?? null
        }
      })
    });

    if (!response.ok) {
      console.error('Seeding failed', {
        reason_code: 'seeder-http-error',
        version: seedVersion,
        started_at: seedStartedAt,
        status: response.status
      });
      return 'failed';
    }

    const payload = (await response.json()) as { status?: string };
    if (payload.status === 'already-seeded') return 'already-seeded';
    if (payload.status === 'seeded') return 'seeded';

    console.error('Seeding failed', {
      reason_code: 'invalid-seeder-response',
      version: seedVersion,
      started_at: seedStartedAt,
      payload
    });
    return 'failed';
  } catch (err) {
    console.error('Seeding failed', {
      reason_code: 'privileged-seeder-unavailable',
      version: seedVersion,
      started_at: seedStartedAt,
      error: err instanceof Error ? err.message : String(err)
    });
    return 'failed';
  }
};
