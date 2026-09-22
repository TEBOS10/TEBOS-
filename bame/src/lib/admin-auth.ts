import { cookies } from "next/headers";

const COOKIE_NAME = "bame_admin_session";

export async function isAdminAuthed() {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return !!value && value === process.env.ADMIN_SESSION_SECRET;
}

export async function setAdminSession() {
  const store = await cookies();
  store.set(COOKIE_NAME, process.env.ADMIN_SESSION_SECRET || "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
