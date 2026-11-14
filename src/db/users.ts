import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string, name?: string) {
  try {
    const cleanUid = String(uid || '').trim().slice(0, 128);
    const cleanEmail = String(email || '').trim().slice(0, 254);
    const cleanName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : undefined;
    const isOwner = cleanEmail.toLowerCase() === 'em.nalo92@gmail.com';
    const result = await db.insert(users)
      .values({
        uid: cleanUid,
        email: cleanEmail,
        name: cleanName || (isOwner ? 'Ervin Nalo' : null),
        role: isOwner ? 'Owner' : 'Staff',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: cleanEmail,
          ...(cleanName ? { name: cleanName } : {}),
          ...(isOwner ? { role: 'Owner' } : {}),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database getOrCreateUser failed:', error);
    throw new Error('Database user sync failed.', { cause: error });
  }
}

export async function getAllUsers() {
  try {
    return await db.select().from(users);
  } catch (error) {
    console.error('Database getAllUsers failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
