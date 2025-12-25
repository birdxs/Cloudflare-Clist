import type { Route } from "./+types/home";
import { requireAuth } from "~/lib/auth";
import { getAllStorages, getPublicStorages, initDatabase } from "~/lib/storage";
import { useState, useEffect } from "react";

export function meta() {
  return [
    { title: "CList - Storage Manager" },
    { name: "description", content: "S3 Storage Aggregation Service" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;

  if (!db) {
    console.error("D1 Database not bound");
    return { isAdmin: false, storages: [] };
  }

  await initDatabase(db);

  const { isAdmin } = await requireAuth(request, db);

  const storages = isAdmin
    ? await getAllStorages(db)
    : await getPublicStorages(db);

  return {
    isAdmin,
    storages: storages.map((s) => ({
      id: s.id,
      name: s.name,
      isPublic: s.isPublic,
    })),
  };
}

interface S3Object {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  isDirectory: boolean;
}

interface StorageInfo {
  id: number;
  name: string;
  isPublic: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/storages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username, password }),
      });

      if (res.ok) {
        onLogin();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          required
        />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md disabled:opacity-50"
      >
        {loading ? "Logging in..." : "Login"}
      </button>
    </form>
  );
}

function StorageForm({
  storage,
  onSave,
  onCancel,
}: {
  storage?: StorageInfo & { endpoint?: string; region?: string; accessKeyId?: string; bucket?: string; basePath?: string };
  onSave: () => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: storage?.name || "",
    endpoint: storage?.endpoint || "",
    region: storage?.region || "us-east-1",
    accessKeyId: storage?.accessKeyId || "",
    secretAccessKey: "",
    bucket: storage?.bucket || "",
    basePath: storage?.basePath || "",
    isPublic: storage?.isPublic || false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const method = storage ? "PUT" : "POST";
      const body = storage ? { id: storage.id, ...formData } : formData;

      // Remove empty secretAccessKey on update
      if (storage && !formData.secretAccessKey) {
        delete (body as Record<string, unknown>).secretAccessKey;
      }

      const res = await fetch("/api/storages", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        onSave();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Region
          </label>
          <input
            type="text"
            value={formData.region}
            onChange={(e) => setFormData({ ...formData, region: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Endpoint *
          </label>
          <input
            type="url"
            value={formData.endpoint}
            onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
            placeholder="https://s3.amazonaws.com"
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Access Key ID *
          </label>
          <input
            type="text"
            value={formData.accessKeyId}
            onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required={!storage}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Secret Access Key {storage ? "(leave empty to keep)" : "*"}
          </label>
          <input
            type="password"
            value={formData.secretAccessKey}
            onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required={!storage}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Bucket *
          </label>
          <input
            type="text"
            value={formData.bucket}
            onChange={(e) => setFormData({ ...formData, bucket: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Base Path
          </label>
          <input
            type="text"
            value={formData.basePath}
            onChange={(e) => setFormData({ ...formData, basePath: e.target.value })}
            placeholder="Optional prefix path"
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div className="col-span-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.isPublic}
              onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Public (visible to guests)
            </span>
          </label>
        </div>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex space-x-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white py-2 px-4 rounded-md"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function FileBrowser({
  storage,
  isAdmin,
}: {
  storage: StorageInfo;
  isAdmin: boolean;
}) {
  const [path, setPath] = useState("");
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
  }, [storage.id, path]);

  const loadFiles = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/files/${storage.id}/${path}?action=list`);
      if (res.ok) {
        const data = (await res.json()) as { objects?: S3Object[] };
        setObjects(data.objects || []);
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to load files");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (newPath: string) => {
    setPath(newPath.replace(/^\//, "").replace(/\/$/, ""));
  };

  const goUp = () => {
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    setPath(parts.join("/"));
  };

  const downloadFile = async (key: string) => {
    window.open(`/api/files/${storage.id}/${key}?action=download`, "_blank");
  };

  const deleteFile = async (key: string) => {
    if (!confirm(`Delete "${key}"?`)) return;

    try {
      const res = await fetch(`/api/files/${storage.id}/${key}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadFiles();
      } else {
        const data = (await res.json()) as { error?: string };
        alert(data.error || "Failed to delete");
      }
    } catch {
      alert("Network error");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      setUploadProgress(`Uploading ${file.name}...`);
      try {
        const uploadPath = path ? `${path}/${file.name}` : file.name;
        const res = await fetch(`/api/files/${storage.id}/${uploadPath}`, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          alert(`Failed to upload ${file.name}: ${data.error}`);
        }
      } catch {
        alert(`Failed to upload ${file.name}`);
      }
    }
    setUploadProgress(null);
    loadFiles();
    e.target.value = "";
  };

  const breadcrumbs = path ? path.split("/").filter(Boolean) : [];

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm">
        <button
          onClick={() => setPath("")}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          {storage.name}
        </button>
        {breadcrumbs.map((part, i) => (
          <span key={i} className="flex items-center space-x-2">
            <span className="text-gray-400">/</span>
            <button
              onClick={() => navigateTo(breadcrumbs.slice(0, i + 1).join("/"))}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-2">
        {path && (
          <button
            onClick={goUp}
            className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white py-1 px-3 rounded text-sm"
          >
            .. Up
          </button>
        )}
        <button
          onClick={loadFiles}
          className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white py-1 px-3 rounded text-sm"
        >
          Refresh
        </button>
        {isAdmin && (
          <label className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded text-sm cursor-pointer">
            Upload
            <input
              type="file"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        )}
        {uploadProgress && (
          <span className="text-sm text-gray-500">{uploadProgress}</span>
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* File list */}
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2 w-24">Size</th>
                <th className="text-left px-4 py-2 w-40">Modified</th>
                <th className="text-right px-4 py-2 w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {objects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No files
                  </td>
                </tr>
              ) : (
                objects.map((obj) => (
                  <tr
                    key={obj.key}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-2">
                      {obj.isDirectory ? (
                        <button
                          onClick={() => navigateTo(obj.key)}
                          className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <span>📁</span>
                          <span>{obj.name}</span>
                        </button>
                      ) : (
                        <span className="flex items-center space-x-2">
                          <span>📄</span>
                          <span>{obj.name}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {obj.isDirectory ? "-" : formatBytes(obj.size)}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {formatDate(obj.lastModified)}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      {!obj.isDirectory && (
                        <button
                          onClick={() => downloadFile(obj.key)}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Download
                        </button>
                      )}
                      {isAdmin && !obj.isDirectory && (
                        <button
                          onClick={() => deleteFile(obj.key)}
                          className="text-red-600 dark:text-red-400 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const [isAdmin, setIsAdmin] = useState(loaderData.isAdmin);
  const [storages, setStorages] = useState<StorageInfo[]>(loaderData.storages);
  const [selectedStorage, setSelectedStorage] = useState<StorageInfo | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showStorageForm, setShowStorageForm] = useState(false);
  const [editingStorage, setEditingStorage] = useState<StorageInfo | null>(null);

  const refreshStorages = async () => {
    try {
      const res = await fetch("/api/storages");
      if (res.ok) {
        const data = (await res.json()) as { storages: StorageInfo[]; isAdmin: boolean };
        setStorages(data.storages);
        setIsAdmin(data.isAdmin);
      }
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/storages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setIsAdmin(false);
      setSelectedStorage(null);
      refreshStorages();
    } catch {
      // ignore
    }
  };

  const handleDeleteStorage = async (storage: StorageInfo) => {
    if (!confirm(`Delete storage "${storage.name}"?`)) return;

    try {
      const res = await fetch(`/api/storages?id=${storage.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (selectedStorage?.id === storage.id) {
          setSelectedStorage(null);
        }
        refreshStorages();
      } else {
        const data = (await res.json()) as { error?: string };
        alert(data.error || "Failed to delete");
      }
    } catch {
      alert("Network error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            CList
          </h1>
          <div className="flex items-center space-x-4">
            {isAdmin ? (
              <>
                <span className="text-sm text-green-600 dark:text-green-400">
                  Admin
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-600 dark:text-gray-300 hover:underline"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowLoginForm(true)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Admin Login
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 flex gap-4">
        {/* Sidebar */}
        <aside className="w-64 shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Storages
              </h2>
              {isAdmin && (
                <button
                  onClick={() => {
                    setEditingStorage(null);
                    setShowStorageForm(true);
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  + Add
                </button>
              )}
            </div>
            <ul className="space-y-1">
              {storages.length === 0 ? (
                <li className="text-gray-500 text-sm">No storages</li>
              ) : (
                storages.map((s) => (
                  <li key={s.id} className="flex items-center justify-between group">
                    <button
                      onClick={() => setSelectedStorage(s)}
                      className={`flex-1 text-left px-2 py-1 rounded text-sm ${
                        selectedStorage?.id === s.id
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                          : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {s.name}
                      {s.isPublic && (
                        <span className="ml-1 text-xs text-gray-400">(public)</span>
                      )}
                    </button>
                    {isAdmin && (
                      <div className="hidden group-hover:flex items-center space-x-1">
                        <button
                          onClick={() => {
                            setEditingStorage(s);
                            setShowStorageForm(true);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteStorage(s)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 min-h-96">
            {selectedStorage ? (
              <FileBrowser storage={selectedStorage} isAdmin={isAdmin} />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                Select a storage to browse files
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Login Modal */}
      {showLoginForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Admin Login
              </h2>
              <button
                onClick={() => setShowLoginForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <LoginForm
              onLogin={() => {
                setShowLoginForm(false);
                refreshStorages();
                setIsAdmin(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Storage Form Modal */}
      {showStorageForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingStorage ? "Edit Storage" : "Add Storage"}
              </h2>
              <button
                onClick={() => {
                  setShowStorageForm(false);
                  setEditingStorage(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <StorageForm
              storage={editingStorage || undefined}
              onSave={() => {
                setShowStorageForm(false);
                setEditingStorage(null);
                refreshStorages();
              }}
              onCancel={() => {
                setShowStorageForm(false);
                setEditingStorage(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
