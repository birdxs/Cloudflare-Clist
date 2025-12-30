export interface WebdevConfig {
  endpoint: string;
  username: string;
  password: string;
  basePath?: string;
}

export interface S3Object {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  isDirectory: boolean;
  etag?: string;
}

export interface ListObjectsResult {
  objects: S3Object[];
  prefixes: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export class WebdevClient {
  private config: WebdevConfig;

  constructor(config: WebdevConfig) {
    this.config = config;
  }

  private getFullPath(path: string): string {
    const basePath = this.config.basePath?.replace(/^\/|\/$/g, "") || "";
    const cleanPath = path.replace(/^\//, "");
    return basePath ? `${basePath}/${cleanPath}` : cleanPath;
  }

  private getBasicAuth(): string {
    const credentials = `${this.config.username}:${this.config.password}`;
    return "Basic " + btoa(credentials);
  }

  private normalizeEndpoint(endpoint: string): string {
    return endpoint.replace(/\/$/, "");
  }

  async listObjects(
    prefix: string = "",
    delimiter: string = "/",
    maxKeys: number = 1000,
    continuationToken?: string
  ): Promise<ListObjectsResult> {
    let normalizedPrefix = prefix;
    if (normalizedPrefix && !normalizedPrefix.endsWith("/")) {
      normalizedPrefix = normalizedPrefix + "/";
    }

    const fullPrefix = this.getFullPath(normalizedPrefix);
    const endpoint = this.normalizeEndpoint(this.config.endpoint);
    const url = fullPrefix ? `${endpoint}/${fullPrefix}` : endpoint;

    const xmlBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`;

    try {
      const response = await fetch(url, {
        method: "PROPFIND",
        headers: {
          Authorization: this.getBasicAuth(),
          "Content-Type": "application/xml",
          Depth: "1",
        },
        body: xmlBody,
      });

      if (!response.ok && response.status !== 207) {
        throw new Error(`WebDAV PROPFIND failed: ${response.status}`);
      }

      const xml = await response.text();
      return this.parsePropfindResponse(xml, fullPrefix, normalizedPrefix);
    } catch (error) {
      throw new Error(`WebDAV listObjects failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private parsePropfindResponse(
    xml: string,
    fullPrefix: string,
    displayPrefix: string
  ): ListObjectsResult {
    const objects: S3Object[] = [];
    const prefixes: string[] = [];
    const basePath = this.config.basePath?.replace(/^\/|\/$/g, "") || "";

    const decodeXml = (str: string) => str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

    // Parse response entries
    const responseRegex = /<D:response>([\s\S]*?)<\/D:response>/g;
    let match;

    while ((match = responseRegex.exec(xml)) !== null) {
      const response = match[1];

      // Skip the parent directory entry
      const hrefMatch = response.match(/<D:href>(.*?)<\/D:href>/);
      if (!hrefMatch) continue;

      const href = decodeXml(hrefMatch[1]);
      const resourceTypeMatch = response.match(/<D:resourcetype>([\s\S]*?)<\/D:resourcetype>/);
      const isDirectory = resourceTypeMatch && resourceTypeMatch[1].includes("collection");

      const displayNameMatch = response.match(/<D:displayname>(.*?)<\/D:displayname>/);
      const displayName = displayNameMatch ? decodeXml(displayNameMatch[1]) : "";

      const contentLengthMatch = response.match(/<D:getcontentlength>(.*?)<\/D:getcontentlength>/);
      const size = contentLengthMatch ? parseInt(contentLengthMatch[1], 10) : 0;

      const lastModifiedMatch = response.match(/<D:getlastmodified>(.*?)<\/D:getlastmodified>/);
      const lastModified = lastModifiedMatch ? decodeXml(lastModifiedMatch[1]) : "";

      if (!displayName) continue;

      // Skip if this is the current path itself
      const decodedHref = decodeURIComponent(href).replace(/^\//, "");
      const expectedCurrent = fullPrefix.replace(/^\//, "");
      if (decodedHref === expectedCurrent || decodedHref === expectedCurrent + "/") {
        continue;
      }

      const key = displayName;
      const name = displayName;

      if (isDirectory) {
        prefixes.push(key);
        objects.push({
          key,
          name,
          size: 0,
          lastModified,
          isDirectory: true,
        });
      } else {
        objects.push({
          key,
          name,
          size,
          lastModified,
          isDirectory: false,
        });
      }
    }

    return {
      objects: objects.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
      prefixes,
      isTruncated: false,
      nextContinuationToken: undefined,
    };
  }

  async getObject(key: string): Promise<Response> {
    const fullKey = this.getFullPath(key);
    const endpoint = this.normalizeEndpoint(this.config.endpoint);
    const url = `${endpoint}/${fullKey}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: this.getBasicAuth(),
        },
      });

      if (!response.ok) {
        throw new Error(`WebDAV GetObject failed: ${response.status}`);
      }

      return response;
    } catch (error) {
      throw new Error(`WebDAV getObject failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async putObject(key: string, body: ArrayBuffer | string, contentType?: string): Promise<void> {
    const fullKey = this.getFullPath(key);
    const endpoint = this.normalizeEndpoint(this.config.endpoint);
    const url = `${endpoint}/${fullKey}`;

    let bodyData: ArrayBuffer;
    if (typeof body === "string") {
      bodyData = new TextEncoder().encode(body).buffer as ArrayBuffer;
    } else {
      bodyData = body;
    }

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: this.getBasicAuth(),
          "Content-Type": contentType || "application/octet-stream",
        },
        body: bodyData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`WebDAV PutObject failed: ${response.status} ${text}`);
      }
    } catch (error) {
      throw new Error(`WebDAV putObject failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async deleteObject(key: string): Promise<void> {
    const fullKey = this.getFullPath(key);
    const endpoint = this.normalizeEndpoint(this.config.endpoint);
    const url = `${endpoint}/${fullKey}`;

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: this.getBasicAuth(),
        },
      });

      if (!response.ok && response.status !== 204) {
        const text = await response.text();
        throw new Error(`WebDAV DeleteObject failed: ${response.status} ${text}`);
      }
    } catch (error) {
      throw new Error(`WebDAV deleteObject failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async createFolder(folderPath: string): Promise<void> {
    const normalizedPath = folderPath.endsWith("/") ? folderPath : folderPath + "/";
    const fullKey = this.getFullPath(normalizedPath);
    const endpoint = this.normalizeEndpoint(this.config.endpoint);
    const url = `${endpoint}/${fullKey}`;

    try {
      const response = await fetch(url, {
        method: "MKCOL",
        headers: {
          Authorization: this.getBasicAuth(),
        },
      });

      if (!response.ok && response.status !== 201) {
        const text = await response.text();
        throw new Error(`WebDAV MKCOL failed: ${response.status} ${text}`);
      }
    } catch (error) {
      throw new Error(`WebDAV createFolder failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async copyObject(sourceKey: string, destKey: string): Promise<void> {
    const fullSourceKey = this.getFullPath(sourceKey);
    const fullDestKey = this.getFullPath(destKey);
    const endpoint = this.normalizeEndpoint(this.config.endpoint);
    const sourceUrl = `${endpoint}/${fullSourceKey}`;
    const destUrl = `${endpoint}/${fullDestKey}`;

    try {
      const response = await fetch(destUrl, {
        method: "COPY",
        headers: {
          Authorization: this.getBasicAuth(),
          Destination: destUrl,
          Overwrite: "F",
        },
      });

      if (!response.ok && response.status !== 201 && response.status !== 204) {
        const text = await response.text();
        throw new Error(`WebDAV COPY failed: ${response.status} ${text}`);
      }
    } catch (error) {
      throw new Error(`WebDAV copyObject failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async headObject(
    key: string
  ): Promise<{ contentLength: number; contentType: string; lastModified: string } | null> {
    const fullKey = this.getFullPath(key);
    const endpoint = this.normalizeEndpoint(this.config.endpoint);
    const url = `${endpoint}/${fullKey}`;

    try {
      const response = await fetch(url, {
        method: "HEAD",
        headers: {
          Authorization: this.getBasicAuth(),
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`WebDAV HeadObject failed: ${response.status}`);
      }

      return {
        contentLength: parseInt(response.headers.get("content-length") || "0", 10),
        contentType: response.headers.get("content-type") || "application/octet-stream",
        lastModified: response.headers.get("last-modified") || "",
      };
    } catch (error) {
      throw new Error(`WebDAV headObject failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // WebDAV doesn't support multipart uploads, these are no-ops or alternatives
  async initiateMultipartUpload(key: string, contentType: string): Promise<string> {
    // Return a dummy upload ID - WebDAV doesn't have true multipart uploads
    // We'll use it as an indicator for PUT-based uploads
    return `webdev-${Date.now()}`;
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: ReadableStream | ArrayBuffer,
    contentLength?: number
  ): Promise<string> {
    // For WebDAV, we can accumulate parts in a temporary file or handle differently
    // For now, return a dummy etag
    return `${partNumber}`;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[]
  ): Promise<void> {
    // For WebDAV, multipart uploads aren't used this way
    // This is handled by direct PUT in the API layer
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    // No action needed for WebDAV
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // WebDAV doesn't support signed URLs
    // Return a simple direct URL with basic auth
    const fullKey = this.getFullPath(key);
    const endpoint = this.normalizeEndpoint(this.config.endpoint);
    // Note: This is not secure - basic auth in URL is deprecated
    // Prefer using Authorization header instead
    return `${endpoint}/${fullKey}`;
  }

  async getSignedUploadPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn: number = 3600
  ): Promise<string> {
    // WebDAV doesn't support this
    return this.getSignedUrl(key, expiresIn);
  }
}
