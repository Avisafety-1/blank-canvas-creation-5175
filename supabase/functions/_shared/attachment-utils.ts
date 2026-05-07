import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Reduced limit to 5 MB to prevent memory issues in Edge Functions
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per attachment (inline)
const MAX_TOTAL_ATTACHMENTS_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB total

export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
  encoding: "binary";
}

export interface SkippedAttachmentInfo {
  fileName: string;
  reason: string;
  downloadUrl?: string; // Public URL for large files
  fileSizeMB?: string;
}

export interface AttachmentResult {
  attachments: EmailAttachment[];
  skippedAttachments: string[]; // For backward compatibility (simple names)
  skippedAttachmentDetails: SkippedAttachmentInfo[]; // Detailed info with URLs
  totalSizeBytes: number;
}

/**
 * Fetches attachments for an email template with size validation.
 * Files over 5 MB are not downloaded but return a public download URL instead.
 */
export async function getTemplateAttachments(
  templateId: string
): Promise<AttachmentResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const result: AttachmentResult = {
    attachments: [],
    skippedAttachments: [],
    skippedAttachmentDetails: [],
    totalSizeBytes: 0
  };

  try {
    // Get template attachments with document info including file size
    const { data: attachmentData, error: attachmentError } = await supabase
      .from('email_template_attachments')
      .select(`
        document_id,
        documents:document_id (
          id,
          tittel,
          fil_url,
          fil_navn,
          fil_storrelse
        )
      `)
      .eq('template_id', templateId);

    if (attachmentError) {
      console.error('Error fetching template attachments:', attachmentError);
      return result;
    }

    if (!attachmentData || attachmentData.length === 0) {
      console.log(`No attachments found for template ${templateId}`);
      return result;
    }

    console.log(`Found ${attachmentData.length} attachment(s) for template ${templateId}`);

    // Process each attachment
    for (const att of attachmentData) {
      const doc = att.documents as any;
      if (!doc?.fil_url) continue;

      const fileName = doc.fil_navn || doc.tittel || 'vedlegg';
      const fileSizeBytes = doc.fil_storrelse || 0;
      const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(2);

      console.log(`Processing attachment ${fileName}: ${fileSizeMB} MB (from database)`);

      // Check if file is too large BEFORE downloading (to save memory)
      if (fileSizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
        console.log(`Attachment ${fileName} is ${fileSizeMB} MB - generating download link instead`);
        
        // Generate a signed URL for the file (valid for 7 days)
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.fil_url, 60 * 60 * 24 * 7); // 7 days

        if (signedUrlError) {
          console.error(`Error creating signed URL for ${fileName}:`, signedUrlError);
          result.skippedAttachments.push(`${fileName} (kunne ikke lage lenke)`);
          result.skippedAttachmentDetails.push({
            fileName,
            reason: 'kunne ikke lage lenke',
            fileSizeMB
          });
        } else {
          result.skippedAttachments.push(`${fileName} (for stor: ${fileSizeMB} MB)`);
          result.skippedAttachmentDetails.push({
            fileName,
            reason: 'for stor',
            downloadUrl: signedUrlData.signedUrl,
            fileSizeMB
          });
          console.log(`Generated download link for ${fileName}`);
        }
        continue;
      }

      // Check if adding this would exceed total limit before downloading
      if (result.totalSizeBytes + fileSizeBytes > MAX_TOTAL_ATTACHMENTS_SIZE_BYTES) {
        console.warn(`Skipping attachment ${fileName} - would exceed total size limit`);
        
        // Generate signed URL as fallback
        const { data: signedUrlData } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.fil_url, 60 * 60 * 24 * 7);

        result.skippedAttachments.push(`${fileName} (totalgrense overskredet)`);
        result.skippedAttachmentDetails.push({
          fileName,
          reason: 'totalgrense overskredet',
          downloadUrl: signedUrlData?.signedUrl,
          fileSizeMB
        });
        continue;
      }

      try {
        // Download file from storage with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout per file

        const { data: fileData, error: downloadError } = await supabase.storage
          .from('documents')
          .download(doc.fil_url);

        clearTimeout(timeoutId);

        if (downloadError) {
          console.error(`Error downloading file ${doc.fil_url}:`, downloadError);
          result.skippedAttachments.push(`${fileName} (nedlastingsfeil)`);
          result.skippedAttachmentDetails.push({
            fileName,
            reason: 'nedlastingsfeil',
            fileSizeMB
          });
          continue;
        }

        if (fileData) {
          const arrayBuffer = await fileData.arrayBuffer();
          const actualSizeBytes = arrayBuffer.byteLength;
          const actualSizeMB = (actualSizeBytes / 1024 / 1024).toFixed(2);

          console.log(`Downloaded attachment ${fileName}: ${actualSizeMB} MB`);

          result.attachments.push({
            filename: fileName,
            content: new Uint8Array(arrayBuffer),
            contentType: fileData.type || 'application/octet-stream',
            encoding: "binary" as const
          });
          result.totalSizeBytes += actualSizeBytes;
          console.log(`Added attachment: ${fileName} (${actualSizeMB} MB)`);
        }
      } catch (downloadErr: any) {
        if (downloadErr.name === 'AbortError') {
          console.error(`Timeout downloading attachment ${fileName}`);
          result.skippedAttachments.push(`${fileName} (timeout)`);
          result.skippedAttachmentDetails.push({
            fileName,
            reason: 'timeout',
            fileSizeMB
          });
        } else {
          console.error(`Failed to download attachment ${doc.fil_url}:`, downloadErr);
          result.skippedAttachments.push(`${fileName} (feil)`);
          result.skippedAttachmentDetails.push({
            fileName,
            reason: 'feil',
            fileSizeMB
          });
        }
      }
    }

    const totalMB = (result.totalSizeBytes / 1024 / 1024).toFixed(2);
    console.log(`Fetched ${result.attachments.length} attachments (${totalMB} MB total) for template ${templateId}`);
    if (result.skippedAttachmentDetails.length > 0) {
      const withLinks = result.skippedAttachmentDetails.filter(s => s.downloadUrl).length;
      console.log(`Skipped ${result.skippedAttachmentDetails.length} attachments (${withLinks} with download links)`);
    }

    return result;
  } catch (error) {
    console.error('Error in getTemplateAttachments:', error);
    return result;
  }
}

/**
 * Gets template ID by company and type
 */
export async function getTemplateId(
  companyId: string,
  templateType: string
): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('email_templates')
    .select('id')
    .eq('company_id', companyId)
    .eq('template_type', templateType)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.id;
}

/**
 * Generates HTML for download links to be appended to email content
 */
export function generateDownloadLinksHtml(skippedDetails: SkippedAttachmentInfo[]): string {
  const withUrls = skippedDetails.filter(s => s.downloadUrl);
  if (withUrls.length === 0) return '';

  const links = withUrls.map(s => 
    `<li><a href="${s.downloadUrl}" style="color:#2563eb;text-decoration:underline;">${s.fileName}</a> (${s.fileSizeMB} MB)</li>`
  ).join('');

  // Avoid template literal line breaks that cause =20 in quoted-printable encoding
  return '<div style="margin-top:24px;padding:16px;background-color:#f3f4f6;border-radius:8px;">' +
    '<p style="margin:0 0 12px 0;font-weight:600;color:#374151;">📎 Vedlegg (last ned):</p>' +
    '<ul style="margin:0;padding-left:20px;color:#4b5563;">' + links + '</ul>' +
    '<p style="margin:12px 0 0 0;font-size:12px;color:#6b7280;">Lenkene er gyldige i 7 dager.</p>' +
    '</div>';
}
