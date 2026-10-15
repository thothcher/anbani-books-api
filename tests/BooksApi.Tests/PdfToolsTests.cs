using BooksApi.Services;

namespace BooksApi.Tests;

public class PdfToolsTests
{
    [Fact]
    public void Counts_pages_and_cuts_a_preview_from_a_generated_book()
    {
        var source = Path.Combine(AppContext.BaseDirectory, "SeedData", "books", "metamorphosis.pdf");
        var preview = Path.Combine(Path.GetTempPath(), $"preview-{Guid.NewGuid():N}.pdf");
        try
        {
            var pages = PdfTools.CountPages(source);
            Assert.True(pages > 10);
            Assert.True(PdfTools.TryWritePreview(source, preview, 5));
            Assert.Equal(5, PdfTools.CountPages(preview));
        }
        finally
        {
            File.Delete(preview);
        }
    }

    [Theory]
    [InlineData(2, 2)]
    [InlineData(20, 3)]
    [InlineData(100, 10)]
    [InlineData(900, 15)]
    public void Preview_is_about_ten_percent(int pages, int expected) => Assert.Equal(expected, PdfTools.PreviewLength(pages));
}
