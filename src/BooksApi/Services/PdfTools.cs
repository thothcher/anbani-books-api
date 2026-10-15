using UglyToad.PdfPig;
using UglyToad.PdfPig.Writer;

namespace BooksApi.Services;

/// <summary>
/// Page counting and preview extraction for PDFs that admins upload.
/// Uses PdfPig (Apache-2.0) — note that PDFsharp 6.5+ moved to AGPL with a license key.
/// </summary>
public static class PdfTools
{
    public static bool LooksLikePdf(Stream s)
    {
        Span<byte> head = stackalloc byte[5];
        var read = s.Read(head);
        s.Position = 0;
        return read == 5 && head.SequenceEqual("%PDF-"u8);
    }

    public static int? CountPages(string path)
    {
        try
        {
            using var doc = PdfDocument.Open(path);
            return doc.NumberOfPages;
        }
        catch (Exception)
        {
            return null; // encrypted or damaged PDFs: the upload still works, just without a page count/preview
        }
    }

    /// <summary>Copies the first <paramref name="pages"/> pages into a new file. Returns false if the PDF can't be read.</summary>
    public static bool TryWritePreview(string source, string destination, int pages)
    {
        try
        {
            using var input = PdfDocument.Open(source);
            using var builder = new PdfDocumentBuilder();
            for (var i = 1; i <= Math.Min(pages, input.NumberOfPages); i++) builder.AddPage(input, i);
            File.WriteAllBytes(destination, builder.Build());
            return true;
        }
        catch (Exception)
        {
            if (File.Exists(destination)) File.Delete(destination);
            return false;
        }
    }

    /// <summary>About 10% of the book, at least 3 and at most 15 pages.</summary>
    public static int PreviewLength(int pages) => Math.Clamp((int)Math.Round(pages * 0.1), Math.Min(3, pages), 15);
}
