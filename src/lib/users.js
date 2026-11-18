/**
 * Serializes a Better Auth MongoDB user document into the transport-safe shape
 * the Next.js client expects. Never forwards password hashes or adapter-only
 * fields.
 * @param {Record<string, any>} user
 */
export function serializeUser(user) {
  const id = user.id ?? user._id?.toString?.() ?? String(user._id ?? "");

  return {
    id,
    name: user.name ?? "",
    email: user.email ?? "",
    image: user.image ?? null,
    emailVerified: Boolean(user.emailVerified),
    createdAt:
      user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : (user.createdAt ?? null),
  };
}
