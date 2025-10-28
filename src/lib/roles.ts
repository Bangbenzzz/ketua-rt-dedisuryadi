import type { User } from 'firebase/auth';

// GANTI dengan UID operator yang sebenarnya:
export const OP_UIDS = ['Y6URzG12c2P5PSw2dMXkEvq26y02', 'aale6tiyI2PGEoezXU144OGpmiH3'];

export function isOperatorUser(u?: User | null): boolean {
  return !!u && OP_UIDS.includes(u.uid);
}