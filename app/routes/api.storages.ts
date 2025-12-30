import type { Route } from "./+types/api.storages";
import {
  getAllStorages,
  getPublicStorages,
  createStorage,
  updateStorage,
  deleteStorage,
  getStorageById,
  initDatabase,
} from "~/lib/storage";
import {
  requireAuth,
  createSession,
  deleteSession,
  validateAdmin,
  createSessionCookie,
  deleteSessionCookie,
  getSessionIdFromCookie,
} from "~/lib/auth";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  await initDatabase(db);

  const { isAdmin } = await requireAuth(request, db);

  if (isAdmin) {
    const storages = await getAllStorages(db);
    return Response.json({
      storages: storages.map((s) => ({
        ...s,
        secretAccessKey: "***",
      })),
      isAdmin: true,
    });
  }

  const storages = await getPublicStorages(db);
  return Response.json({
    storages: storages.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      isPublic: s.isPublic,
      guestList: s.guestList,
      guestDownload: s.guestDownload,
      guestUpload: s.guestUpload,
    })),
    isAdmin: false,
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  const db = context.cloudflare.env.DB;
  await initDatabase(db);

  const method = request.method;

  if (method === "POST") {
    const body = await request.json();
    const { action: actionType } = body as { action?: string };

    // Login action
    if (actionType === "login") {
      const { username, password } = body as { username: string; password: string };
      const isValid = await validateAdmin(username, password, context.cloudflare.env as { ADMIN_USERNAME: string; ADMIN_PASSWORD: string });

      if (!isValid) {
        return Response.json({ error: "Invalid credentials" }, { status: 401 });
      }

      const sessionId = await createSession(db, "admin");
      return Response.json(
        { success: true },
        {
          headers: {
            "Set-Cookie": createSessionCookie(sessionId),
          },
        }
      );
    }

    // Logout action
    if (actionType === "logout") {
      const cookieHeader = request.headers.get("Cookie");
      const sessionId = getSessionIdFromCookie(cookieHeader);
      if (sessionId) {
        await deleteSession(db, sessionId);
      }
      return Response.json(
        { success: true },
        {
          headers: {
            "Set-Cookie": deleteSessionCookie(),
          },
        }
      );
    }

    // Create storage (admin only)
    const { isAdmin } = await requireAuth(request, db, "admin");
    if (!isAdmin) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    try {
      const storage = await createStorage(db, body as Parameters<typeof createStorage>[1]);
      return Response.json({ storage: { ...storage, secretAccessKey: "***" } });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to create storage" },
        { status: 400 }
      );
    }
  }

  if (method === "PUT") {
    const { isAdmin } = await requireAuth(request, db, "admin");
    if (!isAdmin) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...input } = body as { id: number; [key: string]: unknown };

    try {
      const storage = await updateStorage(db, id, input);
      if (!storage) {
        return Response.json({ error: "Storage not found" }, { status: 404 });
      }
      return Response.json({ storage: { ...storage, secretAccessKey: "***" } });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to update storage" },
        { status: 400 }
      );
    }
  }

  if (method === "DELETE") {
    const { isAdmin } = await requireAuth(request, db, "admin");
    if (!isAdmin) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get("id") || "0", 10);

    if (!id) {
      return Response.json({ error: "Storage ID required" }, { status: 400 });
    }

    const deleted = await deleteStorage(db, id);
    if (!deleted) {
      return Response.json({ error: "Storage not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
