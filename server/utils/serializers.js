/** Removes secrets from a User instance / object before sending it to clients. */
export const serializeUser = (user) => {
  if (!user) return null;
  const data = user.toJSON ? user.toJSON() : { ...user };
  delete data.password_hash;
  if (data.role && typeof data.role === 'object') {
    data.role_name = data.role.name;
  }
  data.is_email_verified = Boolean(data.email_verified_at);
  return data;
};

/** Public-facing user card (tutor profiles, community authors, reviews). */
export const PUBLIC_USER_ATTRS = ['id', 'first_name', 'last_name', 'profile_image'];

/** Live class fields hidden from students (host link). */
export const serializeLiveClassForStudent = (liveClass, { canJoin = false } = {}) => {
  const data = liveClass.toJSON ? liveClass.toJSON() : { ...liveClass };
  delete data.zoom_start_url;
  if (!canJoin) {
    delete data.zoom_join_url;
    delete data.password;
  }
  return data;
};

export default { serializeUser, PUBLIC_USER_ATTRS, serializeLiveClassForStudent };
