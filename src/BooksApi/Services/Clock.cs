using BooksApi.Data;

namespace BooksApi.Services;

public interface IClock
{
    DateTime UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}

public static class ClockExtensions
{
    /// <summary>
    /// "Now" as seen by one user. The sandbox time-travel endpoint moves a user's clock forward,
    /// so students can watch a 7-day trial expire without waiting a week.
    /// </summary>
    public static DateTime Now(this IClock clock, User user) => clock.UtcNow.AddDays(user.ClockOffsetDays);
}
