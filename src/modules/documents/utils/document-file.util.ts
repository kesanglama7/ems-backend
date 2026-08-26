export function getDocumentFileExtension(
  mimeType: string,
): string | null {
  switch (mimeType) {
    case 'application/pdf':
      return 'pdf';

    case 'image/jpeg':
      return 'jpg';

    case 'image/png':
      return 'png';

    default:
      return null;
  }
}