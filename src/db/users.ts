import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string, name?: string) {
  try {
    const isOwner = email.toLowerCase() === 'em.nalo92@gmail.com';
    const result = await db.insert(users)
      .values({
        uid,
        email,
        name: name || (isOwner ? 'Ervin Nalo' : null),
        role: isOwner ? 'Owner' : 'Staff',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(name ? { name } : {}),
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
