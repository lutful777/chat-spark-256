export const OWNER_EMAIL = "lutfulh19@gmail.com";
export const OWNER_ROLE = "Owner · Admin · Developer";

export function getRoleForEmail(email?: string | null): string {
  return (email ?? "").trim().toLowerCase() === OWNER_EMAIL ? OWNER_ROLE : "User";
}
