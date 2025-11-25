// lib/authClient.ts

import { getAuth } from "firebase/auth";
import { app } from "@/firebaseClient"; // your existing client-side Firebase init

export async function getIdToken(): Promise<string> {
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");
  const token = await user.getIdToken();
  return token;
}

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
