import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ROLE_RANK, type Role } from "@/lib/constants";

const COOKIE = "crm_session";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-cambiar-en-produccion-123456");

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  color: string;
};

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    const id = String(payload.sub ?? "");
    if (!id) return null;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !user.active) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role as Role, color: user.color };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(min: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (ROLE_RANK[user.role] < ROLE_RANK[min]) redirect("/inbox");
  return user;
}

export function can(user: { role: Role }, min: Role) {
  return ROLE_RANK[user.role] >= ROLE_RANK[min];
}
