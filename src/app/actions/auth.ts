"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, verifyPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Escribe tu correo y contraseña." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Correo o contraseña incorrectos." };
  }
  if (!user.active) return { error: "Tu usuario está desactivado. Habla con un administrador." };

  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  await logActivity({ userId: user.id, action: "auth.login", summary: `${user.name} inició sesión` });

  redirect("/inbox");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await logActivity({ userId: user.id, action: "auth.logout", summary: `${user.name} cerró sesión` });
  await destroySession();
  redirect("/login");
}
