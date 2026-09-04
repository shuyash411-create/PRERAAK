import { guarded, RequestError } from "@/lib/guarded";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

/**
 * A short-lived signed URL for a document.
 *
 * Stage 1 builds the read path so its authorization is real and tested:
 * a person may fetch their own PERSON_VISIBLE documents, a mentor may fetch
 * their mentee's, an admin may fetch anything, and everybody else is refused
 * before storage is touched at all.
 *
 * STUBBED: object storage is Stage 3. Once authorized, this returns 503 until
 * the R2 bucket is configured. Upload, PDF generation and templates are Stage 3.
 */
export const GET = guarded<Params>(
  { action: "read", resource: ({ params }) => ({ kind: "document", id: params.id }) },
  async ({ params }) => {
    const document = await prisma.document.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, category: true, mimeType: true, sizeBytes: true, version: true },
    });
    if (!document) throw new RequestError(404, "not_found", "That document no longer exists.");

    // Stage 3 signs a URL against the R2 bucket here and returns it with a
    // short expiry. Until then every authorized read is refused honestly
    // rather than handed a URL that would not resolve.
    throw new RequestError(
      503,
      "document_storage_not_configured",
      "Document downloads are not available yet.",
    );
  },
);
