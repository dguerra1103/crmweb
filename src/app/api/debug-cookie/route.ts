import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico temporal: confirma si el navegador guarda cookies puestas
 * por este servidor en este host/puerto. Bórralo cuando ya no lo necesites.
 *   /api/debug-cookie?set=1  -> pone la cookie
 *   /api/debug-cookie        -> dice si la recibió de vuelta
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("set") === "1") {
    const res = NextResponse.json({ action: "cookie puesta", secure: false });
    res.cookies.set("debug_cookie", "funciona-" + Date.now(), {
      httpOnly: false,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 300,
    });
    return res;
  }

  const value = request.headers.get("cookie") ?? "(sin header cookie)";
  return NextResponse.json({ cookieHeaderRecibido: value });
}
